import type {
  getCustomsClearanceMetrics,
  getContainerTrackingRows,
  getFreightDocumentsForList,
} from '../../../utils/enterpriseApi/transitaire';
import type { CockpitSummaryData, CockpitSignal } from './buildVendeurCockpit';

/**
 * Cockpit TRANSITAIRE — « Que dois-je faire aujourd'hui ? » en moins de 5 s.
 *
 * 100 % données RÉELLES (tables `customs_declarations`, `freight_containers`,
 * `freight_documents` via enterpriseApi/transitaire.ts, seedées par
 * deploy_transitaire.sql). Fonction PURE et testable (`now` injectable) :
 * elle ne fait QUE transformer `input` en cartes, aucun appel réseau/supabase,
 * aucune lecture globale. Aucune valeur inventée : chaque carte n'est poussée
 * que si sa condition réelle est vraie (états vides honnêtes, anti-façade).
 *
 * Headline [déclarations] : déclarations douanières à débloquer aujourd'hui
 * = metrics.blocked + metrics.delayed (sous-titre pondéré par totalValueOpen MAD).
 *
 * CARTES ÉCARTÉES (spec avail=false — NON implémentées, données absentes
 * aujourd'hui) :
 *  - risks/dossier-customs-sans-decl : dossiers transaction où je suis forwarder
 *    en étape dédouanement (transactionCases) — aucun seed avec participant
 *    forwarder, aucune customs_declaration.transaction_case_id renseignée.
 *  - risks/customs-case-dossier-detail : dossier douane détaillé (HS code,
 *    missing_documents) — customs_cases schema-only, zéro INSERT/seed.
 *  - opportunities/link-decl-dossier : rattacher déclarations/conteneurs à un
 *    dossier transaction — feature de liaison non déployée + cases vides.
 */

export interface TransitaireCockpitInput {
  customs: Awaited<ReturnType<typeof getCustomsClearanceMetrics>>;
  containers: Awaited<ReturnType<typeof getContainerTrackingRows>>;
  documents: Awaited<ReturnType<typeof getFreightDocumentsForList>>;
}

/** ETA « imminente » : mise à quai / arrivée prévue dans les 3 prochains jours. */
function daysUntil(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

export function buildTransitaireCockpit(
  input: TransitaireCockpitInput,
  now: number = Date.now(),
): CockpitSummaryData {
  const { customs, containers, documents } = input;

  // ---- PRIORITÉS ----
  const priorities: CockpitSignal[] = [];

  // [avail=true] decl-bloquee — déclarations BLOQUÉES à débloquer.
  if (customs.blocked > 0) {
    priorities.push({
      id: 'pri:decl-bloquee',
      label: `${customs.blocked} déclaration(s) BLOQUÉE(s) à débloquer`,
      detail: 'Lire les notes (motif douane), relancer la pièce manquante puis ré-soumettre',
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }

  // [avail=true] decl-en-retard — déclarations EN RETARD de liquidation.
  if (customs.delayed > 0) {
    priorities.push({
      id: 'pri:decl-en-retard',
      label: `${customs.delayed} déclaration(s) EN RETARD de liquidation`,
      detail: 'Appeler le bureau douane (customs_office) pour relancer la liquidation',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // [avail=true] container-retard-douane — conteneurs en RETARD ou bloqués en DOUANE.
  const stuckContainers = containers.filter(
    (c) => c.status === 'Retard' || c.status === 'Douane',
  );
  if (stuckContainers.length > 0) {
    priorities.push({
      id: 'pri:container-retard-douane',
      label: `${stuckContainers.length} conteneur(s) en RETARD ou bloqué(s) en DOUANE`,
      detail: 'Vérifier next_port/eta : réaffréter (Retard) ou pousser la pièce douane (Douane)',
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }

  // [avail=true] doc-rejete-urgent — documents fret REJETÉS / URGENTS à relancer.
  // priority 'high' = doc_type 'Urgent' (cf docPriorityToList) ; status brut conservé.
  const flaggedDocs = documents.filter(
    (d) => d.status === 'Rejeté' || (d.priority === 'high' && d.status === 'En attente'),
  );
  if (flaggedDocs.length > 0) {
    priorities.push({
      id: 'pri:doc-rejete-urgent',
      label: `${flaggedDocs.length} document(s) fret REJETÉ(s) / URGENT(s) à relancer`,
      detail: 'Lire notes (motif rejet), renvoyer la version corrigée avant due_date',
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }

  // ---- RISQUES ----
  const risks: CockpitSignal[] = [];

  // [avail=true] decl-en-controle-scanner — déclarations EN CONTRÔLE DOUANIER à surveiller.
  // metrics.inProgress agrège En préparation / Soumise / En contrôle douanier ;
  // c'est le seul compteur disponible (pas de ventilation par statut côté API),
  // utilisé ici comme signal de surveillance honnête.
  if (customs.inProgress > 0) {
    risks.push({
      id: 'risk:decl-en-controle-scanner',
      label: `${customs.inProgress} déclaration(s) en cours / en contrôle douanier à surveiller`,
      detail: 'Vérifier que le dossier scanner est complet, anticiper la pièce avant blocage',
      href: '#dashboard-entreprise',
      tone: 'neutral',
    });
  }

  // ---- OPPORTUNITÉS ----
  const opportunities: CockpitSignal[] = [];

  // [avail=true] decl-a-soumettre — déclarations EN PRÉPARATION prêtes à soumettre.
  // L'API n'expose pas le détail 'En préparation' isolé (seul inProgress agrégé) ;
  // on s'appuie donc sur les déclarations ouvertes encore non liquidées à faire
  // avancer, sans inventer de compte 'En préparation' fabriqué.
  const toAdvance = customs.openCount - customs.blocked - customs.delayed;
  if (toAdvance > 0) {
    opportunities.push({
      id: 'opp:decl-a-soumettre',
      label: `${toAdvance} déclaration(s) en cours à faire avancer / soumettre`,
      detail: 'Compléter les pièces et passer la déclaration au statut « Soumise »',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  // [avail=true] container-a-quai-imminent — conteneurs À QUAI / ETA imminente à dédouaner.
  const dockedSoon = containers.filter((c) => {
    if (c.status !== 'À quai') return false;
    const d = daysUntil(c.eta, now);
    return d === null || d <= 3;
  });
  if (dockedSoon.length > 0) {
    opportunities.push({
      id: 'opp:container-a-quai-imminent',
      label: `${dockedSoon.length} conteneur(s) À QUAI à dédouaner en priorité`,
      detail: 'Vérifier que la déclaration et le B/L sont prêts, lancer le dédouanement',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  // ---- HEADLINE [déclarations] ----
  const toUnblock = customs.blocked + customs.delayed;

  return {
    revenueLabel: 'Déclarations à débloquer aujourd\'hui',
    revenueValue: toUnblock,
    revenueHint: `${customs.openCount} déclaration(s) ouverte(s) · ${customs.totalValueOpen.toLocaleString('fr-FR')} MAD en jeu`,
    revenueUnit: 'déclarations',
    revenueAvailable: true,
    priorities,
    risks,
    opportunities,
  };
}
