-- ==========================================
-- FIX MISSING USERS (Run this ONCE)
-- ==========================================
-- This script finds users who exist in auth.users (Login system)
-- but are missing in public.users (Profile system), and creates them.

insert into public.users (id, email, username, created_at)
select 
    id, 
    email, 
    raw_user_meta_data ->> 'username', 
    created_at
from auth.users
where id not in (select id from public.users);
