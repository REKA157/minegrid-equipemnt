/**
 * Widget « container-tracking », sorti de WidgetRenderer.tsx.
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
import { getContainerTrackingRows } from '../../../utils/enterpriseApi/transitaire';
import FreightContainerMap from './FreightContainerMap';
import { Ship } from 'lucide-react';

export default function ContainerTrackingWidget() {
  const [liveFreightContainers, setLiveFreightContainers] = useState<
    Awaited<ReturnType<typeof getContainerTrackingRows>> | null
  >(null);
  const [liveFreightContainersLoading, setLiveFreightContainersLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveFreightContainersLoading(true);
      try {
        const data = await getContainerTrackingRows();
        if (!cancelled) setLiveFreightContainers(data);
      } catch (e) {
        console.error('ContainerTrackingWidget getContainerTrackingRows', e);
        if (!cancelled) setLiveFreightContainers([]);
      } finally {
        if (!cancelled) setLiveFreightContainersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getContainerTrackingRows().then(setLiveFreightContainers).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveFreightContainersLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
        Chargement des conteneurs…
      </div>
    );
  }
  const cont = (liveFreightContainers ?? []).filter((c) => c.lat != null && c.lng != null);
  if (cont.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Ship className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucune position renseignée</div>
        <div className="text-xs text-gray-400 mt-1">Suivi statut/ETA — ajoutez lat/lng aux conteneurs (pas de télématique temps réel)</div>
      </div>
    );
  }
  const byStatus: Record<string, number> = {};
  (liveFreightContainers ?? []).forEach((c) => {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  });
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-1 pb-2 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <Ship className="h-3 w-3 text-teal-600" />
          {(liveFreightContainers ?? []).length} suivi{(liveFreightContainers ?? []).length > 1 ? 's' : ''}
        </span>
        {Object.entries(byStatus).slice(0, 3).map(([st, n]) => (
          <span key={st} className="rounded bg-gray-100 px-1.5 py-0.5">{st} : {n}</span>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden rounded border border-gray-100">
        <FreightContainerMap containers={cont} />
      </div>
    </div>
  );
}
