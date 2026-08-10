import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Null when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't configured
 *  (e.g. local dev without a .env) — callers must treat sync as optional. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
