## Goal

Fix the security finding `session_photos_public_bucket_no_select_policy` by making the `session-photos` bucket private and ensuring only authorized viewers (workspace members in-app, and clients with a valid portal access code) can read photos.

## Approach

Photos are currently uploaded to a public bucket and the resulting public URL (`p.cloudUrl`) is stored in:
- Each session's photo record (used by the desktop gallery / `ClientCostBreakdown`)
- The slimmed portal payload (`ph` field) synced to `client_portals.data`

To keep both flows working without exposing photos publicly, we'll switch to **storage paths** (e.g. `<workspace>/<task>/<photo>.jpg`) instead of full public URLs, and mint **short-lived signed URLs on demand** through edge functions.

## Changes

### 1. Migration: lock down the bucket

- `UPDATE storage.buckets SET public = false WHERE id = 'session-photos';`
- Drop the existing permissive `session-photos` policies on `storage.objects`.
- Add a SELECT policy: workspace members can read objects whose path starts with their `workspace_id/` (uses `is_workspace_member`).
- Keep INSERT/UPDATE restricted (uploads already go through the `upload-photo` edge function with the service role).

### 2. `upload-photo` edge function

- Return the storage `path` (e.g. `<wsId>/<taskId>/<photoId>.jpg`) in addition to (or instead of) the public URL. The client should persist the path as the canonical reference.

### 3. New edge function: `sign-photo-urls`

- Authenticated endpoint. Body: `{ paths: string[] }`.
- Verifies the caller's JWT, resolves their workspace via `user_primary_workspace`, and rejects any path not prefixed with that workspace id.
- Returns `{ urls: Record<path, signedUrl> }` using `storage.from('session-photos').createSignedUrls(paths, 3600)`.
- Used by the in-app desktop/mobile gallery to render private photos.

### 4. Update `get-portal` edge function

- After loading `client_portals.data`, walk `data.v[].s[].ph[]`, treat each entry as either a legacy public URL (leave as-is during migration) or a storage path, and replace storage paths with signed URLs (1-hour expiry) before returning the payload.
- This keeps the public client portal working (access-code gated) while removing the unauthenticated public-URL exposure for any newly uploaded photos.

### 5. Client code

- `src/services/photoStorageService.ts` (or wherever uploads are handled): persist the returned `path` on the photo record (e.g. `cloudPath`) alongside / replacing `cloudUrl`.
- `src/lib/clientPortalUtils.ts`: in `slimDown`, send `cloudPath` (or fall back to `cloudUrl`) in `ph[]`.
- `src/components/ClientCostBreakdown.tsx` and any other in-app photo viewer: when rendering authenticated views, call `sign-photo-urls` to get a short-lived URL for each path; cache the result for the page lifetime.
- `ClientPortal.tsx`: no client change needed — `get-portal` returns ready-to-use signed URLs.

### 6. Backwards compatibility

- Existing photos uploaded under the old `<taskId>/<photoId>.jpg` layout still have their public URLs stored in `cloudUrl`. After flipping the bucket to private these URLs stop working. Options:
  - (a) Leave them broken — acceptable if there are no production users yet.
  - (b) Add a one-time migration script that copies legacy objects under `<wsId>/...` (requires knowing the workspace per task) and re-issues paths.
- Recommendation: go with (a) given the project is pre-launch; document it in the final summary.

## Security finding follow-up

After the migration deploys, mark `supabase_lov / session_photos_public_bucket_no_select_policy` as fixed with an explanation referencing the new private bucket + signed-URL flow.
