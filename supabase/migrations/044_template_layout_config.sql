-- 044_template_layout_config.sql
-- Store layout metadata for document templates so the UI can power drag-and-drop editing.

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS layout_config JSONB;

ALTER TABLE public.pdf_templates
  ADD COLUMN IF NOT EXISTS layout_config JSONB;
