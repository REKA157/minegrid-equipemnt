import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../../utils/logger';
import type {
  ShellAddStatus,
  ShellDashboardConfig,
  ShellLayoutItem,
  ShellWidget,
  ShellWidgetsSource,
  ShellSaveStatus,
} from './shellTypes';

/**
 * Hook centralisant toute la logique d'etat commune aux 8 dashboards
 * Enterprise (Mecanicien, Loueur, Vendeur, Transporteur, ...) :
 * - chargement / purge / persistance localStorage
 * - add / remove / cycle size / reset / restore / save
 *
 * Seules varient la cle `role` (suffixe localStorage) et la source de
 * widgets metier fournie par l'appelant.
 */

const BASE_KEY = 'enterpriseDashboardConfig';
const BACKUP_SUFFIX = '_backup';

export interface UseShellStateOptions {
  role: string;
  widgetsSource: ShellWidgetsSource;
  validIds: string[];
}

const storageKey = (role: string) => `${BASE_KEY}_${role}`;
const backupKey = (role: string) => `${BASE_KEY}_${role}${BACKUP_SUFFIX}`;

const emptyConfig = (): ShellDashboardConfig => ({
  widgets: [],
  layout: { lg: [] },
  widgetSizes: {},
});

function safeReadConfig(role: string): ShellDashboardConfig {
  const raw = localStorage.getItem(storageKey(role));
  if (!raw) return emptyConfig();
  try {
    const parsed = JSON.parse(raw) as Partial<ShellDashboardConfig>;
    return {
      widgets: Array.isArray(parsed?.widgets) ? (parsed.widgets as ShellWidget[]) : [],
      layout:
        parsed?.layout && Array.isArray(parsed.layout.lg) ? parsed.layout : { lg: [] },
      widgetSizes: (parsed?.widgetSizes as Record<string, string>) ?? {},
      lastSaved: parsed?.lastSaved,
    };
  } catch {
    logger.warn(`[enterpriseDashboard:${role}] config corrompue, reset`);
    localStorage.removeItem(storageKey(role));
    return emptyConfig();
  }
}

const persist = (role: string, config: ShellDashboardConfig) =>
  localStorage.setItem(storageKey(role), JSON.stringify(config));

/** Réaligne titre, type et champs catalogue sur la source métier (évite titres obsolètes dans localStorage). */
function reconcileWidgetsWithSource(
  stored: ShellWidget[],
  source: ShellWidgetsSource,
  validIds: string[],
): ShellWidget[] {
  return stored
    .filter((w) => validIds.includes(w.id))
    .map((w) => {
      const canonical = source.widgets.find((s) => s.id === w.id);
      if (!canonical) return w;
      return {
        ...canonical,
        ...w,
        title: canonical.title,
        type: canonical.type,
        description: canonical.description,
        dataSource: canonical.dataSource,
      } as ShellWidget;
    });
}

/** Empreinte du catalogue widgets (ignore la référence de l'objet source). */
function widgetsCatalogKey(source: ShellWidgetsSource): string {
  return source.widgets
    .map(
      (w) =>
        `${w.id}\u0001${String(w.type ?? '')}\u0001${String(w.title ?? '')}\u0001${String(w.description ?? '')}\u0001${String(w.dataSource ?? '')}`,
    )
    .sort()
    .join('\u0002');
}

