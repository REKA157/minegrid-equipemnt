/**
 * Widget « bank-comparator », sorti de WidgetRenderer.tsx.
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
import { getBankComparison } from '../../../utils/enterpriseApi/courtier';
import { Landmark } from 'lucide-react';

export default function BankComparatorWidget() {
  const [liveBankComparison, setLiveBankComparison] = useState<Awaited<ReturnType<typeof getBankComparison>> | null>(null);
  const [liveBankComparisonLoading, setLiveBankComparisonLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveBankComparisonLoading(true);
      try {
        const data = await getBankComparison();
        if (!cancelled) setLiveBankComparison(data);
      } catch (e) {
        console.error('BankComparatorWidget getBankComparison', e);
      } finally {
        if (!cancelled) setLiveBankComparisonLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (liveBankComparisonLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
        Comparaison des offres bancaires…
      </div>
    );
  }
  const cmp = liveBankComparison;
  if (!cmp || cmp.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
        <Landmark className="h-10 w-10 text-gray-300 mb-2" />
        <div>Aucune banque partenaire configurée</div>
        <div className="text-xs text-gray-400 mt-1">Ajoutez vos baremes bancaires (taux, duree max, frais) dans la table bank_offers</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
        <div className="rounded bg-green-50 p-2">
          <div className="text-sm font-bold text-green-700 truncate">{cmp.bestBankName || '—'}</div>
          <div className="text-xs text-gray-600">Meilleure offre</div>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <div className="text-sm font-bold text-gray-900">{cmp.bestMonthlyPayment.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-600">Mensualite mini</div>
        </div>
        <div className={`rounded p-2 ${cmp.savingsVsWorst > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
          <div className={`text-sm font-bold ${cmp.savingsVsWorst > 0 ? 'text-green-700' : 'text-gray-900'}`}>{cmp.savingsVsWorst.toLocaleString('fr-FR')} MAD</div>
          <div className="text-xs text-gray-600">Économie vs pire</div>
        </div>
      </div>
      <div className="px-1 pb-1 text-xs text-gray-500">
        {cmp.usingRealApp
          ? <>Sur demande : <span className="font-medium text-gray-700">{cmp.refLabel || 'derniere demande'}</span> · {cmp.refAmount.toLocaleString('fr-FR')} MAD / {cmp.refDuration} mois</>
          : <>Montant de reference : {cmp.refAmount.toLocaleString('fr-FR')} MAD / {cmp.refDuration} mois (aucune demande enregistree)</>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
        {cmp.items.slice(0, 8).map((b) => (
          <div key={b.id} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${b.isBest ? 'border-green-300 bg-green-50' : b.eligible ? 'border-gray-100 bg-white' : 'border-amber-200 bg-amber-50'}`}>
            <div className="min-w-0">
              <div className="font-medium text-gray-800 truncate">
                {b.bankName}{b.isBest && <span className="ml-1 text-xs font-semibold text-green-700">• Recommandée</span>}
              </div>
              <div className="text-xs text-gray-500">Taux {b.annualRate.toLocaleString('fr-FR')}% · {b.durationMonths} mois{b.fileFees > 0 ? ' · frais ' + b.fileFees.toLocaleString('fr-FR') + ' MAD' : ''}{!b.eligible ? ' · hors criteres' : ''}</div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <div className={`font-bold ${b.isBest ? 'text-green-700' : 'text-gray-900'}`}>{b.monthlyPayment.toLocaleString('fr-FR')} MAD/mois</div>
              <div className="text-xs text-gray-500">Cout credit {b.totalCost.toLocaleString('fr-FR')} MAD</div>
            </div>
          </div>
        ))}
      </div>
      {cmp.eligibleCount < cmp.bankCount && (
        <div className="px-1 pt-1 text-xs text-amber-600 text-right">{cmp.bankCount - cmp.eligibleCount} banque(s) hors criteres (montant/duree)</div>
      )}
    </div>
  );
}
