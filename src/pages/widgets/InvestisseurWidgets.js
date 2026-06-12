import React from 'react';
import { DollarSign, Target, TrendingUp, Shield, Star, FolderOpen } from 'lucide-react';

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
      id: 'opportunities',
      type: 'metric',
      title: 'Analyse des opportunités',
      description: 'Analyse des opportunités d\'investissement',
      icon: Star,
      dataSource: 'opportunities',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    }
  ]
};

export default InvestisseurWidgets; 