import { Task, WorkSession, WorkPeriod, Part } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Trash2, Plus, ChevronDown, ChevronsDownUp, ChevronsUpDown, Flag, Copy, Cpu, Key, KeyRound } from 'lucide-react';
import { formatDuration, formatCurrency, formatTime, formatTimeForInput, formatDateForInput } from '@/lib/formatTime';
import { useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { getVehicleColorScheme } from '@/lib/vehicleColors';
import { getSessionColorScheme } from '@/lib/sessionColors';
import { useIsMobile } from '@/hooks/use-mobile';
interface EditTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  onSave: (updatedTask: Task) => void;
  onDelete?: (taskId: string) => void;
  clientName?: string;
  vehicleInfo?: string;
}
const statusConfig: Record<string, { label: string; className: string }> = {
  'pending': { label: 'Pending', className: 'bg-muted text-muted-foreground' },
  'in-progress': { label: 'In Progress', className: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  'paused': { label: 'Paused', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  'completed': { label: 'Completed', className: 'bg-green-500/20 text-green-300 border-green-500/40' },
  'billed': { label: 'Billed', className: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  'paid': { label: 'Paid', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
};

export const EditTaskDialog = ({
  open,
  onOpenChange,
  task,
  onSave,
  onDelete,
  clientName,
  vehicleInfo
}: EditTaskDialogProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast } = useNotifications();
  const isMobile = useIsMobile();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set((task.sessions || []).map(s => s.id))
  );
  // Get vehicle color scheme
  const colorScheme = getVehicleColorScheme(task.vehicleId);
  // Ensure all dates are properly converted to Date objects with fallbacks
  const [sessions, setSessions] = useState<WorkSession[]>((task.sessions || []).map(session => {
    const sessionBaseDate = session.createdAt ? new Date(session.createdAt) : new Date();
    // Validate session base date
    const validSessionDate = !isNaN(sessionBaseDate.getTime()) ? sessionBaseDate : new Date();
    
    return {
      ...session,
      createdAt: validSessionDate,
      completedAt: session.completedAt ? new Date(session.completedAt) : undefined,
      periods: (session.periods || []).map(period => {
        const startTime = period.startTime ? new Date(period.startTime) : new Date(validSessionDate);
        const endTime = period.endTime ? new Date(period.endTime) : new Date(validSessionDate);
        
        // Validate and use session date as fallback if invalid
        const validStartTime = !isNaN(startTime.getTime()) ? startTime : new Date(validSessionDate);
        const validEndTime = !isNaN(endTime.getTime()) ? endTime : new Date(validSessionDate);
        
        return {
          ...period,
          startTime: validStartTime,
          endTime: validEndTime
        };
      }),
      parts: session.parts || []
    };
  }));
  
  const [editingPeriod, setEditingPeriod] = useState<{
    sessionId: string;
    periodId: string;
    field: 'startTime' | 'endTime';
    dateValue: string;
    timeValue: string;
  } | null>(null);

  const handleDeletePeriod = (sessionId: string, periodId: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const updatedPeriods = session.periods.filter(p => p.id !== periodId);
        return {
          ...session,
          periods: updatedPeriods
        };
      }
      return session;
    }));
  };
  const handlePeriodTimeChange = (
    sessionId: string, 
    periodId: string, 
    field: 'startTime' | 'endTime', 
    part: 'date' | 'time',
    value: string,
    currentPeriod: WorkPeriod
  ) => {
    // Get current values from either editing state or the period
    const currentDate = editingPeriod?.sessionId === sessionId && 
                        editingPeriod?.periodId === periodId && 
                        editingPeriod?.field === field
      ? editingPeriod.dateValue
      : formatDateForInput(currentPeriod[field]);
    
    const currentTime = editingPeriod?.sessionId === sessionId && 
                        editingPeriod?.periodId === periodId && 
                        editingPeriod?.field === field
      ? editingPeriod.timeValue
      : formatTimeForInput(currentPeriod[field]);
    
    setEditingPeriod({
      sessionId,
      periodId,
      field,
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
            // Combine date and time values into a full datetime
            const combinedDateTime = `${dateValue}T${timeValue}`;
            const newDate = new Date(combinedDateTime);
            
            // Validate datetime input
            if (isNaN(newDate.getTime())) {
              toast({
                title: "Invalid date/time",
                description: "Could not update. Please try again.",
                variant: "destructive"
              });
              return period;
            }
            
            const updated = {
              ...period,
              [field]: newDate
            };
            // Recalculate duration
            updated.duration = Math.floor((updated.endTime.getTime() - updated.startTime.getTime()) / 1000);
            
            // Check for conflicts with other periods on the same day
            const hasConflict = session.periods.some(p => {
              if (p.id === periodId) return false; // Skip self
              
              const isSameDay = 
                p.startTime.toDateString() === updated.startTime.toDateString();
              
              if (!isSameDay) return false;
              
              const newStart = updated.startTime.getTime();
              const newEnd = updated.endTime.getTime();
              const existingStart = p.startTime.getTime();
              const existingEnd = p.endTime.getTime();
              
              return (
                // Exact match
                (newStart === existingStart && newEnd === existingEnd) ||
                // Updated period overlaps with existing
                (newStart >= existingStart && newStart < existingEnd) ||
                (newEnd > existingStart && newEnd <= existingEnd) ||
                (newStart <= existingStart && newEnd >= existingEnd)
              );
            });
            
            if (hasConflict) {
              toast({
                title: "Cannot update period",
                description: "This time overlaps with another period on the same day",
                variant: "destructive"
              });
              return period; // Return unchanged
            }
            
            return updated;
          }
          return period;
        });
        return {
          ...session,
          periods: updatedPeriods
        };
      }
      return session;
    }));
    
    setEditingPeriod(null);
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    toast({
      title: "Session deleted",
      description: "Session removed successfully"
    });
  };

  const handleDeletePart = (sessionId: string, partIndex: number) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const updatedParts = session.parts.filter((_, i) => i !== partIndex);
        return {
          ...session,
          parts: updatedParts
        };
      }
      return session;
    }));
  };
  const handleUpdatePartQuantity = (sessionId: string, partIndex: number, quantity: number) => {
    if (quantity < 1) return;
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const updatedParts = [...(session.parts || [])];
        updatedParts[partIndex] = {
          ...updatedParts[partIndex],
          quantity
        };
        return {
          ...session,
          parts: updatedParts
        };
      }
      return session;
    }));
  };
  const handleUpdatePartPrice = (sessionId: string, partIndex: number, price: number) => {
    if (price < 0) return;
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const updatedParts = [...(session.parts || [])];
        updatedParts[partIndex] = {
          ...updatedParts[partIndex],
          price
        };
        return {
          ...session,
          parts: updatedParts
        };
      }
      return session;
    }));
  };

  const handleAddPeriodToSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    
    // Get the session's date (from first period or createdAt)
    const sessionDate = session.periods.length > 0 
      ? new Date(session.periods[0].startTime)
      : new Date(session.createdAt);
    
    // Find next available time slot within THIS session only
    let startHour = 9;
    let startMinute = 0;
    
    if (session.periods.length > 0) {
      // Find latest end time in this session
      const latestPeriod = session.periods.reduce((latest, period) => 
        period.endTime > latest.endTime ? period : latest
      );
      
      const latestEnd = new Date(latestPeriod.endTime);
      startHour = latestEnd.getHours();
      startMinute = latestEnd.getMinutes();
      
      // If minutes are not 0, round up to next hour
      if (startMinute > 0) {
        startHour++;
        startMinute = 0;
      }
    }
    
    const startTime = new Date(sessionDate);
    startTime.setHours(startHour, startMinute, 0, 0);
    const endTime = new Date(startTime.getTime() + 3600000); // +1 hour
    
    // Check for conflicts within THIS session only
    const hasConflict = session.periods.some(period => {
      const periodStart = period.startTime.getTime();
      const periodEnd = period.endTime.getTime();
      const newStart = startTime.getTime();
      const newEnd = endTime.getTime();
      
      return (
        (newStart >= periodStart && newStart < periodEnd) ||
        (newEnd > periodStart && newEnd <= periodEnd) ||
        (newStart <= periodStart && newEnd >= periodEnd)
      );
    });
    
    if (hasConflict) {
      toast({
        title: "Cannot add period",
        description: "Time slot conflicts with existing period in this session",
        variant: "destructive"
      });
      return;
    }
    
    const newPeriod: WorkPeriod = {
      id: `period-${Date.now()}`,
      startTime,
      endTime,
      duration: 3600
    };
    
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        return {
          ...s,
          periods: [...s.periods, newPeriod]
        };
      }
      return s;
    }));
    
    toast({
      title: "Period added",
      description: `Added ${formatTime(startTime)} - ${formatTime(endTime)}`
    });
  };

  const handleAddNewSession = () => {
    const now = new Date();
    
    // Find next available time slot across ALL sessions
    let startHour = 9;
    
    // Get all periods from today
    const todayPeriods: WorkPeriod[] = [];
    sessions.forEach(session => {
      session.periods.forEach(period => {
        if (period.startTime.toDateString() === now.toDateString()) {
          todayPeriods.push(period);
        }
      });
    });
    
    if (todayPeriods.length > 0) {
      // Find the latest end time today
      const latestPeriod = todayPeriods.reduce((latest, period) => 
        period.endTime > latest.endTime ? period : latest
      );
      
      const latestEnd = new Date(latestPeriod.endTime);
      startHour = latestEnd.getHours() + 1;
      
      // If past 6 PM, start at 9 AM
      if (startHour >= 18) {
        startHour = 9;
      }
    }
    
    const startTime = new Date(now);
    startTime.setHours(startHour, 0, 0, 0);
    const endTime = new Date(startTime.getTime() + 3600000);
    
    // Check for conflicts across all sessions on same day
    const hasConflict = todayPeriods.some(period => {
      const periodStart = period.startTime.getTime();
      const periodEnd = period.endTime.getTime();
      const newStart = startTime.getTime();
      const newEnd = endTime.getTime();
      
      return (
        (newStart >= periodStart && newStart < periodEnd) ||
        (newEnd > periodStart && newEnd <= periodEnd) ||
        (newStart <= periodStart && newEnd >= periodEnd)
      );
    });
    
    if (hasConflict) {
      toast({
        title: "Cannot create session",
        description: "Time slot conflicts with existing work today. Please manually adjust times.",
        variant: "destructive"
      });
      // Still create the session but user needs to adjust times
    }
    
    const newSession: WorkSession = {
      id: `session-${Date.now()}`,
      createdAt: new Date(),
      periods: [{
        id: `period-${Date.now()}`,
        startTime,
        endTime,
        duration: 3600
      }],
      parts: [],
      description: ''
    };
    
    setSessions(prev => [...prev, newSession]);
    
    toast({
      title: "Session created",
      description: hasConflict 
        ? "Session added with time conflict - please adjust times"
        : `New session: ${formatTime(startTime)} - ${formatTime(endTime)}`
    });
  };

  const handleAddPart = (sessionId: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const newPart: Part = {
          name: 'New Part',
          quantity: 1,
          price: 0
        };
        
        return {
          ...session,
          parts: [...(session.parts || []), newPart]
        };
      }
      return session;
    }));
  };
  const handleSave = () => {
    // Filter out sessions with no periods, parts, or description
    const validSessions = sessions.filter(s => 
      s.periods.length > 0 || 
      (s.parts && s.parts.length > 0) || 
      (s.description && s.description.trim().length > 0)
    );

    // Recalculate total time
    const totalTime = validSessions.reduce((total, session) => {
      return total + session.periods.reduce((sum, p) => sum + p.duration, 0);
    }, 0);
    const updatedTask = {
      ...task,
      sessions: validSessions,
      totalTime
    };
    onSave(updatedTask);
    toast({
      title: "Task updated",
      description: "Changes saved successfully"
    });
    onOpenChange(false);
  };
  // Helper to render period inputs (shared logic, different styling)
  const renderPeriodInputs = (session: WorkSession, period: WorkPeriod, desktop: boolean) => {
    const inputH = desktop ? 'h-10 text-sm' : 'h-9 text-sm';
    const dateW = desktop ? 'w-36 shrink-0' : 'flex-1';
    const timeW = desktop ? 'w-32 shrink-0 pr-8' : 'w-24 pr-8';
    return (
      <>
        {/* Start */}
        <div className={desktop ? "flex items-center gap-2" : ""}>
          {desktop && <span className="text-xs text-green-600 font-medium w-10 shrink-0">Start</span>}
          {!desktop && <Label className="text-xs font-semibold uppercase tracking-wide text-green-600">Start</Label>}
          <div className={`flex ${desktop ? 'gap-2' : 'gap-1'}`}>
            <Input
              type="date"
              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'startTime' ? editingPeriod.dateValue : formatDateForInput(period.startTime)}
              onChange={e => handlePeriodTimeChange(session.id, period.id, 'startTime', 'date', e.target.value, period)}
              onBlur={handlePeriodTimeBlur}
              className={`${inputH} font-medium ${dateW} shrink-0`}
            />
            <Input
              type="time"
              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'startTime' ? editingPeriod.timeValue : formatTimeForInput(period.startTime)}
              onChange={e => handlePeriodTimeChange(session.id, period.id, 'startTime', 'time', e.target.value, period)}
              onBlur={handlePeriodTimeBlur}
              className={`${inputH} ${timeW} font-medium shrink-0`}
            />
          </div>
        </div>
        {/* End */}
        <div className={desktop ? "flex items-center gap-2" : ""}>
          {desktop && <span className="text-xs text-red-600 font-medium w-10 shrink-0">End</span>}
          {!desktop && <Label className="text-xs font-semibold uppercase tracking-wide text-red-600">End</Label>}
          <div className={`flex ${desktop ? 'gap-2' : 'gap-1'}`}>
            <Input
              type="date"
              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'endTime' ? editingPeriod.dateValue : formatDateForInput(period.endTime)}
              onChange={e => handlePeriodTimeChange(session.id, period.id, 'endTime', 'date', e.target.value, period)}
              onBlur={handlePeriodTimeBlur}
              className={`${inputH} font-medium ${dateW} shrink-0`}
            />
            <Input
              type="time"
              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'endTime' ? editingPeriod.timeValue : formatTimeForInput(period.endTime)}
              onChange={e => handlePeriodTimeChange(session.id, period.id, 'endTime', 'time', e.target.value, period)}
              onBlur={handlePeriodTimeBlur}
              className={`${inputH} ${timeW} font-medium shrink-0`}
            />
          </div>
        </div>
      </>
    );
  };

  // Shared session date formatter
  const getSessionDate = (session: WorkSession) => {
    let sessionDate: Date;
    if (session.periods.length > 0 && session.periods[0].startTime) {
      sessionDate = session.periods[0].startTime;
    } else if (session.createdAt) {
      sessionDate = session.createdAt;
    } else {
      sessionDate = new Date();
    }
    if (!(sessionDate instanceof Date) || isNaN(sessionDate.getTime())) {
      sessionDate = new Date();
    }
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    }).format(sessionDate);
  };

  // Shared footer
  const renderFooter = (desktop: boolean) => (
    <DialogFooter className={`${desktop ? 'px-6 py-4' : 'px-4 py-3'} border-t bg-card/80 backdrop-blur-sm flex justify-center items-center gap-3`}>
      {onDelete && !showDeleteConfirm && (
        <Button
          variant="destructive"
          size={desktop ? "default" : "sm"}
          onClick={() => setShowDeleteConfirm(true)}
          className={!desktop ? "flex flex-col items-center justify-center py-2 px-3 h-auto leading-tight text-center" : ""}
        >
          {!desktop ? <><span className="text-xs">Delete</span><span className="text-xs">Car</span></> : "Delete Car"}
        </Button>
      )}
      {onDelete && showDeleteConfirm && (
        <div className="flex gap-2 items-center justify-center">
          <span className="text-sm text-destructive font-medium">Delete this car?</span>
          <Button variant="destructive" size="sm" onClick={() => { onDelete(task.id); onOpenChange(false); }}>Yes</Button>
          <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>No</Button>
        </div>
      )}
      {!showDeleteConfirm && (
        <>
          <Button
            variant="secondary"
            size={desktop ? "default" : "sm"}
            onClick={handleAddNewSession}
            className={!desktop ? "flex flex-col items-center justify-center py-2 px-3 h-auto leading-tight text-center" : ""}
          >
            {!desktop ? <><span className="text-xs">Add</span><span className="text-xs">Session</span></> : "Add Session"}
          </Button>
          <Button variant="outline" size={desktop ? "default" : "sm"} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size={desktop ? "default" : "sm"}
            onClick={handleSave}
            className={!desktop ? "flex flex-col items-center justify-center py-2 px-3 h-auto leading-tight text-center" : ""}
          >
            {!desktop ? <><span className="text-xs">Save</span><span className="text-xs">Changes</span></> : "Save Changes"}
          </Button>
        </>
      )}
    </DialogFooter>
  );

  // ============ MOBILE LAYOUT ============
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full h-full m-0 p-0 rounded-none max-w-none max-h-none flex flex-col inset-0">
          <DialogHeader className={`px-4 py-3 border-b ${colorScheme.gradient}`}>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
            {sessions.map((session, sessionIndex) => {
              const sessionColorScheme = getSessionColorScheme(session.id);
              const formattedDate = getSessionDate(session);
              return (
                <div key={session.id} className={`${sessionColorScheme.session} border rounded-lg p-1 space-y-1`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="font-bold text-base">Session {sessionIndex + 1}</h4>
                      <span className="text-xs text-muted-foreground">{formattedDate}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${session.isCloning ? 'text-primary' : 'text-muted-foreground/40'}`}
                        onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isCloning: !s.isCloning } : s))}
                        title="Apply cloning rate to this session"
                      >
                        <Copy className="h-3 w-3" fill={session.isCloning ? 'currentColor' : 'none'} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${session.isProgramming ? 'text-primary' : 'text-muted-foreground/40'}`}
                        onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isProgramming: !s.isProgramming } : s))}
                        title="Apply programming rate to this session"
                      >
                        <Cpu className="h-3 w-3" fill={session.isProgramming ? 'currentColor' : 'none'} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${session.isAddKey ? 'text-primary' : 'text-muted-foreground/40'}`}
                        onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isAddKey: !s.isAddKey } : s))}
                        title="Apply add key rate to this session"
                      >
                        <Key className="h-3 w-3" fill={session.isAddKey ? 'currentColor' : 'none'} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${session.isAllKeysLost ? 'text-primary' : 'text-muted-foreground/40'}`}
                        onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isAllKeysLost: !s.isAllKeysLost } : s))}
                        title="Apply all keys lost rate to this session"
                      >
                        <KeyRound className="h-3 w-3" fill={session.isAllKeysLost ? 'currentColor' : 'none'} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteSession(session.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Periods */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Work Periods</Label>
                      <Button variant="outline" size="sm" className="h-6 gap-1" onClick={() => handleAddPeriodToSession(session.id)}>
                        <Plus className="h-3 w-3" /><span className="text-xs">Add Period</span>
                      </Button>
                    </div>
                    {session.periods.map((period, periodIndex) => (
                      <div key={period.id} className={`${sessionColorScheme.period} border rounded-xl p-3 space-y-3`}>
                        {/* Header: Period N · duration · Min1hr · delete */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">Period {periodIndex + 1}</span>
                            <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{formatDuration(period.duration)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Min 1hr pill per period */}
                            <button
                              type="button"
                              onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? {
                                ...s,
                                periods: s.periods.map(p => p.id === period.id ? { ...p, chargeMinimumHour: !p.chargeMinimumHour } : p)
                              } : s))}
                              className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                                period.chargeMinimumHour
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-transparent text-muted-foreground border-border'
                              }`}
                            >
                              <Flag className="h-2.5 w-2.5" fill={period.chargeMinimumHour ? 'currentColor' : 'none'} />
                              Min 1hr
                            </button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeletePeriod(session.id, period.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {/* Start / End in 2-column grid with larger inputs */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-bold uppercase tracking-wide text-green-600">▶ Start</Label>
                            <Input
                              type="date"
                              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'startTime' ? editingPeriod.dateValue : formatDateForInput(period.startTime)}
                              onChange={e => handlePeriodTimeChange(session.id, period.id, 'startTime', 'date', e.target.value, period)}
                              onBlur={handlePeriodTimeBlur}
                              className="h-10 text-base font-medium w-full"
                            />
                            <Input
                              type="time"
                              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'startTime' ? editingPeriod.timeValue : formatTimeForInput(period.startTime)}
                              onChange={e => handlePeriodTimeChange(session.id, period.id, 'startTime', 'time', e.target.value, period)}
                              onBlur={handlePeriodTimeBlur}
                              className="h-12 text-xl font-bold w-full text-center"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-bold uppercase tracking-wide text-red-600">■ End</Label>
                            <Input
                              type="date"
                              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'endTime' ? editingPeriod.dateValue : formatDateForInput(period.endTime)}
                              onChange={e => handlePeriodTimeChange(session.id, period.id, 'endTime', 'date', e.target.value, period)}
                              onBlur={handlePeriodTimeBlur}
                              className="h-10 text-base font-medium w-full"
                            />
                            <Input
                              type="time"
                              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'endTime' ? editingPeriod.timeValue : formatTimeForInput(period.endTime)}
                              onChange={e => handlePeriodTimeChange(session.id, period.id, 'endTime', 'time', e.target.value, period)}
                              onBlur={handlePeriodTimeBlur}
                              className="h-12 text-xl font-bold w-full text-center"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Parts */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Parts</Label>
                      <Button variant="outline" size="sm" className="h-6 gap-1" onClick={() => handleAddPart(session.id)}>
                        <Plus className="h-3 w-3" /><span className="text-xs">Add Part</span>
                      </Button>
                    </div>
                    {(session.parts || []).map((part, partIndex) => (
                      <div key={partIndex} className={`${sessionColorScheme.part} border rounded-md p-1 space-y-1`}>
                        <div className="flex items-center justify-between gap-1">
                          <Input type="text" value={part.name} onChange={e => {
                            setSessions(prev => prev.map(s => {
                              if (s.id === session.id) {
                                const updatedParts = [...(s.parts || [])];
                                updatedParts[partIndex] = { ...updatedParts[partIndex], name: e.target.value };
                                return { ...s, parts: updatedParts };
                              }
                              return s;
                            }));
                          }} className="h-6 text-xs flex-1" placeholder="Part name" />
                          {/* Me / Client pill */}
                          <div className="flex bg-muted rounded-full border border-border p-0.5 gap-0.5 shrink-0">
                            <button type="button"
                              onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, parts: s.parts.map((p, i) => i === partIndex ? { ...p, providedByClient: false } : p) } : s))}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${!part.providedByClient ? 'bg-blue-600 text-white' : 'text-muted-foreground'}`}
                            >Me</button>
                            <button type="button"
                              onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, parts: s.parts.map((p, i) => i === partIndex ? { ...p, providedByClient: true } : p) } : s))}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${part.providedByClient ? 'bg-green-700 text-white' : 'text-muted-foreground'}`}
                            >Client</button>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => handleDeletePart(session.id, partIndex)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div><Label className="text-[10px]">Quantity</Label>
                            <Input type="number" min="1" value={part.quantity} onChange={e => handleUpdatePartQuantity(session.id, partIndex, parseInt(e.target.value) || 1)} className="h-7 text-xs" />
                          </div>
                          <div><Label className="text-[10px]">Price</Label>
                            <Input type="number" min="0" step="0.01" value={part.price} onChange={e => handleUpdatePartPrice(session.id, partIndex, parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} className="h-7 text-xs" />
                          </div>
                        </div>
                        <div className={`text-xs ${part.providedByClient ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>Total: {formatCurrency(part.price * part.quantity)}{part.providedByClient ? ' (client)' : ''}</div>
                      </div>
                    ))}
                  </div>
                  {/* Description */}
                  <div className="space-y-1">
                    <Label className="text-xs">Work Description</Label>
                    <Textarea value={session.description || ''} onChange={(e) => {
                      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, description: e.target.value } : s));
                    }} placeholder="Describe the work performed..." rows={3} className="text-xs resize-none" />
                  </div>
                </div>
              );
            })}
          </div>
          {renderFooter(false)}
        </DialogContent>
      </Dialog>
    );
  }

  // ============ DESKTOP LAYOUT ============
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 w-full h-full max-w-none max-h-none p-0 rounded-none border-none flex flex-col overflow-hidden">
        {/* Colorful header */}
        <div className={`px-6 py-4 shrink-0 ${colorScheme.gradient}`}>
          <DialogHeader className="p-0 border-0">
            <div className="flex items-center gap-3 flex-wrap">
              <DialogTitle className="text-xl text-white drop-shadow-sm">Edit Task</DialogTitle>
              {(clientName || task.customerName) && (
                <span className="text-white/80 text-sm font-medium">— {clientName || task.customerName}</span>
              )}
              {vehicleInfo && (
                <span className="text-white/70 text-sm">· {vehicleInfo}</span>
              )}
              {task.carVin && (
                <span className="text-white/60 text-xs font-mono">· VIN: {task.carVin.length > 11 ? task.carVin.slice(0, 11) + '…' : task.carVin}</span>
              )}
              <Badge className={`${statusConfig[task.status]?.className || 'bg-muted'} text-xs border`}>
                {statusConfig[task.status]?.label || task.status}
              </Badge>
            </div>
          </DialogHeader>
        </div>

        {/* Toolbar — collapse/expand toggle */}
        {sessions.length > 1 && (
          <div className="flex justify-end px-6 pt-3 pb-0 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (expandedSessions.size === 0) {
                  setExpandedSessions(new Set(sessions.map(s => s.id)));
                } else {
                  setExpandedSessions(new Set());
                }
              }}
              className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              {expandedSessions.size === 0 ? (
                <><ChevronsUpDown className="h-3.5 w-3.5" /> Expand All</>
              ) : (
                <><ChevronsDownUp className="h-3.5 w-3.5" /> Collapse All</>
              )}
            </Button>
          </div>
        )}

        {/* Body — scrollable session list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {sessions.map((session, sessionIndex) => {
            const sessionColorScheme = getSessionColorScheme(session.id);
            const formattedDate = getSessionDate(session);

            return (
              <Collapsible
                key={session.id}
                open={expandedSessions.has(session.id)}
                onOpenChange={(isOpen) => {
                  setExpandedSessions(prev => {
                    const next = new Set(prev);
                    if (isOpen) next.add(session.id);
                    else next.delete(session.id);
                    return next;
                  });
                }}
                className={`rounded-lg shadow-sm border ${sessionColorScheme.session}`}
              >
                {/* Session header — collapsible trigger */}
                <div className="flex items-center justify-between px-5 py-3 border-b">
                  <CollapsibleTrigger className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition-opacity">
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expandedSessions.has(session.id) ? '' : '-rotate-90'}`} />
                    <h4 className="font-semibold text-base">Session {sessionIndex + 1}</h4>
                    <span className="text-sm text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">{formattedDate}</span>
                    {/* Collapsed summary */}
                    {!expandedSessions.has(session.id) && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatDuration(session.periods.reduce((sum, p) => sum + p.duration, 0))}
                        {(session.parts || []).length > 0 && ` · ${session.parts.length} part${session.parts.length !== 1 ? 's' : ''}`}
                        {(session.parts || []).length > 0 && ` · ${formatCurrency(session.parts.reduce((sum, p) => sum + p.price * p.quantity, 0))}`}
                      </span>
                    )}
                  </CollapsibleTrigger>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${session.chargeMinimumHour ? 'text-primary' : 'text-muted-foreground/40'}`}
                      onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, chargeMinimumHour: !s.chargeMinimumHour } : s))}
                      title="Charge minimum 1 hour for this session"
                    >
                      <Flag className="h-4 w-4" fill={session.chargeMinimumHour ? 'currentColor' : 'none'} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${session.isCloning ? 'text-primary' : 'text-muted-foreground/40'}`}
                      onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isCloning: !s.isCloning } : s))}
                      title="Apply cloning rate to this session"
                    >
                      <Copy className="h-4 w-4" fill={session.isCloning ? 'currentColor' : 'none'} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${session.isProgramming ? 'text-primary' : 'text-muted-foreground/40'}`}
                      onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isProgramming: !s.isProgramming } : s))}
                      title="Apply programming rate to this session"
                    >
                      <Cpu className="h-4 w-4" fill={session.isProgramming ? 'currentColor' : 'none'} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${session.isAddKey ? 'text-primary' : 'text-muted-foreground/40'}`}
                      onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isAddKey: !s.isAddKey } : s))}
                      title="Apply add key rate to this session"
                    >
                      <Key className="h-4 w-4" fill={session.isAddKey ? 'currentColor' : 'none'} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${session.isAllKeysLost ? 'text-primary' : 'text-muted-foreground/40'}`}
                      onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, isAllKeysLost: !s.isAllKeysLost } : s))}
                      title="Apply all keys lost rate to this session"
                    >
                      <KeyRound className="h-4 w-4" fill={session.isAllKeysLost ? 'currentColor' : 'none'} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteSession(session.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <CollapsibleContent>
                  <div className="p-5 space-y-5">
                    {/* Periods section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Work Periods</Label>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => handleAddPeriodToSession(session.id)}>
                          <Plus className="h-3.5 w-3.5" /><span className="text-sm">Add Period</span>
                        </Button>
                      </div>

                      {session.periods.map((period, periodIndex) => (
                        <div key={period.id} className={`flex items-center gap-3 border rounded-md px-4 py-2.5 ${sessionColorScheme.period}`}>
                          <span className="text-sm font-medium text-muted-foreground w-16 shrink-0">Period {periodIndex + 1}</span>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs text-muted-foreground shrink-0">Start</span>
                            <Input
                              type="date"
                              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'startTime' ? editingPeriod.dateValue : formatDateForInput(period.startTime)}
                              onChange={e => handlePeriodTimeChange(session.id, period.id, 'startTime', 'date', e.target.value, period)}
                              onBlur={handlePeriodTimeBlur}
                              className="h-9 text-sm font-medium flex-1 min-w-0"
                            />
                            <Input
                              type="time"
                              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'startTime' ? editingPeriod.timeValue : formatTimeForInput(period.startTime)}
                              onChange={e => handlePeriodTimeChange(session.id, period.id, 'startTime', 'time', e.target.value, period)}
                              onBlur={handlePeriodTimeBlur}
                              className="h-9 text-sm w-28 font-medium"
                            />
                            <span className="text-muted-foreground mx-1">→</span>
                            <span className="text-xs text-muted-foreground shrink-0">End</span>
                            <Input
                              type="date"
                              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'endTime' ? editingPeriod.dateValue : formatDateForInput(period.endTime)}
                              onChange={e => handlePeriodTimeChange(session.id, period.id, 'endTime', 'date', e.target.value, period)}
                              onBlur={handlePeriodTimeBlur}
                              className="h-9 text-sm font-medium flex-1 min-w-0"
                            />
                            <Input
                              type="time"
                              value={editingPeriod?.sessionId === session.id && editingPeriod?.periodId === period.id && editingPeriod?.field === 'endTime' ? editingPeriod.timeValue : formatTimeForInput(period.endTime)}
                              onChange={e => handlePeriodTimeChange(session.id, period.id, 'endTime', 'time', e.target.value, period)}
                              onBlur={handlePeriodTimeBlur}
                              className="h-9 text-sm w-28 font-medium"
                            />
                          </div>
                          <span className="text-sm font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full shrink-0">
                            {formatDuration(period.duration)}
                          </span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDeletePeriod(session.id, period.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Parts section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Parts</Label>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => handleAddPart(session.id)}>
                          <Plus className="h-3.5 w-3.5" /><span className="text-sm">Add Part</span>
                        </Button>
                      </div>

                      {(session.parts || []).length > 0 && (
                        <div className="border rounded-md overflow-hidden">
                          <div className={`grid grid-cols-[160px_60px_90px_70px_1fr_80px_36px] gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${sessionColorScheme.part}`}>
                            <span>Name</span>
                            <span>Qty</span>
                            <span>Price</span>
                            <span>Total</span>
                            <span>Description</span>
                            <span className="text-center">By</span>
                            <span></span>
                          </div>
                          {(session.parts || []).map((part, partIndex) => (
                            <div key={partIndex} className={`grid grid-cols-[160px_60px_90px_70px_1fr_80px_36px] gap-2 px-4 py-2 items-center border-t ${sessionColorScheme.part}`}>
                              <Input type="text" value={part.name} onChange={e => {
                                setSessions(prev => prev.map(s => {
                                  if (s.id === session.id) {
                                    const updatedParts = [...(s.parts || [])];
                                    updatedParts[partIndex] = { ...updatedParts[partIndex], name: e.target.value };
                                    return { ...s, parts: updatedParts };
                                  }
                                  return s;
                                }));
                              }} className="h-9 text-sm" placeholder="Part name" />
                              <Input type="number" min="1" value={part.quantity} onChange={e => handleUpdatePartQuantity(session.id, partIndex, parseInt(e.target.value) || 1)} className="h-9 text-sm" />
                              <Input type="number" min="0" step="0.01" value={part.price} onChange={e => handleUpdatePartPrice(session.id, partIndex, parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} className="h-9 text-sm" />
                              <span className={`text-sm font-medium ${part.providedByClient ? 'line-through text-muted-foreground' : ''}`}>{formatCurrency(part.price * part.quantity)}</span>
                              <Input type="text" value={part.description || ''} onChange={e => {
                                setSessions(prev => prev.map(s => {
                                  if (s.id === session.id) {
                                    const updatedParts = [...(s.parts || [])];
                                    updatedParts[partIndex] = { ...updatedParts[partIndex], description: e.target.value };
                                    return { ...s, parts: updatedParts };
                                  }
                                  return s;
                                }));
                              }} className="h-9 text-sm" placeholder="Optional" />
                              {/* Me / Client pill */}
                              <div className="flex bg-muted rounded-full border border-border p-0.5 gap-0.5 w-fit">
                                <button
                                  type="button"
                                  onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, parts: s.parts.map((p, i) => i === partIndex ? { ...p, providedByClient: false } : p) } : s))}
                                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${!part.providedByClient ? 'bg-blue-600 text-white' : 'text-muted-foreground'}`}
                                >Me</button>
                                <button
                                  type="button"
                                  onClick={() => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, parts: s.parts.map((p, i) => i === partIndex ? { ...p, providedByClient: true } : p) } : s))}
                                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${part.providedByClient ? 'bg-green-700 text-white' : 'text-muted-foreground'}`}
                                >Client</button>
                              </div>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeletePart(session.id, partIndex)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">Work Description</Label>
                      <Textarea
                        value={session.description || ''}
                        onChange={(e) => {
                          setSessions(prev => prev.map(s => s.id === session.id ? { ...s, description: e.target.value } : s));
                        }}
                        placeholder="Describe the work performed..."
                        rows={3}
                        className="text-sm resize-none"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>

        {renderFooter(true)}
      </DialogContent>
    </Dialog>
  );
};