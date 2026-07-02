import supabase from '../../utils/supabaseClient';
import type { EscrowStatus } from './escrowStateMachine';

// Escrow — accès client en LECTURE SEULE. La création et les transitions d'état
// passent par des Edge Functions serveur (create-escrow / escrow-webhook) ; le client
// ne peut pas écrire escrow_transactions (RLS 0002).

export interface EscrowTransaction {
  id: string;
  machine_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  currency: string;
  status: EscrowStatus;
  provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscrowEvent {
  id: string;
  escrow_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function getMyEscrows(): Promise<EscrowTransaction[]> {
  const { data, error } = await supabase
    .from('escrow_transactions')
    .select('id, machine_id, buyer_id, seller_id, amount, currency, status, provider, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) return [];
  return (data as EscrowTransaction[]) ?? [];
}

export async function getEscrowEvents(escrowId: string): Promise<EscrowEvent[]> {
  const { data, error } = await supabase
    .from('escrow_events')
    .select('id, escrow_id, event_type, payload, created_at')
    .eq('escrow_id', escrowId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data as EscrowEvent[]) ?? [];
}

/**
 * Initierait un séquestre via une Edge Function serveur (le client n'écrit pas la table).
 * NON ACTIVÉ : aucun prestataire de paiement (PSP) n'est connecté et l'Edge Function
 * `create-escrow` n'est pas déployée — cet appel échoue tant que l'opérateur n'est pas intégré.
 * Aucun fonds ne peut être séquestré, financé ni libéré aujourd'hui.
 */
export async function requestEscrow(input: {
  machine_id: string;
  seller_id: string;
  amount: number;
  currency?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('create-escrow', { body: input });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id?: string })?.id };
}
