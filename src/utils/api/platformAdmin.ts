import supabase from '../supabaseClient';

/**
 * Console d'administration de la plateforme — accès aux fonctions serveur.
 *
 * RÈGLE : le navigateur ne décide JAMAIS qui est administrateur. Il pose la
 * question au serveur (`is_platform_admin`, sans paramètre : l'identité vient
 * de la session), et le serveur revérifie de toute façon à chaque geste. Les
 * écrans ne sont qu'un confort d'affichage — la sécurité est en base.
 *
 * En cas de doute — erreur réseau, réponse inattendue, session absente — on
 * répond NON. Un refus injustifié se corrige d'un rechargement ; un accès
 * accordé par erreur ouvre la liste de tous les abonnés.
 */

export interface PlatformAdmin {
  userId: string;
  email: string;
  role: 'owner' | 'support' | 'finance' | 'moderation';
  grantedAt: string | null;
  revokedAt: string | null;
  actif: boolean;
}

/** L'utilisateur connecté est-il administrateur de la plateforme, MAINTENANT ? */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_platform_admin');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** Rôle d'administration de l'appelant, ou null s'il n'en a aucun. */
export async function getPlatformAdminRole(): Promise<PlatformAdmin['role'] | null> {
  try {
    const { data, error } = await supabase.rpc('platform_admin_role');
    if (error || typeof data !== 'string') return null;
    return data as PlatformAdmin['role'];
  } catch {
    return null;
  }
}

/** La liste des administrateurs — le serveur refuse si l'appelant n'en est pas un. */
export async function listPlatformAdmins(): Promise<PlatformAdmin[]> {
  const { data, error } = await supabase.rpc('list_platform_admins');
  if (error) throw new Error(error.message);
  const lignes = Array.isArray(data) ? data : [];
  return lignes.map((l: Record<string, unknown>) => ({
    userId: String(l.user_id ?? ''),
    email: String(l.email ?? ''),
    role: (l.role as PlatformAdmin['role']) ?? 'support',
    grantedAt: (l.granted_at as string) ?? null,
    revokedAt: (l.revoked_at as string) ?? null,
    actif: Boolean(l.actif),
  }));
}

/** Nommer un administrateur. Motif écrit obligatoire — le serveur l'exige aussi. */
export async function grantPlatformAdmin(
  email: string,
  role: PlatformAdmin['role'],
  motif: string,
): Promise<void> {
  const { error } = await supabase.rpc('grant_platform_admin', {
    p_email: email,
    p_role: role,
    p_reason: motif,
  });
  if (error) throw new Error(error.message);
}

/** Révoquer un administrateur. Le serveur refuse le dernier actif et soi-même. */
export async function revokePlatformAdmin(userId: string, motif: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_platform_admin', {
    p_user_id: userId,
    p_reason: motif,
  });
  if (error) throw new Error(error.message);
}
