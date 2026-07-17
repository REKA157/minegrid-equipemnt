import type { SubscriptionType } from '../utils/api/subscription';

// GRILLE TARIFAIRE CANONIQUE — SOURCE DE VÉRITÉ UNIQUE côté front (USD, mensuel,
// paiement Paddle). Toute page qui affiche un plan (ProSubscription, Register,
// Dashboard, RequireSubscription…) DOIT lire ce fichier, jamais sa propre copie.
//
// ⚠️ PIÈGE HISTORIQUE — à lire avant de modifier :
// Les CODES INTERNES (valeurs stockées en base dans pro_clients.subscription_type,
// renvoyées par get_effective_subscription et comparées par PLAN_RANK) datent de
// l'ancienne grille et NE correspondent PLUS aux noms affichés :
//   code interne 'pro'        → affiché « Premium »    (20 $/mois — gestion du parc)
//   code interne 'premium'    → affiché « Pro »        (50 $/mois — AO + IA + radar)
//   code interne 'enterprise' → affiché « Enterprise » (200 $/mois — métiers + équipe)
// On ne renomme PAS les codes internes : des abonnements existent déjà en base et
// la hiérarchie PLAN_RANK (pro < premium < enterprise) reste correcte. Tout
// affichage doit passer par planDisplayName()/getPaidPlan(), jamais par le code brut.

export const PLAN_RANK: Record<SubscriptionType, number> = {
  basic: 1,
  pro: 2,
  premium: 3,
  enterprise: 4,
};

export type PaidPlanId = Exclude<SubscriptionType, 'basic'>;

export interface PaidPlanDef {
  /** Code interne (base de données / RANK) — voir le piège historique ci-dessus. */
  internalId: PaidPlanId;
  /** Nom affiché aux clients. */
  displayName: string;
  priceUsd: number;
  tagline: string;
  maxUsers: number;
  popular: boolean;
  features: string[];
  /**
   * Identifiant de prix Paddle (pri_…) — PUBLIC (pas un secret), injecté par env.
   * Le montant réellement facturé est celui du catalogue Paddle : le webhook
   * paddle-webhook fait foi et vérifie que le prix payé correspond au plan accordé.
   */
  paddlePriceId: string;
}

export const FREE_PLAN = {
  displayName: 'Gratuit',
  priceUsd: 0,
  tagline: 'Explorer la marketplace',
  maxUsers: 1,
  features: [
    'Consulter toutes les annonces',
    'Contacter les vendeurs',
    'Demander des devis',
    'Publier des annonces',
  ],
} as const;

const env = import.meta.env;

export const PAID_PLANS: PaidPlanDef[] = [
  {
    internalId: 'pro',
    displayName: 'Premium',
    priceUsd: 20,
    tagline: 'Gérer son parc',
    maxUsers: 1,
    popular: false,
    features: [
      'Tout le plan Gratuit',
      'Dashboard de gestion du parc',
      'Équipements, commandes, maintenance',
      'Documents et messages',
      'Support par email',
    ],
    paddlePriceId: env.VITE_PADDLE_PRICE_PREMIUM_20USD ?? '',
  },
  {
    internalId: 'premium',
    displayName: 'Pro',
    priceUsd: 50,
    tagline: 'Développer son activité',
    maxUsers: 1,
    popular: true,
    features: [
      'Tout le plan Premium',
      "Appels d'offres assistés par IA",
      'Assistant IA',
      "Radar d'opportunités",
      'Support prioritaire',
    ],
    paddlePriceId: env.VITE_PADDLE_PRICE_PRO_50USD ?? '',
  },
  {
    internalId: 'enterprise',
    displayName: 'Enterprise',
    priceUsd: 200,
    tagline: 'Métiers et grande échelle',
    maxUsers: 5,
    popular: false,
    features: [
      'Tout le plan Pro',
      'Cockpit personnalisable par métier',
      'Pipeline commercial',
      'Équipe : 5 utilisateurs',
      'Support dédié 24/7 + SLA',
    ],
    paddlePriceId: env.VITE_PADDLE_PRICE_ENTERPRISE_200USD ?? '',
  },
];

/** Tolère les variantes historiques ('entreprise' français, casse) → code interne. */
export function normalizePlanId(raw: unknown): SubscriptionType | null {
  switch (String(raw ?? '').trim().toLowerCase()) {
    case 'basic':
      return 'basic';
    case 'pro':
      return 'pro';
    case 'premium':
      return 'premium';
    case 'entreprise':
    case 'enterprise':
      return 'enterprise';
    default:
      return null;
  }
}

export function getPaidPlan(planId: unknown): PaidPlanDef | null {
  const id = normalizePlanId(planId);
  if (!id || id === 'basic') return null;
  return PAID_PLANS.find((p) => p.internalId === id) ?? null;
}

/** Nom AFFICHÉ pour un code interne (ex. 'premium' → « Pro »). */
export function planDisplayName(planId: unknown): string {
  const id = normalizePlanId(planId);
  if (id === 'basic') return 'Basic';
  return getPaidPlan(id)?.displayName ?? FREE_PLAN.displayName;
}

/** Prix mensuel USD pour un code interne (0 si gratuit/inconnu). */
export function planPriceUsd(planId: unknown): number {
  return getPaidPlan(planId)?.priceUsd ?? 0;
}

/**
 * Destination post-activation de chaque plan (par code INTERNE) — utilisée par
 * la page de tarifs, l'inscription et l'activation par code promo, pour que
 * tous les parcours atterrissent au même endroit.
 */
export const PLAN_HOME_HASH: Record<string, string> = {
  pro: '#pro',
  premium: '#premium-dashboard',
  enterprise: '#dashboard-entreprise',
};

export function planHomeHash(planId: unknown): string {
  const id = normalizePlanId(planId);
  return (id && PLAN_HOME_HASH[id]) || '#dashboard';
}
