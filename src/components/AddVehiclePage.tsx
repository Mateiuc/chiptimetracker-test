import { useState } from 'react';
import { Client, Vehicle, Task, Settings } from '@/types';
import { decodeVin, validateVin } from '@/lib/vinDecoder';
import { useNotifications } from '@/hooks/useNotifications';
import VinScanner from './VinScanner';
import { Car, ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { getVehicleColorScheme } from '@/lib/vehicleColors';

interface AddVehiclePageProps {
  clients: Client[];
  tasks: Task[];
  settings: Settings;
  onSave: (vehicle: Omit<Vehicle, 'id'>) => void;
  onCancel: () => void;
}

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all";
const inpMono = (v: string) => `h-9 w-full rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 transition-all font-mono tracking-widest uppercase ${
  v.length === 17
    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-foreground focus:ring-emerald-400/40'
    : 'border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:ring-primary/30 focus:border-primary/50'
}`;

export const AddVehiclePage = ({ clients, tasks, settings, onSave, onCancel }: AddVehiclePageProps) => {
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [vin, setVin] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [isDecoding, setIsDecoding] = useState(false);
  const [decoded, setDecoded] = useState(false);
  const { toast } = useNotifications();

  const handleDecodeVIN = async (vinCode?: string) => {
    const v = (vinCode || vin).toUpperCase();
    if (!v || !validateVin(v)) return;
    setIsDecoding(true);
    const result = await decodeVin(v);
    setIsDecoding(false);
    if (result) {
      setMake(result.make); setModel(result.model); setYear(result.year.toString());
      setDecoded(true);
      toast({ title: 'VIN Decoded', description: `${result.year} ${result.make} ${result.model}` });
    }
  };

  const handleSave = () => {
    const vinTrimmed = vin.trim().toUpperCase();
    if (!clientId) { toast({ title: 'Client required', variant: 'destructive' }); return; }
    if (!vinTrimmed) { toast({ title: 'VIN required', variant: 'destructive' }); return; }
    const activeTasks = tasks.filter(t => !['billed', 'paid'].includes(t.status));
    if (activeTasks.find(t => t.carVin.toUpperCase() === vinTrimmed)) {
      toast({ title: 'Duplicate VIN', description: 'This VIN is already on an active task.', variant: 'destructive' }); return;
    }
    onSave({ clientId, vin: vinTrimmed, make: make || undefined, model: model || undefined, year: year ? parseInt(year) : undefined, color: color || undefined });
  };

  const vehicleName = [year, make, model].filter(Boolean).join(' ') || 'New Vehicle';
  const selectedClient = clients.find(c => c.id === clientId);
  const colorScheme = getVehicleColorScheme(vin || 'new');

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── LEFT SIDEBAR ── */}
      <div className="w-72 shrink-0 bg-card border-r flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <button onClick={onCancel} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group mb-4">
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" /> Back
          </button>
          <h1 className="text-xl font-bold text-foreground">Add Vehicle</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Fill in the details</p>
        </div>
        <div className="h-px bg-border" />
        <div className="px-5 py-4 flex-1 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Live Preview</span>
          </div>
          <div className={`rounded-2xl border-2 overflow-hidden ${colorScheme.border}`}>
            <div className={`${colorScheme.gradient} px-4 py-3`}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-background/70 flex items-center justify-center shrink-0 shadow-sm">
                  <Car className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-tight text-foreground truncate">
                    {vehicleName !== 'New Vehicle' ? vehicleName : <span className="text-muted-foreground italic font-normal text-xs">Vehicle name...</span>}
                  </p>
                  {color && <p className="text-xs text-muted-foreground mt-0.5">{color}</p>}
                </div>
              </div>
              {vin && <div className="bg-background/60 rounded-lg px-2.5 py-1 font-mono text-xs text-foreground tracking-widest mb-1.5">{vin}</div>}
              {decoded && <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1"><span>✓</span>VIN decoded</div>}
            </div>
            {selectedClient && (
              <div className="px-4 py-2.5 bg-card/80">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Client</p>
                <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
                {selectedClient.companyName && <p className="text-xs text-muted-foreground">{selectedClient.companyName}</p>}
              </div>
            )}
          </div>
          {!vin && !make && !selectedClient && (
            <div className="text-center py-6 text-muted-foreground/40 text-xs">Start filling in fields →</div>
          )}
        </div>
      </div>

      {/* ── RIGHT: FORM (no scroll) ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        <div className="px-8 py-5 border-b shrink-0">
          <h2 className="text-xl font-bold text-foreground">Vehicle details</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Type the VIN — make, model and year auto-fill</p>
        </div>

        {/* Form — fixed height, no scroll */}
        <div className="flex-1 px-8 py-5 flex flex-col justify-between">
          <div className="max-w-2xl space-y-4">
            <F label="Client" required>
              <div className="relative">
                <input
                  value={clientSearch || (selectedClient?.name || '')}
                  onChange={e => { setClientSearch(e.target.value); setClientId(''); setShowClientList(true); }}
                  onFocus={() => setShowClientList(true)}
                  onBlur={() => setTimeout(() => setShowClientList(false), 150)}
                  placeholder="Search client name..."
                  className={inp}
                />
                {showClientList && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {clients
                      .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.companyName || '').toLowerCase().includes(clientSearch.toLowerCase()))
                      .map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={() => { setClientId(c.id); setClientSearch(''); setShowClientList(false); }}
                          className="w-full text-left px-4 py-2 hover:bg-muted transition-colors text-sm border-b border-border/50 last:border-0">
                          <p className="font-medium text-foreground">{c.name}</p>
                          {c.companyName && <p className="text-xs text-muted-foreground">{c.companyName}</p>}
                        </button>
                      ))}
                    {clients.filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-muted-foreground">No clients found</div>
                    )}
                  </div>
                )}
              </div>
            </F>

            <F label="VIN" required>
              <input
                value={vin}
                onChange={e => {
                  const v = e.target.value.toUpperCase();
                  setVin(v); setDecoded(false);
                  if (v.length === 17 && validateVin(v)) handleDecodeVIN(v);
                }}
                placeholder="17-character VIN"
                maxLength={17}
                className={inpMono(vin)}
              />
              {isDecoding && <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1"><Loader2 className="h-3 w-3 animate-spin" />Decoding VIN...</div>}
              {decoded && !isDecoding && <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">✓ Decoded — {year} {make} {model}</div>}
            </F>

            <div className="grid grid-cols-2 gap-4">
              <F label="Make"><input value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. BMW" className={inp} /></F>
              <F label="Model"><input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. X5" className={inp} /></F>
              <F label="Year"><input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="e.g. 2023" min={1900} max={new Date().getFullYear() + 2} className={inp} /></F>
              <F label="Color"><input value={color} onChange={e => setColor(e.target.value)} placeholder="e.g. Black" className={inp} /></F>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-xl hover:bg-muted">Cancel</button>
            <button onClick={handleSave} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">
              Save Vehicle <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
