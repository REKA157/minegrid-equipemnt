import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type GenericRow = Record<string, Json>;
type GenericInsert = Record<string, Json | undefined>;
type GenericUpdate = Record<string, Json | undefined>;

export type Database = {
  public: {
    Tables: Record<
      string,
      {
        Row: GenericRow;
        Insert: GenericInsert;
        Update: GenericUpdate;
        Relationships: [];
      }
    >;
    Views: Record<
      string,
      {
        Row: GenericRow;
      }
    >;
    Functions: Record<
      string,
      {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      }
    >;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  // Configuration pour éviter les erreurs TypeScript
  global: {
    headers: {
      'X-Client-Info': 'supabase-js/2.x'
    }
  }
});

// Export par défaut pour la compatibilité
export default supabaseClient;