export function useShellState(options: UseShellStateOptions) {
  const { role, widgetsSource, validIds } = options;
  const [config, setConfig] = useState<ShellDashboardConfig | null>(null);
  const [layout, setLayout] = useState<{ lg: ShellLayoutItem[] }>({ lg: [] });
  const [addStatus, setAddStatus] = useState<Record<string, ShellAddStatus>>({});
  const [saveStatus, setSaveStatus] = useState<ShellSaveStatus>('idle');
  const addTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const validIdsKey = [...validIds].sort().join('|');
  const catalogKey = widgetsCatalogKey(widgetsSource);

  // Réconciliation localStorage : uniquement quand rôle, liste d'id autorisés ou catalogue (contenu) changent.
  // Pas de dépendance directe à la référence de `validIds` / `widgetsSource` pour éviter des re-exécutions inutiles.
  useEffect(() => {
    const parsed = safeReadConfig(role);

    parsed.widgets = reconcileWidgetsWithSource(parsed.widgets || [], widgetsSource, validIds);
    parsed.layout.lg = (parsed.layout.lg || []).filter((l) => validIds.includes(l.i));

    if (parsed.widgetSizes) {
      parsed.widgets = parsed.widgets.map((w) => ({
        ...w,
        size: (w as ShellWidget).size || parsed.widgetSizes[w.id] || '1/3',
      }));
    }

    persist(role, parsed);
    setConfig(parsed);
    setLayout(parsed.layout ?? { lg: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- widgetsSource / validIds : voir validIdsKey & catalogKey
  }, [role, validIdsKey, catalogKey]);

  const onLayoutChange = useCallback(
    (newLayout: ShellLayoutItem[]) => {
      setLayout({ lg: newLayout });
      setConfig((prev) => {
        if (!prev) return prev;
        const next = { ...prev, layout: { ...prev.layout, lg: newLayout } };
        persist(role, next);
        return next;
      });
    },
    [role],
  );

  const cycleWidgetHeight = useCallback(
    (widgetId: string) => {
      setLayout((prev) => {
        const current = prev.lg.find((l) => l.i === widgetId);
        if (!current) return prev;
        const nextH = current.h < 4 ? 4 : current.h < 6 ? 6 : 2;
        const newLg = prev.lg.map((l) => (l.i === widgetId ? { ...l, h: nextH } : l));
        const updated = { ...prev, lg: newLg };
        setConfig((prevConfig) => {
          if (!prevConfig) return prevConfig;
          const next = { ...prevConfig, layout: updated };
          persist(role, next);
          return next;
        });
        return updated;
      });
    },
    [role],
  );

  const resetWidgetSize = useCallback(
    (widgetId: string) => {
      setLayout((prev) => {
        const newLg = prev.lg.map((l) => (l.i === widgetId ? { ...l, w: 4, h: 2 } : l));
        const updated = { ...prev, lg: newLg };
        setConfig((prevConfig) => {
          if (!prevConfig) return prevConfig;
          const next = { ...prevConfig, layout: updated };
          persist(role, next);
          return next;
        });
        return updated;
      });
    },
    [role],
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      if (!config) return;

      // Backup de la position pour restauration ulterieure
      const currentLayoutItem = layout.lg.find((l) => l.i === widgetId);
      if (currentLayoutItem) {
        const existingBackup = localStorage.getItem(backupKey(role));
        let backup: { layout: { lg: ShellLayoutItem[] } } = { layout: { lg: [] } };
        if (existingBackup) {
          try {
            backup = JSON.parse(existingBackup);
          } catch {
            localStorage.removeItem(backupKey(role));
          }
        }
        const idx = backup.layout.lg.findIndex((l) => l.i === widgetId);
        if (idx >= 0) backup.layout.lg[idx] = currentLayoutItem;
        else backup.layout.lg.push(currentLayoutItem);
        localStorage.setItem(backupKey(role), JSON.stringify(backup));
      }

      const newWidgets = config.widgets.filter((w) => w.id !== widgetId);
      const newLg = layout.lg.filter((l) => l.i !== widgetId);
      const updated = { ...layout, lg: newLg };
      const newConfig = { ...config, widgets: newWidgets, layout: updated };
      setConfig(newConfig);
      setLayout(updated);
      persist(role, newConfig);
    },
    [config, layout, role],
  );

  const addWidget = useCallback(
    (widgetId: string) => {
      if (!config) return;
      const widgetToAdd = widgetsSource.widgets.find((w) => w.id === widgetId);
      if (!widgetToAdd) {
        logger.warn(`[enterpriseDashboard:${role}] widget introuvable`, widgetId);
        return;
      }

      let originalPosition: ShellLayoutItem | null = null;
      const savedBackup = localStorage.getItem(backupKey(role));
      if (savedBackup) {
        try {
          const backup = JSON.parse(savedBackup) as { layout?: { lg?: ShellLayoutItem[] } };
          originalPosition = backup?.layout?.lg?.find((l) => l.i === widgetId) ?? null;
        } catch {
          localStorage.removeItem(backupKey(role));
        }
      }

      const newWidgets = [...config.widgets, widgetToAdd];
      const newLayoutItem: ShellLayoutItem = originalPosition
        ? originalPosition
        : { i: widgetId, x: 0, y: layout.lg.length, w: 4, h: 2 };
      const newLg = [...layout.lg, newLayoutItem];
      const newConfig = { ...config, widgets: newWidgets, layout: { ...config.layout, lg: newLg } };
      setConfig(newConfig);
      setLayout(newConfig.layout);
      persist(role, newConfig);

      setAddStatus((s) => ({ ...s, [widgetId]: 'added' }));
      if (addTimeouts.current[widgetId]) clearTimeout(addTimeouts.current[widgetId]);
      addTimeouts.current[widgetId] = setTimeout(() => {
        setAddStatus((s) => ({ ...s, [widgetId]: 'idle' }));
        const existingBackup = localStorage.getItem(backupKey(role));
        if (!existingBackup) return;
        try {
          const backup = JSON.parse(existingBackup) as { layout: { lg: ShellLayoutItem[] } };
          backup.layout.lg = backup.layout.lg.filter((l) => l.i !== widgetId);
          localStorage.setItem(backupKey(role), JSON.stringify(backup));
        } catch {
          localStorage.removeItem(backupKey(role));
        }
      }, 1500);
    },
    [config, layout.lg, role, widgetsSource.widgets],
  );

  const restoreAllWidgets = useCallback(() => {
    if (!config) return;
    const currentIds = config.widgets.map((w) => w.id);
    const missing = widgetsSource.widgets.filter((w) => !currentIds.includes(w.id));
    if (missing.length === 0) return;

    const newWidgets = [...config.widgets, ...missing];
    const newLg: ShellLayoutItem[] = [
      ...layout.lg,
      ...missing.map((w, idx) => ({
        i: w.id,
        x: 0,
        y: layout.lg.length + idx,
        w: 4,
        h: 2,
      })),
    ];
    const newConfig = { ...config, widgets: newWidgets, layout: { ...config.layout, lg: newLg } };
    setConfig(newConfig);
    setLayout(newConfig.layout);
    persist(role, newConfig);
  }, [config, layout.lg, role, widgetsSource.widgets]);

  const saveDashboard = useCallback(() => {
    if (!config) return;
    setSaveStatus('saving');
    const snapshot = { ...config, layout, lastSaved: new Date().toISOString() };
    persist(role, snapshot);
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 1000);
  }, [config, layout, role]);

  return {
    config,
    layout,
    addStatus,
    saveStatus,
    onLayoutChange,
    cycleWidgetHeight,
    resetWidgetSize,
    addWidget,
    removeWidget,
    restoreAllWidgets,
    saveDashboard,
  };
}
