/**
 * Types internes du shell mutualise. Ne pas confondre avec
 * `src/pages/enterprise/types.ts` qui decrit les types metier du
 * configurateur historique (Widget, WidgetLayout, DashboardConfig).
 */

/** Repère un widget du catalogue métier (localStorage + rendu). Pas d’index signature pour rester assignable aux configs typées (ex. vendeur). */
export interface ShellWidget {
  id: string;
  title?: string;
  type?: string;
  description?: string;
  dataSource?: string;
  icon?: unknown;
  enabled?: boolean;
  features?: unknown;
  priority?: number;
  category?: string;
  size?: string;
}

export interface ShellWidgetsSource {
  widgets: ShellWidget[];
}

export interface ShellLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShellDashboardConfig {
  widgets: ShellWidget[];
  layout: { lg: ShellLayoutItem[]; [key: string]: ShellLayoutItem[] };
  widgetSizes: Record<string, string>;
  lastSaved?: string;
}

export type ShellSaveStatus = 'idle' | 'saving' | 'saved';
export type ShellAddStatus = 'idle' | 'added';
