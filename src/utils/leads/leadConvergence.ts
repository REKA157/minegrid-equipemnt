/**
 * Agent D — Lead Convergence Engine (PUR, testable).
 *
 * Fait CONVERGER les leads des moteurs d'entrée vers une typologie + un scoring +
 * une priorisation uniques, pour surfacer « quelle opportunité saisir ».
 *
 * ÉTAT RÉEL (honnêteté) :
 *  - 'marketplace' (source message/offer/manual) : RÉEL, alimenté aujourd'hui.
 *  - 'monitor' : RÉEL — les leads « Prospect AO » du Global Monitor sont désormais
 *    insérés avec source:'monitor' (cf. GlobalMonitor.tsx), donc la convergence
 *    Monitor -> Lead est effective dès qu'un prospect AO est envoyé au Kanban.
 *  - 'pro_demand' : branche PRÊTE mais NON alimentée (aucune table « besoin pro »
 *    n'existe encore) -> engineBreakdown renvoie 0 honnêtement tant qu'aucun lead
 *    source='pro_demand' n'existe.
 *
 * Anti-façade : pas de lead inventé ; champs absents -> contribution neutre, jamais
 * un chiffre fabriqué ; les leads terminaux (Conclu/Perdu) ne sont pas des opportunités.
 */

/** Moteur d'entrée d'où provient le lead (convergence des 3 flux). */
export type EntryEngine = 'marketplace' | 'monitor' | 'pro_demand' | 'unknown';

export interface LeadInput {
  id: string;
  title?: string | null;
  stage?: string | null;
  value?: number | null;
  probability?: number | null; // 0..1 ou 0..100
  last_contact?: string | null;
  source?: string | null;
  source_id?: string | null;
  machine_id?: string | null;
  transaction_case_id?: string | null;
}

export type LeadPriority = 'urgent' | 'high' | 'normal';

export interface ScoredLead {
  id: string;
  title: string;
  engine: EntryEngine;
  score: number; // 0..100
  priority: LeadPriority;
  action: string; // action concrète à mener
  hasDossier: boolean;
}

/** Classe la SOURCE d'un lead vers son moteur d'entrée (convergence). */
export function classifyEntryEngine(source: string | null | undefined): EntryEngine {
  switch ((source || '').trim().toLowerCase()) {
    case 'message':
    case 'offer':
    case 'website':
    case 'manual':
    case 'quote_request':
      return 'marketplace';
    case 'monitor':
    case 'global_monitor':
      return 'monitor';
    case 'pro_demand':
    case 'besoin_pro':
      return 'pro_demand';
    default:
      return 'unknown';
  }
}

const TERMINAL_STAGES = new Set(['conclu', 'perdu', 'closed', 'won', 'lost']);

const STAGE_HEAT: Record<string, number> = {
  prospection: 0.3,
  qualification: 0.5,
  devis: 0.8,
  proposition: 0.9,
  négociation: 1,
  negociation: 1,
};

function lc(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase();
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function daysBetween(fromIso: string | null | undefined, nowIso: string): number | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  const n = Date.parse(nowIso);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  return (n - t) / 86400000;
}

const STALE_DAYS = 14;
const VALUE_TARGET = 500000;

// Poids de scoring (somme = 1.0). `heat` (avancement du stage) domine car il décide si
// le lead est actionnable ; `staleness` et `dossierGap` pèsent fort car ils déclenchent
// une action concrète (relancer / créer le dossier) ; `value`/`prob` affinent sans piloter.
const W = { heat: 0.3, value: 0.15, prob: 0.15, staleness: 0.2, dossierGap: 0.2 } as const;

/**
 * Score un lead (0..100) à partir de signaux RÉELS. `now` (date de référence ISO)
 * est injectable pour le déterminisme des tests ; par défaut = maintenant.
 * Renvoie null si le lead est terminal (Conclu/Perdu = pas une opportunité).
 */
export function scoreLead(lead: LeadInput, now?: string): ScoredLead | null {
  const stage = lc(lead.stage);
  if (TERMINAL_STAGES.has(stage)) return null;

  const nowIso = now ?? new Date().toISOString();
  const heat = STAGE_HEAT[stage] ?? 0.3;
  const valueNorm = clamp01((lead.value ?? 0) / VALUE_TARGET);
  const rawProb = lead.probability ?? 0;
  const probNorm = clamp01(rawProb > 1 ? rawProb / 100 : rawProb);
  const days = daysBetween(lead.last_contact, nowIso);
  const staleness = days != null ? clamp01(days / STALE_DAYS) : 0;
  const hotStage = heat >= 0.8;
  const hasDossier = Boolean(lead.transaction_case_id);
  const dossierGap = hotStage && !hasDossier ? 1 : 0;

  const score = Math.round(
    (heat * W.heat + valueNorm * W.value + probNorm * W.prob + staleness * W.staleness + dossierGap * W.dossierGap) *
      100,
  );
  const priority: LeadPriority = score >= 70 ? 'urgent' : score >= 40 ? 'high' : 'normal';

  let action: string;
  if (dossierGap) action = 'Créer le dossier transaction';
  else if (staleness >= 0.8 && days != null) action = `Relancer (dernier contact il y a ${Math.round(days)} j)`;
  else if (hasDossier) action = 'Faire avancer le dossier';
  else action = 'Qualifier et avancer';

  return {
    id: lead.id,
    title: lead.title?.trim() || 'Lead',
    engine: classifyEntryEngine(lead.source),
    score,
    priority,
    action,
    hasDossier,
  };
}

/** Priorise une liste de leads (exclut les terminaux), du plus chaud au plus froid. */
export function prioritizeLeads(leads: LeadInput[], now?: string): ScoredLead[] {
  return leads
    .map((l) => scoreLead(l, now))
    .filter((s): s is ScoredLead => s != null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Répartition par moteur d'entrée (pour matérialiser la convergence). */
export function engineBreakdown(scored: ScoredLead[]): Record<EntryEngine, number> {
  const out: Record<EntryEngine, number> = { marketplace: 0, monitor: 0, pro_demand: 0, unknown: 0 };
  for (const s of scored) out[s.engine] += 1;
  return out;
}
