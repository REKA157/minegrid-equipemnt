import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

// =====================================================
// ORGANISATION / ÉQUIPE (modèle « société »)
// =====================================================
// Les membres d'une société sont exposés via la fonction SQL
// `get_org_members()` (SECURITY DEFINER, scopée à l'org de l'appelant —
// cf. migration 20260708130000_teamB_org_members_rpc.sql). On ne lit JAMAIS
// user_profiles / auth.users directement : c'est la RPC qui autorise la
// lecture, de façon strictement limitée à sa propre équipe.

export type OrgRole = 'owner' | 'admin' | 'manager' | 'viewer';

export interface OrgMember {
  user_id: string;
  organization_id: string;
  role: OrgRole;
  /** Date d'ajout à la société. */
  member_since: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  /** Dernière connexion (null = ne s'est jamais connecté). */
  last_sign_in_at: string | null;
}

/**
 * Liste les membres de la société de l'utilisateur connecté.
 * Lecture tolérante : renvoie [] en cas d'échec (la page reste affichable).
 */
export async function getOrgMembers(): Promise<OrgMember[]> {
  return supabaseCall<OrgMember[]>(
    () => supabase.rpc('get_org_members'),
    { label: 'getOrgMembers', fallback: [] },
  );
}

/** Retire RÉELLEMENT un membre de la société (RPC admin, coupe son accès). */
export async function removeOrgMember(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('remove_org_member', { p_user_id: userId });
  if (error) return { ok: false, error: error.message };
  return (data as { ok: boolean; error?: string }) ?? { ok: false, error: 'Erreur inconnue' };
}

/** Change le rôle société d'un membre (RPC admin). */
export async function setOrgMemberRole(userId: string, role: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('set_org_member_role', { p_user_id: userId, p_role: role });
  if (error) return { ok: false, error: error.message };
  return (data as { ok: boolean; error?: string }) ?? { ok: false, error: 'Erreur inconnue' };
}
