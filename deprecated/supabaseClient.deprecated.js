const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({
    path: {
      development: '.env',
      staging: '.env.staging',
      production: '.env.production'
    }[process.env.NODE_ENV || 'development']
  });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('CRITICAL: Supabase URL or Anon Key not found in .env file! Database functionality will be unavailable. Ensure .env is configured correctly.');
} else {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (supabase) {
        console.log("Supabase client initialized successfully via supabaseClient.js.");
    } else {
        console.error("Supabase client failed to initialize via supabaseClient.js despite URL/Key being present.");
    }
}

module.exports = { supabase };