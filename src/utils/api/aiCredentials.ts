import supabase from '../supabaseClient';

// =====================================================
// CONNEXION IA DE LA SOCIÉTÉ (OpenAI / Claude / Grok / autre)
// =====================================================
// La clé API est un SECRET : stockée côté serveur, scopée à l'organisation,
// jamais renvoyée au navigateur. Tout passe par des fonctions SQL sécurisées
// (cf. migration 20260709120000_teamE_ai_credentials.sql). Le client ne voit
// jamais la clé complète — seulement un statut masqué (4 derniers caractères).

export type AiProvider = 'openai' | 'anthropic' | 'xai' | 'custom';

export interface AiStatus {
  configured: boolean;
  provider: AiProvider | null;
  model: string | null;
  keyLast4: string | null;
  baseUrl: string | null;
  updatedAt: string | null;
}

const NOT_CONFIGURED: AiStatus = {
  configured: false,
  provider: null,
  model: null,
  keyLast4: null,
  baseUrl: null,
  updatedAt: null,
};

/** Statut de connexion IA de la société (masqué : jamais la clé complète). */
export async function getOrgAiStatus(): Promise<AiStatus> {
  const { data, error } = await supabase.rpc('get_org_ai_status');
  if (error) return NOT_CONFIGURED;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.configured) return NOT_CONFIGURED;
  return {
    configured: true,
    provider: (row.provider as AiProvider) ?? null,
    model: row.model ?? null,
    keyLast4: row.key_last4 ?? null,
    baseUrl: row.base_url ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** Connecter / mettre à jour la clé IA (réservé aux admins côté serveur). */
export async function setOrgAiKey(
  provider: AiProvider,
  apiKey: string,
  model?: string,
  baseUrl?: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('set_org_ai_key', {
    p_provider: provider,
    p_api_key: apiKey,
    p_model: model ?? null,
    p_base_url: baseUrl ?? null,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Déconnecter l'IA (supprime la clé — réservé aux admins). */
export async function clearOrgAiKey(): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('clear_org_ai_key');
  if (error) return { success: false, error: error.message };
  return { success: true };
}
