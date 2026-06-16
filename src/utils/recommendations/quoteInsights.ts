/**
 * Insights DEVIS réels (anti-façade), à partir de quote_requests :
 *  - DEVIS reçu mais SANS dossier transaction  -> créer le dossier (reco #2) ;
 *  - DEVIS sans réponse (status new/contacted) depuis > 7 j -> relancer (reco #3).
 *
 * Sources réelles : quote_requests (du vendeur) × transaction_cases.
 * Le cœur de détection est PUR (testable, déterministe) ; les loaders sont tolérants
 * (try/catch -> vide) et ne renvoient RIEN si aucune donnée réelle ne le justifie.
 */
import supabase from '../supabaseClient';
import { getCurrentSellerUserId, getMachineIdsForSellerUser } from '../enterpriseApi/sellerScope';

export interface QuoteRow {
  id: string;
  machine_id: string | null;
  machine_name?: string | null;
  brand?: string | null;
  status?: string | null;
  transaction_case_id?: string | null;
  created_at?: string | null;
}

export interface QuoteCaseGap {
  machineId: string;
  title: string;
  quoteCount: number;
}

export interface StaleQuoteSummary {
  count: number;
  oldestMachineId: string | null;
  oldestDays: number;
}

const ACTIVE_UNANSWERED = new Set(['new', 'contacted']); // pas encore qualifié / conclu
const STALE_DAYS = 7;
const EMPTY_STALE: StaleQuoteSummary = { count: 0, oldestMachineId: null, oldestDays: 0 };

function quoteTitle(q: QuoteRow): string {
  return [q.brand, q.machine_name].filter(Boolean).join(' ').trim() || q.machine_id || 'Machine';
}

/**
 * PUR : devis sans dossier, groupés par machine. Un devis est « sans dossier » s'il
 * n'est rattaché à AUCUN dossier, par les TROIS liens possibles (anti-faux-positif) :
 *  - son propre `transaction_case_id` ; ou
 *  - un dossier existe pour sa machine (machineIdsWithCase) ; ou
 *  - un dossier le référence via `primary_quote_request_id` (quoteIdsWithCase).
 */
export function selectQuotesWithoutCase(
  quotes: QuoteRow[],
  machineIdsWithCase: Set<string>,
  quoteIdsWithCase: Set<string> = new Set(),
): QuoteCaseGap[] {
  const byMachine = new Map<string, { title: string; count: number }>();
  for (const q of quotes) {
    if (!q.machine_id) continue;
    if (q.transaction_case_id) continue; // déjà rattaché à un dossier (lien direct)
    if (quoteIdsWithCase.has(q.id)) continue; // un dossier le référence (primary_quote_request_id)
    if (machineIdsWithCase.has(q.machine_id)) continue; // un dossier existe déjà pour cette machine
    const cur = byMachine.get(q.machine_id) ?? { title: quoteTitle(q), count: 0 };
    cur.count += 1;
    byMachine.set(q.machine_id, cur);
  }
  const out: QuoteCaseGap[] = [];
  byMachine.forEach((v, machineId) => out.push({ machineId, title: v.title, quoteCount: v.count }));
  return out.sort((a, b) => b.quoteCount - a.quoteCount || a.machineId.localeCompare(b.machineId));
}

/** PUR : devis non répondus (status new/contacted) plus vieux que `staleDays`. */
export function selectStaleQuotes(quotes: QuoteRow[], nowMs: number, staleDays = STALE_DAYS): StaleQuoteSummary {
  const cutoff = nowMs - staleDays * 86400000;
  let count = 0;
  let oldestMs = Infinity;
  let oldestMachineId: string | null = null;
  for (const q of quotes) {
    const status = (q.status || '').trim().toLowerCase();
    if (!ACTIVE_UNANSWERED.has(status)) continue;
    if (!q.created_at) continue;
    const t = Date.parse(q.created_at);
    if (!Number.isFinite(t) || t >= cutoff) continue;
    count += 1;
    if (t < oldestMs) {
      oldestMs = t;
      oldestMachineId = q.machine_id ?? null;
    }
  }
  const oldestDays = oldestMs === Infinity ? 0 : Math.floor((nowMs - oldestMs) / 86400000);
  return { count, oldestMachineId, oldestDays };
}

export async function loadQuotesWithoutCase(): Promise<QuoteCaseGap[]> {
  try {
    const uid = await getCurrentSellerUserId();
    if (!uid) return [];
    const machineIds = await getMachineIdsForSellerUser(uid);
    if (!machineIds.length) return [];

    const [quotesRes, casesRes] = await Promise.all([
      supabase
        .from('quote_requests')
        .select('id, machine_id, machine_name, brand, transaction_case_id')
        .in('machine_id', machineIds),
      supabase
        .from('transaction_cases')
        .select('machine_id, primary_quote_request_id')
        .in('machine_id', machineIds),
    ]);

    const withCase = new Set<string>();
    const quotesWithCase = new Set<string>();
    for (const c of (casesRes.data ?? []) as Array<{ machine_id?: string | null; primary_quote_request_id?: string | null }>) {
      if (c.machine_id) withCase.add(c.machine_id);
      if (c.primary_quote_request_id) quotesWithCase.add(c.primary_quote_request_id);
    }
    return selectQuotesWithoutCase((quotesRes.data ?? []) as QuoteRow[], withCase, quotesWithCase);
  } catch {
    return [];
  }
}

export async function loadStaleQuotes(): Promise<StaleQuoteSummary> {
  try {
    const uid = await getCurrentSellerUserId();
    if (!uid) return EMPTY_STALE;
    const machineIds = await getMachineIdsForSellerUser(uid);
    if (!machineIds.length) return EMPTY_STALE;

    const { data } = await supabase
      .from('quote_requests')
      .select('id, machine_id, machine_name, brand, status, created_at')
      .in('machine_id', machineIds);
    return selectStaleQuotes((data ?? []) as QuoteRow[], Date.now());
  } catch {
    return EMPTY_STALE;
  }
}
