/**
 * Agrège le RISQUE RÉEL par dossier via le Risk Engine (computeTransactionRisk) sur
 * les dossiers accessibles (RLS). Aucune donnée inventée : risque dérivé des faits
 * (transaction_events + payment_records + inspections). Tolérant : [] en cas d'échec.
 */
import { listAccessibleTransactionCases, listTransactionEvents } from '../api/transactionCases';
import { paymentRecordService, inspectionService } from '../api/transactionPlatform';
import { computeTransactionRisk, type TransactionRisk } from './transactionRisk';

export interface CaseRisk {
  caseId: string;
  title: string;
  risk: TransactionRisk;
}

/** Renvoie les dossiers présentant un risque (level != 'low'), triés du plus risqué au moins. */
export async function loadCaseRisks(limit = 20): Promise<CaseRisk[]> {
  try {
    const cases = await listAccessibleTransactionCases();
    const slice = (Array.isArray(cases) ? cases : []).slice(0, limit);
    const results = await Promise.all(
      slice.map(async (c) => {
        const [events, payments, inspections] = await Promise.all([
          listTransactionEvents(c.id),
          paymentRecordService.listByCase(c.id),
          inspectionService.listRequestsByCase(c.id),
        ]);
        const risk = computeTransactionRisk({
          events: (events ?? []).map((e) => ({ event_type: e.event_type })),
          payments: (payments ?? []).map((p) => ({
            status: p.status,
            amount: p.amount ?? null,
            payment_type: p.payment_type,
          })),
          inspections: (inspections ?? []).map((i) => ({ status: i.status })),
        });
        return { caseId: c.id, title: c.title ?? 'Dossier', risk };
      }),
    );
    return results
      .filter((r) => r.risk.level !== 'low')
      .sort((a, b) => b.risk.score - a.risk.score || a.caseId.localeCompare(b.caseId));
  } catch {
    return [];
  }
}
