/**
 * Widget « logistics-profitability », sorti de WidgetRenderer.tsx.
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
import { getLogisticsProfitability } from '../../../utils/enterpriseApi/logisticien';
import { Wallet } from 'lucide-react';

export default function LogisticsProfitabilityWidget() {
  const [liveLogisticsProfit, setLiveLogisticsProfit] = useState<Awaited<ReturnType<typeof getLogisticsProfitability>> | null>(null);
  const [liveLogisticsProfitLoading, setLiveLogisticsProfitLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveLogisticsProfitLoading(true);
      try {
        const data = await getLogisticsProfitability();
        if (!cancelled) setLiveLogisticsProfit(data);
      } catch (e) {
        console.error('LogisticsProfitabilityWidget getLogisticsProfitability', e);
      } finally {
        if (!cancelled) setLiveLogisticsProfitLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (liveLogisticsProfitLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
        Chargement de la rentabilité…
      </div>
    );
  }
  const prof = liveLogisticsProfit;
  if (!prof || prof.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Wallet className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucune opération chiffrée</div>
        <div className="text-xs text-gray-400 mt-1">Renseignez coût transport, coût entreposage et montant facturé sur vos routes</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className={`rounded p-2 ${prof.totalMargin >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className={`text-sm font-bold ${prof.totalMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>{prof.totalMargin.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-600">Marge globale ({prof.marginPct}%)</div>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <div className="text-sm font-bold text-gray-900">{prof.totalCost.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-600">Coût total</div>
        </div>
        <div className={`rounded p-2 ${prof.unprofitableCount > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className={`text-sm font-bold ${prof.unprofitableCount > 0 ? 'text-red-700' : 'text-green-700'}`}>{prof.unprofitableCount}</div>
          <div className="text-xs text-gray-600">Livraisons à perte</div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
        {prof.items.slice(0, 8).map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded border border-gray-100 bg-white px-2 py-1.5 text-xs">
            <div className="min-w-0">
              <div className="font-medium text-gray-800 truncate">{i.route_ref}{i.lane ? ' · ' + i.lane : ''}</div>
              <div className="text-xs text-gray-500">{i.status} · coût {i.totalCost.toLocaleString('fr-FR')} · facturé {i.revenue.toLocaleString('fr-FR')} MAD</div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <div className={`font-bold ${i.margin < 0 ? 'text-red-700' : 'text-green-700'}`}>{i.margin >= 0 ? '+' : ''}{i.margin.toLocaleString('fr-FR')} MAD</div>
              <div className={`text-xs ${i.margin < 0 ? 'text-red-600' : 'text-gray-500'}`}>{i.marginPct}%</div>
            </div>
          </div>
        ))}
      </div>
      {prof.unprofitableCount > 0 && (
        <div className="px-1 pt-1 text-xs text-red-500 text-right">{prof.unprofitableCount} livraison(s) à perte · {prof.unprofitableLoss.toLocaleString('fr-FR')} MAD</div>
      )}
    </div>
  );
}
