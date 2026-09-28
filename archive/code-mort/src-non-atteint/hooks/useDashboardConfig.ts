import { useState, useEffect, useCallback } from 'react';
import { DashboardConfig, Widget } from '../constants/dashboardTypes';

// Configuration par défaut
const defaultConfig: DashboardConfig = {
  widgets: [],
  theme: 'light',
  layout: 'grid',
  refreshInterval: 30000,
  notifications: true
};

export const useDashboardConfig = () => {
  const [config, setConfig] = useState<DashboardConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  // Charger la configuration depuis localStorage
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('dashboardConfig');
      const userRole = localStorage.getItem('userRole');
      
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        setConfig(parsedConfig);
      } else if (userRole) {
        // Créer une configuration par défaut basée sur le rôle
        const defaultWidgets = getDefaultWidgetsForRole(userRole);
        const newConfig = {
          ...defaultConfig,
          widgets: defaultWidgets
        };
        setConfig(newConfig);
        localStorage.setItem('dashboardConfig', JSON.stringify(newConfig));
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la configuration:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sauvegarder la configuration
  const saveConfig = useCallback((newConfig: DashboardConfig) => {
    try {
      localStorage.setItem('dashboardConfig', JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la configuration:', error);
    }
  }, []);

  // Mettre à jour un widget spécifique
  const updateWidget = useCallback((widgetId: string, updates: Partial<Widget>) => {
    setConfig(prevConfig => {
      const newWidgets = prevConfig.widgets.map(widget =>
        widget.id === widgetId ? { ...widget, ...updates } : widget
      );
      const newConfig = { ...prevConfig, widgets: newWidgets };
      saveConfig(newConfig);
      return newConfig;
    });
  }, [saveConfig]);

  // Supprimer un widget
  const removeWidget = useCallback((widgetId: string) => {
    setConfig(prevConfig => {
      const newWidgets = prevConfig.widgets.filter(widget => widget.id !== widgetId);
      const newConfig = { ...prevConfig, widgets: newWidgets };
      saveConfig(newConfig);
      return newConfig;
    });
  }, [saveConfig]);

  // Ajouter un nouveau widget
  const addWidget = useCallback((widget: Widget) => {
    setConfig(prevConfig => {
      const newWidgets = [...prevConfig.widgets, widget];
      const newConfig = { ...prevConfig, widgets: newWidgets };
      saveConfig(newConfig);
      return newConfig;
    });
  }, [saveConfig]);

  // Réorganiser les widgets
  const reorderWidgets = useCallback((newOrder: string[]) => {
    setConfig(prevConfig => {
      const widgetMap = new Map(prevConfig.widgets.map(w => [w.id, w]));
      const newWidgets = newOrder
        .map(id => widgetMap.get(id))
        .filter(Boolean) as Widget[];
      
      const newConfig = { ...prevConfig, widgets: newWidgets };
      saveConfig(newConfig);
      return newConfig;
    });
  }, [saveConfig]);

  // Changer le thème
  const setTheme = useCallback((theme: 'light' | 'dark' | 'auto') => {
    setConfig(prevConfig => {
      const newConfig = { ...prevConfig, theme };
      saveConfig(newConfig);
      return newConfig;
    });
  }, [saveConfig]);

  // Changer la mise en page
  const setLayout = useCallback((layout: 'grid' | 'list' | 'compact') => {
    setConfig(prevConfig => {
      const newConfig = { ...prevConfig, layout };
      saveConfig(newConfig);
      return newConfig;
    });
  }, [saveConfig]);

  // Réinitialiser la configuration
  const resetConfig = useCallback(() => {
    const userRole = localStorage.getItem('userRole');
    const defaultWidgets = getDefaultWidgetsForRole(userRole || 'vendeur');
    const newConfig = {
      ...defaultConfig,
      widgets: defaultWidgets
    };
    saveConfig(newConfig);
  }, [saveConfig]);

  return {
    config,
    loading,
    updateWidget,
    removeWidget,
    addWidget,
    reorderWidgets,
    setTheme,
    setLayout,
    resetConfig,
    saveConfig
  };
};

// Fonction pour obtenir les widgets par défaut selon le rôle
function getDefaultWidgetsForRole(role: string): Widget[] {
  const baseWidgets = [
    {
      id: 'daily-priority-actions',
      type: 'daily-priority' as const,
      title: 'Actions prioritaires du jour',
      description: 'Ce qu\'un vendeur doit faire chaque matin pour vendre plus',
      icon: 'Target',
      enabled: true,
      dataSource: 'daily-priority-actions',
      isCollapsed: false,
      position: 0
    },
    {
      id: 'sales-metrics',
      type: 'performance' as const,
      title: 'Score de Performance Commerciale',
      description: 'Votre performance globale avec recommandations IA',
      icon: 'Target',
      enabled: true,
      dataSource: 'performance-score',
      isCollapsed: false,
      position: 1
    }
  ];

  switch (role) {
    case 'vendeur':
      return [
        ...baseWidgets,
        {
          id: 'inventory-status',
          type: 'list' as const,
          title: 'Plan d\'action stock & revente',
          description: 'Statut stock dormant, recommandations automatiques',
          icon: 'Package',
          enabled: true,
          dataSource: 'inventory-status',
          position: 2
        },
        {
          id: 'sales-chart',
          type: 'chart' as const,
          title: 'Évolution des ventes',
          description: 'Analyse des tendances et prévisions',
          icon: 'TrendingUp',
          enabled: true,
          dataSource: 'sales-evolution',
          position: 3
        }
      ];
    case 'loueur':
      return [
        {
          id: 'rental-revenue',
          type: 'metric' as const,
          title: 'Revenus de location',
          description: 'Chiffre d\'affaires des locations',
          icon: 'DollarSign',
          enabled: true,
          dataSource: 'rental-revenue',
          position: 0
        }
      ];
    default:
      return baseWidgets;
  }
} 