import React from 'react';
import { Clock, Wrench, Package, Users, ClipboardCheck } from 'lucide-react';

// Widgets pour le métier Mécanicien / Atelier
export const MecanicienWidgets = {
  metier: 'Mécanicien / Atelier',
  description: 'Maintenance et réparation d\'équipements',
  widgets: [
    {
      id: 'tx-assigned-inspections',
      type: 'list',
      title: 'Inspections dossiers transaction',
      description: 'Contrôles engins qui vous sont assignés sur les dossiers',
      icon: ClipboardCheck,
      dataSource: 'inspection_requests',
      features: {
        periodSelector: false,
        export: false,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'interventions-today',
      type: 'chart',
      title: 'Interventions du jour',
      description: 'Nombre d\'interventions planifiées',
      icon: Clock,
      dataSource: 'interventions-today',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    },
    {
      id: 'repair-status',
      type: 'list',
      title: 'État des réparations',
      description: 'Équipements en réparation',
      icon: Wrench,
      dataSource: 'repair-status',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'parts-inventory',
      type: 'chart',
      title: 'Stock pièces détachées',
      description: 'Niveau de stock par catégorie',
      icon: Package,
      dataSource: 'parts-inventory',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: true
      }
    },
    {
      id: 'technician-workload',
      type: 'chart',
      title: 'Charge de travail',
      description: 'Répartition des tâches par technicien',
      icon: Users,
      dataSource: 'technician-workload',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    }
  ]
};

export default MecanicienWidgets; 