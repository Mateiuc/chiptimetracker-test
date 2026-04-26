CREATE POLICY "Workspace members can read diagnostic PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'diagnostic-pdfs'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);