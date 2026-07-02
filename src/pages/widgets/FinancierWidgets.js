import { DollarSign, TrendingUp, CreditCard, PieChart } from 'lucide-react';

// Widgets pour le métier Financier / Finance
export const FinancierWidgets = {
  metier: 'Financier / Finance',
  description: 'Gestion financière et comptabilité',
  widgets: [
    {
      id: 'cash-flow',
      type: 'chart',
      title: 'Flux de trésorerie',
      description: 'Entrées et sorties de fonds',
      icon: DollarSign,
      dataSource: 'cash_flow',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true
      }
    },
    {
      id: 'revenue-growth',
      type: 'chart',
      title: 'Croissance des revenus',
      description: 'Évolution des revenus mensuels',
      icon: TrendingUp,
      dataSource: 'revenue',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    },
    {
      id: 'payment-status',
      type: 'list',
      title: 'État des paiements',
      description: 'Paiements en attente et échus',
      icon: CreditCard,
      dataSource: 'payments',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'expense-breakdown',
      type: 'chart',
      title: 'Répartition des dépenses',
      description: 'Analyse des coûts par catégorie',
      icon: PieChart,
      dataSource: 'expenses',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    }
  ]
};

export default FinancierWidgets; 
