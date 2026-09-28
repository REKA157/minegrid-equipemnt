

export const getCalendarData = (widgetId: string) => {
  // Données simulées pour les calendriers
  const calendarData = {
    'upcoming-rentals': [
      { id: '1', title: 'Location pelle CAT', date: '2024-01-20', status: 'Confirmé' },
      { id: '2', title: 'Location chargeur', date: '2024-01-22', status: 'En attente' },
      { id: '3', title: 'Location bulldozer', date: '2024-01-25', status: 'Confirmé' }
    ],
    'driver-schedule': [
      { id: '1', title: 'Mohammed - Livraison Casablanca', date: '2024-01-20', status: 'Programmé' },
      { id: '2', title: 'Ahmed - Transport Rabat', date: '2024-01-21', status: 'En attente' }
    ],
    'intervention-schedule': [
      { id: '1', title: 'Maintenance préventive', date: '2024-01-20', status: 'Programmé' },
      { id: '2', title: 'Réparation moteur', date: '2024-01-22', status: 'En attente' }
    ]
  };
  return calendarData[widgetId as keyof typeof calendarData] || [];
};
