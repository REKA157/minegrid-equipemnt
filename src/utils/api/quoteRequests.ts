import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import { logger } from '../logger';

export type QuoteRequestStatus = 'new' | 'contacted' | 'qualified' | 'closed';

export interface QuoteRequestPayload {
  machine_id: string;
  machine_name: string;
  brand?: string | null;
  seller_id?: string | null;
  buyer_name: string;
  buyer_email: string;
  buyer_phone?: string | null;
  country?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  need_by_date?: string | null;
  message?: string | null;
  source?: string | null;
  /** Renseigne cote serveur client si session ; requis par RLS pour insert authentifie */
  buyer_user_id?: string | null;
  transaction_case_id?: string | null;
}

export interface QuoteRequestRow extends QuoteRequestPayload {
  id: string;
  status: QuoteRequestStatus;
  created_at: string;
  updated_at: string;
}

/** Retour de `submitQuoteRequest` : dossier seulement si acheteur connecté, vendeur résolu, et liaison SQL/RLS OK. */
export interface SubmitQuoteResult {
  quoteId: string;
  transactionCaseId: string | null;
  buyerLoggedIn: boolean;
  sellerResolved: boolean;
  linkAttempted: boolean;
  /** Après création du dossier : participants buyer/seller insérés sans erreur (sinon voir patch RLS participants). */
  participantsLinked?: boolean | null;
}

function cleanQuotePayload(payload: QuoteRequestPayload): QuoteRequestPayload {
  return {
    machine_id: payload.machine_id,
    machine_name: payload.machine_name?.trim() || 'Machine',
    brand: payload.brand?.trim() || null,
    seller_id: payload.seller_id || null,
    buyer_name: payload.buyer_name.trim(),
    buyer_email: payload.buyer_email.trim().toLowerCase(),
    buyer_phone: payload.buyer_phone?.trim() || null,
    country: payload.country?.trim() || null,
    budget_min: payload.budget_min ?? null,
    budget_max: payload.budget_max ?? null,
    need_by_date: payload.need_by_date || null,
    message: payload.message?.trim() || null,
    source: payload.source?.trim() || 'machine_detail',
  };
}

function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const msg = (e?.message || '').toLowerCase();
  return e?.code === 'PGRST205' || msg.includes('could not find the table');
}

/** Accepte tout UUID Postgres / RFC (versions 1–8), sans rejeter falsed positive côté UI. */
export function parseSellerUuid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)
  ) {
    return null;
  }
  return t;
}

function isMissingSchemaColumnError(err: unknown): boolean {
  const hint = ((err as { message?: string })?.message || '').toLowerCase();
  return (
    hint.includes('column') &&
    (hint.includes('does not exist') || hint.includes('schema cache'))
  );
}

async function fetchSellerUserIdFromMachine(machineId: string): Promise<string | null> {
  try {
    const pick = (data: Record<string, unknown> | null | undefined): string | null => {
      if (!data) return null;
      const d = data as Record<string, string | null | undefined>;
      return (
        parseSellerUuid(d.sellerid) ||
        parseSellerUuid(d.seller_id) ||
        parseSellerUuid(d.user_id) ||
        parseSellerUuid(d.owner_id)
      );
    };

    const wide = await supabase
      .from('machines')
      .select('sellerid, seller_id, user_id, owner_id')
      .eq('id', machineId)
      .maybeSingle();

    if (!wide.error) {
      const id = pick(wide.data as Record<string, unknown>);
      if (id) return id;
    } else if (isMissingSchemaColumnError(wide.error)) {
      const narrow = await supabase
        .from('machines')
        .select('sellerid, seller_id, user_id')
        .eq('id', machineId)
        .maybeSingle();
      if (!narrow.error) {
        const id = pick(narrow.data as Record<string, unknown>);
        if (id) return id;
      }
    }

    const legacy = await supabase.from('machines').select('user_id').eq('id', machineId).maybeSingle();
    if (legacy.error && !isMissingSchemaColumnError(legacy.error)) return null;
    return parseSellerUuid((legacy.data as { user_id?: string | null })?.user_id);
  } catch {
    return null;
  }
}

