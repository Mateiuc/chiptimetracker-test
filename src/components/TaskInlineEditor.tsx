import { Task, WorkSession, WorkPeriod, Part } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Trash2, Plus, ChevronDown, ChevronsDownUp, ChevronsUpDown, Flag, Copy, Cpu, Key, KeyRound } from 'lucide-react';
import { formatDuration, formatCurrency, formatTime, formatTimeForInput, formatDateForInput } from '@/lib/formatTime';
import { useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { getSessionColorScheme } from '@/lib/sessionColors';

interface TaskInlineEditorProps {
  task: Task;
  onSave: (updatedTask: Task) => void;
  onCancel: () => void;
  onDelete?: (taskId: string) => void;
}

export const TaskInlineEditor = ({ task, onSave, onCancel, onDelete }: TaskInlineEditorProps) => {
  const { toast } = useNotifications();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set((task.sessions || []).map(s => s.id))
  );

  const [sessions, setSessions] = useState<WorkSession[]>((task.sessions || []).map(session => {
    const sessionBaseDate = session.createdAt ? new Date(session.createdAt) : new Date();
    const validSessionDate = !isNaN(sessionBaseDate.getTime()) ? sessionBaseDate : new Date();
    return {
      ...session,
      createdAt: validSessionDate,
      completedAt: session.completedAt ? new Date(session.completedAt) : undefined,
      periods: (session.periods || []).map(period => {
        const startTime = period.startTime ? new Date(period.startTime) : new Date(validSessionDate);
        const endTime = period.endTime ? new Date(period.endTime) : new Date(validSessionDate);
        const validStartTime = !isNaN(startTime.getTime()) ? startTime : new Date(validSessionDate);
        const validEndTime = !isNaN(endTime.getTime()) ? endTime : new Date(validSessionDate);
        return { ...period, startTime: validStartTime, endTime: validEndTime };
      }),
      parts: session.parts || []
    };
  }));

  const [editingPeriod, setEditingPeriod] = useState<{
    sessionId: string; periodId: string; field: 'startTime' | 'endTime';
    dateValue: string; timeValue: string;
  } | null>(null);

  const handleDeletePeriod = (sessionId: string, periodId: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) return { ...session, periods: session.periods.filter(p => p.id !== periodId) };
      return session;
    }));
  };

  const handlePeriodTimeChange = (
    sessionId: string, periodId: string, field: 'startTime' | 'endTime',
    part: 'date' | 'time', value: string, currentPeriod: WorkPeriod
  ) => {
    const currentDate = editingPeriod?.sessionId === sessionId && editingPeriod?.periodId === periodId && editingPeriod?.field === field
      ? editingPeriod.dateValue : formatDateForInput(currentPeriod[field]);
    const currentTime = editingPeriod?.sessionId === sessionId && editingPeriod?.periodId === periodId && editingPeriod?.field === field
      ? editingPeriod.timeValue : formatTimeForInput(currentPeriod[field]);
    setEditingPeriod({
      sessionId, periodId, field,
      dateValue: part === 'date' ? value : currentDate,
      timeValue: part === 'time' ? value : currentTime
    });
  };

  const handlePeriodTimeBlur = () => {
    if (!editingPeriod) return;
    const { sessionId, periodId, field, dateValue, timeValue } = editingPeriod;
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const updatedPeriods = session.periods.map(period => {
          if (period.id === periodId) {
            const newDate = new Date(`${dateValue}T${timeValue}`);
            if (isNaN(newDate.getTime())) {
              toast({ title: "Invalid date/time", description: "Could not update.", variant: "destructive" });
              return period;
            }
            const updated = { ...period, [field]: newDate };
            updated.duration = Math.floor((updated.endTime.getTime() - updated.startTime.getTime()) / 1000);
            const hasConflict = session.periods.some(p => {
              if (p.id === periodId) return false;
              if (p.startTime.toDateString() !== updated.startTime.toDateString()) return false;
              const nS = updated.startTime.getTime(), nE = updated.endTime.getTime();
              const eS = p.startTime.getTime(), eE = p.endTime.getTime();
              return (nS === eS && nE === eE) || (nS >= eS && nS < eE) || (nE > eS && nE <= eE) || (nS <= eS && nE >= eE);
            });
            if (hasConflict) {
              toast({ title: "Cannot update period", description: "Overlaps with another period", variant: "destructive" });
              return period;
            }
            return updated;
          }
          return period;
        });
        return { ...session, periods: updatedPeriods };
      }
      return session;
    }));
    setEditingPeriod(null);
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    toast({ title: "Session deleted" });
  };

  const handleDeletePart = (sessionId: string, partIndex: number) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) return { ...session, parts: session.parts.filter((_, i) => i !== partIndex) };
      return session;
    }));
  };

  const handleUpdatePartQuantity = (sessionId: string, partIndex: number, quantity: number) => {
    if (quantity < 1) return;
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const updatedParts = [...(session.parts || [])];
        updatedParts[partIndex] = { ...updatedParts[partIndex], quantity };
        return { ...session, parts: updatedParts };
      }
      return session;
    }));
  };

  const handleUpdatePartPrice = (sessionId: string, partIndex: number, price: number) => {
    if (price < 0) return;
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const updatedParts = [...(session.parts || [])];
        updatedParts[partIndex] = { ...updatedParts[partIndex], price };
        return { ...session, parts: updatedParts };
      }
      return session;
    }));
  };

  const handleAddPeriodToSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const sessionDate = session.periods.length > 0 ? new Date(session.periods[0].startTime) : new Date(session.createdAt);
    let startHour = 9, startMinute = 0;
    if (session.periods.length > 0) {
      const latestPeriod = session.periods.reduce((l, p) => p.endTime > l.endTime ? p : l);
      const latestEnd = new Date(latestPeriod.endTime);
      startHour = latestEnd.getHours();
      startMinute = latestEnd.getMinutes();
      if (startMinute > 0) { startHour++; startMinute = 0; }
    }
    const startTime = new Date(sessionDate);
    startTime.setHours(startHour, startMinute, 0, 0);
    const endTime = new Date(startTime.getTime() + 3600000);
    const hasConflict = session.periods.some(p => {
      const pS = p.startTime.getTime(), pE = p.endTime.getTime(), nS = startTime.getTime(), nE = endTime.getTime();
      return (nS >= pS && nS < pE) || (nE > pS && nE <= pE) || (nS <= pS && nE >= pE);
    });
    if (hasConflict) {
      toast({ title: "Cannot add period", description: "Time slot conflicts", variant: "destructive" });
      return;
    }
    const newPeriod: WorkPeriod = { id: `period-${Date.now()}`, startTime, endTime, duration: 3600 };
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, periods: [...s.periods, newPeriod] } : s));
    toast({ title: "Period added", description: `${formatTime(startTime)} - ${formatTime(endTime)}` });
  };

  const handleAddNewSession = () => {
    const now = new Date();
    let startHour = 9;
    const todayPeriods: WorkPeriod[] = [];
    sessions.forEach(s => s.periods.forEach(p => { if (p.startTime.toDateString() === now.toDateString()) todayPeriods.push(p); }));
    if (todayPeriods.length > 0) {
      const latest = todayPeriods.reduce((l, p) => p.endTime > l.endTime ? p : l);
      startHour = new Date(latest.endTime).getHours() + 1;
      if (startHour >= 18) startHour = 9;
    }
    const startTime = new Date(now); startTime.setHours(startHour, 0, 0, 0);
    const endTime = new Date(startTime.getTime() + 3600000);
    const hasConflict = todayPeriods.some(p => {
      const pS = p.startTime.getTime(), pE = p.endTime.getTime(), nS = startTime.getTime(), nE = endTime.getTime();
      return (nS >= pS && nS < pE) || (nE > pS && nE <= pE) || (nS <= pS && nE >= pE);
    });
    const newSession: WorkSession = {
      id: `session-${Date.now()}`, createdAt: new Date(),
      periods: [{ id: `period-${Date.now()}`, startTime, endTime, duration: 3600 }],
      parts: [], description: ''
    };
    setSessions(prev => [...prev, newSession]);
    toast({ title: "Session created", description: hasConflict ? "Time conflict - adjust times" : `${formatTime(startTime)} - ${formatTime(endTime)}` });
  };

  const handleAddPart = (sessionId: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) return { ...session, parts: [...(session.parts || []), { name: 'New Part', quantity: 1, price: 0 }] };
      return session;
    }));
  };

  const handleSave = () => {
    const validSessions = sessions.filter(s => s.periods.length > 0 || (s.parts && s.parts.length > 0) || (s.description && s.description.trim().length > 0));
    const totalTime = validSessions.reduce((t, s) => t + s.periods.reduce((sum, p) => sum + p.duration, 0), 0);
    onSave({ ...task, sessions: validSessions, totalTime });
    toast({ title: "Task updated", description: "Changes saved successfully" });
  };

  const getSessionDate = (session: WorkSession) => {
    let d: Date;
    if (session.periods.length > 0 && session.periods[0].startTime) d = session.periods[0].startTime;
    else if (session.createdAt) d = session.createdAt;
    else d = new Date();
    if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
    return new Intl.DateTimeFormat('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).format(d);
  };

  return (
    <div className="mt-2 border-t pt-3 space-y-3" onClick={e => e.stopPropagation()}>
      {/* Toolbar */}
      {sessions.length > 1 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm"
            onClick={() => setExpandedSessions(expandedSessions.size === 0 ? new Set(sessions.map(s => s.id)) : new Set())}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            {expandedSessions.size === 0 ? <><ChevronsUpDown className="h-3.5 w-3.5" /> Expand All</> : <><ChevronsDownUp className="h-3.5 w-3.5" /> Collapse All</>}
          </Button>
        </div>
      )}

      {/* Sessions */}
      {sessions.map((session, sessionIndex) => {
        const sc = getSessionColorScheme(session.id);
        const formattedDate = getSessionDate(session);
        return (
          <Collapsible key={session.id} open={expandedSessions.has(session.id)}
            onOpenChange={(isOpen) => {
              setExpandedSessions(prev => {
                const next = new Set(prev);
                if (isOpen) next.add(session.id); else next.delete(session.id);
                return next;
              });
            }}
            className={`rounded-lg shadow-sm border ${sc.session}`}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <CollapsibleTrigger className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity">
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expandedSessions.has(session.id) ? '' : '-rotate-90'}`} />
                <h4 className="font-semibold text-sm">Session {sessionIndex + 1}</h4>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{formattedDate}</span>
                {!expandedSessions.has(session.id) && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDuration(session.periods.reduce((sum, p) => sum + p.duration, 0))}
                    {(session.parts || []).length > 0 && ` · ${session.parts.length} part${session.parts.length !== 1 ? 's' : ''}`}
                    {(session.parts || []).length > 0 && ` · ${formatCurrency(session.parts.reduce((sum, p) => sum + p.price * p.quantity, 0))}`}
                  </span>
                )}
              </CollapsibleTrigger>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${session.chargeMinimumHour ? 'text-primary' : 'text-muted-foreground/40'}`}
                  onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, chargeMinimumHour: !s.chargeMinimumHour } : s))}
                  title="Charge minimum 1 hour for this session"
                >
                  <Flag className="h-3.5 w-3.5" fill={session.chargeMinimumHour ? 'currentColor' : 'none'} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${session.isCloning ? 'text-primary' : 'text-muted-foreground/40'}`}
                  onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isCloning: !s.isCloning } : s))}
                  title="Apply cloning rate to this session"
                >
                  <Copy className="h-3.5 w-3.5" fill={session.isCloning ? 'currentColor' : 'none'} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${session.isProgramming ? 'text-primary' : 'text-muted-foreground/40'}`}
                  onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isProgramming: !s.isProgramming } : s))}
                  title="Apply programming rate to this session"
                >
                  <Cpu className="h-3.5 w-3.5" fill={session.isProgramming ? 'currentColor' : 'none'} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${session.isAddKey ? 'text-primary' : 'text-muted-foreground/40'}`}
                  onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isAddKey: !s.isAddKey } : s))}
                  title="Apply add key rate to this session"
                >
                  <Key className="h-3.5 w-3.5" fill={session.isAddKey ? 'currentColor' : 'none'} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${session.isAllKeysLost ? 'text-primary' : 'text-muted-foreground/40'}`}
                  onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isAllKeysLost: !s.isAllKeysLost } : s))}
                  title="Apply all keys lost rate to this session"
                >
                  <KeyRound className="h-3.5 w-3.5" fill={session.isAllKeysLost ? 'currentColor' : 'none'} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteSession(session.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <CollapsibleContent>
              <div className="p-4 space-y-4">
                {/* Periods */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Work Periods</Label>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleAddPeriodToSession(session.id)}>
                      <Plus className="h-3 w-3" /> Add Period
                    </Button>
                  </div>
                  {session.periods.map((period, periodIndex) => (
                    <div key={period.id} className={`flex items-center gap-2 border rounded-md px-3 py-2 ${sc.period}`}>
                      <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Period {periodIndex + 1}</span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-[10px] text-green-600 shrink-0">Start</span>
                        <Input type="date"
                          value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'startTime' ? editingPeriod.dateValue : formatDateForInput(period.startTime)}
                          onChange={e => handlePeriodTimeChange(session.id, period.id, 'startTime', 'date', e.target.value, period)}
                          onBlur={handlePeriodTimeBlur}
                          className="h-8 text-xs font-medium flex-1 min-w-0"
                        />
                        <Input type="time"
                          value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'startTime' ? editingPeriod.timeValue : formatTimeForInput(period.startTime)}
                          onChange={e => handlePeriodTimeChange(session.id, period.id, 'startTime', 'time', e.target.value, period)}
                          onBlur={handlePeriodTimeBlur}
                          className="h-8 text-xs w-24 font-medium"
                        />
                        <span className="text-muted-foreground text-xs">→</span>
                        <span className="text-[10px] text-red-600 shrink-0">End</span>
                        <Input type="date"
                          value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'endTime' ? editingPeriod.dateValue : formatDateForInput(period.endTime)}
                          onChange={e => handlePeriodTimeChange(session.id, period.id, 'endTime', 'date', e.target.value, period)}
                          onBlur={handlePeriodTimeBlur}
                          className="h-8 text-xs font-medium flex-1 min-w-0"
                        />
                        <Input type="time"
                          value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'endTime' ? editingPeriod.timeValue : formatTimeForInput(period.endTime)}
                          onChange={e => handlePeriodTimeChange(session.id, period.id, 'endTime', 'time', e.target.value, period)}
                          onBlur={handlePeriodTimeBlur}
                          className="h-8 text-xs w-24 font-medium"
                        />
                      </div>
                      <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">{formatDuration(period.duration)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDeletePeriod(session.id, period.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Parts */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Parts</Label>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleAddPart(session.id)}>
                      <Plus className="h-3 w-3" /> Add Part
                    </Button>
                  </div>
                  {(session.parts || []).length > 0 && (
                    <div className="border rounded-md overflow-hidden">
                      <div className={`grid grid-cols-[140px_50px_80px_65px_1fr_76px_32px] gap-2 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ${sc.part}`}>
                        <span>Name</span><span>Qty</span><span>Price</span><span>Total</span><span>Description</span><span className="text-center">By</span><span></span>
                      </div>
                      {(session.parts || []).map((part, partIndex) => (
                        <div key={partIndex} className={`grid grid-cols-[140px_50px_80px_65px_1fr_76px_32px] gap-2 px-3 py-1.5 items-center border-t ${sc.part}`}>
                          <Input type="text" value={part.name} onChange={e => {
                            setSessions(prev => prev.map(s => {
                              if (s.id === session.id) {
                                const up = [...(s.parts || [])];
                                up[partIndex] = { ...up[partIndex], name: e.target.value };
                                return { ...s, parts: up };
                              }
                              return s;
                            }));
                          }} className="h-8 text-xs" placeholder="Part name" />
                          <Input type="number" min="1" value={part.quantity} onChange={e => handleUpdatePartQuantity(session.id, partIndex, parseInt(e.target.value) || 1)} className="h-8 text-xs" />
                          <Input type="number" min="0" step="0.01" value={part.price} onChange={e => handleUpdatePartPrice(session.id, partIndex, parseFloat(e.target.value) || 0)} onFocus={e => e.target.select()} className="h-8 text-xs" />
                          <span className={`text-xs font-medium ${part.providedByClient ? 'line-through text-muted-foreground' : ''}`}>{formatCurrency(part.price * part.quantity)}</span>
                          <Input type="text" value={part.description || ''} onChange={e => {
                            setSessions(prev => prev.map(s => {
                              if (s.id === session.id) {
                                const up = [...(s.parts || [])];
                                up[partIndex] = { ...up[partIndex], description: e.target.value };
                                return { ...s, parts: up };
                              }
                              return s;
                            }));
                          }} className="h-8 text-xs" placeholder="Optional" />
                          {/* Me / Client pill */}
                          <div className="flex bg-muted rounded-full border border-border p-0.5 gap-0.5 w-fit">
                            <button type="button"
                              onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, parts: s.parts.map((p, i) => i === partIndex ? { ...p, providedByClient: false } : p) } : s))}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${!part.providedByClient ? 'bg-blue-600 text-white' : 'text-muted-foreground'}`}
                            >Me</button>
                            <button type="button"
                              onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, parts: s.parts.map((p, i) => i === partIndex ? { ...p, providedByClient: true } : p) } : s))}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${part.providedByClient ? 'bg-green-700 text-white' : 'text-muted-foreground'}`}
                            >Client</button>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeletePart(session.id, partIndex)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Work Description</Label>
                  <Textarea value={session.description || ''} onChange={e => {
                    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, description: e.target.value } : s));
                  }} placeholder="Describe the work performed..." rows={2} className="text-xs resize-none" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="flex items-center gap-2">
          {onDelete && !showDeleteConfirm && (
            <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => setShowDeleteConfirm(true)}>Delete Car</Button>
          )}
          {onDelete && showDeleteConfirm && (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-destructive font-medium">Delete this car?</span>
              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => { onDelete(task.id); }}>Yes</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowDeleteConfirm(false)}>No</Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleAddNewSession}>
            <Plus className="h-3 w-3 mr-1" /> Add Session
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSave}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
};
