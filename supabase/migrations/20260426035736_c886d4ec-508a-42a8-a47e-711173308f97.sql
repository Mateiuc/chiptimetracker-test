-- Replace overly-broad self-insert policy with an owner-scoped one.
-- Joining via invite or workspace creation continues to work via SECURITY
-- DEFINER functions (create_workspace, redeem_workspace_invite,
-- claim_unclaimed_workspace) which bypass RLS.
DROP POLICY IF EXISTS "Self insert (initial owner only)" ON public.workspace_members;

CREATE POLICY "Owner can self-insert into own workspace"
ON public.workspace_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_id AND w.owner_user_id = auth.uid()
  )
);