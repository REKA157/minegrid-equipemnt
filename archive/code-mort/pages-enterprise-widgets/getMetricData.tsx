

export const getMetricData = (widgetId: string) => {
  // Données simulées pour les métriques
  const metricData = {
    'sales-metrics': { value: '2.4M MAD', change: '+12%', trend: 'up' },
    'monthly-sales': { value: '2.4M MAD', change: '+12%', trend: 'up' },
    'rental-revenue': { value: '850K MAD', change: '+8%', trend: 'up' },
    'daily-interventions': { value: '15', change: '+3', trend: 'up' },
    'active-deliveries': { value: '8', change: '-2', trend: 'down' },
    'custom-declarations': { value: '24', change: '+5', trend: 'up' },
    'warehouse-occupancy': { value: '78%', change: '+3%', trend: 'up' },
    'active-projects': { value: '12', change: '+2', trend: 'up' },
    'portfolio-value': { value: '15.2M MAD', change: '+18%', trend: 'up' }
  };
  return metricData[widgetId as keyof typeof metricData] || { value: '0', change: '0%', trend: 'neutral' };
};
