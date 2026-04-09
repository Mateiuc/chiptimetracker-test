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
            <div key={idx} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Label</Label>
                <Input
                  value={method.label}
                  onChange={(e) => {
                    const updated = [...paymentMethods];
                    updated[idx] = { ...updated[idx], label: e.target.value };
                    setPaymentMethods(updated);
                  }}
                  placeholder="e.g. Zelle, Cash App, Venmo"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">URL</Label>
                <Input
                  value={method.url}
                  onChange={(e) => {
                    const updated = [...paymentMethods];
                    updated[idx] = { ...updated[idx], url: e.target.value };
                    setPaymentMethods(updated);
                  }}
                  placeholder="https://..."
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-destructive hover:text-destructive"
                onClick={() => setPaymentMethods(paymentMethods.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaymentMethods([...paymentMethods, { label: '', url: '' }])}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Payment Method
          </Button>
          <p className="text-xs text-muted-foreground">These appear as "Pay Now" buttons in the client portal</p>
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
              placeholder="e.g. ChipTime Auto Keys"
            />
            <p className="text-xs text-muted-foreground">Shown in the portal header instead of "Service Portal"</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Logo URL</Label>
            <Input
              value={portalLogoUrl}
              onChange={e => setPortalLogoUrl(e.target.value)}
              placeholder="https://yoursite.com/logo.png"
            />
            <p className="text-xs text-muted-foreground">Paste a public image URL — shown in the portal header</p>
            {portalLogoUrl && (
              <div className="mt-2 p-2 bg-muted rounded-lg inline-block">
                <img src={portalLogoUrl} alt="Logo preview" className="h-10 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
              </div>
            )}
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
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg"><Save className="h-4 w-4 mr-2" /> Save Settings</Button>
      </div>
    </div>
  );
};
