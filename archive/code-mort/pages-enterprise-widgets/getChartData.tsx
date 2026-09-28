

export const getChartData = (widgetId: string) => {
  // Données simulées pour les graphiques
  const chartData = {
    'sales-evolution': [
      {
        month: 'Jan 2024',
        sales: 1200000,
        target: 1100000,
        sector_average: 1150000,
        growth_rate: 9.1,
        target_achievement: 109.1,
        sector_comparison: 104.3,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Janvier 2024: +9.1% vs objectif, +4.3% vs secteur',
            timestamp: '2024-01-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Performance excellente - Maintenir la stratégie de prix premium',
          'Penser à augmenter les stocks pour février'
        ]
      },
      {
        month: 'Fév 2024',
        sales: 1350000,
        target: 1200000,
        sector_average: 1250000,
        growth_rate: 12.5,
        target_achievement: 112.5,
        sector_comparison: 108.0,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Février 2024: +12.5% vs objectif, +8.0% vs secteur',
            timestamp: '2024-02-29T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Croissance exceptionnelle - Étendre la gamme de produits',
          'Formation équipe commerciale pour capitaliser'
        ]
      },
      {
        month: 'Mar 2024',
        sales: 1420000,
        target: 1300000,
        sector_average: 1350000,
        growth_rate: 5.2,
        target_achievement: 109.2,
        sector_comparison: 105.2,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Mars 2024: +5.2% vs objectif, +5.2% vs secteur',
            timestamp: '2024-03-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Performance stable - Optimiser les coûts opérationnels',
          'Préparer la saison estivale'
        ]
      },
      {
        month: 'Avr 2024',
        sales: 1580000,
        target: 1400000,
        sector_average: 1450000,
        growth_rate: 11.3,
        target_achievement: 112.9,
        sector_comparison: 109.0,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Avril 2024: +11.3% vs objectif, +9.0% vs secteur',
            timestamp: '2024-04-30T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Excellente performance - Maintenir l\'élan',
          'Investir dans le marketing digital'
        ]
      },
      {
        month: 'Mai 2024',
        sales: 1650000,
        target: 1500000,
        sector_average: 1550000,
        growth_rate: 4.4,
        target_achievement: 110.0,
        sector_comparison: 106.5,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Mai 2024: +4.4% vs objectif, +6.5% vs secteur',
            timestamp: '2024-05-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Performance solide - Préparer la saison haute',
          'Renforcer l\'équipe technique'
        ]
      },
      {
        month: 'Juin 2024',
        sales: 1720000,
        target: 1600000,
        sector_average: 1650000,
        growth_rate: 4.2,
        target_achievement: 107.5,
        sector_comparison: 104.2,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Juin 2024: +4.2% vs objectif, +4.2% vs secteur',
            timestamp: '2024-06-30T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Performance stable - Maintenir la qualité',
          'Planifier les maintenances estivales'
        ]
      },
      {
        month: 'Juil 2024',
        sales: 1680000,
        target: 1700000,
        sector_average: 1750000,
        growth_rate: -2.3,
        target_achievement: 98.8,
        sector_comparison: 96.0,
        trend: 'down',
        notifications: [
          {
            type: 'warning',
            message: 'Juillet 2024: -2.3% vs objectif, -4.0% vs secteur',
            timestamp: '2024-07-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Juillet 2024 en baisse de 2.3% vs objectif, suggérer promotions estivales',
          'Repositionner les machines 320D à 860k MAD'
        ]
      },
      {
        month: 'Août 2024',
        sales: 1750000,
        target: 1800000,
        sector_average: 1850000,
        growth_rate: 4.2,
        target_achievement: 97.2,
        sector_comparison: 94.6,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Août 2024: +4.2% vs objectif mais -2.8% vs secteur',
            timestamp: '2024-08-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Amélioration en août - Maintenir les promotions',
          'Préparer la rentrée avec de nouveaux produits'
        ]
      },
      {
        month: 'Sep 2024',
        sales: 1820000,
        target: 1900000,
        sector_average: 1950000,
        growth_rate: 4.0,
        target_achievement: 95.8,
        sector_comparison: 93.3,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Septembre 2024: +4.0% vs objectif mais -3.3% vs secteur',
            timestamp: '2024-09-30T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Croissance positive mais sous objectif - Renforcer l\'équipe',
          'Lancer une campagne de fidélisation'
        ]
      },
      {
        month: 'Oct 2024',
        sales: 1880000,
        target: 2000000,
        sector_average: 2050000,
        growth_rate: 3.3,
        target_achievement: 94.0,
        sector_comparison: 91.7,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Octobre 2024: +3.3% vs objectif mais -4.0% vs secteur',
            timestamp: '2024-10-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Performance sous objectif - Analyser la concurrence',
          'Proposer des financements attractifs'
        ]
      },
      {
        month: 'Nov 2024',
        sales: 1950000,
        target: 2100000,
        sector_average: 2150000,
        growth_rate: 3.7,
        target_achievement: 92.9,
        sector_comparison: 90.7,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Novembre 2024: +3.7% vs objectif mais -4.3% vs secteur',
            timestamp: '2024-11-30T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Croissance continue mais sous objectif - Optimiser les prix',
          'Renforcer le service après-vente'
        ]
      },
      {
        month: 'Déc 2024',
        sales: 2100000,
        target: 2200000,
        sector_average: 2250000,
        growth_rate: 7.7,
        target_achievement: 95.5,
        sector_comparison: 93.3,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Décembre 2024: +7.7% vs objectif mais -4.5% vs secteur',
            timestamp: '2024-12-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Fin d\'année positive - Préparer 2025',
          'Planifier les investissements 2025'
        ]
      }
    ],
    'sales-chart': [
      {
        month: 'Jan 2024',
        sales: 1200000,
        target: 1100000,
        sector_average: 1150000,
        growth_rate: 9.1,
        target_achievement: 109.1,
        sector_comparison: 104.3,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Janvier 2024: +9.1% vs objectif, +4.3% vs secteur',
            timestamp: '2024-01-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Performance excellente - Maintenir la stratégie de prix premium',
          'Penser à augmenter les stocks pour février'
        ]
      },
      {
        month: 'Fév 2024',
        sales: 1350000,
        target: 1200000,
        sector_average: 1250000,
        growth_rate: 12.5,
        target_achievement: 112.5,
        sector_comparison: 108.0,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Février 2024: +12.5% vs objectif, +8.0% vs secteur',
            timestamp: '2024-02-29T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Croissance exceptionnelle - Étendre la gamme de produits',
          'Formation équipe commerciale pour capitaliser'
        ]
      },
      {
        month: 'Mar 2024',
        sales: 1420000,
        target: 1300000,
        sector_average: 1350000,
        growth_rate: 5.2,
        target_achievement: 109.2,
        sector_comparison: 105.2,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Mars 2024: +5.2% vs objectif, +5.2% vs secteur',
            timestamp: '2024-03-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Performance stable - Optimiser les coûts opérationnels',
          'Préparer la saison estivale'
        ]
      },
      {
        month: 'Avr 2024',
        sales: 1580000,
        target: 1400000,
        sector_average: 1450000,
        growth_rate: 11.3,
        target_achievement: 112.9,
        sector_comparison: 109.0,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Avril 2024: +11.3% vs objectif, +9.0% vs secteur',
            timestamp: '2024-04-30T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Excellente performance - Maintenir l\'élan',
          'Investir dans le marketing digital'
        ]
      },
      {
        month: 'Mai 2024',
        sales: 1650000,
        target: 1500000,
        sector_average: 1550000,
        growth_rate: 4.4,
        target_achievement: 110.0,
        sector_comparison: 106.5,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Mai 2024: +4.4% vs objectif, +6.5% vs secteur',
            timestamp: '2024-05-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Performance solide - Préparer la saison haute',
          'Renforcer l\'équipe technique'
        ]
      },
      {
        month: 'Juin 2024',
        sales: 1720000,
        target: 1600000,
        sector_average: 1650000,
        growth_rate: 4.2,
        target_achievement: 107.5,
        sector_comparison: 104.2,
        trend: 'up',
        notifications: [
          {
            type: 'success',
            message: 'Juin 2024: +4.2% vs objectif, +4.2% vs secteur',
            timestamp: '2024-06-30T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Performance stable - Maintenir la qualité',
          'Planifier les maintenances estivales'
        ]
      },
      {
        month: 'Juil 2024',
        sales: 1680000,
        target: 1700000,
        sector_average: 1750000,
        growth_rate: -2.3,
        target_achievement: 98.8,
        sector_comparison: 96.0,
        trend: 'down',
        notifications: [
          {
            type: 'warning',
            message: 'Juillet 2024: -2.3% vs objectif, -4.0% vs secteur',
            timestamp: '2024-07-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Juillet 2024 en baisse de 2.3% vs objectif, suggérer promotions estivales',
          'Repositionner les machines 320D à 860k MAD'
        ]
      },
      {
        month: 'Août 2024',
        sales: 1750000,
        target: 1800000,
        sector_average: 1850000,
        growth_rate: 4.2,
        target_achievement: 97.2,
        sector_comparison: 94.6,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Août 2024: +4.2% vs objectif mais -2.8% vs secteur',
            timestamp: '2024-08-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Amélioration en août - Maintenir les promotions',
          'Préparer la rentrée avec de nouveaux produits'
        ]
      },
      {
        month: 'Sep 2024',
        sales: 1820000,
        target: 1900000,
        sector_average: 1950000,
        growth_rate: 4.0,
        target_achievement: 95.8,
        sector_comparison: 93.3,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Septembre 2024: +4.0% vs objectif mais -3.3% vs secteur',
            timestamp: '2024-09-30T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Croissance positive mais sous objectif - Renforcer l\'équipe',
          'Lancer une campagne de fidélisation'
        ]
      },
      {
        month: 'Oct 2024',
        sales: 1880000,
        target: 2000000,
        sector_average: 2050000,
        growth_rate: 3.3,
        target_achievement: 94.0,
        sector_comparison: 91.7,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Octobre 2024: +3.3% vs objectif mais -3.0% vs secteur',
            timestamp: '2024-10-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Octobre 2024 en baisse de 6% vs objectif, suggérer promotions automnales',
          'Publier des annonces pour machines compactes'
        ]
      },
      {
        month: 'Nov 2024',
        sales: 1950000,
        target: 2100000,
        sector_average: 2150000,
        growth_rate: 3.7,
        target_achievement: 92.9,
        sector_comparison: 90.7,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Novembre 2024: +3.7% vs objectif mais -4.3% vs secteur',
            timestamp: '2024-11-30T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Novembre 2024 en baisse de 7.1% vs objectif, suggérer promotions de fin d\'année',
          'Ajouter de nouveaux équipements à la gamme'
        ]
      },
      {
        month: 'Déc 2024',
        sales: 2100000,
        target: 2200000,
        sector_average: 2250000,
        growth_rate: 7.7,
        target_achievement: 95.5,
        sector_comparison: 93.3,
        trend: 'up',
        notifications: [
          {
            type: 'warning',
            message: 'Décembre 2024: +7.7% vs objectif mais -4.5% vs secteur',
            timestamp: '2024-12-31T18:00:00Z'
          }
        ],
        ai_suggestions: [
          'Décembre 2024 en baisse de 4.5% vs objectif, suggérer promotions de fin d\'année',
          'Planifier les objectifs 2025 avec l\'équipe'
        ]
      }
    ],
    'equipment-usage': [
      { equipment: 'Pelle CAT', usage: 85 },
      { equipment: 'Chargeur JCB', usage: 72 },
      { equipment: 'Bulldozer', usage: 68 },
      { equipment: 'Excavatrice', usage: 91 }
    ],
    'spare-parts-stock': [
      {
        category: 'Moteur',
        stock: 75,
        min: 50,
        max: 100,
        unit_price: 2500,
        supplier: 'CAT Maroc',
        last_order: '2024-01-10',
        next_delivery: '2024-01-25',
        delivery_days: 15,
        needs_restock: false,
        critical_level: 30,
        average_usage: 5,
        estimated_duration: 120,
        color_indicator: 'green',
        notes: 'Stock optimal - Couverture 15 jours'
      },
      {
        category: 'Hydraulique',
        stock: 60,
        min: 40,
        max: 80,
        unit_price: 1800,
        supplier: 'Parker Hannifin',
        last_order: '2024-01-05',
        next_delivery: '2024-01-30',
        delivery_days: 25,
        needs_restock: false,
        critical_level: 25,
        average_usage: 3,
        estimated_duration: 90,
        color_indicator: 'yellow',
        notes: 'Attention - Livraison dans 25 jours'
      },
      {
        category: 'Électricité',
        stock: 85,
        min: 60,
        max: 120,
        unit_price: 3200,
        supplier: 'Schneider Electric',
        last_order: '2024-01-12',
        next_delivery: '2024-01-28',
        delivery_days: 16,
        needs_restock: false,
        critical_level: 35,
        average_usage: 4,
        estimated_duration: 150,
        color_indicator: 'green',
        notes: 'Stock élevé - Bonne couverture'
      },
      {
        category: 'Filtres',
        stock: 45,
        min: 30,
        max: 60,
        unit_price: 450,
        supplier: 'Donaldson',
        last_order: '2024-01-08',
        next_delivery: '2024-01-22',
        delivery_days: 14,
        needs_restock: false,
        critical_level: 20,
        average_usage: 8,
        estimated_duration: 60,
        color_indicator: 'orange',
        notes: 'Consommation élevée - Surveiller'
      },
      {
        category: 'Transmission',
        stock: 25,
        min: 35,
        max: 70,
        unit_price: 4200,
        supplier: 'ZF Maroc',
        last_order: '2024-01-15',
        next_delivery: '2024-02-05',
        delivery_days: 21,
        needs_restock: true,
        critical_level: 30,
        average_usage: 2,
        estimated_duration: 180,
        color_indicator: 'red',
        notes: 'URGENT - Stock critique, commande en cours'
      },
      {
        category: 'Freins',
        stock: 35,
        min: 25,
        max: 50,
        unit_price: 2800,
        supplier: 'Brembo',
        last_order: '2024-01-03',
        next_delivery: '2024-01-20',
        delivery_days: 17,
        needs_restock: false,
        critical_level: 20,
        average_usage: 3,
        estimated_duration: 100,
        color_indicator: 'yellow',
        notes: 'Stock moyen - Surveiller consommation'
      }
    ],
    'transport-costs': [
      { route: 'Casablanca-Rabat', cost: 2500 },
      { route: 'Rabat-Fès', cost: 3200 },
      { route: 'Fès-Marrakech', cost: 4100 },
      { route: 'Marrakech-Agadir', cost: 3800 }
    ],
    'import-export-stats': [
      { type: 'Import', volume: 1200 },
      { type: 'Export', volume: 850 },
      { type: 'Transit', volume: 650 }
    ],
    'supply-chain-kpis': [
      { kpi: 'Délai livraison', value: 85 },
      { kpi: 'Taux service', value: 92 },
      { kpi: 'Rotation stock', value: 78 },
      { kpi: 'Coût logistique', value: 68 }
    ],
    'service-revenue': [
      { service: 'Maintenance', revenue: 450000 },
      { service: 'Transport', revenue: 320000 },
      { service: 'Location', revenue: 280000 },
      { service: 'Consulting', revenue: 180000 }
    ],
    'roi-analysis': [
      { project: 'Projet A', roi: 15.2 },
      { project: 'Projet B', roi: 12.8 },
      { project: 'Projet C', roi: 18.5 },
      { project: 'Projet D', roi: 9.7 }
    ]
  };
  return chartData[widgetId as keyof typeof chartData] || [];
};
