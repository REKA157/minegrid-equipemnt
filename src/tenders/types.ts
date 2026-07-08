/**
 * Module Appels d'offres — modèle de domaine.
 *
 * Couvre tout le cycle : opportunité → analyse DCE → conformité → go/no-go
 * → production des pièces (mémoire technique, pièces administratives…)
 * → validation → export final. Fonctionne intégralement en local
 * (store zustand persisté) ; la couche IA (src/tenders/ai) est mockée
 * tant qu'aucune API n'est configurée.
 */

// ---------------------------------------------------------------------------
// Statuts & workflow
// ---------------------------------------------------------------------------

export type TenderStatus =
  | 'brouillon'
  | 'en_analyse'
  | 'a_completer'
  | 'en_redaction'
  | 'en_validation'
  | 'pret_a_deposer'
  | 'depose'
  | 'gagne'
  | 'perdu'
  | 'abandonne';

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  brouillon: 'Brouillon',
  en_analyse: 'En analyse',
  a_completer: 'À compléter',
  en_redaction: 'En rédaction',
  en_validation: 'En validation',
  pret_a_deposer: 'Prêt à déposer',
  depose: 'Déposé',
  gagne: 'Gagné',
  perdu: 'Perdu',
  abandonne: 'Abandonné',
};

/** Ordre logique du workflow (pour la frise d'avancement). */
export const TENDER_WORKFLOW: TenderStatus[] = [
  'brouillon',
  'en_analyse',
  'a_completer',
  'en_redaction',
  'en_validation',
  'pret_a_deposer',
  'depose',
];

export type MarketType =
  | 'travaux'
  | 'services'
  | 'fournitures'
  | 'mixte';

export const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  travaux: 'Marché de travaux',
  services: 'Marché de services',
  fournitures: 'Marché de fournitures',
  mixte: 'Marché mixte',
};

export type Sector =
  | 'btp'
  | 'services'
  | 'informatique'
  | 'maintenance'
  | 'securite'
  | 'nettoyage'
  | 'transport'
  | 'fournitures'
  | 'autre';

export const SECTOR_LABELS: Record<Sector, string> = {
  btp: 'BTP / Construction',
  services: 'Services',
  informatique: 'Informatique / Digital',
  maintenance: 'Maintenance',
  securite: 'Sécurité / Télésurveillance',
  nettoyage: 'Nettoyage / Propreté',
  transport: 'Transport / Logistique',
  fournitures: 'Fournitures',
  autre: 'Autre',
};

// ---------------------------------------------------------------------------
// Appel d'offres (opportunité)
// ---------------------------------------------------------------------------

export interface AwardCriterion {
  id: string;
  label: string;
  /** Pondération en % (la somme devrait faire 100). */
  weight: number;
}

export interface RequiredDocument {
  id: string;
  label: string;
  /** administratif | technique | financier */
  category: 'administratif' | 'technique' | 'financier';
  /** L'entreprise dispose-t-elle déjà de cette pièce ? */
  available: boolean;
  /** Id du document généré couvrant cette pièce (si produit dans l'app). */
  generatedDocId?: string;
  note?: string;
}

export interface TenderTask {
  id: string;
  title: string;
  assignee: string;
  dueDate: string; // ISO date
  status: 'a_faire' | 'en_cours' | 'fait';
  comment?: string;
}

