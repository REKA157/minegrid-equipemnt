/**
 * Widget « risk-assessment », sorti de WidgetRenderer.tsx.
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
import { getRiskAssessment } from '../../../utils/enterpriseApi/investisseur';
import ChartWidget from './ChartWidget';
import { Shield } from 'lucide-react';
import type { Widget } from '../../../constants/dashboardTypes';

interface Props {
  widget: Widget;
  widgetSize: 'small' | 'medium' | 'large' | undefined;
}

export default function RiskAssessmentWidget({ widget, widgetSize }: Props) {
  const [liveRiskAssessment, setLiveRiskAssessment] = useState<
    Awaited<ReturnType<typeof getRiskAssessment>> | null
  >(null);
  const [liveRiskAssessmentLoading, setLiveRiskAssessmentLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveRiskAssessmentLoading(true);
      try {
        const data = await getRiskAssessment();
        if (!cancelled) setLiveRiskAssessment(data);
      } catch (e) {
        console.error('RiskAssessmentWidget getRiskAssessment', e);
      } finally {
        if (!cancelled) setLiveRiskAssessmentLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getRiskAssessment().then(setLiveRiskAssessment).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveRiskAssessmentLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement de l'évaluation des risques…
      </div>
    );
  }
  const r = liveRiskAssessment;
  if (!r || r.chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Shield className="h-10 w-10 text-gray-300 mb-2" />
        <div>Pas d'évaluation de risque disponible</div>
        <div className="text-xs text-gray-400 mt-1">
          Ajoutez des investissements pour évaluer les risques
        </div>
      </div>
    );
  }
  const overallColor =
    r.overallRisk <= 3 ? 'text-green-700 bg-green-50'
    : r.overallRisk <= 6 ? 'text-orange-700 bg-orange-50'
    : 'text-red-700 bg-red-50';
  const overallLabel =
    r.overallRisk <= 3 ? 'Faible'
    : r.overallRisk <= 6 ? 'Modéré'
    : r.overallRisk <= 8 ? 'Élevé'
    : 'Critique';
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Shield className="h-3.5 w-3.5 text-orange-600" />
          <span>Risque agrégé portefeuille</span>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${overallColor}`}>
          {overallLabel} · {r.overallRisk}/10
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <ChartWidget
          widget={widget}
          data={r.chartData as any[]}
          widgetSize={widgetSize as any}
        />
      </div>
      <div className="mt-1 space-y-0.5 px-1 text-xs">
        {r.concentrations.length > 0 && r.concentrations[0].percent > 40 && (
          <div className="text-amber-700">
            ⚠ Concentration {r.concentrations[0].category} : {Math.round(r.concentrations[0].percent)}%
          </div>
        )}
        {r.financingDependencyPercent > 60 && (
          <div className="text-amber-700">
            ⚠ Charge financement : {r.financingDependencyPercent}% des revenus
          </div>
        )}
        {r.ageRiskCount > 0 && (
          <div className="text-gray-500">
            {r.ageRiskCount} actif{r.ageRiskCount > 1 ? 's' : ''} de plus de 8 ans
          </div>
        )}
        {r.lowOccupancyCount > 0 && (
          <div className="text-gray-500">
            {r.lowOccupancyCount} actif{r.lowOccupancyCount > 1 ? 's' : ''} sans revenu mensuel
          </div>
        )}
      </div>
    </div>
  );
}
