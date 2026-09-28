/**
 * Widget « Demandes de crédit » (métier courtier).
 *
 * POURQUOI IL EST ICI ET PLUS DANS WidgetRenderer
 * -----------------------------------------------
 * WidgetRenderer déclarait 84 `useState` et 38 `useEffect` pour TOUS les widgets
 * du tableau de bord, dont 36 effets ouverts par `if (widget.id !== ...) return`.
 * Autrement dit : afficher un seul widget allouait les 84 états et déclenchait
 * les 38 effets, pour n'en utiliser qu'un. Sur un tableau de douze widgets, cela
 * se multipliait par douze.
 *
 * Ce composant possède son propre état, son propre chargement et son propre
 * rafraîchissement. Il ne coûte rien aux autres widgets, et les autres widgets
 * ne lui coûtent rien.
 *
 * Le JSX est repris À L'IDENTIQUE de WidgetRenderer (découpé par programme, pas
 * retapé) : aucun changement d'affichage n'est attendu.
 */

import React, { useState, useEffect } from 'react';
import { Plus, FileText } from 'lucide-react';
import {
  getCreditApplications,
  type CreditApplicationRow,
} from '../../../utils/enterpriseApi/courtier';
import QuickCreditApplicationForm from './QuickCreditApplicationForm';

export default function CreditApplicationsWidget() {
  const [liveCreditApps, setLiveCreditApps] = useState<CreditApplicationRow[] | null>(null);
  const [liveCreditAppsLoading, setLiveCreditAppsLoading] = useState(false);
  const [showCreditForm, setShowCreditForm] = useState(false);

  // Chargement initial. `cancelled` evite d'ecrire dans un composant demonte.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveCreditAppsLoading(true);
      try {
        const data = await getCreditApplications();
        if (!cancelled) setLiveCreditApps(data);
      } catch (e) {
        console.error('CreditApplicationsWidget getCreditApplications', e);
        if (!cancelled) setLiveCreditApps([]);
      } finally {
        if (!cancelled) setLiveCreditAppsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application. Ce widget s'y abonne
  // lui-meme ; auparavant, une branche de plus dans le `refresh` geant de
  // WidgetRenderer s'en chargeait.
  useEffect(() => {
    const refresh = () => {
      getCreditApplications().then(setLiveCreditApps).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  const credits = liveCreditApps ?? [];
  const inProgress = credits.filter((c) => c.status === 'En cours' || c.status === 'Brouillon').length;
  const approved = credits.filter((c) => c.status === 'Approuvé').length;
  const disbursed = credits.filter((c) => c.status === 'Décaissé').length;
  const refused = credits.filter((c) => c.status === 'Refusé').length;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <FileText className="h-3.5 w-3.5 text-orange-600" />
          <span>{credits.length} demandes</span>
          {inProgress > 0 && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
              {inProgress} en cours
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreditForm(true)}
          className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
        >
          <Plus className="h-3 w-3" />
          Nouvelle demande
        </button>
      </div>
      {liveCreditAppsLoading ? (
        <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
          Chargement…
        </div>
      ) : credits.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
          <div>Aucune demande de crédit</div>
          <button
            type="button"
            onClick={() => setShowCreditForm(true)}
            className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
          >
            <Plus className="h-3 w-3" />
            Créer la première demande
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-4 gap-1 text-center text-xs">
            <div className="rounded bg-blue-50 py-1"><div className="font-bold text-blue-700">{inProgress}</div><div className="text-blue-700/70">En cours</div></div>
            <div className="rounded bg-green-50 py-1"><div className="font-bold text-green-700">{approved}</div><div className="text-green-700/70">Approuvés</div></div>
            <div className="rounded bg-purple-50 py-1"><div className="font-bold text-purple-700">{disbursed}</div><div className="text-purple-700/70">Décaissés</div></div>
            <div className="rounded bg-red-50 py-1"><div className="font-bold text-red-700">{refused}</div><div className="text-red-700/70">Refusés</div></div>
          </div>
          <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-1">
            {credits.slice(0, 15).map((c) => {
              const statusColor =
                c.status === 'Décaissé' ? 'bg-purple-100 text-purple-700'
                : c.status === 'Approuvé' ? 'bg-green-100 text-green-700'
                : c.status === 'Refusé' ? 'bg-red-100 text-red-700'
                : c.status === 'Annulé' ? 'bg-gray-100 text-gray-600'
                : 'bg-blue-100 text-blue-700';
              return (
                <div key={c.id} className="rounded border border-gray-200 bg-white p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-gray-900">{c.equipment_label}</div>
                      <div className="truncate text-xs text-gray-500">
                        {c.client_name_snapshot || '—'} {c.bank_name ? `· ${c.bank_name}` : ''}
                        {c.reference ? ` · ${c.reference}` : ''}
                      </div>
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusColor}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
                    <span>
                      <span className="font-semibold text-gray-900">{Number(c.requested_amount || 0).toLocaleString('fr-FR')} MAD</span>
                      {c.duration_months ? ` · ${c.duration_months} mois` : ''}
                      {c.interest_rate ? ` · ${c.interest_rate}%` : ''}
                    </span>
                    {c.commission_amount && (
                      <span className="font-medium text-orange-700" title="Votre commission">
                        +{Number(c.commission_amount).toLocaleString('fr-FR')} MAD
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <QuickCreditApplicationForm
        open={showCreditForm}
        onClose={() => setShowCreditForm(false)}
        onCreated={() => {
          setLiveCreditAppsLoading(true);
          getCreditApplications().then(setLiveCreditApps).catch(() => {}).finally(() => setLiveCreditAppsLoading(false));
        }}
      />
    </div>
  );
}
