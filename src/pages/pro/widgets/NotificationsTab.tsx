import React, { useState } from 'react';
import { ClientNotification, markNotificationAsRead } from '../../../utils/proApi';
import { usePermissions } from '../../../utils/permissions';
import { toast } from '../../../utils/toast';
export function NotificationsTab({ notifications }: { notifications: ClientNotification[] }) {
  const [loading, setLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<ClientNotification | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Vérifier les permissions
  const { permissions } = usePermissions();

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      setLoading(true);
      const success = await markNotificationAsRead(notificationId);
      if (success) {
        // Recharger les données du dashboard pour mettre à jour les notifications
        window.location.reload();
      }
    } catch (error) {
      console.error('Erreur lors du marquage comme lu:', error);
      toast('Erreur lors du marquage de la notification');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setLoading(true);
      const unreadNotifications = notifications.filter(n => !n.is_read);
      
      // Marquer toutes les notifications non lues comme lues
      const promises = unreadNotifications.map(n => markNotificationAsRead(n.id));
      await Promise.all(promises);
      
      // Recharger les données du dashboard
      window.location.reload();
    } catch (error) {
      console.error('Erreur lors du marquage de toutes les notifications:', error);
      toast('Erreur lors du marquage des notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (notification: ClientNotification) => {
    setSelectedNotification(notification);
    setShowDetailsModal(true);
  };

  const handleNavigateToEntity = (notification: ClientNotification) => {
    if (!notification.related_entity_type || !notification.related_entity_id) {
      toast('Aucune entité liée à cette notification');
      return;
    }

    // Marquer comme lu avant la navigation
    handleMarkAsRead(notification.id);

    // Naviguer vers l'entité liée
    switch (notification.related_entity_type) {
      case 'equipment': {
        // Aller vers l'onglet équipements
        const equipmentTab = document.querySelector('[data-tab="equipment"]') as HTMLElement;
        if (equipmentTab) {
          equipmentTab.click();
        }
        break;
      }
      case 'order': {
        // Aller vers l'onglet commandes
        const ordersTab = document.querySelector('[data-tab="orders"]') as HTMLElement;
        if (ordersTab) {
          ordersTab.click();
        }
        break;
      }
      case 'maintenance': {
        // Aller vers l'onglet maintenance
        const maintenanceTab = document.querySelector('[data-tab="maintenance"]') as HTMLElement;
        if (maintenanceTab) {
          maintenanceTab.click();
        }
        break;
      }
      default:
        toast('Type d\'entité non reconnu');
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return '🔴';
      case 'high':
        return '🟡';
      case 'normal':
        return '🔵';
      case 'low':
        return '⚪';
      default:
        return '🔵';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'maintenance_due':
        return '🔧';
      case 'order_update':
        return '📦';
      case 'diagnostic_alert':
        return '⚠️';
      case 'warranty_expiry':
        return '🛡️';
      default:
        return '📢';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
          {unreadCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button 
            onClick={handleMarkAllAsRead}
            disabled={loading}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Marquage...</span>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>Marquer tout comme lu</span>
              </>
            )}
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🔔</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune notification</h3>
          <p className="text-gray-500">Vous n'avez aucune notification pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <div key={notification.id} className={`bg-white rounded-lg shadow p-4 border-l-4 ${
              notification.priority === 'urgent' ? 'border-red-500' :
              notification.priority === 'high' ? 'border-yellow-500' :
              notification.priority === 'normal' ? 'border-blue-500' :
              'border-gray-300'
            } hover:shadow-md transition-shadow`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-lg">{getTypeIcon(notification.type)}</span>
                    <span className="text-sm">{getPriorityIcon(notification.priority)}</span>
                    <h3 className="text-sm font-medium text-gray-900">
                      {notification.title}
                    </h3>
                    {!notification.is_read && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        Nouveau
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {notification.message}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(notification.created_at).toLocaleString('fr-FR')}
                  </p>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  {!notification.is_read && (
                    <button
                      onClick={() => handleMarkAsRead(notification.id)}
                      disabled={loading}
                      className="p-2 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
                      title="Marquer comme lu"
                    >
                      <span className="text-sm">✓</span>
                    </button>
                  )}
                  {notification.related_entity_type && (
                    <button
                      onClick={() => handleNavigateToEntity(notification)}
                      disabled={loading}
                      className="p-2 text-gray-400 hover:text-orange-600 transition-colors disabled:opacity-50"
                      title="Voir les détails"
                    >
                      <span className="text-sm">👁️</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleViewDetails(notification)}
                    disabled={loading}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                    title="Voir les détails"
                  >
                    <span className="text-sm">ℹ️</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de détails */}
      {showDetailsModal && selectedNotification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Détails de la notification</h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <p className="text-sm text-gray-900 mt-1">
                  {getTypeIcon(selectedNotification.type)} {selectedNotification.type.replace('_', ' ')}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Priorité</label>
                <p className="text-sm text-gray-900 mt-1">
                  {getPriorityIcon(selectedNotification.priority)} {selectedNotification.priority}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Titre</label>
                <p className="text-sm text-gray-900 mt-1">{selectedNotification.title}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Message</label>
                <p className="text-sm text-gray-900 mt-1">{selectedNotification.message}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Date de création</label>
                <p className="text-sm text-gray-900 mt-1">
                  {new Date(selectedNotification.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
              
              {selectedNotification.related_entity_type && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Entité liée</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {selectedNotification.related_entity_type} - {selectedNotification.related_entity_id}
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Statut</label>
                <p className="text-sm text-gray-900 mt-1">
                  {selectedNotification.is_read ? '✅ Lu' : '🆕 Non lu'}
                </p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Fermer
              </button>
              {selectedNotification.related_entity_type && (
                <button
                  onClick={() => {
                    handleNavigateToEntity(selectedNotification);
                    setShowDetailsModal(false);
                  }}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Voir l'entité
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