export interface HistoryEntry {
  id: string;
  date: string; // ISO datetime
  author: string;
  action: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Référentiel d'exigences — cœur de la réponse à l'appel d'offres
// ---------------------------------------------------------------------------

/**
 * Chaque exigence extraite du DCE (CCTP, CCAP, RC…) est tracée ici, avec
 * son statut de conformité ET la réponse de l'entreprise point par point.
 * Ce référentiel alimente : la matrice de conformité (export Excel), le
 * document « Réponse point par point » (export Word), le scoring go/no-go
 * et les alertes du dossier.
 */

export type RequirementLevel = 'imperatif' | 'important' | 'souhaitable';

export const REQUIREMENT_LEVEL_LABELS: Record<RequirementLevel, string> = {
  imperatif: 'Impératif',
  important: 'Important',
  souhaitable: 'Souhaitable',
};

export type RequirementCoverage = 'a_traiter' | 'conforme' | 'partiel' | 'non_conforme';

export const REQUIREMENT_COVERAGE_LABELS: Record<RequirementCoverage, string> = {
  a_traiter: 'À traiter',
  conforme: 'Conforme',
  partiel: 'Partiellement conforme',
  non_conforme: 'Non conforme',
};

export const REQUIREMENT_CATEGORIES = [
  'Technique',
  'Administratif',
  'Financier',
  'Délais / planning',
  'Qualité',
  'Sécurité / HSE',
  'Environnement',
  'Contractuel',
  'Pièces à fournir',
  'Point bloquant',
  'Éligibilité',
  'Autre',
] as const;

export interface TenderRequirement {
  id: string;
  /** Code court affiché partout : TE-001, PI-002, BL-001… */
  code: string;
  /** Texte de l'exigence telle qu'exprimée par l'acheteur. */
  text: string;
  /** Localisation dans le DCE : « CCTP art. 4.2 », « RC art. 6 »… */
  source: string;
  category: string;
  level: RequirementLevel;
  /** Statut de conformité de notre offre vis-à-vis de l'exigence. */
  coverage: RequirementCoverage;
  /** Notre réponse point par point (reprise dans le document de réponse). */
  response: string;
  responsible: string;
  /** Preuve / pièce justificative (certificat, référence, annexe…). */
  evidence: string;
  comment: string;
}

// ---------------------------------------------------------------------------
// Stratégie de réponse
// ---------------------------------------------------------------------------

export interface CriterionApproach {
  criterionId: string;
  label: string;
  weight: number;
  /** Notre angle pour maximiser la note sur ce critère. */
  approach: string;
}

export interface ResponseStrategy {
  /** Positionnement de l'offre en 2-3 phrases. */
  positioning: string;
  /** Messages clés (win themes) répétés dans tout le dossier. */
  winThemes: string[];
  /** Différenciateurs concrets face à la concurrence. */
  differentiators: string;
  /** Angle de réponse par critère de notation de l'acheteur. */
  criteriaApproaches: CriterionApproach[];
  /** Points de vigilance à couvrir explicitement dans la réponse. */
  vigilancePoints: string;
  updatedAt: string;
  /** true si la proposition initiale vient du mock IA. */
  simulated?: boolean;
}

export interface KeyDate {
  id: string;
  label: string;
  date: string; // ISO date
}

/** Résultat (réel ou simulé) de l'analyse du DCE importé. */
export interface DceAnalysisResult {
  analyzedAt: string;
  /** Fichiers importés (nom + taille) — le contenu n'est pas conservé. */
  files: { name: string; size: number }[];
  detectedDocuments: { name: string; type: string; pages?: number }[];
  keyClauses: { title: string; excerpt: string; risk: 'faible' | 'moyen' | 'eleve' }[];
  keyDates: KeyDate[];
  requiredDocuments: { label: string; category: RequiredDocument['category'] }[];
  awardCriteria: AwardCriterion[];
  technicalRequirements: string[];
  contractualRisks: string[];
  blockingPoints: string[];
  summary: string;
  /** true si produit par le mock (pas une vraie analyse). */
  simulated: boolean;
}

// ---------------------------------------------------------------------------
// Scoring go / no-go
// ---------------------------------------------------------------------------

export interface GoNoGoCriterion {
  id: string;
  label: string;
  help: string;
  /** Pondération relative (somme libre, normalisée au calcul). */
  weight: number;
  /** Note 0–5 saisie par l'utilisateur. */
  score: number;
}

export type GoNoGoRecommendation = 'repondre' | 'prudence' | 'ne_pas_repondre';

export interface GoNoGoResult {
  computedAt: string;
  globalScore: number; // 0–100
  recommendation: GoNoGoRecommendation;
  reasons: string[];
  risks: string[];
  actions: string[];
}

export interface GoNoGoState {
  criteria: GoNoGoCriterion[];
  result?: GoNoGoResult;
  /** Décision humaine finale (peut diverger de la recommandation). */
  decision?: 'go' | 'no_go';
  decidedBy?: string;
  decidedAt?: string;
}

// ---------------------------------------------------------------------------
// Documents générés
// ---------------------------------------------------------------------------

export type DocumentType =
  | 'cahier_des_charges'
  | 'cctp'
  | 'ccap'
  | 'reglement_consultation'
  | 'bpu'
  | 'dpgf'
  | 'memoire_technique'
  | 'reponse_administrative'
  | 'planning'
  | 'note_methodologique'
  | 'analyse_risques'
  | 'grille_conformite'
  | 'reponse_point_par_point'
  | 'synthese_gonogo'
  | 'pieces_manquantes';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  cahier_des_charges: 'Cahier des charges',
  cctp: 'CCTP — Clauses techniques',
  ccap: 'CCAP simplifié — Clauses administratives',
  reglement_consultation: 'Règlement de consultation',
  bpu: 'BPU — Bordereau de prix unitaires',
  dpgf: 'DPGF — Décomposition du prix',
  memoire_technique: 'Mémoire technique',
  reponse_administrative: 'Réponse administrative',
  planning: 'Planning prévisionnel',
  note_methodologique: 'Note méthodologique',
  analyse_risques: 'Analyse des risques',
  grille_conformite: 'Matrice de conformité',
  reponse_point_par_point: 'Réponse point par point',
  synthese_gonogo: 'Synthèse Go / No-Go',
  pieces_manquantes: 'Liste des pièces manquantes',
};

