

export const widgetConfigs = {
  vendeur: [
    { id: 'daily-actions', type: 'daily-actions', title: 'Actions Commerciales Prioritaires', description: 'Liste des tâches urgentes du jour (appels, relances, devis) triées par impact/priorité', icon: 'AlertTriangle', enabled: true, dataSource: 'daily-actions', isCollapsed: false, position: 0 },
    { id: 'sales-metrics', type: 'performance', title: 'Score de Performance Commerciale', description: 'Votre performance globale avec recommandations IA', icon: 'Target', enabled: true, dataSource: 'performance-score', isCollapsed: false, position: 1 },
    { id: 'inventory-status', type: 'list', title: 'Plan d\'action stock & revente', description: 'Statut stock dormant, recommandations automatiques, actions rapides, et KPI', enabled: true, position: 2 },
    { id: 'sales-chart', type: 'chart', title: 'Évolution des ventes', description: 'Analyse des tendances, prévisions et export', icon: 'TrendingUp', enabled: true, dataSource: 'sales-evolution', isCollapsed: false, advanced: true, options: { periodSelector: true, metrics: ['CA', 'Ventes', 'Prévision'], export: true, analysis: true }, position: 3 },
    { id: 'leads-pipeline', type: 'list', title: 'Pipeline commercial', enabled: true, position: 4 }
  ],
  loueur: [
    { id: 'rental-revenue', type: 'metric', title: 'Revenus de location', enabled: true },
    { id: 'equipment-availability', type: 'equipment', title: 'Disponibilité Équipements', enabled: true },
    { id: 'equipment-usage', type: 'chart', title: 'Utilisation équipements', enabled: true },
    { id: 'upcoming-rentals', type: 'calendar', title: 'Locations à venir', enabled: true },
    { id: 'preventive-maintenance', type: 'maintenance', title: 'Maintenance préventive', enabled: true },
    { id: 'delivery-map', type: 'map', title: 'Carte des livraisons', enabled: true },
    { id: 'rental-pipeline', type: 'pipeline', title: 'Pipeline de location', enabled: true },
    { id: 'rental-contracts', type: 'list', title: 'Contrats de location', enabled: true },
    { id: 'delivery-schedule', type: 'calendar', title: 'Planning des livraisons', enabled: true },
    { id: 'rental-analytics', type: 'chart', title: 'Analytics de location', enabled: true },
    { id: 'daily-actions', type: 'daily-actions', title: 'Actions prioritaires du jour', enabled: true },
    { id: 'rental-notifications', type: 'notifications', title: 'Notifications de location', enabled: true }
  ],
  mecanicien: [
    { id: 'daily-interventions', type: 'metric', title: 'Interventions du jour', enabled: true },
    { id: 'repair-status', type: 'list', title: 'État des réparations', enabled: true },
    { id: 'spare-parts-stock', type: 'chart', title: 'Stock pièces détachées', enabled: true },
    { id: 'preventive-maintenance', type: 'maintenance', title: 'Maintenance préventive', enabled: true },
    { id: 'driver-schedule', type: 'calendar', title: 'Planning chauffeurs', enabled: true },
    { id: 'gps-tracking', type: 'list', title: 'Suivi GPS', enabled: true }
  ],
  transporteur: [
    { id: 'active-deliveries', type: 'metric', title: 'Livraisons actives', enabled: true },
    { id: 'gps-tracking', type: 'list', title: 'Suivi GPS', enabled: true },
    { id: 'transport-costs', type: 'chart', title: 'Coûts de transport', enabled: true },
    { id: 'driver-schedule', type: 'calendar', title: 'Planning chauffeurs', enabled: true },
    { id: 'delivery-map', type: 'map', title: 'Carte des livraisons', enabled: true },
    { id: 'preventive-maintenance', type: 'maintenance', title: 'Maintenance préventive', enabled: true }
  ],
  transitaire: [
    { id: 'custom-declarations', type: 'metric', title: 'Déclarations douanières', enabled: true },
    { id: 'documents', type: 'list', title: 'Documents', enabled: true },
    { id: 'import-export-stats', type: 'chart', title: 'Statistiques I/E', enabled: true },
    { id: 'container-tracking', type: 'map', title: 'Suivi conteneurs', enabled: true },
    { id: 'intervention-schedule', type: 'calendar', title: 'Planning interventions', enabled: true },
    { id: 'preventive-maintenance', type: 'maintenance', title: 'Maintenance préventive', enabled: true }
  ],
  logisticien: [
    { id: 'warehouse-occupancy', type: 'metric', title: 'Taux d\'occupation', enabled: true },
    { id: 'stock-alerts', type: 'list', title: 'Alertes stock', enabled: true },
    { id: 'supply-chain-kpis', type: 'chart', title: 'KPIs Supply Chain', enabled: true },
    { id: 'route-optimization', type: 'map', title: 'Optimisation routes', enabled: true },
    { id: 'intervention-schedule', type: 'calendar', title: 'Planning interventions', enabled: true },
    { id: 'preventive-maintenance', type: 'maintenance', title: 'Maintenance préventive', enabled: true }
  ],
  prestataire: [
    { id: 'active-projects', type: 'metric', title: 'Projets actifs', enabled: true },
    { id: 'service-revenue', type: 'chart', title: 'CA par service', enabled: true },
    { id: 'intervention-schedule', type: 'calendar', title: 'Planning interventions', enabled: true },
    { id: 'preventive-maintenance', type: 'maintenance', title: 'Maintenance préventive', enabled: true },
    { id: 'documents', type: 'list', title: 'Documents', enabled: true },
    { id: 'delivery-map', type: 'map', title: 'Carte des livraisons', enabled: true }
  ],
  investisseur: [
    { id: 'portfolio-value', type: 'metric', title: 'Valeur portefeuille', enabled: true },
    { id: 'roi-analysis', type: 'chart', title: 'Analyse ROI', enabled: true },
    { id: 'preventive-maintenance', type: 'maintenance', title: 'Maintenance préventive', enabled: true },
    { id: 'documents', type: 'list', title: 'Documents', enabled: true },
    { id: 'intervention-schedule', type: 'calendar', title: 'Planning interventions', enabled: true },
    { id: 'delivery-map', type: 'map', title: 'Carte des livraisons', enabled: true }
  ]
};
