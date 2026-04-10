import { useState } from 'react';
import { Client, Settings } from '@/types';
import { useNotifications } from '@/hooks/useNotifications';
import { Phone, Mail, MapPin, DollarSign, FileText, ChevronRight, ChevronLeft, ArrowLeft } from 'lucide-react';
import { getVehicleColorScheme } from '@/lib/vehicleColors';
import { formatCurrency } from '@/lib/formatTime';

interface AddClientPageProps {
  onSave: (client: Omit<Client, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  settings: Settings;
}

function initials(name: string) {
  if (!name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].substring(0, 2).toUpperCase();
}

const STEPS = [
  { id: 0, label: 'Contact', desc: 'Basic information' },
  { id: 1, label: 'Rates', desc: 'Custom pricing' },
  { id: 2, label: 'Notes', desc: 'Internal notes' },
];

export const AddClientPage = ({ onSave, onCancel, settings }: AddClientPageProps) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [zip, setZip] = useState('');
  const [itin, setItin] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [cloningRate, setCloningRate] = useState('');
  const [programmingRate, setProgrammingRate] = useState('');
  const [addKeyRate, setAddKeyRate] = useState('');
  const [allKeysLostRate, setAllKeysLostRate] = useState('');
  const [prepaidAmount, setPrepaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const { toast } = useNotifications();

  const handleNext = () => {
    if (step === 0 && !name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (step < 2) setStep(s => s + 1);
    else handleSave();
  };

  const handleSave = () => {
    if (!name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    onSave({
      name: name.trim(), companyName: companyName.trim() || undefined,
      phone: phone.trim() || undefined, email: email.trim() || undefined,
      address: address.trim() || undefined, city: city.trim() || undefined,
      state: stateVal.trim() || undefined, zip: zip.trim() || undefined,
      itin: itin.trim() || undefined,
      hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
      cloningRate: cloningRate ? parseFloat(cloningRate) : undefined,
      programmingRate: programmingRate ? parseFloat(programmingRate) : undefined,
      addKeyRate: addKeyRate ? parseFloat(addKeyRate) : undefined,
      allKeysLostRate: allKeysLostRate ? parseFloat(allKeysLostRate) : undefined,
      prepaidAmount: prepaidAmount ? parseFloat(prepaidAmount) : undefined,
      notes: notes.trim() || undefined,
    });
  };

  const color = getVehicleColorScheme(name || 'new');
  const addrFull = [address, [city, stateVal, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const hasRates = hourlyRate || cloningRate || programmingRate || addKeyRate || allKeysLostRate || prepaidAmount;

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );

  const inp = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all";
  const inpName = name.trim()
    ? "h-10 w-full rounded-lg border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400/40 transition-all"
    : inp;

  return (
    <div className="flex-1 flex overflow-hidden bg-muted/20">

      {/* ── LEFT SIDEBAR: Steps + Preview ── */}
      <div className="w-80 shrink-0 bg-card border-r flex flex-col overflow-hidden">

        {/* Back button */}
        <div className="px-5 pt-5 pb-4">
          <button onClick={onCancel}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group">
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to clients
          </button>
        </div>

        {/* Title */}
        <div className="px-6 pb-6 border-b">
          <h1 className="text-xl font-bold text-foreground">New Client</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Fill in the details below</p>
        </div>

        {/* Steps */}
        <div className="px-6 py-5 space-y-1 border-b">
          {STEPS.map((s) => (
            <button key={s.id} onClick={() => s.id < step && setStep(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                s.id === step ? 'bg-primary/10 text-primary' :
                s.id < step ? 'text-emerald-600 dark:text-emerald-400 hover:bg-muted cursor-pointer' :
                'text-muted-foreground cursor-default'
              }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                s.id === step ? 'bg-primary text-primary-foreground' :
                s.id < step ? 'bg-emerald-500 text-white' :
                'bg-muted text-muted-foreground'
              }`}>
                {s.id < step ? '✓' : s.id + 1}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{s.label}</p>
                <p className="text-xs opacity-60 leading-tight">{s.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Live preview */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Live preview</span>
          </div>

          {/* Client card preview */}
          <div className={`rounded-2xl border-2 overflow-hidden ${color.border}`}>
            <div className={`${color.gradient} px-4 py-4`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-background/70 flex items-center justify-center text-sm font-bold text-foreground shrink-0 shadow-sm">
                  {initials(name)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-tight text-foreground truncate">
                    {name.trim() || <span className="text-muted-foreground italic font-normal text-xs">Client name...</span>}
                  </p>
                  {companyName && <p className="text-xs text-muted-foreground mt-0.5 truncate">{companyName}</p>}
                </div>
              </div>
              {(phone || email || addrFull) && (
                <div className="mt-3 space-y-1 pl-1">
                  {phone && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3 w-3 shrink-0" />{phone}</div>}
                  {email && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{email}</span></div>}
                  {addrFull && <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{addrFull}</span></div>}
                </div>
              )}
            </div>
          </div>

          {hasRates && (
            <div className="rounded-xl border border-border bg-background p-3 space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Rates</p>
              <div className="grid grid-cols-2 gap-1.5">
                {hourlyRate && <div className="bg-muted/60 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">Hourly</p><p className="text-sm font-bold">{formatCurrency(parseFloat(hourlyRate))}/hr</p></div>}
                {cloningRate && <div className="bg-muted/60 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">Cloning</p><p className="text-sm font-bold">{formatCurrency(parseFloat(cloningRate))}</p></div>}
                {programmingRate && <div className="bg-muted/60 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">Programming</p><p className="text-sm font-bold">{formatCurrency(parseFloat(programmingRate))}</p></div>}
                {addKeyRate && <div className="bg-muted/60 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">Add Key</p><p className="text-sm font-bold">{formatCurrency(parseFloat(addKeyRate))}</p></div>}
                {allKeysLostRate && <div className="bg-muted/60 rounded-lg p-2 col-span-2"><p className="text-[10px] text-muted-foreground">All Keys Lost</p><p className="text-sm font-bold">{formatCurrency(parseFloat(allKeysLostRate))}</p></div>}
                {prepaidAmount && <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg p-2 col-span-2 flex justify-between items-center"><p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Deposit</p><p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(parseFloat(prepaidAmount))}</p></div>}
              </div>
            </div>
          )}

          {notes && (
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Notes</p>
              <p className="text-xs text-muted-foreground italic leading-relaxed">{notes}</p>
            </div>
          )}

          {!name && !phone && !email && !hasRates && !notes && (
            <div className="text-center py-8 text-muted-foreground/40">
              <p className="text-xs">Start typing →</p>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Form ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">

        {/* Form header */}
        <div className="px-8 py-5 border-b shrink-0">
          <h2 className="text-xl font-bold text-foreground">{STEPS[step].label}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{STEPS[step].desc}</p>
        </div>

        {/* Fields — no scroll, fills space */}
        <div className="flex-1 px-8 py-5 flex flex-col justify-between">
          <div className="max-w-2xl space-y-3">
            {step === 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <F label="Full Name *">
                    <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lance Naidoo" className={inpName} />
                  </F>
                  <F label="Company">
                    <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Business name" className={inp} />
                  </F>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <F label="Phone">
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 734-000-0000" className={inp} />
                  </F>
                  <F label="Email">
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@example.com" className={inp} />
                  </F>
                </div>
                <F label="Street Address">
                  <input value={address} onChange={e => setAddress(e.target.value)} placeholder="760 State Cir" className={inp} />
                </F>
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-2"><F label="City"><input value={city} onChange={e => setCity(e.target.value)} placeholder="Ann Arbor" className={inp} /></F></div>
                  <F label="State"><input value={stateVal} onChange={e => setStateVal(e.target.value)} placeholder="MI" className={inp} /></F>
                  <div className="col-span-2"><F label="ZIP"><input value={zip} onChange={e => setZip(e.target.value)} placeholder="48108" className={inp} /></F></div>
                </div>
                <F label="ITIN">
                  <input value={itin} onChange={e => setItin(e.target.value)} placeholder="Individual Taxpayer ID (optional)" className={inp} />
                </F>
              </>
            )}

            {step === 1 && (
              <>
                <p className="text-xs text-muted-foreground">Leave empty to use defaults from Settings.</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Hourly Rate', val: hourlyRate, set: setHourlyRate, ph: `Default: $${settings.defaultHourlyRate || 75}/hr` },
                    { label: 'Cloning Rate', val: cloningRate, set: setCloningRate, ph: `Default: $${settings.defaultCloningRate || '—'}` },
                    { label: 'Programming Rate', val: programmingRate, set: setProgrammingRate, ph: `Default: $${settings.defaultProgrammingRate || '—'}` },
                    { label: 'Add Key Rate', val: addKeyRate, set: setAddKeyRate, ph: `Default: $${settings.defaultAddKeyRate || '—'}` },
                    { label: 'All Keys Lost Rate', val: allKeysLostRate, set: setAllKeysLostRate, ph: `Default: $${settings.defaultAllKeysLostRate || '—'}` },
                    { label: 'Deposit ($)', val: prepaidAmount, set: setPrepaidAmount, ph: '0.00' },
                  ].map(f => (
                    <F key={f.label} label={f.label}>
                      <input type="number" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} min={0} step={0.01} className={inp} />
                    </F>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <F label="Internal Notes">
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Any notes about this client — visible only to you, never shown to the client..."
                  className="w-full min-h-[180px] rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
              </F>
            )}
          </div>

          {/* Footer pinned to bottom */}
          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <button onClick={() => { if (step === 0) onCancel(); else setStep(s => s - 1); }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-lg hover:bg-muted">
              {step > 0 && <ChevronLeft className="h-4 w-4" />}
              {step === 0 ? 'Cancel' : 'Back'}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{step + 1} of {STEPS.length}</span>
              <button onClick={handleNext}
                disabled={step === 0 && !name.trim()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                {step === 2 ? 'Save Client' : 'Continue'}
                {step < 2 && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
