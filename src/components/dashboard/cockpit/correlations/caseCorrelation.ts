import type { TransactionCaseRow } from '../../../../utils/api/transactionCases';
import type { CockpitSignal } from '../buildVendeurCockpit';

/**
 * CORRÉLATION M2 — lead/devis → dossier transaction → action d'avancement.
 *
 * Cross-module : `transaction_cases` (RLS réel, créés par submitQuoteRequest depuis
 * un devis) lus par étape (`status`). Le dossier relie machine + acheteur + vendeur ;
 * la carte dit quelle action fait avancer l'étape.
 *
 * Pur, testable, anti-façade : ne renvoie de carte que sur des dossiers réels ouverts.
 */
const CLOSED = new Set(['closed', 'cancelled']);

function daysSince(iso: string | undefined, now: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((now - t) / 86_400_000);
}

export function buildDossierStageSignals(
  cases: TransactionCaseRow[],
  now: number = Date.now(),
): { priorities: CockpitSignal[]; risks: CockpitSignal[] } {
  const open = cases.filter((c) => !CLOSED.has(c.status));
  const toQualify = open.filter((c) => c.status === 'draft' || c.status === 'qualified');
  const negotiating = open.filter((c) => c.status === 'negotiation' || c.status === 'contract');
  const stale = open.filter((c) => daysSince(c.updated_at, now) >= 14);

  const priorities: CockpitSignal[] = [];
  if (toQualify.length) {
    priorities.push({
      id: 'corr:case-qualify',
      label: `${toQualify.length} dossier(s) à qualifier`,
      detail: "Contacter l'acheteur et confirmer le besoin",
      href: '#dossiers',
      tone: 'urgent',
    });
  }
  if (negotiating.length) {
    priorities.push({
      id: 'corr:case-negotiation',
      label: `${negotiating.length} dossier(s) en négociation / contrat`,
      detail: 'Faire avancer vers la signature',
      href: '#dossiers',
      tone: 'warn',
    });
  }

  const risks: CockpitSignal[] = [];
  if (stale.length) {
    risks.push({
      id: 'corr:case-stale',
      label: `${stale.length} dossier(s) sans activité depuis 14 j+`,
      detail: "Risque d'abandon — relancer l'acheteur",
      href: '#dossiers',
      tone: 'warn',
    });
  }

  return { priorities, risks };
}
