-- 042_semantic_embeddings.sql
-- Persist AI embedding vectors so semantic search survives page reloads and can be shared across users.

CREATE TABLE IF NOT EXISTS public.semantic_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('inventory', 'bom', 'vendor')),
  entity_id TEXT NOT NULL,
  embedding JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_embeddings_entity
  ON public.semantic_embeddings(entity_type, entity_id);

ALTER TABLE public.semantic_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "semantic_embeddings_select_authenticated"
  ON public.semantic_embeddings
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "semantic_embeddings_upsert_authenticated"
  ON public.semantic_embeddings
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "semantic_embeddings_update_authenticated"
  ON public.semantic_embeddings
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
