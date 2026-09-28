/**
 * Logique d'affichage de la gestion d'équipe, sortie de MultiUserManagement.tsx
 * (1 228 lignes).
 *
 * Ces fonctions sont PURES : une entrée, une sortie, aucun état, aucun appel
 * réseau. Elles n'avaient pourtant aucun test, parce qu'il fallait monter toute
 * la page — et la page exige une organisation, des membres et une session.
 *
 * Ce qu'elles décident n'est pas cosmétique : `orgMemberToTeamMember` traduit
 * un rôle en liste de permissions AFFICHÉES. Les permissions réelles sont
 * posées par la RLS côté base ; si les deux divergent, l'écran ment à
 * l'utilisateur sur ce qu'il a le droit de faire.
 *
 * Aucun comportement n'a été modifié pendant le déplacement.
 */

import type { OrgMember, OrgRole } from '../utils/api/organization';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: OrgRole;
  status: 'active' | 'inactive' | 'pending';
  lastLogin: string;
  permissions: string[];
  avatar?: string;
}

// Rôle -> permissions (indicatif, pour l'affichage). Les permissions réelles
// sont posées par la RLS côté base ; ici on résume ce que chaque rôle peut faire.
export const PERMISSIONS_BY_ROLE: Record<OrgRole, string[]> = {
  owner: ['all'],
  admin: ['all'],
  manager: ['dashboard', 'machines', 'orders', 'analytics'],
  viewer: ['dashboard'],
};

// Convertit un membre d'organisation (get_org_members) vers la forme UI.
export function orgMemberToTeamMember(m: OrgMember): TeamMember {
  const fullName = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
  const name = fullName || m.email || 'Membre';
  const initials =
    (fullName
      ? fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('')
      : (m.email ?? 'M').slice(0, 2)
    ).toUpperCase();
  const lastLogin = m.last_sign_in_at
    ? new Date(m.last_sign_in_at).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : 'Jamais connecté';
  return {
    id: m.user_id,
    name,
    email: m.email ?? '',
    role: m.role,
    // Un membre présent dans organization_members a accepté : il est actif.
    // (Les invitations « en attente » vivent dans user_invitations — Phase 4.)
    status: 'active',
    lastLogin,
    permissions: PERMISSIONS_BY_ROLE[m.role] ?? ['dashboard'],
    avatar: initials,
  };
}

/** Format court « 09/07/2026 14:32 ». */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Durée lisible entre connexion et déconnexion (session fermée uniquement). */
export function fmtDuration(login: string, logout: string): string {
  const ms = new Date(logout).getTime() - new Date(login).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "moins d'une minute";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Appareil/navigateur résumé depuis le user-agent (best-effort, lisible). */
export function shortDevice(ua: string | null): string {
  if (!ua) return 'Appareil inconnu';
  let os = '';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let br = '';
  if (/Edg\//i.test(ua)) br = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) br = 'Opera';
  else if (/Chrome\//i.test(ua)) br = 'Chrome';
  else if (/Firefox\//i.test(ua)) br = 'Firefox';
  else if (/Safari\//i.test(ua)) br = 'Safari';
  const label = [br, os].filter(Boolean).join(' · ');
  return label || 'Appareil inconnu';
}
