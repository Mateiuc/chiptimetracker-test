## Goal
Fix two security findings:
1. Edge functions leak raw DB/storage error messages
2. `session-photos` bucket lacks explicit INSERT/UPDATE/DELETE RLS policies

## Changes

### 1. Sanitize edge function error responses
Replace `error.message` with generic strings in 500 responses. Keep `console.error` with full detail server-side.

- `supabase/functions/get-portal/index.ts` — `'Database error'`
- `supabase/functions/sync-portal/index.ts` — `'Database error'`
- `supabase/functions/upload-photo/index.ts` — `'Storage error'` (both upload + sign branches)
- `supabase/functions/upload-diagnostic/index.ts` — `'Storage error'`
- `supabase/functions/sign-photo-urls/index.ts` — `'Storage error'`
- `supabase/functions/sign-diagnostic-url/index.ts` — `'Storage error'`

### 2. Add session-photos write/delete RLS policies
New migration adding workspace-scoped policies on `storage.objects` for `bucket_id = 'session-photos'`, mirroring the existing SELECT policy pattern (path prefix = workspace id):

```sql
CREATE POLICY "Workspace members can upload session photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'session-photos'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Workspace members can update session photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'session-photos' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid()))
WITH CHECK (bucket_id = 'session-photos' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid()));

CREATE POLICY "Workspace members can delete session photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'session-photos' AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid()));
```

Service-role uploads via `upload-photo` edge function continue to work (they bypass RLS). These policies provide defense-in-depth so direct client writes are also constrained correctly.

### 3. Mark findings fixed
Mark `edge_fn_raw_errors` and `session_photos_missing_insert_update_delete` as fixed.