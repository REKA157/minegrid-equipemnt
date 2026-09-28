import React from 'react';
import { useAdaptiveWidget } from '../../../hooks/useAdaptiveWidget';

interface InventoryWidgetProps {
  widget: any;
  widgetSize?: 'small' | 'normal' | 'large';
  onShowDetails: (content: React.ReactNode) => void;
}

export default function InventoryWidget({ widget, widgetSize = 'normal', onShowDetails }: InventoryWidgetProps) {
  const { getTextSize } = useAdaptiveWidget(widgetSize);

  return (
    <div className="text-center py-4">
      <div className="text-sm text-gray-600 mb-2">{widget.title}</div>
      <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-gray-500 text-sm">Inventaire {widget.type}</div>
      </div>
    </div>
  );
} 