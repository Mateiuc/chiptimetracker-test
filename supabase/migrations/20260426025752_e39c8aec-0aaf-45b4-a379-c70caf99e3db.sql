
-- Public buckets keep working through direct CDN URLs even without a SELECT
-- policy on storage.objects. Removing the listing-enabling SELECT policies
-- prevents anonymous bucket enumeration.
DROP POLICY IF EXISTS "Anyone can read diagnostic PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read session photos" ON storage.objects;
