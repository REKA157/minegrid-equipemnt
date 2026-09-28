/**
 * Widget « technician-workload », sorti de WidgetRenderer.tsx.
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
import { getTechniciansWorkload } from '../../../utils/enterpriseApi/technicians';
import { mapWorkloadForChart } from '../widgetRendererMappers';
import ChartWidget from './ChartWidget';
import type { Widget } from '../../../constants/dashboardTypes';

interface Props {
  widget: Widget;
  widgetSize: 'small' | 'medium' | 'large' | undefined;
}

export default function TechnicianWorkloadWidget({ widget, widgetSize }: Props) {
  const [liveWorkload, setLiveWorkload] = useState<ReturnType<typeof mapWorkloadForChart> | null>(null);
  const [liveWorkloadLoading, setLiveWorkloadLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveWorkloadLoading(true);
      try {
        const rows = await getTechniciansWorkload();
        if (!cancelled) setLiveWorkload(mapWorkloadForChart(rows));
      } catch (e) {
        console.error('TechnicianWorkloadWidget getTechniciansWorkload', e);
        if (!cancelled) setLiveWorkload([]);
      } finally {
        if (!cancelled) setLiveWorkloadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getTechniciansWorkload()
        .then((rows) => setLiveWorkload(mapWorkloadForChart(rows)))
        .catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveWorkloadLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement des techniciens…
      </div>
    );
  }
  const workloadData = liveWorkload ?? [];
  if (workloadData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <div>Aucun technicien enregistré</div>
        <div className="text-xs text-gray-400 mt-1">
          Ajoutez des techniciens dans Paramètres &gt; Équipe
        </div>
      </div>
    );
  }
  return (
    <ChartWidget
      widget={widget}
      data={workloadData as any[]}
      widgetSize={widgetSize as any}
    />
  );
}
