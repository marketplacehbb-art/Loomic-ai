-- ==========================================
-- SUPABASE STORAGE SETUP (Run ONCE)
-- ==========================================
-- This script sets up the 'avatars' storage bucket and
-- security policies so users can upload their own pictures.

-- 1. Create the storage bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

-- 2. Policy: Allow anyone to SEE avatars (Public access)
create policy "Avatar images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- 3. Policy: Allow authenticated users to UPLOAD their own avatar
create policy "Users can upload their own avatar."
  on storage.objects for insert
  with check ( bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1] );

-- 4. Policy: Allow authenticated users to UPDATE their own avatar
create policy "Users can update their own avatar."
  on storage.objects for update
  using ( bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1] );
