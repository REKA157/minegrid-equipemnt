import React, { useEffect, useState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import {
  buildRecommendations,
  type Recommendation,
} from '../../../utils/recommendations/recommendationsService';
import { aiWidgetService, type AIInsight } from '../../../services/aiWidgetService';

interface AIInsightsWidgetProps {
  userId?: string;
  widgetSize?: 'small' | 'medium' | 'large';
}

// Priorité d'un insight serveur -> classe du badge (aligné sur PRIO_BADGE).
const INSIGHT_PRIO_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-amber-100 text-amber-800',
  medium: 'bg-gray-100 text-gray-600',
  low: 'bg-gray-100 text-gray-600',
};

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
const AIInsightsWidget: React.FC<AIInsightsWidgetProps> = ({ userId }) => {
  const [recos, setRecos] = useState<Recommendation[] | null>(null);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Recommandations LOCALES (moteurs internes : opportunités + risques).
    buildRecommendations().then((r) => {
      if (!cancelled) {
        setRecos(r);
        setLoading(false);
      }
    });

    // Insights du SERVEUR IA (endpoint /ai/widgets/insights). Renvoie [] si le
    // monitor n'est pas joignable / rien à signaler -> aucune régression visuelle.
    if (userId) {
      aiWidgetService
        .getAIInsights(userId)
        .then((list) => {
          if (!cancelled) setInsights(Array.isArray(list) ? list : []);
        })
        .catch(() => {
          if (!cancelled) setInsights([]);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const empty = !recos || recos.length === 0;
  const hasInsights = insights.length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-1">
        <Lightbulb className="h-4 w-4 text-orange-600" /> Recommandations — actions prioritaires
      </h3>
      <p className="text-xs text-gray-500 mb-3">Issues de vos annonces, devis, leads, dossiers et partenaires.</p>

      {/* Insights du serveur IA (live). Affichés seulement s'il y en a. */}
      {hasInsights && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-gray-700">Insights du serveur IA</span>
          </div>
          <ul className="space-y-2">
            {insights.map((i) => (
              <li key={i.id} className="rounded-lg border border-orange-100 bg-orange-50/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900">{i.title}</div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${INSIGHT_PRIO_BADGE[i.priority] ?? INSIGHT_PRIO_BADGE.medium}`}>
                    IA
                  </span>
                </div>
                {i.description && <div className="text-xs text-gray-600 mt-0.5">{i.description}</div>}
                {i.action && <div className="text-xs font-medium text-orange-700 mt-1">→ {i.action}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Analyse…</p>
      ) : empty ? (
        !hasInsights && (
          <p className="text-sm text-gray-500">
            Aucune recommandation pour le moment — rien à signaler sur vos leads et dossiers.
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {recos!.map((r) => (
            <li key={r.id} className={`rounded-lg border p-3 ${PRIO_CLS[r.priority] ?? 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-gray-900">{r.title}</div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PRIO_BADGE[r.priority] ?? PRIO_BADGE.normal}`}>
                  {PRIO_LABEL[r.priority] ?? r.priority}
                </span>
              </div>
              {r.reason && <div className="text-xs text-gray-600 mt-0.5">{r.reason}</div>}
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400">Source : {r.source}</span>
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
