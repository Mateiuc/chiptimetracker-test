import { createWorker } from 'tesseract.js';
import { generateVinCandidates, validateVin, validateVinStrict } from './vinDecoder';

export interface OcrResult {
  vin: string | null;
  rawText: string;
  candidates: Array<{ vin: string; valid: boolean; checksum: boolean }>;
}

interface TesseractParams {
  base64Image: string;
  signal?: AbortSignal;
  debug?: boolean;
}

const VIN_CHARSET = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';

const cleanText = (text: string): string => {
  return text
    .toUpperCase()
    .replace(/[OÖØ]/g, '0')
    .replace(/[IÏÎ]/g, '1')
    .replace(/Q/g, '0')
    .replace(/Ü/g, 'U')
    .replace(/Ä/g, 'A')
    .replace(/[^A-HJ-NPR-Z0-9\s\n]/g, '')
    .trim();
};

const invertBase64Png = async (base64: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
      ctx.putImageData(id, 0, 0);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    img.onerror = reject;
    img.src = `data:image/png;base64,${base64}`;
  });
};

const recogniseImage = async (
  worker: Awaited<ReturnType<typeof createWorker>>,
  base64: string,
): Promise<string> => {
  const { data: { text } } = await worker.recognize(`data:image/png;base64,${base64}`);
  return text;
};

const extractCandidates = (
  text: string,
): Array<{ vin: string; valid: boolean; checksum: boolean }> => {
  const cleaned = cleanText(text);
  const found: Array<{ vin: string; valid: boolean; checksum: boolean }> = [];
  const push = (raw: string) => {
    for (const c of generateVinCandidates(raw)) {
      if (!found.some(x => x.vin === c)) {
        found.push({ vin: c, valid: validateVin(c), checksum: validateVinStrict(c) });
      }
    }
  };
  for (const token of cleaned.split(/[\n\s]+/).filter(t => t.length >= 17)) {
    for (let i = 0; i <= token.length - 17; i++) push(token.slice(i, i + 17));
  }
  const flat = cleaned.replace(/[\s\n]+/g, '');
  for (let i = 0; i <= flat.length - 17; i++) push(flat.slice(i, i + 17));
  return found;
};

export const readVinWithTesseract = async ({
  base64Image,
  signal,
  debug = false,
}: TesseractParams): Promise<string | null | OcrResult> => {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    if (signal?.aborted) throw new Error('Aborted');
    worker = await createWorker('eng', 1, { logger: () => {} });
    await worker.setParameters({
      tessedit_pageseg_mode: '13' as any,
      tessedit_ocr_engine_mode: '2' as any,
      tessedit_char_whitelist: VIN_CHARSET,
    } as any);
    if (signal?.aborted) throw new Error('Aborted');
    const normalText = await recogniseImage(worker, base64Image);
    const normalCandidates = extractCandidates(normalText);
    let invertedText = '';
    let invertedCandidates: typeof normalCandidates = [];
    try {
      const inverted = await invertBase64Png(base64Image);
      invertedText = await recogniseImage(worker, inverted);
      invertedCandidates = extractCandidates(invertedText);
    } catch (e) {
      console.warn('[Tesseract] Invert pass failed:', e);
    }
    const merged = [...normalCandidates];
    for (const c of invertedCandidates) {
      if (!merged.some(x => x.vin === c.vin)) merged.push(c);
    }
    const validVin =
      merged.find(c => c.checksum)?.vin ??
      merged.find(c => c.valid)?.vin ??
      null;
    if (debug) {
      return {
        vin: validVin,
        rawText: `[Normal]\n${normalText}\n[Inverted]\n${invertedText}`,
        candidates: merged,
      };
    }
    return validVin;
  } catch (error) {
    if (error instanceof Error && error.message === 'Aborted') {
      console.log('[Tesseract] Scan aborted');
    } else {
      console.error('[Tesseract] OCR error:', error);
    }
    if (debug) return { vin: null, rawText: '', candidates: [] };
    return null;
  } finally {
    if (worker) await worker.terminate();
  }
};
