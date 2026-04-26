import { supabase } from '@/integrations/supabase/client';
import { Client, Vehicle, Task, Settings } from '@/types';

const LOCAL_UPDATED_AT_KEY = 'app_sync_local_updated_at';
const LOCAL_WORKSPACE_KEY = 'app_sync_workspace_id';

export interface SyncData {
  clients: Client[];
  vehicles: Vehicle[];
  tasks: Task[];
  settings: Settings;
}

export const appSyncService = {
  getWorkspaceId(): string | null {
    return localStorage.getItem(LOCAL_WORKSPACE_KEY);
  },

  setWorkspaceId(id: string | null) {
    if (id) localStorage.setItem(LOCAL_WORKSPACE_KEY, id);
    else localStorage.removeItem(LOCAL_WORKSPACE_KEY);
  },

  getLocalUpdatedAt(): string | null {
    return localStorage.getItem(LOCAL_UPDATED_AT_KEY);
  },

  setLocalUpdatedAt(ts: string) {
    localStorage.setItem(LOCAL_UPDATED_AT_KEY, ts);
  },

  async pushToCloud(data: SyncData): Promise<void> {
    const workspaceId = this.getWorkspaceId();
    if (!workspaceId) {
      console.warn('[AppSync] Skipped push — no workspace');
      return;
    }
    const now = new Date().toISOString();

    // SECURITY: Strip per-client access codes before syncing. They live only
    // in the cloud `client_portals` table (server-validated) and on each
    // device locally. They must never be uploaded to a JSON sync blob.
    const sanitized: SyncData = {
      ...data,
      clients: (data.clients || []).map((c: any) => {
        const { accessCode: _omit, ...rest } = c || {};
        return rest;
      }),
      // SECURITY: Strip third-party API keys (Gemini/Grok/OCR Space) before
      // syncing. These are device-local OCR credentials and must never be
      // synced to the cloud or shared across workspace members.
      settings: (() => {
        const s: any = { ...(data.settings || {}) };
        delete s.googleApiKey;
        delete s.grokApiKey;
        delete s.ocrSpaceApiKey;
        return s;
      })(),
    };

    const { error } = await supabase
      .from('app_sync')
      .upsert({
        sync_id: workspaceId,
        workspace_id: workspaceId,
        data: sanitized as any,
        updated_at: now,
      }, { onConflict: 'workspace_id' });

    if (error) {
      console.error('[AppSync] Push failed:', error);
      throw error;
    }

    this.setLocalUpdatedAt(now);
    console.log('[AppSync] Pushed to cloud at', now);
  },

  async pullFromCloud(): Promise<{ data: SyncData; updatedAt: string } | null> {
    const workspaceId = this.getWorkspaceId();
    if (!workspaceId) return null;

    const { data, error } = await supabase
      .from('app_sync')
      .select('data, updated_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      console.error('[AppSync] Pull failed:', error);
      throw error;
    }

    if (!data) {
      console.log('[AppSync] No remote data found for workspace:', workspaceId);
      return null;
    }

    const syncData = data.data as unknown as SyncData;
    console.log('[AppSync] Pulled from cloud, updated_at:', data.updated_at);
    return { data: syncData, updatedAt: data.updated_at };
  },

  async getRemoteUpdatedAt(): Promise<string | null> {
    const workspaceId = this.getWorkspaceId();
    if (!workspaceId) return null;

    const { data, error } = await supabase
      .from('app_sync')
      .select('updated_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      console.error('[AppSync] Failed to get remote updated_at:', error);
      return null;
    }

    return data?.updated_at || null;
  },

  isRemoteNewer(remoteUpdatedAt: string | null): boolean {
    if (!remoteUpdatedAt) return false;
    const localUpdatedAt = this.getLocalUpdatedAt();
    if (!localUpdatedAt) return true;
    return new Date(remoteUpdatedAt) > new Date(localUpdatedAt);
  },
};
