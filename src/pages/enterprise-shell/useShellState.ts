import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../../utils/logger';
import { scopedStorageKey, setAccountItem } from '../../utils/accountLocalStorage';
import supabase from '../../utils/supabaseClient';
import {
  fetchEnterpriseDashboardConfig,
  upsertEnterpriseDashboardConfig,
} from '../../utils/enterpriseDashboardConfig';
import type {
  ShellAddStatus,
  ShellDashboardConfig,
  ShellLayoutItem,
  ShellWidget,
  ShellWidgetsSource,
  ShellSaveStatus,
} from './shellTypes';
import { generatePreviewLayout, getHeightFromWidget, getWidthFromSize } from './layoutHelpers';

/**
 * Hook centralisant toute la logique d'etat commune aux 8 dashboards
 * Enterprise (Mecanicien, Loueur, Vendeur, Transporteur, ...) :
 * - chargement / purge / persistance localStorage
 * - synchro optionnelle Supabase (table `enterprise_dashboard_configs`, voir sql/)
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
  /**
   * Sous-ensemble (ordonné) des widgets ACTIFS par défaut quand aucune config n'existe.
   * Permet d'avoir un dashboard par défaut épuré (ex. vendeur : 5 essentiels) tout en
   * gardant `validIds` complet comme CATALOGUE ajoutable. Si absent : tout reste vide
   * (comportement historique des autres rôles).
   */
  defaultActiveIds?: string[];
  /** Isoler la config grille par utilisateur Supabase (évite mélange premium / enterprise sur même origin). */
  storageUserId?: string | null;
}

/** Clé config shell : préfixée `mg:<uuid>:…` lorsque storageUserId est défini */
function cfgStorageKey(userId: string | null | undefined, role: string): string {
  const base = `${BASE_KEY}_${role}`;
  return userId ? scopedStorageKey(userId, base) : base;
}

function backupStorageKey(userId: string | null | undefined, role: string): string {
  const base = `${BASE_KEY}_${role}${BACKUP_SUFFIX}`;
  return userId ? scopedStorageKey(userId, base) : `${BASE_KEY}_${role}${BACKUP_SUFFIX}`;
}

const emptyConfig = (): ShellDashboardConfig => ({
  widgets: [],
  layout: { lg: [] },
  widgetSizes: {},
});

function migrateLegacyEnterpriseConfig(role: string, userId: string): void {
  const legacyMain = `${BASE_KEY}_${role}`;
  const scopedMain = scopedStorageKey(userId, legacyMain);
  if (localStorage.getItem(scopedMain) !== null) return;
  const leg = localStorage.getItem(legacyMain);
  if (leg === null) return;
  try {
    localStorage.setItem(scopedMain, leg);
    localStorage.removeItem(legacyMain);
  } catch {
    /* quota */
  }
  const legacyBk = `${legacyMain}${BACKUP_SUFFIX}`;
  const scopedBk = scopedStorageKey(userId, legacyBk);
  const bk = localStorage.getItem(legacyBk);
  if (bk !== null) {
    try {
      localStorage.setItem(scopedBk, bk);
      localStorage.removeItem(legacyBk);
    } catch {
      /* ignore */
    }
  }
}

function safeReadConfig(storageUserId: string | null | undefined, role: string): ShellDashboardConfig {
  if (storageUserId) migrateLegacyEnterpriseConfig(role, storageUserId);
  const ck = cfgStorageKey(storageUserId, role);
  let raw = localStorage.getItem(ck);
  if (!raw && !storageUserId) raw = localStorage.getItem(`${BASE_KEY}_${role}`);
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
    localStorage.removeItem(ck);
    return emptyConfig();
  }
}

/** Garde la version la plus récente (horodatage `lastSaved`). */
function pickNewerDashboardConfig(
  local: ShellDashboardConfig,
  remote: ShellDashboardConfig,
): ShellDashboardConfig {
  const tl = local.lastSaved ? Date.parse(local.lastSaved) : 0;
  const tr = remote.lastSaved ? Date.parse(remote.lastSaved) : 0;
  return tr > tl ? remote : local;
}

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

