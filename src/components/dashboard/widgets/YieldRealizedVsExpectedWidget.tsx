/**
 * Widget « yield-realized-vs-expected », sorti de WidgetRenderer.tsx.
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
import { getYieldRealizedVsExpected } from '../../../utils/enterpriseApi/investisseur';
import { Target } from 'lucide-react';

export default function YieldRealizedVsExpectedWidget() {
  const [liveYieldGap, setLiveYieldGap] = useState<Awaited<ReturnType<typeof getYieldRealizedVsExpected>> | null>(null);
  const [liveYieldGapLoading, setLiveYieldGapLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveYieldGapLoading(true);
      try {
        const data = await getYieldRealizedVsExpected();
        if (!cancelled) setLiveYieldGap(data);
      } catch (e) {
        console.error('YieldRealizedVsExpectedWidget getYieldRealizedVsExpected', e);
      } finally {
        if (!cancelled) setLiveYieldGapLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (liveYieldGapLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2" />
        Chargement du rendement…
      </div>
    );
  }
  const yg = liveYieldGap;
  if (!yg || yg.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Target className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucun rendement à comparer</div>
        <div className="text-xs text-gray-400 mt-1">Renseignez le revenu attendu (loyer cible ou rendement %) et le revenu encaissé de vos actifs détenus</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className="rounded bg-gray-50 p-2">
          <div className="text-sm font-bold text-gray-900">{yg.totalExpected.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-600">Revenu attendu</div>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <div className="text-sm font-bold text-gray-900">{yg.totalRealized.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-600">Revenu réalisé</div>
        </div>
        <div className={`rounded p-2 ${yg.totalGap < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className={`text-sm font-bold ${yg.totalGap < 0 ? 'text-red-700' : 'text-green-700'}`}>{yg.totalGap >= 0 ? '+' : ''}{yg.totalGap.toLocaleString('fr-FR')} MAD</div>
          <div className={`text-xs ${yg.totalGap < 0 ? 'text-red-600' : 'text-green-700/80'}`}>Écart global ({yg.totalGapPercent >= 0 ? '+' : ''}{yg.totalGapPercent}%)</div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
        {yg.items.slice(0, 8).map((i) => (
          <div key={i.id} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${i.underperforming ? 'border-red-100 bg-red-50/40' : 'border-gray-100 bg-white'}`}>
            <div className="min-w-0">
              <div className="font-medium text-gray-800 truncate">{i.label}</div>
              <div className="text-xs text-gray-500">{i.status} · attendu {i.expectedRevenue.toLocaleString('fr-FR')} · réalisé {i.realizedRevenue.toLocaleString('fr-FR')} MAD · {i.monthsHeld} mois</div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <div className={`font-bold ${i.gap < 0 ? 'text-red-700' : 'text-green-700'}`}>{i.gap >= 0 ? '+' : ''}{i.gap.toLocaleString('fr-FR')} MAD</div>
              <div className={`text-xs ${i.gap < 0 ? 'text-red-600' : 'text-gray-500'}`}>{i.gapPercent >= 0 ? '+' : ''}{i.gapPercent}%</div>
            </div>
          </div>
        ))}
      </div>
      {yg.underperformingCount > 0 && (
        <div className="px-1 pt-1 text-xs text-red-500 text-right">{yg.underperformingCount} actif(s) sous-performant(s) · {Math.abs(yg.shortfall).toLocaleString('fr-FR')} MAD de manque à gagner</div>
      )}
    </div>
  );
}
