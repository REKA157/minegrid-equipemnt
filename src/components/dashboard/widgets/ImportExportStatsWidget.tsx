/**
 * Widget « import-export-stats », sorti de WidgetRenderer.tsx.
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
import { getImportExportStats } from '../../../utils/enterpriseApi/transitaire';
import ChartWidget from './ChartWidget';
import { Ship } from 'lucide-react';
import type { Widget } from '../../../constants/dashboardTypes';

interface Props {
  widget: Widget;
  widgetSize: 'small' | 'medium' | 'large' | undefined;
}

export default function ImportExportStatsWidget({ widget, widgetSize }: Props) {
  const [liveImportExportStats, setLiveImportExportStats] = useState<
    Awaited<ReturnType<typeof getImportExportStats>> | null
  >(null);
  const [liveImportExportStatsLoading, setLiveImportExportStatsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveImportExportStatsLoading(true);
      try {
        const data = await getImportExportStats();
        if (!cancelled) setLiveImportExportStats(data);
      } catch (e) {
        console.error('ImportExportStatsWidget getImportExportStats', e);
      } finally {
        if (!cancelled) setLiveImportExportStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getImportExportStats().then(setLiveImportExportStats).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveImportExportStatsLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
        Chargement des statistiques I/E…
      </div>
    );
  }
  const ie = liveImportExportStats;
  if (!ie || ie.chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Ship className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucune donnée import/export</div>
        <div className="text-xs text-gray-400 mt-1">Exécutez le script SQL transitaire et saisissez des volumes mensuels</div>
      </div>
    );
  }
  const growthColor = ie.teuGrowth >= 0 ? 'text-green-700' : 'text-red-700';
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Ship className="h-3.5 w-3.5 text-teal-600" />
          <span>TEU cumulés Import + Export</span>
        </div>
        <span className={`text-xs font-bold ${growthColor}`}>
          {ie.teuGrowth >= 0 ? '+' : ''}{ie.teuGrowth}% vs mois préc.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 px-1 pb-2 text-center">
        <div className="rounded bg-cyan-50 p-2">
          <div className="text-xs font-bold text-cyan-800">{ie.latestImportTeu}</div>
          <div className="text-xs text-cyan-800/80">TEU import (mois)</div>
        </div>
        <div className="rounded bg-indigo-50 p-2">
          <div className="text-xs font-bold text-indigo-800">{ie.latestExportTeu}</div>
          <div className="text-xs text-indigo-800/80">TEU export (mois)</div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ChartWidget widget={widget} data={ie.chartData as any[]} widgetSize={widgetSize as any} />
      </div>
    </div>
  );
}
