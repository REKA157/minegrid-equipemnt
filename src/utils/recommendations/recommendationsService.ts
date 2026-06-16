/**
 * Agrégateur de RECOMMANDATIONS RÉELLES (remplace les insights IA génériques).
 * Croise les moteurs déjà construits — Lead Convergence (opportunités) et Risk Engine
 * (risques dossier) — pour produire des recommandations EXPLICABLES et ACTIONNABLES.
 * Anti-façade : uniquement des données réelles ; [] si rien ; jamais d'insight inventé.
 */
import { RealPipelineService } from '../../services/realPipelineService';
import { prioritizeLeads, type LeadInput } from '../leads/leadConvergence';
import { loadCaseRisks } from '../risk/caseRiskService';

export type RecoTone = 'urgent' | 'warn' | 'good';

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  tone: RecoTone;
}

export async function buildRecommendations(): Promise<Recommendation[]> {
  const out: Recommendation[] = [];

  // 1) Opportunités — leads chauds (convergence annonces/monitor).
  try {
    const leads = await RealPipelineService.getLeads();
    const scored = prioritizeLeads(leads as unknown as LeadInput[]);
    for (const l of scored.filter((s) => s.priority !== 'normal').slice(0, 3)) {
      out.push({
        id: `lead:${l.id}`,
        title: `Opportunité — ${l.title}`,
        detail: `Lead chaud (score ${l.score}/100).`,
        action: l.action,
        href: '#leads',
        tone: l.priority === 'urgent' ? 'urgent' : 'warn',
      });
    }
  } catch {
    /* leads indisponibles -> aucune reco lead (anti-façade) */
  }

  // 2) Risques dossier — Risk Engine sur les dossiers accessibles.
  try {
    const risks = await loadCaseRisks(15);
    for (const r of risks.slice(0, 3)) {
      out.push({
        id: `risk:${r.caseId}`,
        title: `Risque — ${r.title}`,
        detail: r.risk.signals.map((s) => s.label).join(' '),
        action: 'Ouvrir le dossier pour corriger',
        href: `#dossier/${r.caseId}`,
        tone: r.risk.level === 'high' ? 'urgent' : 'warn',
      });
    }
  } catch {
    /* risques indisponibles -> aucune reco risque */
  }

  // Tri : urgent d'abord.
  const rank: Record<RecoTone, number> = { urgent: 0, warn: 1, good: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
