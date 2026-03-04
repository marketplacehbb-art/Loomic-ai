-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table for Chat History
CREATE TABLE IF NOT EXISTS public.project_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table for Knowledge Base Files
CREATE TABLE IF NOT EXISTS public.project_files (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content TEXT, -- For text files
    storage_path TEXT, -- For binary files (future proofing)
    file_type TEXT, -- e.g., 'text/plain', 'image/png'
    size_bytes BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

-- Messages Policies
CREATE POLICY "Users can view messages of own projects" ON public.project_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = project_messages.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages to own projects" ON public.project_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = project_messages.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- Files Policies
CREATE POLICY "Users can view files of own projects" ON public.project_files
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = project_files.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert files to own projects" ON public.project_files
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = project_files.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete files of own projects" ON public.project_files
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = project_files.project_id
            AND projects.user_id = auth.uid()
        )
    );
