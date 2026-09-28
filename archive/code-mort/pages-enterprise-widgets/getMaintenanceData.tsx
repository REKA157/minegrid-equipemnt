

export const getMaintenanceData = (widgetId: string) => {
  console.log('[DEBUG] getMaintenanceData appelée avec widgetId:', widgetId);

  // Simuler des données de maintenance pour le moment
  // Plus tard, cela appellera l'API réelle
  return [
    {
      id: '1',
      equipmentName: 'Pelle hydraulique CAT 320',
      description: 'Maintenance préventive - Vérification système hydraulique',
      scheduledDate: '2024-01-20',
      status: 'Programmé',
      priority: 'Moyenne',
      urgency: 'Normale',
      estimatedDuration: 4,
      technicianName: 'Mohammed Alami'
    },
    {
      id: '2',
      equipmentName: 'Chargeur frontal JCB',
      description: 'Remplacement filtres et vidange huile',
      scheduledDate: '2024-01-22',
      status: 'En attente',
      priority: 'Basse',
      urgency: 'Normale',
      estimatedDuration: 2,
      technicianName: 'Ahmed Benali'
    },
    {
      id: '3',
      equipmentName: 'Bulldozer D6',
      description: 'Révision complète moteur et transmission',
      scheduledDate: '2024-01-25',
      status: 'Programmé',
      priority: 'Haute',
      urgency: 'Urgente',
      estimatedDuration: 8,
      technicianName: 'Karim Mansouri'
    }
  ];
};
