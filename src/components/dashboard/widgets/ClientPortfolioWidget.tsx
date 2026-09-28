/**
 * Widget « client-portfolio », sorti de WidgetRenderer.tsx.
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
import { getClientPortfolio } from '../../../utils/enterpriseApi/courtier';
import { Building2, FileText, Shield } from 'lucide-react';

export default function ClientPortfolioWidget() {
  const [liveClientPortfolio, setLiveClientPortfolio] = useState<
    Awaited<ReturnType<typeof getClientPortfolio>> | null
  >(null);
  const [liveClientPortfolioLoading, setLiveClientPortfolioLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveClientPortfolioLoading(true);
      try {
        const data = await getClientPortfolio();
        if (!cancelled) setLiveClientPortfolio(data);
      } catch (e) {
        console.error('ClientPortfolioWidget getClientPortfolio', e);
        if (!cancelled) setLiveClientPortfolio([]);
      } finally {
        if (!cancelled) setLiveClientPortfolioLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getClientPortfolio().then(setLiveClientPortfolio).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  const portfolio = liveClientPortfolio ?? [];
  if (liveClientPortfolioLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement portefeuille…
      </div>
    );
  }
  if (portfolio.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Building2 className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucun client enregistré</div>
        <div className="text-xs text-gray-400 mt-1">
          Créez vos premiers clients via l'onglet Clients
        </div>
      </div>
    );
  }
  const sortedPortfolio = [...portfolio].sort((a: any, b: any) => (b.totalCommission || 0) - (a.totalCommission || 0));
  const actifs = portfolio.filter((c: any) => c.status === 'Actif').length;
  const prospects = portfolio.filter((c: any) => c.status === 'Prospect').length;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2 text-xs text-gray-600">
        <span>
          <span className="font-medium text-gray-900">{portfolio.length}</span> clients ·{' '}
          <span className="text-green-700">{actifs} actifs</span>
          {prospects > 0 && <span className="text-blue-700"> · {prospects} prospects</span>}
        </span>
      </div>
      <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-1">
        {sortedPortfolio.slice(0, 20).map((c: any) => (
          <div key={c.id} className="rounded border border-gray-200 bg-white p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-gray-900">
                  {c.company_name || c.name}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {c.type}
                  {c.sector ? ` · ${c.sector}` : ''}
                  {c.city ? ` · ${c.city}` : ''}
                </div>
              </div>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                c.status === 'Actif' ? 'bg-green-100 text-green-700'
                : c.status === 'Prospect' ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
              }`}>
                {c.status}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
              <span className="flex items-center gap-2">
                {c.activeCredits > 0 && (
                  <span className="flex items-center gap-0.5"><FileText className="h-2.5 w-2.5 text-purple-600" />{c.activeCredits}</span>
                )}
                {c.activePolicies > 0 && (
                  <span className="flex items-center gap-0.5"><Shield className="h-2.5 w-2.5 text-blue-600" />{c.activePolicies}</span>
                )}
                {c.activeCredits === 0 && c.activePolicies === 0 && (
                  <span className="text-gray-400 italic">aucun produit</span>
                )}
              </span>
              {c.totalCommission > 0 && (
                <span className="font-medium text-orange-700" title="Total commission générée">
                  {Number(c.totalCommission).toLocaleString('fr-FR')} MAD
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
