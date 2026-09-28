/**
 * Widget « delivery-map », sorti de WidgetRenderer.tsx.
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
import { getDeliveryMapData } from '../../../utils/enterpriseApi/transport';
import DeliveryMap from './DeliveryMap';
import { Package } from 'lucide-react';

export default function DeliveryMapWidget() {
  const [liveDeliveryMap, setLiveDeliveryMap] = useState<
    Awaited<ReturnType<typeof getDeliveryMapData>> | null
  >(null);
  const [liveDeliveryMapLoading, setLiveDeliveryMapLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveDeliveryMapLoading(true);
      try {
        const data = await getDeliveryMapData();
        if (!cancelled) setLiveDeliveryMap(data);
      } catch (e) {
        console.error('DeliveryMapWidget getDeliveryMapData', e);
        if (!cancelled) setLiveDeliveryMap({ deliveries: [], vehicles: [] });
      } finally {
        if (!cancelled) setLiveDeliveryMapLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getDeliveryMapData().then(setLiveDeliveryMap).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveDeliveryMapLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement de la carte…
      </div>
    );
  }
  const mapData = liveDeliveryMap ?? { deliveries: [], vehicles: [] };
  if (mapData.deliveries.length === 0 && mapData.vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Package className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucune position renseignée</div>
        <div className="text-xs text-gray-400 mt-1">
          Suivi statut/ETA — position affichée si renseignée (pas de télématique temps réel)
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2 text-xs text-gray-600">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
            {mapData.vehicles.filter((v) => v.status === 'En mission').length} en mission
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            {mapData.vehicles.filter((v) => v.status === 'Disponible').length} disponibles
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            {mapData.deliveries.length} destinations
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden rounded">
        <DeliveryMap deliveries={mapData.deliveries} vehicles={mapData.vehicles} />
      </div>
    </div>
  );
}
