## Problem

After Google sign-in, entering a workspace name and clicking **Create** spins forever. The button never resolves.

### Root cause

`handleCreateWorkspace` in `src/pages/Auth.tsx` runs two separate calls:

1. `INSERT INTO workspaces ... RETURNING id` (via `.select('id').single()`)
2. `INSERT INTO workspace_members (...)` 

Step 1 returns the inserted row through PostgREST, which re-applies the table's **SELECT** RLS policy to the returned row. The `workspaces` SELECT policy is:

```
USING (is_workspace_member(id, auth.uid()))
```

At the moment of insert, the user has **no** membership row yet, so the returned row is filtered out. `.single()` then errors with `PGRST116` (no rows). Depending on timing this either silently fails or never resolves the promise as expected — and the spinner stays on.

Even if we worked around the SELECT, the two-step approach is racy: between step 1 and step 2 the user "owns" a workspace they cannot read.

## Fix

Replace the two client-side inserts with a single atomic `SECURITY DEFINER` RPC that:

1. Creates the workspace with `owner_user_id = auth.uid()`.
2. Inserts the matching `workspace_members` row with role `'owner'`.
3. Returns the new workspace id.

This bypasses the RLS chicken-and-egg, runs in one transaction, and is the same pattern already used for `claim_unclaimed_workspace` and `redeem_workspace_invite`.

### Migration

Add function `public.create_workspace(_name text) returns uuid`:

- `SECURITY DEFINER`, `SET search_path = public`
- Validates `auth.uid()` is not null and `_name` is non-empty (trimmed)
- Inserts workspace + owner membership
- Returns the new id

### Client change (`src/pages/Auth.tsx`)

Replace the body of `handleCreateWorkspace` with:

```ts
const { data, error } = await supabase.rpc('create_workspace', {
  _name: workspaceName.trim(),
});
if (error) throw error;
await refreshWorkspace();
```

Also add a `console.error` in the catch block so future failures show up in logs instead of being swallowed.

## Files touched

- `supabase/migrations/<new>.sql` — add `create_workspace` function
- `src/pages/Auth.tsx` — switch create flow to RPC, log errors

## Out of scope

No UI redesign, no changes to sign-in, claim, or invite flows.
