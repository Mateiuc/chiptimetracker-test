-- 1) Flip session-photos bucket to private
UPDATE storage.buckets SET public = false WHERE id = 'session-photos';

-- 2) Drop any existing session-photos policies on storage.objects (idempotent)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        policyname ILIKE '%session-photos%'
        OR policyname ILIKE '%session_photos%'
        OR policyname IN (
          'Public read session-photos',
          'Authenticated upload session-photos',
          'Service role manages session-photos'
        )
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- 3) SELECT policy: workspace members can read objects whose first path segment is their workspace_id
CREATE POLICY "Workspace members can read session-photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'session-photos'
  AND public.is_workspace_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);
