import supabase from '../supabaseClient';
import { logger } from '../logger';

/**
 * Pont escrow (cf. sql/2026-06_escrow_bridge.sql) — relie le dossier (payment_records)
 * à l'escrow réel PSP (escrow_transactions). Le client n'écrit jamais escrow_transactions
 * directement ; il appelle ces RPC SECURITY DEFINER. AUCUN paiement n'est simulé :
 * `open` crée un escrow en statut 'created' (ouvert, NON financé) ; le financement réel
 * arrive via le webhook PSP signé. Retours honnêtes (anti-façade).
 */
export type EscrowBridgeReason =
  | 'opened'
  | 'linked'
  | 'not_deployed'
  | 'forbidden'
  | 'buyer_required'
  | 'amount_required'
  | 'machine_required'
  | 'escrow_not_found'
  | 'escrow_already_linked'
  | 'error';

export interface EscrowBridgeResult {
  ok: boolean;
  id: string | null;
  reason: EscrowBridgeReason;
}

function isMissingFunction(err: { message?: string } | null): boolean {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('function') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

function reasonFromMessage(msg: string): EscrowBridgeReason | null {
  const m = msg.toLowerCase();
  if (m.includes('buyer_required')) return 'buyer_required';
  if (m.includes('amount_required')) return 'amount_required';
  if (m.includes('machine_required')) return 'machine_required';
  if (m.includes('escrow_not_found')) return 'escrow_not_found';
  if (m.includes('escrow_already_linked')) return 'escrow_already_linked';
  if (m.includes('forbidden')) return 'forbidden';
  return null;
}

async function callBridgeRpc(
  fn: 'open_case_escrow' | 'link_case_to_escrow',
  args: Record<string, unknown>,
  okReason: 'opened' | 'linked',
): Promise<EscrowBridgeResult> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      if (isMissingFunction(error)) return { ok: false, id: null, reason: 'not_deployed' };
      const mapped = reasonFromMessage(error.message || '');
      if (mapped) return { ok: false, id: null, reason: mapped };
      logger.warn(`[escrowBridge:${fn}]`, error);
      return { ok: false, id: null, reason: 'error' };
    }
    const id = data == null || data === '' ? null : String(data);
    return id ? { ok: true, id, reason: okReason } : { ok: false, id: null, reason: 'error' };
  } catch (e) {
    logger.warn(`[escrowBridge:${fn}]`, e);
    return { ok: false, id: null, reason: 'error' };
  }
}

/** Ouvre un escrow (statut 'created', NON financé) pour le dossier. Idempotent côté serveur. */
export function openCaseEscrow(caseId: string): Promise<EscrowBridgeResult> {
  return callBridgeRpc('open_case_escrow', { p_case_id: caseId }, 'opened');
}

/** Rattache un escrow PSP existant à un dossier (le miroir payment_records se synchronise). */
export function linkCaseToEscrow(caseId: string, escrowId: string): Promise<EscrowBridgeResult> {
  return callBridgeRpc('link_case_to_escrow', { p_case_id: caseId, p_escrow_id: escrowId }, 'linked');
}
