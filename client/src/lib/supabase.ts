
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('âŒ Supabase credentials missing! Auth will not work.');
} else if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_SUPABASE === 'true') {
    console.log('Supabase initialized with URL:', supabaseUrl);
}

export const supabase = createClient(
    supabaseUrl || '',
    supabaseAnonKey || ''
);

