/**
 * Widget « demurrage-tracking », sorti de WidgetRenderer.tsx.
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
import { getDemurrageExposure } from '../../../utils/enterpriseApi/transitaire';
import { Ship } from 'lucide-react';

export default function DemurrageTrackingWidget() {
  const [liveDemurrage, setLiveDemurrage] = useState<
    Awaited<ReturnType<typeof getDemurrageExposure>> | null
  >(null);
  const [liveDemurrageLoading, setLiveDemurrageLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveDemurrageLoading(true);
      try {
        const data = await getDemurrageExposure();
        if (!cancelled) setLiveDemurrage(data);
      } catch (e) {
        console.error('DemurrageTrackingWidget getDemurrageExposure', e);
      } finally {
        if (!cancelled) setLiveDemurrageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (liveDemurrageLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
        Chargement des surestaries…
      </div>
    );
  }
  const dem = liveDemurrage;
  if (!dem || dem.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Ship className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucun conteneur suivi</div>
        <div className="text-xs text-gray-400 mt-1">Renseignez date d'arrivée, franchise et tarif/jour sur vos conteneurs</div>
      </div>
    );
  }
  const overdue = dem.items.filter((i) => i.daysOver > 0 && !i.returned);
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className={`rounded p-2 ${dem.totalCost > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className={`text-sm font-bold ${dem.totalCost > 0 ? 'text-red-700' : 'text-green-700'}`}>{dem.totalCost.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-600">Exposition surestaries</div>
        </div>
        <div className="rounded bg-amber-50 p-2">
          <div className="text-sm font-bold text-amber-700">{dem.inDemurrageCount}</div>
          <div className="text-xs text-amber-700/80">En dépassement</div>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <div className="text-sm font-bold text-gray-900">{dem.maxDaysOver} j</div>
          <div className="text-xs text-gray-600">Pire dépassement</div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
        {(overdue.length ? overdue : dem.items).slice(0, 8).map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded border border-gray-100 bg-white px-2 py-1.5 text-xs">
            <div className="min-w-0">
              <div className="font-medium text-gray-800 truncate">{i.container_number}</div>
              <div className="text-xs text-gray-500">{i.status}{i.port ? ' · ' + i.port : ''} · franchise → {i.freeUntil}</div>
            </div>
            <div className="text-right shrink-0 ml-2">
              {i.daysOver > 0 ? (
                <>
                  <div className="font-bold text-red-700">+{i.daysOver} j</div>
                  <div className="text-xs text-red-600">{i.cost.toLocaleString('fr-FR')} MAD</div>
                </>
              ) : (
                <div className="text-xs text-green-700">Dans la franchise</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {dem.watchCount > 0 && (
        <div className="px-1 pt-1 text-xs text-gray-400 text-right">{dem.watchCount} conteneur(s) dans la franchise à surveiller</div>
      )}
    </div>
  );
}
