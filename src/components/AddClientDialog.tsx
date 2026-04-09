import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Client } from '@/types';
import { useNotifications } from '@/hooks/useNotifications';
import { User, Building2, Phone, Mail, MapPin, DollarSign, FileText, ChevronRight, ChevronLeft } from 'lucide-react';
import { getVehicleColorScheme } from '@/lib/vehicleColors';
import { formatCurrency } from '@/lib/formatTime';

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (client: Omit<Client, 'id' | 'createdAt'>) => void;
}

const STEPS = ['Contact', 'Rates', 'Notes'];

function initials(name: string) {
  if (!name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].substring(0, 2).toUpperCase();
}

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
      toast({ title: 'Name required', description: 'Please enter a client name', variant: 'destructive' });
      return;
    }
    if (step < 2) setStep(s => s + 1);
    else handleSave();
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
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
    reset();
    onOpenChange(false);
  };

  const color = getVehicleColorScheme(name || 'new');
  const addrFull = [address, [city, stateVal, zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');

  const Preview = () => (
    <div className="flex flex-col gap-3">
      <div className={`rounded-xl border-2 p-4 ${color.border} ${color.gradient}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-primary/15 text-primary">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-base truncate text-foreground">
              {name.trim() || <span className="text-muted-foreground italic font-normal text-sm">Client name...</span>}
            </p>
            {companyName && <p className="text-xs text-muted-foreground truncate">{companyName}</p>}
          </div>
        </div>
        <div className="space-y-1.5 text-xs">
          {phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3 w-3 shrink-0" /><span>{phone}</span></div>}
          {email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{email}</span></div>}
          {addrFull && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{addrFull}</span></div>}
        </div>
      </div>
      {(hourlyRate || cloningRate || programmingRate || addKeyRate || allKeysLostRate || prepaidAmount) && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rates</p>
          {hourlyRate && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Hourly</span><span className="font-semibold">{formatCurrency(parseFloat(hourlyRate))}/hr</span></div>}
          {cloningRate && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Cloning</span><span className="font-semibold">{formatCurrency(parseFloat(cloningRate))}</span></div>}
          {programmingRate && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Programming</span><span className="font-semibold">{formatCurrency(parseFloat(programmingRate))}</span></div>}
          {addKeyRate && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Add Key</span><span className="font-semibold">{formatCurrency(parseFloat(addKeyRate))}</span></div>}
          {allKeysLostRate && <div className="flex justify-between text-xs"><span className="text-muted-foreground">All Keys Lost</span><span className="font-semibold">{formatCurrency(parseFloat(allKeysLostRate))}</span></div>}
          {prepaidAmount && <div className="flex justify-between text-xs border-t pt-1.5 mt-1"><span className="text-muted-foreground">Deposit</span><span className="font-semibold text-emerald-600">{formatCurrency(parseFloat(prepaidAmount))}</span></div>}
        </div>
      )}
      {notes && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
          <p className="text-xs text-muted-foreground italic leading-relaxed">{notes}</p>
        </div>
      )}
      {!name && !phone && !email && (
        <div className="text-center py-8 text-muted-foreground text-xs">
          <User className="h-8 w-8 mx-auto mb-2 opacity-20" />
          Start typing to see a preview
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden rounded-xl h-[90vh] max-h-[680px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Add New Client</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                  i === step ? 'bg-primary text-primary-foreground font-semibold' :
                  i < step ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' :
                  'bg-muted text-muted-foreground'
                }`}>
                  <span className="font-bold">{i < step ? '✓' : i + 1}</span>
                  <span>{s}</span>
                </div>
                {i < STEPS.length - 1 && <div className="w-4 h-px bg-border" />}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left — form */}
          <div className="flex-1 flex flex-col min-w-0 border-r">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {step === 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5"><User className="h-3 w-3" />Name <span className="text-destructive">*</span></Label>
                      <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
                        className={name.trim() ? 'border-emerald-500 focus-visible:ring-emerald-500/20' : ''} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5"><Building2 className="h-3 w-3" />Company</Label>
                      <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Business name" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5"><Phone className="h-3 w-3" />Phone</Label>
                      <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 734-000-0000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5"><Mail className="h-3 w-3" />Email</Label>
                      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@example.com" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5"><MapPin className="h-3 w-3" />Address</Label>
                    <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" />
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-2 space-y-1.5"><Label className="text-xs">City</Label><Input value={city} onChange={e => setCity(e.target.value)} placeholder="Ann Arbor" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">State</Label><Input value={stateVal} onChange={e => setStateVal(e.target.value)} placeholder="MI" /></div>
                    <div className="col-span-2 space-y-1.5"><Label className="text-xs">ZIP</Label><Input value={zip} onChange={e => setZip(e.target.value)} placeholder="48108" /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ITIN</Label>
                    <Input value={itin} onChange={e => setItin(e.target.value)} placeholder="Individual Taxpayer ID (optional)" />
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <p className="text-xs text-muted-foreground">Leave empty to use your default rates from Settings.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1.5"><DollarSign className="h-3 w-3" />Hourly Rate</Label><Input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="Default" min={0} step={0.01} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Cloning Rate</Label><Input type="number" value={cloningRate} onChange={e => setCloningRate(e.target.value)} placeholder="Default" min={0} step={0.01} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Programming Rate</Label><Input type="number" value={programmingRate} onChange={e => setProgrammingRate(e.target.value)} placeholder="Default" min={0} step={0.01} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Add Key Rate</Label><Input type="number" value={addKeyRate} onChange={e => setAddKeyRate(e.target.value)} placeholder="Default" min={0} step={0.01} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">All Keys Lost Rate</Label><Input type="number" value={allKeysLostRate} onChange={e => setAllKeysLostRate(e.target.value)} placeholder="Default" min={0} step={0.01} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Deposit ($)</Label><Input type="number" value={prepaidAmount} onChange={e => setPrepaidAmount(e.target.value)} placeholder="0.00" min={0} step={0.01} /></div>
                  </div>
                </>
              )}
              {step === 2 && (
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><FileText className="h-3 w-3" />Internal Notes</Label>
                  <textarea
                    className="flex min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Any notes about this client — visible only to you..."
                  />
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center justify-between shrink-0 bg-card/50">
              <Button variant="ghost" size="sm" onClick={() => { if (step === 0) { reset(); onOpenChange(false); } else setStep(s => s - 1); }}>
                {step === 0 ? 'Cancel' : <><ChevronLeft className="h-3.5 w-3.5 mr-1" />Back</>}
              </Button>
              <Button onClick={handleNext} disabled={step === 0 && !name.trim()}>
                {step === 2 ? 'Save Client' : <>Next<ChevronRight className="h-3.5 w-3.5 ml-1" /></>}
              </Button>
            </div>
          </div>

          {/* Right — live preview */}
          <div className="w-64 shrink-0 bg-muted/30 flex flex-col">
            <div className="px-4 py-3 border-b">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Preview
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <Preview />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
