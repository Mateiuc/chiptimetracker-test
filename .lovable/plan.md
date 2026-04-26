## Problem

The `vin-scan-failures` bucket SELECT policy currently allows any authenticated user to read every file. Files are also uploaded with no workspace prefix, so they cannot be scoped by path today.

## Fix

Two-part change: namespace uploads under the user's workspace, then tighten storage policies to require workspace membership.

### 1. Upload path (client) — `src/components/VinScanner.tsx`

Prefix uploaded keys with the user's workspace id:

```
{workspaceId}/{timestamp}_{provider}_{success|fail}.jpg
{workspaceId}/{timestamp}_{provider}_{success|fail}.json
```

Resolve the workspace id via `user_primary_workspace(auth.uid())` (already used elsewhere) — fetch once via `supabase.rpc` or read from existing app state. If no workspace is available (unauthenticated edge case), skip the diagnostic upload silently.

### 2. Storage RLS migration

Drop the existing overly-broad policies and replace with workspace-scoped ones (mirroring the `session-photos` and `diagnostic-pdfs` pattern):

```sql
DROP POLICY IF EXISTS "Authenticated can read vin-scan-failures"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload vin-scan-failures" ON storage.objects;

CREATE POLICY "Workspace members can read vin-scan-failures"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vin-scan-failures'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Workspace members can upload vin-scan-failures"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vin-scan-failures'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Workspace members can update vin-scan-failures"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'vin-scan-failures'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Workspace members can delete vin-scan-failures"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'vin-scan-failures'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);
```

### Notes

- Bucket is already private (`public = false`), so no public URL exposure.
- Legacy flat-rooted files (no `{workspaceId}/` prefix) become inaccessible to all authenticated users — acceptable since they are diagnostic-only and nothing in the app reads them.
- This also closes the related warning about missing INSERT/UPDATE/DELETE policies for the bucket.
