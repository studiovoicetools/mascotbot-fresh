-- Konversations-Gedächtnis für EFRO
-- Speichert den Chat-Verlauf pro Session für Kontext-Folgefragen

CREATE TABLE IF NOT EXISTS public.conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  text        NOT NULL,
  shop_domain text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  message     text        NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Index für schnelle Abfragen nach session_id
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON public.conversations(session_id);

-- Composite index für die häufigste Query (session_id + shop_domain + created_at)
CREATE INDEX IF NOT EXISTS idx_conversations_session_shop_created ON public.conversations(session_id, shop_domain, created_at);

-- RLS aktivieren (Service-Role Key hat vollen Zugriff)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Service-Role darf alles
CREATE POLICY "service_role_full_access" ON public.conversations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
