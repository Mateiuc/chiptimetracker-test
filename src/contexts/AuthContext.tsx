import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { appSyncService } from '@/services/appSyncService';
import type { Session, User } from '@supabase/supabase-js';

interface WorkspaceInfo {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  workspace: WorkspaceInfo | null;
  loading: boolean;
  refreshWorkspace: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWorkspace = useCallback(async (uid: string | null) => {
    if (!uid) {
      setWorkspace(null);
      appSyncService.setWorkspaceId(null);
      return;
    }
    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, workspace_id, workspaces(id, name)')
      .eq('user_id', uid)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[Auth] Failed to load workspace:', error);
      setWorkspace(null);
      appSyncService.setWorkspaceId(null);
      return;
    }
    if (!data) {
      setWorkspace(null);
      appSyncService.setWorkspaceId(null);
      return;
    }
    const ws = (data as any).workspaces;
    setWorkspace({ id: ws.id, name: ws.name, role: data.role as any });
    appSyncService.setWorkspaceId(ws.id);
  }, []);

  useEffect(() => {
    // 1) Subscribe FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      // Defer Supabase calls to avoid deadlock inside the callback
      setTimeout(() => {
        loadWorkspace(newSession?.user?.id ?? null);
      }, 0);
    });
    // 2) Then fetch existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      loadWorkspace(existing?.user?.id ?? null).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, [loadWorkspace]);

  const refreshWorkspace = useCallback(async () => {
    await loadWorkspace(user?.id ?? null);
  }, [user, loadWorkspace]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    appSyncService.setWorkspaceId(null);
    localStorage.removeItem('app_sync_local_updated_at');
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, workspace, loading, refreshWorkspace, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};