import supabase from './supabaseClient';
import { USER_INVITATION_COLUMNS } from '../constants/proClientQueryFields';

// Rôles que l'on peut attribuer à une invitation (on n'invite jamais un owner).
export type InvitableRole = 'admin' | 'manager' | 'viewer';

export interface UserInvitation {
  id: string;
  email: string;
  name: string;
  role: InvitableRole;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  invited_by: string;
  expires_at: string;
  accepted_at?: string;
  accepted_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserData {
  email: string;
  name: string;
  role: InvitableRole;
  password?: string;
}

/**
 * Construit le lien d'invitation à partager (WhatsApp, email…). Le collègue
 * l'ouvre, se connecte avec l'email invité, puis rejoint la société.
 */
export function buildInvitationLink(token: string, email?: string): string {
  const base = `${window.location.origin}${window.location.pathname}`.replace(/\/+$/, '');
  // On joint l'email (déjà connu de l'invité) : la page d'acceptation le pré-remplit
  // et l'inscription d'un invité s'affiche en mode simplifié.
  const emailQ = email ? `&email=${encodeURIComponent(email)}` : '';
  return `${base}/#accepter-invitation?token=${encodeURIComponent(token)}${emailQ}`;
}

/**
 * La création directe d'un compte depuis le navigateur exigerait la clé
 * service_role (qui ne doit JAMAIS être dans le front). On passe désormais par
 * les invitations par lien : inviteUser().
 */
export async function createUserAccount(
  _userData: CreateUserData,
): Promise<{ success: boolean; error?: string; userId?: string }> {
  return {
    success: false,
    error:
      "La création directe de compte n'est pas disponible. Utilisez « Inviter un utilisateur » : un lien d'invitation à partager sera généré.",
  };
}

/**
 * Inviter un membre : la fonction SQL create_invitation vérifie que vous êtes
 * admin de votre société, crée l'invitation et renvoie un jeton. On en construit
 * un LIEN à partager.
 */
export async function inviteUser(
  email: string,
  name: string,
  role: InvitableRole,
): Promise<{ success: boolean; error?: string; invitationId?: string; link?: string }> {
  const { data, error } = await supabase.rpc('create_invitation', {
    p_email: email,
    p_name: name,
    p_role: role,
  });

  if (error) {
    return { success: false, error: friendlyRpcError(error.message) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) {
    return { success: false, error: "L'invitation n'a pas pu être créée." };
  }
  return { success: true, invitationId: row.id, link: buildInvitationLink(row.token, email) };
}

/** Liste les invitations de la société (RLS : réservé aux admins de la société). */
export async function getUserInvitations(): Promise<UserInvitation[]> {
  const { data, error } = await supabase
    .from('user_invitations')
    .select(USER_INVITATION_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erreur récupération invitations:', error);
    return [];
  }
  return (data as UserInvitation[]) || [];
}

/**
 * Annuler une invitation en attente. L'écriture directe étant révoquée, on passe
 * par la fonction SQL cancel_invitation, qui vérifie que vous êtes admin de la
 * société de l'invitation.
 */
export async function cancelInvitation(invitationId: string): Promise<boolean> {
  const { error } = await supabase.rpc('cancel_invitation', { p_invitation_id: invitationId });
  if (error) {
    console.error('Erreur annulation invitation:', error);
    return false;
  }
  return true;
}

/**
 * Accepter une invitation : la personne DOIT être connectée avec l'email invité.
 * La fonction SQL accept_invitation la rattache à la société avec le bon rôle.
 */
export async function acceptInvitation(
  token: string,
): Promise<{ success: boolean; error?: string; organizationName?: string; role?: string }> {
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if (error) {
    return { success: false, error: friendlyRpcError(error.message) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { success: true, organizationName: row?.organization_name, role: row?.role };
}

// Les messages levés par les fonctions SQL sont déjà rédigés en français :
// on les renvoie tels quels, avec un repli générique.
function friendlyRpcError(message?: string): string {
  return message && message.trim() ? message : 'Une erreur est survenue.';
}
