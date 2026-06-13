// Registre des modules NextGen — source de vérité de l'état RÉEL de chaque brique.
// Sert le repositionnement (Phase 2) : la page Services affiche ces modules avec leur
// statut honnête (anti-façade : on ne prétend pas « actif » ce qui ne l'est pas).

export type ModuleStatus = 'live' | 'beta' | 'planned';

export interface NextGenModule {
  key: string;
  name: string;
  tagline: string;
  status: ModuleStatus;
  /** Ce qui est réellement livré (schéma/logique/tests) vs à brancher. */
  delivered: string[];
  pending: string[];
  doc: string;
}

export const NEXTGEN_MODULES: NextGenModule[] = [
  {
    key: 'trust',
    name: 'Trust Layer',
    tagline: 'Vérification & score de confiance vendeur',
    status: 'beta',
    delivered: ['Schéma + RLS', 'computeTrustScore (testé)', 'TrustBadge', 'Edge recompute-trust-score'],
    pending: ['Back-office de revue', 'Vérification automatisée registres'],
    doc: 'docs/TRUST_LAYER.md',
  },
  {
    key: 'inspection',
    name: 'MineGrid Inspection',
    tagline: 'Inspection certifiée des machines (photos, grade, PDF)',
    status: 'beta',
    delivered: ['Schéma + RLS', 'Calcul de grade (testé)'],
    pending: ['App inspecteur', 'Génération PDF', 'Edge certify-report'],
    doc: 'docs/INSPECTION.md',
  },
  {
    key: 'escrow',
    name: 'MineGrid Escrow',
    tagline: 'Séquestre conditionné inspection + livraison',
    status: 'beta',
    delivered: ['Schéma + RLS', 'Machine d\'état (testée)', 'Edge escrow-webhook signé'],
    pending: ['Intégration PSP partenaire', 'UI suivi transaction'],
    doc: 'docs/ESCROW.md',
  },
  {
    key: 'finance',
    name: 'MineGrid Finance',
    tagline: 'Financement via partenaires (zéro risque porté)',
    status: 'beta',
    delivered: ['Schéma + RLS', 'Scoring de dossier (testé)'],
    pending: ['Partenaires signés', 'Transmission API banques'],
    doc: 'docs/FINANCE.md',
  },
  {
    key: 'logistics',
    name: 'MineGrid Logistics',
    tagline: 'Transport, transit & dédouanement',
    status: 'planned',
    delivered: ['Schéma + RLS', 'Estimation de devis (testée)'],
    pending: ['Transporteurs partenaires', 'Tracking', 'UI'],
    doc: 'docs/LOGISTICS.md',
  },
  {
    key: 'intelligence',
    name: 'MineGrid Intelligence',
    tagline: 'Projets miniers/BTP & alertes marché (abonnés)',
    status: 'beta',
    delivered: ['Schéma + RLS abonnés', 'Matching d\'alerte (testé)', 'Ingestion monitor-service'],
    pending: ['Dashboard veille', 'Alertes WhatsApp'],
    doc: 'docs/MARKET_INTELLIGENCE.md',
  },
  {
    key: 'data',
    name: 'MineGrid Data',
    tagline: 'Référentiel de prix propriétaire & estimation',
    status: 'beta',
    delivered: ['Schéma (deny par défaut)', 'estimatePrice (testé)'],
    pending: ['RPC estimate_price', 'Normalisation marques/modèles'],
    doc: 'docs/DATA_PLATFORM.md',
  },
  {
    key: 'ai',
    name: 'MineGrid IA',
    tagline: 'Estimation prix, détection fraude, scoring',
    status: 'beta',
    delivered: ['fraudSignals (testé)', 'Scoring finance/confiance (testés)'],
    pending: ['Modèles ML sur data propriétaire'],
    doc: 'docs/AI_STRATEGY.md',
  },
];

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  live: 'En production',
  beta: 'Bêta (socle livré)',
  planned: 'Planifié',
};
