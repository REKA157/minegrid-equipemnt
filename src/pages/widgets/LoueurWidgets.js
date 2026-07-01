import React from 'react';
import { DollarSign, Building2, Calendar, Users, Receipt } from 'lucide-react';

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
      id: 'rental-overdue',
      type: 'list',
      title: 'Recouvrement / impayés',
      description: 'Loyers échus non payés : total MAD, ancienneté du retard (0-30j / 31-60j / 60j+) et clients débiteurs',
      icon: Receipt,
      dataSource: 'rental_invoices',
      features: { periodSelector: false, export: true, analytics: false, alerts: true }
    }
    // Widgets retirés (hors-sujet pour le loueur — c'étaient des composants VENDEUR
    // recyclés) : 'daily-actions' (Actions Commerciales), 'ai-insights' (reco CRM),
    // 'ai-optimization' (SEO/prix d'annonces). La vraie logique location (retours,
    // maintenance, taux d'occupation) alimente déjà l'en-tête Priorités/Risques/
    // Opportunités via buildLoueurCockpit.
  ]
};

export default LoueurWidgets; 