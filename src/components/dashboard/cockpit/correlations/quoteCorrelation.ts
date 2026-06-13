import type { QuoteRequestRow } from '../../../../utils/api/quoteRequests';
import type { CockpitSignal } from '../buildVendeurCockpit';

/**
 * CORRÉLATION M1 — devis → lead/action (+ dossier).
 *
 * Cross-module : `quote_requests` (demande de prix sur une annonce, RLS vendeur)
 * croisé avec `transaction_cases` via `quote_requests.transaction_case_id`
 * (rempli par submitQuoteRequest quand l'acheteur est connecté).
 *
 * Pur, testable, anti-façade : ne renvoie de carte que si des devis réels existent.
 * Aucune donnée inventée.
 */
export function buildQuoteSignals(quotes: QuoteRequestRow[]): {
  priorities: CockpitSignal[];
  opportunities: CockpitSignal[];
} {
  const open = quotes.filter((q) => q.status !== 'closed');
  const fresh = open.filter((q) => q.status === 'new');
  const withCase = quotes.filter((q) => Boolean(q.transaction_case_id) && q.status !== 'closed');

  const priorities: CockpitSignal[] = [];
  if (fresh.length) {
    priorities.push({
      id: 'corr:quotes-new',
      label: `${fresh.length} demande(s) de prix à traiter`,
      detail: 'Répondre / qualifier avant refroidissement',
      href: '#devis',
      tone: 'urgent',
    });
  } else if (open.length) {
    priorities.push({
      id: 'corr:quotes-open',
      label: `${open.length} devis en cours à relancer`,
      detail: 'Faire avancer vers le dossier',
      href: '#devis',
      tone: 'warn',
    });
  }

  const opportunities: CockpitSignal[] = [];
  if (withCase.length) {
    opportunities.push({
      id: 'corr:quotes-case',
      label: `${withCase.length} dossier(s) engin ouvert(s) depuis un devis`,
      detail: 'Acheteur engagé — faire avancer le dossier',
      href: '#dossiers',
      tone: 'good',
    });
  }

  return { priorities, opportunities };
}