export interface DocTable {
  columns: string[];
  rows: string[][];
}

export interface DocSection {
  id: string;
  title: string;
  /** Texte multi-paragraphes (séparés par des lignes vides). */
  content: string;
  /** Tableau optionnel affiché après le texte (BPU, DPGF, grilles…). */
  table?: DocTable;
}

export type DocumentStatus = 'brouillon' | 'en_validation' | 'valide';

export interface GeneratedDocument {
  id: string;
  type: DocumentType;
  title: string;
  /** AO lié (absent pour un cahier des charges autonome). */
  tenderId?: string;
  sections: DocSection[];
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
  /** true si le contenu vient du mock IA. */
  simulated?: boolean;
}

// ---------------------------------------------------------------------------
// Appel d'offres — entité principale
// ---------------------------------------------------------------------------

export interface Tender {
  id: string;
  reference: string;
  title: string;
  buyer: string; // acheteur / maître d'ouvrage
  sector: Sector;
  marketType: MarketType;
  status: TenderStatus;
  deadline: string; // date limite de remise (ISO)
  estimatedAmount?: number; // en devise locale
  currency: string;
  description: string;
  awardCriteria: AwardCriterion[];
  requiredDocuments: RequiredDocument[];
  /** Référentiel d'exigences extrait du DCE = matrice de conformité. */
  requirements: TenderRequirement[];
  /** Stratégie de réponse (alimente le mémoire et la réponse point par point). */
  strategy?: ResponseStrategy;
  dceAnalysis?: DceAnalysisResult;
  goNoGo: GoNoGoState;
  tasks: TenderTask[];
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Cahier des charges (assistant de rédaction)
// ---------------------------------------------------------------------------

export interface CahierDesChargesInput {
  projectName: string;
  projectType: string;
  sector: Sector;
  context: string;
  objectives: string;
  scope: string;
  technicalConstraints: string;
  regulatoryConstraints: string;
  deliverables: string;
  planning: string;
  qualityCriteria: string;
  receptionTerms: string;
  penalties: string;
  safetyRequirements: string;
  environmentalRequirements: string;
  annexes: string;
  estimatedBudget: string;
}

export const EMPTY_CDC_INPUT: CahierDesChargesInput = {
  projectName: '',
  projectType: '',
  sector: 'btp',
  context: '',
  objectives: '',
  scope: '',
  technicalConstraints: '',
  regulatoryConstraints: '',
  deliverables: '',
  planning: '',
  qualityCriteria: '',
  receptionTerms: '',
  penalties: '',
  safetyRequirements: '',
  environmentalRequirements: '',
  annexes: '',
  estimatedBudget: '',
};

// ---------------------------------------------------------------------------
// Base entreprise
// ---------------------------------------------------------------------------

export interface CompanyReference {
  id: string;
  title: string;
  client: string;
  year: string;
  amount: string;
  description: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  experience: string;
  qualifications: string;
}

export interface CompanyEquipment {
  id: string;
  name: string;
  quantity: number;
  note: string;
}

export interface CompanyCertification {
  id: string;
  name: string;
  issuer: string;
  validUntil: string;
}

export interface CompanyAdminDoc {
  id: string;
  name: string;
  /** ex : attestation fiscale, CNSS, assurance décennale… */
  kind: string;
  validUntil: string;
  available: boolean;
}

export interface CompanyProfile {
  name: string;
  legalForm: string;
  address: string;
  city: string;
  country: string;
  /** Identifiants selon pays : SIRET (FR), ICE / RC (MA)… */
  registrationIds: { label: string; value: string }[];
  phone: string;
  email: string;
  website: string;
  capital: string;
  employees: string;
  yearFounded: string;
  presentation: string;
  insurances: string;
  certifications: CompanyCertification[];
  references: CompanyReference[];
  team: TeamMember[];
  equipment: CompanyEquipment[];
  adminDocs: CompanyAdminDoc[];
  signatoryName: string;
  signatoryRole: string;
}

// ---------------------------------------------------------------------------
// Bibliothèque de contenus réutilisables
// ---------------------------------------------------------------------------

export type LibraryCategory =
  | 'clause'
  | 'paragraphe'
  | 'reference'
  | 'methodologie'
  | 'profil'
  | 'materiel'
  | 'certification'
  | 'document_admin'
  | 'modele_reponse'
  | 'modele_cdc';

export const LIBRARY_CATEGORY_LABELS: Record<LibraryCategory, string> = {
  clause: 'Clauses types',
  paragraphe: 'Paragraphes types',
  reference: 'Références projet',
  methodologie: 'Méthodologies',
  profil: 'Profils collaborateurs',
  materiel: 'Moyens matériels',
  certification: 'Certifications',
  document_admin: 'Documents administratifs',
  modele_reponse: 'Modèles de réponse',
  modele_cdc: 'Modèles de cahier des charges',
};

export interface LibraryItem {
  id: string;
  category: LibraryCategory;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Rôles & paramètres
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'redacteur' | 'validateur' | 'lecteur';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  redacteur: 'Rédacteur',
  validateur: 'Validateur',
  lecteur: 'Lecteur',
};

export interface TenderSettings {
  currentUserName: string;
  currentUserRole: UserRole;
  /** Point d'entrée d'une API IA réelle (sinon mode simulation). */
  aiApiConfigured: boolean;
}

/** Droits par rôle — volontairement simple mais réellement appliqué dans l'UI. */
export function can(
  role: UserRole,
  action: 'edit' | 'validate' | 'delete' | 'manage_company' | 'decide_gonogo',
): boolean {
  switch (action) {
    case 'edit':
      return role === 'admin' || role === 'redacteur';
    case 'validate':
      return role === 'admin' || role === 'validateur';
    case 'decide_gonogo':
      return role === 'admin' || role === 'validateur';
    case 'delete':
    case 'manage_company':
      return role === 'admin';
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers communs
// ---------------------------------------------------------------------------

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Jours restants avant une date (négatif si dépassée). */
export function daysUntil(dateIso: string): number {
  const target = new Date(dateIso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function formatDate(dateIso?: string): string {
  if (!dateIso) return '—';
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatAmount(amount?: number, currency = 'MAD'): string {
  if (amount === undefined || amount === null) return '—';
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}
