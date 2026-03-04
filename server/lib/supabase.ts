
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getSupabaseServiceKey } from '../utils/env-security.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = getSupabaseServiceKey();

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials missing in environment variables');
}

// Default client (Anonymous)
export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// Admin client (Service Role) - Use with caution!
export const supabaseAdmin = supabaseServiceKey
    ? createClient(supabaseUrl || '', supabaseServiceKey)
    : null;
