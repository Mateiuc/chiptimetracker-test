DROP POLICY IF EXISTS "Authenticated can read vin-scan-failures" ON storage.objects;
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