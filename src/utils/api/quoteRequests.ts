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
}

export interface QuoteRequestRow extends QuoteRequestPayload {
  id: string;
  status: QuoteRequestStatus;
  created_at: string;
  updated_at: string;
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

export async function submitQuoteRequest(
  payload: QuoteRequestPayload,
): Promise<void> {
  const cleaned = cleanQuotePayload(payload);
  const { error } = await supabase.from('quote_requests').insert(cleaned);
  if (error) {
    logger.error('[supabaseCall:submitQuoteRequest]', error);
    const err = new Error(error.message || 'submitQuoteRequest failed');
    (err as Error & { cause?: unknown }).cause = error;
    throw err;
  }
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
