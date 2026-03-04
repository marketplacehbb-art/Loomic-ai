-- Project publication metadata for mock publish flow

CREATE TABLE IF NOT EXISTS public.project_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'publishing', 'published', 'failed')),
  slug TEXT NOT NULL,
  published_url TEXT,
  access TEXT NOT NULL DEFAULT 'public' CHECK (access IN ('public', 'unlisted', 'private')),
  site_title TEXT,
  site_description TEXT,
  release_version INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);

CREATE INDEX IF NOT EXISTS project_publications_user_idx
  ON public.project_publications(user_id);

CREATE INDEX IF NOT EXISTS project_publications_project_idx
  ON public.project_publications(project_id);

ALTER TABLE public.project_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project publications" ON public.project_publications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access project_publications" ON public.project_publications
  USING (true) WITH CHECK (true);
