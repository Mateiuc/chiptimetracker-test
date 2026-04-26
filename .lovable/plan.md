## Finding Analysis

The scanner flagged `workspace_invites_missing_insert_user_check` as a warning, but its own description ends with: *"invite-based onboarding likely bypasses RLS entirely (e.g., via a service role), which is acceptable. No actionable RLS finding here."*

### Verification

The invite redemption flow in this project uses the `redeem_workspace_invite(_code text)` SECURITY DEFINER PostgreSQL function, which:

1. Requires `auth.uid()` (rejects anonymous calls)
2. Looks up the invite by code
3. Rejects if already used (`used_at IS NOT NULL`)
4. Rejects if expired (`expires_at < now()`)
5. Inserts the caller into `workspace_members` with the role stored on the invite
6. Marks the invite as used (atomic single-use)

This is the recommended pattern — exactly equivalent to a service-role flow but safer (no service key exposure, validation enforced in SQL). RLS on `workspace_members` correctly only allows owner self-insert; invitees join through the SECURITY DEFINER function, not via a direct INSERT.

The existing `workspace_invites` SELECT policy correctly restricts reads to owners/admins only, so regular members cannot enumerate codes.

### Recommendation

Mark this finding as **fixed/not-applicable** with an explanation that the redemption path uses a properly validated SECURITY DEFINER function. No code or schema changes are needed.

### Action

Call `security--manage_security_finding` with `operation: "ignore"` for `workspace_invites_missing_insert_user_check`, citing the existing `redeem_workspace_invite` function as the secure redemption path.