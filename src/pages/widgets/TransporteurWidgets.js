import React from 'react';
import { Truck, Globe, DollarSign, Calendar, MapPinned, TrendingDown } from 'lucide-react';

// Widgets pour le métier Transporteur / Logistique
export const TransporteurWidgets = {
  metier: 'Transporteur / Logistique',
  description: 'Transport et livraison d\'équipements',
  widgets: [
    // Widget PLANIFIÉ (non branché) — conservé pour sa valeur métier, masqué via exclusion du validId.
    // Cible : tables logistics_requests / transport_quotes / shipments. Voir plannedEnterpriseWidgets.ts.
    {
      id: 'tx-assigned-transports',
      type: 'list',
      title: 'Transports dossiers (assignés)',
      description: 'Enlèvements / livraisons rattachés à vos dossiers transaction',
      icon: MapPinned,
      dataSource: 'transport_requests',
      features: {
        periodSelector: false,
        export: false,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'active-deliveries',
      type: 'metric',
      title: 'Livraisons en cours',
      description: 'Nombre de livraisons actives',
      icon: Truck,
      dataSource: 'active_deliveries',
      features: {
        periodSelector: false,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'delivery-map',
      type: 'map',
      title: 'Suivi des livraisons',
      description: 'Statut & ETA des livraisons (position si renseignée — pas de télématique temps réel)',
      icon: Globe,
      dataSource: 'gps_tracking',
      features: {
        periodSelector: true,
        export: true,
        analytics: false,
        alerts: false
      }
    },
    {
      id: 'transport-costs',
      type: 'chart',
      title: 'Coûts de transport',
      description: 'Analyse des coûts par trajet',
      icon: DollarSign,
      dataSource: 'transport_costs',
      features: {
        periodSelector: true,
        export: true,
        analytics: true,
        alerts: false
      }
    },
    {
      id: 'driver-schedule',
      type: 'calendar',
      title: 'Planning chauffeurs',
      description: 'Planning des équipes',
      icon: Calendar,
      dataSource: 'driver_schedule',
      features: {
        periodSelector: true,
        export: true,
        analytics: false,
        alerts: true
      }
    },
    {
      id: 'deadhead-cost',
      type: 'list',
      title: 'Km à vide / coût du retour à vide',
      description: 'Par trajet : km en charge vs à vide, taux de retour à vide (%) et coût du vide (MAD)',
      icon: TrendingDown,
      dataSource: 'deliveries',
      features: {
        periodSelector: false,
        export: true,
        analytics: true,
        alerts: true
      }
    }
  ]
};

export default TransporteurWidgets; 