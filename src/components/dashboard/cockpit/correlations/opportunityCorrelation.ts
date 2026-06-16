import type { CockpitSignal } from '../buildVendeurCockpit';
import {
  prioritizeLeads,
  engineBreakdown,
  type LeadInput,
} from '../../../../utils/leads/leadConvergence';

/**
 * Agent D/E — surface les opportunités issues des leads (convergence) en signaux
 * cockpit actionnables. Aujourd'hui seuls les leads 'marketplace' (message/offre/
 * manuel) existent ; l'infrastructure de convergence accepte déjà monitor et besoins
 * pro (cf. classifyEntryEngine) dès qu'ils peupleront la table `leads` — ces segments
 * restent à 0 tant qu'aucun lead source='monitor'/'pro_demand' n'existe.
 * Anti-façade : aucune carte si aucune opportunité chaude réelle.
 */
export function buildOpportunitySignals(leads: LeadInput[], now?: string): CockpitSignal[] {
  const scored = prioritizeLeads(leads, now);
  const hot = scored.filter((s) => s.priority !== 'normal');
  if (!hot.length) return [];

  const top = hot[0];
  const b = engineBreakdown(scored);
  const sources = [
    b.marketplace ? `${b.marketplace} annonce` : '',
    b.monitor ? `${b.monitor} monitor` : '',
    b.pro_demand ? `${b.pro_demand} besoin pro` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return [
    {
      id: 'opp:lead-convergence',
      label: `${hot.length} opportunité(s) à saisir — top : ${top.action}`,
      detail: `Lead « ${top.title} » (score ${top.score}/100)${sources ? ` · sources : ${sources}` : ''}.`,
      href: '#leads',
      tone: top.priority === 'urgent' ? 'urgent' : 'warn',
    },
  ];
}
