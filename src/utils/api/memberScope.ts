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
  /** Rôle société de l'utilisateur : owner/admin/manager/viewer, ou null/absent
   *  s'il n'est membre d'aucune société (compte autonome). Sert à réserver
   *  certaines pages (Mon espace, Gestion d'équipe) au PROPRIÉTAIRE.
   *  Optionnel : les affectations d'AUTRES membres (MultiUserManagement) n'ont
   *  pas ce champ. */
  role?: string | null;
}

/** Défaut « accès à tout » : aucun blocage (membre sans affectation explicite, hors ligne, ou erreur). */
export const FULL_SCOPE: MemberScope = { commercial: true, tenders: true, role: null };

/** true = membre INVITÉ (dans une société, mais pas le propriétaire). */
export function isInvitedMember(scope: MemberScope): boolean {
  return scope.role != null && scope.role !== 'owner';
}

// Cache de session : App + menus partagent une seule requête (l'affectation ne
// change pas en cours de session pour le membre lui-même).
let scopeCache: Promise<MemberScope> | null = null;

/** Force un nouveau chargement de l'affectation (après un changement admin). */
export function invalidateMemberScopeCache(): void {
  scopeCache = null;
}

async function fetchScope(): Promise<{ commercial: boolean; tenders: boolean }> {
  try {
    const { data, error } = await supabase.rpc('get_my_member_scope');
    if (error) return { commercial: true, tenders: true };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { commercial: true, tenders: true };
    // On ne restreint QUE sur un `false` explicite ; tout le reste = accès.
    return { commercial: row.commercial !== false, tenders: row.tenders !== false };
  } catch {
    return { commercial: true, tenders: true };
  }
}

/** Rôle société de l'appelant, déduit de get_org_members (déjà déployée). */
async function fetchMyRole(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.rpc('get_org_members');
    if (error) return null;
    const rows = (data as Array<{ user_id: string; role: string }>) || [];
    return rows.find((r) => r.user_id === user.id)?.role ?? null;
  } catch {
    return null;
  }
}

async function fetchMyMemberScope(): Promise<MemberScope> {
  const [scope, role] = await Promise.all([fetchScope(), fetchMyRole()]);
  return { ...scope, role };
}

/** Affectation de l'utilisateur connecté (défaut : accès aux deux). Mise en cache. */
export async function getMyMemberScope(): Promise<MemberScope> {
  if (!scopeCache) scopeCache = fetchMyMemberScope();
  return scopeCache;
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
