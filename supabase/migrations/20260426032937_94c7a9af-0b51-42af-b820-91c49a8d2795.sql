CREATE OR REPLACE FUNCTION public.create_workspace(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ws_id uuid;
  v_name text := btrim(coalesce(_name, ''));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Workspace name is required';
  END IF;

  INSERT INTO public.workspaces (name, owner_user_id, is_unclaimed)
  VALUES (v_name, v_user, false)
  RETURNING id INTO v_ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws_id, v_user, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  RETURN v_ws_id;
END;
$$;