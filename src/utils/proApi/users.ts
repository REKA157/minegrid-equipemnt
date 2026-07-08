import { CLIENT_USER_COLUMNS, USER_INVITATION_COLUMNS } from '../../constants/proClientQueryFields';
import type { ClientUser, UserInvitation } from './types';
import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import { logger } from '../logger';

// =====================================================
// FONCTIONS API UTILISATEURS CLIENTS
// =====================================================

// Récupérer les utilisateurs d'un client
export async function getClientUsers(): Promise<ClientUser[]> {
  return supabaseCall<ClientUser[]>(
    () => supabase.from('client_users').select(CLIENT_USER_COLUMNS).eq('is_active', true),
    { label: 'getClientUsers', fallback: [] },
  );
}

// Inviter un nouvel utilisateur à l'espace Pro.
// Passe par la fonction SQL create_invitation (SECURITY DEFINER) : plus aucun
// INSERT direct dans user_invitations (l'écriture directe est révoquée), et
// c'est la fonction qui vérifie que l'appelant est admin de sa société, force
// le scope société et génère le jeton.
export async function inviteClientUser(email: string, role: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('create_invitation', {
    p_email: email,
    p_name: null,
    p_role: role,
  });
  if (error) {
    logger.error('[inviteClientUser] echec', error);
    return false;
  }
  const row = Array.isArray(data) ? data[0] : data;
  logger.info('[inviteClientUser] invitation creee', { email, role });
  return Boolean(row?.token);
}

// Récupérer les invitations d'utilisateurs de l'espace Pro
export async function getUserInvitations(): Promise<UserInvitation[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logger.error('[getUserInvitations] utilisateur non connecte');
    return [];
  }

  return supabaseCall<UserInvitation[]>(
    () =>
      supabase
        .from('user_invitations')
        .select(USER_INVITATION_COLUMNS)
        .order('created_at', { ascending: false }),
    { label: 'getUserInvitations', fallback: [] },
  );
}

// Annuler une invitation
export async function cancelUserInvitation(invitationId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logger.error('[cancelUserInvitation] utilisateur non connecte');
    return false;
  }

  const { error } = await supabase.rpc('cancel_invitation', { p_invitation_id: invitationId });
  if (error) {
    logger.error('[cancelUserInvitation] echec', error);
    return false;
  }
  return true;
}
