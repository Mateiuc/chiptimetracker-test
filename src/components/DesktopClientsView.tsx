import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Client, Vehicle, Task, Settings } from '@/types';
import { useNotifications } from '@/hooks/useNotifications';
import { Mail, Phone, DollarSign, Edit, Trash2, Save, X, Car, Printer, KeyRound, Link2, Eye, ArrowRightLeft, Search } from 'lucide-react';
import { EditVehicleDialog } from './EditVehicleDialog';
import { getVehicleColorScheme } from '@/lib/vehicleColors';
import { generateAccessCode, calculateClientCosts, encodeClientData, generatePortalHtmlFile, syncPortalToCloud, PORTAL_BASE_URL } from '@/lib/clientPortalUtils';
import jsPDF from 'jspdf';

interface DesktopClientsViewProps {
  clients: Client[];
  vehicles: Vehicle[];
  tasks: Task[];
  settings: Settings;
  onUpdateClient: (id: string, updates: Partial<Client>) => void;
  onDeleteClient: (id: string) => void;
  onUpdateVehicle: (id: string, updates: Partial<Vehicle>) => void;
  onDeleteVehicle: (id: string) => void;
  onMoveVehicle?: (vehicleId: string, newClientId: string) => void;
}

export const DesktopClientsView = ({
  clients, vehicles, tasks, settings,
  onUpdateClient, onDeleteClient, onUpdateVehicle, onDeleteVehicle, onMoveVehicle,
}: DesktopClientsViewProps) => {
  const { toast } = useNotifications();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Client>>({});
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showEditVehicleDialog, setShowEditVehicleDialog] = useState(false);
  const [deleteClientDialog, setDeleteClientDialog] = useState<{ open: boolean; clientId: string | null }>({ open: false, clientId: null });
  const [deleteVehicleDialog, setDeleteVehicleDialog] = useState<{ open: boolean; vehicleId: string | null }>({ open: false, vehicleId: null });
  const [moveVehicleDialog, setMoveVehicleDialog] = useState<{ open: boolean; vehicleId: string | null; currentClientId: string | null }>({ open: false, vehicleId: null, currentClientId: null });
  const [moveTargetClientId, setMoveTargetClientId] = useState('');

  const filteredClients = clients.filter(c => {
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      (typeof c.email === 'string' && c.email.toLowerCase().includes(q)) ||
      (typeof c.phone === 'string' && c.phone.toLowerCase().includes(q));
  });

  const selectedClient = selectedClientId ? clients.find(c => c.id === selectedClientId) : null;

  const getClientStats = (clientId: string) => {
    const clientTasks = tasks.filter(t => t.clientId === clientId);
    const active = clientTasks.filter(t => ['pending', 'in-progress', 'paused'].includes(t.status)).length;
    return { active, total: clientTasks.length };
  };

  const getClientVehicles = (clientId: string) => vehicles.filter(v => v.clientId === clientId);

  const getVehicleStats = (vehicleId: string) => {
    const vTasks = tasks.filter(t => t.vehicleId === vehicleId);
    const active = vTasks.filter(t => ['pending', 'in-progress', 'paused'].includes(t.status)).length;
    return { active, total: vTasks.length };
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  const formatDuration = (seconds: number) => { const totalMin = Math.round(seconds / 60); const h = Math.floor(totalMin / 60); const m = totalMin % 60; return `${h}h ${m}m`; };

  const getClientFinancials = (clientId: string) => {
    const clientTasks = tasks.filter(t => t.clientId === clientId);
    const client = clients.find(c => c.id === clientId);
    const rate = client?.hourlyRate || 0;
    const cloningRate = client?.cloningRate || settings.defaultCloningRate || 0;
    const programmingRate = client?.programmingRate || settings.defaultProgrammingRate || 0;
    const addKeyRate = client?.addKeyRate || settings.defaultAddKeyRate || 0;
    const allKeysLostRate = client?.allKeysLostRate || settings.defaultAllKeysLostRate || 0;
    let totalLaborCost = 0, totalPartsCost = 0, totalTime = 0;
    let totalMinHourAdj = 0, totalCloning = 0, totalProgramming = 0, totalAddKey = 0, totalAllKeysLost = 0;
    clientTasks.forEach(task => {
      task.sessions.forEach(session => {
        const sessionDuration = session.periods.reduce((sum, p) => sum + p.duration, 0);
        const baseCost = (sessionDuration / 3600) * rate;
        let minAdj = 0, cloneCost = 0, progCost = 0, akCost = 0, aklCost = 0;
        if (session.chargeMinimumHour && sessionDuration < 3600) minAdj = ((3600 - sessionDuration) / 3600) * rate;
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
      totalTime += task.totalTime;
      task.sessions.forEach(s => s.parts?.forEach(p => { totalPartsCost += p.price * p.quantity; }));
    });
    return {
      totalTime, totalLaborCost, totalPartsCost, totalCost: totalLaborCost + totalPartsCost,
      totalMinHourAdj, totalCloning, totalProgramming, totalAddKey, totalAllKeysLost,
      completedTasks: clientTasks.filter(t => ['completed', 'billed', 'paid'].includes(t.status)).length,
      activeTasks: clientTasks.filter(t => ['pending', 'in-progress', 'paused'].includes(t.status)).length,
      totalTasks: clientTasks.length,
    };
  };

  const handleStartEdit = (client: Client) => {
    setEditingClientId(client.id);
    setEditFormData({ name: client.name, email: client.email, phone: client.phone, address: client.address, city: client.city, state: client.state, zip: client.zip, companyName: client.companyName, itin: client.itin, notes: client.notes, hourlyRate: client.hourlyRate, cloningRate: client.cloningRate, programmingRate: client.programmingRate, addKeyRate: client.addKeyRate, allKeysLostRate: client.allKeysLostRate, prepaidAmount: client.prepaidAmount, portalLogoUrl: client.portalLogoUrl, portalBgColor: client.portalBgColor, portalBusinessName: client.portalBusinessName, portalBgImageUrl: client.portalBgImageUrl });
  };

  const handleSaveClientEdit = (clientId: string) => {
    if (!editFormData.name?.trim()) { toast({ title: 'Error', description: 'Client name is required', variant: 'destructive' }); return; }
    if (editFormData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) { toast({ title: 'Error', description: 'Invalid email format', variant: 'destructive' }); return; }
    onUpdateClient(clientId, editFormData);
    setEditingClientId(null);
    toast({ title: 'Client Updated' });
  };

  const handleDeleteClient = (clientId: string) => {
    const stats = getClientStats(clientId);
    if (stats.active > 0) { toast({ title: 'Cannot Delete Client', description: `Client has ${stats.active} active tasks.`, variant: 'destructive' }); return; }
    setDeleteClientDialog({ open: true, clientId });
  };

  const handleDeleteVehicle = (vehicleId: string) => {
    const stats = getVehicleStats(vehicleId);
    if (stats.active > 0) { toast({ title: 'Cannot Delete Vehicle', description: `Vehicle has active tasks.`, variant: 'destructive' }); return; }
    setDeleteVehicleDialog({ open: true, vehicleId });
  };

  const generateClientPDF = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const clientVehicles = getClientVehicles(clientId);
    const financials = getClientFinancials(clientId);
    const doc = new jsPDF();
    doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text('Client Report', 105, 20, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US')}`, 105, 28, { align: 'center' });
    let y = 45;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('Client Information', 20, y); y += 8;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${client.name}`, 25, y); y += 6;
    if (client.email) { doc.text(`Email: ${client.email}`, 25, y); y += 6; }
    if (client.phone) { doc.text(`Phone: ${client.phone}`, 25, y); y += 6; }
    doc.text(`Hourly Rate: ${formatCurrency(client.hourlyRate || 0)}/hr`, 25, y); y += 12;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('Summary', 20, y); y += 8;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Total Tasks: ${financials.totalTasks}`, 25, y); y += 6;
    doc.text(`Total Vehicles: ${clientVehicles.length}`, 25, y); y += 6;
    doc.text(`Total Labor: ${formatDuration(financials.totalTime)}`, 25, y); y += 6;
    const baseLab = financials.totalLaborCost - (financials.totalMinHourAdj || 0) - (financials.totalCloning || 0) - (financials.totalProgramming || 0);
    doc.text(`Labor Cost: ${formatCurrency(baseLab)}`, 25, y); y += 6;
    if (financials.totalMinHourAdj > 0) { doc.text(`Min 1 Hour adjustments: ${formatCurrency(financials.totalMinHourAdj)}`, 25, y); y += 6; }
    if (financials.totalCloning > 0) { doc.text(`Cloning: ${formatCurrency(financials.totalCloning)}`, 25, y); y += 6; }
    if (financials.totalProgramming > 0) { doc.text(`Programming: ${formatCurrency(financials.totalProgramming)}`, 25, y); y += 6; }
    doc.text(`Parts Cost: ${formatCurrency(financials.totalPartsCost)}`, 25, y); y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: ${formatCurrency(financials.totalCost)}`, 25, y); y += 6;
    const vehicleDeposits = clientVehicles.reduce((sum, v) => sum + (v.prepaidAmount || 0), 0);
    const clientDeposit = client.prepaidAmount || 0;
    const totalDeposits = vehicleDeposits + clientDeposit;
    if (totalDeposits > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 0, 0);
      if (vehicleDeposits > 0) { doc.text(`Vehicle Deposits: -${formatCurrency(vehicleDeposits)}`, 25, y); y += 6; }
      if (clientDeposit > 0) { doc.text(`Client Deposit: -${formatCurrency(clientDeposit)}`, 25, y); y += 6; }
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`Balance Due: ${formatCurrency(Math.max(0, financials.totalCost - totalDeposits))}`, 25, y);
    }
    doc.setFont('helvetica', 'normal'); y += 12;
    const sanitizedName = client.name.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Client_Report_${sanitizedName}_${new Date().toLocaleDateString('en-US').replace(/\//g, '-')}.pdf`);
    toast({ title: 'PDF Generated', description: 'Report downloaded' });
  };

  const handleShareLink = async (client: Client) => {
    try {
      const result = await syncPortalToCloud(client, vehicles, tasks, settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate, settings.defaultAddKeyRate, settings.defaultAllKeysLostRate, settings.paymentLink, settings.paymentLabel, settings.paymentMethods, client.portalLogoUrl || settings.portalLogoUrl, selectedClient.portalBgColor || settings.portalBgColor, selectedClient.portalBusinessName || settings.portalBusinessName, selectedClient.portalBgImageUrl || settings.portalBgImageUrl);
      onUpdateClient(client.id, { portalId: result.portalId, accessCode: result.accessCode });
      const url = `${PORTAL_BASE_URL}/client-view?id=${result.portalId}`;
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link Copied!', description: `Share this link with PIN: ${result.accessCode}` });
    } catch {
      const code = client.accessCode || generateAccessCode();
      if (!client.accessCode) onUpdateClient(client.id, { accessCode: code });
      const summary = calculateClientCosts(client, vehicles, tasks, settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate, settings.defaultAddKeyRate, settings.defaultAllKeysLostRate);
      const encoded = await encodeClientData(summary, code);
      const url = `${PORTAL_BASE_URL}/client-view#${encoded}`;
      if (url.length <= 2000) {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link Copied!', description: `PIN: ${code}` });
      } else {
        const htmlBlob = generatePortalHtmlFile(summary, code);
        const a = document.createElement('a'); a.href = URL.createObjectURL(htmlBlob);
        a.download = `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_portal.html`; a.click();
        URL.revokeObjectURL(a.href);
        toast({ title: 'File Downloaded', description: `Send to client. PIN: ${code}` });
      }
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6 p-6 h-full">
      {/* Left: Client List */}
      <div className="col-span-4 flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search clients..." className="pl-9" />
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {filteredClients.map(client => {
              const stats = getClientStats(client.id);
              const vehicleCount = getClientVehicles(client.id).length;
              const isSelected = selectedClientId === client.id;
              const colorScheme = getVehicleColorScheme(client.id);
              return (
                <button
                  key={client.id}
                  onClick={() => { setSelectedClientId(client.id); setEditingClientId(null); }}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                    isSelected
                      ? 'ring-2 ring-primary ring-offset-1 ' + colorScheme.border + ' ' + colorScheme.gradient
                      : colorScheme.border + ' ' + colorScheme.gradient + ' hover:shadow-sm'
                  }`}
                >
                  <div className="font-bold">{client.name}</div>
                  {client.companyName && <div className="text-xs text-muted-foreground">{client.companyName}</div>}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <Car className="inline h-3 w-3 mr-0.5" />{vehicleCount} vehicles · {stats.total} tasks · {stats.active} active
                  </div>
                </button>
              );
            })}
            {filteredClients.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">No clients found</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Client Details */}
      <div className="col-span-8">
        {!selectedClient ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a client to view details
          </div>
        ) : editingClientId === selectedClient.id ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Edit Client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Name *</Label><Input value={editFormData.name || ''} onChange={e => setEditFormData(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Company Name</Label><Input value={editFormData.companyName || ''} onChange={e => setEditFormData(p => ({ ...p, companyName: e.target.value || undefined }))} placeholder="Business name" /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={editFormData.email || ''} onChange={e => setEditFormData(p => ({ ...p, email: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={editFormData.phone || ''} onChange={e => setEditFormData(p => ({ ...p, phone: e.target.value }))} /></div>
                <div className="space-y-2 col-span-2"><Label>Address</Label><Input value={editFormData.address || ''} onChange={e => setEditFormData(p => ({ ...p, address: e.target.value || undefined }))} placeholder="Street address" /></div>
                <div className="space-y-2"><Label>City</Label><Input value={editFormData.city || ''} onChange={e => setEditFormData(p => ({ ...p, city: e.target.value || undefined }))} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>State</Label><Input value={editFormData.state || ''} onChange={e => setEditFormData(p => ({ ...p, state: e.target.value || undefined }))} /></div>
                  <div className="space-y-2"><Label>ZIP</Label><Input value={editFormData.zip || ''} onChange={e => setEditFormData(p => ({ ...p, zip: e.target.value || undefined }))} /></div>
                </div>
                <div className="space-y-2"><Label>ITIN</Label><Input value={editFormData.itin || ''} onChange={e => setEditFormData(p => ({ ...p, itin: e.target.value || undefined }))} placeholder="Individual Taxpayer ID" /></div>
                <div className="space-y-2"><Label>Hourly Rate ($)</Label><Input type="number" value={editFormData.hourlyRate || ''} onChange={e => setEditFormData(p => ({ ...p, hourlyRate: parseFloat(e.target.value) || undefined }))} /></div>
                <div className="space-y-2"><Label>Cloning Rate ($)</Label><Input type="number" value={editFormData.cloningRate || ''} onChange={e => setEditFormData(p => ({ ...p, cloningRate: parseFloat(e.target.value) || undefined }))} placeholder="Leave empty for default" /></div>
                <div className="space-y-2"><Label>Programming Rate ($)</Label><Input type="number" value={editFormData.programmingRate || ''} onChange={e => setEditFormData(p => ({ ...p, programmingRate: parseFloat(e.target.value) || undefined }))} placeholder="Leave empty for default" /></div>
                <div className="space-y-2"><Label>Add Key Rate ($)</Label><Input type="number" value={editFormData.addKeyRate || ''} onChange={e => setEditFormData(p => ({ ...p, addKeyRate: parseFloat(e.target.value) || undefined }))} placeholder="Leave empty for default" /></div>
                <div className="space-y-2"><Label>All Keys Lost Rate ($)</Label><Input type="number" value={editFormData.allKeysLostRate || ''} onChange={e => setEditFormData(p => ({ ...p, allKeysLostRate: parseFloat(e.target.value) || undefined }))} placeholder="Leave empty for default" /></div>
                <div className="space-y-2"><Label>Deposit ($)</Label><Input type="number" value={editFormData.prepaidAmount ?? ''} onChange={e => setEditFormData(p => ({ ...p, prepaidAmount: e.target.value ? parseFloat(e.target.value) : undefined }))} placeholder="0.00" /></div>
                <div className="space-y-2 col-span-2"><Label>Notes</Label><textarea className="flex min-h-[60px] w-full rounded-md border-2 border-input bg-white dark:bg-gray-900 px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={editFormData.notes || ''} onChange={e => setEditFormData(p => ({ ...p, notes: e.target.value || undefined }))} placeholder="Internal notes about this client" /></div>
              </div>

              {/* Portal Branding — per-client overrides */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold text-muted-foreground">Portal Branding <span className="font-normal text-xs">(overrides Settings defaults)</span></p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Business Name</Label>
                    <Input
                      value={editFormData.portalBusinessName || ''}
                      onChange={e => setEditFormData(p => ({ ...p, portalBusinessName: e.target.value || undefined }))}
                      placeholder={settings.portalBusinessName || "e.g. Chip's Time Auto Keys"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Header Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editFormData.portalBgColor || settings.portalBgColor || '#1d4ed8'}
                        onChange={e => setEditFormData(p => ({ ...p, portalBgColor: e.target.value }))}
                        className="h-9 w-14 rounded cursor-pointer border border-border"
                      />
                      <div
                        className="flex-1 h-9 rounded-lg flex items-center justify-center text-white text-xs font-medium"
                        style={{ background: editFormData.portalBgColor || settings.portalBgColor || '#1d4ed8' }}
                      >
                        {editFormData.portalBusinessName || settings.portalBusinessName || 'Service Portal'}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Logo</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => document.getElementById('client-logo-upload')?.click()}
                      >
                        📁 Upload from PC
                      </Button>
                      <input
                        id="client-logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = ev => {
                            setEditFormData(p => ({ ...p, portalLogoUrl: ev.target?.result as string }));
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                      <Input
                        value={editFormData.portalLogoUrl?.startsWith('data:') ? '' : (editFormData.portalLogoUrl || '')}
                        onChange={e => setEditFormData(p => ({ ...p, portalLogoUrl: e.target.value || undefined }))}
                        placeholder="or paste URL: https://..."
                        className="flex-1"
                      />
                      {editFormData.portalLogoUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive shrink-0"
                          onClick={() => setEditFormData(p => ({ ...p, portalLogoUrl: undefined }))}
                        >
                          ✕ Remove
                        </Button>
                      )}
                    </div>
                    {editFormData.portalLogoUrl && (
                      <div className="mt-1 p-2 bg-muted rounded-lg inline-flex items-center gap-2">
                        <img src={editFormData.portalLogoUrl} alt="Logo preview" className="h-10 object-contain max-w-[120px]" onError={e => (e.currentTarget.style.display = 'none')} />
                        <span className="text-xs text-muted-foreground">
                          {editFormData.portalLogoUrl.startsWith('data:') ? '✓ Uploaded from PC' : '✓ URL set'}
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Leave empty to use the default from Settings</p>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Background Image</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => document.getElementById(`client-bg-upload-${selectedClient?.id}`)?.click()}
                      >
                        📁 Upload from PC
                      </Button>
                      <input
                        id={`client-bg-upload-${selectedClient?.id}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = ev => setEditFormData(p => ({ ...p, portalBgImageUrl: ev.target?.result as string }));
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                      {editFormData.portalBgImageUrl && (
                        <Button type="button" variant="ghost" size="sm" className="text-destructive shrink-0" onClick={() => setEditFormData(p => ({ ...p, portalBgImageUrl: undefined }))}>
                          ✕ Remove
                        </Button>
                      )}
                    </div>
                    {editFormData.portalBgImageUrl && (
                      <div className="mt-1 rounded-lg overflow-hidden border border-border h-20 relative">
                        <img src={editFormData.portalBgImageUrl} alt="Background preview" className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 right-1 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded">Preview</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Shown as page background in this client's portal</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleSaveClientEdit(selectedClient.id)}><Save className="h-4 w-4 mr-1" /> Save</Button>
                <Button variant="outline" onClick={() => setEditingClientId(null)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Client Info */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">{selectedClient.name}</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleStartEdit(selectedClient)}><Edit className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => generateClientPDF(selectedClient.id)}><Printer className="h-3.5 w-3.5 mr-1" /> PDF</Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    if (selectedClient.accessCode) {
                      navigator.clipboard.writeText(selectedClient.accessCode);
                      toast({ title: 'PIN Copied!', description: `PIN: ${selectedClient.accessCode}` });
                    } else {
                      try {
                        const result = await syncPortalToCloud(selectedClient, vehicles, tasks, settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate, settings.defaultAddKeyRate, settings.defaultAllKeysLostRate, settings.paymentLink, settings.paymentLabel, settings.paymentMethods, selectedClient.portalLogoUrl || settings.portalLogoUrl, selectedClient.portalBgColor || settings.portalBgColor, selectedClient.portalBusinessName || settings.portalBusinessName, selectedClient.portalBgImageUrl || settings.portalBgImageUrl);
                        onUpdateClient(selectedClient.id, { portalId: result.portalId, accessCode: result.accessCode });
                        navigator.clipboard.writeText(result.accessCode);
                        toast({ title: 'PIN Copied!', description: `PIN: ${result.accessCode}` });
                      } catch {
                        toast({ title: 'Error', description: 'Could not generate PIN', variant: 'destructive' });
                      }
                    }
                  }}>
                    <KeyRound className="h-3.5 w-3.5 mr-1" /> {selectedClient.accessCode ? `PIN: ${selectedClient.accessCode}` : 'Set PIN'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    try {
                      const result = await syncPortalToCloud(selectedClient, vehicles, tasks, settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate, settings.defaultAddKeyRate, settings.defaultAllKeysLostRate, settings.paymentLink, settings.paymentLabel, settings.paymentMethods, selectedClient.portalLogoUrl || settings.portalLogoUrl, selectedClient.portalBgColor || settings.portalBgColor, selectedClient.portalBusinessName || settings.portalBusinessName, selectedClient.portalBgImageUrl || settings.portalBgImageUrl);
                      onUpdateClient(selectedClient.id, { portalId: result.portalId, accessCode: result.accessCode });
                      window.open(`${PORTAL_BASE_URL}/client-view?id=${result.portalId}&preview=1`, '_blank');
                    } catch {
                      toast({ title: 'Error', description: 'Could not open portal', variant: 'destructive' });
                    }
                  }}><Eye className="h-3.5 w-3.5 mr-1" /> Portal</Button>
                  <Button size="sm" variant="outline" onClick={() => handleShareLink(selectedClient)}><Link2 className="h-3.5 w-3.5 mr-1" /> Share</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteClient(selectedClient.id)}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {selectedClient.companyName && <div className="flex items-center gap-1.5 font-medium">{selectedClient.companyName}</div>}
                  {selectedClient.email && <div className="flex items-center gap-1.5"><Mail className="h-4 w-4 text-primary" />{selectedClient.email}</div>}
                  {selectedClient.phone && <div className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-primary" />{selectedClient.phone}</div>}
                  <div className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-primary" />{selectedClient.hourlyRate || settings.defaultHourlyRate || 0}/hr</div>
                  <div className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-primary" />{selectedClient.cloningRate || settings.defaultCloningRate || 0} /clone</div>
                  <div className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-primary" />{selectedClient.programmingRate || settings.defaultProgrammingRate || 0} /prog</div>
                  <div className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-primary" />{selectedClient.addKeyRate || settings.defaultAddKeyRate || 0} /add-key</div>
                  <div className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-primary" />{selectedClient.allKeysLostRate || settings.defaultAllKeysLostRate || 0} /AKL</div>
                  {selectedClient.itin && <div className="flex items-center gap-1.5 text-muted-foreground">ITIN: {selectedClient.itin}</div>}
                </div>
                {(selectedClient.address || selectedClient.city || selectedClient.state) && (
                  <div className="text-sm text-muted-foreground mt-2">
                    {[selectedClient.address, [selectedClient.city, selectedClient.state, selectedClient.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                  </div>
                )}
                {selectedClient.notes && <div className="text-sm text-muted-foreground mt-2 italic">{selectedClient.notes}</div>}
              </CardContent>
            </Card>

            {/* Vehicles */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Car className="h-4 w-4" /> Vehicles ({getClientVehicles(selectedClient.id).length})</CardTitle>
              </CardHeader>
              <CardContent>
                {getClientVehicles(selectedClient.id).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No vehicles</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {getClientVehicles(selectedClient.id).map(vehicle => {
                      const vStats = getVehicleStats(vehicle.id);
                      const vName = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Unknown';
                      const colorScheme = getVehicleColorScheme(vehicle.id);
                      return (
                        <div key={vehicle.id} className={`rounded-lg p-3 text-sm border ${colorScheme.card} ${colorScheme.border}`}>
                          <div className="font-semibold">{vName}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-1 cursor-pointer hover:text-foreground transition-colors" onClick={() => { navigator.clipboard.writeText(vehicle.vin); toast({ title: 'VIN Copied!', description: vehicle.vin }); }} title="Click to copy VIN">VIN: {vehicle.vin}</div>
                          {vehicle.color && <div className="text-xs text-muted-foreground mt-0.5">Color: {vehicle.color}</div>}
                          <div className="text-xs text-muted-foreground mt-1">{vStats.active} active · {vStats.total} total tasks</div>
                          <div className="flex gap-1 mt-2">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSelectedVehicle(vehicle); setShowEditVehicleDialog(true); }}>
                              <Edit className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            {onMoveVehicle && clients.length > 1 && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setMoveVehicleDialog({ open: true, vehicleId: vehicle.id, currentClientId: selectedClient.id }); setMoveTargetClientId(''); }}>
                                <ArrowRightLeft className="h-3 w-3 mr-1" /> Move
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDeleteVehicle(vehicle.id)}>
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {selectedVehicle && (
        <EditVehicleDialog open={showEditVehicleDialog} onOpenChange={setShowEditVehicleDialog} vehicle={selectedVehicle}
          client={clients.find(c => c.id === selectedVehicle.clientId)} vehicles={vehicles} settings={settings}
          onSave={(id, updates) => { onUpdateVehicle(id, updates); setShowEditVehicleDialog(false); toast({ title: 'Vehicle Updated' }); }} />
      )}

      <AlertDialog open={deleteClientDialog.open} onOpenChange={open => !open && setDeleteClientDialog({ open: false, clientId: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteClientDialog.clientId && (() => {
                const c = clients.find(x => x.id === deleteClientDialog.clientId);
                return `Delete "${c?.name}" and all associated data? This cannot be undone.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              if (deleteClientDialog.clientId) { onDeleteClient(deleteClientDialog.clientId); setSelectedClientId(null); toast({ title: 'Client Deleted' }); }
              setDeleteClientDialog({ open: false, clientId: null });
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteVehicleDialog.open} onOpenChange={open => !open && setDeleteVehicleDialog({ open: false, vehicleId: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vehicle</AlertDialogTitle>
            <AlertDialogDescription>Delete this vehicle and its tasks? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              if (deleteVehicleDialog.vehicleId) { onDeleteVehicle(deleteVehicleDialog.vehicleId); toast({ title: 'Vehicle Deleted' }); }
              setDeleteVehicleDialog({ open: false, vehicleId: null });
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={moveVehicleDialog.open} onOpenChange={open => { if (!open) { setMoveVehicleDialog({ open: false, vehicleId: null, currentClientId: null }); setMoveTargetClientId(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move Vehicle</AlertDialogTitle>
            <AlertDialogDescription>Select the target client:</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={moveTargetClientId} onValueChange={setMoveTargetClientId}>
              <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
              <SelectContent>
                {clients.filter(c => c.id !== moveVehicleDialog.currentClientId).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!moveTargetClientId} onClick={() => {
              if (moveVehicleDialog.vehicleId && moveTargetClientId && onMoveVehicle) {
                onMoveVehicle(moveVehicleDialog.vehicleId, moveTargetClientId);
                toast({ title: 'Vehicle Moved' });
              }
              setMoveVehicleDialog({ open: false, vehicleId: null, currentClientId: null }); setMoveTargetClientId('');
            }}>Move</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