/** Lit machines.price (TEXT, virgule possible) et le normalise en nombre > 0, sinon null. */
async function fetchMachinePrice(machineId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('machines')
      .select('price')
      .eq('id', machineId)
      .maybeSingle();
    if (error || !data) return null;
    const raw = (data as { price?: unknown }).price;
    const n = Number(String(raw ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Cree un dossier transaction (si les tables existent) et rattache la demande.
 * Appele pour un acheteur connecte qui n est pas le vendeur.
 */
async function tryLinkQuoteToNewTransactionCase(opts: {
  quoteId: string;
  machineId: string;
  sellerId: string;
  buyerUserId: string;
  amount?: number | null;
  currency?: string | null;
}): Promise<{ caseId: string | null; participantsLinked: boolean }> {
  const { data, error } = await supabase
    .from('transaction_cases')
    .insert({
      kind: 'sale',
      status: 'draft',
      machine_id: opts.machineId,
      seller_user_id: opts.sellerId,
      buyer_user_id: opts.buyerUserId,
      primary_quote_request_id: opts.quoteId,
      title: 'Demande depuis annonce',
      created_by: opts.buyerUserId,
      total_amount: opts.amount ?? null,
      currency: opts.currency ?? 'MAD',
    })
    .select('id')
    .single();

  if (error) {
    if (!isMissingTableError(error)) {
      logger.warn('[submitQuoteRequest] creation dossier transaction', error);
    }
    return { caseId: null, participantsLinked: false };
  }

  const caseId = data?.id as string | undefined;
  if (!caseId) return { caseId: null, participantsLinked: false };

  const now = new Date().toISOString();
  const { error: partErr } = await supabase.from('transaction_participants').insert([
    {
      case_id: caseId,
      user_id: opts.buyerUserId,
      role: 'buyer',
      invited_by: opts.buyerUserId,
      invited_at: now,
    },
    {
      case_id: caseId,
      user_id: opts.sellerId,
      role: 'seller',
      invited_by: opts.buyerUserId,
      invited_at: now,
    },
  ]);
  if (partErr && !isMissingTableError(partErr)) {
    logger.warn('[submitQuoteRequest] participants dossier', partErr);
  }
  const participantsLinked = !partErr;

  const { error: evErr } = await supabase.from('transaction_events').insert({
    case_id: caseId,
    actor_user_id: opts.buyerUserId,
    event_type: 'case.created_from_quote',
    payload: {
      quote_request_id: opts.quoteId,
      machine_id: opts.machineId,
      summary: 'Dossier ouvert depuis une demande de prix sur une annonce',
      source: 'submitQuoteRequest',
    },
  });
  if (evErr && !isMissingTableError(evErr)) {
    logger.warn('[submitQuoteRequest] evenement dossier', evErr);
  }

  const { error: updateErr } = await supabase
    .from('quote_requests')
    .update({ transaction_case_id: caseId, updated_at: new Date().toISOString() })
    .eq('id', opts.quoteId);

  if (updateErr && !isMissingTableError(updateErr)) {
    logger.warn(
      '[submitQuoteRequest] MAJ quote_requests via client refusee — la ligne peut etre liee par trigger SQL (transaction_cases_after_insert_link_quote_request). Detail:',
      updateErr,
    );
  }

  return { caseId, participantsLinked };
}

export async function submitQuoteRequest(
  payload: QuoteRequestPayload,
): Promise<SubmitQuoteResult> {
  const cleaned = cleanQuotePayload(payload);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let uid = session?.user?.id ?? null;
  if (!uid) {
    const { data: userData } = await supabase.auth.getUser();
    uid = userData?.user?.id ?? null;
  }

  /* Titulaire annonce en base en priorité : évite quote_requests.seller_id ≠ dossier / trigger de liaison. */
  let sellerId: string | null = null;
  if (cleaned.machine_id) {
    sellerId = await fetchSellerUserIdFromMachine(cleaned.machine_id);
  }
  const sellerFromPayload = parseSellerUuid(cleaned.seller_id);
  if (!sellerId) {
    sellerId = sellerFromPayload;
  } else if (sellerFromPayload && sellerFromPayload !== sellerId) {
    logger.info('[submitQuoteRequest] seller_id payload ignoré au profit du titulaire machines', {
      payload_seller_id: sellerFromPayload,
      machine_seller_id: sellerId,
      machine_id: cleaned.machine_id,
    });
  }
  if (!sellerId) {
    logger.warn(
      '[submitQuoteRequest] seller_id introuvable pour la machine — devis enregistré mais pas de dossier transaction',
      { machine_id: cleaned.machine_id },
    );
  }

  const row = {
    ...cleaned,
    seller_id: sellerId ?? cleaned.seller_id ?? null,
    buyer_user_id: uid ?? undefined,
    transaction_case_id: payload.transaction_case_id ?? undefined,
  };
  const { data: inserted, error } = await supabase.from('quote_requests').insert(row).select('id').single();
  if (error) {
    logger.error('[supabaseCall:submitQuoteRequest]', error);
    const err = new Error(error.message || 'submitQuoteRequest failed');
    (err as Error & { cause?: unknown }).cause = error;
    throw err;
  }

  if (!inserted?.id) {
    throw new Error('submitQuoteRequest: insert sans id');
  }
  const quoteId = inserted.id;
  const buyerLoggedIn = Boolean(uid);
  const sellerResolved = Boolean(sellerId);
  const linkAttempted = Boolean(quoteId && uid && sellerId && uid !== sellerId);

  let transactionCaseId: string | null = null;
  let participantsLinked: boolean | null = null;
  if (linkAttempted) {
    // Montant du dossier : offre de l'acheteur (budget_max sinon budget_min), repli sur le prix de l'annonce.
    let offerAmount: number | null = cleaned.budget_max ?? cleaned.budget_min ?? null;
    if (offerAmount == null || offerAmount <= 0) {
      offerAmount = await fetchMachinePrice(cleaned.machine_id);
    }
    const linked = await tryLinkQuoteToNewTransactionCase({
      quoteId,
      machineId: cleaned.machine_id,
      sellerId: sellerId!,
      buyerUserId: uid!,
      amount: offerAmount,
      currency: 'MAD',
    });
    transactionCaseId = linked.caseId;
    participantsLinked = linked.caseId ? linked.participantsLinked : null;

    /* Fallback RPC si INSERT dossier / liaison client a échoué (RLS, réseau). */
    if (!transactionCaseId) {
      const { data: rpcId, error: rpcErr } = await supabase.rpc('ensure_transaction_case_for_quote_request', {
        p_quote_request_id: quoteId,
      });
      if (rpcErr && !isMissingTableError(rpcErr)) {
        const msg = (rpcErr.message || '').toLowerCase();
        const missingRpc =
          msg.includes('function') &&
          (msg.includes('does not exist') || msg.includes('schema cache'));
        if (!missingRpc) {
          logger.warn('[submitQuoteRequest] RPC ensure_transaction_case_for_quote_request', rpcErr);
        }
      } else if (rpcId != null && rpcId !== '') {
        transactionCaseId = String(rpcId);
        participantsLinked = true;
      }
    }
  } else if (quoteId && uid && !sellerId) {
    logger.info('[submitQuoteRequest] pas de liaison dossier (vendeur non résolu ou même compte)');
  }

  return {
    quoteId,
    transactionCaseId,
    buyerLoggedIn,
    sellerResolved,
    linkAttempted,
    participantsLinked,
  };
}

export async function getQuoteRequests(
  status?: QuoteRequestStatus | 'all',
): Promise<QuoteRequestRow[]> {
  return supabaseCall<QuoteRequestRow[]>(
    async () => {
      let query = supabase
        .from('quote_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
      return query;
    },
    { label: 'getQuoteRequests', fallback: [] },
  );
}

export async function updateQuoteRequestStatus(
  id: string,
  status: QuoteRequestStatus,
): Promise<QuoteRequestRow> {
  return supabaseCall<QuoteRequestRow>(
    () =>
      supabase
        .from('quote_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    { label: 'updateQuoteRequestStatus' },
  );
}

export type EnsureCaseReason = 'created' | 'not_deployed' | 'forbidden' | 'error';

/**
 * Crée (ou retrouve) le dossier transaction d'un devis via la RPC existante
 * `ensure_transaction_case_for_quote_request` — déjà appelée à la soumission, ici
 * exposée pour le rattrapage manuel depuis LeadsInbox (devis sans dossier lié).
 * Anti-façade : retour honnête, aucun dossier fictif.
 */
export async function ensureTransactionCaseForQuote(
  quoteRequestId: string,
): Promise<{ ok: boolean; caseId: string | null; reason: EnsureCaseReason }> {
  try {
    const { data, error } = await supabase.rpc('ensure_transaction_case_for_quote_request', {
      p_quote_request_id: quoteRequestId,
    });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('function') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
        return { ok: false, caseId: null, reason: 'not_deployed' };
      }
      if (msg.includes('forbidden') || msg.includes('denied') || msg.includes('row-level security')) {
        return { ok: false, caseId: null, reason: 'forbidden' };
      }
      logger.warn('[ensureTransactionCaseForQuote]', error);
      return { ok: false, caseId: null, reason: 'error' };
    }
    const id = data == null || data === '' ? null : String(data);
    return id ? { ok: true, caseId: id, reason: 'created' } : { ok: false, caseId: null, reason: 'error' };
  } catch (e) {
    logger.warn('[ensureTransactionCaseForQuote]', e);
    return { ok: false, caseId: null, reason: 'error' };
  }
}
