/**
 * Widget « Polices d'assurance » (métier courtier).
 *
 * Sorti de WidgetRenderer pour la même raison que CreditApplicationsWidget :
 * ce fichier y déclarait l'état de tous les widgets à la fois. Ici, le widget
 * possède son état, son chargement et son rafraîchissement.
 *
 * À noter : le renouvellement d'une police émet `pipeline:refresh`, que ce même
 * composant écoute — la boucle se referme sur elle-même, sans passer par le
 * parent comme c'était le cas avant.
 *
 * Le JSX est repris À L'IDENTIQUE (découpé par programme, pas retapé).
 */

import React, { useState, useEffect } from 'react';
import { Plus, Shield, RefreshCw } from 'lucide-react';
import {
  getInsurancePolicies,
  renewInsurancePolicy,
  type InsurancePolicyRow,
} from '../../../utils/enterpriseApi/courtier';
import QuickInsurancePolicyForm from './QuickInsurancePolicyForm';

export default function InsurancePoliciesWidget() {
  const [livePolicies, setLivePolicies] = useState<InsurancePolicyRow[] | null>(null);
  const [livePoliciesLoading, setLivePoliciesLoading] = useState(false);
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [renewingPolicyId, setRenewingPolicyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLivePoliciesLoading(true);
      try {
        const data = await getInsurancePolicies();
        if (!cancelled) setLivePolicies(data);
      } catch (e) {
        console.error('InsurancePoliciesWidget getInsurancePolicies', e);
        if (!cancelled) setLivePolicies([]);
      } finally {
        if (!cancelled) setLivePoliciesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      getInsurancePolicies().then(setLivePolicies).catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  const policies = livePolicies ?? [];
  const now = Date.now();
  const expiringSoon = policies.filter((p) => {
    if (!p.end_date) return false;
    const days = (new Date(p.end_date).getTime() - now) / (1000 * 3600 * 24);
    return days > 0 && days <= 30;
  });
  const expired = policies.filter((p) => p.status === 'Expirée').length;

  const handleRenew = async (policyId: string) => {
    if (renewingPolicyId) return;
    setRenewingPolicyId(policyId);
    try {
      await renewInsurancePolicy(policyId, 1);
      window.dispatchEvent(new CustomEvent('pipeline:refresh'));
    } catch { /* toast géré */ } finally { setRenewingPolicyId(null); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Shield className="h-3.5 w-3.5 text-orange-600" />
          <span>{policies.length} polices</span>
          {expiringSoon.length > 0 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
              {expiringSoon.length} échéance &lt; 30j
            </span>
          )}
          {expired > 0 && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
              {expired} expirées
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowInsuranceForm(true)}
          className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
        >
          <Plus className="h-3 w-3" />
          Nouvelle police
        </button>
      </div>
      {livePoliciesLoading ? (
        <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
          Chargement…
        </div>
      ) : policies.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
          <Shield className="h-10 w-10 text-gray-300 mb-2" />
          <div>Aucune police d'assurance</div>
          <button
            type="button"
            onClick={() => setShowInsuranceForm(true)}
            className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
          >
            <Plus className="h-3 w-3" />
            Créer la première police
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-1">
          {policies.slice(0, 20).map((p) => {
            const days = p.end_date
              ? Math.round((new Date(p.end_date).getTime() - now) / (1000 * 3600 * 24))
              : null;
            const isExpiringSoon = days != null && days > 0 && days <= 30;
            const isExpired = p.status === 'Expirée' || (days != null && days < 0);
            const statusColor = isExpired
              ? 'bg-red-100 text-red-700'
              : isExpiringSoon
              ? 'bg-amber-100 text-amber-700'
              : p.status === 'Active' || p.status === 'En cours'
              ? 'bg-green-100 text-green-700'
              : p.status === 'Devis'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-600';
            return (
              <div key={p.id} className="rounded border border-gray-200 bg-white p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-gray-900">{p.policy_type}</span>
                      <span className="text-xs text-gray-400">— {p.insurer_name}</span>
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {p.client_name_snapshot || '—'}
                      {p.equipment_label ? ` · ${p.equipment_label}` : ''}
                      {p.policy_number ? ` · ${p.policy_number}` : ''}
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusColor}`}>
                    {isExpired ? 'Expirée' : isExpiringSoon ? `${days}j` : p.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
                  <span>
                    Prime <span className="font-semibold text-gray-900">{Number(p.annual_premium || 0).toLocaleString('fr-FR')} MAD</span>
                    {p.payment_frequency ? ` / an · ${p.payment_frequency.toLowerCase()}` : ''}
                  </span>
                  <span className="flex items-center gap-2">
                    {p.commission_amount && (
                      <span className="font-medium text-orange-700">+{Number(p.commission_amount).toLocaleString('fr-FR')} MAD</span>
                    )}
                    {(isExpiringSoon || isExpired) && (
                      <button
                        type="button"
                        onClick={() => handleRenew(p.id)}
                        disabled={renewingPolicyId === p.id}
                        className="flex items-center gap-1 rounded bg-orange-600 px-1.5 py-0.5 text-xs font-medium text-white transition hover:bg-orange-700 disabled:bg-gray-300"
                        title="Renouveler 1 an"
                      >
                        <RefreshCw className="h-2.5 w-2.5" />
                        {renewingPolicyId === p.id ? '…' : 'Renouveler'}
                      </button>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <QuickInsurancePolicyForm
        open={showInsuranceForm}
        onClose={() => setShowInsuranceForm(false)}
        onCreated={() => {
          setLivePoliciesLoading(true);
          getInsurancePolicies().then(setLivePolicies).catch(() => {}).finally(() => setLivePoliciesLoading(false));
        }}
      />
    </div>
  );
}
