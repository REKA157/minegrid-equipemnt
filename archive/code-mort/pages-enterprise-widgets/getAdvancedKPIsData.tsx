

export const getAdvancedKPIsData = (widgetId: string) => {
  const kpis = {
    'operational-efficiency': {
      title: 'Efficacité Opérationnelle',
      metrics: [
        {
          name: 'Taux de disponibilité',
          value: 94.2,
          target: 95,
          unit: '%',
          trend: 'up',
          change: 2.1,
          status: 'good'
        },
        {
          name: 'Temps moyen de réparation',
          value: 3.2,
          target: 2.5,
          unit: 'jours',
          trend: 'down',
          change: -0.8,
          status: 'improving'
        },
        {
          name: 'Taux de rotation des stocks',
          value: 8.5,
          target: 10,
          unit: 'fois/an',
          trend: 'up',
          change: 0.3,
          status: 'warning'
        },
        {
          name: 'Coût par heure d\'utilisation',
          value: 125,
          target: 120,
          unit: 'MAD/h',
          trend: 'down',
          change: -5,
          status: 'good'
        }
      ]
    },
    'financial-performance': {
      title: 'Performance Financière',
      metrics: [
        {
          name: 'Marge brute',
          value: 32.5,
          target: 35,
          unit: '%',
          trend: 'up',
          change: 1.2,
          status: 'improving'
        },
        {
          name: 'ROI équipements',
          value: 18.7,
          target: 20,
          unit: '%',
          trend: 'up',
          change: 2.1,
          status: 'good'
        },
        {
          name: 'Coût de maintenance',
          value: 8.2,
          target: 7.5,
          unit: '% du CA',
          trend: 'down',
          change: -0.3,
          status: 'good'
        },
        {
          name: 'Délai de paiement client',
          value: 45,
          target: 30,
          unit: 'jours',
          trend: 'down',
          change: -5,
          status: 'improving'
        }
      ]
    },
    'customer-satisfaction': {
      title: 'Satisfaction Client',
      metrics: [
        {
          name: 'Score de satisfaction',
          value: 4.6,
          target: 4.5,
          unit: '/5',
          trend: 'up',
          change: 0.1,
          status: 'excellent'
        },
        {
          name: 'Taux de fidélisation',
          value: 87.3,
          target: 85,
          unit: '%',
          trend: 'up',
          change: 2.3,
          status: 'excellent'
        },
        {
          name: 'Temps de réponse',
          value: 2.1,
          target: 2,
          unit: 'heures',
          trend: 'down',
          change: -0.3,
          status: 'good'
        },
        {
          name: 'Taux de résolution',
          value: 94.8,
          target: 95,
          unit: '%',
          trend: 'up',
          change: 0.5,
          status: 'good'
        }
      ]
    }
  };

  return kpis[widgetId as keyof typeof kpis] || kpis['operational-efficiency'];
};
