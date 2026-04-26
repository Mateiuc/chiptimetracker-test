# Portal PIN Lockout

Add server-side attempt tracking and lockout to the `get-portal` edge function. After 3 failed PIN attempts within a 30-minute rolling window, the portal is locked for 1 hour.

## Database (migration)

Add three nullable columns to `public.client_portals`:

- `failed_attempts` integer NOT NULL DEFAULT 0
- `first_failed_at` timestamptz NULL — start of the current 30-min window
- `locked_until` timestamptz NULL — when the lockout expires

No RLS changes needed (table is already locked down; the edge function uses the service role).

## Edge function: `supabase/functions/get-portal/index.ts`

When a portal has an `access_code` and is not in `preview` mode:

1. **Before validating the code**, check `locked_until`:
   - If `locked_until > now()`, return HTTP 429 with `{ error: "Too many attempts", lockedUntil, retryAfterSeconds }`. Do not reveal whether the supplied code was right.
2. **If no `code` provided**, return the existing `requiresCode` metadata response (no counter changes).
3. **If code matches**: reset `failed_attempts = 0`, `first_failed_at = null`, `locked_until = null`, then return portal data as today.
4. **If code is wrong**:
   - If `first_failed_at` is null OR older than 30 minutes → reset window: `failed_attempts = 1`, `first_failed_at = now()`.
   - Else increment `failed_attempts`.
   - If new `failed_attempts >= 3` → set `locked_until = now() + 1 hour` and return HTTP 429 with `lockedUntil`.
   - Otherwise return HTTP 403 `{ error: "Invalid access code", attemptsRemaining }`.

All counter writes use the service role client already in the function. Preview mode (`preview=1`, used by the workspace owner inside the app) bypasses both the lockout and the counter so internal users can never lock themselves out.

## Client: `src/pages/ClientPortal.tsx`

When the portal call returns 429:

- Show a clear message: "Too many incorrect attempts. Try again at HH:MM" (formatted from `lockedUntil`).
- Disable the PIN input until that time.

When the portal returns 403 with `attemptsRemaining`:

- Show "Incorrect code. N attempt(s) remaining."

## Notes

- This is a per-portal account-lockout control, not generic API rate limiting — consistent with project policy.
- 4-digit PIN length is unchanged; lockout reduces the practical brute-force space to ~3 guesses per hour per portal.
- Successful entry fully clears the counter, so legitimate users who mistype once or twice are not penalized later.
