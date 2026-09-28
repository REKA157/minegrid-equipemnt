/**
 * Widget « customs-clearance », sorti de WidgetRenderer.tsx.
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
import { getCustomsClearanceMetrics } from '../../../utils/enterpriseApi/transitaire';
import { Anchor } from 'lucide-react';

export default function CustomsClearanceWidget() {
  const [liveCustomsMetrics, setLiveCustomsMetrics] = useState<
    Awaited<ReturnType<typeof getCustomsClearanceMetrics>> | null
  >(null);
  const [liveCustomsMetricsLoading, setLiveCustomsMetricsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveCustomsMetricsLoading(true);
      try {
        const data = await getCustomsClearanceMetrics();
        if (!cancelled) setLiveCustomsMetrics(data);
      } catch (e) {
        console.error('CustomsClearanceWidget getCustomsClearanceMetrics', e);
      } finally {
        if (!cancelled) setLiveCustomsMetricsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getCustomsClearanceMetrics().then(setLiveCustomsMetrics).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveCustomsMetricsLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement des déclarations…
      </div>
    );
  }
  const c = liveCustomsMetrics ?? { openCount: 0, inProgress: 0, blocked: 0, delayed: 0, totalValueOpen: 0, totalDeclarations: 0, liquidated: 0 };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-1 pb-2 text-xs text-gray-600">
        <Anchor className="h-3.5 w-3.5 text-teal-600" />
        <span>Déclarations douanières actives</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-2">
        <div className="text-center">
          <div className="text-4xl font-bold text-gray-900">{c.openCount}</div>
          <div className="mt-0.5 text-xs text-gray-500">
            dossiers ouverts · {c.totalDeclarations} dossiers au total
          </div>
        </div>
        <div className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
          <div className="rounded bg-blue-50 p-2">
            <div className="text-xs font-bold text-blue-800">{c.inProgress}</div>
            <div className="text-xs text-blue-700/80">En cours</div>
          </div>
          <div className="rounded bg-amber-50 p-2">
            <div className="text-xs font-bold text-amber-800">{c.blocked}</div>
            <div className="text-xs text-amber-800/80">Bloqués</div>
          </div>
          <div className="rounded bg-red-50 p-2">
            <div className="text-xs font-bold text-red-800">{c.delayed}</div>
            <div className="text-xs text-red-800/80">En retard</div>
          </div>
        </div>
        {c.totalValueOpen > 0 && (
          <div className="mt-3 w-full rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-center text-xs text-gray-700">
            Valeur déclarée (ouverts) : <strong>{c.totalValueOpen.toLocaleString('fr-FR')} MAD</strong>
          </div>
        )}
        <div className="mt-1 text-xs text-gray-400">{c.liquidated} liquidée{c.liquidated > 1 ? 's' : ''}</div>
      </div>
    </div>
  );
}
