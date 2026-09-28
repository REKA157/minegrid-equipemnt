/**
 * Types partagés du dashboard entreprise (widgets, layout, configuration).
 * Extraits de src/pages/EnterpriseDashboard.tsx pour permettre aux widgets
 * externalisés de les importer sans dépendance circulaire.
 */

export interface Widget {
  id: string;
  type:
    | 'metric'
    | 'chart'
    | 'list'
    | 'calendar'
    | 'map'
    | 'equipment'
    | 'maintenance'
    | 'performance'
    | 'pipeline'
    | 'priority'
    | 'analytics'
    | 'daily-actions';
  title: string;
  description: string;
  icon: any;
  enabled: boolean;
  dataSource: string;
  isCollapsed?: boolean;
  position?: number;
}

export interface WidgetLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
}

export interface DashboardConfig {
  widgets: Widget[];
  theme: 'light' | 'dark' | 'auto';
  layout: 'grid' | 'list' | 'compact';
  refreshInterval: number;
  notifications: boolean;
}
