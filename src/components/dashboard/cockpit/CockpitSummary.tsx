import React, { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, Sparkles, Target, Loader2 } from 'lucide-react';
import { RealPipelineService } from '../../../services/realPipelineService';
import { getDashboardStats } from '../../../utils/api/dashboard';
import type { DashboardStats } from '../../../utils/api/types';
import {
  buildVendeurCockpit,
  type CockpitSummaryData,
  type CockpitSignal,
} from './buildVendeurCockpit';

const EMPTY_STATS: DashboardStats = {
  totalViews: 0,
  totalMessages: 0,
  totalOffers: 0,
  weeklyViews: 0,
  monthlyViews: 0,
  weeklyGrowth: 0,
  monthlyGrowth: 0,
};

function dotClass(tone: CockpitSignal['tone']): string {
  if (tone === 'urgent') return 'bg-red-500';
  if (tone === 'warn') return 'bg-amber-500';
  if (tone === 'good') return 'bg-emerald-500';
  return 'bg-gray-300';
}

function SignalList({ signals, emptyText }: { signals: CockpitSignal[]; emptyText: string }) {
  if (!signals.length) return <p className="text-xs text-gray-400">{emptyText}</p>;
  return (
    <ul className="space-y-1.5">
      {signals.map((s) => {
        const body = (
          <div className="flex items-start gap-2">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(s.tone)}`} />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-gray-800">{s.label}</span>
              {s.detail && <span className="block truncate text-[11px] text-gray-500">{s.detail}</span>}
            </span>
          </div>
        );
        return (
          <li key={s.id}>
            {s.href ? (
              <a href={s.href} className="block rounded px-1 py-0.5 transition-colors hover:bg-gray-50">
                {body}
              </a>
            ) : (
              <div className="px-1 py-0.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CockpitCard({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${accent}`}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function useVendeurCockpit() {
  const [data, setData] = useState<CockpitSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [leadsR, statsR] = await Promise.allSettled([
        RealPipelineService.getLeads(),
        getDashboardStats(),
      ]);
      const leads = leadsR.status === 'fulfilled' ? leadsR.value : [];
      const stats = statsR.status === 'fulfilled' ? statsR.value : EMPTY_STATS;
      if (!cancelled) {
        setData(buildVendeurCockpit(leads, stats));
        setLoading(false);
      }
    };
    void load();
    const onRefresh = () => void load();
    window.addEventListener('pipeline:refresh', onRefresh);
    window.addEventListener('focus', onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('pipeline:refresh', onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, []);

  return { data, loading };
}

function VendeurCockpit() {
  const { data, loading } = useVendeurCockpit();

  if (loading && !data) {
    return (
      <div className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-6 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
        Préparation de votre cockpit…
      </div>
    );
  }
  if (!data) return null;

  const revenue = new Intl.NumberFormat('fr-FR').format(Math.round(data.revenueValue));

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">Aujourd'hui</h2>
        <span className="text-[11px] text-gray-400">Mis à jour en temps réel · données de votre activité</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <CockpitCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          title="Revenu en vue"
          accent="text-emerald-700"
        >
          <div className="text-xl font-bold text-gray-900">
            {revenue} <span className="text-sm font-medium text-gray-500">MAD</span>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {data.revenueLabel} · {data.revenueHint}
          </p>
        </CockpitCard>

        <CockpitCard
          icon={<Target className="h-3.5 w-3.5" />}
          title="Priorités du jour"
          accent="text-orange-700"
        >
          <SignalList
            signals={data.priorities}
            emptyText="Aucune action en attente — ajoutez des prospects au pipeline."
          />
        </CockpitCard>

        <CockpitCard
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          title="Risques"
          accent="text-amber-700"
        >
          <SignalList signals={data.risks} emptyText="Aucun risque détecté." />
        </CockpitCard>

        <CockpitCard
          icon={<Sparkles className="h-3.5 w-3.5" />}
          title="Opportunités"
          accent="text-sky-700"
        >
          <SignalList
            signals={data.opportunities}
            emptyText="Aucune opportunité chaude pour l'instant."
          />
        </CockpitCard>
      </div>
    </section>
  );
}

/**
 * Cockpit décisionnel « Que dois-je faire aujourd'hui ? » en tête de dashboard.
 * Implémenté pour le vendeur (données les plus riches) ; les autres rôles
 * rendent `null` tant que leur cockpit n'est pas branché (anti-façade — pas de
 * cockpit vide). Extensible rôle par rôle.
 */
export default function CockpitSummary({ role }: { role: string }) {
  if (role === 'vendeur') return <VendeurCockpit />;
  return null;
}
