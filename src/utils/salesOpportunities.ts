// =====================================================================
// MOTEUR D'OPPORTUNITÉS DE VENTE (Global Monitor -> vendeur)
// =====================================================================
// Innovation : au lieu que le vendeur fouille les appels d'offres, on RENVERSE
// le flux — à partir de SON stock, on classe les AO ouverts en opportunités de
// vente chiffrées (matériel demandé couvert × budget × échéance × rôle du contact).
//
// Fonction PURE et testable : le calcul ne dépend d'aucun réseau. Le caller fournit
// les projets (avec leurs besoins) et les catégories de stock du vendeur. Aucune
// donnée inventée : un projet sans besoin couvert par le stock est simplement écarté.
// Réutilise les primitives existantes (matchNeedsToStock, classifyRole, parseBudgetUsd).
// =====================================================================
import type { MonitorProject, EquipmentNeed, ProjectContact } from '../types/monitor';
import {
  matchNeedsToStock,
  classifyRole,
  prospectAngle,
  type StockMatchResult,
  type ProspectKind,
  type ProspectAngle,
} from './monitorProspectMatch';
import { parseBudgetUsd } from './monitorBudget';

/** Projet enrichi de ses besoins/contacts (issus du détail monitor). */
export interface OpportunityInput extends MonitorProject {
  equipment_needs?: EquipmentNeed[] | null;
  contacts?: ProjectContact[] | null;
}

export interface SalesOpportunity {
  project: MonitorProject;
  match: StockMatchResult;
  coverage: number; // needsCovered / needsTotal (0..1)
  budgetUsd: number | null;
  daysToDeadline: number | null; // via end_date ; null si inconnu ; négatif si passé
  kind: ProspectKind; // rôle du contact principal (maître d'ouvrage / lauréat)
  primaryContact: ProjectContact | null; // contact le plus actionnable (pour créer un prospect)
  angle: ProspectAngle;
  score: number; // 0..100
  scoreReasons: string[];
}

export interface RankOptions {
  now?: number; // injectable pour des tests déterministes
  limit?: number;
}

/** Points budget (0..25), échelle par paliers (USD). */
function budgetScore(budgetUsd: number | null): number {
  if (!budgetUsd || budgetUsd <= 0) return 0;
  if (budgetUsd >= 10_000_000) return 25;
  if (budgetUsd >= 1_000_000) return 18;
  if (budgetUsd >= 100_000) return 10;
  return 5;
}

/** Points urgence (0..15) : plus l'échéance est proche (et non passée), plus c'est chaud. */
function urgencyScore(daysToDeadline: number | null): number {
  if (daysToDeadline == null) return 0;
  if (daysToDeadline < 0) return 0; // échéance passée -> plus une opportunité de soumission
  if (daysToDeadline <= 30) return 15;
  if (daysToDeadline <= 90) return 10;
  return 5;
}

/** Points rôle du contact (0..10) : lauréat = négociation directe (chaud), maître d'ouvrage = soumission. */
function roleScore(kind: ProspectKind): number {
  if (kind === 'winner') return 10;
  if (kind === 'buyer') return 5;
  return 0;
}

/** Choisit le contact le plus actionnable : maître d'ouvrage prioritaire, sinon lauréat, sinon 1er. */
function pickPrimaryContact(
  contacts: ProjectContact[] | null | undefined,
): { contact: ProjectContact | null; kind: ProspectKind } {
  const list = contacts ?? [];
  const buyer = list.find((c) => classifyRole(c.role) === 'buyer');
  if (buyer) return { contact: buyer, kind: 'buyer' };
  const winner = list.find((c) => classifyRole(c.role) === 'winner');
  if (winner) return { contact: winner, kind: 'winner' };
  return { contact: list[0] ?? null, kind: 'unknown' };
}

function daysBetween(fromMs: number, dateStr: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((t - fromMs) / (1000 * 3600 * 24));
}

/**
 * Classe les AO ouverts en opportunités de vente pour le stock du vendeur.
 * N'inclut QUE les projets dont au moins un besoin est couvert par le stock
 * (needsCovered > 0) — jamais de fausse opportunité.
 */
export function rankSalesOpportunities(
  projects: ReadonlyArray<OpportunityInput>,
  stockCategories: string[],
  opts: RankOptions = {},
): SalesOpportunity[] {
  const now = opts.now ?? Date.now();
  const out: SalesOpportunity[] = [];

  for (const p of projects) {
    const needs = p.equipment_needs ?? [];
    if (!needs.length) continue;
    const match = matchNeedsToStock(needs, stockCategories);
    if (match.needsCovered <= 0) continue; // pas de stock compatible -> pas une opportunité

    const coverage = match.needsTotal ? match.needsCovered / match.needsTotal : 0;
    const budgetUsd = parseBudgetUsd(p.budget_usd);
    const daysToDeadline = daysBetween(now, p.end_date);
    const { contact: primaryContact, kind } = pickPrimaryContact(p.contacts);
    const angle = prospectAngle(kind);

    const sCoverage = Math.round(coverage * 50);
    const sBudget = budgetScore(budgetUsd);
    const sUrgency = urgencyScore(daysToDeadline);
    const sRole = roleScore(kind);
    const score = Math.min(100, sCoverage + sBudget + sUrgency + sRole);

    const reasons: string[] = [];
    reasons.push(`Vous couvrez ${match.needsCovered}/${match.needsTotal} besoin(s) de l'AO`);
    if (budgetUsd) reasons.push(`Budget ~${Math.round(budgetUsd / 1e6)}M USD`);
    if (daysToDeadline != null && daysToDeadline >= 0) reasons.push(`Échéance dans ${daysToDeadline} j`);
    else if (daysToDeadline != null) reasons.push('Échéance passée');
    if (kind === 'buyer') reasons.push("Contact = maître d'ouvrage → soumission");
    else if (kind === 'winner') reasons.push('Contact = lauréat → négociation directe');

    out.push({
      project: p,
      match,
      coverage,
      budgetUsd,
      daysToDeadline,
      kind,
      primaryContact,
      angle,
      score,
      scoreReasons: reasons,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return typeof opts.limit === 'number' ? out.slice(0, opts.limit) : out;
}