function applyCatalogReconciliation(
  base: ShellDashboardConfig,
  source: ShellWidgetsSource,
  ids: string[],
): ShellDashboardConfig {
  const parsed: ShellDashboardConfig = {
    ...base,
    layout: { ...base.layout, lg: [...(base.layout?.lg || [])] },
    widgets: [...(base.widgets || [])],
  };
  parsed.widgets = reconcileWidgetsWithSource(parsed.widgets || [], source, ids);
  parsed.layout.lg = (parsed.layout.lg || []).filter((l) => ids.includes(l.i));
  if (parsed.widgetSizes) {
    parsed.widgets = parsed.widgets.map((w) => ({
      ...w,
      size: (w as ShellWidget).size || parsed.widgetSizes![w.id] || '1/3',
    }));
  }
  return parsed;
}

/** Construit une config par défaut épurée (sous-ensemble ordonné) si aucune config n'existe. */
function seedDefaultActive(
  base: ShellDashboardConfig,
  source: ShellWidgetsSource,
  defaultActiveIds: string[],
): ShellDashboardConfig {
  const seedWidgets = defaultActiveIds
    .map((id) => source.widgets.find((w) => w.id === id))
    .filter((w): w is ShellWidget => Boolean(w));
  if (!seedWidgets.length) return base;
  return {
    ...base,
    widgets: seedWidgets,
    layout: { lg: generatePreviewLayout(seedWidgets, base.widgetSizes ?? {}) },
  };
}

