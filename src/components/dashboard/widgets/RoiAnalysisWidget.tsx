/**
 * Widget « roi-analysis », sorti de WidgetRenderer.tsx.
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
import { getRoiAnalysis } from '../../../utils/enterpriseApi/investisseur';
import ChartWidget from './ChartWidget';
import { TrendingUp } from 'lucide-react';
import type { Widget } from '../../../constants/dashboardTypes';

interface Props {
  widget: Widget;
  widgetSize: 'small' | 'medium' | 'large' | undefined;
}

export default function RoiAnalysisWidget({ widget, widgetSize }: Props) {
  const [liveRoiAnalysis, setLiveRoiAnalysis] = useState<
    Awaited<ReturnType<typeof getRoiAnalysis>> | null
  >(null);
  const [liveRoiAnalysisLoading, setLiveRoiAnalysisLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveRoiAnalysisLoading(true);
      try {
        const data = await getRoiAnalysis();
        if (!cancelled) setLiveRoiAnalysis(data);
      } catch (e) {
        console.error('RoiAnalysisWidget getRoiAnalysis', e);
      } finally {
        if (!cancelled) setLiveRoiAnalysisLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getRoiAnalysis().then(setLiveRoiAnalysis).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveRoiAnalysisLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement de l'analyse ROI…
      </div>
    );
  }
  const roi = liveRoiAnalysis;
  if (!roi || roi.investments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <TrendingUp className="h-10 w-10 text-gray-300 mb-2" />
        <div>Pas encore d'analyse ROI disponible</div>
        <div className="text-xs text-gray-400 mt-1">
          Ajoutez des investissements pour voir leur rentabilité
        </div>
      </div>
    );
  }
  const top3 = roi.investments.slice(0, 3);
  const avgRoi = roi.investments.length > 0
    ? Math.round((roi.investments.reduce((s, i) => s + i.roiAnnualized, 0) / roi.investments.length) * 10) / 10
    : 0;
  const negativeCount = roi.investments.filter((i) => i.roiAnnualized < 0).length;
  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className={`rounded p-2 ${avgRoi >= 8 ? 'bg-green-50' : avgRoi >= 4 ? 'bg-orange-50' : 'bg-red-50'}`}>
          <div className={`text-xs font-bold ${avgRoi >= 8 ? 'text-green-700' : avgRoi >= 4 ? 'text-orange-700' : 'text-red-700'}`}>
            {avgRoi}%
          </div>
          <div className="text-xs text-gray-600">ROI annualisé moyen</div>
        </div>
        <div className="rounded bg-blue-50 p-2">
          <div className="text-xs font-bold text-blue-700">{roi.investments.length}</div>
          <div className="text-xs text-blue-700/80">Actifs analysés</div>
        </div>
        <div className={`rounded p-2 ${negativeCount === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className={`text-xs font-bold ${negativeCount === 0 ? 'text-green-700' : 'text-red-700'}`}>
            {negativeCount}
          </div>
          <div className="text-xs text-gray-600">ROI négatif</div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ChartWidget
          widget={widget}
          data={roi.chartData as any[]}
          widgetSize={widgetSize as any}
        />
      </div>
      <div className="mt-1 space-y-0.5 px-1 text-xs">
        <div className="font-semibold text-gray-700">Top 3 performances :</div>
        {top3.map((i) => (
          <div key={i.id} className="flex items-center justify-between">
            <span className="truncate text-gray-600">{i.label}</span>
            <span className={`font-bold ${i.roiAnnualized >= 8 ? 'text-green-700' : 'text-orange-700'}`}>
              {i.roiAnnualized}%/an
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
