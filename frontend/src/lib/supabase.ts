import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Demo mode never touches Supabase, and real-auth mode only initializes when
// the Vite env keys are actually present (safe for the unconfigured state too).
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;