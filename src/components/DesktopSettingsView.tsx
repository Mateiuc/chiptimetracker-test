import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Settings, PaymentMethod } from '@/types';
import { Save, Plus, Trash2 } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { BackupView } from './BackupView';

interface DesktopSettingsViewProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export const DesktopSettingsView = ({ settings, onSave }: DesktopSettingsViewProps) => {
  const { toast } = useNotifications();
  const [defaultHourlyRate, setDefaultHourlyRate] = useState(settings.defaultHourlyRate?.toString() || '75');
  const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notificationsEnabled !== false);
  const [defaultCloningRate, setDefaultCloningRate] = useState(settings.defaultCloningRate?.toString() || '');
  const [defaultProgrammingRate, setDefaultProgrammingRate] = useState(settings.defaultProgrammingRate?.toString() || '');
  const [defaultAddKeyRate, setDefaultAddKeyRate] = useState(settings.defaultAddKeyRate?.toString() || '');
  const [defaultAllKeysLostRate, setDefaultAllKeysLostRate] = useState(settings.defaultAllKeysLostRate?.toString() || '');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(
    settings.paymentMethods || (settings.paymentLink ? [{ label: settings.paymentLabel || 'Pay', url: settings.paymentLink }] : [])
  );
  const [portalLogoUrl, setPortalLogoUrl] = useState(settings.portalLogoUrl || '');
  const [portalBgColor, setPortalBgColor] = useState(settings.portalBgColor || '#1d4ed8');
  const [portalBusinessName, setPortalBusinessName] = useState(settings.portalBusinessName || '');
  const [portalBgImageUrl, setPortalBgImageUrl] = useState(settings.portalBgImageUrl || '');

  useEffect(() => {
    setDefaultHourlyRate(settings.defaultHourlyRate?.toString() || '75');
    setNotificationsEnabled(settings.notificationsEnabled !== false);
    setDefaultCloningRate(settings.defaultCloningRate?.toString() || '');
    setDefaultProgrammingRate(settings.defaultProgrammingRate?.toString() || '');
    setDefaultAddKeyRate(settings.defaultAddKeyRate?.toString() || '');
    setDefaultAllKeysLostRate(settings.defaultAllKeysLostRate?.toString() || '');
    setPaymentMethods(
      settings.paymentMethods || (settings.paymentLink ? [{ label: settings.paymentLabel || 'Pay', url: settings.paymentLink }] : [])
    );
  }, [settings]);

  const handleSave = () => {
    onSave({
      ...settings,
      defaultHourlyRate: parseFloat(defaultHourlyRate) || 75,
      notificationsEnabled,
      defaultCloningRate: defaultCloningRate ? parseFloat(defaultCloningRate) : undefined,
      defaultProgrammingRate: defaultProgrammingRate ? parseFloat(defaultProgrammingRate) : undefined,
      defaultAddKeyRate: defaultAddKeyRate ? parseFloat(defaultAddKeyRate) : undefined,
      defaultAllKeysLostRate: defaultAllKeysLostRate ? parseFloat(defaultAllKeysLostRate) : undefined,
      paymentMethods: paymentMethods.filter(m => m.label.trim() && m.url.trim()),
      portalLogoUrl: portalLogoUrl.trim() || undefined,
      portalBgColor: portalBgColor || '#1d4ed8',
      portalBusinessName: portalBusinessName.trim() || undefined,
      portalBgImageUrl: portalBgImageUrl || undefined,
    });
    toast({ title: 'Settings Saved' });
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Default Hourly Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default Hourly Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Rate ($/hr)</Label>
              <Input
                type="number"
                value={defaultHourlyRate}
                onChange={(e) => setDefaultHourlyRate(e.target.value)}
                placeholder="75"
                min={0}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground">Applied to all sessions unless overridden per client</p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Popup Notifications</Label>
                <p className="text-xs text-muted-foreground">Show confirmation toasts</p>
              </div>
              <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* Default Cloning Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default Cloning Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Rate ($)</Label>
              <Input
                type="number"
                value={defaultCloningRate}
                onChange={(e) => setDefaultCloningRate(e.target.value)}
                placeholder="Leave empty if not used"
                min={0}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground">Added per session when marked as "Cloning"</p>
            </div>
          </CardContent>
        </Card>

        {/* Default Programming Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default Programming Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Rate ($)</Label>
              <Input
                type="number"
                value={defaultProgrammingRate}
                onChange={(e) => setDefaultProgrammingRate(e.target.value)}
                placeholder="Leave empty if not used"
                min={0}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground">Added per session when marked as "Programming"</p>
            </div>
          </CardContent>
        </Card>

        {/* Default Add Key Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default Add Key Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Rate ($)</Label>
              <Input
                type="number"
                value={defaultAddKeyRate}
                onChange={(e) => setDefaultAddKeyRate(e.target.value)}
                placeholder="Leave empty if not used"
                min={0}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground">Added per session when marked as "Add Key"</p>
            </div>
          </CardContent>
        </Card>

        {/* Default All Keys Lost Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default All Keys Lost Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Rate ($)</Label>
              <Input
                type="number"
                value={defaultAllKeysLostRate}
                onChange={(e) => setDefaultAllKeysLostRate(e.target.value)}
                placeholder="Leave empty if not used"
                min={0}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground">Added per session when marked as "All Keys Lost"</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Payment Methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentMethods.map((method, idx) => (
            <div key={idx} className="border rounded-xl p-3 space-y-3 bg-muted/20">
              <div className="flex items-center gap-2">
                {/* Type selector */}
                <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
                  <button
                    type="button"
                    onClick={() => { const u = [...paymentMethods]; u[idx] = { ...u[idx], type: 'link' }; setPaymentMethods(u); }}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${(method.type || 'link') === 'link' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                  >
                    🔗 Link
                  </button>
                  <button
                    type="button"
                    onClick={() => { const u = [...paymentMethods]; u[idx] = { ...u[idx], type: 'card' }; setPaymentMethods(u); }}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${method.type === 'card' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                  >
                    💳 Card
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <Input
                    value={method.label}
                    onChange={(e) => { const u = [...paymentMethods]; u[idx] = { ...u[idx], label: e.target.value }; setPaymentMethods(u); }}
                    placeholder={method.type === 'card' ? 'e.g. Credit / Debit Card' : 'e.g. Venmo, CashApp, Zelle'}
                    className="h-9"
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
                  onClick={() => setPaymentMethods(paymentMethods.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {method.type === 'card' ? 'Payment page URL (Stripe, Square, PayPal checkout, etc.)' : 'Payment URL'}
                </Label>
                <Input
                  value={method.url}
                  onChange={(e) => { const u = [...paymentMethods]; u[idx] = { ...u[idx], url: e.target.value }; setPaymentMethods(u); }}
                  placeholder={method.type === 'card' ? 'https://buy.stripe.com/... or https://square.link/...' : 'https://venmo.com/yourname'}
                />
                {method.type === 'card' && (
                  <p className="text-xs text-muted-foreground">Use a Stripe Payment Link, Square checkout link, or PayPal checkout URL. Client taps and pays by card directly.</p>
                )}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setPaymentMethods([...paymentMethods, { label: '', url: '', type: 'link' }])}>
            <Plus className="h-4 w-4 mr-1" /> Add Payment Method
          </Button>
          <p className="text-xs text-muted-foreground">These appear as Pay buttons in the client portal — only visible on the Billed tab</p>
        </CardContent>
      </Card>

      {/* Backup & Restore */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup & Restore</CardTitle>
        </CardHeader>
        <CardContent>
          <BackupView onBack={() => {}} />
        </CardContent>
      </Card>

      {/* Client Portal Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Portal Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Business Name</Label>
            <Input
              value={portalBusinessName}
              onChange={e => setPortalBusinessName(e.target.value)}
              placeholder="e.g. Chip's Time Auto Keys"
            />
            <p className="text-xs text-muted-foreground">Shown in the portal header instead of "Service Portal"</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Logo</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => document.getElementById('settings-logo-upload')?.click()}
              >
                📁 Upload from PC
              </Button>
              <input
                id="settings-logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => setPortalLogoUrl(ev.target?.result as string);
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
              <Input
                value={portalLogoUrl.startsWith('data:') ? '' : portalLogoUrl}
                onChange={e => setPortalLogoUrl(e.target.value)}
                placeholder="or paste URL: https://..."
                className="flex-1"
              />
              {portalLogoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive shrink-0"
                  onClick={() => setPortalLogoUrl('')}
                >
                  ✕ Remove
                </Button>
              )}
            </div>
            {portalLogoUrl && (
              <div className="mt-1 p-2 bg-muted rounded-lg inline-flex items-center gap-2">
                <img src={portalLogoUrl} alt="Logo preview" className="h-10 object-contain max-w-[120px]" onError={e => (e.currentTarget.style.display = 'none')} />
                <span className="text-xs text-muted-foreground">
                  {portalLogoUrl.startsWith('data:') ? '✓ Uploaded from PC' : '✓ URL set'}
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Default logo shown in all client portals</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Header Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={portalBgColor}
                onChange={e => setPortalBgColor(e.target.value)}
                className="h-10 w-16 rounded cursor-pointer border border-border"
              />
              <Input
                value={portalBgColor}
                onChange={e => setPortalBgColor(e.target.value)}
                placeholder="#1d4ed8"
                className="w-36 font-mono text-sm"
              />
              <div
                className="flex-1 h-10 rounded-lg flex items-center justify-center text-white text-xs font-medium"
                style={{ background: portalBgColor }}
              >
                {portalBusinessName || 'Service Portal'} — Preview
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Background color of the portal header bar</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Background Image</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => document.getElementById('settings-bg-upload')?.click()}
              >
                📁 Upload from PC
              </Button>
              <input
                id="settings-bg-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => setPortalBgImageUrl(ev.target?.result as string);
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
              {portalBgImageUrl && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive shrink-0" onClick={() => setPortalBgImageUrl('')}>
                  ✕ Remove
                </Button>
              )}
            </div>
            {portalBgImageUrl && (
              <div className="mt-1 rounded-lg overflow-hidden border border-border h-20 relative">
                <img src={portalBgImageUrl} alt="Background preview" className="w-full h-full object-cover" />
                <span className="absolute bottom-1 right-1 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded">Preview</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Shown as page background in the client portal</p>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg"><Save className="h-4 w-4 mr-2" /> Save Settings</Button>
      </div>
    </div>
  );
};
