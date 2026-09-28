/**
 * Widget « interventions-today », sorti de WidgetRenderer.tsx.
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
import { getDailyInterventions } from '../../../utils/enterpriseApi/interventions';
import ChartWidget from './ChartWidget';
import QuickInterventionForm from './QuickInterventionForm';
import { Plus } from 'lucide-react';
import type { Widget } from '../../../constants/dashboardTypes';

interface Props {
  widget: Widget;
  widgetSize: 'small' | 'medium' | 'large' | undefined;
}

export default function InterventionsTodayWidget({ widget, widgetSize }: Props) {
  const [liveInterventionsToday, setLiveInterventionsToday] = useState<
    Awaited<ReturnType<typeof getDailyInterventions>> | null
  >(null);
  const [liveInterventionsTodayLoading, setLiveInterventionsTodayLoading] = useState(false);
  const [showInterventionForm, setShowInterventionForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveInterventionsTodayLoading(true);
      try {
        const rows = await getDailyInterventions();
        if (!cancelled) setLiveInterventionsToday(rows);
      } catch (e) {
        console.error('InterventionsTodayWidget getDailyInterventions', e);
        if (!cancelled) setLiveInterventionsToday([]);
      } finally {
        if (!cancelled) setLiveInterventionsTodayLoading(false);
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
      getDailyInterventions()
        .then((rows) => setLiveInterventionsToday(rows))
        .catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  const interventionsData = liveInterventionsToday ?? [];
  const totalToday = interventionsData.length;
  const urgentCount = interventionsData.filter(
    (i: any) => (i?.priority || '').toLowerCase().includes('haut') || (i?.priority || '').toLowerCase().includes('urg'),
  ).length;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="font-medium text-gray-900">{totalToday}</span>
          <span>OT planifiés</span>
          {urgentCount > 0 && (
            <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
              {urgentCount} urgent{urgentCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowInterventionForm(true)}
          className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
          title="Créer un nouvel ordre de travail"
        >
          <Plus className="h-3 w-3" />
          Nouvel OT
        </button>
      </div>
      {liveInterventionsTodayLoading ? (
        <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
          Chargement des interventions…
        </div>
      ) : interventionsData.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
          <div>Aucune intervention prévue aujourd'hui</div>
          <button
            type="button"
            onClick={() => setShowInterventionForm(true)}
            className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
          >
            <Plus className="h-3 w-3" />
            Créer le premier OT
          </button>
        </div>
      ) : (
        <ChartWidget
          widget={widget}
          data={interventionsData as any[]}
          widgetSize={widgetSize as any}
        />
      )}
      <QuickInterventionForm
        open={showInterventionForm}
        onClose={() => setShowInterventionForm(false)}
        onCreated={() => {
          setLiveInterventionsTodayLoading(true);
          getDailyInterventions()
            .then((rows) => setLiveInterventionsToday(rows))
            .catch(() => setLiveInterventionsToday([]))
            .finally(() => setLiveInterventionsTodayLoading(false));
        }}
      />
    </div>
  );
}
