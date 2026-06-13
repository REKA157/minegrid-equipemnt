import supabase from '../../utils/supabaseClient';
import type { AlertQuery } from './matchAlert';

// Market Intelligence — lecture des projets (réservée aux abonnés actifs via RLS 0003)
// et gestion des alertes. L'ingestion des projets est serveur (monitor-service).

export interface MarketProject {
  id: string;
  country: string | null;
  sector: string | null;
  title: string;
  budget_amount: number | null;
  budget_currency: string | null;
  phase: string | null;
  lat: number | null;
  lng: number | null;
  starts_at: string | null;
}

export interface MarketAlert {
  id: string;
  query: AlertQuery;
  channel: 'email' | 'whatsapp' | 'in_app';
  active: boolean;
  created_at: string;
}

export async function listProjects(filters: {
  country?: string;
  sector?: string;
  minBudget?: number;
  limit?: number;
} = {}): Promise<MarketProject[]> {
  let q = supabase
    .from('market_projects')
    .select('id, country, sector, title, budget_amount, budget_currency, phase, lat, lng, starts_at')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);
  if (filters.country) q = q.eq('country', filters.country);
  if (filters.sector) q = q.eq('sector', filters.sector);
  if (typeof filters.minBudget === 'number') q = q.gte('budget_amount', filters.minBudget);
  const { data, error } = await q;
  if (error) return [];
  return (data as MarketProject[]) ?? [];
}

export async function createAlert(
  query: AlertQuery,
  channel: 'email' | 'whatsapp' | 'in_app' = 'email',
): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Non connecté' };
  const { error } = await supabase
    .from('market_alerts')
    .insert({ user_id: user.id, query, channel, active: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getMyAlerts(): Promise<MarketAlert[]> {
  const { data, error } = await supabase
    .from('market_alerts')
    .select('id, query, channel, active, created_at')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as MarketAlert[]) ?? [];
}
