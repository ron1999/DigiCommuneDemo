import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Placeholders keep the app from crashing when .env is missing;
// main.ts shows a clear message in that case.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing-key');
