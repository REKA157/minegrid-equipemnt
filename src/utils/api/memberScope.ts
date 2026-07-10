import supabase from '../supabaseClient';

/**
 * AFFECTATION d'un membre : à quels espaces il a accès.
 *  - commercial : dashboard entreprise / pipeline / annonces ;
 *  - tenders    : module Appels d'offres.
 * Stockée côté serveur (organization_member_scopes) et lue au chargement pour
 * rediriger le membre hors des espaces auxquels il n'est pas affecté.
 */
export interface MemberScope {
  commercial: boolean;
  tenders: boolean;
}

/** Défaut « accès à tout » : aucun blocage (membre sans affectation explicite, hors ligne, ou erreur). */
export const FULL_SCOPE: MemberScope = { commercial: true, tenders: true };

/** Affectation de l'utilisateur connecté (défaut : accès aux deux). */
export async function getMyMemberScope(): Promise<MemberScope> {
  try {
    const { data, error } = await supabase.rpc('get_my_member_scope');
    if (error) return FULL_SCOPE;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return FULL_SCOPE;
    // On ne restreint QUE sur un `false` explicite ; tout le reste = accès.
    return { commercial: row.commercial !== false, tenders: row.tenders !== false };
  } catch {
    return FULL_SCOPE;
  }
}

/** Régler l'affectation d'un membre (réservé aux admins de la société côté serveur). */
export async function setMemberScope(
  userId: string,
  commercial: boolean,
  tenders: boolean,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('set_member_scope', {
    p_user_id: userId,
    p_commercial: commercial,
    p_tenders: tenders,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
