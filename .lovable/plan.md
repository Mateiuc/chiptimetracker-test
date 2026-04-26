## Diagnosis

The "Create" button on the workspace setup screen spins forever because the browser is running an **old cached version of the app** served by the PWA service worker — not the current code that uses the new `create_workspace` RPC.

Evidence:
- Network logs show **zero** calls to `/rpc/create_workspace` after clicking Create.
- Network logs show no `INSERT` to the `workspaces` table either.
- The database confirms no workspace was created for your user.
- `vite.config.ts` registers `vite-plugin-pwa` with `registerType: "autoUpdate"` and aggressive Workbox precaching of all JS — so old JS is served until the SW finishes a background update and the user reloads twice.

A second related issue: the OAuth flow path `/~oauth/*` is **not** in `navigateFallbackDenylist`, so the service worker can intercept OAuth redirects and break Google sign-in on subsequent attempts (per Lovable PWA + OAuth requirements).

## Fix

1. **Update `vite.config.ts` PWA Workbox config** to:
   - Add `navigateFallbackDenylist: [/^\/~oauth/]` so OAuth is never intercepted by the SW.
   - Add `clientsClaim: true` and `skipWaiting: true` so a new SW takes over immediately on the next page load instead of waiting for all tabs to close.
   - Add `cleanupOutdatedCaches: true` to purge stale precached JS.

2. **Add a one-time SW unregister + cache flush in `src/main.tsx`** guarded by a version key in `localStorage`. On first load after this deploy, it will:
   - Unregister all existing service workers.
   - Delete all caches.
   - Reload the page once.
   This frees every existing user (including you) from the stale bundle without needing manual "hard refresh" instructions. After the one-time reset, the new PWA registers normally.

3. **No database or RPC changes needed** — the `create_workspace` RPC is already correctly defined and works (verified). The workspace setup flow in `src/pages/Auth.tsx` is already correct.

## After the fix

- Reload the preview once. Your browser will run the cleanup (you may see a brief blank flash + auto-reload), then load the current app.
- Click Create on "Set up your workspace" → it will call `create_workspace` RPC → workspace created → you're routed to the dashboard.

## Files changed

- `vite.config.ts` — Workbox options (denylist, claim, skipWaiting, cleanup).
- `src/main.tsx` — one-time SW + cache reset block.