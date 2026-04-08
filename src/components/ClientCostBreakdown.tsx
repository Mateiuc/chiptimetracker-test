import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { createPortal } from 'react-dom';
import { ClientCostSummary } from '@/lib/clientPortalUtils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/formatTime';
import { Car, Clock, Wrench, DollarSign, Camera, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, FileText, ExternalLink, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ClientCostBreakdownProps {
  costSummary: ClientCostSummary;
  filter?: 'pending' | 'billed' | 'paid';
}

const statusMap: Record<string, string[]> = {
  pending: ['pending', 'in-progress', 'paused', 'completed'],
  billed: ['billed'],
  paid: ['paid'],
};

const statusColors: Record<string, string> = {
  completed: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  billed: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
  paid: 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
  'in-progress': 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
  pending: 'bg-muted text-muted-foreground border-border',
  paused: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
};

const PhotoGallery = ({ photoUrls }: { photoUrls: string[] }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const goNext = useCallback(() => {
    setLightboxIndex(i => (i + 1) % photoUrls.length);
  }, [photoUrls.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex(i => (i - 1 + photoUrls.length) % photoUrls.length);
  }, [photoUrls.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, goNext, goPrev]);

  if (photoUrls.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
        <Camera className="h-3 w-3" />
        <span>Photos ({photoUrls.length})</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {photoUrls.map((url, i) => (
          <button
            key={i}
            onClick={() => openLightbox(i)}
            className="flex-shrink-0 rounded-md overflow-hidden border border-border hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <img
              src={url}
              alt={`Session photo ${i + 1}`}
              className="w-20 h-16 md:w-48 md:h-36 object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {lightboxOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90" onClick={() => setLightboxOpen(false)}>
          <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-3 right-3 z-20 text-white/70 hover:text-white bg-black/50 rounded-full p-1.5"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Counter */}
            <div className="absolute top-3 left-3 z-20 text-white/70 text-sm bg-black/50 rounded-full px-3 py-1">
              {lightboxIndex + 1} / {photoUrls.length}
            </div>

            {/* Prev */}
            {photoUrls.length > 1 && (
              <button
                onClick={goPrev}
                className="absolute left-2 z-20 text-white/70 hover:text-white bg-black/50 rounded-full p-2"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Image */}
            <img
              src={photoUrls[lightboxIndex]}
              alt={`Photo ${lightboxIndex + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-md"
            />

            {/* Next */}
            {photoUrls.length > 1 && (
              <button
                onClick={goNext}
                className="absolute right-2 z-20 text-white/70 hover:text-white bg-black/50 rounded-full p-2"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export const ClientCostBreakdown = ({ costSummary, filter }: ClientCostBreakdownProps) => {
  // Collapse state for vehicle cards — all expanded by default
  const [collapsedVehicles, setCollapsedVehicles] = useState<Set<number>>(new Set());
  const toggleVehicle = (idx: number) => {
    setCollapsedVehicles(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTimeOnly = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatRoundedDuration = (seconds: number) => {
    const totalMinutes = Math.round(seconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
  };

  const allowedStatuses = filter ? statusMap[filter] : null;

  const filteredVehicles = costSummary.vehicles
    .map((vehicleSummary) => {
      const sessions = allowedStatuses
        ? vehicleSummary.sessions.filter((s) => allowedStatuses.includes(s.status))
        : vehicleSummary.sessions;
      const totalLabor = sessions.reduce((sum, s) => sum + s.laborCost, 0);
      const totalParts = sessions.reduce((sum, s) => sum + s.partsCost, 0);
      const totalCloning = sessions.reduce((sum, s) => sum + (s.cloningCost || 0), 0);
      const totalProgramming = sessions.reduce((sum, s) => sum + (s.programmingCost || 0), 0);
      const totalMinHourAdj = sessions.reduce((sum, s) => sum + (s.minHourAdj || 0), 0);
      const totalAddKey = sessions.reduce((sum, s) => sum + (s.addKeyCost || 0), 0);
      const totalAllKeysLost = sessions.reduce((sum, s) => sum + (s.allKeysLostCost || 0), 0);
      return { ...vehicleSummary, sessions, totalLabor, totalParts, totalCloning, totalProgramming, totalMinHourAdj, totalAddKey, totalAllKeysLost, vehicleTotal: totalLabor + totalParts };
    })
    .filter((v) => v.sessions.length > 0);

  const grandTotalLabor = filteredVehicles.reduce((sum, v) => sum + v.totalLabor, 0);
  const grandTotalParts = filteredVehicles.reduce((sum, v) => sum + v.totalParts, 0);
  const grandTotalCloning = filteredVehicles.reduce((sum, v) => sum + v.totalCloning, 0);
  const grandTotalProgramming = filteredVehicles.reduce((sum, v) => sum + v.totalProgramming, 0);
  const grandTotalMinHourAdj = filteredVehicles.reduce((sum, v) => sum + v.totalMinHourAdj, 0);
  const grandTotalAddKey = filteredVehicles.reduce((sum, v) => sum + (v.totalAddKey || 0), 0);
  const grandTotalAllKeysLost = filteredVehicles.reduce((sum, v) => sum + (v.totalAllKeysLost || 0), 0);
  const grandTotal = grandTotalLabor + grandTotalParts;

  const monthlyData = useMemo(() => {
    if (filter !== 'paid') return [];
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const monthMap = new Map<string, { month: string; money: number; cars: Set<string> }>();

    filteredVehicles.forEach(v => {
      const allDates = v.sessions.map(s => new Date(s.date).getTime());
      if (allDates.length === 0) return;
      const lastStopDate = new Date(Math.max(...allDates));
      if (lastStopDate < cutoff) return;

      const key = `${lastStopDate.getFullYear()}-${String(lastStopDate.getMonth() + 1).padStart(2, '0')}`;
      const label = lastStopDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!monthMap.has(key)) monthMap.set(key, { month: label, money: 0, cars: new Set() });
      const entry = monthMap.get(key)!;
      entry.money += v.sessions.reduce((sum, s) => sum + s.laborCost + s.partsCost, 0);
      entry.cars.add(v.vehicle.vin);
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, v]) => ({ month: v.month, money: Math.round(v.money * 100) / 100, cars: v.cars.size }));
  }, [filteredVehicles, filter]);

  const emptyMessages: Record<string, string> = {
    pending: 'No pending work found.',
    billed: 'No billed work found.',
    paid: 'No paid work found.',
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Client greeting */}
      <div className="text-center py-2">
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground">
          Hello, {costSummary.client.name}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Your cost breakdown</p>
      </div>

      {/* Vehicle sections */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
        {filteredVehicles.map((vehicleSummary, vIdx) => {
          const v = vehicleSummary.vehicle;
          const vehicleName = [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
          const diagnosticPdfUrl = vehicleSummary.sessions.find(s => s.diagnosticPdfUrl)?.diagnosticPdfUrl;
          const isCollapsed = collapsedVehicles.has(vIdx);
          const vehicleTotal = vehicleSummary.vehicleTotal;
          const deposit = v.prepaidAmount || 0;
          const balanceDue = Math.max(0, vehicleTotal - deposit);

          return (
            <Card key={vIdx} className="overflow-hidden">
              <button
                onClick={() => toggleVehicle(vIdx)}
                className="w-full text-left py-3 px-4 md:py-4 md:px-6 bg-primary/10 hover:bg-primary/15 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Car className="h-4 w-4 md:h-5 md:w-5 text-primary shrink-0" />
                    <span className="text-sm md:text-lg font-bold truncate">{vehicleName}</span>
                    {v.color && (
                      <Badge variant="outline" className="text-[10px] md:text-xs shrink-0">
                        {v.color}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {vehicleTotal > 0 && (
                      <span className={`text-sm font-bold ${deposit > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {deposit > 0 ? `Due: ${formatCurrency(balanceDue)}` : formatCurrency(vehicleTotal)}
                      </span>
                    )}
                    {isCollapsed
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                </div>
                {v.vin && (
                  <p
                    className="text-xs text-muted-foreground font-mono mt-0.5 text-left hover:text-foreground transition-colors"
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(v.vin); toast({ title: 'VIN Copied!', description: v.vin }); }}
                    title="Click to copy VIN"
                  >
                    VIN: {v.vin}
                  </p>
                )}
                {diagnosticPdfUrl && (
                  <a
                    href={diagnosticPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors mt-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    View Diagnostic Report
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </button>
              {!isCollapsed && (
              <CardContent className="p-0">
                {vehicleSummary.sessions.map((session, sIdx) => (
                  <div key={sIdx} className="border-b last:border-b-0 p-4 md:p-6 space-y-2 md:space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm md:text-lg font-semibold text-foreground">
                          Session {sIdx + 1} — {formatDate(session.date)}
                        </p>
                        <p className="text-xs md:text-sm text-muted-foreground italic mt-0.5">
                          "{session.description}"
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] md:text-xs ${statusColors[session.status] || ''}`}>
                        {session.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatRoundedDuration(session.duration)}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-foreground">
                        <DollarSign className="h-3 w-3" />
                        Labor: {formatCurrency(session.laborCost - (session.cloningCost || 0) - (session.programmingCost || 0) - (session.minHourAdj || 0) - (session.addKeyCost || 0) - (session.allKeysLostCost || 0))}
                      </span>
                    </div>
                    {session.periods && session.periods.length > 0 && (
                      <div className="flex flex-col gap-0.5 text-[10px] md:text-xs text-muted-foreground">
                        {session.periods.map((period, pIdx) => (
                          <span key={pIdx}>🕐 <span className="text-green-500 font-medium">{formatTimeOnly(period.start)}</span><span className="text-muted-foreground"> → </span><span className="text-red-500 font-medium">{formatTimeOnly(period.end)}</span></span>
                        ))}
                      </div>
                    )}
                    {((session.minHourAdj || 0) > 0 || (session.cloningCost || 0) > 0 || (session.programmingCost || 0) > 0 || (session.addKeyCost || 0) > 0 || (session.allKeysLostCost || 0) > 0) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] md:text-xs text-muted-foreground mt-0.5">
                        {(session.minHourAdj || 0) > 0 && <span>🚩 Min 1hr: {formatCurrency(session.minHourAdj)}</span>}
                        {(session.cloningCost || 0) > 0 && <span>📋 Cloning: {formatCurrency(session.cloningCost)}</span>}
                        {(session.programmingCost || 0) > 0 && <span>💻 Programming: {formatCurrency(session.programmingCost)}</span>}
                        {(session.addKeyCost || 0) > 0 && <span>🔑 Add Key: {formatCurrency(session.addKeyCost)}</span>}
                        {(session.allKeysLostCost || 0) > 0 && <span>🗝️ All Keys Lost: {formatCurrency(session.allKeysLostCost)}</span>}
                      </div>
                    )}

                    {/* Photo gallery */}
                    {session.photoUrls && session.photoUrls.length > 0 && (
                      <PhotoGallery photoUrls={session.photoUrls} />
                    )}


                    {session.parts.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs md:text-sm font-semibold flex items-center gap-1 mb-1">
                          <Wrench className="h-3 w-3" /> Parts
                        </p>
                        <Table>
                          <TableHeader>
                            <TableRow className="text-[10px]">
                              <TableHead className="h-7 px-2 text-xs md:text-sm">Part</TableHead>
                              <TableHead className="h-7 px-2 text-xs md:text-sm text-center">Qty</TableHead>
                              <TableHead className="h-7 px-2 text-xs md:text-sm text-right">Price</TableHead>
                              <TableHead className="h-7 px-2 text-xs md:text-sm text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {session.parts.map((part, pIdx) => (
                              <TableRow key={pIdx} className="text-xs md:text-sm">
                                <TableCell className="py-1 px-2">{part.name}</TableCell>
                                <TableCell className="py-1 px-2 text-center">{part.quantity}</TableCell>
                                <TableCell className="py-1 px-2 text-right">{formatCurrency(part.price)}</TableCell>
                                <TableCell className="py-1 px-2 text-right font-medium">
                                  {formatCurrency(part.price * part.quantity)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <p className="text-xs md:text-sm font-semibold text-right mt-1 pr-2">
                          Parts Total: {formatCurrency(session.partsCost)}
                        </p>
                      </div>
                    )}

                    <div className="text-xs md:text-sm font-bold text-right border-t pt-1 text-foreground">
                      Session Total: {formatCurrency(session.laborCost + session.partsCost)}
                    </div>
                  </div>
                ))}

                {/* Vehicle subtotal */}
                <div className="p-3 md:p-4 bg-muted/50 text-xs md:text-sm space-y-0.5">
                  <div className="flex justify-between">
                    <span>Vehicle Labor:</span>
                    <span className="font-semibold">{formatCurrency(vehicleSummary.totalLabor - vehicleSummary.totalCloning - vehicleSummary.totalProgramming - vehicleSummary.totalMinHourAdj - (vehicleSummary.totalAddKey || 0) - (vehicleSummary.totalAllKeysLost || 0))}</span>
                  </div>
                  {vehicleSummary.totalMinHourAdj > 0 && (
                    <div className="flex justify-between">
                      <span>Min 1 Hour:</span>
                      <span className="font-semibold">{formatCurrency(vehicleSummary.totalMinHourAdj)}</span>
                    </div>
                  )}
                  {vehicleSummary.totalCloning > 0 && (
                    <div className="flex justify-between">
                      <span>Cloning:</span>
                      <span className="font-semibold">{formatCurrency(vehicleSummary.totalCloning)}</span>
                    </div>
                  )}
                  {vehicleSummary.totalProgramming > 0 && (
                    <div className="flex justify-between">
                      <span>Programming:</span>
                      <span className="font-semibold">{formatCurrency(vehicleSummary.totalProgramming)}</span>
                    </div>
                   )}
                  {(vehicleSummary.totalAddKey || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Add Key:</span>
                      <span className="font-semibold">{formatCurrency(vehicleSummary.totalAddKey)}</span>
                    </div>
                  )}
                  {(vehicleSummary.totalAllKeysLost || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>All Keys Lost:</span>
                      <span className="font-semibold">{formatCurrency(vehicleSummary.totalAllKeysLost)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Vehicle Parts:</span>
                    <span className="font-semibold">{formatCurrency(vehicleSummary.totalParts)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm border-t pt-1 mt-1">
                    <span>Vehicle Total:</span>
                    <span>{formatCurrency(vehicleSummary.vehicleTotal)}</span>
                  </div>
                  {(vehicleSummary.vehicle.prepaidAmount || 0) > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-destructive">
                        <span>Deposit:</span>
                        <span className="font-semibold">-{formatCurrency(vehicleSummary.vehicle.prepaidAmount!)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm text-orange-500">
                        <span>Balance Due:</span>
                        <span>{formatCurrency(Math.max(0, vehicleSummary.vehicleTotal - vehicleSummary.vehicle.prepaidAmount!))}</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {filteredVehicles.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {filter ? emptyMessages[filter] : 'No work records found.'}
        </div>
      )}

      {/* Grand total */}
      {filteredVehicles.length > 0 && (
        <Card className="bg-primary/5 border-primary/30 md:max-w-lg md:mx-auto">
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span>Total Labor:</span>
              <span className="font-semibold">{formatCurrency(grandTotalLabor - grandTotalCloning - grandTotalProgramming - grandTotalMinHourAdj - grandTotalAddKey - grandTotalAllKeysLost)}</span>
            </div>
            {grandTotalMinHourAdj > 0 && (
              <div className="flex justify-between text-sm">
                <span>Min 1 Hour:</span>
                <span className="font-semibold">{formatCurrency(grandTotalMinHourAdj)}</span>
              </div>
            )}
            {grandTotalCloning > 0 && (
              <div className="flex justify-between text-sm">
                <span>Cloning:</span>
                <span className="font-semibold">{formatCurrency(grandTotalCloning)}</span>
              </div>
            )}
            {grandTotalProgramming > 0 && (
              <div className="flex justify-between text-sm">
                <span>Programming:</span>
                <span className="font-semibold">{formatCurrency(grandTotalProgramming)}</span>
              </div>
            )}
            {grandTotalAddKey > 0 && (
              <div className="flex justify-between text-sm">
                <span>Add Key:</span>
                <span className="font-semibold">{formatCurrency(grandTotalAddKey)}</span>
              </div>
            )}
            {grandTotalAllKeysLost > 0 && (
              <div className="flex justify-between text-sm">
                <span>All Keys Lost:</span>
                <span className="font-semibold">{formatCurrency(grandTotalAllKeysLost)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>Total Parts:</span>
              <span className="font-semibold">{formatCurrency(grandTotalParts)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2 text-primary">
              <span>GRAND TOTAL:</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
            {(() => {
              const vehicleDeposits = filteredVehicles.reduce((sum, v) => sum + (v.vehicle.prepaidAmount || 0), 0);
              const clientDeposit = costSummary.client.prepaidAmount || 0;
              const totalDeposits = vehicleDeposits + clientDeposit;
              if (totalDeposits <= 0) return null;
              return (
                <>
                  {vehicleDeposits > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Vehicle Deposits:</span>
                      <span className="font-semibold">-{formatCurrency(vehicleDeposits)}</span>
                    </div>
                  )}
                  {clientDeposit > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Client Deposit:</span>
                      <span className="font-semibold">-{formatCurrency(clientDeposit)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold text-orange-500">
                    <span>BALANCE DUE:</span>
                    <span>{formatCurrency(Math.max(0, grandTotal - totalDeposits))}</span>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Payment methods */}
      {filteredVehicles.length > 0 && (costSummary.paymentMethods?.length ?? 0) > 0 && (
        <div className="flex flex-col items-center gap-2">
          {costSummary.paymentMethods!.map((method, idx) => (
            <Button
              key={idx}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base px-8 w-full max-w-xs"
              onClick={() => window.open(method.url, '_blank')}
            >
              <DollarSign className="h-5 w-5 mr-1" />
              Pay via {method.label}
            </Button>
          ))}
        </div>
      )}

      {/* Legacy single payment link fallback */}
      {costSummary.paymentLink && filteredVehicles.length > 0 && !(costSummary.paymentMethods?.length) && (
        <div className="flex justify-center">
          <Button
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base px-8"
            onClick={() => window.open(costSummary.paymentLink!, '_blank')}
          >
            <DollarSign className="h-5 w-5 mr-1" />
            Pay Now{costSummary.paymentLabel ? ` via ${costSummary.paymentLabel}` : ''}
          </Button>
        </div>
      )}

      {/* Paid tab charts */}
      {filter === 'paid' && monthlyData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm md:text-base">Revenue by Month</CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-4">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), 'Revenue']} />
                  <Bar dataKey="money" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm md:text-base">Cars by Month</CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-4">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" allowDecimals={false} />
                  <Tooltip formatter={(value: number) => [value, 'Cars']} />
                  <Bar dataKey="cars" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Vehicle count footer */}
      <p className="text-xs text-muted-foreground text-center py-4">
        Showing {filteredVehicles.length} vehicle{filteredVehicles.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
};
