import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { TaskCard } from '@/components/TaskCard';
import { AddVehicleDialog } from '@/components/AddVehicleDialog';
import { AddClientDialog } from '@/components/AddClientDialog';
import { CompleteWorkDialog } from '@/components/CompleteWorkDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { CloudSyncIndicator } from '@/components/CloudSyncIndicator';
import { useClients, useVehicles, useTasks, useSettings, useCloudSync } from '@/hooks/useStorage';
import { capacitorStorage } from '@/lib/capacitorStorage';
import { Task, WorkSession, WorkPeriod, Part, Client, Vehicle } from '@/types';
import { useNotifications } from '@/hooks/useNotifications';
import { migrateToCapacitorStorage } from '@/lib/storageMigration';
import { migratePhotosToFilesystem } from '@/lib/photoMigration';
import { photoStorageService } from '@/services/photoStorageService';
import { getVehicleColorScheme } from '@/lib/vehicleColors';
import { contactsService } from '@/services/contactsService';
import { syncPortalToCloud } from '@/lib/clientPortalUtils';



const Index = () => {
  const clientsHook = useClients();
  const vehiclesHook = useVehicles();
  const tasksHook = useTasks();
  const settingsHook = useSettings();

  const { clients, addClient, updateClient, deleteClient } = clientsHook;
  const { vehicles, addVehicle, updateVehicle, deleteVehicle } = vehiclesHook;
  const { tasks, addTask, updateTask, deleteTask, batchUpdateTasks } = tasksHook;
  const { settings, setSettings } = settingsHook;
  const { toast } = useNotifications();

  // Cloud sync: pull on mount if remote is newer
  useCloudSync({
    clients: clientsHook,
    vehicles: vehiclesHook,
    tasks: tasksHook,
    settings: settingsHook,
  });

  // Perform one-time migration from IndexedDB to Capacitor Preferences
  useEffect(() => {
    const performMigration = async () => {
      const migrated = await migrateToCapacitorStorage();
      if (migrated) {
        toast({ 
          title: 'Storage Upgraded', 
          description: 'Your data is now stored in native Android storage for better reliability',
        });
      }
      
      // Migrate photos to filesystem (runs after storage migration)
      const photoMigration = await migratePhotosToFilesystem();
      if (photoMigration.migrated) {
        console.log(`[Index] Migrated ${photoMigration.photoCount} photos to filesystem`);
      }
    };
    performMigration();
  }, [toast]);

  // After a backup import, re-read all data from storage and update React state directly
  // (no page reload — avoids cloud sync overwriting the freshly imported data)
  useEffect(() => {
    const handleImportComplete = async () => {
      const [freshClients, freshVehicles, freshTasks, freshSettings] = await Promise.all([
        capacitorStorage.getClients(),
        capacitorStorage.getVehicles(),
        capacitorStorage.getTasks(),
        capacitorStorage.getSettings(),
      ]);
      clientsHook.replaceAll(freshClients);
      vehiclesHook.replaceAll(freshVehicles);
      tasksHook.replaceAll(freshTasks);
      settingsHook.replaceAll(freshSettings);
    };
    window.addEventListener('chiptime:import-complete', handleImportComplete);
    return () => window.removeEventListener('chiptime:import-complete', handleImportComplete);
  }, [clientsHook, vehiclesHook, tasksHook, settingsHook]);


  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showCompleteWork, setShowCompleteWork] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null);
  // Client collapse/expand — all expanded by default
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());
  const toggleClientCollapse = (clientId: string) => {
    setCollapsedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId); else next.add(clientId);
      return next;
    });
  };

  const handleStartTimer = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    const client = clients.find(c => c.id === vehicle?.clientId);

    if (!vehicle || !client) return;

    // AUTO-PAUSE: Check if another timer is running
    const runningTask = tasks.find(t => t.status === 'in-progress');
    const taskUpdates: Array<{ id: string; updates: Partial<Task> }> = [];
    
    if (runningTask && runningTask.vehicleId !== vehicleId && runningTask.startTime) {
      // Calculate elapsed time for the running task
      const elapsed = Math.floor((Date.now() - runningTask.startTime.getTime()) / 1000);
      
      // Create period for the auto-paused task
      const autoPeriod: WorkPeriod = {
        id: crypto.randomUUID(),
        startTime: runningTask.startTime,
        endTime: new Date(),
        duration: elapsed,
      };

      // Add period to the active session
      const updatedSessions = [...runningTask.sessions];
      if (runningTask.activeSessionId) {
        const activeSession = updatedSessions.find(s => s.id === runningTask.activeSessionId);
        if (activeSession) {
          activeSession.periods.push(autoPeriod);
        }
      }

      // Queue the running task to be paused
      taskUpdates.push({
        id: runningTask.id,
        updates: {
          status: 'paused',
          sessions: updatedSessions,
          totalTime: runningTask.totalTime + elapsed,
          startTime: undefined,
        }
      });

      const pausedVehicle = vehicles.find(v => v.id === runningTask.vehicleId);
      toast({ 
        title: 'Timer Auto-Paused', 
        description: `${pausedVehicle?.make} ${pausedVehicle?.model} paused automatically` 
      });
    }

    // Find existing task for this vehicle
    const existingTask = tasks.find(
      t => t.vehicleId === vehicleId && ['pending', 'in-progress', 'paused'].includes(t.status)
    );

    if (existingTask) {
      // Resume existing task - create new session if none exists
      let updatedSessions = [...existingTask.sessions];
      let activeSessionId = existingTask.activeSessionId;

      if (!activeSessionId) {
        // Create new session if needed
        const newSession: WorkSession = {
          id: crypto.randomUUID(),
          createdAt: new Date(),
          periods: [],
          parts: [],
        };
        updatedSessions.push(newSession);
        activeSessionId = newSession.id;
      }

      // Queue the task to be started/resumed
      taskUpdates.push({
        id: existingTask.id,
        updates: {
          status: 'in-progress',
          startTime: new Date(),
          sessions: updatedSessions,
          activeSessionId,
        }
      });

      // Apply all updates atomically
      batchUpdateTasks(taskUpdates);
      toast({ title: existingTask.status === 'paused' ? 'Timer Resumed' : 'Timer Started' });
    } else {
      // Create new task with new session
      const newSession: WorkSession = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        periods: [],
        parts: [],
      };

      const newTask: Task = {
        id: crypto.randomUUID(),
        clientId: client.id,
        vehicleId: vehicle.id,
        customerName: client.name,
        carVin: vehicle.vin,
        status: 'in-progress',
        totalTime: 0,
        needsFollowUp: false,
        sessions: [newSession],
        createdAt: new Date(),
        startTime: new Date(),
        activeSessionId: newSession.id,
      };
      
      // Apply auto-pause updates first if any, then add new task
      if (taskUpdates.length > 0) {
        batchUpdateTasks(taskUpdates);
      }
      addTask(newTask);
      toast({ title: 'Timer Started' });
    }
  };

  const handlePauseTimer = () => {
    const activeTask = tasks.find(t => t.status === 'in-progress');
    if (!activeTask || !activeTask.startTime) return;

    const elapsed = Math.floor((Date.now() - activeTask.startTime.getTime()) / 1000);
    
    // Create period for this pause
    const period: WorkPeriod = {
      id: crypto.randomUUID(),
      startTime: activeTask.startTime,
      endTime: new Date(),
      duration: elapsed,
    };

    // Add period to the active session (create one if missing)
    let updatedSessions = [...(activeTask.sessions || [])];
    let activeSessionId = activeTask.activeSessionId;
    
    if (!activeSessionId) {
      // Create new session if missing
      const newSession: WorkSession = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        periods: [],
        parts: [],
      };
      updatedSessions.push(newSession);
      activeSessionId = newSession.id;
    }
    
    const activeSession = updatedSessions.find(s => s.id === activeSessionId);
    if (activeSession) {
      activeSession.periods = [...(activeSession.periods || []), period];
    }

    updateTask(activeTask.id, {
      status: 'paused',
      sessions: updatedSessions,
      totalTime: activeTask.totalTime + elapsed,
      startTime: undefined,
      activeSessionId,
    });
    toast({ title: 'Timer Paused' });
  };

  const handleStopTimer = (taskId: string) => {
    const activeTask = tasks.find(t => t.id === taskId);
    if (!activeTask) return;
    setStoppingTaskId(taskId);

    // If timer is running, create final period
    if (activeTask.status === 'in-progress' && activeTask.startTime) {
      const elapsed = Math.floor((Date.now() - activeTask.startTime.getTime()) / 1000);
      
      const finalPeriod: WorkPeriod = {
        id: crypto.randomUUID(),
        startTime: activeTask.startTime,
        endTime: new Date(),
        duration: elapsed,
      };

      // Add period to the active session (create one if missing)
      let updatedSessions = [...(activeTask.sessions || [])];
      let activeSessionId = activeTask.activeSessionId;
      
      if (!activeSessionId) {
        // Create new session if missing
        const newSession: WorkSession = {
          id: crypto.randomUUID(),
          createdAt: new Date(),
          periods: [],
          parts: [],
        };
        updatedSessions.push(newSession);
        activeSessionId = newSession.id;
      }
      
      const activeSession = updatedSessions.find(s => s.id === activeSessionId);
      if (activeSession) {
        activeSession.periods = [...(activeSession.periods || []), finalPeriod];
      }

      updateTask(activeTask.id, {
        status: 'paused',
        sessions: updatedSessions,
        totalTime: activeTask.totalTime + elapsed,
        startTime: undefined,
        activeSessionId,
      });
    }

    setShowCompleteWork(true);
  };

  const handleCompleteWork = (description: string, parts: Part[], needsFollowUp: boolean, chargeMinimumHour: boolean = false, isCloning: boolean = false, isProgramming: boolean = false, isAddKey: boolean = false, isAllKeysLost: boolean = false) => {
    const activeTask = stoppingTaskId ? tasks.find(t => t.id === stoppingTaskId) : tasks.find(t => t.status === 'in-progress' || t.status === 'paused');
    if (!activeTask) return;

    // Update the active session with description and parts
    const updatedSessions = [...(activeTask.sessions || [])];
    let targetSession = activeTask.activeSessionId 
      ? updatedSessions.find(s => s.id === activeTask.activeSessionId)
      : updatedSessions.find(s => s.periods && s.periods.length > 0);
    
    if (targetSession) {
      targetSession.description = description;
      targetSession.parts = parts;
      targetSession.completedAt = new Date();
      targetSession.chargeMinimumHour = chargeMinimumHour;
      targetSession.isCloning = isCloning;
      targetSession.isProgramming = isProgramming;
      targetSession.isAddKey = isAddKey;
      targetSession.isAllKeysLost = isAllKeysLost;
    }

    updateTask(activeTask.id, {
      status: 'completed',
      sessions: updatedSessions,
      startTime: undefined,
      activeSessionId: undefined,
      needsFollowUp,
    });

    setShowCompleteWork(false);
    setStoppingTaskId(null);
    toast({ 
      title: 'Work Completed',
      description: needsFollowUp ? 'Task completed - more work needed' : 'Work session finished successfully',
    });

    // Background cloud sync
    const client = clients.find(c => c.id === activeTask.clientId);
    if (client) {
      const updatedTasks = tasks.map(t =>
        t.id === activeTask.id
          ? { ...t, status: 'completed' as const, sessions: updatedSessions, needsFollowUp, startTime: undefined, activeSessionId: undefined }
          : t
      );
      syncPortalToCloud(client, vehicles, updatedTasks, settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate, settings.defaultAddKeyRate, settings.defaultAllKeysLostRate, settings.paymentLink, settings.paymentLabel, settings.paymentMethods, client.portalLogoUrl || settings.portalLogoUrl, client.portalBgColor || settings.portalBgColor, client.portalBusinessName || settings.portalBusinessName, client.portalBgImageUrl || settings.portalBgImageUrl)
        .then(result => {
          if (!client.portalId) {
            updateClient(client.id, { portalId: result.portalId, accessCode: result.accessCode });
          }
        })
        .catch(err => console.warn('[CloudSync] Portal sync failed:', err));
    }
  };

  const handleRestartTimer = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const taskUpdates: Array<{ id: string; updates: Partial<Task> }> = [];

    // Auto-pause any other running task
    const runningTask = tasks.find(t => t.status === 'in-progress' && t.id !== taskId);
    if (runningTask && runningTask.startTime) {
      const elapsed = Math.floor((Date.now() - runningTask.startTime.getTime()) / 1000);
      
      const autoPeriod: WorkPeriod = {
        id: crypto.randomUUID(),
        startTime: runningTask.startTime,
        endTime: new Date(),
        duration: elapsed,
      };

      let updatedSessions = [...(runningTask.sessions || [])];
      let activeSessionId = runningTask.activeSessionId;
      
      if (!activeSessionId) {
        const newSession: WorkSession = {
          id: crypto.randomUUID(),
          createdAt: new Date(),
          periods: [],
          parts: [],
        };
        updatedSessions.push(newSession);
        activeSessionId = newSession.id;
      }
      
      const activeSession = updatedSessions.find(s => s.id === activeSessionId);
      if (activeSession) {
        activeSession.periods = [...(activeSession.periods || []), autoPeriod];
      }

      // Queue the running task to be paused
      taskUpdates.push({
        id: runningTask.id,
        updates: {
          status: 'paused',
          sessions: updatedSessions,
          totalTime: runningTask.totalTime + elapsed,
          startTime: undefined,
          activeSessionId,
        }
      });

      const pausedVehicle = vehicles.find(v => v.id === runningTask.vehicleId);
      toast({ 
        title: 'Timer Auto-Paused', 
        description: `${pausedVehicle?.make} ${pausedVehicle?.model} paused automatically` 
      });
    }

    // Start/resume this task
    let updatedSessions = [...(task.sessions || [])];
    let activeSessionId = task.activeSessionId;

    if (!activeSessionId) {
      const newSession: WorkSession = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        periods: [],
        parts: [],
      };
      updatedSessions.push(newSession);
      activeSessionId = newSession.id;
    }

    // Queue this task to be started/resumed
    taskUpdates.push({
      id: taskId,
      updates: {
        status: 'in-progress',
        startTime: new Date(),
        sessions: updatedSessions,
        activeSessionId,
      }
    });

    // Apply all updates atomically
    batchUpdateTasks(taskUpdates);
    toast({ title: task.status === 'paused' ? 'Timer Resumed' : 'Timer Started' });
  };

  const handleMarkBilled = (taskId: string) => {
    updateTask(taskId, { status: 'billed' });
    toast({ title: 'Task Marked as Billed' });

    // Sync portal so client sees updated status immediately
    const task = tasks.find(t => t.id === taskId);
    const client = task ? clients.find(c => c.id === task.clientId) : null;
    if (client) {
      const updatedTasks = tasks.map(t =>
        t.id === taskId ? { ...t, status: 'billed' as const } : t
      );
      syncPortalToCloud(client, vehicles, updatedTasks, settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate, settings.defaultAddKeyRate, settings.defaultAllKeysLostRate, settings.paymentLink, settings.paymentLabel, settings.paymentMethods, client.portalLogoUrl || settings.portalLogoUrl, client.portalBgColor || settings.portalBgColor, client.portalBusinessName || settings.portalBusinessName, client.portalBgImageUrl || settings.portalBgImageUrl)
        .then(result => {
          if (!client.portalId) updateClient(client.id, { portalId: result.portalId, accessCode: result.accessCode });
        })
        .catch(err => console.warn('[CloudSync] Portal sync failed:', err));
    }
  };

  const handleMarkPaid = (taskId: string) => {
    updateTask(taskId, { status: 'paid' });
    toast({ title: 'Payment Recorded' });

    // Sync portal so client sees updated status immediately
    const task = tasks.find(t => t.id === taskId);
    const client = task ? clients.find(c => c.id === task.clientId) : null;
    if (client) {
      const updatedTasks = tasks.map(t =>
        t.id === taskId ? { ...t, status: 'paid' as const } : t
      );
      syncPortalToCloud(client, vehicles, updatedTasks, settings.defaultHourlyRate, settings.defaultCloningRate, settings.defaultProgrammingRate, settings.defaultAddKeyRate, settings.defaultAllKeysLostRate, settings.paymentLink, settings.paymentLabel, settings.paymentMethods, client.portalLogoUrl || settings.portalLogoUrl, client.portalBgColor || settings.portalBgColor, client.portalBusinessName || settings.portalBusinessName, client.portalBgImageUrl || settings.portalBgImageUrl)
        .then(result => {
          if (!client.portalId) updateClient(client.id, { portalId: result.portalId, accessCode: result.accessCode });
        })
        .catch(err => console.warn('[CloudSync] Portal sync failed:', err));
    }
  };

  const handleDelete = async (taskId: string) => {
    // Delete photos from filesystem before deleting task
    await photoStorageService.deleteAllPhotosForTask(taskId);
    await deleteTask(taskId);
    toast({ title: 'Task Deleted' });
  };

  const handleAddClient = (clientData: Omit<Client, 'id' | 'createdAt'>) => {
    const newClient: Client = {
      ...clientData,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    addClient(newClient);
    toast({ title: 'Client Added' });
  };

  const handleAddVehicle = async (
    vehicleData: Omit<Vehicle, 'id'>, 
    clientName?: string,
    phoneContact?: any
  ) => {
    try {
      let finalClientId = vehicleData.clientId;
      let clientForTask: Client | undefined;

      // Auto-create client if clientName is provided
      if (clientName && vehicleData.clientId === 'pending') {
        // Extract best phone number as string (not the PhoneNumber object)
        const bestPhone = phoneContact?.phoneNumbers 
          ? contactsService.getBestPhoneNumber(phoneContact.phoneNumbers) 
          : null;
        
        const newClient: Client = {
          id: crypto.randomUUID(),
          name: clientName,
          phone: bestPhone || undefined,
          email: phoneContact?.emails?.[0] || undefined,
          createdAt: new Date(),
        };
        await addClient(newClient);
        finalClientId = newClient.id;
        clientForTask = newClient;
        toast({ title: 'Client Created', description: `${clientName} has been added` });
      } else {
        clientForTask = clients.find(c => c.id === finalClientId);
      }

      const newVehicle: Vehicle = {
        ...vehicleData,
        id: crypto.randomUUID(),
        clientId: finalClientId,
      };
      await addVehicle(newVehicle);

      // Auto-create pending task for new vehicle
      const newTask: Task = {
        id: crypto.randomUUID(),
        clientId: finalClientId,
        vehicleId: newVehicle.id,
        customerName: clientForTask?.name || clientName || 'Unknown',
        carVin: newVehicle.vin,
        status: 'pending',
        totalTime: 0,
        needsFollowUp: false,
        sessions: [],
        createdAt: new Date(),
      };
      await addTask(newTask);

      toast({ title: 'Vehicle Added', description: 'Ready to start work' });
    } catch (error) {
      console.error('Failed to add vehicle:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to save vehicle. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateClient = (id: string, updates: Partial<Client>) => {
    updateClient(id, updates);
  };

  const handleDeleteClient = (id: string) => {
    const clientTasks = tasks.filter(t => t.clientId === id);
    const hasActiveTasks = clientTasks.some(t =>
      ['pending', 'in-progress', 'paused'].includes(t.status)
    );

    if (hasActiveTasks) {
      toast({
        title: 'Cannot Delete Client',
        description: 'Client has active tasks. Complete them first.',
        variant: 'destructive',
      });
      return;
    }

    // Delete client vehicles
    const clientVehicles = vehicles.filter(v => v.clientId === id);
    clientVehicles.forEach(v => deleteVehicle(v.id));

    // Delete client tasks
    clientTasks.forEach(t => deleteTask(t.id));

    // Delete client
    deleteClient(id);

    toast({ title: 'Client Deleted' });
  };

  const handleUpdateVehicle = (id: string, updates: Partial<Vehicle>) => {
    updateVehicle(id, updates);

    // Update related tasks if VIN changed
    if (updates.vin) {
      const vehicleTasks = tasks.filter(t => t.vehicleId === id);
      vehicleTasks.forEach(t => updateTask(t.id, { carVin: updates.vin! }));
    }

    toast({ title: 'Vehicle Updated' });
  };

  const handleDeleteVehicle = (id: string) => {
    const vehicleTasks = tasks.filter(t => t.vehicleId === id);
    const hasActiveTasks = vehicleTasks.some(t =>
      ['pending', 'in-progress', 'paused'].includes(t.status)
    );

    if (hasActiveTasks) {
      toast({
        title: 'Cannot Delete Vehicle',
        description: 'Vehicle has active tasks. Complete them first.',
        variant: 'destructive',
      });
      return;
    }

    // Delete vehicle tasks
    vehicleTasks.forEach(t => deleteTask(t.id));

    // Delete vehicle
    deleteVehicle(id);

    toast({ title: 'Vehicle Deleted' });
  };

  const handleMoveVehicle = (vehicleId: string, newClientId: string) => {
    const newClient = clients.find(c => c.id === newClientId);
    if (!newClient) return;

    // Update vehicle's clientId
    updateVehicle(vehicleId, { clientId: newClientId });

    // Update all tasks for this vehicle
    const vehicleTasks = tasks.filter(t => t.vehicleId === vehicleId);
    vehicleTasks.forEach(t => {
      updateTask(t.id, { clientId: newClientId, customerName: newClient.name });
    });
  };

  const activeTasks = tasks.filter(t => ['pending', 'in-progress', 'paused'].includes(t.status));
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const runningTask = tasks.find(t => t.status === 'in-progress');
  const unbilledCompleted = completedTasks.length;

  // Group tasks by client
  const groupTasksByClient = (taskList: Task[]) => {
    return taskList.reduce((acc, task) => {
      if (!acc[task.clientId]) {
        acc[task.clientId] = [];
      }
      acc[task.clientId].push(task);
      return acc;
    }, {} as Record<string, Task[]>);
  };

  const activeTasksByClient = groupTasksByClient(activeTasks);
  const completedTasksByClient = groupTasksByClient(completedTasks);

  return (
    <div className="h-dvh overflow-y-auto bg-background">
      <header className="border-b bg-primary/20 backdrop-blur-sm shadow-md sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-primary leading-tight">Chip's Time</h1>
            <div className="flex items-center gap-3 mt-0.5">
              {runningTask ? (
                <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                  </span>
                  Timer running
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{activeTasks.length} active job{activeTasks.length !== 1 ? 's' : ''}</span>
              )}

            </div>
          </div>
          <div className="flex items-center gap-2">
            <CloudSyncIndicator onClick={() => setShowSettings(true)} />
            <Button variant="default" size="icon" onClick={() => setShowAddVehicle(true)} className="h-8 w-8">
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className="h-8 w-8">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 py-3 space-y-3 pb-6">
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">Active ({activeTasks.length})</TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completedTasks.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 mt-4">
            {Object.keys(activeTasksByClient).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground space-y-3">
                <div className="text-4xl">🔧</div>
                <p className="font-medium text-foreground">No active jobs</p>
                <p className="text-sm">Tap <strong>+</strong> to add a vehicle and start tracking work.</p>
              </div>
            ) : (
              Object.entries(activeTasksByClient).map(([clientId, clientTasks]) => {
                const client = clients.find(c => c.id === clientId);
                const hasRunning = clientTasks.some(t => t.status === 'in-progress');
                const isCollapsed = collapsedClients.has(clientId);
                return (
                  <div key={clientId} className={`rounded-xl border overflow-hidden ${hasRunning ? 'border-blue-400/50 dark:border-blue-500/40' : 'border-border'}`}>
                    <button
                      onClick={() => toggleClientCollapse(clientId)}
                      className={`w-full px-4 py-2.5 flex items-center justify-between transition-colors ${hasRunning ? 'bg-blue-500/10' : 'bg-muted/40'}`}
                    >
                      <div className="text-left">
                        <h2 className="text-base font-bold leading-tight">
                          {client?.name || 'Unknown Client'}
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          {client?.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
                          <span className="text-xs text-muted-foreground">
                            {clientTasks.length} job{clientTasks.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasRunning && (
                          <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            Live
                          </span>
                        )}
                        {isCollapsed
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        }
                      </div>
                    </button>
                    {!isCollapsed && (
                    <div className="px-3 pb-3 pt-3 space-y-3">
                    {clientTasks.map(task => {
                      const vehicle = vehicles.find(v => v.id === task.vehicleId);
                      const colorScheme = getVehicleColorScheme(vehicle?.id || task.vehicleId);
                      return (
                        <TaskCard
                          key={task.id}
                          task={task}
                          client={client}
                          vehicle={vehicle}
                          settings={settings}
                          onMarkBilled={handleMarkBilled}
                          onMarkPaid={handleMarkPaid}
                          onRestartTimer={handleRestartTimer}
                          onPauseTimer={task.status === 'in-progress' ? handlePauseTimer : undefined}
                          onStopTimer={task.status === 'in-progress' || task.status === 'paused' ? () => handleStopTimer(task.id) : undefined}
                          onUpdateTask={async (updatedTask) => { await updateTask(updatedTask.id, updatedTask); }}
                          onUpdateVehicle={(vid, updates) => updateVehicle(vid, updates)}
                          onDelete={handleDelete}
                          vehicleColorScheme={colorScheme}
                        />
                      );
                    })}
                    </div>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4 mt-4">
            {Object.keys(completedTasksByClient).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground space-y-3">
                <div className="text-4xl">✅</div>
                <p className="font-medium text-foreground">No completed jobs yet</p>
                <p className="text-sm">Completed jobs will appear here ready for billing.</p>
              </div>
            ) : (
              Object.entries(completedTasksByClient).map(([clientId, clientTasks]) => {
                const client = clients.find(c => c.id === clientId);
                const isCollapsed = collapsedClients.has(clientId);
                return (
                  <div key={clientId} className="rounded-xl border border-border overflow-hidden">
                    <button
                      onClick={() => toggleClientCollapse(clientId)}
                      className="w-full px-4 py-2.5 bg-muted/40 flex items-center justify-between transition-colors hover:bg-muted/60"
                    >
                      <div className="text-left">
                        <h2 className="text-base font-bold leading-tight">
                          {client?.name || 'Unknown Client'}
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          {client?.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
                          <span className="text-xs text-muted-foreground">
                            {clientTasks.length} job{clientTasks.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      {isCollapsed
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      }
                    </button>
                    {!isCollapsed && (
                    <div className="px-3 pb-3 pt-3 space-y-3">
                    {clientTasks.map(task => {
                      const vehicle = vehicles.find(v => v.id === task.vehicleId);
                      const colorScheme = getVehicleColorScheme(vehicle?.id || task.vehicleId);
                      return (
                        <TaskCard
                          key={task.id}
                          task={task}
                          client={client}
                          vehicle={vehicle}
                          settings={settings}
                          onMarkBilled={handleMarkBilled}
                          onMarkPaid={handleMarkPaid}
                          onRestartTimer={handleRestartTimer}
                          onUpdateTask={async (updatedTask) => { await updateTask(updatedTask.id, updatedTask); }}
                          onUpdateVehicle={(vid, updates) => updateVehicle(vid, updates)}
                          onDelete={handleDelete}
                          vehicleColorScheme={colorScheme}
                        />
                      );
                    })}
                    </div>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </main>

      <AddVehicleDialog
        open={showAddVehicle}
        onOpenChange={setShowAddVehicle}
        clients={clients}
        tasks={tasks}
        settings={settings}
        onAddClient={() => {
          setShowAddVehicle(false);
          setShowAddClient(true);
        }}
        onSave={handleAddVehicle}
      />

      <AddClientDialog
        open={showAddClient}
        onOpenChange={setShowAddClient}
        onSave={handleAddClient}
      />

      <CompleteWorkDialog
        open={showCompleteWork}
        onOpenChange={(open) => { setShowCompleteWork(open); if (!open) setStoppingTaskId(null); }}
        onComplete={handleCompleteWork}
        vehicleLabel={(() => {
          if (!stoppingTaskId) return undefined;
          const t = tasks.find(tk => tk.id === stoppingTaskId);
          if (!t) return undefined;
          const v = vehicles.find(vh => vh.id === t.vehicleId);
          if (!v) return undefined;
          return [v.year, v.make, v.model].filter(Boolean).join(' ');
        })()}
      />

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        settings={settings}
        onSave={setSettings}
        tasks={tasks}
        clients={clients}
        vehicles={vehicles}
        onMarkBilled={handleMarkBilled}
        onMarkPaid={handleMarkPaid}
        onRestartTimer={handleRestartTimer}
        onUpdateTask={async (updatedTask) => { await updateTask(updatedTask.id, updatedTask); }}
        onDelete={handleDelete}
        onUpdateClient={handleUpdateClient}
        onDeleteClient={handleDeleteClient}
        onUpdateVehicle={handleUpdateVehicle}
        onDeleteVehicle={handleDeleteVehicle}
        onStartWork={handleStartTimer}
        onMoveVehicle={handleMoveVehicle}
      />
    </div>
  );
};

export default Index;
