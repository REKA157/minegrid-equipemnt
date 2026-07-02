import { DollarSign, Target, TrendingUp, Shield, FolderOpen, TrendingDown } from 'lucide-react';

// Widgets pour le métier Investisseur
export const InvestisseurWidgets = {
  metier: 'Investisseur',
  description: 'Investissement et financement',
  widgets: [
    {
      id: 'transaction-cases',
      type: 'list',
      title: 'Mes dossiers transaction',
      description: 'Suivi des dossiers où vous achetez ou investissez (selon vos droits)',
      icon: FolderOpen,
      dataSource: 'transaction_cases',
      features: {
        periodSelector: false,
        export: false,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'portfolio-value',
      type: 'metric',
      title: 'Valeur portefeuille',
      description: 'Valeur totale des investissements',
      icon: DollarSign,
      dataSource: 'portfolio',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true
      }
    },
    {
      id: 'investment-opportunities',
      type: 'list',
      title: 'Opportunités',
      description: 'Projets d\'investissement',
      icon: Target,
      dataSource: 'opportunities',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'roi-analysis',
      type: 'chart',
      title: 'Analyse ROI',
      description: 'Retour sur investissement',
      icon: TrendingUp,
      dataSource: 'roi',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    },
    {
      id: 'risk-assessment',
      type: 'chart',
      title: 'Évaluation risques',
      description: 'Analyse des risques par projet',
      icon: Shield,
      dataSource: 'risk',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true
      }
    },
    {
      id: 'yield-realized-vs-expected',
      type: 'list',
      title: 'Rendement réalisé vs attendu',
      description: 'Revenu réellement encaissé face au revenu attendu, par actif — écart MAD et actifs sous-performants',
      icon: TrendingDown,
      dataSource: 'investments',
      features: {
        periodSelector: false,
        export: true,
        analytics: true,
        alerts: true
      }
    }
    // Widget 'opportunities' (metric « Analyse des opportunités ») retiré :
    // doublon de 'investment-opportunities' (même source 'opportunities'),
    // déjà couvert par la carte « Opportunités » de l'en-tête cockpit.
  ]
};

export default InvestisseurWidgets; 
