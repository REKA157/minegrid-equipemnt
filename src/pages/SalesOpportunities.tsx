import React, { useEffect, useState } from 'react';
import { Radar, TrendingUp, MapPin, CalendarClock, Boxes, ArrowRight } from 'lucide-react';
import {
  loadSellerOpportunities,
  type SellerOpportunitiesResult,
} from '../services/sellerOpportunities';
import { prospectKindLabel } from '../utils/monitorProspectMatch';
import type { SalesOpportunity } from '../utils/salesOpportunities';

function scoreClasses(score: number): string {
  if (score >= 70) return 'bg-green-100 text-green-800';
  if (score >= 40) return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-700';
}

function formatUsd(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Md USD`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} M USD`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} k USD`;
  return `${Math.round(n)} USD`;
}

function deadlineText(days: number | null): string {
  if (days == null) return 'Échéance non précisée';
  if (days < 0) return 'Échéance passée';
  if (days === 0) return "Échéance aujourd'hui";
  return `Échéance dans ${days} j`;
}

function OpportunityCard({ o }: { o: SalesOpportunity }) {
  const kindLabel = prospectKindLabel(o.kind);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{o.project.title || 'Marché sans titre'}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {o.project.country && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{o.project.country}</span>
            )}
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{deadlineText(o.daysToDeadline)}</span>
            {o.budgetUsd != null && (
              <span className="inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />~{formatUsd(o.budgetUsd)}</span>
            )}
            {kindLabel && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px]">{kindLabel}</span>}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${scoreClasses(o.score)}`}>
          {o.score}/100
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-gray-700">
        <Boxes className="h-4 w-4 text-orange-600" />
        <span>Vous couvrez <span className="font-semibold">{o.match.needsCovered}/{o.match.needsTotal}</span> besoin(s) de ce marché</span>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        <span className="font-medium text-gray-800">Action : </span>{o.angle.nextAction}
      </p>

      {o.scoreReasons.length > 0 && (
        <p className="mt-1 text-xs text-gray-400">{o.scoreReasons.join(' · ')}</p>
      )}

      <div className="mt-3">
        <a
          href="#global-monitor"
          className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-800"
        >
          Ouvrir dans le Global Monitor (contact, documents) <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <Radar className="mx-auto h-10 w-10 text-gray-300" />
      <p className="mt-3 font-medium text-gray-700">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{hint}</p>
    </div>
  );
}

const SalesOpportunities: React.FC = () => {
  const [result, setResult] = useState<SellerOpportunitiesResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = React.useCallback(() => {
    let cancelled = false;
    setLoading(true);
    loadSellerOpportunities({ limit: 12 })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-lg bg-orange-600 flex items-center justify-center">
            <Radar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Opportunités de vente</h1>
            <p className="text-sm text-gray-500">
              Les appels d'offres ouverts qui correspondent à votre stock, classés par potentiel.
            </p>
          </div>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Analyse de votre stock face aux marchés ouverts…
            </div>
          ) : result?.status === 'no_stock' ? (
            <EmptyState
              title="Aucune machine dans votre stock"
              hint="Publiez des annonces : le moteur croisera automatiquement votre matériel avec les marchés publics ouverts."
            />
          ) : result?.status === 'monitor_offline' ? (
            <EmptyState
              title="Radar d'appels d'offres indisponible"
              hint="Le service Global Monitor n'est pas connecté sur cet environnement. Une fois déployé, vos opportunités apparaîtront ici — aucune donnée n'est inventée en attendant."
            />
          ) : result?.status === 'empty' ? (
            <EmptyState
              title="Aucun marché ouvert ne correspond à votre stock pour l'instant"
              hint={`${result.scanned} marché(s) analysé(s). Ajoutez des catégories à votre stock ou revenez plus tard — les AO sont rafraîchis en continu.`}
            />
          ) : result?.status === 'ok' ? (
            <>
              <p className="text-xs text-gray-500 mb-3">
                {result.opportunities.length} opportunité(s) · {result.scanned} marché(s) analysé(s) ·
                stock : {result.stockCount} référence(s)
              </p>
              <div className="space-y-3">
                {result.opportunities.map((o) => (
                  <OpportunityCard key={o.project.id} o={o} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SalesOpportunities;
