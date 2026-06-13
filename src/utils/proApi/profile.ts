import { PRO_CLIENT_COLUMNS } from '../../constants/proClientQueryFields';
import type { ProClient } from './types';
import supabase from '../supabaseClient';

// =====================================================
// FONCTIONS API PRO CLIENTS
// =====================================================

// Récupérer le profil client pro (LECTURE SEULE).
//
// SÉCURITÉ : cette fonction ne crée JAMAIS d'abonnement. L'ancienne version
// insérait automatiquement une ligne `pro_clients` "pro/active" valable 1 an dès
// qu'un appel échouait — soit un contournement total du paiement. L'activation
// d'un abonnement est désormais EXCLUSIVEMENT serveur : voir
// `supabase/functions/stripe-webhook/` (webhook Stripe + service_role) et la RLS
// durcie `sql/2026-06_pro_clients_rls_hardening.sql` (écritures interdites au client).
export async function getProClientProfile(): Promise<ProClient | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: proProfile, error } = await supabase
      .from('pro_clients')
      .select(PRO_CLIENT_COLUMNS)
      .eq('user_id', user.id)
      .single();

    // PGRST116 = aucune ligne : l'utilisateur n'a tout simplement pas d'abonnement.
    if (error && error.code !== 'PGRST116') {
      return null;
    }

    return proProfile ?? null;
  } catch {
    return null;
  }
}

// Créer ou mettre à jour le profil client pro
export async function upsertProClientProfile(profile: Partial<ProClient>): Promise<ProClient | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté');

    const { data, error } = await supabase
      .from('pro_clients')
      .upsert({
        user_id: user.id,
        ...profile
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du profil pro:', error);
    return null;
  }
}
