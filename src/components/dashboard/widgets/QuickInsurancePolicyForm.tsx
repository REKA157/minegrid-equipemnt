import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertCircle, CheckCircle2, Loader2, Shield } from 'lucide-react';
import {
  createInsurancePolicy,
  getBrokerClientsList,
  type BrokerClientRow,
  type PolicyType,
} from '../../../utils/enterpriseApi/courtier';

interface QuickInsurancePolicyFormProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const POLICY_TYPES: PolicyType[] = [
  'Tous risques',
  'Bris de machine',
  'Multirisques chantier',
  'Responsabilité Civile',
  'Transport marchandises',
  'Flotte automobile',
  'Multirisques professionnelle',
];

const MOROCCAN_INSURERS = [
  'AXA Assurance Maroc',
  'Wafa Assurance',
  'SAHAM Assurance',
  'AtlantaSanad',
  'RMA Assurance',
  'Allianz Maroc',
  'MCMA Assurance',
  'Mutuelle Centrale Marocaine d\'Assurances',
  'Marocaine Vie',
  'CAT (Compagnie d\'Assurance Transport)',
  'Autre',
];

const PAYMENT_FREQUENCIES = ['Mensuel', 'Trimestriel', 'Semestriel', 'Annuel'];

const QuickInsurancePolicyForm: React.FC<QuickInsurancePolicyFormProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const [clients, setClients] = useState<BrokerClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [clientId, setClientId] = useState('');
  const [clientNameSnapshot, setClientNameSnapshot] = useState('');
  const [equipmentLabel, setEquipmentLabel] = useState('');
  const [insurerName, setInsurerName] = useState('AXA Assurance Maroc');
  const [policyType, setPolicyType] = useState<PolicyType>('Tous risques');
  const [insuredValue, setInsuredValue] = useState('');
  const [annualPremium, setAnnualPremium] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState('Annuel');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [commissionRate, setCommissionRate] = useState('12');
  const [deductible, setDeductible] = useState('');
  const [autoRenewal, setAutoRenewal] = useState(true);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingClients(true);
    setError(null);
    setSuccess(false);
    (async () => {
      try {
        const c = await getBrokerClientsList();
        if (!cancelled) setClients(c || []);
      } catch {
        if (!cancelled) setError('Impossible de charger les clients.');
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setClientId('');
    setClientNameSnapshot('');
    setEquipmentLabel('');
    setInsurerName('AXA Assurance Maroc');
    setPolicyType('Tous risques');
    setInsuredValue('');
    setAnnualPremium('');
    setPaymentFrequency('Annuel');
    setStartDate(new Date().toISOString().slice(0, 10));
    setCommissionRate('12');
    setDeductible('');
    setAutoRenewal(true);
    setNotes('');
    setError(null);
    setSuccess(false);
  }, [open]);

  // Suggestion automatique de prime selon type + valeur (taux indicatifs marché marocain)
  useEffect(() => {
    const value = Number(insuredValue) || 0;
    if (!value || annualPremium) return;
    const rates: Record<PolicyType, number> = {
      'Tous risques': 0.04,
      'Bris de machine': 0.02,
      'Multirisques chantier': 0.04,
      'Responsabilité Civile': 0.01,
      'Transport marchandises': 0.005,
      'Flotte automobile': 0.05,
      'Multirisques professionnelle': 0.012,
    };
    const suggested = Math.round(value * (rates[policyType] || 0.03));
    if (suggested > 0) setAnnualPremium(String(suggested));
  }, [insuredValue, policyType, annualPremium]);

  const commissionPreview = useMemo(() => {
    const ap = Number(annualPremium) || 0;
    const rate = Number(commissionRate) || 0;
    return Math.round((ap * rate) / 100);
  }, [annualPremium, commissionRate]);

  const periodicPayment = useMemo(() => {
    const ap = Number(annualPremium) || 0;
    if (!ap) return 0;
    switch (paymentFrequency) {
      case 'Mensuel':
        return Math.round(ap / 12);
      case 'Trimestriel':
        return Math.round(ap / 4);
      case 'Semestriel':
        return Math.round(ap / 2);
      default:
        return Math.round(ap);
    }
  }, [annualPremium, paymentFrequency]);

  const endDatePreview = useMemo(() => {
    if (!startDate) return '';
    const d = new Date(startDate);
    d.setFullYear(d.getFullYear() + 1);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }, [startDate]);

  const canSubmit = useMemo(
    () =>
      insurerName.trim().length >= 2 &&
      Number(annualPremium) > 0 &&
      !!startDate &&
      !submitting,
    [insurerName, annualPremium, startDate, submitting],
  );

  const handleClientChange = (id: string) => {
    setClientId(id);
    const c = clients.find((cl) => cl.id === id);
    setClientNameSnapshot(c?.company_name || c?.name || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await createInsurancePolicy({
        client_id: clientId || null,
        client_name_snapshot: clientNameSnapshot || null,
        equipment_label: equipmentLabel.trim() || null,
        insurer_name: insurerName.trim(),
        policy_type: policyType,
        insured_value: insuredValue ? Number(insuredValue) : null,
        annual_premium: Number(annualPremium),
        payment_frequency: paymentFrequency,
        start_date: startDate,
        commission_rate: Number(commissionRate) || 12,
        deductible: deductible ? Number(deductible) : null,
        auto_renewal: autoRenewal,
        notes: notes.trim() || null,
      });
      setSuccess(true);
      onCreated?.();
      window.dispatchEvent(new CustomEvent('pipeline:refresh'));
      setTimeout(() => onClose(), 900);
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la création de la police.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Shield className="h-4 w-4 text-orange-600" />
            Nouvelle police d'assurance
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4">
          {success ? (
            <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              Police créée. Mise à jour du portefeuille…
            </div>
          ) : (
            <div className="space-y-3">
              {/* Client */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Client</label>
                <select
                  value={clientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  disabled={loadingClients}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50"
                >
                  <option value="">— Sans client (à renseigner) —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name || c.name} {c.city ? `(${c.city})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type police */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Type de police <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {POLICY_TYPES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPolicyType(p)}
                      className={`rounded border px-2 py-1.5 text-[11px] font-medium transition ${
                        policyType === p
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Équipement */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Bien assuré (optionnel pour RC)
                </label>
                <input
                  type="text"
                  value={equipmentLabel}
                  onChange={(e) => setEquipmentLabel(e.target.value)}
                  placeholder="Ex : Pelle Caterpillar 320D"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Assureur */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Compagnie d'assurance <span className="text-red-500">*</span>
                </label>
                <select
                  value={insurerName}
                  onChange={(e) => setInsurerName(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  {MOROCCAN_INSURERS.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>

              {/* Valeur assurée + Prime */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Valeur assurée (MAD)</label>
                  <input
                    type="number"
                    min={0}
                    value={insuredValue}
                    onChange={(e) => setInsuredValue(e.target.value)}
                    placeholder="950000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Prime annuelle (MAD) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={annualPremium}
                    onChange={(e) => setAnnualPremium(e.target.value)}
                    placeholder="38500"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <div className="mt-0.5 text-[10px] text-gray-500">Suggestion auto selon type</div>
                </div>
              </div>

              {/* Fréquence + Échéance */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Fréquence paiement</label>
                  <select
                    value={paymentFrequency}
                    onChange={(e) => setPaymentFrequency(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {PAYMENT_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Date d'effet <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Récap */}
              {Number(annualPremium) > 0 && (
                <div className="rounded border border-blue-200 bg-blue-50 p-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-base font-bold text-blue-900">{periodicPayment.toLocaleString('fr-FR')}</div>
                      <div className="text-[10px] text-blue-700">MAD / {paymentFrequency.toLowerCase().replace('uel', '')}</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-blue-900">{endDatePreview}</div>
                      <div className="text-[10px] text-blue-700">Échéance</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-orange-700">{commissionPreview.toLocaleString('fr-FR')}</div>
                      <div className="text-[10px] text-orange-700">Votre commission</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Commission + Franchise */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Commission (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={50}
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Franchise (MAD)</label>
                  <input
                    type="number"
                    min={0}
                    value={deductible}
                    onChange={(e) => setDeductible(e.target.value)}
                    placeholder="15000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Renouvellement auto */}
              <label className="flex cursor-pointer items-center gap-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={autoRenewal}
                  onChange={(e) => setAutoRenewal(e.target.checked)}
                  className="h-4 w-4 rounded text-orange-600 focus:ring-orange-500"
                />
                Renouvellement automatique à l'échéance
              </label>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Notes / Garanties</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Ex : Vol, incendie, vandalisme inclus"
                  className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {!success && (
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex items-center gap-1.5 rounded bg-orange-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? 'Création…' : 'Créer la police'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default QuickInsurancePolicyForm;
