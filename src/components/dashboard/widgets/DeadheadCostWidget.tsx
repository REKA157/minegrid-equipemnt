/**
 * Widget « deadhead-cost », sorti de WidgetRenderer.tsx.
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
import { getDeadheadCost } from '../../../utils/enterpriseApi/transport';
import { AlertTriangle, Truck } from 'lucide-react';

export default function DeadheadCostWidget() {
  const [liveDeadhead, setLiveDeadhead] = useState<Awaited<ReturnType<typeof getDeadheadCost>> | null>(null);
  const [liveDeadheadLoading, setLiveDeadheadLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveDeadheadLoading(true);
      try {
        const data = await getDeadheadCost();
        if (!cancelled) setLiveDeadhead(data);
      } catch (e) {
        console.error('DeadheadCostWidget getDeadheadCost', e);
      } finally {
        if (!cancelled) setLiveDeadheadLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (liveDeadheadLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
        Chargement des km à vide…
      </div>
    );
  }
  const dh = liveDeadhead;
  if (!dh || dh.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Truck className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucun trajet chiffré</div>
        <div className="text-xs text-gray-400 mt-1">Renseignez km en charge, km à vide et coût/km sur vos livraisons pour suivre le retour à vide</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className={`rounded p-2 ${dh.totalEmptyCost > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className={`text-sm font-bold ${dh.totalEmptyCost > 0 ? 'text-red-700' : 'text-green-700'}`}>{dh.totalEmptyCost.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-600">Coût du vide</div>
        </div>
        <div className={`rounded p-2 ${dh.globalEmptyRate > dh.threshold ? 'bg-red-50' : dh.globalEmptyRate > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
          <div className={`text-sm font-bold ${dh.globalEmptyRate > dh.threshold ? 'text-red-700' : dh.globalEmptyRate > 0 ? 'text-amber-700' : 'text-green-700'}`}>{dh.globalEmptyRate}%</div>
          <div className="text-xs text-gray-600">Taux de vide global</div>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <div className="text-sm font-bold text-gray-900">{dh.totalEmptyKm.toLocaleString('fr-FR')} km</div>
          <div className="text-xs text-gray-600">Km à vide cumulés</div>
        </div>
      </div>
      {dh.aboveThresholdCount > 0 && (
        <div className="px-1 pb-2 flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle className="h-3 w-3" />
          {dh.aboveThresholdCount} trajet(s) au-dessus de {dh.threshold}% de retour à vide
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
        {dh.items.slice(0, 8).map((i) => (
          <div key={i.id} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${i.overThreshold ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-white'}`}>
            <div className="min-w-0">
              <div className="font-medium text-gray-800 truncate">{i.label}{i.client ? ' · ' + i.client : ''}</div>
              <div className="text-xs text-gray-500">{i.status} · {i.loadedKm} km charge / {i.emptyKm} km vide{i.destination ? ' · ' + i.destination : ''}</div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <div className={`font-bold ${i.overThreshold ? 'text-red-700' : 'text-amber-700'}`}>{i.emptyRate}%</div>
              <div className={`text-xs ${i.overThreshold ? 'text-red-600' : 'text-gray-500'}`}>{i.emptyCost.toLocaleString('fr-FR')} MAD</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
