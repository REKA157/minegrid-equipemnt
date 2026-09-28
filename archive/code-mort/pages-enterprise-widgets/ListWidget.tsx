import { Widget } from '../types';
import React from 'react';
import { iconMap } from './iconMap';
import { CheckCircle, Clock, Wrench } from 'lucide-react';

export const ListWidget = ({
  widget,
  data,
  onShowDetails,
  onMarkRepairComplete,
  onAssignTechnician,
  onShowInterventionForm
}: {
  widget: Widget;
  data: any[];
  onShowDetails: (content: React.ReactNode) => void;
  onMarkRepairComplete: (repairId: string) => void;
  onAssignTechnician: (repairId: string, technicianId: string, technicianName: string) => void;
  onShowInterventionForm: () => void;
}) => {
  const IconComponent = typeof widget.icon === 'string' ? iconMap[widget.icon] : widget.icon;

  const renderListData = () => {
    // Spécifique pour 'repair-status'
    if (widget.id === 'repair-status') {
      const detailedView = (
              <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Détail des réparations</h3>
              <button
                onClick={onShowInterventionForm}
                className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700"
              >
                Nouvelle réparation
              </button>
            </div>
            <div className="space-y-2">
            {data.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-100 rounded-lg">
                <div className="flex items-center min-w-0">
                    {item.status === 'Terminé' && <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />}
                    {item.status === 'En cours' && <Wrench className="h-5 w-5 text-blue-500 mr-3 flex-shrink-0" />}
                    {item.status === 'En attente' && <Clock className="h-5 w-5 text-orange-500 mr-3 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{item.equipment}</div>
                    <div className="text-sm text-gray-600">Technicien: {item.technician}</div>
                    </div>
                </div>
                <div className="text-right ml-4">
                    <div className="text-sm font-medium text-gray-800">{item.estimated}</div>
                    <div className="text-xs text-gray-500">Délai estimé</div>
                    {item.status !== 'Terminé' && (
                      <button
                        onClick={() => onMarkRepairComplete(item.id)}
                        className="mt-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                      >
                        Terminer
                      </button>
                    )}
                </div>
                </div>
            ))}
            </div>
        </div>
      );

      return (
        <div className="space-y-2">
          {data.slice(0, 3).map((item, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center min-w-0">
                {item.status === 'Terminé' && <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />}
                {item.status === 'En cours' && <Wrench className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />}
                {item.status === 'En attente' && <Clock className="h-4 w-4 text-orange-500 mr-2 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{item.equipment}</div>
                  <div className="text-xs text-gray-600">Technicien: {item.technician}</div>
                </div>
              </div>
              <div className="text-right ml-2">
                <div className="text-xs font-medium text-gray-800">{item.estimated}</div>
                <div className="text-xs text-gray-500">Délai</div>
                {item.status !== 'Terminé' && (
                  <button
                    onClick={() => onMarkRepairComplete(item.id)}
                    className="mt-1 px-2 py-0.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                  >
                    ✓
                  </button>
                )}
              </div>
            </div>
          ))}
          {data.length > 3 && (
            <button onClick={() => onShowDetails(detailedView)} className="w-full mt-2 text-sm text-orange-600 hover:text-orange-700 font-semibold">
              Voir tout
            </button>
          )}
        </div>
      );
    }

    // Générique pour les autres widgets liste
    return (
      <div className="space-y-2">
        {data.slice(0, 5).map((item, index) => (
          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
            <div className="flex items-center min-w-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {item.name || item.title || item.equipment || `Élément ${index + 1}`}
                </div>
                <div className="text-xs text-gray-600">
                  {item.description || item.status || item.technician || ''}
                </div>
              </div>
            </div>
            <div className="text-right ml-2">
              <div className="text-xs font-medium text-gray-800">
                {item.value || item.estimated || item.cost || ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderListData()}
    </div>
  );
};
