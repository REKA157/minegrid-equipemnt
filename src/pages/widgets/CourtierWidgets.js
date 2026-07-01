import React from 'react';
import { DollarSign, Shield, FileText, Users, TrendingUp, Calendar, Target, Building2, FolderOpen, Landmark } from 'lucide-react';

// Widgets pour le métier Courtier en crédit et assurances
export const CourtierWidgets = {
  metier: 'Courtier',
  description: 'Courtage en crédit et assurances',
  widgets: [
    {
      id: 'transaction-cases',
      type: 'list',
      title: 'Dossiers transaction (accès courtier)',
      description: 'Dossiers engins où vous êtes partie prenante, via politiques Plateforme',
      icon: FolderOpen,
      dataSource: 'transaction_cases',
      features: {
        periodSelector: false,
        export: false,
        analytics: false,
        alerts: true
      }
    },
    // Widget PLANIFIÉ (non branché) — conservé pour sa valeur métier, masqué via exclusion du validId.
    // Cible : tables finance_applications / partner_submissions. Voir plannedEnterpriseWidgets.ts.
    {
      id: 'transaction-broker-financing',
      type: 'list',
      title: 'Financement dossiers',
      description: 'Demandes liées aux dossiers où vous êtes courtier',
      icon: DollarSign,
      dataSource: 'financing_requests',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'credit-applications',
      type: 'list',
      title: 'Demandes de crédit',
      description: 'Suivi des demandes de crédit en cours',
      icon: FileText,
      dataSource: 'credit_applications',
      features: {
        periodSelector: true,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'insurance-policies',
      type: 'list',
      title: 'Polices d\'assurance',
      description: 'Gestion des polices d\'assurance clients',
      icon: Shield,
      dataSource: 'insurance_policies',
      features: {
        periodSelector: true,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'commission-tracking',
      type: 'metric',
      title: 'Suivi des commissions',
      description: 'Commissions générées par produit',
      icon: DollarSign,
      dataSource: 'commissions',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    },
    {
      id: 'client-portfolio',
      type: 'list',
      title: 'Portefeuille clients',
      description: 'Base de données clients et prospects',
      icon: Users,
      dataSource: 'clients',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'performance-analytics',
      type: 'chart',
      title: 'Analytics de performance',
      description: 'Analyse des performances commerciales',
      icon: TrendingUp,
      dataSource: 'performance',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    },
    {
      id: 'bank-comparator',
      type: 'list',
      title: 'Comparateur multi-banques',
      description: 'Compare taux, mensualite et cout total du credit entre banques partenaires pour la derniere demande',
      icon: Landmark,
      dataSource: 'bank_offers',
      features: {
        periodSelector: false,
        export: true,
        analytics: true,
        alerts: false
      }
    }
  ]
};

export default CourtierWidgets; 