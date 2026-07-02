/**
 * Moteur de RECOMMANDATIONS OPÉRATIONNELLES « quoi faire maintenant » du vendeur/pro.
 * Pas d'IA marketing : croise des moteurs et données RÉELS pour produire des insights où
 * CHACUN a une raison explicable, une source de données (preuve), une action concrète et
 * un niveau de priorité.
 *
 * 7 familles, toutes branchées sur du réel (chaque source est tolérante : try/catch -> rien) :
 *  1. Annonce très vue sans devis        (machine_views × quote_requests)
 *  2. Devis reçu sans dossier            (quote_requests × transaction_cases)
 *  3. Lead / devis sans relance          (pipeline leads + quote_requests new/contacted)
 *  4. Partenaire recommandé non assigné  (chaîne transaction × Partner Network.best)
 *  5. Partenaire saturé déjà assigné     (chaîne transaction × Partner Network.saturated)
 *  6. Risque transaction détecté         (Risk Engine / transaction_events)
 *  7. Projet Global Monitor ↔ stock      (market_projects × stock) — DORMANT tant que
 *     `market_projects` n'est pas déployée (anti-façade : pas de projet inventé).
 *
 * Anti-façade : aucun insight générique, aucun mock, aucun faux score ; [] si aucune
 * donnée réelle ne justifie une reco.
 */
import { RealPipelineService } from '../../services/realPipelineService';
import { prioritizeLeads, type LeadInput } from '../leads/leadConvergence';
import { loadCaseRisks } from '../risk/caseRiskService';
import { loadListingViewGaps } from './listingInsights';
import { loadQuotesWithoutCase, loadStaleQuotes } from './quoteInsights';
import { loadPartnerAssignmentInsights } from './partnerAssignmentInsights';
import { loadMarketProjectMatches } from './marketProjectInsights';

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

  // 1) ANNONCES très vues sans devis.
  try {
    const gaps = await loadListingViewGaps();
    for (const g of gaps.slice(0, 3)) {
      out.push({
        id: `listing:${g.machineId}`,
        title: `${g.title} — ${g.views} vues, aucun devis`,
        reason: 'Forte audience mais zéro demande de devis.',
        source: 'machine_views × quote_requests',
        action: "Améliorer l'annonce (prix, photos, inspection)",
        href: `#machines/${g.machineId}`,
        priority: 'high',
      });
    }
  } catch {
    /* annonces indisponibles -> aucune reco annonce */
  }

  // 2) DEVIS reçus mais SANS dossier transaction.
  try {
    const gaps = await loadQuotesWithoutCase();
    for (const g of gaps.slice(0, 3)) {
      out.push({
        id: `quote-case:${g.machineId}`,
        title: `${g.title} — ${g.quoteCount} devis sans dossier`,
        reason: "Un acheteur a demandé un devis mais aucun dossier transaction n'existe.",
        source: 'quote_requests × transaction_cases',
        action: 'Créer le dossier transaction',
        href: `#machines/${g.machineId}`,
        priority: 'high',
      });
    }
  } catch {
    /* devis/dossiers indisponibles -> aucune reco */
  }

  // 3a) LEADS sans relance (dernier contact trop ancien).
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
  } catch {
    /* leads indisponibles -> aucune reco lead */
  }

  // 3b) DEVIS sans réponse depuis > 7 j.
  try {
    const sq = await loadStaleQuotes();
    if (sq.count > 0) {
      out.push({
        id: 'quotes:stale',
        title: `${sq.count} devis sans réponse depuis +7 jours`,
        reason: `Des acheteurs attendent une réponse (le plus ancien : ${sq.oldestDays} j).`,
        source: 'quote_requests (status new/contacted)',
        action: 'Répondre / relancer',
        href: sq.oldestMachineId ? `#machines/${sq.oldestMachineId}` : '#leads',
        priority: sq.oldestDays >= 14 ? 'urgent' : 'high',
      });
    }
  } catch {
    /* devis indisponibles -> aucune reco */
  }

  // 4) + 5) PARTENAIRES : recommandé non assigné / saturé déjà assigné (niveau dossier).
  try {
    const { gaps, saturations } = await loadPartnerAssignmentInsights();
    for (const g of gaps.slice(0, 3)) {
      out.push({
        id: `partner-gap:${g.caseId}:${g.role}`,
        title: `Dossier « ${g.title} » : ${g.roleLabel} à assigner`,
        reason: 'Une étape attend un partenaire et un partenaire fiable est disponible.',
        source: 'Chaîne transaction × Partner Network',
        action: 'Assigner le meilleur partenaire',
        href: `#dossier/${g.caseId}`,
        priority: 'high',
      });
    }
    for (const s of saturations.slice(0, 3)) {
      out.push({
        id: `partner-sat:${s.caseId}:${s.role}`,
        title: `Dossier « ${s.title} » : ${s.roleLabel} saturé`,
        reason: 'Le partenaire assigné a déjà ≥ 5 dossiers ouverts : risque de retard.',
        source: 'Chaîne transaction × Partner Network',
        action: 'Réassigner ou relancer',
        href: `#dossier/${s.caseId}`,
        priority: 'normal',
      });
    }
  } catch {
    /* assignations indisponibles -> aucune reco partenaire */
  }

  // 6) RISQUE DOSSIER — Risk Engine.
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

  // 7) PROJET Global Monitor compatible avec le stock (DORMANT tant que market_projects absente).
  try {
    const matches = await loadMarketProjectMatches();
    for (const m of matches.slice(0, 3)) {
      out.push({
        id: `project:${m.projectId}:${m.machineId}`,
        title: `Projet « ${m.projectTitle} » compatible avec ${m.machineTitle}`,
        reason: 'Un projet détecté correspond à une machine de votre stock.',
        source: 'Global Monitor (market_projects) × stock',
        action: 'Proposer la machine / créer un devis',
        href: `#machines/${m.machineId}`,
        priority: 'normal',
      });
    }
  } catch {
    /* projets indisponibles -> aucune reco projet */
  }

  const rank: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