export function useShellState(options: UseShellStateOptions) {
  const { role, widgetsSource, validIds, defaultActiveIds, storageUserId } = options;
  const [config, setConfig] = useState<ShellDashboardConfig | null>(null);
  const [layout, setLayout] = useState<{ lg: ShellLayoutItem[] }>({ lg: [] });
  const [addStatus, setAddStatus] = useState<Record<string, ShellAddStatus>>({});
  const [saveStatus, setSaveStatus] = useState<ShellSaveStatus>('idle');
  const addTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validIdsKey = [...validIds].sort().join('|');
  const defaultActiveIdsKey = (defaultActiveIds ?? []).join('|');
  const catalogKey = widgetsCatalogKey(widgetsSource);

  const persistLocalAndCloud = useCallback((r: string, cfg: ShellDashboardConfig) => {
    try {
      localStorage.setItem(cfgStorageKey(storageUserId, r), JSON.stringify(cfg));
    } catch {
      /* storage indisponible */
    }
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    cloudSaveTimer.current = setTimeout(() => {
      cloudSaveTimer.current = null;
      void (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const uid = sessionData?.session?.user?.id;
          if (!uid) return;
          const res = await upsertEnterpriseDashboardConfig(uid, r, cfg);
          if (!res.ok && res.error) {
            logger.warn(`[enterpriseDashboard:${r}] synchro nuage`, res.error);
          }
        } catch (e) {
          logger.warn(`[enterpriseDashboard:${r}] synchro nuage`, e);
        }
      })();
    }, 1500);
  }, [storageUserId]);

  useEffect(
    () => () => {
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    },
    [],
  );

  // Réconciliation localStorage + optionnellement nuage ; quand rôle, validIds ou catalogue changent.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let parsed = applyCatalogReconciliation(
        safeReadConfig(storageUserId, role),
        widgetsSource,
        validIds,
      );

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (uid) {
          const remoteRaw = await fetchEnterpriseDashboardConfig(uid, role);
          if (remoteRaw && !cancelled) {
            const remoteParsed = applyCatalogReconciliation(remoteRaw, widgetsSource, validIds);
            parsed = pickNewerDashboardConfig(parsed, remoteParsed);
          }
        }
      } catch (e) {
        logger.warn(`[enterpriseDashboard:${role}] lecture nuage`, e);
      }

      if (cancelled) return;

      // Aucune config (utilisateur neuf) -> amorcer un layout par défaut.
      // Si le rôle fournit defaultActiveIds, on amorce ce sous-ensemble épuré
      // (ex. vendeur). Sinon, on amorce TOUS les widgets valides (dans l'ordre
      // du catalogue) pour éviter l'écran « Aucun widget configuré » au 1er accès.
      if (!parsed.widgets || parsed.widgets.length === 0) {
        const effectiveDefaultIds =
          defaultActiveIds && defaultActiveIds.length
            ? defaultActiveIds
            : widgetsSource.widgets.map((w) => w.id).filter((id) => validIds.includes(id));
        if (effectiveDefaultIds.length) {
          parsed = seedDefaultActive(parsed, widgetsSource, effectiveDefaultIds);
        }
      }

      persistLocalAndCloud(role, parsed);
      setConfig(parsed);
      setLayout(parsed.layout ?? { lg: [] });
      try {
        setAccountItem(storageUserId ?? null, 'lastActiveMetier', role);
      } catch {
        /* storage indisponible */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- widgetsSource / validIds : voir validIdsKey & catalogKey
  }, [role, storageUserId, validIdsKey, defaultActiveIdsKey, catalogKey, persistLocalAndCloud]);

  const onLayoutChange = useCallback(
    (newLayout: ShellLayoutItem[]) => {
      setLayout({ lg: newLayout });
      setConfig((prev) => {
        if (!prev) return prev;
        const next = { ...prev, layout: { ...prev.layout, lg: newLayout } };
        persistLocalAndCloud(role, next);
        return next;
      });
    },
    [role, persistLocalAndCloud],
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
          persistLocalAndCloud(role, next);
          return next;
        });
        return updated;
      });
    },
    [role, persistLocalAndCloud],
  );

  const resetWidgetSize = useCallback(
    (widgetId: string) => {
      // Réinitialise à la taille PAR DÉFAUT du widget (largeur selon size, hauteur
      // selon le type) au lieu d'un h=2 qui tronquait graphes/listes/cartes.
      const widget = config?.widgets.find((w) => w.id === widgetId);
      const w = getWidthFromSize(widget?.size);
      const h = widget ? getHeightFromWidget(widget) : 4;
      setLayout((prev) => {
        const newLg = prev.lg.map((l) => (l.i === widgetId ? { ...l, w, h } : l));
        const updated = { ...prev, lg: newLg };
        setConfig((prevConfig) => {
          if (!prevConfig) return prevConfig;
          const next = { ...prevConfig, layout: updated };
          persistLocalAndCloud(role, next);
          return next;
        });
        return updated;
      });
    },
    [config, role, persistLocalAndCloud],
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      if (!config) return;

      const currentLayoutItem = layout.lg.find((l) => l.i === widgetId);
      if (currentLayoutItem) {
        const existingBackup = localStorage.getItem(backupStorageKey(storageUserId, role));
        let backup: { layout: { lg: ShellLayoutItem[] } } = { layout: { lg: [] } };
        if (existingBackup) {
          try {
            backup = JSON.parse(existingBackup);
          } catch {
            localStorage.removeItem(backupStorageKey(storageUserId, role));
          }
        }
        const idx = backup.layout.lg.findIndex((l) => l.i === widgetId);
        if (idx >= 0) backup.layout.lg[idx] = currentLayoutItem;
        else backup.layout.lg.push(currentLayoutItem);
        localStorage.setItem(backupStorageKey(storageUserId, role), JSON.stringify(backup));
      }

      const newWidgets = config.widgets.filter((w) => w.id !== widgetId);
      const newLg = layout.lg.filter((l) => l.i !== widgetId);
      const updated = { ...layout, lg: newLg };
      const newConfig = { ...config, widgets: newWidgets, layout: updated };
      setConfig(newConfig);
      setLayout(updated);
      persistLocalAndCloud(role, newConfig);
    },
    [config, layout, role, storageUserId, persistLocalAndCloud],
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
      const savedBackup = localStorage.getItem(backupStorageKey(storageUserId, role));
      if (savedBackup) {
        try {
          const backup = JSON.parse(savedBackup) as { layout?: { lg?: ShellLayoutItem[] } };
          originalPosition = backup?.layout?.lg?.find((l) => l.i === widgetId) ?? null;
        } catch {
          localStorage.removeItem(backupStorageKey(storageUserId, role));
        }
      }

      const newWidgets = [...config.widgets, widgetToAdd];
      const newLayoutItem: ShellLayoutItem = originalPosition
        ? originalPosition
        : {
            i: widgetId,
            x: 0,
            y: layout.lg.length,
            w: getWidthFromSize(widgetToAdd.size),
            h: getHeightFromWidget(widgetToAdd),
          };
      const newLg = [...layout.lg, newLayoutItem];
      const newConfig = { ...config, widgets: newWidgets, layout: { ...config.layout, lg: newLg } };
      setConfig(newConfig);
      setLayout(newConfig.layout);
      persistLocalAndCloud(role, newConfig);

      setAddStatus((s) => ({ ...s, [widgetId]: 'added' }));
      if (addTimeouts.current[widgetId]) clearTimeout(addTimeouts.current[widgetId]);
      addTimeouts.current[widgetId] = setTimeout(() => {
        setAddStatus((s) => ({ ...s, [widgetId]: 'idle' }));
        const existingBackup = localStorage.getItem(backupStorageKey(storageUserId, role));
        if (!existingBackup) return;
        try {
          const backup = JSON.parse(existingBackup) as { layout: { lg: ShellLayoutItem[] } };
          backup.layout.lg = backup.layout.lg.filter((l) => l.i !== widgetId);
          localStorage.setItem(backupStorageKey(storageUserId, role), JSON.stringify(backup));
        } catch {
          localStorage.removeItem(backupStorageKey(storageUserId, role));
        }
      }, 1500);
    },
    [config, layout.lg, role, storageUserId, widgetsSource.widgets, persistLocalAndCloud],
  );

  const restoreAllWidgets = useCallback(() => {
    if (!config) return;
    const currentIds = config.widgets.map((w) => w.id);
    const missing = widgetsSource.widgets.filter((w) => !currentIds.includes(w.id));
    if (missing.length === 0) return;

    const newWidgets = [...config.widgets, ...missing];
    const newLg: ShellLayoutItem[] = [
      ...layout.lg,
      ...missing.map((wg, idx) => ({
        i: wg.id,
        x: 0,
        y: layout.lg.length + idx,
        w: getWidthFromSize(wg.size),
        h: getHeightFromWidget(wg),
      })),
    ];
    const newConfig = { ...config, widgets: newWidgets, layout: { ...config.layout, lg: newLg } };
    setConfig(newConfig);
    setLayout(newConfig.layout);
    persistLocalAndCloud(role, newConfig);
  }, [config, layout.lg, role, storageUserId, widgetsSource.widgets, persistLocalAndCloud]);

  const saveDashboard = useCallback(async () => {
    if (!config) return;
    setSaveStatus('saving');
    const snapshot = { ...config, layout, lastSaved: new Date().toISOString() };
    try {
      localStorage.setItem(cfgStorageKey(storageUserId, role), JSON.stringify(snapshot));
    } catch {
      /* ignore */
    }
    if (cloudSaveTimer.current) {
      clearTimeout(cloudSaveTimer.current);
      cloudSaveTimer.current = null;
    }
    setConfig(snapshot);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (uid) {
        const res = await upsertEnterpriseDashboardConfig(uid, role, snapshot);
        if (!res.ok && res.error) {
          logger.warn(`[enterpriseDashboard:${role}] sauvegarde nuage`, res.error);
        }
      }
    } catch (e) {
      logger.warn(`[enterpriseDashboard:${role}] sauvegarde nuage`, e);
    }
    try {
      setAccountItem(storageUserId ?? null, 'lastActiveMetier', role);
    } catch {
      /* ignore */
    }
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [config, layout, role, storageUserId]);

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
