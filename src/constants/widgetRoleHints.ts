/**
 * Phrase courte décrivant le RÔLE de chaque widget, affichée via le petit « i »
 * dans l'en-tête de carte (cf. InfoTooltip). Sert de repli quand la description
 * du widget n'est pas persistée dans la config du tableau de bord.
 *
 * Clé = `type` du widget (cf. DASHBOARD_WIDGET_TYPES). On ne met de phrase que
 * pour les types au rôle clair — les types génériques n'affichent pas de « i ».
 */
export const WIDGET_ROLE_HINTS: Record<string, string> = {
  // Les deux widgets IA (rôles bien distincts).
  'ai-insights':
    'Vos actions commerciales prioritaires : quels leads relancer, quels dossiers sont à risque, quelles opportunités saisir.',
  'ai-optimization':
    'Comment améliorer vos annonces pour vendre plus : prix, SEO, contenu et marketing.',

  // Widgets commerciaux courants.
  pipeline:
    'Suivi de vos affaires en cours (leads) par étape, du premier contact jusqu’à la vente.',
  priority:
    'Votre liste d’actions du jour classées par priorité (appels, relances, tâches).',
  'daily-priority':
    'Votre liste d’actions du jour classées par priorité (appels, relances, tâches).',
  'daily-actions':
    'Les actions commerciales à mener maintenant, triées par urgence.',
  performance:
    'Votre score de performance commerciale, avec les leviers concrets pour l’améliorer.',
  'sales-analytics':
    'L’évolution de vos ventes : tendances, comparaisons et prévisions.',
  'market-trends':
    'Les tendances du marché utiles à vos décisions de prix et d’achat.',
  inventory:
    'L’état de votre stock et des suggestions de revente.',
  'customer-leads':
    'Vos prospects et le suivi de chaque contact.',
  'quotes-management':
    'Vos devis et leur statut (envoyé, accepté, en attente).',
  'after-sales-service':
    'Le suivi du service après-vente et des interventions.',
  'equipment-catalog':
    'Le catalogue de vos équipements publiés.',
  maintenance:
    'Le suivi des maintenances et des interventions techniques.',
};
