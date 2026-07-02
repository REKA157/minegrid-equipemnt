import React from 'react';
import { FileText, Globe, BarChart3, FileText as FileText2, FolderOpen, Timer } from 'lucide-react';

// Widgets pour le métier Transitaire / Freight Forwarder
export const TransitaireWidgets = {
  metier: 'Transitaire / Freight Forwarder',
  description: 'Gestion des opérations douanières et logistiques internationales',
  widgets: [
    {
      id: 'transaction-cases',
      type: 'list',
      title: 'Dossiers transaction (douane)',
      description: 'Dossiers engins où vous intervenez',
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
      id: 'customs-clearance',
      type: 'metric',
      title: 'Déclarations en cours',
      description: 'Nombre de déclarations douanières',
      icon: FileText,
      dataSource: 'customs',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'container-tracking',
      type: 'map',
      title: 'Suivi conteneurs',
      description: 'Statut & ETA des conteneurs (position si renseignée — pas de télématique temps réel)',
      icon: Globe,
      dataSource: 'containers',
      features: {
        periodSelector: true,
        export: true,
        analytics: false,
        alerts: false
      }
    },
    {
      id: 'demurrage-tracking',
      type: 'list',
      title: 'Surestaries / détention',
      description: 'Conteneurs au-delà de la franchise : jours de dépassement + coût cumulé',
      icon: Timer,
      dataSource: 'containers',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'import-export-stats',
      type: 'chart',
      title: 'Statistiques I/E',
      description: 'Volumes import/export',
      icon: BarChart3,
      dataSource: 'trade_stats',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    },
    {
      id: 'document-status',
      type: 'list',
      title: 'État des documents',
      description: 'Documents en attente de validation',
      icon: FileText2,
      dataSource: 'documents',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    }
  ]
};

export default TransitaireWidgets; 