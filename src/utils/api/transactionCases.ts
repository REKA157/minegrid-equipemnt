import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

export type TransactionCaseKind = 'sale' | 'rental' | 'financing' | 'other';
export type TransactionCaseStatus =
  | 'draft'
  | 'qualified'
  | 'negotiation'
  | 'contract'
  | 'payment'
  | 'logistics'
  | 'customs'
  | 'delivery'
  | 'closed'
  | 'cancelled';

export interface TransactionCaseRow {
  id: string;
  kind: TransactionCaseKind;
  status: TransactionCaseStatus;
  machine_id: string | null;
  seller_user_id: string;
  buyer_user_id: string | null;
  primary_quote_request_id: string | null;
  primary_lead_id: string | null;
  title: string | null;
  notes: string | null;
  created_by: string | null;
  organization_id?: string | null;
  stage?: string | null;
  priority?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export type ParticipantRole =
  | 'seller'
  | 'buyer'
  | 'broker'
  | 'mechanic'
  | 'carrier'
  | 'forwarder'
  | 'logistician'
  | 'investor'
  | 'admin_delegate'
  | 'other';

export interface TransactionParticipantRow {
  id: string;
  case_id: string;
  user_id: string;
  role: ParticipantRole;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  scope: Record<string, unknown>;
  organization_id?: string | null;
  permissions?: Record<string, unknown> | null;
  participant_status?: string | null;
}

export interface TransactionEventRow {
  id: string;
  case_id: string;
  actor_user_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  description?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  const msg = (e?.message || '').toLowerCase();
  return code === 'PGRST205' || msg.includes('could not find the table');
}

export async function getTransactionCase(caseId: string): Promise<TransactionCaseRow | null> {
  try {
    return await supabaseCall<TransactionCaseRow | null>(
      () =>
        supabase.from('transaction_cases').select('*').eq('id', caseId).maybeSingle(),
      { label: 'getTransactionCase', fallback: null },
    );
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

/**
 * Dossiers accessibles (RLS) : vendeur, acheteur, participant ou admin d'organisation associée.
 */
export async function listAccessibleTransactionCases(): Promise<TransactionCaseRow[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return [];

  try {
    return await supabaseCall<TransactionCaseRow[]>(
      () =>
        supabase
          .from('transaction_cases')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(200),
      { label: 'listAccessibleTransactionCases', fallback: [] },
    );
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

/** @deprecated alias — préférez listAccessibleTransactionCases */
export async function listMyTransactionCases(): Promise<TransactionCaseRow[]> {
  return listAccessibleTransactionCases();
}

export async function listTransactionParticipants(
  caseId: string,
): Promise<TransactionParticipantRow[]> {
  try {
    return await supabaseCall<TransactionParticipantRow[]>(
      () =>
        supabase
          .from('transaction_participants')
          .select('*')
          .eq('case_id', caseId)
          .order('invited_at', { ascending: true }),
      { label: 'listTransactionParticipants', fallback: [] },
    );
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

/** Invitation partenaire en attente, enrichie du titre du dossier (pour l'affichage cockpit). */
export interface PendingInvitationRow extends TransactionParticipantRow {
  case_title: string | null;
}

const PARTNER_ROLES = ['mechanic', 'broker', 'carrier', 'forwarder', 'logistician', 'investor'];

/**
 * Invitations partenaire EN ATTENTE pour l'utilisateur courant
 * (accepted_at NULL, revoked_at NULL, rôle partenaire). La RLS autorise la lecture :
 * can_access_transaction_case ne filtre que sur revoked_at, donc l'invité non encore
 * accepté voit déjà sa ligne et le dossier (embed du titre via la FK case_id).
 */
export async function listPendingInvitationsWithCase(): Promise<PendingInvitationRow[]> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return [];

  try {
    const rows = await supabaseCall<
      Array<TransactionParticipantRow & { transaction_cases?: { title: string | null } | null }>
    >(
      () =>
        supabase
          .from('transaction_participants')
          .select('*, transaction_cases(title)')
          .eq('user_id', uid)
          .in('role', PARTNER_ROLES)
          .is('accepted_at', null)
          .is('revoked_at', null)
          .order('invited_at', { ascending: false }),
      { label: 'listPendingInvitationsWithCase', fallback: [] },
    );
    return rows.map((r) => {
      const { transaction_cases, ...rest } = r;
      return { ...(rest as TransactionParticipantRow), case_title: transaction_cases?.title ?? null };
    });
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

export async function listTransactionEvents(caseId: string): Promise<TransactionEventRow[]> {
  try {
    return await supabaseCall<TransactionEventRow[]>(
      () =>
        supabase
          .from('transaction_events')
          .select('*')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(200),
      { label: 'listTransactionEvents', fallback: [] },
    );
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}
