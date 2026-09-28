/**
 * Widget « performance-analytics », sorti de WidgetRenderer.tsx.
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
import { getPerformanceAnalytics } from '../../../utils/enterpriseApi/courtier';
import ChartWidget from './ChartWidget';
import type { Widget } from '../../../constants/dashboardTypes';

interface Props {
  widget: Widget;
  widgetSize: 'small' | 'medium' | 'large' | undefined;
}

export default function PerformanceAnalyticsWidget({ widget, widgetSize }: Props) {
  const [livePerformance, setLivePerformance] = useState<
    Awaited<ReturnType<typeof getPerformanceAnalytics>> | null
  >(null);
  const [livePerformanceLoading, setLivePerformanceLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLivePerformanceLoading(true);
      try {
        const data = await getPerformanceAnalytics();
        if (!cancelled) setLivePerformance(data);
      } catch (e) {
        console.error('PerformanceAnalyticsWidget getPerformanceAnalytics', e);
        if (!cancelled) setLivePerformance([]);
      } finally {
        if (!cancelled) setLivePerformanceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getPerformanceAnalytics().then(setLivePerformance).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (livePerformanceLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement des analytics…
      </div>
    );
  }
  const perf = livePerformance ?? [];
  const totalCredit = perf.reduce((s, p: any) => s + (p.credit || 0), 0);
  const totalAssurance = perf.reduce((s, p: any) => s + (p.assurance || 0), 0);
  const totalPerf = totalCredit + totalAssurance;
  const lastMonth = perf[perf.length - 1] as any;
  const prevMonth = perf[perf.length - 2] as any;
  const growth = prevMonth && prevMonth.total > 0
    ? Math.round(((lastMonth.total - prevMonth.total) / prevMonth.total) * 100)
    : 0;
  if (totalPerf === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <div>Aucune commission sur les 6 derniers mois</div>
        <div className="text-xs text-gray-400 mt-1">
          Les analytics s'afficheront dès la première commission générée
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className="rounded bg-purple-50 p-2">
          <div className="text-xs font-bold text-purple-700">{totalCredit.toLocaleString('fr-FR')}</div>
          <div className="text-xs text-purple-700/80">Crédit (6m)</div>
        </div>
        <div className="rounded bg-blue-50 p-2">
          <div className="text-xs font-bold text-blue-700">{totalAssurance.toLocaleString('fr-FR')}</div>
          <div className="text-xs text-blue-700/80">Assurance (6m)</div>
        </div>
        <div className={`rounded p-2 ${growth >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className={`text-xs font-bold ${growth >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {growth >= 0 ? '+' : ''}{growth}%
          </div>
          <div className={`text-xs ${growth >= 0 ? 'text-green-700/80' : 'text-red-700/80'}`}>vs mois -1</div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ChartWidget
          widget={widget}
          data={perf as any[]}
          widgetSize={widgetSize as any}
        />
      </div>
      <div className="px-1 pt-1 text-xs text-gray-400 text-right">
        Total commissions 6 mois : {totalPerf.toLocaleString('fr-FR')} MAD
      </div>
    </div>
  );
}
