/**
 * Widget « transport-costs », sorti de WidgetRenderer.tsx.
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
import { getTransportCosts } from '../../../utils/enterpriseApi/transport';
import ChartWidget from './ChartWidget';
import type { Widget } from '../../../constants/dashboardTypes';

interface Props {
  widget: Widget;
  widgetSize: 'small' | 'medium' | 'large' | undefined;
}

export default function TransportCostsWidget({ widget, widgetSize }: Props) {
  const [liveTransportCosts, setLiveTransportCosts] = useState<
    Awaited<ReturnType<typeof getTransportCosts>> | null
  >(null);
  const [liveTransportCostsLoading, setLiveTransportCostsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveTransportCostsLoading(true);
      try {
        const data = await getTransportCosts();
        if (!cancelled) setLiveTransportCosts(data);
      } catch (e) {
        console.error('TransportCostsWidget getTransportCosts', e);
        if (!cancelled) setLiveTransportCosts([]);
      } finally {
        if (!cancelled) setLiveTransportCostsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getTransportCosts().then(setLiveTransportCosts).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveTransportCostsLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement des coûts…
      </div>
    );
  }
  const costs = liveTransportCosts ?? [];
  const totalCost = costs.reduce((s, c: any) => s + (c.cost || 0), 0);
  const totalTrips = costs.reduce((s, c: any) => s + (c.trips || 0), 0);
  const totalKm = costs.reduce((s, c: any) => s + (c.km || 0), 0);
  const avgPerTrip = totalTrips > 0 ? Math.round(totalCost / totalTrips) : 0;
  if (totalTrips === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <div>Aucune livraison sur les 6 derniers mois</div>
        <div className="text-xs text-gray-400 mt-1">
          Les coûts s'afficheront dès la première livraison
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className="rounded bg-gray-50 p-2">
          <div className="text-xs font-bold text-gray-900">{totalCost.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-500">Total 6 mois</div>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <div className="text-xs font-bold text-gray-900">{totalTrips}</div>
          <div className="text-xs text-gray-500">Livraisons</div>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <div className="text-xs font-bold text-gray-900">{avgPerTrip.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-500">Coût moyen / livr.</div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ChartWidget
          widget={widget}
          data={costs as any[]}
          widgetSize={widgetSize as any}
        />
      </div>
      <div className="px-1 pt-1 text-xs text-gray-400 text-right">
        Distance totale : {totalKm.toLocaleString('fr-FR')} km
        {totalKm > 0 && (
          <> · <span className="font-semibold text-gray-600">Coût moyen : {Math.round(totalCost / totalKm).toLocaleString('fr-FR')} MAD/km</span></>
        )}
      </div>
    </div>
  );
}
