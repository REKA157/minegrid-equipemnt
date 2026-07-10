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
