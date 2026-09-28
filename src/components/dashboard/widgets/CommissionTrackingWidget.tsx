/**
 * Widget « commission-tracking », sorti de WidgetRenderer.tsx.
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
import { getCommissionTracking } from '../../../utils/enterpriseApi/courtier';
import { DollarSign, FileText, Shield } from 'lucide-react';

export default function CommissionTrackingWidget() {
  const [liveCommissions, setLiveCommissions] = useState<
    Awaited<ReturnType<typeof getCommissionTracking>> | null
  >(null);
  const [liveCommissionsLoading, setLiveCommissionsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveCommissionsLoading(true);
      try {
        const data = await getCommissionTracking();
        if (!cancelled) setLiveCommissions(data);
      } catch (e) {
        console.error('CommissionTrackingWidget getCommissionTracking', e);
        if (!cancelled) setLiveCommissions({ totalCommission: 0, creditCommission: 0, policyCommission: 0, monthCommission: 0, creditMonth: 0, policyMonth: 0, commissionDue: 0, commissionEarned: 0, creditCount: 0, policyCount: 0 });
      } finally {
        if (!cancelled) setLiveCommissionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getCommissionTracking().then(setLiveCommissions).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  if (liveCommissionsLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement des commissions…
      </div>
    );
  }
  const c = liveCommissions ?? { totalCommission: 0, creditCommission: 0, policyCommission: 0, monthCommission: 0, creditMonth: 0, policyMonth: 0, commissionDue: 0, commissionEarned: 0, creditCount: 0, policyCount: 0 };
  const policyShare = c.totalCommission > 0 ? Math.round((c.policyCommission / c.totalCommission) * 100) : 0;
  const creditShare = c.totalCommission > 0 ? Math.round((c.creditCommission / c.totalCommission) * 100) : 0;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-1 pb-2 text-xs text-gray-600">
        <DollarSign className="h-3.5 w-3.5 text-orange-600" />
        <span>Commissions cumulées</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-2">
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">{Math.round(c.totalCommission).toLocaleString('fr-FR')} <span className="text-base text-gray-500">MAD</span></div>
          <div className="mt-0.5 text-xs text-gray-500">
            {c.creditCount + c.policyCount} dossiers · {Math.round(c.monthCommission).toLocaleString('fr-FR')} MAD ce mois
          </div>
        </div>
        <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
          <div className="rounded bg-purple-50 p-2">
            <div className="flex items-center justify-center gap-1 text-purple-700">
              <FileText className="h-3 w-3" />
              <span className="text-xs font-bold">{Math.round(c.creditCommission).toLocaleString('fr-FR')}</span>
            </div>
            <div className="text-xs text-purple-700/80">Crédit ({creditShare}%)</div>
            <div className="text-xs text-purple-700/60">{c.creditCount} dossiers</div>
          </div>
          <div className="rounded bg-blue-50 p-2">
            <div className="flex items-center justify-center gap-1 text-blue-700">
              <Shield className="h-3 w-3" />
              <span className="text-xs font-bold">{Math.round(c.policyCommission).toLocaleString('fr-FR')}</span>
            </div>
            <div className="text-xs text-blue-700/80">Assurance ({policyShare}%)</div>
            <div className="text-xs text-blue-700/60">{c.policyCount} polices</div>
          </div>
        </div>
        {c.totalCommission > 0 && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-gray-100">
            <div className="flex h-full">
              <div className="bg-purple-500" style={{ width: `${creditShare}%` }} />
              <div className="bg-blue-500" style={{ width: `${policyShare}%` }} />
            </div>
          </div>
        )}
        {(c.commissionDue > 0 || c.commissionEarned > 0) && (
          <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
            <div className="rounded bg-green-50 p-2">
              <div className="text-xs font-bold text-green-700">{Math.round(c.commissionEarned).toLocaleString('fr-FR')} MAD</div>
              <div className="text-xs text-green-700/80">Encaissées (décaissé)</div>
            </div>
            <div className="rounded bg-amber-50 p-2">
              <div className="text-xs font-bold text-amber-700">{Math.round(c.commissionDue).toLocaleString('fr-FR')} MAD</div>
              <div className="text-xs text-amber-700/80">Dues — à recouvrer</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
