/**
 * Widget « warehouse-occupancy », sorti de WidgetRenderer.tsx.
 *
 * WidgetRenderer declarait l'etat de TOUS les widgets a la fois : 84 `useState`
 * et 38 `useEffect`, dont 36 ouverts par `if (widget.id !== ...) return`.
 * Afficher un seul widget allouait donc les 84 etats et declenchait les 38
 * effets. Ici, le widget possede son etat et ne coute rien aux autres.
 *
 * Le JSX est repris A L'IDENTIQUE (decoupe par programme, pas retape) :
 * aucun changement d'affichage n'est attendu.
 */

import React, { useState, useEffect } from 'react';
import { getWarehouseOccupancyMetrics } from '../../../utils/enterpriseApi/logisticien';
import { Building2 } from 'lucide-react';

export default function WarehouseOccupancyWidget() {
  const [liveWarehouseOccupancy, setLiveWarehouseOccupancy] = useState<
    Awaited<ReturnType<typeof getWarehouseOccupancyMetrics>> | null
  >(null);
  const [liveWarehouseOccupancyLoading, setLiveWarehouseOccupancyLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveWarehouseOccupancyLoading(true);
      try {
        const data = await getWarehouseOccupancyMetrics();
        if (!cancelled) setLiveWarehouseOccupancy(data);
      } catch (e) {
        console.error('WarehouseOccupancyWidget getWarehouseOccupancyMetrics', e);
      } finally {
        if (!cancelled) setLiveWarehouseOccupancyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getWarehouseOccupancyMetrics().then(setLiveWarehouseOccupancy).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveWarehouseOccupancyLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mr-2" />
        Chargement des entrepôts…
      </div>
    );
  }
  const w = liveWarehouseOccupancy ?? {
    warehouseCount: 0,
    weightedOccupancyPct: 0,
    criticalWarehouses: 0,
    maintenanceWarehouses: 0,
    totalCapacityPallets: 0,
    totalUsedPallets: 0,
  };
  const pctColor =
    w.weightedOccupancyPct >= 92 ? 'text-red-700'
    : w.weightedOccupancyPct >= 78 ? 'text-amber-700'
    : 'text-emerald-700';
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-1 pb-2 text-xs text-gray-600">
        <Building2 className="h-3.5 w-3.5 text-emerald-600" />
        <span>Occupation réseau entrepôts</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-2">
        <div className={`text-center text-4xl font-bold ${pctColor}`}>
          {w.weightedOccupancyPct}%
        </div>
        <div className="mt-0.5 text-xs text-gray-500">
          {w.warehouseCount} site{w.warehouseCount > 1 ? 's' : ''} · {w.totalUsedPallets.toLocaleString('fr-FR')} /{' '}
          {w.totalCapacityPallets.toLocaleString('fr-FR')} palettes
        </div>
        <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
          <div className="rounded bg-amber-50 p-2">
            <div className="text-xs font-bold text-amber-800">{w.criticalWarehouses}</div>
            <div className="text-xs text-amber-800/80">Critique / saturé</div>
          </div>
          <div className="rounded bg-slate-50 p-2">
            <div className="text-xs font-bold text-slate-700">{w.maintenanceWarehouses}</div>
            <div className="text-xs text-slate-600">Hors prod.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
