## Problem

Clicking "Sign in with Google" on `/auth` returns:
```
{ "code": 400, "error_code": "validation_failed", "msg": "Unsupported provider: provider is not enabled" }
```

Two reasons:
1. The Google provider is not enabled on the project's backend auth settings.
2. The code calls `supabase.auth.signInWithOAuth({ provider: 'google' })` directly. For Lovable Cloud, Google sign-in must go through the managed `lovable.auth.signInWithOAuth("google", ...)` helper, which uses Lovable's managed Google OAuth credentials (no Google Cloud Console setup required).

## Plan

1. **Run the Configure Social Login step for Google.** This will:
   - Install `@lovable.dev/cloud-auth-js`
   - Generate `src/integrations/lovable/index.ts` (managed OAuth client)
   - Enable Google as an auth provider on the backend with Lovable-managed credentials

2. **Update `src/pages/Auth.tsx`** — replace the direct Supabase Google call with the managed helper:
   ```ts
   import { lovable } from "@/integrations/lovable";

   const result = await lovable.auth.signInWithOAuth("google", {
     redirect_uri: window.location.origin,
   });
   if (result.error) { toast.error(result.error.message); return; }
   if (result.redirected) return; // browser will redirect to Google
   // session already set on return — navigate to "/"
   ```
   Email/password sign-in and signup keep using `supabase.auth.*` as today.

3. **No code change needed** in `AuthContext.tsx` — `onAuthStateChange` already handles the post-OAuth session. After Google returns, the existing workspace-claim / invite flow continues to work.

4. **Verification**: from `/auth`, click "Sign in with Google" → Google account chooser → redirected back to `/` (or `/auth` to choose/claim a workspace if first sign-in).

## Notes

- No need for the user to create a Google Cloud project or paste any client ID/secret. If they ever want to use their own branded credentials later, that's a separate setting in the Cloud auth panel.
- This does not change the email/password flow, RLS, workspace tables, or any of the Phase 1 security work.
