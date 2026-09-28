

export const getNotificationsData = (widgetId: string) => {
  const notifications = [
    {
      id: '1',
      type: 'alert',
      title: 'Stock critique - Pelle CAT 320',
      message: 'Le stock de pièces pour la pelle CAT 320 est au niveau critique (2 unités restantes)',
      priority: 'high',
      category: 'inventory',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
      read: false,
      action: 'Commander maintenant',
      actionUrl: '/inventory/order'
    },
    {
      id: '2',
      type: 'warning',
      title: 'Maintenance préventive à venir',
      message: 'La maintenance préventive du chargeur JCB est prévue dans 3 jours',
      priority: 'medium',
      category: 'maintenance',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4h ago
      read: false,
      action: 'Voir planning',
      actionUrl: '/maintenance/schedule'
    },
    {
      id: '3',
      type: 'info',
      title: 'Nouvelle location confirmée',
      message: 'Location de la pelle hydraulique confirmée pour le projet autoroute Tanger-Casablanca',
      priority: 'low',
      category: 'rental',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6h ago
      read: true,
      action: 'Voir détails',
      actionUrl: '/rentals/details'
    },
    {
      id: '4',
      type: 'success',
      title: 'Réparation terminée',
      message: 'La réparation du bulldozer D6 a été terminée avec succès',
      priority: 'low',
      category: 'repair',
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8h ago
      read: true,
      action: 'Voir rapport',
      actionUrl: '/repairs/report'
    },
    {
      id: '5',
      type: 'alert',
      title: 'Livraison en retard',
      message: 'La livraison de pièces détachées est en retard de 2 jours',
      priority: 'high',
      category: 'logistics',
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12h ago
      read: false,
      action: 'Suivre livraison',
      actionUrl: '/logistics/tracking'
    }
  ];

  return notifications;
};
