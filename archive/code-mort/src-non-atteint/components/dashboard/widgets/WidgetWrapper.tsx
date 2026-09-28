import React, { useState } from 'react';
import { X, Maximize2, Minimize2, MoreHorizontal, GripVertical } from 'lucide-react';
import { useAdaptiveWidget } from '../../../hooks/useAdaptiveWidget';

interface WidgetWrapperProps {
  widget: any;
  children: React.ReactNode;
  onRemove: (widgetId: string) => void;
  onToggleSize: (widgetId: string) => void;
  onToggleVisibility: (widgetId: string) => void;
  onShowDetails: (content: React.ReactNode) => void;
  widgetSize?: 'small' | 'normal' | 'large';
  dataVersion?: number;
}

export default function WidgetWrapper({
  widget,
  children,
  onRemove,
  onToggleSize,
  onToggleVisibility,
  onShowDetails,
  widgetSize = 'normal',
  dataVersion
}: WidgetWrapperProps) {
  const [isCollapsed, setIsCollapsed] = useState(widget.isCollapsed || false);
  const { getTextSize } = useAdaptiveWidget(widgetSize);

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleRemove = () => {
    onRemove(widget.id);
  };

  const handleToggleSize = () => {
    onToggleSize(widget.id);
  };

  const handleToggleVisibility = () => {
    onToggleVisibility(widget.id);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header du widget */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <div className="handle cursor-move p-1">
            <GripVertical className="h-4 w-4 text-gray-400" />
          </div>
          <div className="flex items-center space-x-2">
            {widget.icon && <widget.icon className="h-4 w-4 text-orange-600" />}
            <h3 className={`font-medium text-gray-900 ${getTextSize('title')}`}>
              {widget.title}
            </h3>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          {/* Bouton détails */}
          <button
            onClick={() => onShowDetails(
              <div className="p-4">
                <h4 className="font-semibold mb-2">{widget.title}</h4>
                <p className="text-sm text-gray-600">{widget.description}</p>
                <div className="mt-4 text-xs text-gray-500">
                  <p>ID: {widget.id}</p>
                  <p>Type: {widget.type}</p>
                  <p>Source: {widget.dataSource}</p>
                  <p>Version: {dataVersion}</p>
                </div>
              </div>
            )}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Détails"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {/* Bouton collapse/expand */}
          <button
            onClick={handleToggleCollapse}
            className="p-1 text-orange-500 hover:text-orange-700 transition-colors"
            title={isCollapsed ? "Développer" : "Réduire"}
          >
            {isCollapsed ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>

          {/* Bouton supprimer */}
          <button
            onClick={handleRemove}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Supprimer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contenu du widget */}
      {!isCollapsed && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
} 