import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Client } from '@/types';
import { useNotifications } from '@/hooks/useNotifications';
import { User, Building2, Phone, Mail, MapPin, DollarSign, FileText, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { getVehicleColorScheme } from '@/lib/vehicleColors';
import { formatCurrency } from '@/lib/formatTime';

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (client: Omit<Client, 'id' | 'createdAt'>) => void;
}

function initials(name: string) {
  if (!name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].substring(0, 2).toUpperCase();
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "h-11 rounded-xl border-0 bg-muted/60 focus:bg-background transition-colors text-sm px-4 focus-visible:ring-2 focus-visible:ring-primary/40 w-full outline-none";
const inputNameCls = (v: string) => `h-11 rounded-xl border-0 transition-colors text-sm px-4 focus-visible:ring-2 w-full outline-none ${v.trim() ? 'bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-400/50 focus-visible:ring-emerald-400/50' : 'bg-muted/60 focus-visible:ring-primary/40 focus:bg-background'}`;

export const AddClientDialog = ({ open, onOpenChange, onSave }: AddClientDialogProps) => {
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

  const reset = () => {
    setStep(0);
    setName(''); setCompanyName(''); setPhone(''); setEmail('');
    setAddress(''); setCity(''); setStateVal(''); setZip(''); setItin('');
    setHourlyRate(''); setCloningRate(''); setProgrammingRate('');
    setAddKeyRate(''); setAllKeysLostRate(''); setPrepaidAmount('');
    setNotes('');
  };

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
    reset(); onOpenChange(false);
  };

  const color = getVehicleColorScheme(name || 'new');
  const addrFull = [address, [city, stateVal, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const hasRates = hourlyRate || cloningRate || programmingRate || addKeyRate || allKeysLostRate || prepaidAmount;

  const steps = [
    { label: 'Contact', icon: <User className="h-3.5 w-3.5" /> },
    { label: 'Rates', icon: <DollarSign className="h-3.5 w-3.5" /> },
    { label: 'Notes', icon: <FileText className="h-3.5 w-3.5" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden rounded-2xl border-0 shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex flex-1 min-h-0">

          {/* ── LEFT: Form ── */}
          <div className="flex-1 flex flex-col min-w-0 bg-background">

            {/* Top bar */}
            <div className="px-8 pt-7 pb-5 border-b">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-foreground">New Client</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{steps[step].label} details</p>
                </div>
                <button onClick={() => { reset(); onOpenChange(false); }}
                  className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Step pills */}
              <div className="flex items-center gap-2">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      onClick={() => i < step && setStep(i)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                        i === step ? 'bg-primary text-primary-foreground shadow-sm' :
                        i < step ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 cursor-pointer hover:bg-emerald-200 dark:hover:bg-emerald-900' :
                        'bg-muted text-muted-foreground cursor-default'
                      }`}>
                      {i < step ? <span className="text-[10px]">✓</span> : s.icon}
                      {s.label}
                    </button>
                    {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Fields */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
              {step === 0 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Full Name" required>
                      <input autoFocus value={name} onChange={e => setName(e.target.value)}
                        placeholder="e.g. Lance Naidoo" className={inputNameCls(name)} />
                    </Field>
                    <Field label="Company">
                      <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                        placeholder="Business name" className={inputCls} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Phone">
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                        placeholder="+1 734-000-0000" className={inputCls} />
                    </Field>
                    <Field label="Email">
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="client@example.com" className={inputCls} />
                    </Field>
                  </div>
                  <Field label="Street Address">
                    <input value={address} onChange={e => setAddress(e.target.value)}
                      placeholder="760 State Cir" className={inputCls} />
                  </Field>
                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-2"><Field label="City">
                      <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ann Arbor" className={inputCls} />
                    </Field></div>
                    <Field label="State">
                      <input value={stateVal} onChange={e => setStateVal(e.target.value)} placeholder="MI" className={inputCls} />
                    </Field>
                    <div className="col-span-2"><Field label="ZIP">
                      <input value={zip} onChange={e => setZip(e.target.value)} placeholder="48108" className={inputCls} />
                    </Field></div>
                  </div>
                  <Field label="ITIN">
                    <input value={itin} onChange={e => setItin(e.target.value)}
                      placeholder="Individual Taxpayer ID (optional)" className={inputCls} />
                  </Field>
                </>
              )}
              {step === 1 && (
                <>
                  <p className="text-sm text-muted-foreground -mt-1">Leave empty to use your defaults from Settings.</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Hourly Rate', val: hourlyRate, set: setHourlyRate, ph: 'e.g. 80' },
                      { label: 'Cloning Rate', val: cloningRate, set: setCloningRate, ph: 'Default' },
                      { label: 'Programming Rate', val: programmingRate, set: setProgrammingRate, ph: 'Default' },
                      { label: 'Add Key Rate', val: addKeyRate, set: setAddKeyRate, ph: 'Default' },
                      { label: 'All Keys Lost', val: allKeysLostRate, set: setAllKeysLostRate, ph: 'Default' },
                      { label: 'Deposit ($)', val: prepaidAmount, set: setPrepaidAmount, ph: '0.00' },
                    ].map(f => (
                      <Field key={f.label} label={f.label}>
                        <input type="number" value={f.val} onChange={e => f.set(e.target.value)}
                          placeholder={f.ph} min={0} step={0.01} className={inputCls} />
                      </Field>
                    ))}
                  </div>
                </>
              )}
              {step === 2 && (
                <Field label="Internal Notes">
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Any notes about this client — visible only to you..."
                    className="w-full min-h-[180px] rounded-xl border-0 bg-muted/60 focus:bg-background transition-colors text-sm px-4 py-3 resize-none outline-none focus:ring-2 focus:ring-primary/40" />
                </Field>
              )}
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t flex items-center justify-between bg-muted/20">
              <button onClick={() => { if (step === 0) { reset(); onOpenChange(false); } else setStep(s => s - 1); }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-xl hover:bg-muted">
                {step > 0 && <ChevronLeft className="h-4 w-4" />}
                {step === 0 ? 'Cancel' : 'Back'}
              </button>
              <button onClick={handleNext}
                disabled={step === 0 && !name.trim()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                {step === 2 ? 'Save Client' : 'Continue'}
                {step < 2 && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* ── RIGHT: Live Preview ── */}
          <div className="w-72 shrink-0 bg-muted/40 border-l flex flex-col">
            <div className="px-5 py-4 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Preview</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {/* Main client card */}
              <div className={`rounded-2xl border-2 overflow-hidden ${color.border}`}>
                <div className={`${color.gradient} px-4 py-4`}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-background/60 flex items-center justify-center text-sm font-bold text-foreground shrink-0 shadow-sm">
                      {initials(name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-base leading-tight text-foreground truncate">
                        {name.trim() || <span className="text-muted-foreground italic font-normal text-sm">Client name...</span>}
                      </p>
                      {companyName && <p className="text-xs text-muted-foreground mt-0.5 truncate">{companyName}</p>}
                    </div>
                  </div>
                  {(phone || email || addrFull) && (
                    <div className="mt-3 space-y-1.5 pl-1">
                      {phone && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3 w-3 shrink-0" />{phone}</div>}
                      {email && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{email}</span></div>}
                      {addrFull && <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{addrFull}</span></div>}
                    </div>
                  )}
                </div>
              </div>

              {/* Rates card */}
              {hasRates && (
                <div className="rounded-xl bg-card border border-border p-3.5 space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Rates</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {hourlyRate && <div className="bg-muted/60 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">Hourly</p><p className="text-sm font-bold text-foreground">{formatCurrency(parseFloat(hourlyRate))}/hr</p></div>}
                    {cloningRate && <div className="bg-muted/60 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">Cloning</p><p className="text-sm font-bold text-foreground">{formatCurrency(parseFloat(cloningRate))}</p></div>}
                    {programmingRate && <div className="bg-muted/60 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">Programming</p><p className="text-sm font-bold text-foreground">{formatCurrency(parseFloat(programmingRate))}</p></div>}
                    {addKeyRate && <div className="bg-muted/60 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">Add Key</p><p className="text-sm font-bold text-foreground">{formatCurrency(parseFloat(addKeyRate))}</p></div>}
                    {allKeysLostRate && <div className="bg-muted/60 rounded-lg p-2 col-span-2"><p className="text-[10px] text-muted-foreground">All Keys Lost</p><p className="text-sm font-bold text-foreground">{formatCurrency(parseFloat(allKeysLostRate))}</p></div>}
                  </div>
                  {prepaidAmount && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg p-2 flex items-center justify-between">
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Deposit</p>
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(parseFloat(prepaidAmount))}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Notes card */}
              {notes && (
                <div className="rounded-xl bg-card border border-border p-3.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Notes</p>
                  <p className="text-xs text-muted-foreground italic leading-relaxed">{notes}</p>
                </div>
              )}

              {/* Empty state */}
              {!name && !phone && !email && !hasRates && !notes && (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <User className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-xs text-muted-foreground">Start typing to see<br />your client card preview</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};
