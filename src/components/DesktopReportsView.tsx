import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import { CalendarIcon, RotateCcw, ArrowUp, ArrowDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Task, Client, Vehicle, Settings } from '@/types';
import { formatDuration, formatCurrency } from '@/lib/formatTime';

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#6366f1',
  '#14b8a6', '#f97316', '#84cc16', '#a855f7',
];

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  billed: '#a855f7',
  paid: '#10b981',
  pending: '#eab308',
  'in-progress': '#3b82f6',
  paused: '#f97316',
};

const statusBadgeColors: Record<string, string> = {
  'pending': 'bg-yellow-500/20 text-yellow-700 border-yellow-500/40',
  'in-progress': 'bg-blue-500/20 text-blue-700 border-blue-500/40',
  'paused': 'bg-orange-500/20 text-orange-700 border-orange-500/40',
  'completed': 'bg-green-500/20 text-green-700 border-green-500/40',
  'billed': 'bg-purple-500/20 text-purple-700 border-purple-500/40',
  'paid': 'bg-emerald-500/20 text-emerald-700 border-emerald-500/40',
};

interface DrillRow {
  id: string;
  date: Date;
  client: string;
  vehicle: string;
  description: string;
  status: string;
  timeWorked: number;
  cost: number;
}

interface DrillState {
  label: string;
  rows: DrillRow[];
}

interface DesktopReportsViewProps {
  tasks: Task[];
  clients: Client[];
  vehicles: Vehicle[];
  settings: Settings;
}

