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

const PRIO_CLS: Record<string, string> = {
  urgent: 'border-red-200 bg-red-50',
  high: 'border-amber-200 bg-amber-50',
  normal: 'border-gray-200 bg-gray-50',
};
const PRIO_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-amber-100 text-amber-800',
  normal: 'bg-gray-100 text-gray-600',
};
const PRIO_LABEL: Record<string, string> = { urgent: 'Urgent', high: 'Prioritaire', normal: 'À noter' };

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
      <p className="text-xs text-gray-500 mb-3">Issues de vos annonces, devis, leads, dossiers et partenaires (données réelles).</p>

      {loading ? (
        <p className="text-sm text-gray-500">Analyse…</p>
      ) : empty ? (
        <p className="text-sm text-gray-500">
          Aucune recommandation pour le moment — rien à signaler sur vos leads et dossiers.
        </p>
      ) : (
        <ul className="space-y-2">
          {recos!.map((r) => (
            <li key={r.id} className={`rounded-lg border p-3 ${PRIO_CLS[r.priority] ?? 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-gray-900">{r.title}</div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIO_BADGE[r.priority] ?? PRIO_BADGE.normal}`}>
                  {PRIO_LABEL[r.priority] ?? r.priority}
                </span>
              </div>
              {r.reason && <div className="text-xs text-gray-600 mt-0.5">{r.reason}</div>}
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-400">Source : {r.source}</span>
                <a href={r.href} className="text-xs font-medium text-orange-700 hover:underline">
                  → {r.action}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AIInsightsWidget;
