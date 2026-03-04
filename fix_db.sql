-- ==========================================
-- DB REPAIR SCRIPT
-- Führe dieses Script im Supabase SQL Editor aus
-- ==========================================

-- 1. Fehlende Spalten hinzufügen (falls nicht existiert)
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS template VARCHAR(50) DEFAULT 'react-basic';

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS prompt TEXT;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- 2. Index für Performance erstellen
CREATE INDEX IF NOT EXISTS idx_projects_user_updated 
ON public.projects(user_id, updated_at DESC);

-- 3. Prüfen ob Spalten erstellt wurden
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'projects';
