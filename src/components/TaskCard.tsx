import { Task, Client, Vehicle, WorkSession, WorkPeriod, SessionPhoto } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronUp, FileText, DollarSign, CheckCircle2, Play, MoreVertical, Edit, Wrench, Pause, Square, Trash, Camera as CameraIcon, Eye } from 'lucide-react';
import { formatDuration, formatCurrency, formatTime, calcPeriodCost } from '@/lib/formatTime';
import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { useNotifications } from '@/hooks/useNotifications';
import { EditTaskDialog } from './EditTaskDialog';
import { getVehicleColorScheme, VehicleColorScheme } from '@/lib/vehicleColors';
import billBackground from '@/assets/bill-background.jpg';
import { stripDiacritics, mergePdfs } from '@/lib/pdfUtils';
import { supabase } from '@/integrations/supabase/client';
import { PORTAL_BASE_URL } from '@/lib/clientPortalUtils';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { photoStorageService } from '@/services/photoStorageService';
import { capacitorStorage } from '@/lib/capacitorStorage';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { ShareBillDialog } from './ShareBillDialog';
import { useNavigate } from 'react-router-dom';
interface TaskCardProps {
  task: Task;
  client: Client | undefined;
  vehicle: Vehicle | undefined;
  settings: {
    defaultHourlyRate: number;
  };
  onMarkBilled: (taskId: string) => void;
  onMarkPaid: (taskId: string) => void;
  onRestartTimer: (taskId: string) => void;
  onPauseTimer?: () => void;
  onStopTimer?: (taskId: string) => void;
  onUpdateTask?: (updatedTask: Task) => Promise<void> | void;
  onUpdateVehicle?: (vehicleId: string, updates: Partial<Vehicle>) => void;
  onDelete?: (taskId: string) => void;
  vehicleColorScheme?: VehicleColorScheme;
}
export const TaskCard = ({
  task,
  client,
  vehicle,
  settings,
  onMarkBilled,
  onMarkPaid,
  onRestartTimer,
  onPauseTimer,
  onStopTimer,
  onUpdateTask,
  onUpdateVehicle,
  onDelete,
  vehicleColorScheme
}: TaskCardProps) => {
  const { toast } = useNotifications();
  const navigate = useNavigate();
  // Get vehicle color scheme (use provided or compute from vehicle ID)
  const colorScheme = vehicleColorScheme || getVehicleColorScheme(vehicle?.id || task.vehicleId);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentElapsed, setCurrentElapsed] = useState(0);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [billShareData, setBillShareData] = useState<{
    pdfUri: string;
    clientName: string;
    vehicleInfo: string;
    totalAmount: string;
    clientPhone?: string;
  } | null>(null);
  const isActive = ['pending', 'in-progress', 'paused'].includes(task.status);
  const isCompleted = ['completed', 'billed', 'paid'].includes(task.status);

  // Live timer for active tasks
  useEffect(() => {
    if (task.status === 'in-progress' && task.startTime) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - task.startTime!.getTime()) / 1000);
        setCurrentElapsed(elapsed);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCurrentElapsed(0);
    }
  }, [task.status, task.startTime]);

  // For active tasks: show current period time only
  // For completed tasks: show total accumulated time
  let displayTime: number;
  if (isActive) {
    // Active tasks: show current period time
    if (task.status === 'in-progress' && task.startTime) {
      // Live current period timer
      displayTime = currentElapsed;
    } else if (task.status === 'paused' && task.activeSessionId) {
      // Show the last period's duration from the active session
      const activeSession = task.sessions.find(s => s.id === task.activeSessionId);
      const lastPeriod = activeSession?.periods?.[activeSession.periods.length - 1];
      displayTime = lastPeriod?.duration || 0;
    } else {
      // Pending tasks
      displayTime = 0;
    }
  } else {
    // Completed tasks: show total accumulated time
    displayTime = task.totalTime;
  }

  // Helper function to format date as dd-mm-yyyy
  const formatDateForFilename = (date: Date | string | number | undefined): string => {
    // Ensure date is a Date object
    let dateObj: Date;
    if (!date) {
      dateObj = new Date();
    } else if (date instanceof Date) {
      dateObj = date;
    } else {
      dateObj = new Date(date);
    }
    
    // Validate the date is valid
    if (isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }
    
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Helper function to sanitize strings for filenames
  const sanitizeForFilename = (str: string | undefined): string => {
    if (!str) return 'Unknown';
    return str.replace(/[^a-zA-Z0-9]/g, '_');
  };

  // Helper function to safely format session date
  const formatSessionDate = (date: Date | string | undefined): string => {
    if (!date) return 'Date Not Available';
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return 'Date Not Available';
    }
    
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // Generate detail PDF (plain format for records)
  const generateDetailPDF = () => {
    const doc = new jsPDF();

    // Add header
    doc.setFontSize(20);
    doc.text('Work Detail', 105, 20, {
      align: 'center'
    });

    // Two-column layout: Client (left) and Vehicle (right)
    let yPos = 40;

    // Left column: Client Information
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Client Information:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Name: ${client?.companyName || client?.name || 'N/A'}`, 20, yPos + 8);
    doc.text(`Phone: ${client?.phone || 'N/A'}`, 20, yPos + 16);

    // Right column: Vehicle Information
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Vehicle Information:', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || ''}`, 110, yPos + 8);
    doc.text(`VIN: ${vehicle?.vin || 'N/A'}`, 110, yPos + 16);

    yPos = 70; // Move to next section

    // Work Sessions
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Work Sessions:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 8;

    (task.sessions || []).forEach((session, sessionIndex) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Session ${sessionIndex + 1}`, 20, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 7;
      
      // Description FIRST
      if (session.description) {
        doc.setFontSize(9);
        const maxWidth = 170;
        const wrappedDesc = doc.splitTextToSize(`Description: ${session.description}`, maxWidth - 5);
        wrappedDesc.forEach((line: string) => {
          doc.text(line, 25, yPos);
          yPos += 6;
        });
      }
      
      // Periods with full date/time info (sorted by startTime)
      const sortedPeriods = [...(session.periods || [])].sort((a, b) => 
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      
      sortedPeriods.forEach((period, periodIndex) => {
        const startDate = new Date(period.startTime);
        const endDate = new Date(period.endTime);
        
        const dateStr = startDate.toLocaleDateString('en-US');
        const startTimeStr = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const endTimeStr = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const durationStr = formatDuration(period.duration);
        
        doc.setFontSize(9);
        doc.text(`Period ${periodIndex + 1}: ${dateStr} ${startTimeStr} - ${endTimeStr} (${durationStr})`, 25, yPos);
        yPos += 6;
      });
      
      yPos += 3;
    });

    // Parts Section
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Parts:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 8;

    let hasParts = false;
    (task.sessions || []).forEach((session) => {
      if (session.parts && session.parts.length > 0) {
        hasParts = true;
        session.parts.forEach(part => {
          doc.setFontSize(10);
          doc.text(`${part.quantity}x ${part.name} - ${formatCurrency(part.price * part.quantity)}`, 25, yPos);
          yPos += 6;
          
          if (part.description) {
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            const maxWidth = 170;
            const wrappedText = doc.splitTextToSize(`  ${part.description}`, maxWidth - 30);
            wrappedText.forEach((line: string) => {
              doc.text(line, 30, yPos);
              yPos += 5;
            });
            doc.setTextColor(0, 0, 0);
          }
        });
      }
    });

    if (!hasParts) {
      doc.setFontSize(10);
      doc.text('No parts used', 25, yPos);
      yPos += 6;
    }

    yPos += 5;

    // Cost Breakdown (at the end)
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Cost Breakdown:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    yPos += 8;
    doc.text(`Labor (${formatDuration(task.totalTime)} @ ${formatCurrency(hourlyRate)}/hr): ${formatCurrency(baseLabor)}`, 20, yPos);
    yPos += 7;
    if (totalMinHourAdj > 0) {
      doc.text(`Min 1 Hour adjustment (x${minHourCount}): ${formatCurrency(totalMinHourAdj)}`, 20, yPos);
      yPos += 7;
    }
    if (totalCloning > 0) {
      doc.text(`Cloning (x${cloningCount}): ${formatCurrency(totalCloning)}`, 20, yPos);
      yPos += 7;
    }
    if (totalProgramming > 0) {
      doc.text(`Programming (x${programmingCount}): ${formatCurrency(totalProgramming)}`, 20, yPos);
      yPos += 7;
    }
    doc.text(`Parts: ${formatCurrency(partsCost)}`, 20, yPos);
    yPos += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${formatCurrency(totalCost)}`, 20, yPos);

    // Save PDF
    const fileName = `detail_${vehicle?.vin}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    toast({
      title: "Detail Generated",
      description: `PDF saved as ${fileName}`
    });
  };

  // Generate billing PDF (branded format for invoicing)
  const generateBillingPDF = async () => {
    try {
      const doc = new jsPDF({
        format: 'letter'
      });

      // Add background image
      doc.addImage(billBackground, 'JPEG', 0, 0, 215.9, 279.4);

      // Bill Information
      doc.setFontSize(17);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(128, 0, 128); // Purple color matching the background
      doc.text(`Bill to:`, 20, 48.5);
      
      // Billed on date (right side)
      const billedDate = new Date().toLocaleDateString('en-US');
      doc.text(`Billed on ${billedDate}`, 195.9, 58.5, { align: 'right' });
      
      // Client name (back to black)
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      let clientLine = client?.companyName || client?.name || 'N/A';
      if (client?.companyName) {
        const addrParts = [client.address, client.city, client.state, client.zip].filter(Boolean);
        if (addrParts.length > 0) {
          clientLine = `${client.companyName} - ${addrParts.join(', ')}`;
        }
      }
      doc.text(stripDiacritics(clientLine), 20, 53);
      
      // Vehicle info
      const vehicleInfo = [vehicle?.year, vehicle?.make, vehicle?.model]
        .filter(Boolean)
        .join(' ');
      const vinInfo = vehicle?.vin ? `(VIN: ${vehicle.vin})` : '';
      const fullVehicleInfo = vehicleInfo ? `${vehicleInfo} ${vinInfo}` : 'Vehicle Info Not Available';
      doc.text(stripDiacritics(fullVehicleInfo), 20, 58.5);

      // Table Section
      const tableTop = 66;
      const col1X = 20;
      const col2X = 130;
      const col3X = 190.9;
      const tableWidth = 175.9;

      // Table headers
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('DESCRIPTION', 25, tableTop + 6);
      doc.text('TIME', col2X - 1, tableTop + 6);
      doc.text('AMOUNT', 190.9, tableTop + 6, { align: 'right' });

      // Red line under headers
      doc.setLineWidth(0.3);
      doc.setDrawColor(255, 0, 0);
      doc.line(20, tableTop + 8, 195.9, tableTop + 8);

      // Helper function to format duration as hh:mm
      const formatDurationHHMM = (seconds: number): string => {
        const totalMinutes = Math.round(seconds / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      };

      // Collect all parts from sessions
      const parts = (task.sessions || []).reduce((acc, session) => {
        return acc.concat(session.parts || []);
      }, [] as typeof task.sessions[0]['parts']);

      // Table rows - Labor (per session)
      let yPos = tableTop + 16;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');

      (task.sessions || []).forEach((session) => {
        // Calculate total duration for this session
        const sessionDuration = (session.periods || []).reduce((total, period) => {
          return total + period.duration;
        }, 0);
        
        // Calculate cost for this session
        const sessionCost = task.importedSalary != null ? task.importedSalary : (sessionDuration / 3600) * hourlyRate;
        
        // Get description or use default
        const description = stripDiacritics(session.description || 'Work session');
        
        // Render row with text wrapping
        const col1Width = col2X - col1X - 4;
        const wrappedDescription = doc.splitTextToSize(description, col1Width);
        const startYPos = yPos;
        wrappedDescription.forEach((line: string, index: number) => {
          doc.text(line, col1X + 2, yPos);
          if (index < wrappedDescription.length - 1) {
            yPos += 6;
          }
        });
        doc.text(formatDurationHHMM(sessionDuration), col2X + 2, startYPos);
        doc.text(formatCurrency(sessionCost), col3X + 2, startYPos, { align: 'right' });
        
        yPos += 8;
      });

      // Billing option line items
      if (totalMinHourAdj > 0) {
        doc.text(`Min 1 Hour adjustment (x${minHourCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalMinHourAdj), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }
      if (totalCloning > 0) {
        doc.text(`Cloning (x${cloningCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalCloning), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }
      if (totalProgramming > 0) {
        doc.text(`Programming (x${programmingCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalProgramming), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }
      if (totalAddKey > 0) {
        doc.text(`Add Key (x${addKeyCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalAddKey), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }
      if (totalAllKeysLost > 0) {
        doc.text(`All Keys Lost (x${allKeysLostCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalAllKeysLost), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }

      // Table rows - Parts
      if (parts.length > 0) {
        doc.setFontSize(11);
        parts.forEach((part) => {
          const partNameYPos = yPos;
          doc.setFont('helvetica', 'normal');
          doc.text(stripDiacritics(part.name), col1X + 2, partNameYPos);
          
          // Add description if exists
          if (part.description) {
            yPos += 6;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            const col1Width = col2X - col1X - 6;
            const wrappedPartDesc = doc.splitTextToSize(stripDiacritics(part.description), col1Width);
            wrappedPartDesc.forEach((line: string, index: number) => {
              doc.text(line, col1X + 4, yPos);
              if (index < wrappedPartDesc.length - 1) {
                yPos += 5;
              }
            });
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            yPos += 2;
          }
          
          // Quantity and price on the same line as part name
          doc.text(`${part.quantity}`, col2X + 2, partNameYPos);
          doc.text(formatCurrency(part.price * part.quantity), col3X + 2, partNameYPos, { align: 'right' });
          
          yPos += 8;
        });
      }


      // Total Section
      yPos = 261;
      const deposit = vehicle?.prepaidAmount || 0;
      if (deposit > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const totalX = col3X - 45;
        doc.text('Subtotal:', totalX, yPos);
        doc.text(formatCurrency(totalCost), col3X + 2, yPos, { align: 'right' });
        yPos += 7;
        doc.setFontSize(11);
        doc.setTextColor(220, 38, 38);
        doc.text('Deposit:', totalX, yPos);
        doc.text(`-${formatCurrency(deposit)}`, col3X + 2, yPos, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        yPos += 8;
        doc.setFontSize(16);
        doc.text('TOTAL:', totalX, yPos);
        doc.text(formatCurrency(Math.max(0, totalCost - deposit)), col3X + 2, yPos, { align: 'right' });
      } else {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        const totalX = col3X - 45;
        doc.text('TOTAL:', totalX, yPos);
        doc.text(formatCurrency(totalCost), col3X + 2, yPos, { align: 'right' });
      }

      // Add timestamp at the very bottom center
      const formatTimestamp = (date: Date): string => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
      };

      const pageHeight = 279.4; // Letter height in mm
      const bottomMargin = 2;
      const timestampY = pageHeight - bottomMargin;
      const pageCenter = 107.95; // 215.9mm / 2 = center of Letter page

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const timestamp = formatTimestamp(new Date());
      doc.text(`Generated: ${timestamp}`, pageCenter, timestampY, { align: 'center' });

      // Collect all photos from all sessions for the photos page
      const allPhotos: Array<{ photo: SessionPhoto; sessionNum: number }> = [];
      task.sessions.forEach((session, idx) => {
        (session.photos || []).forEach(photo => {
          allPhotos.push({ photo, sessionNum: idx + 1 });
        });
      });

      // If there are photos, load them from filesystem and add a new page
      if (allPhotos.length > 0) {
        // Load all photos from filesystem
        const filePaths = allPhotos
          .map(item => item.photo.filePath)
          .filter((fp): fp is string => !!fp);
        
        const photoDataMap = await photoStorageService.loadMultiplePhotos(filePaths);
        
        doc.addPage();
        
        let photoYPos = 20;
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(128, 0, 128);
        doc.text('Work Photos', 105, photoYPos, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        photoYPos += 15;
        
        const colWidth = 85;
        const colHeight = 64;
        const colX = [15, 110];
        let colIdx = 0;

        for (const item of allPhotos) {
          // Check if we need a new page
          if (colIdx === 0 && photoYPos > 200) {
            doc.addPage();
            photoYPos = 20;
          }

          const x = colX[colIdx];

          // Session label
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(`Session ${item.sessionNum}`, x, photoYPos);

          let photoBase64 = item.photo.filePath 
            ? photoDataMap.get(item.photo.filePath)
            : item.photo.base64;

          // Fallback to cloudUrl if local photo is missing
          if (!photoBase64 && item.photo.cloudUrl) {
            try {
              const response = await fetch(item.photo.cloudUrl);
              const blob = await response.blob();
              photoBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const result = reader.result as string;
                  resolve(result.split(',')[1]); // strip data:...;base64, prefix
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            } catch (fetchError) {
              console.warn('Failed to fetch photo from cloud:', fetchError);
            }
          }

          if (photoBase64) {
            try {
              const imgData = `data:image/jpeg;base64,${photoBase64}`;
              doc.addImage(imgData, 'JPEG', x, photoYPos + 2, colWidth, colHeight);
            } catch (imgError) {
              doc.setFontSize(9);
              doc.setFont('helvetica', 'italic');
              doc.text('(Image could not be loaded)', x, photoYPos + 15);
            }
          } else {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.text('(Image could not be loaded)', x, photoYPos + 15);
          }

          colIdx++;
          if (colIdx >= 2) {
            colIdx = 0;
            photoYPos += colHeight + 12;
          }
        }
        // If last row had only one photo, advance Y
        if (colIdx !== 0) {
          photoYPos += colHeight + 12;
        }
      }

      // Generate filename and return PDF data for sharing
      const clientNameSafe = sanitizeForFilename(client?.name);
      const carBrand = sanitizeForFilename(vehicle?.make);
      const workStartDate = formatDateForFilename(task.createdAt);
      const fileName = `bill_${clientNameSafe}_${carBrand}_${workStartDate}.pdf`;
      
      // Get vehicle info for share message
      const vehicleInfoStr = [vehicle?.year, vehicle?.make, vehicle?.model]
        .filter(Boolean)
        .join(' ') || 'your vehicle';
      
      // Merge diagnostic PDF if available (task-level)
      if (task.diagnosticPdfUrl) {
        try {
          const billBlob = doc.output('blob');
          const mergedBlob = await mergePdfs(billBlob, task.diagnosticPdfUrl);
          const reader = new FileReader();
          const mergedBase64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(mergedBlob);
          });
          const billDeposit = vehicle?.prepaidAmount || 0;
          return {
            pdfBase64: mergedBase64,
            fileName,
            totalCost: billDeposit > 0 ? Math.max(0, totalCost - billDeposit) : totalCost,
            vehicleInfo: vehicleInfoStr,
            clientName: client?.name || 'Customer',
            clientPhone: client?.phone,
          };
        } catch (mergeError) {
          console.warn('Failed to merge diagnostic PDF:', mergeError);
        }
      }

      // Return PDF data instead of saving directly
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const shareDeposit = vehicle?.prepaidAmount || 0;
      return {
        pdfBase64,
        fileName,
        totalCost: shareDeposit > 0 ? Math.max(0, totalCost - shareDeposit) : totalCost,
        vehicleInfo: vehicleInfoStr,
        clientName: client?.name || 'Customer',
        clientPhone: client?.phone,
      };
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: "Bill Generation Failed",
        description: "There was an error creating the PDF. Please try again.",
        variant: "destructive"
      });
      return null;
    }
  };

  // Generate preview PDF (same as billing but with different filename)
  const generatePreviewPDF = async () => {
    try {
      // Add loading toast
      toast({
        title: "Generating Preview",
        description: "Creating PDF preview..."
      });
      
      // Validate required data
      if (!task.sessions || task.sessions.length === 0) {
        toast({
          title: "No Work Sessions",
          description: "This task has no work sessions to preview.",
          variant: "destructive"
        });
        return;
      }
      
      const doc = new jsPDF({
        format: 'letter'
      });

      // Add background image
      doc.addImage(billBackground, 'JPEG', 0, 0, 215.9, 279.4);

      doc.setFontSize(17);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(128, 0, 128);
      doc.text(`Bill to:`, 20, 48.5);
      
      const billedDate = new Date().toLocaleDateString('en-US');
      doc.text(`Billed on ${billedDate}`, 195.9, 58.5, { align: 'right' });
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      let clientLine2 = client?.companyName || client?.name || 'N/A';
      if (client?.companyName) {
        const addrParts2 = [client.address, client.city, client.state, client.zip].filter(Boolean);
        if (addrParts2.length > 0) {
          clientLine2 = `${client.companyName} - ${addrParts2.join(', ')}`;
        }
      }
      doc.text(clientLine2, 20, 53);
      
      const vehicleInfo = [vehicle?.year, vehicle?.make, vehicle?.model]
        .filter(Boolean)
        .join(' ');
      const vinInfo = vehicle?.vin ? `(VIN: ${vehicle.vin})` : '';
      const fullVehicleInfo = vehicleInfo ? `${vehicleInfo} ${vinInfo}` : 'Vehicle Info Not Available';
      doc.text(fullVehicleInfo, 20, 58.5);

      const tableTop = 66;
      const col1X = 20;
      const col2X = 130;
      const col3X = 190.9;

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('DESCRIPTION', 25, tableTop + 6);
      doc.text('TIME', col2X - 1, tableTop + 6);
      doc.text('AMOUNT', 190.9, tableTop + 6, { align: 'right' });

      doc.setLineWidth(0.3);
      doc.setDrawColor(255, 0, 0);
      doc.line(20, tableTop + 8, 195.9, tableTop + 8);

      const formatDurationHHMM = (seconds: number): string => {
        const totalMinutes = Math.round(seconds / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      };

      const parts = (task.sessions || []).reduce((acc, session) => {
        return acc.concat(session.parts || []);
      }, [] as typeof task.sessions[0]['parts']);

      let yPos = tableTop + 16;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');

      (task.sessions || []).forEach((session) => {
        const sessionDuration = (session.periods || []).reduce((total, period) => {
          return total + period.duration;
        }, 0);
        
        const sessionCost = task.importedSalary != null ? task.importedSalary : (sessionDuration / 3600) * hourlyRate;
        const description = session.description || 'Work session';
        
        const col1Width = col2X - col1X - 4;
        const wrappedDescription = doc.splitTextToSize(description, col1Width);
        const startYPos = yPos;
        wrappedDescription.forEach((line: string, index: number) => {
          doc.text(line, col1X + 2, yPos);
          if (index < wrappedDescription.length - 1) {
            yPos += 6;
          }
        });
        doc.text(formatDurationHHMM(sessionDuration), col2X + 2, startYPos);
        doc.text(formatCurrency(sessionCost), col3X + 2, startYPos, { align: 'right' });
        
        yPos += 8;
      });

      // Billing option line items
      if (totalMinHourAdj > 0) {
        doc.text(`Min 1 Hour adjustment (x${minHourCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalMinHourAdj), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }
      if (totalCloning > 0) {
        doc.text(`Cloning (x${cloningCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalCloning), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }
      if (totalProgramming > 0) {
        doc.text(`Programming (x${programmingCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalProgramming), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }
      if (totalAddKey > 0) {
        doc.text(`Add Key (x${addKeyCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalAddKey), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }
      if (totalAllKeysLost > 0) {
        doc.text(`All Keys Lost (x${allKeysLostCount})`, col1X + 2, yPos);
        doc.text(formatCurrency(totalAllKeysLost), col3X + 2, yPos, { align: 'right' });
        yPos += 8;
      }

      if (parts.length > 0) {
        doc.setFontSize(11);
        parts.forEach((part) => {
          const partNameYPos = yPos;
          doc.setFont('helvetica', 'normal');
          doc.text(part.name, col1X + 2, partNameYPos);
          
          if (part.description) {
            yPos += 6;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            const col1Width = col2X - col1X - 6;
            const wrappedPartDesc = doc.splitTextToSize(part.description, col1Width);
            wrappedPartDesc.forEach((line: string, index: number) => {
              doc.text(line, col1X + 4, yPos);
              if (index < wrappedPartDesc.length - 1) {
                yPos += 5;
              }
            });
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            yPos += 2;
          }
          
          doc.text(`${part.quantity}`, col2X + 2, partNameYPos);
          doc.text(formatCurrency(part.price * part.quantity), col3X + 2, partNameYPos, { align: 'right' });
          
          yPos += 8;
        });
      }

      yPos = 261;
      const previewDeposit = vehicle?.prepaidAmount || 0;
      if (previewDeposit > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const totalX = col3X - 45;
        doc.text('Subtotal:', totalX, yPos);
        doc.text(formatCurrency(totalCost), col3X + 2, yPos, { align: 'right' });
        yPos += 7;
        doc.setFontSize(11);
        doc.setTextColor(220, 38, 38);
        doc.text('Deposit:', totalX, yPos);
        doc.text(`-${formatCurrency(previewDeposit)}`, col3X + 2, yPos, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        yPos += 8;
        doc.setFontSize(16);
        doc.text('TOTAL:', totalX, yPos);
        doc.text(formatCurrency(Math.max(0, totalCost - previewDeposit)), col3X + 2, yPos, { align: 'right' });
      } else {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        const totalX = col3X - 45;
        doc.text('TOTAL:', totalX, yPos);
        doc.text(formatCurrency(totalCost), col3X + 2, yPos, { align: 'right' });
      }

      const formatTimestamp = (date: Date): string => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
      };

      const pageHeight = 279.4;
      const bottomMargin = 2;
      const timestampY = pageHeight - bottomMargin;
      const pageCenter = 107.95;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const timestamp = formatTimestamp(new Date());
      doc.text(`Generated: ${timestamp}`, pageCenter, timestampY, { align: 'center' });

      // Collect all photos from all sessions for the photos page
      const allPhotos: Array<{ photo: SessionPhoto; sessionNum: number }> = [];
      task.sessions.forEach((session, idx) => {
        (session.photos || []).forEach(photo => {
          allPhotos.push({ photo, sessionNum: idx + 1 });
        });
      });

      // If there are photos, load them from filesystem and add a new page
      if (allPhotos.length > 0) {
        // Load all photos from filesystem
        const filePaths = allPhotos
          .map(item => item.photo.filePath)
          .filter((fp): fp is string => !!fp);
        
        const photoDataMap = await photoStorageService.loadMultiplePhotos(filePaths);
        
        doc.addPage();
        
        let photoYPos = 20;
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(128, 0, 128);
        doc.text('Work Photos', 105, photoYPos, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        photoYPos += 15;
        
        const colWidth2 = 85;
        const colHeight2 = 64;
        const colX2 = [15, 110];
        let colIdx2 = 0;

        for (const item of allPhotos) {
          if (colIdx2 === 0 && photoYPos > 200) {
            doc.addPage();
            photoYPos = 20;
          }

          const x = colX2[colIdx2];

          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(`Session ${item.sessionNum}`, x, photoYPos);

          const photoBase64 = item.photo.filePath 
            ? photoDataMap.get(item.photo.filePath)
            : item.photo.base64;

          if (photoBase64) {
            try {
              const imgData = `data:image/jpeg;base64,${photoBase64}`;
              doc.addImage(imgData, 'JPEG', x, photoYPos + 2, colWidth2, colHeight2);
            } catch (imgError) {
              doc.setFontSize(9);
              doc.setFont('helvetica', 'italic');
              doc.text('(Image could not be loaded)', x, photoYPos + 15);
            }
          } else {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.text('(Image could not be loaded)', x, photoYPos + 15);
          }

          colIdx2++;
          if (colIdx2 >= 2) {
            colIdx2 = 0;
            photoYPos += colHeight2 + 12;
          }
        }
        if (colIdx2 !== 0) {
          photoYPos += colHeight2 + 12;
        }
      }

      // Merge diagnostic PDF if available (task-level)
      if (task.diagnosticPdfUrl) {
        try {
          const billBlob = doc.output('blob');
          const mergedBlob = await mergePdfs(billBlob, task.diagnosticPdfUrl);
          const url = URL.createObjectURL(mergedBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `preview_${sanitizeForFilename(client?.name)}_${sanitizeForFilename(vehicle?.make)}_${formatDateForFilename(task.createdAt)}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          toast({ title: 'Preview Generated', description: 'Includes diagnostic report' });
          return;
        } catch (mergeError) {
          console.warn('Failed to merge diagnostic PDF in preview:', mergeError);
        }
      }

      // Save PDF with preview filename
      const clientName = sanitizeForFilename(client?.name);
      const carBrand = sanitizeForFilename(vehicle?.make);
      const workStartDate = formatDateForFilename(task.createdAt);
      const fileName = `preview_${clientName}_${carBrand}_${workStartDate}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Preview Generated",
        description: `Preview saved as ${fileName}`
      });
    } catch (error) {
      console.error('Preview PDF generation error:', error);
      toast({
        title: "Preview Generation Failed",
        description: error instanceof Error ? error.message : "There was an error creating the preview. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleGenerateBill = async () => {
    const result = await generateBillingPDF();
    if (!result) return;

    const { pdfBase64, fileName, totalCost: total, vehicleInfo: vInfo, clientName: cName, clientPhone: cPhone } = result;

    // Mark as billed first
    onMarkBilled(task.id);

    // Check if we're on a native platform
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      try {
        // Save PDF to cache for sharing
        await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache,
        });

        const fileUri = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Cache,
        });

        // Show share dialog
        setBillShareData({
          pdfUri: fileUri.uri,
          clientName: cName,
          vehicleInfo: vInfo,
          totalAmount: formatCurrency((vehicle?.prepaidAmount || 0) > 0 ? Math.max(0, total - (vehicle?.prepaidAmount || 0)) : total),
          clientPhone: cPhone,
        });
        setShowShareDialog(true);
      } catch (error) {
        console.error('Error preparing bill for sharing:', error);
        // Fall back to just downloading
        const doc = new jsPDF();
        // Can't recover easily, just show error
        toast({
          title: "Share Failed",
          description: "Bill was marked as billed but sharing failed. Please try the Share option from the menu.",
          variant: "destructive"
        });
      }
    } else {
      // Web: just download the PDF
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = fileName;
      link.click();
      
      toast({
        title: "Bill Generated",
        description: `Invoice saved as ${fileName}`
      });

      // Still show share dialog for copy message option
      setBillShareData({
        pdfUri: '',
        clientName: cName,
        vehicleInfo: vInfo,
        totalAmount: formatCurrency((vehicle?.prepaidAmount || 0) > 0 ? Math.max(0, total - (vehicle?.prepaidAmount || 0)) : total),
        clientPhone: cPhone,
      });
      setShowShareDialog(true);
    }
  };

  const handleShareBill = async (message: string) => {
    if (!billShareData) return;

    const isNative = Capacitor.isNativePlatform();

    try {
      if (isNative && billShareData.pdfUri) {
        await Share.share({
          title: 'Bill',
          text: message,
          url: billShareData.pdfUri,
          dialogTitle: 'Share Bill',
        });
      } else {
        // Web fallback: just copy the message
        await navigator.clipboard.writeText(message);
        toast({
          title: 'Message Copied',
          description: 'Paste it in your messaging app along with the downloaded PDF.',
        });
      }
    } catch (error) {
      console.error('Share failed:', error);
      toast({
        title: 'Share Failed',
        description: 'Could not share the bill. Please try again.',
        variant: 'destructive',
      });
    }

    setShowShareDialog(false);
    setBillShareData(null);
  };

  // Handle capturing photo for active session
  const handleCapturePhoto = async () => {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
      });

      if (photo.base64String) {
        // Fetch fresh task data from storage to avoid stale state issues
        const currentTasks = await capacitorStorage.getTasks();
        const freshTask = currentTasks.find(t => t.id === task.id);
        
        if (!freshTask) return;

        const photoId = crypto.randomUUID();

        // Save photo to filesystem and get the file path
        const filePath = await photoStorageService.savePhoto(
          photo.base64String,
          task.id,
          photoId
        );

        let targetSessionId: string;
        let sessions: WorkSession[];

        const hasSessions = freshTask.sessions && freshTask.sessions.length > 0;

        if (!hasSessions) {
          // No sessions at all — auto-create an "info" session with a 1-min period
          const now = new Date();
          const periodId = crypto.randomUUID();
          const newSessionId = crypto.randomUUID();
          const autoPeriod: WorkPeriod = {
            id: periodId,
            startTime: new Date(now.getTime() - 60_000),
            endTime: now,
            duration: 60,
          };
          const autoSession: WorkSession = {
            id: newSessionId,
            createdAt: now,
            description: 'info',
            periods: [autoPeriod],
            parts: [],
            photos: [],
          };
          targetSessionId = newSessionId;
          sessions = [autoSession];
        } else {
          // Use active session or fall back to most recent session
          targetSessionId = freshTask.activeSessionId || freshTask.sessions[freshTask.sessions.length - 1].id;
          sessions = freshTask.sessions;
        }

        const sessionIndex = sessions.findIndex(s => s.id === targetSessionId);

        const newPhoto: SessionPhoto = {
          id: photoId,
          filePath,
          capturedAt: new Date(),
          sessionNumber: sessionIndex + 1,
        };

        const updatedTask = {
          ...freshTask,
          sessions: sessions.map(session =>
            session.id === targetSessionId
              ? { ...session, photos: [...(session.photos || []), newPhoto] }
              : session
          ),
        };

        await onUpdateTask?.(updatedTask);
        toast({
          title: 'Photo Captured',
          description: `Photo added to Session ${sessionIndex + 1}`,
        });

        // Background cloud upload (fire-and-forget)
        photoStorageService.uploadPhotoToCloud(photo.base64String!, task.id, photoId)
          .then(cloudUrl => {
            const taskWithCloudUrl = {
              ...updatedTask,
              sessions: updatedTask.sessions.map(session =>
                session.id === targetSessionId
                  ? { ...session, photos: session.photos?.map(p =>
                      p.id === photoId ? { ...p, cloudUrl } : p
                    )}
                  : session
              ),
            };
            onUpdateTask?.(taskWithCloudUrl);
          })
          .catch(err => console.warn('[TaskCard] Cloud upload failed:', err));
      }
    } catch (error) {
      // User cancelled or camera error
      if ((error as Error).message?.includes('cancelled')) {
        return; // User cancelled, no error message needed
      }
      console.error('[TaskCard] Camera error:', error);
      toast({
        title: 'Camera Error',
        description: 'Could not capture photo. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle uploading diagnostic PDF for this task
  const handleUploadDiagnosticPdf = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        toast({ title: 'Uploading...', description: 'Uploading diagnostic PDF' });
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const { data, error } = await supabase.functions.invoke('upload-diagnostic', {
          body: { base64, taskId: task.id, fileName: file.name },
        });

        if (error) throw error;
        if (onUpdateTask) {
          onUpdateTask({ ...task, diagnosticPdfUrl: data.url });
        }
        toast({ title: 'Uploaded', description: 'Diagnostic PDF attached to this task' });
      } catch (err) {
        console.error('Upload diagnostic error:', err);
        toast({ title: 'Upload Failed', description: 'Could not upload diagnostic PDF', variant: 'destructive' });
      }
    };
    input.click();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in-progress':
        return 'bg-primary text-primary-foreground';
      case 'paused':
        return 'bg-warning text-warning-foreground';
      case 'completed':
        return 'bg-success text-success-foreground';
      case 'billed':
        return 'bg-accent text-accent-foreground';
      case 'paid':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };
  const hourlyRate = client?.hourlyRate || settings.defaultHourlyRate;
  const cloningRate = client?.cloningRate || (settings as any).defaultCloningRate || 0;
  const programmingRate = client?.programmingRate || (settings as any).defaultProgrammingRate || 0;
  const addKeyRate = client?.addKeyRate || (settings as any).defaultAddKeyRate || 0;
  const allKeysLostRate = client?.allKeysLostRate || (settings as any).defaultAllKeysLostRate || 0;
  const hourlyRate = client?.hourlyRate || settings.defaultHourlyRate;
  const cloningRate = client?.cloningRate || (settings as any).defaultCloningRate || 0;
  const programmingRate = client?.programmingRate || (settings as any).defaultProgrammingRate || 0;
  const addKeyRate = client?.addKeyRate || (settings as any).defaultAddKeyRate || 0;
  const allKeysLostRate = client?.allKeysLostRate || (settings as any).defaultAllKeysLostRate || 0;
  let baseLabor = 0, totalMinHourAdj = 0, totalCloning = 0, totalProgramming = 0, totalAddKey = 0, totalAllKeysLost = 0;
  let minHourCount = 0, cloningCount = 0, programmingCount = 0, addKeyCount = 0, allKeysLostCount = 0;
  (task.sessions || []).forEach(session => {
    session.periods.forEach(period => {
      if (period.chargeMinimumHour && period.duration < 3600) {
        baseLabor += Math.ceil(hourlyRate);
        minHourCount++;
      } else {
        baseLabor += calcPeriodCost(period.duration, hourlyRate);
      }
    });
    const sessionDur = session.periods.reduce((sum, p) => sum + p.duration, 0);
    const hasPeriodFlags = session.periods.some(p => p.chargeMinimumHour);
    if (!hasPeriodFlags && session.chargeMinimumHour && sessionDur < 3600) {
      totalMinHourAdj += Math.ceil(((3600 - sessionDur) / 3600) * hourlyRate);
      minHourCount++;
    }
    if (session.isCloning && cloningRate > 0) { totalCloning += cloningRate; cloningCount++; }
    if (session.isProgramming && programmingRate > 0) { totalProgramming += programmingRate; programmingCount++; }
    if (session.isAddKey && addKeyRate > 0) { totalAddKey += addKeyRate; addKeyCount++; }
    if (session.isAllKeysLost && allKeysLostRate > 0) { totalAllKeysLost += allKeysLostRate; allKeysLostCount++; }
  });
  const calculatedLabor = baseLabor + totalMinHourAdj + totalCloning + totalProgramming + totalAddKey + totalAllKeysLost;
  // importedSalary = final revenue already, no parts added
  const partsCost = task.importedSalary != null ? 0 : (task.sessions || []).reduce((total, session) => {
    return total + (session.parts || []).reduce((sum, part) => sum + (part.providedByClient ? 0 : part.price * part.quantity), 0);
  }, 0);
  const laborCost = task.importedSalary != null ? task.importedSalary : calculatedLabor;
  // billedAmount locks the cost at billing time; otherwise calculate with round-up
  const totalCost = task.billedAmount != null ? task.billedAmount : Math.ceil(laborCost + partsCost);
  return <Card className={`overflow-hidden transition-all hover:shadow-md ${colorScheme.card} border ${colorScheme.border}`}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="p-3 py-0">
          {/* Status bar at top of card */}
          <div className={`-mx-3 px-3 py-1 mb-2 flex items-center justify-between text-xs font-medium ${
            task.status === 'in-progress' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' :
            task.status === 'paused' ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300' :
            task.status === 'pending' ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300' :
            task.status === 'completed' ? 'bg-green-500/10 text-green-700 dark:text-green-300' :
            task.status === 'billed' ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300' :
            task.status === 'paid' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' :
            'bg-muted/50 text-muted-foreground'
          }`}>
            <div className="flex items-center gap-1.5">
              {task.status === 'in-progress' && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}
              <span className="capitalize">{task.status.replace('-', ' ')}</span>

            </div>
            {task.status === 'in-progress' && task.startTime && (
              <span className="font-mono font-bold">{formatDuration(displayTime)}</span>
            )}
          </div>

          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {vehicle?.year} {vehicle?.make} {vehicle?.model}
              </p>
              {vehicle?.vin && <p className="text-xs text-muted-foreground mt-1 cursor-pointer hover:text-foreground transition-colors font-mono" onClick={() => { navigator.clipboard.writeText(vehicle.vin); toast({ title: 'VIN Copied!', description: vehicle.vin }); }} title="Click to copy VIN">VIN: {vehicle.vin}</p>}
              {task.diagnosticPdfUrl && (
                <Badge variant="outline" className="text-xs mt-1 text-emerald-600 border-emerald-500/40">
                  <FileText className="h-3 w-3 mr-1" />Diagnostic PDF
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover z-50">
                  <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCapturePhoto}>
                      <CameraIcon className="h-4 w-4 mr-2" />
                      Capture Photo
                    </DropdownMenuItem>
                  {task.status === 'completed' && <>
                      <DropdownMenuItem onClick={generatePreviewPDF}>
                        <FileText className="h-4 w-4 mr-2" />
                        Preview Bill
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleGenerateBill}>
                        <FileText className="h-4 w-4 mr-2" />
                        Generate Bill & Mark Billed
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onRestartTimer(task.id)}>
                        <Play className="h-4 w-4 mr-2" />
                        Resume Work
                      </DropdownMenuItem>
                    </>}
                {task.status === 'billed' && <>
                    <DropdownMenuItem onClick={generateBillingPDF}>
                      <FileText className="h-4 w-4 mr-2" />
                      Bill
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onMarkPaid(task.id)}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Paid
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive"
                    >
                      <Trash className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </>}
                  {task.status === 'paid' && (
                      <DropdownMenuItem 
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive"
                      >
                        <Trash className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  {(task.status === 'billed' || task.status === 'paid') && <DropdownMenuItem onClick={generateDetailPDF}>
                      <FileText className="h-4 w-4 mr-2" />
                      Print detail
                    </DropdownMenuItem>}
                  {isCompleted && client && (
                    <DropdownMenuItem onClick={() => {
                      if (client.portalId) {
                        window.open(`${PORTAL_BASE_URL}/client-view?id=${client.portalId}&preview=1`, '_blank');
                      }
                    }} disabled={!client.portalId}>
                      <Eye className="h-4 w-4 mr-2" />
                      Client Portal
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleUploadDiagnosticPdf}>
                    <FileText className="h-4 w-4 mr-2" />
                    {task.diagnosticPdfUrl ? 'Replace Diagnostic PDF' : 'Upload Diagnostic PDF'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2 text-sm">
            <div className="text-center">
              <div className="text-muted-foreground text-xs font-medium mb-1">{isActive ? 'Period' : 'Total'}</div>
              <div className={`font-bold text-sm ${task.status === 'in-progress' ? 'text-blue-600 dark:text-blue-400' : ''}`}>{formatDuration(displayTime)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground text-xs font-medium mb-1">Sessions</div>
              <div className="font-bold text-sm">{(task.sessions || []).length}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground text-xs font-medium mb-1">{(vehicle?.prepaidAmount || 0) > 0 ? 'Due' : 'Cost'}</div>
              <div className="font-bold text-sm text-primary">{formatCurrency((vehicle?.prepaidAmount || 0) > 0 ? Math.max(0, totalCost - (vehicle?.prepaidAmount || 0)) : totalCost)}</div>
            </div>
          </div>

          <div className="flex gap-2 w-full mt-2">
            <CollapsibleTrigger asChild>
              {isCompleted && <Button variant="outline" size="sm" className="gap-1 h-9 px-3 flex-1">
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span className="text-xs">Details</span>
                </Button>}
            </CollapsibleTrigger>

            {/* Active Tab Buttons */}
            {isActive && <>
                {task.status === 'pending' && <Button variant="default" size="sm" onClick={() => onRestartTimer(task.id)} className="gap-1 h-9 px-3">
                    <Play className="h-3.5 w-3.5" />
                    <span className="text-xs">Start</span>
                  </Button>}

                {task.status === 'in-progress' && <>
                    {onPauseTimer && <Button variant="secondary" size="sm" onClick={onPauseTimer} className="gap-1 h-9 px-3">
                        <Pause className="h-3.5 w-3.5" />
                        <span className="text-xs">Pause</span>
                      </Button>}
                    {onStopTimer && <Button variant="default" size="sm" onClick={() => onStopTimer(task.id)} className="gap-1 h-9 px-3">
                        <Square className="h-3.5 w-3.5" />
                        <span className="text-xs">Stop</span>
                      </Button>}
                  </>}

                {task.status === 'paused' && <>
                    <Button variant="default" size="sm" onClick={() => onRestartTimer(task.id)} className="gap-1 h-9 px-3">
                      <Play className="h-3.5 w-3.5" />
                      <span className="text-xs">Resume</span>
                    </Button>
                    {onStopTimer && <Button variant="secondary" size="sm" onClick={() => onStopTimer(task.id)} className="gap-1 h-9 px-3">
                        <Square className="h-3.5 w-3.5" />
                        <span className="text-xs">Stop</span>
                      </Button>}
                  </>}
              </>}

            {/* Completed Tab Buttons */}
            {isCompleted && <>
                {task.status === 'completed' && task.needsFollowUp && <Button variant="default" size="sm" onClick={() => onRestartTimer(task.id)} className="gap-1 h-9 px-3 flex-1">
                    <Play className="h-3.5 w-3.5" />
                    <span className="text-xs">Restart</span>
                  </Button>}
              </>}
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-1 border-t pt-3 text-sm">
            {/* Unified Sessions View */}
            <div>
              <h4 className="font-bold text-sm mb-1">Work Sessions ({(task.sessions || []).length})</h4>
              {(task.sessions || []).map((session, sessionIndex) => {
              const sessionDuration = (session.periods || []).reduce((sum, p) => sum + p.duration, 0);
              
              // Build timeline events
              const allEvents: Array<{
                time: Date;
                type: 'started' | 'paused' | 'resumed' | 'completed';
              }> = [];
              (session.periods || []).forEach((period, idx) => {
                if (idx === 0) {
                  allEvents.push({ time: period.startTime, type: 'started' });
                } else {
                  allEvents.push({ time: period.startTime, type: 'resumed' });
                }
                if (idx < (session.periods || []).length - 1) {
                  allEvents.push({ time: period.endTime, type: 'paused' });
                } else {
                  allEvents.push({ time: period.endTime, type: 'completed' });
                }
              });
              
              return <div key={session.id} className={`${colorScheme.session} border rounded-lg p-2 mb-1`}>
                    <div className="text-xs font-semibold mb-1">
                      Session {sessionIndex + 1} ({formatDuration(sessionDuration)})
                    </div>
                    {(session.chargeMinimumHour || session.isCloning || session.isProgramming || session.isAddKey || session.isAllKeysLost) && (
                      <div className="flex gap-1 mb-1 flex-wrap">
                        {session.chargeMinimumHour && <Badge variant="outline" className="text-[9px] px-1.5 py-0">🚩 Min 1hr</Badge>}
                        {session.isCloning && <Badge variant="outline" className="text-[9px] px-1.5 py-0">📋 Cloning</Badge>}
                        {session.isProgramming && <Badge variant="outline" className="text-[9px] px-1.5 py-0">💻 Programming</Badge>}
                        {session.isAddKey && <Badge variant="outline" className="text-[9px] px-1.5 py-0">🔑 Add Key</Badge>}
                        {session.isAllKeysLost && <Badge variant="outline" className="text-[9px] px-1.5 py-0">🔐 All Keys Lost</Badge>}
                      </div>
                    )}
                    
                    {/* Timeline events */}
                    <div className="ml-2 mb-1 space-y-0.5">
                      {allEvents.map((event, idx) => (
                        <div key={idx} className="text-xs font-medium">
                          <span className={
                            event.type === 'started' ? 'text-green-600 dark:text-green-400' : 
                            event.type === 'resumed' ? 'text-blue-600 dark:text-blue-400' : 
                            event.type === 'paused' ? 'text-orange-600 dark:text-orange-400' : 
                            'text-red-600 dark:text-red-400'
                          }>●</span>
                          {' '}
                          <span>
                            {event.type === 'started' ? 'Started' : 
                             event.type === 'resumed' ? 'Resumed' : 
                             event.type === 'paused' ? 'Paused' : 
                             'Stopped'}
                          </span>
                          {': '}
                          {formatTime(event.time)}
                        </div>
                      ))}
                    </div>
                    
                    {session.description && <div className="text-xs text-muted-foreground mb-1">{session.description}</div>}
                    
                    {session.parts && session.parts.length > 0 && <div className="space-y-0.5">
                        <div className="font-semibold text-xs">Parts Used:</div>
                        {session.parts.map((part, i) => <div key={i} className="flex justify-between text-xs text-muted-foreground ml-2">
                            <span>{part.quantity}x {part.name}</span>
                            <span>{formatCurrency(part.price * part.quantity)}</span>
                          </div>)}
                       </div>}
                    
                    {session.photos && session.photos.length > 0 && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <CameraIcon className="h-3 w-3" />
                        {session.photos.length} photo{session.photos.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>;
            })}
            </div>
            {/* Cost Summary */}
            <div className="mt-2 pt-2 border-t space-y-0.5 text-xs">
              <div className="flex justify-between"><span>Base Labor:</span><span>{formatCurrency(baseLabor)}</span></div>
              {totalMinHourAdj > 0 && <div className="flex justify-between"><span>Min 1 Hour (×{minHourCount}):</span><span>{formatCurrency(totalMinHourAdj)}</span></div>}
              {totalCloning > 0 && <div className="flex justify-between"><span>Cloning (×{cloningCount}):</span><span>{formatCurrency(totalCloning)}</span></div>}
              {totalProgramming > 0 && <div className="flex justify-between"><span>Programming (×{programmingCount}):</span><span>{formatCurrency(totalProgramming)}</span></div>}
              {totalAddKey > 0 && <div className="flex justify-between"><span>Add Key (×{addKeyCount}):</span><span>{formatCurrency(totalAddKey)}</span></div>}
              {totalAllKeysLost > 0 && <div className="flex justify-between"><span>All Keys Lost (×{allKeysLostCount}):</span><span>{formatCurrency(totalAllKeysLost)}</span></div>}
              <div className="flex justify-between"><span>Parts:</span><span>{formatCurrency(partsCost)}</span></div>
              <div className="flex justify-between font-bold"><span>Total:</span><span>{formatCurrency(totalCost)}</span></div>
              {(vehicle?.prepaidAmount || 0) > 0 && (
                <>
                  <div className="flex justify-between text-destructive"><span>Deposit:</span><span>-{formatCurrency(vehicle?.prepaidAmount || 0)}</span></div>
                  <div className="flex justify-between font-bold text-orange-600"><span>Balance Due:</span><span>{formatCurrency(Math.max(0, totalCost - (vehicle?.prepaidAmount || 0)))}</span></div>
                </>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      
      <EditTaskDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} task={task} onSave={updatedTask => onUpdateTask?.(updatedTask)} onDelete={onDelete} />
      
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="w-[90vw] max-w-sm p-4 rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete Task</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Are you sure you want to delete this task? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="m-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete?.(task.id);
                setShowDeleteDialog(false);
              }}
              className="m-0 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareBillDialog
        open={showShareDialog}
        onClose={() => {
          setShowShareDialog(false);
          setBillShareData(null);
        }}
        clientName={billShareData?.clientName || ''}
        clientPhone={billShareData?.clientPhone}
        vehicleInfo={billShareData?.vehicleInfo || ''}
        totalAmount={billShareData?.totalAmount || ''}
        onShare={handleShareBill}
      />
    </Card>;
};