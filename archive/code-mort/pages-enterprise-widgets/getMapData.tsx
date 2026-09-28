

export const getMapData = (widgetId: string) => {
  // Données simulées pour les cartes
  const mapData = {
    'delivery-map': [
      { id: '1', title: 'Camion 001', lat: 33.5731, lng: -7.5898, status: 'En transit' },
      { id: '2', title: 'Camion 002', lat: 34.0209, lng: -6.8416, status: 'Livraison' }
    ],
    'container-tracking': [
      { id: '1', title: 'Conteneur A', lat: 33.5731, lng: -7.5898, status: 'En transit' },
      { id: '2', title: 'Conteneur B', lat: 34.0209, lng: -6.8416, status: 'En douane' }
    ],
    'route-optimization': [
      { id: '1', title: 'Route optimisée', coordinates: [[33.5731, -7.5898], [34.0209, -6.8416]], status: 'Active' }
    ]
  };
  return mapData[widgetId as keyof typeof mapData] || [];
};
