/**
 * Passerelle Global Monitor → module Appels d'offres.
 *
 * Transforme un projet/AO récupéré par le Global Monitor
 * (MonitorProjectDetail) en dossier de réponse (Tender) prêt pour le
 * parcours : analyse DCE → exigences → go/no-go → mémoire → dépôt.
 *
 * Les données du Monitor sont plus pauvres qu'un vrai DCE (pas de
 * référence de marché, pas de date limite de remise, budget en USD) :
 * on comble par des valeurs par défaut raisonnables, clairement
 * signalées dans la description, que l'utilisateur ajuste ensuite.
 */

import type { MonitorProjectDetail } from '../../types/monitor';
import { PROJECT_TYPE_LABELS } from '../../types/monitor';
import { DEFAULT_GONOGO_CRITERIA } from './scoring';
import type { MarketType, Sector, Tender } from '../types';
import { nowIso, uid } from '../types';

/** Correspondance type de projet Monitor → secteur du module (forcément approximative). */
const SECTOR_BY_PROJECT_TYPE: Record<string, Sector> = {
  mine: 'btp',
  road: 'btp',
  port: 'btp',
  rail: 'btp',
  dam: 'btp',
  industrial_zone: 'btp',
  energy: 'btp',
  btp: 'btp',
  infrastructure: 'btp',
};

/** Rôles d'entité qui désignent l'acheteur / maître d'ouvrage. */
const BUYER_ROLE_HINTS = [
  'client',
  'buyer',
  'acheteur',
  'adjudicateur',
  'maître',
  'maitre',
  'owner',
  'pouvoir adjudicateur',
  'contractor',
];

function findBuyer(project: MonitorProjectDetail): string {
  const entity = project.entities?.find((e) =>
    BUYER_ROLE_HINTS.some((h) => (e.role || '').toLowerCase().includes(h)),
  );
  if (entity?.name) return entity.name;
  const contact = project.contacts?.find((c) => c.organization);
  if (contact?.organization) return contact.organization;
  const place = [project.country, project.region].filter(Boolean).join(', ');
  return place ? `Maître d'ouvrage (${place})` : 'Maître d\'ouvrage à préciser';
}

/** Date limite de remise : absente du Monitor → placeholder à +30 jours. */
function deriveDeadline(project: MonitorProjectDetail): { iso: string; derived: boolean } {
  // On n'utilise PAS end_date (= fin de chantier, pas la remise des offres).
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setHours(12, 0, 0, 0);
  return { iso: d.toISOString(), derived: true };
}

function buildDescription(project: MonitorProjectDetail, deadlineDerived: boolean): string {
  const parts: string[] = [];
  const typeLabel = project.type ? PROJECT_TYPE_LABELS[project.type] ?? project.type : null;
  const place = [project.country, project.region].filter(Boolean).join(', ');
  parts.push(
    `Opportunité repérée par le Global Monitor${typeLabel ? ` — ${typeLabel}` : ''}${place ? ` (${place})` : ''}.`,
  );
  if (project.equipment_needs && project.equipment_needs.length > 0) {
    const needs = project.equipment_needs
      .map((n) => n.marketplace_label || n.category)
      .filter(Boolean)
      .slice(0, 8)
      .join(', ');
    if (needs) parts.push(`Besoins matériels détectés : ${needs}.`);
  }
  if (project.source) parts.push(`Source : ${project.source}${project.source_url ? ` (${project.source_url})` : ''}.`);
  parts.push(
    deadlineDerived
      ? '⚠ Date limite de remise fixée par défaut à +30 jours — corrigez-la avec la vraie date du DCE.'
      : '',
  );
  return parts.filter(Boolean).join('\n');
}

/**
 * Construit un Tender à partir d'un AO du Monitor.
 * @param author nom de l'utilisateur courant (pour l'historique)
 */
export function monitorProjectToTender(project: MonitorProjectDetail, author: string): Tender {
  const sector: Sector = (project.type && SECTOR_BY_PROJECT_TYPE[project.type]) || 'btp';
  const marketType: MarketType = 'travaux';
  const { iso: deadline, derived } = deriveDeadline(project);
  const year = new Date().getFullYear();
  const now = nowIso();

  return {
    id: uid('ao'),
    reference: `AO-MON-${year}-${project.id.slice(0, 6)}`,
    title: project.title || 'Appel d\'offres (sans titre)',
    buyer: findBuyer(project),
    sector,
    marketType,
    status: 'en_analyse',
    deadline,
    estimatedAmount: project.budget_usd ?? undefined,
    currency: 'USD',
    description: buildDescription(project, derived),
    awardCriteria: [
      { id: uid('c'), label: 'Prix', weight: 50 },
      { id: uid('c'), label: 'Valeur technique', weight: 40 },
      { id: uid('c'), label: 'Délai', weight: 10 },
    ],
    requiredDocuments: [
      { id: uid('rd'), label: 'Dossier administratif', category: 'administratif', available: false },
      { id: uid('rd'), label: 'Mémoire technique', category: 'technique', available: false },
      { id: uid('rd'), label: 'Offre financière (bordereau des prix)', category: 'financier', available: false },
    ],
    requirements: [],
    strategy: undefined,
    dceAnalysis: undefined,
    goNoGo: { criteria: DEFAULT_GONOGO_CRITERIA.map((c) => ({ ...c })) },
    tasks: [],
    // Traçabilité vers la source Monitor (back-link + déduplication).
    sourceProjectId: project.id,
    sourceUrl: project.source_url ?? undefined,
    history: [
      {
        id: uid('h'),
        date: now,
        author,
        action: 'Dossier créé depuis le Global Monitor',
        detail: project.source ? `Source : ${project.source}` : undefined,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