const DrillTable = ({ drill, onClose }: { drill: DrillState; onClose: () => void }) => (
  <div className="mt-3 border-t pt-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium">↳ {drill.label} ({drill.rows.length} tasks)</span>
      <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
        <X className="h-3 w-3" />
      </Button>
    </div>
    <div className="max-h-[220px] overflow-y-auto text-xs">
      <table className="w-full">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1">Date</th>
            <th className="text-left py-1">Client</th>
            <th className="text-left py-1">Vehicle</th>
            <th className="text-left py-1">Status</th>
            <th className="text-right py-1">Time</th>
            <th className="text-right py-1">Cost</th>
          </tr>
        </thead>
        <tbody>
          {drill.rows.map(r => (
            <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-1 whitespace-nowrap">{format(r.date, 'MMM d, yy')}</td>
              <td className="py-1">{r.client}</td>
              <td className="py-1 max-w-[150px] truncate">{r.vehicle}</td>
              <td className="py-1">
                <span className={cn('px-1.5 py-0.5 rounded text-[10px] capitalize font-medium border',
                  statusBadgeColors[r.status] || '')}>
                  {r.status}
                </span>
              </td>
              <td className="py-1 text-right font-mono">{formatDuration(r.timeWorked)}</td>
              <td className="py-1 text-right font-mono font-semibold">{formatCurrency(r.cost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td colSpan={4} className="py-1 text-muted-foreground">Total</td>
            <td className="py-1 text-right font-mono">{formatDuration(drill.rows.reduce((s, r) => s + r.timeWorked, 0))}</td>
            <td className="py-1 text-right font-mono">{formatCurrency(drill.rows.reduce((s, r) => s + r.cost, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
);

export const DesktopReportsView = ({ tasks, clients, vehicles, settings }: DesktopReportsViewProps) => {
  const [rptClient, setRptClient] = useState<string>('all');
  const [rptVehicle, setRptVehicle] = useState<string>('all');
  const [rptDateFrom, setRptDateFrom] = useState<Date | undefined>();
  const [rptDateTo, setRptDateTo] = useState<Date | undefined>();
  const [rptShowCompleted, setRptShowCompleted] = useState(true);
  const [rptShowBilled, setRptShowBilled] = useState(true);
  const [rptShowPaid, setRptShowPaid] = useState(true);
  const [rptShowActive, setRptShowActive] = useState(true);
  const [sortField, setSortField] = useState<'date' | 'cost' | 'client' | 'status'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [drillRevTime, setDrillRevTime] = useState<DrillState | null>(null);
  const [drillClient, setDrillClient] = useState<DrillState | null>(null);
  const [drillVehicle, setDrillVehicle] = useState<DrillState | null>(null);
  const [drillStatus, setDrillStatus] = useState<DrillState | null>(null);
  const [drillHours, setDrillHours] = useState<DrillState | null>(null);
  const [drillCars, setDrillCars] = useState<DrillState | null>(null);

  const resetFilters = () => {
    setRptClient('all'); setRptVehicle('all');
    setRptDateFrom(undefined); setRptDateTo(undefined);
    setRptShowCompleted(true); setRptShowBilled(true); setRptShowPaid(true); setRptShowActive(true);
    setDrillRevTime(null); setDrillClient(null); setDrillVehicle(null);
    setDrillStatus(null); setDrillHours(null); setDrillCars(null);
  };

  const getTaskCost = (task: Task) => {
    // importedSalary = already the final revenue, return exactly as stored
    if (task.importedSalary != null) return task.importedSalary;
    const client = clients.find(c => c.id === task.clientId);
    const hourlyRate = client?.hourlyRate || settings.defaultHourlyRate;
    const cloningRate = client?.cloningRate || (settings as any).defaultCloningRate || 0;
    const programmingRate = client?.programmingRate || (settings as any).defaultProgrammingRate || 0;
    const addKeyRate = client?.addKeyRate || (settings as any).defaultAddKeyRate || 0;
    const allKeysLostRate = client?.allKeysLostRate || (settings as any).defaultAllKeysLostRate || 0;
    let baseLabor = 0, totalMinHourAdj = 0, totalCloning = 0, totalProgramming = 0, totalAddKey = 0, totalAllKeysLost = 0;
    (task.sessions || []).forEach(session => {
      const dur = session.periods.reduce((sum, p) => sum + p.duration, 0);
      baseLabor += (dur / 3600) * hourlyRate;
      // chargeMinimumHour: rounds up to 1 hour ONLY if session is under 60 min
      if (session.chargeMinimumHour && dur < 3600) totalMinHourAdj += ((3600 - dur) / 3600) * hourlyRate;
      if (session.isCloning && cloningRate > 0) totalCloning += cloningRate;
      if (session.isProgramming && programmingRate > 0) totalProgramming += programmingRate;
      if (session.isAddKey && addKeyRate > 0) totalAddKey += addKeyRate;
      if (session.isAllKeysLost && allKeysLostRate > 0) totalAllKeysLost += allKeysLostRate;
    });
    const laborCost = baseLabor + totalMinHourAdj + totalCloning + totalProgramming + totalAddKey + totalAllKeysLost;
    const partsCost = (task.sessions || []).reduce((total, session) =>
      total + (session.parts || []).reduce((sum, part) => sum + part.price * part.quantity, 0), 0);
    return laborCost + partsCost;
  };

  const getTaskSeconds = (task: Task) =>
    (task.sessions || []).reduce((total, session) =>
      total + session.periods.reduce((sum, p) => sum + p.duration, 0), 0);

  const toDrillRow = (t: Task): DrillRow => ({
    id: t.id,
    date: new Date(t.createdAt),
    client: clients.find(c => c.id === t.clientId)?.name || 'Unknown',
    vehicle: (() => {
      const v = vehicles.find(v => v.id === t.vehicleId);
      return v ? [v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin : 'Unknown';
    })(),
    description: t.sessions?.find(s => s.description)?.description || '—',
    status: t.status,
    timeWorked: getTaskSeconds(t),
    cost: getTaskCost(t),
  });

  const availableVehicles = useMemo(() => {
    if (rptClient === 'all') return vehicles;
    return vehicles.filter(v => v.clientId === rptClient);
  }, [vehicles, rptClient]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (rptClient !== 'all' && t.clientId !== rptClient) return false;
      if (rptVehicle !== 'all' && t.vehicleId !== rptVehicle) return false;
      const d = new Date(t.createdAt);
      if (rptDateFrom && d < rptDateFrom) return false;
      if (rptDateTo) {
        const endOfDay = new Date(rptDateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (d > endOfDay) return false;
      }
      if (t.status === 'completed' && !rptShowCompleted) return false;
      if (t.status === 'billed' && !rptShowBilled) return false;
      if (t.status === 'paid' && !rptShowPaid) return false;
      if (['pending', 'in-progress', 'paused'].includes(t.status) && !rptShowActive) return false;
      return true;
    });
  }, [tasks, rptClient, rptVehicle, rptDateFrom, rptDateTo, rptShowCompleted, rptShowBilled, rptShowPaid, rptShowActive]);

  const revenueOverTime = useMemo(() => {
    const monthMap: Record<string, number> = {};
    filteredTasks.forEach(t => {
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] || 0) + getTaskCost(t);
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue: Math.round(revenue * 100) / 100 }));
  }, [filteredTasks]);

  const revenueByClient = useMemo(() => {
    const map: Record<string, { clientId: string; name: string; revenue: number }> = {};
    filteredTasks.forEach(t => {
      const client = clients.find(c => c.id === t.clientId);
      const key = t.clientId || 'unknown';
      if (!map[key]) map[key] = { clientId: key, name: client?.name || 'Unknown', revenue: 0 };
      map[key].revenue += getTaskCost(t);
    });
    return Object.values(map)
      .map(d => ({ ...d, revenue: Math.round(d.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredTasks, clients]);

  const revenueByVehicle = useMemo(() => {
    const map: Record<string, { vehicleId: string; label: string; revenue: number }> = {};
    filteredTasks.forEach(t => {
      const v = vehicles.find(v => v.id === t.vehicleId);
      const label = v ? [v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin : 'Unknown';
      if (!map[t.vehicleId]) map[t.vehicleId] = { vehicleId: t.vehicleId, label, revenue: 0 };
      map[t.vehicleId].revenue += getTaskCost(t);
    });
    return Object.values(map)
      .map(d => ({ ...d, revenue: Math.round(d.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);
  }, [filteredTasks, vehicles]);

  const tasksByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    filteredTasks.forEach(t => { map[t.status] = (map[t.status] || 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      rawStatus: status,
      value: count,
      color: STATUS_COLORS[status] || '#94a3b8',
    }));
  }, [filteredTasks]);

  const hoursOverTime = useMemo(() => {
    const monthMap: Record<string, number> = {};
    filteredTasks.forEach(t => {
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] || 0) + getTaskSeconds(t);
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, seconds]) => ({ month, hours: Math.round((seconds / 3600) * 100) / 100 }));
  }, [filteredTasks]);

  const carsOverTime = useMemo(() => {
    const monthMap: Record<string, Set<string>> = {};
    filteredTasks.forEach(t => {
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = new Set();
      monthMap[key].add(t.vehicleId);
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, set]) => ({ month, cars: set.size }));
  }, [filteredTasks]);

  const detailData = useMemo(() => {
    const data = filteredTasks.map(toDrillRow);
    data.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'date': return (a.date.getTime() - b.date.getTime()) * dir;
        case 'cost': return (a.cost - b.cost) * dir;
        case 'client': return a.client.localeCompare(b.client) * dir;
        case 'status': return a.status.localeCompare(b.status) * dir;
        default: return 0;
      }
    });
    return data;
  }, [filteredTasks, clients, vehicles, sortField, sortDir]);

  const totalRevenue = useMemo(() => filteredTasks.reduce((s, t) => s + getTaskCost(t), 0), [filteredTasks]);
  const totalHours = useMemo(() => filteredTasks.reduce((s, t) => s + getTaskSeconds(t), 0) / 3600, [filteredTasks]);
  const unpaidBalance = useMemo(() => tasks.filter(t => t.status === 'billed').reduce((s, t) => s + getTaskCost(t), 0), [tasks]);

  const drillRowsForMonth = (month: string) =>
    filteredTasks.filter(t => {
      const d = new Date(t.createdAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month;
    }).map(toDrillRow);

  const handleRevTimeClick = (e: any) => {
    const month = e?.activeLabel; if (!month) return;
    setDrillRevTime({ label: `Revenue — ${month}`, rows: drillRowsForMonth(month) });
  };
  const handleClientClick = (e: any) => {
    const p = e?.activePayload?.[0]?.payload;
    if (!p?.clientId) return;
    setDrillClient({ label: `Client — ${p.name}`, rows: filteredTasks.filter(t => t.clientId === p.clientId).map(toDrillRow) });
  };
  const handleVehicleClick = (e: any) => {
    const p = e?.activePayload?.[0]?.payload;
    if (!p?.vehicleId) return;
    setDrillVehicle({ label: `Vehicle — ${p.label}`, rows: filteredTasks.filter(t => t.vehicleId === p.vehicleId).map(toDrillRow) });
  };
  const handleStatusClick = (e: any) => {
    if (!e?.rawStatus) return;
    setDrillStatus({ label: `Status — ${e.name}`, rows: filteredTasks.filter(t => t.status === e.rawStatus).map(toDrillRow) });
  };
  const handleHoursClick = (e: any) => {
    const month = e?.activeLabel; if (!month) return;
    setDrillHours({ label: `Hours — ${month}`, rows: drillRowsForMonth(month) });
  };
  const handleCarsClick = (e: any) => {
    const month = e?.activeLabel; if (!month) return;
    setDrillCars({ label: `Cars — ${month}`, rows: drillRowsForMonth(month) });
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };
  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 inline ml-1" /> : <ArrowDown className="h-3 w-3 inline ml-1" />;
  };
  const DatePicker = ({ value, onChange, label }: { value?: Date; onChange: (d?: Date) => void; label: string }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal h-8", !value && "text-muted-foreground")}>
          <CalendarIcon className="mr-1 h-3 w-3" />
          {value ? format(value, 'MMM d, yyyy') : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} className="p-3 pointer-events-auto" />
      </PopoverContent>
    </Popover>
  );

  const clientChartHeight = Math.max(220, revenueByClient.length * 44);
  const vehicleChartHeight = Math.max(220, revenueByVehicle.length * 38);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-card border-b px-6 py-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={rptClient} onValueChange={v => { setRptClient(v); setRptVehicle('all'); }}>
            <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue placeholder="All Clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={rptVehicle} onValueChange={setRptVehicle}>
            <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicles</SelectItem>
              {availableVehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button size="sm" variant={rptShowActive ? 'default' : 'outline'} onClick={() => setRptShowActive(!rptShowActive)}
              className={cn("h-8 text-xs", rptShowActive && "bg-blue-600 hover:bg-blue-700")}>Active</Button>
            <Button size="sm" variant={rptShowCompleted ? 'default' : 'outline'} onClick={() => setRptShowCompleted(!rptShowCompleted)}
              className={cn("h-8 text-xs", rptShowCompleted && "bg-green-600 hover:bg-green-700")}>Completed</Button>
            <Button size="sm" variant={rptShowBilled ? 'default' : 'outline'} onClick={() => setRptShowBilled(!rptShowBilled)}
              className={cn("h-8 text-xs", rptShowBilled && "bg-purple-600 hover:bg-purple-700")}>Billed</Button>
            <Button size="sm" variant={rptShowPaid ? 'default' : 'outline'} onClick={() => setRptShowPaid(!rptShowPaid)}
              className={cn("h-8 text-xs", rptShowPaid && "bg-emerald-600 hover:bg-emerald-700")}>Paid</Button>
          </div>
          <DatePicker value={rptDateFrom} onChange={setRptDateFrom} label="From" />
          <DatePicker value={rptDateTo} onChange={setRptDateTo} label="To" />
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8">
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
          {unpaidBalance > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700">
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Unpaid:</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{formatCurrency(unpaidBalance)}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            <span><strong className="text-foreground">{filteredTasks.length}</strong> tasks</span>
            <span><strong className="text-foreground">{formatCurrency(totalRevenue)}</strong> revenue</span>
            <span><strong className="text-foreground">{totalHours.toFixed(1)}</strong> hrs</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 1. Revenue Over Time */}
          <Card className="border-2 border-green-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">
                Revenue Over Time <span className="text-[10px] font-normal text-muted-foreground ml-1">(click bar to drill)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueOverTime} onClick={handleRevTimeClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v}`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {drillRevTime && <DrillTable drill={drillRevTime} onClose={() => setDrillRevTime(null)} />}
            </CardContent>
          </Card>

          {/* 2. Revenue by Client */}
          <Card className="border-2 border-blue-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">
                Revenue by Client <span className="text-[10px] font-normal text-muted-foreground ml-1">(click bar to drill)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: clientChartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByClient} layout="vertical" onClick={handleClientClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v}`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {revenueByClient.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {drillClient && <DrillTable drill={drillClient} onClose={() => setDrillClient(null)} />}
            </CardContent>
          </Card>

          {/* 3. Revenue by Vehicle */}
          <Card className="border-2 border-purple-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-400">
                Revenue by Vehicle (Top 20) <span className="text-[10px] font-normal text-muted-foreground ml-1">(click bar to drill)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: vehicleChartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByVehicle} layout="vertical" onClick={handleVehicleClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v}`} />
                    <YAxis dataKey="label" type="category" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={140} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {revenueByVehicle.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 3) % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {drillVehicle && <DrillTable drill={drillVehicle} onClose={() => setDrillVehicle(null)} />}
            </CardContent>
          </Card>

          {/* 4. Tasks by Status */}
          <Card className="border-2 border-amber-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Tasks by Status <span className="text-[10px] font-normal text-muted-foreground ml-1">(click slice to drill)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={tasksByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={90}
                      dataKey="value" nameKey="name"
                      label={({ name, value }) => `${name}: ${value}`}
                      onClick={handleStatusClick} style={{ cursor: 'pointer' }}>
                      {tasksByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {drillStatus && <DrillTable drill={drillStatus} onClose={() => setDrillStatus(null)} />}
            </CardContent>
          </Card>

          {/* 5. Work Hours Over Time */}
          <Card className="border-2 border-cyan-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-cyan-700 dark:text-cyan-400">
                Work Hours Over Time <span className="text-[10px] font-normal text-muted-foreground ml-1">(click to drill)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hoursOverTime} onClick={handleHoursClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip formatter={(v: number) => `${v} hrs`} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Area type="monotone" dataKey="hours" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {drillHours && <DrillTable drill={drillHours} onClose={() => setDrillHours(null)} />}
            </CardContent>
          </Card>

          {/* 6. Cars Serviced Over Time */}
          <Card className="border-2 border-indigo-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
                Cars Serviced Over Time <span className="text-[10px] font-normal text-muted-foreground ml-1">(click bar to drill)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={carsOverTime} onClick={handleCarsClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="cars" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {drillCars && <DrillTable drill={drillCars} onClose={() => setDrillCars(null)} />}
            </CardContent>
          </Card>

        </div>

        {/* Detail Table */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">All Tasks ({detailData.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('date')}>Date <SortIcon field="date" /></th>
                    <th className="text-left py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('client')}>Client <SortIcon field="client" /></th>
                    <th className="text-left py-2">Vehicle</th>
                    <th className="text-left py-2">Description</th>
                    <th className="text-left py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('status')}>Status <SortIcon field="status" /></th>
                    <th className="text-right py-2">Time</th>
                    <th className="text-right py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('cost')}>Cost <SortIcon field="cost" /></th>
                  </tr>
                </thead>
                <tbody>
                  {detailData.map(r => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-2">{format(r.date, 'MMM d, yyyy')}</td>
                      <td className="py-2">{r.client}</td>
                      <td className="py-2">{r.vehicle}</td>
                      <td className="py-2 max-w-[250px] truncate text-muted-foreground" title={r.description}>{r.description}</td>
                      <td className="py-2"><Badge className={cn('text-[10px] capitalize', statusBadgeColors[r.status] || '')}>{r.status}</Badge></td>
                      <td className="py-2 text-right font-mono text-xs">{formatDuration(r.timeWorked)}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td colSpan={5} className="py-2">Totals</td>
                    <td className="py-2 text-right font-mono text-xs">{formatDuration(Math.round(totalHours * 3600))}</td>
                    <td className="py-2 text-right font-mono">{formatCurrency(totalRevenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
