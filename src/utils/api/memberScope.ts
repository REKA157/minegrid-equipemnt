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
  /** true si l'affectation ET le rôle ont été CONFIRMÉS par le serveur (et non un
   *  défaut de chargement/erreur réseau). Un résultat non confirmé n'est PAS mis
   *  en cache : on retente à la navigation suivante, pour ne pas figer un
   *  fail-open (ex. un invité dont get_org_members a échoué une fois). */
  roleKnown?: boolean;
}

/** Défaut « accès à tout » : aucun blocage (membre sans affectation explicite, hors ligne, ou erreur). */
export const FULL_SCOPE: MemberScope = { commercial: true, tenders: true, role: null, roleKnown: false };

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

async function fetchScope(): Promise<{ commercial: boolean; tenders: boolean; known: boolean }> {
  try {
    const { data, error } = await supabase.rpc('get_my_member_scope');
    if (error) return { commercial: true, tenders: true, known: false };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { commercial: true, tenders: true, known: true };
    // On ne restreint QUE sur un `false` explicite ; tout le reste = accès.
    return { commercial: row.commercial !== false, tenders: row.tenders !== false, known: true };
  } catch {
    return { commercial: true, tenders: true, known: false };
  }
}

/**
 * Rôle société de l'appelant, déduit de get_org_members (déjà déployée).
 * `known=false` = la détection a ÉCHOUÉ (réseau/RPC) — à distinguer de `role=null`
 * confirmé (compte sans société). On ne veut PAS traiter une erreur comme
 * « owner/compte perso » ni la mémoriser.
 */
async function fetchMyRole(): Promise<{ role: string | null; known: boolean }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { role: null, known: true }; // pas de session = pas de rôle, confirmé
    const { data, error } = await supabase.rpc('get_org_members');
    if (error) return { role: null, known: false };
    const rows = (data as Array<{ user_id: string; role: string }>) || [];
    return { role: rows.find((r) => r.user_id === user.id)?.role ?? null, known: true };
  } catch {
    return { role: null, known: false };
  }
}

async function fetchMyMemberScope(): Promise<MemberScope> {
  const [scope, roleRes] = await Promise.all([fetchScope(), fetchMyRole()]);
  return {
    commercial: scope.commercial,
    tenders: scope.tenders,
    role: roleRes.role,
    roleKnown: scope.known && roleRes.known,
  };
}

/** Affectation de l'utilisateur connecté (défaut : accès aux deux). Mise en cache
 *  UNIQUEMENT si le résultat est confirmé — un échec réseau/RPC n'est pas mémorisé. */
export async function getMyMemberScope(): Promise<MemberScope> {
  if (!scopeCache) {
    const pending = fetchMyMemberScope();
    scopeCache = pending;
    // Ne pas figer un résultat NON confirmé (erreur) : on autorise un nouvel essai
    // à la navigation suivante au lieu de bloquer sur un fail-open toute la session.
    pending
      .then((s) => {
        if (!s.roleKnown) scopeCache = null;
      })
      .catch(() => {
        scopeCache = null;
      });
  }
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
