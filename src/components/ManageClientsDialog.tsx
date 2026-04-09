import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Client, Vehicle, Task, Settings } from '@/types';
import { useNotifications } from '@/hooks/useNotifications';
import { ChevronLeft, Mail, Phone, DollarSign, Edit, Trash2, Save, X, Car, Printer, Play, KeyRound, Link2, Eye, ArrowRightLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import jsPDF from 'jspdf';
import { EditVehicleDialog } from './EditVehicleDialog';
import { getVehicleColorScheme } from '@/lib/vehicleColors';
import { generateAccessCode, calculateClientCosts, encodeClientData, generatePortalHtmlFile, syncPortalToCloud, PORTAL_BASE_URL } from '@/lib/clientPortalUtils';

interface ManageClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  vehicles: Vehicle[];
  tasks: Task[];
  settings: Settings;
  onUpdateClient: (id: string, updates: Partial<Client>) => void;
  onDeleteClient: (id: string) => void;
  onUpdateVehicle: (id: string, updates: Partial<Vehicle>) => void;
  onDeleteVehicle: (id: string) => void;
  onStartWork: (vehicleId: string) => void;
  onMoveVehicle?: (vehicleId: string, newClientId: string) => void;
}

export const ManageClientsDialog = ({
  open,
  onOpenChange,
  clients,
  vehicles,
  tasks,
  settings,
  onUpdateClient,
  onDeleteClient,
  onUpdateVehicle,
  onDeleteVehicle,
  onStartWork,
  onMoveVehicle,
}: ManageClientsDialogProps) => {
  const { toast } = useNotifications();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Client>>({});
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showEditVehicleDialog, setShowEditVehicleDialog] = useState(false);
  const [deleteClientDialog, setDeleteClientDialog] = useState<{ open: boolean; clientId: string | null }>({ open: false, clientId: null });
  const [deleteVehicleDialog, setDeleteVehicleDialog] = useState<{ open: boolean; vehicleId: string | null }>({ open: false, vehicleId: null });
  const [moveVehicleDialog, setMoveVehicleDialog] = useState<{ open: boolean; vehicleId: string | null; currentClientId: string | null }>({ open: false, vehicleId: null, currentClientId: null });
  const [moveTargetClientId, setMoveTargetClientId] = useState<string>('');

  // Filter clients - guard against non-string phone/email (legacy data fix)
  const filteredClients = clients.filter(client => {
    const query = searchQuery.toLowerCase();
    const nameMatch = client.name.toLowerCase().includes(query);
    const emailMatch = typeof client.email === 'string' && client.email.toLowerCase().includes(query);
    const phoneMatch = typeof client.phone === 'string' && client.phone.toLowerCase().includes(query);
    return nameMatch || emailMatch || phoneMatch;
  });

  // Check if Start button should be shown for a vehicle
  const shouldShowStartButton = (vehicleId: string) => {
    const vehicleTasks = tasks.filter(t => t.vehicleId === vehicleId);
    
    // Show if no tasks exist
    if (vehicleTasks.length === 0) return true;
    
    // Show if all tasks are paid
    const allTasksPaid = vehicleTasks.every(t => t.status === 'paid');
    return allTasksPaid;
  };

  // Get client statistics
  const getClientStats = (clientId: string) => {
    const clientTasks = tasks.filter(t => t.clientId === clientId);
    const activeTasks = clientTasks.filter(t =>
      ['pending', 'in-progress', 'paused'].includes(t.status)
    );
    return { active: activeTasks.length, total: clientTasks.length };
  };

  // Get vehicles for client
  const getClientVehicles = (clientId: string) =>
    vehicles.filter(v => v.clientId === clientId);

  // Get vehicle task count and active count
  const getVehicleStats = (vehicleId: string) => {
    const vehicleTasks = tasks.filter(t => t.vehicleId === vehicleId);
    const activeTasks = vehicleTasks.filter(t =>
      ['pending', 'in-progress', 'paused'].includes(t.status)
    );
    return { active: activeTasks.length, total: vehicleTasks.length };
  };

  // Helper functions for PDF generation
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDuration = (seconds: number): string => {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const getClientFinancials = (clientId: string) => {
    const clientTasks = tasks.filter(t => t.clientId === clientId);
    const client = clients.find(c => c.id === clientId);
    const hourlyRate = client?.hourlyRate || settings.defaultHourlyRate;
    const cloningRate = client?.cloningRate || settings.defaultCloningRate || 0;
    const programmingRate = client?.programmingRate || settings.defaultProgrammingRate || 0;
    const addKeyRate = client?.addKeyRate || settings.defaultAddKeyRate || 0;
    const allKeysLostRate = client?.allKeysLostRate || settings.defaultAllKeysLostRate || 0;
    let totalLaborCost = 0, totalPartsCost = 0, totalTime = 0;
    let totalMinHourAdj = 0, totalCloning = 0, totalProgramming = 0, totalAddKey = 0, totalAllKeysLost = 0;
    
    clientTasks.forEach(task => {
      totalTime += task.totalTime;
      if (task.importedSalary != null) {
        totalLaborCost += task.importedSalary;
      } else {
        task.sessions.forEach(session => {
          const sessionDuration = session.periods.reduce((sum, p) => sum + p.duration, 0);
          const baseCost = (sessionDuration / 3600) * hourlyRate;
          let minAdj = 0, cloneCost = 0, progCost = 0, akCost = 0, aklCost = 0;
          if (session.chargeMinimumHour && sessionDuration < 3600) minAdj = ((3600 - sessionDuration) / 3600) * hourlyRate;
          if (session.isCloning && cloningRate > 0) cloneCost = cloningRate;
          if (session.isProgramming && programmingRate > 0) progCost = programmingRate;
          if (session.isAddKey && addKeyRate > 0) akCost = addKeyRate;
          if (session.isAllKeysLost && allKeysLostRate > 0) aklCost = allKeysLostRate;
          totalLaborCost += baseCost + minAdj + cloneCost + progCost + akCost + aklCost;
          totalMinHourAdj += minAdj;
          totalCloning += cloneCost;
          totalProgramming += progCost;
          totalAddKey += akCost;
          totalAllKeysLost += aklCost;
        });
      }
      task.sessions.forEach(session => {
        session.parts?.forEach(part => { totalPartsCost += part.price * part.quantity; });
      });
    });
    
    return {
      totalTime, totalLaborCost, totalPartsCost, totalCost: totalLaborCost + totalPartsCost,
      totalMinHourAdj, totalCloning, totalProgramming, totalAddKey, totalAllKeysLost,
      completedTasks: clientTasks.filter(t => ['completed', 'billed', 'paid'].includes(t.status)).length,
      activeTasks: clientTasks.filter(t => ['pending', 'in-progress', 'paused'].includes(t.status)).length,
      totalTasks: clientTasks.length,
    };
  };

  const getVehicleFinancials = (vehicleId: string, clientId: string) => {
    const vehicleTasks = tasks.filter(t => t.vehicleId === vehicleId);
    const client = clients.find(c => c.id === clientId);
    const hourlyRate = client?.hourlyRate || settings.defaultHourlyRate;
    const cloningRate = client?.cloningRate || settings.defaultCloningRate || 0;
    const programmingRate = client?.programmingRate || settings.defaultProgrammingRate || 0;
    const addKeyRate = client?.addKeyRate || settings.defaultAddKeyRate || 0;
    const allKeysLostRate = client?.allKeysLostRate || settings.defaultAllKeysLostRate || 0;
    let totalLaborCost = 0, totalPartsCost = 0, totalTime = 0;
    let totalMinHourAdj = 0, totalCloning = 0, totalProgramming = 0, totalAddKey = 0, totalAllKeysLost = 0;
    
    vehicleTasks.forEach(task => {
      if (task.importedSalary != null) {
        totalLaborCost += task.importedSalary;
      } else {
        task.sessions.forEach(session => {
          const sessionDuration = session.periods.reduce((sum, p) => sum + p.duration, 0);
          const baseCost = (sessionDuration / 3600) * hourlyRate;
          let minAdj = 0, cloneCost = 0, progCost = 0, akCost = 0, aklCost = 0;
          if (session.chargeMinimumHour && sessionDuration < 3600) minAdj = ((3600 - sessionDuration) / 3600) * hourlyRate;
          if (session.isCloning && cloningRate > 0) cloneCost = cloningRate;
          if (session.isProgramming && programmingRate > 0) progCost = programmingRate;
          if (session.isAddKey && addKeyRate > 0) akCost = addKeyRate;
          if (session.isAllKeysLost && allKeysLostRate > 0) aklCost = allKeysLostRate;
          totalLaborCost += baseCost + minAdj + cloneCost + progCost + akCost + aklCost;
          totalMinHourAdj += minAdj;
          totalCloning += cloneCost;
          totalProgramming += progCost;
          totalAddKey += akCost;
          totalAllKeysLost += aklCost;
        });
      }
      totalTime += task.totalTime;
      task.sessions.forEach(session => {
        session.parts?.forEach(part => { totalPartsCost += part.price * part.quantity; });
      });
    });
    
    return {
      totalTime, totalLaborCost, totalPartsCost, totalCost: totalLaborCost + totalPartsCost,
      totalMinHourAdj, totalCloning, totalProgramming, totalAddKey, totalAllKeysLost,
      taskCount: vehicleTasks.length,
    };
  };

  const generateClientPDF = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) {
      toast({
        title: 'Error',
        description: 'Client not found',
        variant: 'destructive',
      });
      return;
    }

    const clientVehicles = getClientVehicles(clientId);
    const financials = getClientFinancials(clientId);

    toast({
      title: 'Generating PDF',
      description: 'Creating client report...',
    });

    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Client Report', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const reportDate = new Date().toLocaleDateString('en-US');
    doc.text(`Generated: ${reportDate}`, 105, 28, { align: 'center' });

    let yPos = 45;

    // Client Information Section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Client Information', 20, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${client.name}`, 25, yPos);
    yPos += 6;
    
    if (client.email) {
      doc.text(`Email: ${client.email}`, 25, yPos);
      yPos += 6;
    }
    
    if (client.phone) {
      doc.text(`Phone: ${client.phone}`, 25, yPos);
      yPos += 6;
    }
    
    doc.text(`Hourly Rate: ${formatCurrency(client.hourlyRate || 0)}/hr`, 25, yPos);
    yPos += 12;

    // Summary Statistics Section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 20, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Tasks: ${financials.totalTasks} (${financials.activeTasks} active, ${financials.completedTasks} completed)`, 25, yPos);
    yPos += 6;
    doc.text(`Total Vehicles: ${clientVehicles.length}`, 25, yPos);
    yPos += 6;
    doc.text(`Total Labor Time: ${formatDuration(financials.totalTime)}`, 25, yPos);
    yPos += 6;
    const baseLab = financials.totalLaborCost - (financials.totalMinHourAdj || 0) - (financials.totalCloning || 0) - (financials.totalProgramming || 0);
    doc.text(`Base Labor Cost: ${formatCurrency(baseLab)}`, 25, yPos);
    yPos += 6;
    if (financials.totalMinHourAdj > 0) {
      doc.text(`Min 1 Hour adjustments: ${formatCurrency(financials.totalMinHourAdj)}`, 25, yPos);
      yPos += 6;
    }
    if (financials.totalCloning > 0) {
      doc.text(`Cloning: ${formatCurrency(financials.totalCloning)}`, 25, yPos);
      yPos += 6;
    }
    if (financials.totalProgramming > 0) {
      doc.text(`Programming: ${formatCurrency(financials.totalProgramming)}`, 25, yPos);
      yPos += 6;
    }
    doc.text(`Total Parts Cost: ${formatCurrency(financials.totalPartsCost)}`, 25, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: ${formatCurrency(financials.totalCost)}`, 25, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 6;
    const vehicleDeposits = clientVehicles.reduce((sum, v) => sum + (v.prepaidAmount || 0), 0);
    const clientDeposit = client.prepaidAmount || 0;
    const totalClientDeposits = vehicleDeposits + clientDeposit;
    if (totalClientDeposits > 0) {
      doc.setTextColor(220, 38, 38);
      if (vehicleDeposits > 0) { doc.text(`Vehicle Deposits: -${formatCurrency(vehicleDeposits)}`, 25, yPos); yPos += 6; }
      if (clientDeposit > 0) { doc.text(`Client Deposit: -${formatCurrency(clientDeposit)}`, 25, yPos); yPos += 6; }
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`Balance Due: ${formatCurrency(Math.max(0, financials.totalCost - totalClientDeposits))}`, 25, yPos);
      doc.setFont('helvetica', 'normal');
    }
    yPos += 12;

    // Vehicles Section
    if (clientVehicles.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Vehicles', 20, yPos);
      yPos += 8;

      clientVehicles.forEach((vehicle, index) => {
        // Check if we need a new page
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        const vehicleName = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Unknown Vehicle';
        const vehicleStats = getVehicleStats(vehicle.id);
        const vehicleFinancials = getVehicleFinancials(vehicle.id, clientId);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`${index + 1}. ${vehicleName}`, 25, yPos);
        yPos += 6;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`VIN: ${vehicle.vin}`, 30, yPos);
        yPos += 5;

        if (vehicle.color) {
          doc.text(`Color: ${vehicle.color}`, 30, yPos);
          yPos += 5;
        }

        doc.text(`Tasks: ${vehicleStats.total} (${vehicleStats.active} active)`, 30, yPos);
        yPos += 5;
        doc.text(`Total Time: ${formatDuration(vehicleFinancials.totalTime)}`, 30, yPos);
        yPos += 5;
        const vBaseLab = vehicleFinancials.totalLaborCost - (vehicleFinancials.totalMinHourAdj || 0) - (vehicleFinancials.totalCloning || 0) - (vehicleFinancials.totalProgramming || 0);
        doc.text(`Labor Cost: ${formatCurrency(vBaseLab)}`, 30, yPos);
        yPos += 5;
        if (vehicleFinancials.totalMinHourAdj > 0) { doc.text(`Min 1 Hour: ${formatCurrency(vehicleFinancials.totalMinHourAdj)}`, 30, yPos); yPos += 5; }
        if (vehicleFinancials.totalCloning > 0) { doc.text(`Cloning: ${formatCurrency(vehicleFinancials.totalCloning)}`, 30, yPos); yPos += 5; }
        if (vehicleFinancials.totalProgramming > 0) { doc.text(`Programming: ${formatCurrency(vehicleFinancials.totalProgramming)}`, 30, yPos); yPos += 5; }
        doc.text(`Parts Cost: ${formatCurrency(vehicleFinancials.totalPartsCost)}`, 30, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'bold');
        doc.text(`Total: ${formatCurrency(vehicleFinancials.totalCost)}`, 30, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 5;
        const vDeposit = vehicle.prepaidAmount || 0;
        if (vDeposit > 0) {
          doc.setTextColor(220, 38, 38);
          doc.text(`Deposit: -${formatCurrency(vDeposit)}`, 30, yPos);
          doc.setTextColor(0, 0, 0);
          yPos += 5;
          doc.setFont('helvetica', 'bold');
          doc.text(`Balance Due: ${formatCurrency(Math.max(0, vehicleFinancials.totalCost - vDeposit))}`, 30, yPos);
          doc.setFont('helvetica', 'normal');
        }
        yPos += 8;
      });
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.text('No vehicles registered', 25, yPos);
    }

    // Save the PDF
    const sanitizedName = client.name.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = new Date().toLocaleDateString('en-US').replace(/\//g, '-');
    doc.save(`Client_Report_${sanitizedName}_${dateStr}.pdf`);

    toast({
      title: 'PDF Generated',
      description: 'Client report downloaded successfully',
    });
  };

  // Handle edit client
  const handleStartEdit = (client: Client) => {
    setEditingClientId(client.id);
    setEditFormData({
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      city: client.city,
      state: client.state,
      zip: client.zip,
      companyName: client.companyName,
      itin: client.itin,
      notes: client.notes,
      hourlyRate: client.hourlyRate,
      cloningRate: client.cloningRate,
      programmingRate: client.programmingRate,
      addKeyRate: client.addKeyRate,
      allKeysLostRate: client.allKeysLostRate,
      prepaidAmount: client.prepaidAmount,
    });
  };

  const handleSaveClientEdit = (clientId: string) => {
    // Validate name
    if (!editFormData.name?.trim()) {
      toast({
        title: 'Error',
        description: 'Client name is required',
        variant: 'destructive',
      });
      return;
    }

    // Validate email format if provided
    if (editFormData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) {
      toast({
        title: 'Error',
        description: 'Invalid email format',
        variant: 'destructive',
      });
      return;
    }

    onUpdateClient(clientId, editFormData);
    setEditingClientId(null);
    toast({ title: 'Client Updated' });
  };

  const handleCancelEdit = () => {
    setEditingClientId(null);
    setEditFormData({});
  };

  // Handle client delete
  const handleDeleteClient = (clientId: string) => {
    const stats = getClientStats(clientId);

    if (stats.active > 0) {
      toast({
        title: 'Cannot Delete Client',
        description: `Client has ${stats.active} active task${stats.active > 1 ? 's' : ''}. Complete them first.`,
        variant: 'destructive',
      });
      return;
    }

    setDeleteClientDialog({ open: true, clientId });
  };

  // Handle vehicle edit
  const handleEditVehicle = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setShowEditVehicleDialog(true);
  };

  const handleSaveVehicle = (vehicleId: string, updates: Partial<Vehicle>) => {
    onUpdateVehicle(vehicleId, updates);
    setShowEditVehicleDialog(false);
    toast({ title: 'Vehicle Updated' });
  };

  // Handle vehicle delete
  const handleDeleteVehicle = (vehicleId: string) => {
    const stats = getVehicleStats(vehicleId);

    if (stats.active > 0) {
      toast({
        title: 'Cannot Delete Vehicle',
        description: `Vehicle has ${stats.active} active task${stats.active > 1 ? 's' : ''}. Complete them first.`,
        variant: 'destructive',
      });
      return;
    }

    setDeleteVehicleDialog({ open: true, vehicleId });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full h-full m-0 p-0 rounded-none flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
          <header className="border-b bg-purple-500/10 backdrop-blur-sm">
            <div className="px-4 py-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 hover:bg-primary/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <DialogTitle className="text-base font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Manage Clients
              </DialogTitle>
            </div>
          </header>

          <div className="px-4 py-2 border-b bg-card/30">
            <Input
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 bg-background/50 border-primary/20 focus:border-primary/40 transition-colors"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {filteredClients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">{searchQuery ? 'No clients found' : 'No clients yet'}</p>
              </div>
            ) : (
              <Accordion type="single" collapsible>
                {filteredClients.map(client => {
                  const stats = getClientStats(client.id);
                  const clientVehicles = getClientVehicles(client.id);
                  const isEditing = editingClientId === client.id;

                  return (
                    <AccordionItem 
                      key={client.id} 
                      value={client.id}
                      className="border rounded-lg mb-2 bg-gradient-to-br from-card to-card/50 hover:from-card/80 hover:to-card/30 transition-all duration-300 shadow-sm hover:shadow-md"
                    >
                      <AccordionTrigger className="text-sm hover:no-underline px-3 py-2">
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="font-semibold">{client.name}</span>
                          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                            {stats.active} active
                          </Badge>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="pb-2">
                        {isEditing ? (
                          <div className="space-y-2 p-3 bg-muted/30 rounded-lg mx-2 border border-primary/10">
                            <div className="space-y-1">
                              <Label className="text-xs">Name *</Label>
                              <Input placeholder="Client Name" value={editFormData.name || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Company Name</Label>
                              <Input placeholder="Business name" value={editFormData.companyName || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, companyName: e.target.value || undefined }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Email</Label>
                              <Input type="email" placeholder="email@example.com" value={editFormData.email || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Phone</Label>
                              <Input type="tel" placeholder="(555) 123-4567" value={editFormData.phone || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, phone: e.target.value }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Address</Label>
                              <Input placeholder="Street address" value={editFormData.address || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, address: e.target.value || undefined }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">City</Label>
                                <Input placeholder="City" value={editFormData.city || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, city: e.target.value || undefined }))} className="h-9 text-sm bg-background" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">State</Label>
                                <Input placeholder="ST" value={editFormData.state || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, state: e.target.value || undefined }))} className="h-9 text-sm bg-background" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">ZIP</Label>
                                <Input placeholder="12345" value={editFormData.zip || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, zip: e.target.value || undefined }))} className="h-9 text-sm bg-background" />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">ITIN</Label>
                              <Input placeholder="Individual Taxpayer ID" value={editFormData.itin || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, itin: e.target.value || undefined }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Hourly Rate ($)</Label>
                              <Input type="number" placeholder="75" value={editFormData.hourlyRate || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, hourlyRate: parseFloat(e.target.value) || undefined }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Cloning Rate ($)</Label>
                              <Input type="number" placeholder="Leave empty for default" value={editFormData.cloningRate || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, cloningRate: parseFloat(e.target.value) || undefined }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Programming Rate ($)</Label>
                              <Input type="number" placeholder="Leave empty for default" value={editFormData.programmingRate || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, programmingRate: parseFloat(e.target.value) || undefined }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Add Key Rate ($)</Label>
                              <Input type="number" placeholder="Leave empty for default" value={editFormData.addKeyRate || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, addKeyRate: parseFloat(e.target.value) || undefined }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">All Keys Lost Rate ($)</Label>
                              <Input type="number" placeholder="Leave empty for default" value={editFormData.allKeysLostRate || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, allKeysLostRate: parseFloat(e.target.value) || undefined }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Deposit ($)</Label>
                              <Input type="number" placeholder="0.00" value={editFormData.prepaidAmount ?? ''} onChange={(e) => setEditFormData(prev => ({ ...prev, prepaidAmount: e.target.value ? parseFloat(e.target.value) : undefined }))} className="h-9 text-sm bg-background" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Notes</Label>
                              <textarea className="flex min-h-[60px] w-full rounded-md border-2 border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" placeholder="Internal notes" value={editFormData.notes || ''} onChange={(e) => setEditFormData(prev => ({ ...prev, notes: e.target.value || undefined }))} />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" onClick={() => handleSaveClientEdit(client.id)} className="h-8 bg-primary hover:bg-primary/90">
                                <Save className="h-3 w-3 mr-1" /> Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleCancelEdit} className="h-8">
                                <X className="h-3 w-3 mr-1" /> Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 p-3 mx-2">
                            <div className="text-xs space-y-1 bg-accent/5 p-2 rounded-md">
                              {client.email && (
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3 w-3 text-primary" />
                                  <span>{client.email}</span>
                                </div>
                              )}
                                {client.phone && (
                                <div className="flex items-center gap-2">
                                  <Phone className="h-3 w-3 text-primary" />
                                  <span>{client.phone}</span>
                                </div>
                              )}
                              {client.companyName && (
                                <div className="flex items-center gap-2 font-medium">
                                  <span>{client.companyName}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-3 w-3 text-primary" />
                                <span className="font-semibold">${client.hourlyRate || '—'}/hr</span>
                              </div>
                              {client.cloningRate && <div className="flex items-center gap-2"><DollarSign className="h-3 w-3 text-primary" /><span>${client.cloningRate} /clone</span></div>}
                              {client.programmingRate && <div className="flex items-center gap-2"><DollarSign className="h-3 w-3 text-primary" /><span>${client.programmingRate} /prog</span></div>}
                              {client.addKeyRate && <div className="flex items-center gap-2"><DollarSign className="h-3 w-3 text-primary" /><span>${client.addKeyRate} /add-key</span></div>}
                              {client.allKeysLostRate && <div className="flex items-center gap-2"><DollarSign className="h-3 w-3 text-primary" /><span>${client.allKeysLostRate} /AKL</span></div>}
                              {client.itin && <div className="text-muted-foreground">ITIN: {client.itin}</div>}
                              {(client.address || client.city || client.state) && (
                                <div className="text-muted-foreground">
                                  {[client.address, [client.city, client.state, client.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                                </div>
                              )}
                              {client.notes && <div className="text-muted-foreground italic">{client.notes}</div>}
                              <div className="text-muted-foreground pt-1 border-t border-border/50 mt-2">
                                {stats.active} active | {stats.total} total task{stats.total !== 1 ? 's' : ''}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => generateClientPDF(client.id)} 
                                className="h-8 text-xs hover:bg-primary/5 hover:border-primary/30 transition-colors"
                              >
                                <Printer className="h-3 w-3 mr-1" /> Print PDF
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleStartEdit(client)} 
                                className="h-8 text-xs hover:bg-primary/5 hover:border-primary/30 transition-colors"
                              >
                                <Edit className="h-3 w-3 mr-1" /> Edit
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={async () => {
                                  if (client.accessCode) {
                                    navigator.clipboard.writeText(client.accessCode);
                                    toast({ title: 'PIN Copied!', description: `PIN: ${client.accessCode}` });
                                  } else {
                                    try {
                                      const result = await syncPortalToCloud(client, vehicles, tasks, settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate, settings.defaultAddKeyRate, settings.defaultAllKeysLostRate, settings.paymentLink, settings.paymentLabel, settings.paymentMethods, client.portalLogoUrl || settings.portalLogoUrl, client.portalBgColor || settings.portalBgColor, client.portalBusinessName || settings.portalBusinessName, client.portalBgImageUrl || settings.portalBgImageUrl);
                                      onUpdateClient(client.id, { portalId: result.portalId, accessCode: result.accessCode });
                                      navigator.clipboard.writeText(result.accessCode);
                                      toast({ title: 'PIN Copied!', description: `PIN: ${result.accessCode}` });
                                    } catch {
                                      toast({ title: 'Error', description: 'Could not generate PIN', variant: 'destructive' });
                                    }
                                  }
                                }}
                                className="h-8 text-xs hover:bg-primary/5 hover:border-primary/30 transition-colors"
                              >
                                <KeyRound className="h-3 w-3 mr-1" /> {client.accessCode ? `PIN: ${client.accessCode}` : 'Set PIN'}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  if (client.portalId) {
                                    window.open(`${PORTAL_BASE_URL}/client-view?id=${client.portalId}&preview=1`, '_blank');
                                  }
                                }}
                                disabled={!client.portalId}
                                className="h-8 text-xs hover:bg-primary/5 hover:border-primary/30 transition-colors"
                              >
                                <Eye className="h-3 w-3 mr-1" /> Portal
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={async () => {
                                  // Try cloud sync first
                                  try {
                                    const result = await syncPortalToCloud(
                                      client, vehicles, tasks,
                                      settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate,
                                      settings.defaultAddKeyRate, settings.defaultAllKeysLostRate,
                                      settings.paymentLink, settings.paymentLabel
                                    );
                                    onUpdateClient(client.id, { portalId: result.portalId, accessCode: result.accessCode });
                                    const url = `${PORTAL_BASE_URL}/client-view?id=${result.portalId}`;
                                    await navigator.clipboard.writeText(url);
                                    toast({ title: 'Link Copied!', description: `Share this link with PIN: ${result.accessCode}` });
                                    return;
                                  } catch (err) {
                                    console.warn('[Share] Cloud sync failed, falling back:', err);
                                  }

                                  // Fallback to hash/file method
                                  const code = client.accessCode || generateAccessCode();
                                  if (!client.accessCode) onUpdateClient(client.id, { accessCode: code });
                                  const summary = calculateClientCosts(client, vehicles, tasks, settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate, settings.defaultAddKeyRate, settings.defaultAllKeysLostRate);
                                  const encoded = await encodeClientData(summary, code);
                                  const url = `${PORTAL_BASE_URL}/client-view#${encoded}`;
                                  
                                  if (url.length <= 2000) {
                                    await navigator.clipboard.writeText(url);
                                    toast({ title: 'Link Copied!', description: `Share this link with PIN: ${code}` });
                                  } else {
                                    const htmlBlob = generatePortalHtmlFile(summary, code);
                                    const file = new File([htmlBlob], `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_portal.html`, { type: 'text/html' });
                                    
                                    if (navigator.share && navigator.canShare?.({ files: [file] })) {
                                      try {
                                        await navigator.share({
                                          title: `Cost Breakdown - ${client.name}`,
                                          text: `PIN: ${code}`,
                                          files: [file],
                                        });
                                        toast({ title: 'Shared!', description: `PIN: ${code}` });
                                      } catch (e: any) {
                                        if (e.name !== 'AbortError') {
                                          const a = document.createElement('a');
                                          a.href = URL.createObjectURL(htmlBlob);
                                          a.download = file.name;
                                          a.click();
                                          URL.revokeObjectURL(a.href);
                                          toast({ title: 'File Downloaded', description: `Send it to your client. PIN: ${code}` });
                                        }
                                      }
                                    } else {
                                      const a = document.createElement('a');
                                      a.href = URL.createObjectURL(htmlBlob);
                                      a.download = file.name;
                                      a.click();
                                      URL.revokeObjectURL(a.href);
                                      toast({ title: 'File Downloaded', description: `Send it to your client. PIN: ${code}` });
                                    }
                                  }
                                }}
                                className="h-8 text-xs hover:bg-primary/5 hover:border-primary/30 transition-colors"
                              >
                                <Link2 className="h-3 w-3 mr-1" /> Share Link
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                onClick={() => handleDeleteClient(client.id)} 
                                className="h-8 text-xs hover:bg-destructive/90 transition-colors"
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            </div>

                            {clientVehicles.length > 0 && (
                              <div className="pt-2 border-t border-border/30">
                                <p className="text-xs font-semibold mb-2 flex items-center gap-1 text-primary">
                                  <Car className="h-3 w-3" />
                                  Vehicles ({clientVehicles.length})
                                </p>
                                <div className="space-y-2">
                                  {clientVehicles.map(vehicle => {
                                    const vehicleStats = getVehicleStats(vehicle.id);
                                    const vehicleName = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Unknown';
                                    const colorScheme = getVehicleColorScheme(vehicle.id);

                                    return (
                                      <div key={vehicle.id} className={`rounded-lg p-2 text-xs space-y-1 border ${colorScheme.card} ${colorScheme.border} hover:shadow-sm transition-all duration-300`}>
                                        <div className="font-medium text-foreground">{vehicleName}</div>
                                        <div className="text-muted-foreground text-[10px] bg-background/50 px-1.5 py-0.5 rounded cursor-pointer hover:text-foreground transition-colors font-mono" onClick={() => { navigator.clipboard.writeText(vehicle.vin); toast({ title: 'VIN Copied!', description: vehicle.vin }); }} title="Click to copy VIN">
                                          VIN: {vehicle.vin}
                                        </div>
                                        {vehicle.color && (
                                          <div className="text-muted-foreground text-[10px] flex items-center gap-1">
                                            <span className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: vehicle.color.toLowerCase() }}></span>
                                            Color: {vehicle.color}
                                          </div>
                                        )}
                                        <div className="text-muted-foreground text-[10px] bg-accent/5 px-1.5 py-0.5 rounded">
                                          {vehicleStats.active} active, {vehicleStats.total} total task{vehicleStats.total !== 1 ? 's' : ''}
                              </div>
                              <div className="flex gap-1 mt-1">
                                {shouldShowStartButton(vehicle.id) && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-6 text-xs"
                                    onClick={() => onStartWork(vehicle.id)}
                                  >
                                    <Play className="h-3 w-3 mr-1" />
                                    Start
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                                  onClick={() => handleEditVehicle(vehicle)}
                                >
                                  Edit
                                </Button>
                                {onMoveVehicle && clients.length > 1 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-xs hover:bg-accent/50 transition-colors"
                                    onClick={() => {
                                      setMoveVehicleDialog({ open: true, vehicleId: vehicle.id, currentClientId: client.id });
                                      setMoveTargetClientId('');
                                    }}
                                  >
                                    <ArrowRightLeft className="h-3 w-3 mr-1" />
                                    Move
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                                  onClick={() => handleDeleteVehicle(vehicle.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedVehicle && (
        <EditVehicleDialog
          open={showEditVehicleDialog}
          onOpenChange={setShowEditVehicleDialog}
          vehicle={selectedVehicle}
          client={clients.find(c => c.id === selectedVehicle.clientId)}
          vehicles={vehicles}
          settings={settings}
          onSave={handleSaveVehicle}
        />
      )}

      <AlertDialog 
        open={deleteClientDialog.open} 
        onOpenChange={(open) => !open && setDeleteClientDialog({ open: false, clientId: null })}
      >
        <AlertDialogContent className="w-[90vw] max-w-sm p-4 rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete Client</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {deleteClientDialog.clientId && (() => {
                const client = clients.find(c => c.id === deleteClientDialog.clientId);
                const stats = getClientStats(deleteClientDialog.clientId);
                const clientVehicles = getClientVehicles(deleteClientDialog.clientId);
                
                return stats.total > 0
                  ? `Are you sure you want to delete "${client?.name}" with ${clientVehicles.length} vehicle${clientVehicles.length !== 1 ? 's' : ''} and ${stats.total} task${stats.total !== 1 ? 's' : ''}? This action cannot be undone.`
                  : `Are you sure you want to delete "${client?.name}"? This action cannot be undone.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="m-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteClientDialog.clientId) {
                  onDeleteClient(deleteClientDialog.clientId);
                  toast({ title: 'Client Deleted' });
                }
                setDeleteClientDialog({ open: false, clientId: null });
              }}
              className="m-0 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog 
        open={deleteVehicleDialog.open} 
        onOpenChange={(open) => !open && setDeleteVehicleDialog({ open: false, vehicleId: null })}
      >
        <AlertDialogContent className="w-[90vw] max-w-sm p-4 rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete Vehicle</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {deleteVehicleDialog.vehicleId && (() => {
                const vehicle = vehicles.find(v => v.id === deleteVehicleDialog.vehicleId);
                const stats = getVehicleStats(deleteVehicleDialog.vehicleId);
                const vehicleName = vehicle
                  ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || vehicle.vin
                  : 'this vehicle';
                
                return stats.total > 0
                  ? `Are you sure you want to delete ${vehicleName} and ${stats.total} task${stats.total !== 1 ? 's' : ''}? This action cannot be undone.`
                  : `Are you sure you want to delete ${vehicleName}? This action cannot be undone.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="m-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteVehicleDialog.vehicleId) {
                  onDeleteVehicle(deleteVehicleDialog.vehicleId);
                  toast({ title: 'Vehicle Deleted' });
                }
                setDeleteVehicleDialog({ open: false, vehicleId: null });
              }}
              className="m-0 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog 
        open={moveVehicleDialog.open} 
        onOpenChange={(open) => {
          if (!open) {
            setMoveVehicleDialog({ open: false, vehicleId: null, currentClientId: null });
            setMoveTargetClientId('');
          }
        }}
      >
        <AlertDialogContent className="w-[90vw] max-w-sm p-4 rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Move Vehicle</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {moveVehicleDialog.vehicleId && (() => {
                const vehicle = vehicles.find(v => v.id === moveVehicleDialog.vehicleId);
                const vehicleName = vehicle
                  ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || vehicle.vin
                  : 'this vehicle';
                const stats = getVehicleStats(moveVehicleDialog.vehicleId);
                return `Move "${vehicleName}" and its ${stats.total} task${stats.total !== 1 ? 's' : ''} to another client:`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={moveTargetClientId} onValueChange={setMoveTargetClientId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select target client..." />
              </SelectTrigger>
              <SelectContent>
                {clients
                  .filter(c => c.id !== moveVehicleDialog.currentClientId)
                  .map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="m-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!moveTargetClientId}
              onClick={() => {
                if (moveVehicleDialog.vehicleId && moveTargetClientId && onMoveVehicle) {
                  onMoveVehicle(moveVehicleDialog.vehicleId, moveTargetClientId);
                  const vehicle = vehicles.find(v => v.id === moveVehicleDialog.vehicleId);
                  const targetClient = clients.find(c => c.id === moveTargetClientId);
                  const vehicleName = vehicle
                    ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || vehicle.vin
                    : 'Vehicle';
                  toast({ title: 'Vehicle Moved', description: `${vehicleName} moved to ${targetClient?.name}` });
                }
                setMoveVehicleDialog({ open: false, vehicleId: null, currentClientId: null });
                setMoveTargetClientId('');
              }}
              className="m-0"
            >
              Move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
