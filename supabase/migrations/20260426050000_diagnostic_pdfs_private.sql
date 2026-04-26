-- 1) Make the diagnostic-pdfs bucket private
UPDATE storage.buckets SET public = false WHERE id = 'diagnostic-pdfs';

-- 2) Drop existing diagnostic-pdfs policies on storage.objects (idempotent)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        policyname ILIKE '%diagnostic-pdfs%'
        OR policyname ILIKE '%diagnostic_pdfs%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- 3) SELECT policy: workspace members can read objects whose first path segment is their workspace_id
CREATE POLICY "Workspace members can read diagnostic-pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'diagnostic-pdfs'
  AND public.is_workspace_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);
