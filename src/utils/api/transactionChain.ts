import supabase from '../supabaseClient';
import { logger } from '../logger';

/**
 * Write-side dossier (L3/L4) — création contrôlée des lignes de chaîne via les RPC
 * SECURITY DEFINER (cf. sql/2026-06_transaction_chain_write_side.sql).
 *
 * Le client n'écrit JAMAIS directement les tables sensibles : il appelle ces RPC,
 * qui vérifient la participation, sont idempotentes (renvoient la ligne ouverte
 * existante) et ne simulent aucun paiement (escrow posé en 'awaiting_partner').
 *
 * Anti-façade : si la RPC n'est pas déployée, on renvoie honnêtement
 * `reason: 'not_deployed'` (aucun faux succès).
 */
export type ChainStep = 'inspection' | 'payment' | 'financing' | 'transport' | 'customs';

export type ChainStepReason = 'created' | 'not_deployed' | 'forbidden' | 'error';

export interface ChainStepResult {
  ok: boolean;
  id: string | null;
  reason: ChainStepReason;
}

function isMissingFunction(err: { message?: string } | null): boolean {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('function') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

async function callStepRpc(fn: string, args: Record<string, unknown>): Promise<ChainStepResult> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      if (isMissingFunction(error)) return { ok: false, id: null, reason: 'not_deployed' };
      if ((error.message || '').toLowerCase().includes('forbidden')) {
        return { ok: false, id: null, reason: 'forbidden' };
      }
      logger.warn(`[transactionChain:${fn}]`, error);
      return { ok: false, id: null, reason: 'error' };
    }
    const id = data == null || data === '' ? null : String(data);
    return id ? { ok: true, id, reason: 'created' } : { ok: false, id: null, reason: 'error' };
  } catch (e) {
    logger.warn(`[transactionChain:${fn}]`, e);
    return { ok: false, id: null, reason: 'error' };
  }
}

/** Étape inspection : crée inspection_request (assignée si mécanicien dispo, sinon « à assigner »). */
export function createInspectionStep(caseId: string): Promise<ChainStepResult> {
  return callStepRpc('create_inspection_step', { p_case_id: caseId });
}

/** Étape escrow : crée payment_record en 'awaiting_partner' (jamais un paiement réel). */
export function createPaymentStep(caseId: string): Promise<ChainStepResult> {
  return callStepRpc('create_payment_step', { p_case_id: caseId });
}

/** Étape financement : crée financing_request en 'a_examiner'. */
export function createFinancingStep(caseId: string, amount?: number | null): Promise<ChainStepResult> {
  return callStepRpc('create_financing_step', { p_case_id: caseId, p_amount: amount ?? null });
}

/** Étape transport : crée transport_request en 'a_planifier'. */
export function createTransportStep(
  caseId: string,
  pickup?: string | null,
  delivery?: string | null,
): Promise<ChainStepResult> {
  return callStepRpc('create_transport_step', {
    p_case_id: caseId,
    p_pickup: pickup ?? null,
    p_delivery: delivery ?? null,
  });
}

/** Étape douane : crée customs_case en 'a_traiter' (acheminement international). */
export function createCustomsStep(
  caseId: string,
  origin?: string | null,
  destination?: string | null,
): Promise<ChainStepResult> {
  return callStepRpc('create_customs_step', {
    p_case_id: caseId,
    p_origin: origin ?? null,
    p_destination: destination ?? null,
  });
}

/** Orchestrateur : avance le dossier à une étape et crée la ligne de chaîne correspondante. */
export function advanceTransactionCaseStep(caseId: string, step: ChainStep): Promise<ChainStepResult> {
  return callStepRpc('advance_transaction_case_step', { p_case_id: caseId, p_step: step });
}

/* -------------------------------------------------------------------------
 * Réseau partenaire — assignation d'un partenaire au dossier
 * (cf. sql/2026-06_transaction_participant_assign.sql).
 * Sans participant du rôle requis, les étapes de chaîne restent « à assigner »
 * et les cartes cockpit M4-M7 n'apparaissent pas chez le partenaire.
 * ---------------------------------------------------------------------- */

/** Rôles partenaire assignables (liste blanche, alignée sur la RPC). */
export type PartnerRole = 'mechanic' | 'broker' | 'carrier' | 'forwarder' | 'logistician' | 'investor';

export type PartnerAssignReason =
  | 'assigned'
  | 'revoked'
  | 'not_deployed'
  | 'forbidden'
  | 'partner_not_found'
  | 'error';

export interface PartnerAssignResult {
  ok: boolean;
  id: string | null;
  reason: PartnerAssignReason;
}

/** Assigne un partenaire (résolu par email) à un rôle du dossier. Idempotent côté serveur. */
export async function assignTransactionPartner(
  caseId: string,
  role: PartnerRole,
  email: string,
): Promise<PartnerAssignResult> {
  try {
    const { data, error } = await supabase.rpc('assign_transaction_partner', {
      p_case_id: caseId,
      p_role: role,
      p_partner_email: email,
    });
    if (error) {
      if (isMissingFunction(error)) return { ok: false, id: null, reason: 'not_deployed' };
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('partner_not_found')) return { ok: false, id: null, reason: 'partner_not_found' };
      if (msg.includes('forbidden')) return { ok: false, id: null, reason: 'forbidden' };
      logger.warn('[transactionChain:assign_transaction_partner]', error);
      return { ok: false, id: null, reason: 'error' };
    }
    const id = data == null || data === '' ? null : String(data);
    return id ? { ok: true, id, reason: 'assigned' } : { ok: false, id: null, reason: 'error' };
  } catch (e) {
    logger.warn('[transactionChain:assign_transaction_partner]', e);
    return { ok: false, id: null, reason: 'error' };
  }
}

/** Révoque un partenaire du dossier (réversible côté serveur : pose revoked_at). */
export async function revokeTransactionPartner(
  caseId: string,
  participantId: string,
): Promise<PartnerAssignResult> {
  try {
    const { data, error } = await supabase.rpc('revoke_transaction_partner', {
      p_case_id: caseId,
      p_participant_id: participantId,
    });
    if (error) {
      if (isMissingFunction(error)) return { ok: false, id: null, reason: 'not_deployed' };
      if ((error.message || '').toLowerCase().includes('forbidden')) {
        return { ok: false, id: null, reason: 'forbidden' };
      }
      logger.warn('[transactionChain:revoke_transaction_partner]', error);
      return { ok: false, id: null, reason: 'error' };
    }
    const id = data == null || data === '' ? null : String(data);
    return { ok: id != null, id, reason: 'revoked' };
  } catch (e) {
    logger.warn('[transactionChain:revoke_transaction_partner]', e);
    return { ok: false, id: null, reason: 'error' };
  }
}
