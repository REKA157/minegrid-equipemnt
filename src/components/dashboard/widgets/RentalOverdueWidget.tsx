/**
 * Widget « rental-overdue », sorti de WidgetRenderer.tsx.
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
import { getRentalOverdue } from '../../../utils/enterpriseApi/rentals';
import { DollarSign } from 'lucide-react';

export default function RentalOverdueWidget() {
  const [liveRentalOverdue, setLiveRentalOverdue] = useState<
    Awaited<ReturnType<typeof getRentalOverdue>> | null
  >(null);
  const [liveRentalOverdueLoading, setLiveRentalOverdueLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveRentalOverdueLoading(true);
      try {
        const data = await getRentalOverdue();
        if (!cancelled) setLiveRentalOverdue(data);
      } catch (e) {
        console.error('RentalOverdueWidget getRentalOverdue', e);
      } finally {
        if (!cancelled) setLiveRentalOverdueLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (liveRentalOverdueLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Chargement des impayés…
      </div>
    );
  }
  const ovd = liveRentalOverdue;
  if (!ovd || ovd.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <DollarSign className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucun loyer impayé</div>
        <div className="text-xs text-gray-400 mt-1">Trésorerie à jour, ou renseignez vos factures de location (échéance + montant) pour suivre les retards</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className={`rounded p-2 ${ovd.totalOverdue > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className={`text-sm font-bold ${ovd.totalOverdue > 0 ? 'text-red-700' : 'text-green-700'}`}>{ovd.totalOverdue.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-600">Total impayé</div>
        </div>
        <div className="rounded bg-amber-50 p-2">
          <div className="text-sm font-bold text-amber-700">{ovd.overdueCount}</div>
          <div className="text-xs text-amber-700/80">Factures en retard</div>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <div className="text-sm font-bold text-gray-900">{ovd.maxDaysLate} j</div>
          <div className="text-xs text-gray-600">Pire retard</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className="rounded bg-amber-50/60 p-1.5">
          <div className="text-xs font-bold text-amber-700">{ovd.bucket0_30.toLocaleString('fr-FR')}</div>
          <div className="text-xs text-gray-600">0-30 j</div>
        </div>
        <div className="rounded bg-orange-50 p-1.5">
          <div className="text-xs font-bold text-orange-700">{ovd.bucket31_60.toLocaleString('fr-FR')}</div>
          <div className="text-xs text-gray-600">31-60 j</div>
        </div>
        <div className="rounded bg-red-50 p-1.5">
          <div className="text-xs font-bold text-red-700">{ovd.bucket60plus.toLocaleString('fr-FR')}</div>
          <div className="text-xs text-gray-600">60 j+</div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
        {ovd.items.slice(0, 8).map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded border border-gray-100 bg-white px-2 py-1.5 text-xs">
            <div className="min-w-0">
              <div className="font-medium text-gray-800 truncate">{i.clientName}</div>
              <div className="text-xs text-gray-500">{i.invoiceNumber}{i.dueDate ? ' · éch. ' + i.dueDate : ''}</div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <div className="font-bold text-red-700">{i.remaining.toLocaleString('fr-FR')} MAD</div>
              <div className={`text-xs ${i.bucket === '60+' ? 'text-red-600' : i.bucket === '31-60' ? 'text-orange-600' : 'text-amber-600'}`}>+{i.daysLate} j de retard</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
