import React from 'react';
import { DollarSign, TrendingUp, Package, Target, Users, AlertTriangle, BarChart3, FolderOpen } from 'lucide-react';

// Interfaces TypeScript pour les widgets vendeur
interface WidgetFeature {
  periodSelector: boolean;
  export: boolean;
  analytics: boolean;
  alerts: boolean;
  aiRecommendations?: boolean;
  benchmarking?: boolean;
  sectorComparison?: boolean;
  autoNotifications?: boolean;
  quickActions?: boolean;
  stockAnalytics?: boolean;
  recommendations?: boolean;
  autoReminders?: boolean;
  probabilityScoring?: boolean;
  smartActions?: boolean;
  aiGenerated?: boolean;
  dynamicContent?: boolean;
  stickyDisplay?: boolean;
  forecasting?: boolean;
  trendAnalysis?: boolean;
}

interface Widget {
  id: string;
  type: string;
  title: string;
  description: string;
  icon: any;
  dataSource: string;
  features: WidgetFeature;
  priority?: number;
  category?: string;
}

interface VendeurWidgetsConfig {
  metier: string;
  description: string;
  widgets: Widget[];
}

// Widgets pour le métier Vendeur avec toutes les améliorations demandées
export const VendeurWidgets: VendeurWidgetsConfig = {
  metier: 'Vendeur',
  description: 'Vente d\'équipements et matériels avec IA et recommandations avancées',
  widgets: [
    {
      id: 'sales-performance-score',
      type: 'performance',
      title: 'Score de Performance Commerciale',
      description: 'Score global sur 100, comparaison avec objectif, rang anonymisé, recommandations IA',
      icon: Target,
      dataSource: 'sales-performance-score',
      priority: 1,
      category: 'performance',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true,
        aiRecommendations: true,
        benchmarking: true,
      }
    },
    {
      id: 'sales-evolution',
      type: 'chart',
      title: 'Évolution des ventes enrichie',
      description: 'Courbe avec benchmarking secteur, notifications automatiques, actions rapides',
      icon: TrendingUp,
      dataSource: 'sales-evolution',
      priority: 2,
      category: 'analytics',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true,
        sectorComparison: true,
        autoNotifications: true,
        quickActions: true,
      }
    },
    {
      id: 'stock-status',
      type: 'list',
      title: 'Plan d\'action stock & revente',
      description: 'Statut stock dormant, recommandations automatiques, actions rapides',
      icon: Package,
      dataSource: 'stock-status',
      priority: 3,
      category: 'inventory',
      features: {
        periodSelector: false,
        export: true,
        analytics: true,
        alerts: true,
        stockAnalytics: true,
        recommendations: true,
        quickActions: true,
      }
    },
    {
      id: 'transaction-cases',
      type: 'list',
      title: 'Dossiers transaction',
      description: 'Vue unifiée des dossiers engins (demandes, financement, livraison…) selon vos droits',
      icon: FolderOpen,
      priority: 4,
      category: 'transaction',
      dataSource: 'transaction_cases',
      features: {
        periodSelector: false,
        export: false,
        analytics: false,
        alerts: true,
      }
    },
    {
      id: 'sales-pipeline',
      type: 'list',
      title: 'Pipeline commercial',
      description: 'Alertes de relance, score de probabilité, actions intelligentes',
      icon: Users,
      dataSource: 'sales-pipeline',
      priority: 4,
      category: 'prospection',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true,
        autoReminders: true,
        probabilityScoring: true,
        smartActions: true,
      }
    },
    {
      id: 'daily-actions',
      type: 'daily-actions',
      title: 'Actions Commerciales Prioritaires',
      description: 'Liste des tâches urgentes du jour triées par impact/priorité',
      icon: AlertTriangle,
      dataSource: 'daily-actions',
      priority: 5,
      category: 'actions',
      features: {
        periodSelector: false,
        export: false,
        analytics: false,
        alerts: true,
        aiGenerated: true,
        dynamicContent: true,
        stickyDisplay: true,
      }
    },
    {
      id: 'ai-insights',
      type: 'ai-insights',
      title: 'Insights IA',
      description: 'Analyses prédictives, recommandations intelligentes et insights automatiques',
      icon: BarChart3,
      dataSource: 'ai-insights',
      priority: 6,
      category: 'ai',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true,
        aiGenerated: true,
        dynamicContent: true,
        forecasting: true,
        trendAnalysis: true,
      }
    },
    {
      id: 'ai-optimization',
      type: 'ai-optimization',
      title: 'Optimisation IA',
      description: 'Suggestions d\'optimisation pour les prix, le SEO et le marketing',
      icon: TrendingUp,
      dataSource: 'ai-optimization',
      priority: 7,
      category: 'ai',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true,
        aiGenerated: true,
        dynamicContent: true,
        recommendations: true,
        autoNotifications: true,
      }
    }
  ]
}; 