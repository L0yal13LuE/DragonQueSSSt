import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({
  path: ({
    development: '.env',
    staging: '.env.staging',
    production: '.env.production',
    blue: '.env.blue',
  } as Record<string, string>)[process.env.NODE_ENV || 'development'],
});

const SUPABASE_URL: string | undefined = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY: string | undefined = process.env.SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('CRITICAL: Supabase URL or Anon Key not found in .env file! Database functionality will be unavailable. Ensure .env is configured correctly.');
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  if (supabase) {
    console.log("Supabase client initialized successfully via supabaseClient.ts.");
  } else {
    console.error("Supabase client failed to initialize via supabaseClient.ts despite URL/Key being present.");
  }
}

export default supabase;
