import { useCallback } from 'react';
import { useWidgetMadCurrency } from './useWidgetMadCurrency';

// Hook pour l'adaptation automatique des widgets
export const useAdaptiveWidget = (widgetSize: 'small' | 'normal' | 'large' = 'normal') => {
  const { madToDisplay, currentCurrency, formatCurrency: formatMadMoneyLabel } = useWidgetMadCurrency();
  const getTextSize = (type: 'title' | 'subtitle' | 'value' | 'small') => {
    switch (widgetSize) {
      case 'small':
        return type === 'title' ? 'text-xs' : type === 'value' ? 'text-lg' : 'text-xs';
      case 'large':
        return type === 'title' ? 'text-lg' : type === 'subtitle' ? 'text-base' : type === 'value' ? 'text-3xl' : 'text-sm';
      default:
        return type === 'title' ? 'text-sm' : type === 'value' ? 'text-2xl' : 'text-xs';
    }
  };

  const getGridCols = (defaultCols: number) => {
    switch (widgetSize) {
      case 'small':
        return Math.max(1, defaultCols - 1);
      case 'large':
        return Math.min(6, defaultCols + 1);
      default:
        return defaultCols;
    }
  };

  const formatCurrency = useCallback(
    (amountMad: number) => {
      const isSmall = widgetSize === 'small';
      const isLarge = widgetSize === 'large';
      const d = madToDisplay(amountMad);

      if (d >= 1000000) {
        return isSmall
          ? `${(d / 1000000).toFixed(1)}M`
          : isLarge
            ? `${(d / 1000000).toFixed(2)}M ${currentCurrency}`
            : `${(d / 1000000).toFixed(1)}M ${currentCurrency}`;
      }
      if (d >= 1000) {
        return isSmall
          ? `${(d / 1000).toFixed(0)}k`
          : isLarge
            ? `${(d / 1000).toFixed(1)}k ${currentCurrency}`
            : `${(d / 1000).toFixed(0)}k ${currentCurrency}`;
      }
      return isSmall
        ? `${Math.round(d)}`
        : isLarge
          ? formatMadMoneyLabel(amountMad)
          : d.toLocaleString('fr-FR');
    },
    [widgetSize, madToDisplay, currentCurrency, formatMadMoneyLabel],
  );

  const formatNumber = (num: number) => {
    const isSmall = widgetSize === 'small';
    const isLarge = widgetSize === 'large';
    
    if (num >= 1000000) {
      return isSmall ? `${(num / 1000000).toFixed(1)}M` :
             isLarge ? `${(num / 1000000).toFixed(2)}M` :
             `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return isSmall ? `${(num / 1000).toFixed(0)}k` :
             isLarge ? `${(num / 1000).toFixed(1)}k` :
             `${(num / 1000).toFixed(0)}k`;
    } else {
      return isSmall ? `${num}` :
             isLarge ? `${num.toLocaleString('fr-FR')}` :
             `${num.toLocaleString('fr-FR')}`;
    }
  };

  const getPadding = () => {
    switch (widgetSize) {
      case 'small':
        return 'p-2';
      case 'large':
        return 'p-6';
      default:
        return 'p-4';
    }
  };

  const getSpacing = () => {
    switch (widgetSize) {
      case 'small':
        return 'space-y-2';
      case 'large':
        return 'space-y-4';
      default:
        return 'space-y-3';
    }
  };

  return {
    getTextSize,
    getGridCols,
    formatCurrency,
    formatNumber,
    getPadding,
    getSpacing,
    widgetSize
  };
}; 