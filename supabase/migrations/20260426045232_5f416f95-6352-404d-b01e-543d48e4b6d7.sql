CREATE POLICY "Workspace members can upload session photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'session-photos'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Workspace members can update session photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'session-photos'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'session-photos'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Workspace members can delete session photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'session-photos'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);