import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X, Bug, Copy, Flashlight, Sun, ZoomIn, ZoomOut } from 'lucide-react';
import { validateVinStrict } from '@/lib/vinDecoder';
import { readVinWithGemini, type OcrResult as GeminiOcrResult } from '@/lib/geminiVinOcr';
import { readVinWithGrok, type OcrResult as GrokOcrResult } from '@/lib/grokVinOcr';
import { readVinWithOcrSpace, type OcrResult as OcrSpaceOcrResult } from '@/lib/ocrSpaceVinOcr';
import { readVinWithTesseract, type OcrResult as TesseractOcrResult } from '@/lib/tesseractVinOcr';
import { useNotifications } from '@/hooks/useNotifications';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

type OcrResult = GeminiOcrResult | GrokOcrResult | OcrSpaceOcrResult | TesseractOcrResult;

interface VinScannerProps {
  onVinDetected: (vin: string) => void;
  onClose: () => void;
  googleApiKey?: string;
  grokApiKey?: string;
  ocrSpaceApiKey?: string;
  ocrProvider?: 'gemini' | 'grok' | 'ocrspace' | 'tesseract';
}

const VinScanner: React.FC<VinScannerProps> = ({ 
  onVinDetected, 
  onClose, 
  googleApiKey, 
  grokApiKey,
  ocrSpaceApiKey, 
  ocrProvider = 'gemini' 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const scanningRef = useRef(false);
  const [isScanning, setIsScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isFrameReady, setIsFrameReady] = useState(false);
  const [frameDimensions, setFrameDimensions] = useState({ 
    widthPercent: 90, 
    heightPx: 40 
  });
  const [scanColor, setScanColor] = useState(0);
  const { toast } = useNotifications();
  
  // Camera control state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const warnedNoKeyRef = useRef(false);
  
  // Debug state
  const [debugMode, setDebugMode] = useState(false);
  const [lastFrameDataUrl, setLastFrameDataUrl] = useState<string>('');
  const [lastOcrResult, setLastOcrResult] = useState<OcrResult | null>(null);
  const [captureMode, setCaptureMode] = useState<'auto' | 'manual'>('auto');

  // Color palette for scanning animation
  const scanningColors = [
    'border-blue-500',
    'border-purple-500',
    'border-pink-500',
    'border-rose-500',
    'border-orange-500',
    'border-yellow-500',
    'border-green-500',
    'border-emerald-500',
    'border-teal-500',
    'border-cyan-500'
  ];

  useEffect(() => {
    // Lock orientation to portrait on native platforms
    const lockOrientation = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await ScreenOrientation.lock({ orientation: 'portrait' });
        } catch (error) {
          console.warn('Failed to lock orientation:', error);
        }
      }
    };
    
    lockOrientation();
    startCamera();
    
    return () => {
      scanningRef.current = false;
      
      // Turn off torch before stopping camera
      if (stream && torchOn) {
        const track = stream.getVideoTracks()[0];
        track?.applyConstraints({ advanced: [{ torch: false } as any] }).catch(() => {});
      }
      
      stopCamera();
      
      // Unlock orientation when scanner closes
      if (Capacitor.isNativePlatform()) {
        ScreenOrientation.unlock().catch(console.warn);
      }
    };
  }, []);

  // Helper function to calculate VIN-optimized frame dimensions
  // 1:7 aspect ratio: gives vertical padding above/below VIN text for easier alignment
  const calculateFrameDimensions = (videoWidth: number) => {
    const ASPECT_RATIO = 1 / 7;
    const widthPercent = 90;
    
    const guideWidth = videoWidth * (widthPercent / 100);
    const guideHeight = guideWidth * ASPECT_RATIO;

    return {
      widthPercent,
      heightPx: Math.round(guideHeight)
    };
  };

  // Set frame dimensions from displayed container size, not native resolution
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video) return;

    const updateDimensions = () => {
      const displayedWidth = container?.clientWidth || video.clientWidth;
      if (displayedWidth > 0) {
        const dimensions = calculateFrameDimensions(displayedWidth);
        setFrameDimensions(dimensions);
        setIsFrameReady(true);
      }
    };

    video.addEventListener('loadedmetadata', updateDimensions);
    
    // If metadata already loaded, calculate immediately
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      updateDimensions();
    }

    return () => video.removeEventListener('loadedmetadata', updateDimensions);
  }, [stream]);

  // Resize observer to adapt guide box on orientation/viewport changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0) {
        setFrameDimensions(calculateFrameDimensions(container.clientWidth));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Color cycling effect during scanning
  useEffect(() => {
    if (!isScanning) return;
    
    const colorInterval = setInterval(() => {
      setScanColor(prev => (prev + 1) % scanningColors.length);
    }, 600);
    
    return () => clearInterval(colorInterval);
  }, [isScanning]);

  // Auto-start continuous OCR scan when frame is ready
  useEffect(() => {
    const hasApiKey = ocrProvider === 'tesseract' ||
                     (ocrProvider === 'grok' && grokApiKey) || 
                     (ocrProvider === 'gemini' && googleApiKey) ||
                     (ocrProvider === 'ocrspace' && ocrSpaceApiKey);
    if (hasApiKey && isFrameReady && stream && !scanningRef.current) {
      startContinuousOcrScan();
    } else if (!hasApiKey && isFrameReady && stream && !warnedNoKeyRef.current) {
      warnedNoKeyRef.current = true;
      toast({
        title: 'OCR provider not configured',
        description: `Set an API key for ${ocrProvider.toUpperCase()} in Settings to enable VIN scanning.`,
        variant: 'destructive'
      });
    }
  }, [googleApiKey, grokApiKey, ocrSpaceApiKey, ocrProvider, isFrameReady, stream]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
      
      // Check camera capabilities for zoom and torch
      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        // Try getCapabilities first
        if (typeof track.getCapabilities === 'function') {
          const capabilities = track.getCapabilities() as any;
          
          // Check zoom support
          if (capabilities.zoom) {
            setZoomCapabilities({
              min: capabilities.zoom.min || 1,
              max: capabilities.zoom.max || 1,
              step: capabilities.zoom.step || 0.1
            });
            setZoomLevel(capabilities.zoom.min || 1);
          }
          
          // Check torch support via capabilities
          if (capabilities.torch) {
            setTorchSupported(true);
          }
        }
        
        // Fallback: Try to detect torch by attempting to apply constraint
        // Some devices support torch but don't report it in getCapabilities
        if (!torchSupported) {
          try {
            // Try applying torch constraint - if it doesn't throw, it's supported
            await track.applyConstraints({ advanced: [{ torch: false } as any] });
            setTorchSupported(true);
            console.log('Torch supported (detected via constraint test)');
          } catch (e) {
            // Torch not supported
            console.log('Torch not supported on this device');
          }
        }
      }
    } catch (error) {
      console.error('Camera access error:', error);
    }
  };
  
  const handleZoomChange = async (newZoom: number) => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    
    try {
      await track.applyConstraints({ advanced: [{ zoom: newZoom } as any] });
      setZoomLevel(newZoom);
    } catch (error) {
      console.warn('Zoom failed:', error);
    }
  };
  
  const toggleTorch = async () => {
    if (!stream || !torchSupported) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(!torchOn);
    } catch (error) {
      console.warn('Torch failed:', error);
    }
  };

  // Upload OCR frame to cloud for analysis (both success and failure)
  const uploadScanFrame = async (base64: string, provider: string, result: OcrResult, success: boolean, detectedVin?: string) => {
    try {
      // Resolve current user's primary workspace so uploads are scoped under {workspaceId}/...
      // Storage RLS requires the path to start with a workspace the user belongs to.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }
      const { data: workspaceId, error: wsError } = await supabase.rpc('user_primary_workspace', {
        _user_id: user.id,
      });
      if (wsError || !workspaceId) {
        console.warn('[VIN Upload] Skipping diagnostic upload — no workspace for user');
        return;
      }

      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const timestamp = Date.now();
      const baseName = `${workspaceId}/${timestamp}_${provider}_${success ? 'success' : 'fail'}`;
      
      // Upload JPEG frame
      const { error } = await supabase.storage
        .from('vin-scan-failures')
        .upload(`${baseName}.jpg`, bytes, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      
      if (error) {
        console.warn('[VIN Upload] Failed to upload image:', error.message);
        return;
      }

      // Upload JSON metadata sidecar
      const metadata = {
        provider,
        success,
        vin: detectedVin || null,
        rawText: result.rawText || '',
        candidates: result.candidates || [],
        timestamp,
      };
      const metaBytes = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
      await supabase.storage
        .from('vin-scan-failures')
        .upload(`${baseName}.json`, metaBytes, {
          contentType: 'application/json',
          upsert: false,
        });

      console.log(`[VIN Upload] Saved ${success ? 'success' : 'failed'} frame:`, `${baseName}.jpg`, {
        provider,
        vin: detectedVin,
        rawText: result.rawText?.substring(0, 100),
        candidateCount: result.candidates?.length || 0,
      });
    } catch (e) {
      console.warn('[VIN Upload] Error:', e);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  // Capture single frame for manual mode
  const captureSingleFrame = async (provider?: 'gemini' | 'grok' | 'ocrspace' | 'tesseract') => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || !containerRef.current || !guideRef.current) return;

    const providerToUse = provider || ocrProvider;
    const apiKey = providerToUse === 'grok' ? grokApiKey : 
                   providerToUse === 'ocrspace' ? ocrSpaceApiKey : 
                   providerToUse === 'tesseract' ? undefined : googleApiKey;

    // Tesseract doesn't need an API key
    if (providerToUse !== 'tesseract' && !apiKey) {
      toast({
        title: 'API key missing',
        description: `Configure ${providerToUse.toUpperCase()} API key in Settings.`,
        variant: 'destructive'
      });
      return;
    }

    // Get DOM rectangles
    const containerRect = containerRef.current.getBoundingClientRect();
    const guideRect = guideRef.current.getBoundingClientRect();
    const cw = containerRect.width;
    const ch = containerRect.height;
    const vsw = video.videoWidth;
    const vsh = video.videoHeight;
    const scale = Math.max(cw / vsw, ch / vsh);
    const dw = vsw * scale;
    const dh = vsh * scale;
    const dx = Math.max(0, (dw - cw) / 2);
    const dy = Math.max(0, (dh - ch) / 2);
    const ox = guideRect.left - containerRect.left;
    const oy = guideRect.top - containerRect.top;
    const ow = guideRect.width;
    const oh = guideRect.height;
    let sx = (ox + dx) / scale;
    let sy = (oy + dy) / scale;
    let sw = ow / scale;
    let sh = oh / scale;
    sx = Math.max(0, Math.min(sx, vsw));
    sy = Math.max(0, Math.min(sy, vsh));
    sw = Math.min(sw, vsw - sx);
    sh = Math.min(sh, vsh - sy);
    sx = Math.round(sx);
    sy = Math.round(sy);
    sw = Math.round(sw);
    sh = Math.round(sh);

    // Capture frame
    canvas.width = sw;
    canvas.height = sh;
    context.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    
    // Upscale 2x if crop is too small for reliable OCR
    if (sh < 120) {
      const upCanvas = document.createElement('canvas');
      upCanvas.width = sw * 2;
      upCanvas.height = sh * 2;
      const upCtx = upCanvas.getContext('2d')!;
      upCtx.imageSmoothingEnabled = false;
      upCtx.drawImage(canvas, 0, 0, sw * 2, sh * 2);
      canvas.width = sw * 2;
      canvas.height = sh * 2;
      context.drawImage(upCanvas, 0, 0);
      sw = sw * 2;
      sh = sh * 2;
    }

    // Percentile-based contrast stretch — preserves anti-aliasing for LSTM engine
    {
      const imageData = context.getImageData(0, 0, sw, sh);
      const data = imageData.data;
      const grays = new Uint8Array(data.length / 4);
      for (let i = 0; i < data.length; i += 4) {
        grays[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      // Find 5th and 95th percentile for contrast stretch
      const sorted = Array.from(grays).sort((a, b) => a - b);
      const lo = sorted[Math.floor(sorted.length * 0.05)];
      const hi = sorted[Math.floor(sorted.length * 0.95)];
      const range = Math.max(hi - lo, 1);
      for (let i = 0; i < data.length; i += 4) {
        const stretched = Math.min(255, Math.max(0, ((grays[i / 4] - lo) / range) * 255));
        data[i] = data[i + 1] = data[i + 2] = stretched;
      }
      context.putImageData(imageData, 0, 0);
    }
    
    // PNG for OCR (lossless), JPEG for upload (smaller)
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    
    setLastFrameDataUrl(dataUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      let result: string | null | OcrResult = null;
      if (providerToUse === 'tesseract') {
        result = await readVinWithTesseract({ base64Image: base64, signal: controller.signal, debug: true });
      } else if (providerToUse === 'grok') {
        result = await readVinWithGrok({ base64Image: base64, apiKey: apiKey!, signal: controller.signal, debug: true });
      } else if (providerToUse === 'ocrspace') {
        result = await readVinWithOcrSpace({ base64Image: base64, apiKey: apiKey!, signal: controller.signal, debug: true });
      } else {
        result = await readVinWithGemini({ base64Image: base64, apiKey: apiKey!, signal: controller.signal, debug: true });
      }

      if (result && typeof result === 'object') {
        setLastOcrResult(result);
        
        if (result.vin) {
          toast({
            title: 'VIN detected',
            description: result.vin,
          });
          uploadScanFrame(base64, providerToUse, result, true, result.vin).catch(() => {});
          onVinDetected(result.vin);
          stopCamera();
        } else {
          // Upload failed frame to cloud for improvement
          uploadScanFrame(base64, providerToUse, result, false).catch(() => {});
          
          const failedChecksum = result.candidates.find(c => c.valid && !c.checksum);
          if (failedChecksum) {
            toast({
              title: 'Possible VIN found but checksum failed',
              description: 'Photo saved for improvement. Adjust framing and try again.',
              variant: 'destructive'
            });
          } else {
            toast({
              title: 'No valid VIN detected',
              description: 'Photo saved for improvement. Try adjusting the frame or lighting.',
            });
          }
        }
      }
    } catch (error) {
      console.error('OCR error:', error);
      toast({
        title: 'OCR failed',
        description: 'Please try again.',
        variant: 'destructive'
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const startContinuousOcrScan = async () => {
    const hasApiKey = ocrProvider === 'tesseract' ||
                     (ocrProvider === 'grok' && grokApiKey) || 
                     (ocrProvider === 'gemini' && googleApiKey) ||
                     (ocrProvider === 'ocrspace' && ocrSpaceApiKey);
    if (!videoRef.current || !canvasRef.current || !hasApiKey) return;

    setIsScanning(true);
    scanningRef.current = true;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    let attempts = 0;

    if (!context) {
      setIsScanning(false);
      return;
    }

    // Continuous scan loop
    while (scanningRef.current) {
      try {
        if (!containerRef.current || !guideRef.current) continue;
        attempts++;

        // Get DOM rectangles
        const containerRect = containerRef.current.getBoundingClientRect();
        const guideRect = guideRef.current.getBoundingClientRect();
        
        // Container dimensions
        const cw = containerRect.width;
        const ch = containerRect.height;
        
        // Video source dimensions
        const vsw = video.videoWidth;
        const vsh = video.videoHeight;
        
        // Calculate object-cover scale and offsets
        const scale = Math.max(cw / vsw, ch / vsh);
        const dw = vsw * scale; // displayed width
        const dh = vsh * scale; // displayed height
        const dx = Math.max(0, (dw - cw) / 2); // horizontal overflow
        const dy = Math.max(0, (dh - ch) / 2); // vertical overflow
        
        // Guide rectangle position relative to container
        const ox = guideRect.left - containerRect.left;
        const oy = guideRect.top - containerRect.top;
        const ow = guideRect.width;
        const oh = guideRect.height;
        
        // Map back to video source coordinates
        let sx = (ox + dx) / scale;
        let sy = (oy + dy) / scale;
        let sw = ow / scale;
        let sh = oh / scale;
        
        // Clamp to valid bounds
        sx = Math.max(0, Math.min(sx, vsw));
        sy = Math.max(0, Math.min(sy, vsh));
        sw = Math.min(sw, vsw - sx);
        sh = Math.min(sh, vsh - sy);
        
        // Round to integers
        sx = Math.round(sx);
        sy = Math.round(sy);
        sw = Math.round(sw);
        sh = Math.round(sh);

        console.log('[VIN Scan] attempt', attempts, 'provider', ocrProvider, {
          video: { w: vsw, h: vsh },
          display: { w: cw, h: ch, scale, dx, dy },
          crop: { sx, sy, sw, sh }
        });

        // Capture current frame (cropped to exact guide rectangle)
        canvas.width = sw;
        canvas.height = sh;
        context.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        // Upscale 2x if crop is too small
        if (sh < 120) {
          const upCanvas = document.createElement('canvas');
          upCanvas.width = sw * 2;
          upCanvas.height = sh * 2;
          const upCtx = upCanvas.getContext('2d')!;
          upCtx.imageSmoothingEnabled = false;
          upCtx.drawImage(canvas, 0, 0, sw * 2, sh * 2);
          canvas.width = sw * 2;
          canvas.height = sh * 2;
          context.drawImage(upCanvas, 0, 0);
          sw = sw * 2;
          sh = sh * 2;
        }

        // Percentile-based contrast stretch — preserves anti-aliasing for LSTM
        const imgData = context.getImageData(0, 0, sw, sh);
        const px = imgData.data;
        const grays = new Uint8Array(px.length / 4);
        for (let i = 0; i < px.length; i += 4) {
          grays[i / 4] = Math.round(0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2]);
        }
        const sorted = Array.from(grays).sort((a, b) => a - b);
        const lo = sorted[Math.floor(sorted.length * 0.05)];
        const hi = sorted[Math.floor(sorted.length * 0.95)];
        const range = Math.max(hi - lo, 1);
        for (let i = 0; i < px.length; i += 4) {
          const stretched = Math.min(255, Math.max(0, ((grays[i / 4] - lo) / range) * 255));
          px[i] = px[i+1] = px[i+2] = stretched;
        }
        context.putImageData(imgData, 0, 0);

        // PNG for Tesseract (lossless), JPEG for other providers
        const isPng = ocrProvider === 'tesseract';
        const dataUrl = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.95);
        const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');

        // Call selected OCR provider with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        let vin: string | null = null;
        try {
          if (ocrProvider === 'tesseract') {
            vin = await readVinWithTesseract({ base64Image: base64, signal: controller.signal, debug: false }) as string | null;
          } else if (ocrProvider === 'grok' && grokApiKey) {
            vin = await readVinWithGrok({ base64Image: base64, apiKey: grokApiKey, signal: controller.signal, debug: false }) as string | null;
          } else if (ocrProvider === 'ocrspace' && ocrSpaceApiKey) {
            vin = await readVinWithOcrSpace({ base64Image: base64, apiKey: ocrSpaceApiKey, signal: controller.signal, debug: false }) as string | null;
          } else if (googleApiKey) {
            vin = await readVinWithGemini({ base64Image: base64, apiKey: googleApiKey, signal: controller.signal, debug: false }) as string | null;
          }
        } finally {
          clearTimeout(timeoutId);
        }

        // If valid VIN found with strict validation, stop scanning
        if (vin && validateVinStrict(vin)) {
          console.log('[VIN Scan] Valid VIN detected:', vin);
          onVinDetected(vin);
          stopCamera();
          scanningRef.current = false;
          setIsScanning(false);
          return;
        }

        // Periodic guidance toast
        if (attempts % 5 === 0) {
          toast({
            title: 'Still scanning…',
            description: 'No VIN detected yet. Tip: fill the frame, avoid glare, and align the VIN horizontally.',
          });
        }

        // Wait 1 second before next capture
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error('OCR error:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setIsScanning(false);
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="w-full h-full m-0 p-0 rounded-none flex flex-col">
        
        {/* Emerald header */}
        <header className="border-b bg-emerald-500/20 border-emerald-500/30 backdrop-blur-sm shadow-sm">
          <div className="px-4 py-3">
            <DialogTitle className="text-base font-bold text-emerald-700 dark:text-emerald-300">Scan VIN</DialogTitle>
          </div>
        </header>

        {/* Camera + Debug scrollable area */}
        <div className="flex-1 overflow-y-auto bg-black">
          <div ref={containerRef} className="relative w-full aspect-[4/3] flex-shrink-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

      {isFrameReady && (
        <>
          {/* Gradient blur overlay - focuses attention on VIN frame */}
          <div 
            className="absolute inset-0 pointer-events-none transition-all duration-300"
            style={{
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              maskImage: `radial-gradient(ellipse ${frameDimensions.widthPercent}% ${frameDimensions.heightPx + 25}px at center, transparent 0%, transparent 10%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,1) 100%)`,
              WebkitMaskImage: `radial-gradient(ellipse ${frameDimensions.widthPercent}% ${frameDimensions.heightPx + 25}px at center, transparent 0%, transparent 10%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,1) 100%)`
            }}
          />

          {/* Visual guide frame */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div 
              ref={guideRef}
              className={`border-2 rounded-lg transition-colors duration-300 ${
                isScanning ? scanningColors[scanColor] : 'border-primary/60'
              }`}
              style={{
                width: `${frameDimensions.widthPercent}%`,
                height: `${frameDimensions.heightPx}px`
              }}
            />
          </div>
        </>

      )}

        {/* Camera Controls: Zoom + Torch */}
        {isFrameReady && (
          <div className="absolute bottom-14 left-0 right-0 flex items-center justify-center gap-3 px-4">
            {/* Flashlight Button */}
            {torchSupported && (
              <Button
                variant={torchOn ? "default" : "outline"}
                size="icon"
                onClick={toggleTorch}
                className={`h-10 w-10 rounded-full ${torchOn ? 'bg-yellow-500 hover:bg-yellow-600 border-yellow-600' : 'bg-background/70 backdrop-blur'}`}
              >
                {torchOn ? <Sun className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
              </Button>
            )}
            
            {/* Zoom Slider */}
            {zoomCapabilities && zoomCapabilities.max > zoomCapabilities.min && (
              <div className="flex items-center gap-2 bg-background/70 backdrop-blur px-3 py-2 rounded-full">
                <ZoomOut className="h-4 w-4 text-muted-foreground" />
                <input
                  type="range"
                  min={zoomCapabilities.min}
                  max={zoomCapabilities.max}
                  step={zoomCapabilities.step}
                  value={zoomLevel}
                  onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                  className="w-24 h-2 accent-primary"
                />
                <ZoomIn className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground w-8">{zoomLevel.toFixed(1)}x</span>
              </div>
            )}
          </div>
        )}

        </div>

        {/* Debug panel below camera */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-background/95 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Debug Panel</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setDebugMode(!debugMode)}
                className="h-7 w-7"
              >
                <Bug className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant={captureMode === 'auto' ? 'default' : 'outline'}
                onClick={() => {
                  setCaptureMode('auto');
                  if (!scanningRef.current) startContinuousOcrScan();
                }}
              >
                Auto
              </Button>
              <Button
                size="sm"
                variant={captureMode === 'manual' ? 'default' : 'outline'}
                onClick={() => {
                  setCaptureMode('manual');
                  scanningRef.current = false;
                  setIsScanning(false);
                }}
              >
                Manual
              </Button>
            </div>
          </div>

          {captureMode === 'manual' && (
            <div className="space-y-2">
              <Button
                size="sm"
                onClick={() => captureSingleFrame()}
                className="w-full"
              >
                Capture with {ocrProvider.toUpperCase()}
              </Button>
              <div className="flex gap-2">
                {ocrProvider !== 'gemini' && googleApiKey && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => captureSingleFrame('gemini')}
                    className="flex-1"
                  >
                    Retry: Gemini
                  </Button>
                )}
                {ocrProvider !== 'grok' && grokApiKey && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => captureSingleFrame('grok')}
                    className="flex-1"
                  >
                    Retry: Grok
                  </Button>
                )}
                {ocrProvider !== 'ocrspace' && ocrSpaceApiKey && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => captureSingleFrame('ocrspace')}
                    className="flex-1"
                  >
                    Retry: OCR.space
                  </Button>
                )}
              </div>
            </div>
          )}

          {lastFrameDataUrl && (
            <div>
              <p className="font-medium mb-1">Last Captured Frame:</p>
              <img src={lastFrameDataUrl} alt="Last frame" className="w-full border rounded" />
            </div>
          )}

          {lastOcrResult && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium">Raw OCR Text:</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(lastOcrResult.rawText);
                      toast({ title: 'Copied to clipboard' });
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <pre className="bg-muted p-2 rounded overflow-x-auto">{lastOcrResult.rawText}</pre>
              </div>

              <div>
                <p className="font-medium mb-1">VIN Candidates:</p>
                {lastOcrResult.candidates.length === 0 ? (
                  <p className="text-muted-foreground">No 17-char candidates found</p>
                ) : (
                  <div className="space-y-1">
                    {lastOcrResult.candidates.map((c, i) => (
                      <div key={i} className="flex items-center justify-between bg-muted p-2 rounded">
                        <div className="flex items-center gap-2">
                          <code className="font-mono">{c.vin}</code>
                          <span className={c.checksum ? 'text-green-600' : 'text-red-600'}>
                            {c.checksum ? '✓ Valid' : c.valid ? '✗ Checksum failed' : '✗ Invalid format'}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(c.vin);
                            toast({ title: 'Copied to clipboard' });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {lastOcrResult.vin && (
                <div className="p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded">
                  <p className="font-medium text-green-900 dark:text-green-100">
                    ✓ Accepted VIN: {lastOcrResult.vin}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VinScanner;
