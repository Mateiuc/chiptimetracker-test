import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { createPortal } from 'react-dom';
import { ClientCostSummary } from '@/lib/clientPortalUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/formatTime';
import { Car, Clock, Wrench, DollarSign, Camera, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, FileText, ExternalLink, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getVehicleColorScheme } from '@/lib/vehicleColors';

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

  const openLightbox = (index: number) => { setLightboxIndex(index); setLightboxOpen(true); };
  const goNext = useCallback(() => setLightboxIndex(i => (i + 1) % photoUrls.length), [photoUrls.length]);
  const goPrev = useCallback(() => setLightboxIndex(i => (i - 1 + photoUrls.length) % photoUrls.length), [photoUrls.length]);

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
          <button key={i} onClick={() => openLightbox(i)}
            className="flex-shrink-0 rounded-md overflow-hidden border border-border hover:border-primary transition-colors">
            <img src={url} alt={`Session photo ${i + 1}`} className="w-20 h-16 md:w-32 md:h-24 object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      {lightboxOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90" onClick={() => setLightboxOpen(false)}>
          <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightboxOpen(false)} className="absolute top-3 right-3 z-20 text-white/70 hover:text-white bg-black/50 rounded-full p-1.5"><X className="h-5 w-5" /></button>
            <div className="absolute top-3 left-3 z-20 text-white/70 text-sm bg-black/50 rounded-full px-3 py-1">{lightboxIndex + 1} / {photoUrls.length}</div>
            {photoUrls.length > 1 && <button onClick={goPrev} className="absolute left-2 z-20 text-white/70 hover:text-white bg-black/50 rounded-full p-2"><ChevronLeft className="h-6 w-6" /></button>}
            <img src={photoUrls[lightboxIndex]} alt={`Photo ${lightboxIndex + 1}`} className="max-w-full max-h-[85vh] object-contain rounded-md" />
            {photoUrls.length > 1 && <button onClick={goNext} className="absolute right-2 z-20 text-white/70 hover:text-white bg-black/50 rounded-full p-2"><ChevronRight className="h-6 w-6" /></button>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export const ClientCostBreakdown = ({ costSummary, filter }: ClientCostBreakdownProps) => {
  const [collapsedVehicles, setCollapsedVehicles] = useState<Set<number>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);
  // Payment sheet: null=closed, 'deposit'=deposit, number=vehicle index
  const [paySheet, setPaySheet] = useState<null | 'deposit' | number>(null);

  const hasPayment = (costSummary.paymentMethods?.length ?? 0) > 0 || !!costSummary.paymentLink;
  const showPayButtons = hasPayment && filter === 'billed';

  const openPay = (target: 'deposit' | number) => {
    const methods = costSummary.paymentMethods;
    if (methods && methods.length === 1) {
      window.open(methods[0].url, '_blank');
    } else if (!methods?.length && costSummary.paymentLink) {
      window.open(costSummary.paymentLink, '_blank');
    } else {
      setPaySheet(target);
    }
  };

  const toggleVehicle = (idx: number) => {
    setCollapsedVehicles(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedVehicles(new Set());
    } else {
      setCollapsedVehicles(new Set(filteredVehicles.map((_, i) => i)));
    }
    setAllCollapsed(!allCollapsed);
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
    .map(vehicleSummary => {
      const sessions = allowedStatuses
        ? vehicleSummary.sessions.filter(s => allowedStatuses.includes(s.status))
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
    .filter(v => v.sessions.length > 0);

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
    return Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([_, v]) => ({ month: v.month, money: Math.round(v.money * 100) / 100, cars: v.cars.size }));
  }, [filteredVehicles, filter]);

  const emptyMessages: Record<string, string> = {
    pending: 'No pending work found.',
    billed: 'No billed work found.',
    paid: 'No paid work found.',
  };

  return (
    <div className="space-y-4 md:space-y-5" style={{ background: 'transparent' }}>
      {/* Client greeting — solid background so it's always readable over background images */}
      <div className="text-center py-3 px-6 rounded-2xl mx-auto max-w-sm" style={{ background: 'var(--color-background-primary, white)', boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Hello, {costSummary.client.name}</h2>
        <p className="text-sm text-muted-foreground mt-1">Your service records</p>
      </div>

      {filteredVehicles.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {filter ? emptyMessages[filter] : 'No work records found.'}
        </div>
      )}

      {filteredVehicles.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: 'var(--color-background-primary, white)', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
            <p className="text-xs text-muted-foreground">
              {filteredVehicles.length} vehicle{filteredVehicles.length !== 1 ? 's' : ''} · {filteredVehicles.reduce((s, v) => s + v.sessions.length, 0)} sessions
            </p>
            <button
              onClick={toggleAll}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors"
            >
              {allCollapsed ? 'Expand all ↓' : 'Collapse all ↑'}
            </button>
          </div>

          {/* Accordion */}
          <div className="space-y-2">
            {filteredVehicles.map((vehicleSummary, vIdx) => {
              const v = vehicleSummary.vehicle;
              const vehicleName = [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
              const isCollapsed = collapsedVehicles.has(vIdx);
              const deposit = v.prepaidAmount || 0;
              const balanceDue = Math.max(0, vehicleSummary.vehicleTotal - deposit);
              const diagnosticPdfUrl = vehicleSummary.sessions.find(s => s.diagnosticPdfUrl)?.diagnosticPdfUrl;
              const color = getVehicleColorScheme(v.vin || String(vIdx));

              return (
                <div key={vIdx} className={`border-2 rounded-xl overflow-hidden ${color.border}`}>
                  {/* Accordion header — tap to collapse */}
                  <button
                    onClick={() => toggleVehicle(vIdx)}
                    className={`w-full text-left px-4 py-3 ${color.gradient} flex items-center gap-3`}
                  >
                    <Car className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm truncate">{vehicleName}</span>
                        {v.color && <Badge variant="outline" className="text-[10px] shrink-0">{v.color}</Badge>}
                      </div>
                      {v.vin && (
                        <p
                          className="text-xs text-muted-foreground font-mono mt-0.5 text-left"
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(v.vin); toast({ title: 'VIN Copied!', description: v.vin }); }}
                          title="Click to copy VIN"
                        >
                          {v.vin}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {vehicleSummary.vehicleTotal > 0 && (
                        <span className={`text-sm font-bold ${
                          deposit > 0
                            ? 'text-orange-600 dark:text-orange-400'
                            : filter === 'paid'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : filter === 'billed'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-blue-600 dark:text-blue-400'
                        }`}>
                          {deposit > 0 ? formatCurrency(balanceDue) : formatCurrency(vehicleSummary.vehicleTotal)}
                        </span>
                      )}
                      {showPayButtons && vehicleSummary.vehicleTotal > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); openPay(vIdx); }}
                          className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors"
                        >
                          Pay
                        </button>
                      )}
                      {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Accordion body */}
                  {!isCollapsed && (
                    <div className="bg-card">
                      {diagnosticPdfUrl && (
                        <div className="px-4 py-2 border-b border-border bg-muted/30">
                          <a href={diagnosticPdfUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500">
                            <FileText className="h-3.5 w-3.5" />View Diagnostic Report<ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}

                      {vehicleSummary.sessions.map((session, sIdx) => (
                        <div key={sIdx} className={`border-b last:border-b-0 mx-3 my-2 rounded-lg border ${color.session} px-3 py-2.5 space-y-2`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-background/60 flex items-center justify-center text-[10px] font-semibold text-foreground shrink-0">{sIdx + 1}</span>
                                <p className="text-sm font-semibold text-foreground">{formatDate(session.date)}</p>
                              </div>
                              {session.description && (
                                <p className="text-xs text-muted-foreground italic mt-0.5 ml-7">"{session.description}"</p>
                              )}
                            </div>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColors[session.status] || ''}`}>{session.status}</Badge>
                          </div>

                          <div className="ml-7 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />{formatRoundedDuration(session.duration)}
                            </span>
                            <span className="flex items-center gap-1 font-semibold text-foreground">
                              <DollarSign className="h-3 w-3" />
                              {formatCurrency(session.laborCost - (session.cloningCost || 0) - (session.programmingCost || 0) - (session.minHourAdj || 0) - (session.addKeyCost || 0) - (session.allKeysLostCost || 0))}
                            </span>
                          </div>

                          {session.periods && session.periods.length > 0 && (
                            <div className="ml-7 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                              {session.periods.map((period, pIdx) => (
                                <span key={pIdx}>🕐 <span className="text-green-600 dark:text-green-400 font-medium">{formatTimeOnly(period.start)}</span><span> → </span><span className="text-red-500 font-medium">{formatTimeOnly(period.end)}</span></span>
                              ))}
                            </div>
                          )}

                          {((session.minHourAdj || 0) > 0 || (session.cloningCost || 0) > 0 || (session.programmingCost || 0) > 0 || (session.addKeyCost || 0) > 0 || (session.allKeysLostCost || 0) > 0) && (
                            <div className="ml-7 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                              {(session.minHourAdj || 0) > 0 && <span>🚩 Min 1hr: {formatCurrency(session.minHourAdj)}</span>}
                              {(session.cloningCost || 0) > 0 && <span>📋 Cloning: {formatCurrency(session.cloningCost)}</span>}
                              {(session.programmingCost || 0) > 0 && <span>💻 Programming: {formatCurrency(session.programmingCost)}</span>}
                              {(session.addKeyCost || 0) > 0 && <span>🔑 Add Key: {formatCurrency(session.addKeyCost)}</span>}
                              {(session.allKeysLostCost || 0) > 0 && <span>🗝️ All Keys Lost: {formatCurrency(session.allKeysLostCost)}</span>}
                            </div>
                          )}

                          {session.photoUrls && session.photoUrls.length > 0 && (
                            <div className="ml-7"><PhotoGallery photoUrls={session.photoUrls} /></div>
                          )}

                          {session.parts.length > 0 && (
                            <div className="ml-7 mt-1">
                              <p className="text-xs font-semibold flex items-center gap-1 mb-1"><Wrench className="h-3 w-3" /> Parts</p>
                              <Table>
                                <TableHeader>
                                  <TableRow className="text-[10px]">
                                    <TableHead className="h-6 px-2 text-xs">Part</TableHead>
                                    <TableHead className="h-6 px-2 text-xs text-center">Qty</TableHead>
                                    <TableHead className="h-6 px-2 text-xs text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {session.parts.map((part, pIdx) => (
                                    <TableRow key={pIdx} className="text-xs">
                                      <TableCell className="py-1 px-2">{part.name}</TableCell>
                                      <TableCell className="py-1 px-2 text-center">{part.quantity}</TableCell>
                                      <TableCell className="py-1 px-2 text-right font-medium">{formatCurrency(part.price * part.quantity)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}

                          <div className="ml-7 text-xs font-bold text-right border-t border-border/40 pt-1 text-foreground">
                            Session total: {formatCurrency(session.laborCost + session.partsCost)}
                          </div>
                        </div>
                      ))}

                      {/* Vehicle subtotal */}
                      <div className={`mx-3 mb-3 px-3 py-2 rounded-lg text-xs space-y-0.5 ${color.card}`}>
                        <div className="flex justify-between"><span className="text-muted-foreground">Labor:</span><span className="font-semibold">{formatCurrency(vehicleSummary.totalLabor - vehicleSummary.totalCloning - vehicleSummary.totalProgramming - vehicleSummary.totalMinHourAdj - (vehicleSummary.totalAddKey || 0) - (vehicleSummary.totalAllKeysLost || 0))}</span></div>
                        {vehicleSummary.totalMinHourAdj > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Min 1 Hour:</span><span className="font-semibold">{formatCurrency(vehicleSummary.totalMinHourAdj)}</span></div>}
                        {vehicleSummary.totalCloning > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Cloning:</span><span className="font-semibold">{formatCurrency(vehicleSummary.totalCloning)}</span></div>}
                        {vehicleSummary.totalProgramming > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Programming:</span><span className="font-semibold">{formatCurrency(vehicleSummary.totalProgramming)}</span></div>}
                        {(vehicleSummary.totalAddKey || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Add Key:</span><span className="font-semibold">{formatCurrency(vehicleSummary.totalAddKey)}</span></div>}
                        {(vehicleSummary.totalAllKeysLost || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">All Keys Lost:</span><span className="font-semibold">{formatCurrency(vehicleSummary.totalAllKeysLost)}</span></div>}
                        <div className="flex justify-between"><span className="text-muted-foreground">Parts:</span><span className="font-semibold">{formatCurrency(vehicleSummary.totalParts)}</span></div>
                        <div className="flex justify-between font-bold text-sm border-t border-border/30 pt-1 mt-1"><span>Vehicle total:</span><span>{formatCurrency(vehicleSummary.vehicleTotal)}</span></div>
                        {deposit > 0 && (
                          <>
                            <div className="flex justify-between text-destructive"><span>Deposit:</span><span className="font-semibold">-{formatCurrency(deposit)}</span></div>
                            <div className="flex justify-between font-bold text-orange-600"><span>Balance due:</span><span>{formatCurrency(balanceDue)}</span></div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Grand total */}
          <Card className="border-2 border-primary/30 md:max-w-lg md:mx-auto shadow-md" style={{ background: 'var(--color-background-primary, white)' }}>
            <CardContent className="p-4 space-y-1">
              <div className="flex justify-between text-sm"><span>Total Labor:</span><span className="font-semibold">{formatCurrency(grandTotalLabor - grandTotalCloning - grandTotalProgramming - grandTotalMinHourAdj - grandTotalAddKey - grandTotalAllKeysLost)}</span></div>
              {grandTotalMinHourAdj > 0 && <div className="flex justify-between text-sm"><span>Min 1 Hour:</span><span className="font-semibold">{formatCurrency(grandTotalMinHourAdj)}</span></div>}
              {grandTotalCloning > 0 && <div className="flex justify-between text-sm"><span>Cloning:</span><span className="font-semibold">{formatCurrency(grandTotalCloning)}</span></div>}
              {grandTotalProgramming > 0 && <div className="flex justify-between text-sm"><span>Programming:</span><span className="font-semibold">{formatCurrency(grandTotalProgramming)}</span></div>}
              {grandTotalAddKey > 0 && <div className="flex justify-between text-sm"><span>Add Key:</span><span className="font-semibold">{formatCurrency(grandTotalAddKey)}</span></div>}
              {grandTotalAllKeysLost > 0 && <div className="flex justify-between text-sm"><span>All Keys Lost:</span><span className="font-semibold">{formatCurrency(grandTotalAllKeysLost)}</span></div>}
              <div className="flex justify-between text-sm"><span>Total Parts:</span><span className="font-semibold">{formatCurrency(grandTotalParts)}</span></div>
              <div className={`flex justify-between text-lg font-bold border-t pt-2 mt-2 ${
                filter === 'paid' ? 'text-emerald-600 dark:text-emerald-400' :
                filter === 'billed' ? 'text-amber-600 dark:text-amber-400' :
                'text-blue-600 dark:text-blue-400'
              }`}><span>GRAND TOTAL:</span><span>{formatCurrency(grandTotal)}</span></div>
              {(() => {
                const vehicleDeposits = filteredVehicles.reduce((sum, v) => sum + (v.vehicle.prepaidAmount || 0), 0);
                const clientDeposit = costSummary.client.prepaidAmount || 0;
                const totalDeposits = vehicleDeposits + clientDeposit;
                if (totalDeposits <= 0) return null;
                return (
                  <>
                    {vehicleDeposits > 0 && <div className="flex justify-between text-sm text-destructive"><span>Vehicle Deposits:</span><span className="font-semibold">-{formatCurrency(vehicleDeposits)}</span></div>}
                    {clientDeposit > 0 && <div className="flex justify-between text-sm text-destructive"><span>Client Deposit:</span><span className="font-semibold">-{formatCurrency(clientDeposit)}</span></div>}
                    <div className="flex justify-between text-lg font-bold text-orange-500"><span>BALANCE DUE:</span><span>{formatCurrency(Math.max(0, grandTotal - totalDeposits))}</span></div>
                  </>
                );
              })()}
              {/* Pay Deposit — inside the card, separated by a divider */}
              {showPayButtons && (
                <div className="pt-3 mt-2 border-t border-border/40">
                  <button
                    onClick={() => openPay('deposit')}
                    className="w-full border-2 border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-bold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <DollarSign className="h-4 w-4" />
                    Pay Deposit
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment sheet — bottom sheet style */}
          {paySheet !== null && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center"
              style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setPaySheet(null)}
            >
              <div
                className="w-full max-w-lg bg-card rounded-t-2xl p-5 pb-8 space-y-3"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-base text-foreground">
                    {paySheet === 'deposit'
                      ? 'Pay a deposit'
                      : (() => {
                          const v = filteredVehicles[paySheet as number]?.vehicle;
                          const name = [v?.year, v?.make, v?.model].filter(Boolean).join(' ') || 'Vehicle';
                          const amt = filteredVehicles[paySheet as number]?.vehicleTotal;
                          return `Pay for ${name} — ${formatCurrency(amt)}`;
                        })()
                    }
                  </p>
                  <button onClick={() => setPaySheet(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
                </div>
                <p className="text-xs text-muted-foreground">Choose your payment method:</p>
                {costSummary.paymentMethods?.map((method, idx) => (
                  <button
                    key={idx}
                    onClick={() => { window.open(method.url, '_blank'); setPaySheet(null); }}
                    className="w-full flex items-center justify-between bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3.5 rounded-xl transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      {method.type === 'card'
                        ? <span style={{ fontSize: 18 }}>💳</span>
                        : <DollarSign className="h-5 w-5" />
                      }
                      {method.label || (method.type === 'card' ? 'Pay by Card' : 'Pay')}
                    </span>
                    <ExternalLink className="h-4 w-4 opacity-70" />
                  </button>
                ))}
                {costSummary.paymentLink && !costSummary.paymentMethods?.length && (
                  <button
                    onClick={() => { window.open(costSummary.paymentLink!, '_blank'); setPaySheet(null); }}
                    className="w-full flex items-center justify-between bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3.5 rounded-xl transition-colors"
                  >
                    <span className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Pay Now</span>
                    <ExternalLink className="h-4 w-4 opacity-70" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Paid charts */}
          {filter === 'paid' && monthlyData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Revenue by Month</CardTitle></CardHeader>
                <CardContent className="p-2 md:p-4">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'Revenue']} />
                      <Bar dataKey="money" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Cars by Month</CardTitle></CardHeader>
                <CardContent className="p-2 md:p-4">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip formatter={(value: number) => [value, 'Cars']} />
                      <Bar dataKey="cars" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
};
