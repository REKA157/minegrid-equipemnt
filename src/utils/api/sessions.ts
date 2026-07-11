import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import { logger } from '../logger';

// =====================================================
// HISTORIQUE DES SESSIONS (connexion / déconnexion)
// =====================================================
// Le suivi est AUTORITAIRE côté serveur : table member_sessions + RPC
// SECURITY DEFINER (cf. migration 20260711140000_teamH_member_sessions.sql).
// Le client se contente d'appeler record_session_login au SIGNED_IN et
// record_session_logout AVANT le signOut. L'org et la propriété sont forcées
// côté serveur : le navigateur ne peut ni mentir, ni fermer la session d'autrui.

/** Clé locale : mémorise la session serveur en cours pour pouvoir la fermer. */
const LS_KEY = 'mg_session';
/** Fenêtre anti-doublon côté client (ms) : deux SIGNED_IN rapprochés = 1 session. */
const DEDUP_WINDOW_MS = 120_000;

interface StoredSession {
  id: string;
  uid: string;
  ts: number;
}

export interface MemberSession {
  id: string;
  user_id: string;
  login_at: string;
  logout_at: string | null;
  user_agent: string | null;
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

/**
 * Enregistre une CONNEXION. À appeler UNIQUEMENT sur l'évènement SIGNED_IN
 * (jamais sur TOKEN_REFRESHED / INITIAL_SESSION). Best-effort : n'interrompt
 * jamais le flux d'auth en cas d'échec.
 */
export async function recordSessionLogin(userId: string): Promise<void> {
  try {
    // Anti-doublon local : même utilisateur, connexion très récente -> on ne recrée pas.
    const prev = readStored();
    if (prev && prev.uid === userId && prev.id && Date.now() - prev.ts < DEDUP_WINDOW_MS) {
      return;
    }

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
    const { data, error } = await supabase.rpc('record_session_login', { p_user_agent: ua });
    if (error) {
      logger.error('[sessions] record_session_login', error);
      return;
    }
    const id = (data as string | null) ?? null;
    if (id) {
      localStorage.setItem(LS_KEY, JSON.stringify({ id, uid: userId, ts: Date.now() }));
    }
  } catch (e) {
    logger.error('[sessions] recordSessionLogin exception', e);
  }
}

/**
 * Enregistre une DÉCONNEXION. À appeler AVANT supabase.auth.signOut()
 * (après, auth.uid() est null et le serveur ne peut plus fermer la session).
 * Best-effort : n'empêche jamais la déconnexion.
 */
export async function recordSessionLogout(): Promise<void> {
  try {
    const prev = readStored();
    localStorage.removeItem(LS_KEY);
    if (prev?.id) {
      const { error } = await supabase.rpc('record_session_logout', { p_session_id: prev.id });
      if (error) logger.error('[sessions] record_session_logout', error);
    }
  } catch (e) {
    logger.error('[sessions] recordSessionLogout exception', e);
  }
}

/**
 * Historique des sessions d'un membre (Gestion d'équipe). Autorisé si l'appelant
 * est ce membre, ou admin/owner de sa société (sinon []). Lecture tolérante.
 */
export async function getMemberSessions(userId: string, limit = 50): Promise<MemberSession[]> {
  return supabaseCall<MemberSession[]>(
    () => supabase.rpc('get_member_sessions', { p_user_id: userId, p_limit: limit }),
    { label: 'getMemberSessions', fallback: [] },
  );
}

/**
 * Nombre de membres de la société connectés aujourd'hui (carte statistique).
 * Réservé serveur aux admins/owner ; renvoie 0 si non autorisé ou en cas d'échec.
 */
export async function getOrgSessionStats(): Promise<number> {
  return supabaseCall<number>(
    () => supabase.rpc('get_org_session_stats'),
    { label: 'getOrgSessionStats', fallback: 0 },
  );
}
