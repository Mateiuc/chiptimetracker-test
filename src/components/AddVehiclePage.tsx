import { useState } from 'react';
import { Client, Vehicle, Task, Settings } from '@/types';
import { decodeVin, validateVin } from '@/lib/vinDecoder';
import { useNotifications } from '@/hooks/useNotifications';
import VinScanner from './VinScanner';
import { Scan, Car, ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { getVehicleColorScheme } from '@/lib/vehicleColors';

interface AddVehiclePageProps {
  clients: Client[];
  tasks: Task[];
  settings: Settings;
  onSave: (vehicle: Omit<Vehicle, 'id'>, clientName?: string) => void;
  onCancel: () => void;
}

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all";
const inpMono = (v: string) => `h-10 w-full rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 transition-all font-mono tracking-widest uppercase ${
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
  const [showVinScanner, setShowVinScanner] = useState(false);
  const { toast } = useNotifications();

  const handleDecodeVIN = async (vinCode?: string) => {
    const vinToCheck = (vinCode || vin).toUpperCase();
    if (!vinToCheck || !validateVin(vinToCheck)) {
      toast({ title: 'Invalid VIN', description: 'VIN must be 17 characters', variant: 'destructive' });
      return;
    }
    setIsDecoding(true);
    const result = await decodeVin(vinToCheck);
    setIsDecoding(false);
    if (result) {
      setMake(result.make);
      setModel(result.model);
      setYear(result.year.toString());
      setDecoded(true);
      toast({ title: 'VIN Decoded', description: `${result.year} ${result.make} ${result.model}` });
    } else {
      toast({ title: 'Decode Failed', description: 'Enter make, model and year manually.', variant: 'destructive' });
    }
  };

  const handleVinDetected = (scannedVin: string) => {
    setVin(scannedVin.toUpperCase());
    setShowVinScanner(false);
    handleDecodeVIN(scannedVin);
  };

  const handleSave = () => {
    const vinTrimmed = vin.trim().toUpperCase();

    if (!clientId) {
      toast({ title: 'Client required', variant: 'destructive' });
      return;
    }
    if (!vinTrimmed) {
      toast({ title: 'VIN required', variant: 'destructive' });
      return;
    }
    const activeTasks = tasks.filter(t => !['billed', 'paid'].includes(t.status));
    if (activeTasks.find(t => t.carVin.toUpperCase() === vinTrimmed)) {
      toast({ title: 'Duplicate VIN', description: 'This VIN is already on an active task.', variant: 'destructive' });
      return;
    }

    onSave({
      clientId,
      vin: vinTrimmed,
      make: make || undefined,
      model: model || undefined,
      year: year ? parseInt(year) : undefined,
      color: color || undefined,
    });
  };

  const vehicleName = [year, make, model].filter(Boolean).join(' ') || 'New Vehicle';
  const selectedClient = clients.find(c => c.id === clientId);
  const color_scheme = getVehicleColorScheme(vin || 'new');
  return (
    <>
      <div className="flex-1 flex overflow-hidden bg-muted/20">

        {/* ── LEFT SIDEBAR ── */}
        <div className="w-80 shrink-0 bg-card border-r flex flex-col overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <button onClick={onCancel}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group mb-5">
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              Back
            </button>
            <h1 className="text-2xl font-bold text-foreground">Add Vehicle</h1>
            <p className="text-sm text-muted-foreground mt-1">Fill in the details</p>
          </div>

          <div className="h-px bg-border mx-0" />

          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Live Preview</span>
            </div>

            {/* Vehicle preview card */}
            <div className={`rounded-2xl border-2 overflow-hidden ${color_scheme.border}`}>
              <div className={`${color_scheme.gradient} px-4 py-4`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full bg-background/70 flex items-center justify-center shrink-0 shadow-sm">
                    <Car className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm leading-tight text-foreground truncate">
                      {vehicleName !== 'New Vehicle' ? vehicleName : <span className="text-muted-foreground italic font-normal text-xs">Vehicle name...</span>}
                    </p>
                    {color && <p className="text-xs text-muted-foreground mt-0.5">{color}</p>}
                  </div>
                </div>

                {vin && (
                  <div className="bg-background/60 rounded-lg px-3 py-1.5 font-mono text-xs text-foreground tracking-widest mb-2">
                    {vin}
                  </div>
                )}

                {decoded && (
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                    <span className="text-emerald-500">✓</span> VIN decoded automatically
                  </div>
                )}
              </div>

              {selectedClient && (
                <div className="px-4 py-3 bg-card/80">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Client</p>
                  <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
                  {selectedClient.companyName && (
                    <p className="text-xs text-muted-foreground">{selectedClient.companyName}</p>
                  )}
                </div>
              )}
            </div>

            {!vin && !make && !selectedClient && (
              <div className="text-center py-6 text-muted-foreground/40">
                <p className="text-xs">Start filling in fields →</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: FORM ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-10 py-8 border-b bg-background">
            <h2 className="text-2xl font-bold text-foreground">Vehicle details</h2>
            <p className="text-sm text-muted-foreground mt-1">Scan or type the VIN — make, model and year auto-fill</p>
          </div>

          <div className="flex-1 overflow-y-auto px-10 py-8 bg-background space-y-5">
            <div className="max-w-2xl space-y-5">
              <F label="Client" required>
                <div className="relative">
                  <input
                    value={clientSearch || (clients.find(c => c.id === clientId)?.name || '')}
                    onChange={e => { setClientSearch(e.target.value); setClientId(''); setShowClientList(true); }}
                    onFocus={() => setShowClientList(true)}
                    onBlur={() => setTimeout(() => setShowClientList(false), 150)}
                    placeholder="Search client name..."
                    className={inp}
                  />
                  {showClientList && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                      {clients
                        .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.companyName || '').toLowerCase().includes(clientSearch.toLowerCase()))
                        .map(c => (
                          <button key={c.id} type="button"
                            onMouseDown={() => { setClientId(c.id); setClientSearch(''); setShowClientList(false); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors text-sm border-b border-border/50 last:border-0">
                            <p className="font-medium text-foreground">{c.name}</p>
                            {c.companyName && <p className="text-xs text-muted-foreground">{c.companyName}</p>}
                          </button>
                        ))
                      }
                      {clients.filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                        <div className="px-4 py-3 text-sm text-muted-foreground">No clients found</div>
                      )}
                    </div>
                  )}
                </div>
              </F>

              <F label="VIN" required>
                <button
                  onClick={() => setShowVinScanner(true)}
                  className="w-full h-10 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors mb-2"
                >
                  <Scan className="h-4 w-4" /> Scan VIN with Camera
                </button>
                <input
                  value={vin}
                  onChange={e => {
                    const v = e.target.value.toUpperCase();
                    setVin(v);
                    setDecoded(false);
                    if (v.length === 17 && validateVin(v)) handleDecodeVIN(v);
                  }}
                  placeholder="Or type 17-character VIN manually"
                  maxLength={17}
                  className={inpMono(vin)}
                />
                {isDecoding && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Decoding VIN...
                  </div>
                )}
                {decoded && !isDecoding && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 font-semibold">
                    <span>✓</span> Decoded — {year} {make} {model}
                  </div>
                )}
              </F>

              <div className="grid grid-cols-2 gap-5">
                <F label="Make">
                  <input value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. BMW" className={inp} />
                </F>
                <F label="Model">
                  <input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. X5" className={inp} />
                </F>
                <F label="Year">
                  <input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="e.g. 2023" min={1900} max={new Date().getFullYear() + 2} className={inp} />
                </F>
                <F label="Color">
                  <input value={color} onChange={e => setColor(e.target.value)} placeholder="e.g. Black" className={inp} />
                </F>
              </div>
            </div>
          </div>

          <div className="px-10 py-5 border-t bg-background flex items-center justify-between">
            <button onClick={onCancel}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2.5 rounded-xl hover:bg-muted">
              Cancel
            </button>
            <button onClick={handleSave}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">
              Save Vehicle <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showVinScanner && (
        <VinScanner
          onVinDetected={handleVinDetected}
          onClose={() => setShowVinScanner(false)}
          googleApiKey={settings.googleApiKey}
          grokApiKey={settings.grokApiKey}
          ocrSpaceApiKey={settings.ocrSpaceApiKey}
          ocrProvider={settings.ocrProvider}
        />
      )}
    </>
  );
};
