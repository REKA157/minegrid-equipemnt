import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Sans schéma PostgREST généré, les génériques supabase-js/postgrest-js infèrent
 * `GenericStringError` sur les chaînes de requête. Cast volontaire jusqu'à
 * adoption de `supabase gen types`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabaseClient: any = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js/2.x',
    },
  },
});

export default supabaseClient;
