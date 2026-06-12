import React from 'react';
import { DollarSign, Building2, TrendingUp, Calendar, MapPin, Wrench, Truck, Users, FileText, Bell, Target, BarChart3, Sparkles, Cpu } from 'lucide-react';

export const LoueurWidgets = {
  metier: 'Loueur',
  description: 'Location d\'équipements et matériels avec gestion complète',
  widgets: [
    {
      id: 'rental-revenue',
      type: 'metric',
      title: 'Revenus de location',
      description: 'Chiffre d\'affaires des locations du mois',
      icon: DollarSign,
      dataSource: 'rental-revenue',
      features: { periodSelector: true, export: true, analytics: true, alerts: false }
    },
    {
      id: 'equipment-availability',
      type: 'equipment',
      title: 'Disponibilité Équipements',
      description: 'État de disponibilité du parc machines',
      icon: Building2,
      dataSource: 'equipment-availability',
      features: { periodSelector: false, export: true, analytics: false, alerts: true }
    },
    {
      id: 'upcoming-rentals',
      type: 'calendar',
      title: 'Locations à venir',
      description: 'Planning des locations et réservations',
      icon: Calendar,
      dataSource: 'upcoming-rentals',
      features: { periodSelector: true, export: true, analytics: false, alerts: true }
    },
    {
      id: 'rental-pipeline',
      type: 'pipeline',
      title: 'Pipeline de location',
      description: 'Suivi des demandes de location par étape',
      icon: Users,
      dataSource: 'rental-pipeline',
      features: { periodSelector: true, export: true, analytics: true, alerts: true }
    },
    {
      id: 'daily-actions',
      type: 'daily-actions',
      title: 'Actions Prioritaires du Jour',
      description: 'Tâches corrélées : locations, maintenance, relances',
      icon: Target,
      dataSource: 'daily-actions',
      features: { periodSelector: false, export: false, analytics: false, alerts: true, aiGenerated: true, dynamicContent: true }
    },
    {
      id: 'ai-insights',
      type: 'ai-insights',
      title: 'Insights IA Location',
      description: 'Analyses prédictives et recommandations pour optimiser le parc',
      icon: Sparkles,
      dataSource: 'ai-insights',
      features: { periodSelector: true, export: true, analytics: true, alerts: true }
    },
    {
      id: 'ai-optimization',
      type: 'ai-optimization',
      title: 'Optimisation IA',
      description: 'Suggestions de tarifs, planning et marketing',
      icon: Cpu,
      dataSource: 'ai-optimization',
      features: { periodSelector: true, export: true, analytics: true, alerts: true }
    }
  ]
};

export default LoueurWidgets; 