import React, { useState } from 'react';
import { Clock, AlertTriangle, CheckCircle, XCircle, X } from 'lucide-react';
import { Widget, ListItem } from '../../../constants/dashboardTypes';
import { getStatusColor, formatDate, truncateText } from '../../../utils/dashboardUtils';

interface ListWidgetProps {
  widget: Widget;
  data: ListItem[];
  widgetSize?: 'small' | 'medium' | 'large';
  onAction?: (action: string, item: ListItem) => void;
}

const ListWidget: React.FC<ListWidgetProps> = ({ widget, data, widgetSize = 'medium', onAction }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showAll, setShowAll] = useState(false);

  // Fonction pour obtenir la taille adaptative
  const getAdaptiveSize = (type: 'text' | 'spacing' | 'grid') => {
    switch (widgetSize) {
      case 'small':
        return type === 'text' ? 'text-xs' : type === 'spacing' ? 'p-2' : 'grid-cols-1';
      case 'large':
        return type === 'text' ? 'text-lg' : type === 'spacing' ? 'p-6' : 'grid-cols-3';
      default:
        return type === 'text' ? 'text-sm' : type === 'spacing' ? 'p-4' : 'grid-cols-2';
    }
  };

  // Fonction pour obtenir l'icône de statut
  const getStatusIcon = (status?: string) => {
    switch ((status ?? '').toLowerCase()) {
      case 'terminé':
      case 'complété':
      case 'livré':
      case 'payé':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'en cours':
      case 'en attente':
      case 'en transit':
        return <Clock className="h-4 w-4 text-orange-600" />;
      case 'annulé':
      case 'refusé':
      case 'en retard':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'alerte':
      case 'urgent':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  // Fonction pour obtenir l'icône de priorité
  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <div className="w-2 h-2 bg-red-500 rounded-full" />;
      case 'medium':
        return <div className="w-2 h-2 bg-orange-500 rounded-full" />;
      case 'low':
        return <div className="w-2 h-2 bg-green-500 rounded-full" />;
      default:
        return <div className="w-2 h-2 bg-gray-500 rounded-full" />;
    }
  };

  // Fonction pour filtrer les données
  const getFilteredData = () => {
    if (!data || !Array.isArray(data)) {
      return [];
    }
    
    if (filter === 'all') return data;
    return data.filter(item => item.priority === filter);
  };

  // Fonction pour obtenir les statistiques
  const getStats = () => {
    if (!data || !Array.isArray(data)) {
      return { total: 0, high: 0, medium: 0, low: 0 };
    }
    
    const total = data.length;
    const high = data.filter(item => item.priority === 'high').length;
    const medium = data.filter(item => item.priority === 'medium').length;
    const low = data.filter(item => item.priority === 'low').length;

    return { total, high, medium, low };
  };

  // Ouvre le détail d'un item. Les actions edit/delete/more génériques ont été
  // retirées (aucun backend générique -> c'étaient de fausses affordances) ;
  // on notifie le parent au cas où il gère l'action, puis on ouvre le détail.
  const handleAction = (action: string, item: any) => {
    if (onAction) onAction(action, item);
    if (action === 'view') {
      setSelectedItem(item);
      setShowDetails(true);
    }
  };

  // Fonction pour rendre les éléments de la liste
  const renderListItems = () => {
    const filteredData = getFilteredData();
    const maxItems = widgetSize === 'small' ? 3 : widgetSize === 'large' ? 8 : 5;

    if (!filteredData || filteredData.length === 0) {
      return (
        <div className="text-center text-gray-500 py-4">
          <div className="text-sm">Aucun élément à afficher</div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {filteredData.slice(0, showAll ? filteredData.length : maxItems).map((item, index) => (
          <div
            key={item.id}
            className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
            onClick={() => handleAction('view', item)}
          >
            {/* Icône de statut */}
            <div className="mr-3">
              {getStatusIcon(item.status)}
            </div>

            {/* Contenu principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="font-medium text-gray-900 truncate">
                  {truncateText(item.title, widgetSize === 'small' ? 20 : 30)}
                </div>
                <div className="flex items-center space-x-2">
                  {getPriorityIcon(item.priority)}
                </div>
              </div>
              
              {item.description && (
                <div className="text-sm text-gray-600 truncate">
                  {truncateText(item.description, widgetSize === 'small' ? 25 : 40)}
                </div>
              )}
              
              {item.timestamp && (
                <div className="text-xs text-gray-500 mt-1">
                  {formatDate(item.timestamp)}
                </div>
              )}
            </div>

            {/* Statut */}
            <div className="ml-3 text-right shrink-0">
              <div className={`text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap ${getStatusColor(item.status)}`}>
                {item.status}
              </div>
            </div>
          </div>
        ))}

        {/* Bouton "Voir plus" / "Réduire" — développe la liste sur place */}
        {filteredData.length > maxItems && (
          <div className="text-center pt-2">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors"
            >
              {showAll ? 'Réduire la liste' : `Voir tous les ${filteredData.length} éléments`}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Fonction pour rendre les filtres
  const renderFilters = () => {
    const stats = getStats();

    return (
      <div className="flex flex-wrap gap-1 mb-3">
        <button
          onClick={() => setFilter('all')}
          className={`px-2 py-1 text-xs rounded ${
            filter === 'all'
              ? 'bg-orange-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Tous ({stats.total})
        </button>
        <button
          onClick={() => setFilter('high')}
          className={`px-2 py-1 text-xs rounded ${
            filter === 'high'
              ? 'bg-red-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Haute ({stats.high})
        </button>
        <button
          onClick={() => setFilter('medium')}
          className={`px-2 py-1 text-xs rounded ${
            filter === 'medium'
              ? 'bg-orange-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Moyenne ({stats.medium})
        </button>
        <button
          onClick={() => setFilter('low')}
          className={`px-2 py-1 text-xs rounded ${
            filter === 'low'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Basse ({stats.low})
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Filtres */}
      {renderFilters()}

      {/* Liste */}
      {renderListItems()}

      {/* Modal de détails */}
      {showDetails && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Détails de l'élément</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Informations principales */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Informations</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-sm text-gray-600">Titre:</span>
                    <span className="text-sm font-medium text-gray-900">{selectedItem.title}</span>
                  </div>
                  
                  {selectedItem.description && (
                    <div className="flex justify-between items-start p-3 bg-gray-50 rounded">
                      <span className="text-sm text-gray-600">Description:</span>
                      <span className="text-sm font-medium text-gray-900 max-w-xs text-right">
                        {selectedItem.description}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-sm text-gray-600">Statut:</span>
                    <span className={`text-sm font-medium px-2 py-1 rounded-full border ${getStatusColor(selectedItem.status)}`}>
                      {selectedItem.status}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-sm text-gray-600">Priorité:</span>
                    <div className="flex items-center space-x-2">
                      {getPriorityIcon(selectedItem.priority)}
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {selectedItem.priority}
                      </span>
                    </div>
                  </div>
                  
                  {selectedItem.timestamp && (
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <span className="text-sm text-gray-600">Date:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatDate(selectedItem.timestamp)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListWidget; 