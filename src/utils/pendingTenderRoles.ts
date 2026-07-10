// Affectations « Appels d'offres » EN ATTENTE, par e-mail.
// Posées au moment de l'INVITATION (la personne n'a pas encore de compte, donc
// pas d'user_id), puis converties en vrai rôle AO (roleAssignments du store
// tenders) dès qu'elle rejoint l'équipe — réconciliation par e-mail dans
// MultiUserManagement.
import type { UserRole as TenderRole } from '../tenders/types';

const KEY = 'minegrid-pending-ao-roles';

export interface PendingTenderRole {
  email: string;
  role: TenderRole;
}

const norm = (email: string) => email.trim().toLowerCase();

function readAll(): PendingTenderRole[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as PendingTenderRole[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: PendingTenderRole[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : on ignore silencieusement */
  }
}

/** Enregistre (ou remplace) l'affectation AO en attente pour un e-mail. */
export function addPendingTenderRole(email: string, role: TenderRole): void {
  const e = norm(email);
  if (!e) return;
  const list = readAll().filter((p) => norm(p.email) !== e);
  list.push({ email: e, role });
  writeAll(list);
}

/** Affectation AO en attente pour un e-mail (ou null). */
export function getPendingTenderRole(email: string): TenderRole | null {
  const e = norm(email);
  return readAll().find((p) => norm(p.email) === e)?.role ?? null;
}

/** Retire l'affectation en attente (après réconciliation). */
export function removePendingTenderRole(email: string): void {
  const e = norm(email);
  writeAll(readAll().filter((p) => norm(p.email) !== e));
}

// =====================================================================
// AFFECTATION (Commercial / Appels d'offres) EN ATTENTE, par e-mail.
// Même logique : posée à l'invitation, appliquée via set_member_scope dès que
// la personne rejoint (elle a alors un user_id).
// =====================================================================
const SCOPE_KEY = 'minegrid-pending-member-scopes';

export interface PendingMemberScope {
  email: string;
  commercial: boolean;
  tenders: boolean;
}

function readAllScopes(): PendingMemberScope[] {
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as PendingMemberScope[]) : [];
  } catch {
    return [];
  }
}

function writeAllScopes(list: PendingMemberScope[]): void {
  try {
    localStorage.setItem(SCOPE_KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

/** Enregistre (ou remplace) l'affectation en attente pour un e-mail. */
export function addPendingMemberScope(email: string, commercial: boolean, tenders: boolean): void {
  const e = norm(email);
  if (!e) return;
  const list = readAllScopes().filter((p) => norm(p.email) !== e);
  list.push({ email: e, commercial, tenders });
  writeAllScopes(list);
}

/** Affectation en attente pour un e-mail (ou null). */
export function getPendingMemberScope(email: string): { commercial: boolean; tenders: boolean } | null {
  const e = norm(email);
  const found = readAllScopes().find((p) => norm(p.email) === e);
  return found ? { commercial: found.commercial, tenders: found.tenders } : null;
}

/** Retire l'affectation en attente (après réconciliation). */
export function removePendingMemberScope(email: string): void {
  const e = norm(email);
  writeAllScopes(readAllScopes().filter((p) => norm(p.email) !== e));
}
