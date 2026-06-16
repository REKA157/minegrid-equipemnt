/**
 * Moteur de RECOMMANDATIONS OPÉRATIONNELLES (pas d'IA marketing). Croise des moteurs
 * et données RÉELS pour produire des insights où CHACUN a : raison explicable, source
 * de données, action concrète, niveau de priorité.
 *
 * Sources branchées : Leads (pipeline) · Risk Engine (transaction_events) · Partner
 * Network (trust + charge) · machine_views × devis. Global Monitor est OMIS tant que
 * `market_projects` n'est pas déployée/peuplée (anti-façade : pas de projet inventé).
 *
 * Anti-façade : chaque source est tolérante (try/catch -> rien) ; aucun insight générique,
 * aucun mock, aucun faux score ; [] si aucune donnée réelle ne justifie une reco.
 */
import { RealPipelineService } from '../../services/realPipelineService';
import { prioritizeLeads, type LeadInput } from '../leads/leadConvergence';
import { loadCaseRisks } from '../risk/caseRiskService';
import { buildNetworkForRole } from '../partner/partnerPerformanceService';
import type { PartnerRole } from '../partner/partnerEvents';
import { loadListingViewGaps } from './listingInsights';

export type Priority = 'urgent' | 'high' | 'normal';

export interface Recommendation {
  id: string;
  title: string;
  reason: string;
  source: string;
  action: string;
  href: string;
  priority: Priority;
}

export async function buildRecommendations(): Promise<Recommendation[]> {
  const out: Recommendation[] = [];

  // 1) LEADS — chauds sans relance (>7 j) + opportunité sans dossier.
  try {
    const leads = await RealPipelineService.getLeads();
    const scored = prioritizeLeads(leads as unknown as LeadInput[]);
    const staleHot = scored.filter((s) => s.action.startsWith('Relancer'));
    if (staleHot.length > 0) {
      out.push({
        id: 'leads:stale',
        title: `${staleHot.length} lead(s) à relancer (dernier contact trop ancien)`,
        reason: 'Seuil de relance atteint : ces leads stagnent sans contact récent.',
        source: 'Leads / pipeline',
        action: 'Relancer',
        href: '#leads',
        priority: 'high',
      });
    }
    const gap = scored.find((s) => s.action === 'Créer le dossier transaction');
    if (gap) {
      out.push({
        id: `lead:${gap.id}`,
        title: `Opportunité — ${gap.title}`,
        reason: `Lead chaud (score ${gap.score}/100) sans dossier transaction.`,
        source: 'Leads / pipeline',
        action: 'Créer le dossier',
        href: '#leads',
        priority: gap.priority === 'urgent' ? 'urgent' : 'high',
      });
    }
  } catch {
    /* leads indisponibles -> aucune reco lead */
  }

  // 2) RISQUE DOSSIER — Risk Engine sur les dossiers accessibles.
  try {
    const risks = await loadCaseRisks(10);
    for (const r of risks.slice(0, 3)) {
      out.push({
        id: `risk:${r.caseId}`,
        title: `Risque transaction ${r.risk.level === 'high' ? 'élevé' : 'à surveiller'} — ${r.title}`,
        reason: r.risk.signals.map((s) => s.label).join(' '),
        source: 'Risk Engine (transaction_events)',
        action: 'Vérifier avant escrow',
        href: `#dossier/${r.caseId}`,
        priority: r.risk.level === 'high' ? 'urgent' : 'high',
      });
    }
  } catch {
    /* risques indisponibles -> aucune reco risque */
  }

  // 3) PARTENAIRES saturés / à éviter — Partner Network (trust + charge).
  try {
    const roles: Array<{ role: PartnerRole; label: string }> = [
      { role: 'mechanic', label: 'mécanicien' },
      { role: 'broker', label: 'courtier' },
      { role: 'carrier', label: 'transporteur' },
      { role: 'forwarder', label: 'transitaire' },
    ];
    const nets = await Promise.all(roles.map((r) => buildNetworkForRole(r.role).then((n) => ({ r, n }))));
    for (const { r, n } of nets) {
      if (n.saturated.length > 0 || n.toAvoid.length > 0) {
        const parts = [
          n.saturated.length ? `${n.saturated.length} saturé(s)` : '',
          n.toAvoid.length ? `${n.toAvoid.length} à éviter` : '',
        ]
          .filter(Boolean)
          .join(', ');
        out.push({
          id: `partner:${r.role}`,
          title: `Partenaires ${r.label} : ${parts}`,
          reason: "Charge élevée ou taux d'échec élevé sur ce rôle.",
          source: 'Partner Network (trust + charge)',
          action: 'Réassigner vers un partenaire fiable',
          href: '#dossiers',
          priority: 'normal',
        });
      }
    }
  } catch {
    /* réseau partenaire indisponible -> aucune reco partenaire */
  }

  // 4) ANNONCES très vues sans devis — machine_views × devis.
  try {
    const gaps = await loadListingViewGaps();
    for (const g of gaps.slice(0, 3)) {
      out.push({
        id: `listing:${g.machineId}`,
        title: `${g.title} — ${g.views} vues, aucun devis`,
        reason: 'Forte audience mais zéro demande de devis : annonce à améliorer.',
        source: 'machine_views × devis',
        action: "Améliorer l'annonce",
        href: `#machines/${g.machineId}`,
        priority: 'high',
      });
    }
  } catch {
    /* vues/devis indisponibles -> aucune reco annonce */
  }

  const rank: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
