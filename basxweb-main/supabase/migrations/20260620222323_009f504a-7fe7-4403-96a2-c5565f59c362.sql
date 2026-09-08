CREATE TABLE public.sessions (
  code TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.sessions TO anon;
GRANT SELECT, INSERT ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create a session"
  ON public.sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read a session by code"
  ON public.sessions FOR SELECT
  TO anon, authenticated
  USING (true);