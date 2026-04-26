
-- =========================================================================
-- 1. Roles enum
-- =========================================================================
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member');

-- =========================================================================
-- 2. Workspaces
-- =========================================================================
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_unclaimed BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. Workspace members
-- =========================================================================
CREATE TABLE public.workspace_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON public.workspace_members(workspace_id);

-- =========================================================================
-- 4. Workspace invites (short code redemption)
-- =========================================================================
CREATE TABLE public.workspace_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_by UUID
);
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_workspace_invites_code ON public.workspace_invites(code);

-- =========================================================================
-- 5. Security definer helpers (avoid RLS recursion)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id UUID, _user_id UUID, _role public.workspace_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin_or_owner(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role IN ('owner','admin')
  );
$$;

-- Returns the (single) workspace id the user belongs to as their primary
CREATE OR REPLACE FUNCTION public.user_primary_workspace(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT workspace_id FROM public.workspace_members
  WHERE user_id = _user_id ORDER BY created_at ASC LIMIT 1;
$$;

-- =========================================================================
-- 6. Workspaces RLS
-- =========================================================================
CREATE POLICY "Members can view their workspace"
  ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()));

CREATE POLICY "Owners can update workspace"
  ON public.workspaces FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Authenticated users can create workspaces"
  ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- =========================================================================
-- 7. Workspace members RLS
-- =========================================================================
CREATE POLICY "Members can see members of their workspace"
  ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Self insert (initial owner only)"
  ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners/admins can remove members"
  ON public.workspace_members FOR DELETE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id, auth.uid()));

-- =========================================================================
-- 8. Invites RLS
-- =========================================================================
CREATE POLICY "Owners/admins can view invites"
  ON public.workspace_invites FOR SELECT TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id, auth.uid()));

CREATE POLICY "Owners/admins can create invites"
  ON public.workspace_invites FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_admin_or_owner(workspace_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Owners/admins can delete invites"
  ON public.workspace_invites FOR DELETE TO authenticated
  USING (public.is_workspace_admin_or_owner(workspace_id, auth.uid()));

-- =========================================================================
-- 9. Redeem invite RPC
-- =========================================================================
CREATE OR REPLACE FUNCTION public.redeem_workspace_invite(_code TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.workspace_invites%ROWTYPE;
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.workspace_invites WHERE code = _code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  IF v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already used';
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_invite.workspace_id, v_user, v_invite.role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invites
    SET used_at = now(), used_by = v_user
  WHERE id = v_invite.id;

  RETURN v_invite.workspace_id;
END;
$$;

-- =========================================================================
-- 10. Claim unclaimed workspace RPC (one-time migration helper)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.claim_unclaimed_workspace()
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_ws UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- If user already in a workspace, return that
  SELECT workspace_id INTO v_ws FROM public.workspace_members
    WHERE user_id = v_user ORDER BY created_at ASC LIMIT 1;
  IF v_ws IS NOT NULL THEN
    RETURN v_ws;
  END IF;

  -- Find an unclaimed workspace (FIFO)
  SELECT id INTO v_ws FROM public.workspaces
    WHERE is_unclaimed = true AND owner_user_id IS NULL
    ORDER BY created_at ASC LIMIT 1;
  IF v_ws IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.workspaces
    SET owner_user_id = v_user, is_unclaimed = false, updated_at = now()
  WHERE id = v_ws;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws, v_user, 'owner');

  RETURN v_ws;
END;
$$;

-- =========================================================================
-- 11. Migrate existing app_sync — add workspace_id and lock down
-- =========================================================================

-- Create a placeholder workspace to hold existing data
INSERT INTO public.workspaces (id, name, owner_user_id, is_unclaimed)
VALUES ('00000000-0000-0000-0000-000000000001', 'Migrated workspace', NULL, true);

-- Add workspace_id to app_sync, defaulting existing rows to that placeholder
ALTER TABLE public.app_sync ADD COLUMN workspace_id UUID;
UPDATE public.app_sync SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE public.app_sync ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.app_sync ADD CONSTRAINT app_sync_workspace_fkey
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.app_sync ADD CONSTRAINT app_sync_workspace_unique UNIQUE (workspace_id);

-- Drop old wide-open policies
DROP POLICY IF EXISTS "Allow public insert access to app_sync" ON public.app_sync;
DROP POLICY IF EXISTS "Allow public read access to app_sync" ON public.app_sync;
DROP POLICY IF EXISTS "Allow public update access to app_sync" ON public.app_sync;

CREATE POLICY "Members can read their workspace sync"
  ON public.app_sync FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can insert their workspace sync"
  ON public.app_sync FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can update their workspace sync"
  ON public.app_sync FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Strip any embedded accessCode values from existing app_sync data blob
UPDATE public.app_sync
SET data = (
  SELECT jsonb_set(
    data,
    '{clients}',
    COALESCE(
      (SELECT jsonb_agg(c - 'accessCode') FROM jsonb_array_elements(data->'clients') c),
      '[]'::jsonb
    )
  )
)
WHERE jsonb_typeof(data->'clients') = 'array';

-- =========================================================================
-- 12. Client portals — add workspace_id, scope reads/writes
-- =========================================================================
ALTER TABLE public.client_portals ADD COLUMN workspace_id UUID;
UPDATE public.client_portals SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE public.client_portals ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.client_portals ADD CONSTRAINT client_portals_workspace_fkey
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX idx_client_portals_workspace ON public.client_portals(workspace_id);

-- Existing "USING (false)" SELECT policy stays (anonymous portal reads still go through edge function with service role)
-- Add member-scoped management policies
CREATE POLICY "Members can read their workspace portals"
  ON public.client_portals FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can insert workspace portals"
  ON public.client_portals FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can update workspace portals"
  ON public.client_portals FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Members can delete workspace portals"
  ON public.client_portals FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- =========================================================================
-- 13. Storage policies — tighten
-- =========================================================================

-- vin-scan-failures: restrict to authenticated only
DROP POLICY IF EXISTS "Allow anon select from vin-scan-failures" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon uploads to vin-scan-failures" ON storage.objects;

CREATE POLICY "Authenticated can read vin-scan-failures"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vin-scan-failures');

CREATE POLICY "Authenticated can upload vin-scan-failures"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vin-scan-failures');

-- diagnostic-pdfs: keep public read (portals link directly), restrict writes to authenticated
DROP POLICY IF EXISTS "Anyone can update diagnostic PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload diagnostic PDFs" ON storage.objects;

CREATE POLICY "Authenticated can upload diagnostic PDFs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'diagnostic-pdfs');

CREATE POLICY "Authenticated can update own diagnostic PDFs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'diagnostic-pdfs' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'diagnostic-pdfs' AND owner = auth.uid());

CREATE POLICY "Authenticated can delete own diagnostic PDFs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'diagnostic-pdfs' AND owner = auth.uid());

-- =========================================================================
-- 14. updated_at trigger for workspaces
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
