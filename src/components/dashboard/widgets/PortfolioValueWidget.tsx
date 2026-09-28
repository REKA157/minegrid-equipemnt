/**
 * Widget « portfolio-value », sorti de WidgetRenderer.tsx.
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
import { getPortfolioValue } from '../../../utils/enterpriseApi/investisseur';
import QuickInvestmentForm from './QuickInvestmentForm';
import { Briefcase, Plus } from 'lucide-react';

export default function PortfolioValueWidget() {
  const [livePortfolioValue, setLivePortfolioValue] = useState<
    Awaited<ReturnType<typeof getPortfolioValue>> | null
  >(null);
  const [livePortfolioValueLoading, setLivePortfolioValueLoading] = useState(false);
  const [showInvestmentForm, setShowInvestmentForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLivePortfolioValueLoading(true);
      try {
        const data = await getPortfolioValue();
        if (!cancelled) setLivePortfolioValue(data);
      } catch (e) {
        console.error('PortfolioValueWidget getPortfolioValue', e);
      } finally {
        if (!cancelled) setLivePortfolioValueLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getPortfolioValue().then(setLivePortfolioValue).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (livePortfolioValueLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement du portefeuille…
      </div>
    );
  }
  const p = livePortfolioValue;
  if (!p || p.totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Briefcase className="h-10 w-10 text-gray-300 mb-2" />
        <div>Portefeuille vide</div>
        <button
          type="button"
          onClick={() => setShowInvestmentForm(true)}
          className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
        >
          <Plus className="h-3 w-3" />
          Premier investissement
        </button>
        <QuickInvestmentForm open={showInvestmentForm} onClose={() => setShowInvestmentForm(false)} onCreated={() => {
          setLivePortfolioValueLoading(true);
          getPortfolioValue().then(setLivePortfolioValue).catch(() => {}).finally(() => setLivePortfolioValueLoading(false));
        }} />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Briefcase className="h-3.5 w-3.5 text-orange-600" />
          <span>Valeur portefeuille</span>
        </div>
        <button
          type="button"
          onClick={() => setShowInvestmentForm(true)}
          className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
        >
          <Plus className="h-3 w-3" />
          Nouvel actif
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-2">
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">
            {(p.totalMarketValue / 1000000).toFixed(2)} <span className="text-base text-gray-500">M MAD</span>
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {p.activeCount} actifs · cash flow net {p.monthlyNet.toLocaleString('fr-FR')} MAD/mois
          </div>
        </div>
        <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
          <div className={`rounded p-2 ${p.unrealizedGain >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className={`text-xs font-bold ${p.unrealizedGain >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {p.unrealizedGain >= 0 ? '+' : ''}{Math.round(p.unrealizedGain / 1000).toLocaleString('fr-FR')}k
            </div>
            <div className={`text-xs ${p.unrealizedGain >= 0 ? 'text-green-700/80' : 'text-red-700/80'}`}>
              PV latente ({p.unrealizedGainPercent}%)
            </div>
          </div>
          <div className="rounded bg-blue-50 p-2">
            <div className="text-xs font-bold text-blue-700">{Math.round(p.totalRevenue / 1000).toLocaleString('fr-FR')}k</div>
            <div className="text-xs text-blue-700/80">Revenus cumulés</div>
          </div>
        </div>
        {p.soldCount > 0 && (
          <div className={`mt-2 rounded px-2 py-1 text-xs font-medium ${p.realizedGain >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {p.soldCount} cédé{p.soldCount > 1 ? 's' : ''} · PV réalisée {p.realizedGain >= 0 ? '+' : ''}{Math.round(p.realizedGain / 1000)}k MAD
          </div>
        )}
      </div>
      <QuickInvestmentForm open={showInvestmentForm} onClose={() => setShowInvestmentForm(false)} onCreated={() => {
        setLivePortfolioValueLoading(true);
        getPortfolioValue().then(setLivePortfolioValue).catch(() => {}).finally(() => setLivePortfolioValueLoading(false));
      }} />
    </div>
  );
}
