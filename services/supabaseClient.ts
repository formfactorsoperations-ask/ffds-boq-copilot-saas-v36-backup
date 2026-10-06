
import { createClient } from '@supabase/supabase-js';

// --- SQL SCHEMA INSTRUCTIONS ---
// To enable Cloud Sync, run this SQL in your Supabase SQL Editor:
/*
  create table projects (
    id uuid primary key,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    name text,
    status text,
    data jsonb not null
  );

  create table master_data (
    key text primary key,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    data jsonb not null
  );
  
  -- Enable Row Level Security (RLS) if you have auth enabled, 
  -- or leave open if testing in a secure environment.
*/

const safeEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || (typeof process !== 'undefined' && process.env) || {};
const supabaseUrl = safeEnv.VITE_SUPABASE_URL;
const supabaseKey = safeEnv.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export const isSupabaseConfigured = (): boolean => {
    return !!supabase;
};
