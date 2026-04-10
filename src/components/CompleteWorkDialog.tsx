import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, Flag, Copy, Cpu, Key, KeyRound } from 'lucide-react';
import { Part } from '@/types';

interface CompleteWorkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (description: string, parts: Part[], needsFollowUp: boolean, chargeMinimumHour: boolean, isCloning: boolean, isProgramming: boolean, isAddKey: boolean, isAllKeysLost: boolean) => void;
  vehicleLabel?: string;
}

export const CompleteWorkDialog = ({ open, onOpenChange, onComplete, vehicleLabel }: CompleteWorkDialogProps) => {
  const [description, setDescription] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [chargeMinimumHour, setChargeMinimumHour] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isProgramming, setIsProgramming] = useState(false);
  const [isAddKey, setIsAddKey] = useState(false);
  const [isAllKeysLost, setIsAllKeysLost] = useState(false);
  const [newPart, setNewPart] = useState({
    name: '',
    quantity: '',
    price: '',
    description: '',
    providedByClient: false,
  });

  const handleAddPart = () => {
    if (newPart.name) {
      const part: Part = {
        name: newPart.name,
        quantity: parseInt(newPart.quantity) || 1,
        price: parseFloat(newPart.price) || 0,
        description: newPart.description || '',
        providedByClient: newPart.providedByClient || false,
      };
      setParts([...parts, part]);
      setNewPart({ name: '', quantity: '', price: '', description: '', providedByClient: false });
    }
  };

  const handleRemovePart = (index: number) => {
    setParts(parts.filter((_, i) => i !== index));
  };

  const handleComplete = () => {
    // Check if there's a partially filled part that needs to be added
    const finalParts = [...parts];
    
    // If newPart has at least a name filled in, automatically add it
    if (newPart.name && newPart.name.trim() !== '') {
      finalParts.push({
        name: newPart.name,
        quantity: parseInt(newPart.quantity) || 1,
        price: parseFloat(newPart.price) || 0,
        description: newPart.description || '',
      } as Part);
    }
    
    onComplete(description, finalParts, needsFollowUp, chargeMinimumHour, isCloning, isProgramming, isAddKey, isAllKeysLost);
    setDescription('');
    setParts([]);
    setNewPart({ name: '', quantity: '', price: '', description: '', providedByClient: false });
    setNeedsFollowUp(false);
    setChargeMinimumHour(false);
    setIsCloning(false);
    setIsProgramming(false);
    setIsAddKey(false);
    setIsAllKeysLost(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full m-0 p-0 rounded-none flex flex-col bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <header className="border-b bg-green-500/10 backdrop-blur-sm shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between">
            <DialogTitle className="text-lg font-bold text-primary">Complete Work Session</DialogTitle>
          </div>
        </header>

        <div className="px-4 py-3 space-y-4 overflow-y-auto flex-1">
          {vehicleLabel && (
            <Card className="bg-primary/10 border-primary/30">
              <CardContent className="py-3 px-4">
                <p className="text-sm font-bold text-primary">{vehicleLabel}</p>
              </CardContent>
            </Card>
          )}
          <Card className="bg-card/60 backdrop-blur-sm border-primary/20">
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Work Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the work performed..."
                  rows={3}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-accent/20 to-accent/10 border-accent/30">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">More work needed on this vehicle?</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable to keep this task active for future work sessions
                  </p>
                </div>
                <Switch
                  checked={needsFollowUp}
                  onCheckedChange={setNeedsFollowUp}
                />
              </div>

              <Separator className="bg-accent/30" />

              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing Options</Label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flag className="h-4 w-4 text-primary" />
                    <Label className="text-sm">Min 1 Hour</Label>
                  </div>
                  <Switch checked={chargeMinimumHour} onCheckedChange={setChargeMinimumHour} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4 text-primary" />
                    <Label className="text-sm">Cloning</Label>
                  </div>
                  <Switch checked={isCloning} onCheckedChange={setIsCloning} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    <Label className="text-sm">Programming</Label>
                  </div>
                  <Switch checked={isProgramming} onCheckedChange={setIsProgramming} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-primary" />
                    <Label className="text-sm">Add Key</Label>
                  </div>
                  <Switch checked={isAddKey} onCheckedChange={setIsAddKey} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <Label className="text-sm">All Keys Lost</Label>
                  </div>
                  <Switch checked={isAllKeysLost} onCheckedChange={setIsAllKeysLost} />
                </div>
              </div>
            </CardContent>
          </Card>


          <Card className="bg-card/60 backdrop-blur-sm border-primary/20">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Parts Used</Label>
                
                {parts.length > 0 && (
                  <div className="space-y-2">
                    {parts.map((part, index) => (
                      <Card key={index} className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2">
                          <div className="flex-1 text-sm">
                            <div className="font-semibold text-primary">{part.name}</div>
                            <div className="text-muted-foreground text-xs mt-1">
                              Qty: {part.quantity} × ${part.price.toFixed(2)} = <span className="font-medium text-foreground">${(part.quantity * part.price).toFixed(2)}</span>
                            </div>
                            {part.description && (
                              <div className="text-muted-foreground text-xs mt-0.5 italic">
                                {part.description}
                              </div>
                            )}
                          </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemovePart(index)}
                              className="hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <Card className="border-dashed border-2 border-muted-foreground/20 bg-muted/20">
                  <CardContent className="p-3 space-y-3">
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium">Part Name</Label>
                          {/* Me / Client pill */}
                          <div className="flex bg-muted rounded-full border border-border p-0.5 gap-0.5">
                            <button type="button"
                              onClick={() => setNewPart(p => ({ ...p, providedByClient: false }))}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${!newPart.providedByClient ? 'bg-blue-600 text-white' : 'text-muted-foreground'}`}
                            >Me</button>
                            <button type="button"
                              onClick={() => setNewPart(p => ({ ...p, providedByClient: true }))}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${newPart.providedByClient ? 'bg-green-700 text-white' : 'text-muted-foreground'}`}
                            >Client</button>
                          </div>
                        </div>
                        <Input
                          value={newPart.name}
                          onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                          placeholder="Part name"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Quantity</Label>
                        <Input
                            type="number"
                            value={newPart.quantity}
                            onChange={(e) => setNewPart({ ...newPart, quantity: e.target.value })}
                            onFocus={(e) => { if (e.target.value === '0') setNewPart(p => ({ ...p, quantity: '' })); e.target.select(); }}
                            placeholder="1"
                            min={1}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Price</Label>
                        <Input
                            type="number"
                            value={newPart.price}
                            onChange={(e) => setNewPart({ ...newPart, price: e.target.value })}
                            onFocus={(e) => { if (e.target.value === '0') setNewPart(p => ({ ...p, price: '' })); e.target.select(); }}
                            placeholder="0.00"
                            min={0}
                            step={0.01}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Description (optional)</Label>
                        <Input
                          value={newPart.description}
                          onChange={(e) => setNewPart({ ...newPart, description: e.target.value })}
                          placeholder="Optional"
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddPart}
                      className="w-full gap-2"
                      disabled={!newPart.name}
                    >
                      <Plus className="h-4 w-4" />
                      Add Part
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="px-4 py-3 border-t bg-card/80 backdrop-blur-sm">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleComplete}>
            Complete Work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
