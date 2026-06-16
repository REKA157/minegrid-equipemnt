import React, { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import {
  buildRecommendations,
  type Recommendation,
} from '../../../utils/recommendations/recommendationsService';

interface AIInsightsWidgetProps {
  userId?: string;
  widgetSize?: 'small' | 'medium' | 'large';
}

const TONE_CLS: Record<string, string> = {
  urgent: 'border-red-200 bg-red-50',
  warn: 'border-amber-200 bg-amber-50',
  good: 'border-emerald-200 bg-emerald-50',
};

/**
 * RECOMMANDATIONS RÉELLES (remplace les insights IA génériques). Croise les moteurs
 * réels — Lead Convergence (opportunités) + Risk Engine (risques dossier) — pour
 * proposer des actions explicables. Chaque carte mène à une ACTION concrète. Anti-façade :
 * aucune recommandation inventée ; état vide court si rien à signaler.
 */
const AIInsightsWidget: React.FC<AIInsightsWidgetProps> = () => {
  const [recos, setRecos] = useState<Recommendation[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    buildRecommendations().then((r) => {
      if (!cancelled) {
        setRecos(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const empty = !recos || recos.length === 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-1">
        <Lightbulb className="h-4 w-4 text-orange-600" /> Recommandations — actions prioritaires
      </h3>
      <p className="text-xs text-gray-500 mb-3">Issues de vos leads et de vos dossiers (données réelles).</p>

      {loading ? (
        <p className="text-sm text-gray-500">Analyse…</p>
      ) : empty ? (
        <p className="text-sm text-gray-500">
          Aucune recommandation pour le moment — rien à signaler sur vos leads et dossiers.
        </p>
      ) : (
        <ul className="space-y-2">
          {recos!.map((r) => (
            <li key={r.id} className={`rounded-lg border p-3 ${TONE_CLS[r.tone] ?? 'border-gray-200 bg-gray-50'}`}>
              <div className="text-sm font-medium text-gray-900">{r.title}</div>
              {r.detail && <div className="text-xs text-gray-600 mt-0.5">{r.detail}</div>}
              <a href={r.href} className="mt-1 inline-block text-xs font-medium text-orange-700 hover:underline">
                → {r.action}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AIInsightsWidget;
