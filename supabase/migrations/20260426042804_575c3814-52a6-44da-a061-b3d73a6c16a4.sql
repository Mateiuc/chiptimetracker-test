ALTER TABLE public.client_portals
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_failed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz NULL;