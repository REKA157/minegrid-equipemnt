import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertCircle, CheckCircle2, Loader2, Calculator } from 'lucide-react';
import {
  createCreditApplication,
  getBrokerClientsList,
  computeMonthlyPayment,
  type BrokerClientRow,
} from '../../../utils/enterpriseApi/courtier';

interface QuickCreditApplicationFormProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const MOROCCAN_BANKS = [
  'Attijariwafa Bank',
  'Banque Populaire',
  'BMCE Bank Of Africa',
  'BMCI',
  'CIH Bank',
  'Crédit Agricole du Maroc',
  'Crédit du Maroc',
  'Société Générale Maroc',
  'CFG Bank',
  'Bank Al Yousr',
  'Umnia Bank',
  'Autre',
];

const QuickCreditApplicationForm: React.FC<QuickCreditApplicationFormProps> = ({
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
  const [equipmentValue, setEquipmentValue] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [durationMonths, setDurationMonths] = useState('60');
  const [interestRate, setInterestRate] = useState('6.5');
  const [bankName, setBankName] = useState('Attijariwafa Bank');
  const [commissionRate, setCommissionRate] = useState('1.5');
  const [expectedDecisionDate, setExpectedDecisionDate] = useState('');
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
    // Auto expected decision date à J+15
    const d = new Date();
    d.setDate(d.getDate() + 15);
    setExpectedDecisionDate(d.toISOString().slice(0, 10));
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setClientId('');
    setClientNameSnapshot('');
    setEquipmentLabel('');
    setEquipmentValue('');
    setRequestedAmount('');
    setDownPayment('');
    setDurationMonths('60');
    setInterestRate('6.5');
    setBankName('Attijariwafa Bank');
    setCommissionRate('1.5');
    setExpectedDecisionDate('');
    setNotes('');
    setError(null);
    setSuccess(false);
  }, [open]);

  // Calcul auto requested_amount = equipment_value - down_payment
  useEffect(() => {
    const ev = Number(equipmentValue) || 0;
    const dp = Number(downPayment) || 0;
    if (ev > 0 && dp >= 0 && dp <= ev) {
      const ra = ev - dp;
      setRequestedAmount(String(ra));
    }
  }, [equipmentValue, downPayment]);

  const monthlyPayment = useMemo(
    () =>
      computeMonthlyPayment(
        Number(requestedAmount) || 0,
        Number(interestRate) || 0,
        Number(durationMonths) || 0,
      ),
    [requestedAmount, interestRate, durationMonths],
  );

  const totalInterest = useMemo(() => {
    const total = monthlyPayment * (Number(durationMonths) || 0);
    return Math.max(total - (Number(requestedAmount) || 0), 0);
  }, [monthlyPayment, durationMonths, requestedAmount]);

  const commissionPreview = useMemo(() => {
    const ra = Number(requestedAmount) || 0;
    const rate = Number(commissionRate) || 0;
    return Math.round((ra * rate) / 100);
  }, [requestedAmount, commissionRate]);

  const canSubmit = useMemo(
    () =>
      equipmentLabel.trim().length >= 3 &&
      Number(requestedAmount) > 0 &&
      Number(durationMonths) > 0 &&
      !submitting,
    [equipmentLabel, requestedAmount, durationMonths, submitting],
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
      await createCreditApplication({
        client_id: clientId || null,
        client_name_snapshot: clientNameSnapshot || null,
        equipment_label: equipmentLabel.trim(),
        equipment_value: equipmentValue ? Number(equipmentValue) : null,
        requested_amount: Number(requestedAmount),
        down_payment: downPayment ? Number(downPayment) : 0,
        duration_months: Number(durationMonths),
        interest_rate: interestRate ? Number(interestRate) : null,
        monthly_payment: monthlyPayment || null,
        bank_name: bankName || null,
        commission_rate: commissionRate ? Number(commissionRate) : 1.5,
        expected_decision_date: expectedDecisionDate || null,
        notes: notes.trim() || null,
      });
      setSuccess(true);
      onCreated?.();
      window.dispatchEvent(new CustomEvent('pipeline:refresh'));
      setTimeout(() => onClose(), 900);
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la création de la demande.');
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
          <h2 className="text-base font-semibold text-gray-900">Nouvelle demande de crédit</h2>
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
              Demande créée. Mise à jour du portefeuille…
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

              {/* Équipement */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Équipement à financer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={equipmentLabel}
                  onChange={(e) => setEquipmentLabel(e.target.value)}
                  placeholder="Ex : Pelle Caterpillar 320D"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Valeur équipement / Apport */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Prix de l'engin (MAD)</label>
                  <input
                    type="number"
                    min={0}
                    value={equipmentValue}
                    onChange={(e) => setEquipmentValue(e.target.value)}
                    placeholder="950000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Apport (MAD)</label>
                  <input
                    type="number"
                    min={0}
                    value={downPayment}
                    onChange={(e) => setDownPayment(e.target.value)}
                    placeholder="200000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Montant demandé */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Montant à financer (MAD) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  placeholder="750000"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <div className="mt-0.5 text-[10px] text-gray-500">Calculé automatiquement à partir du prix et de l'apport</div>
              </div>

              {/* Durée + Taux */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Durée (mois)</label>
                  <select
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {[24, 36, 48, 60, 72, 84, 96, 120].map((m) => (
                      <option key={m} value={m}>
                        {m} mois ({Math.round(m / 12)} ans)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Taux annuel (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    placeholder="6.5"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Calcul mensualité */}
              {monthlyPayment > 0 && (
                <div className="rounded border border-blue-200 bg-blue-50 p-3">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
                    <Calculator className="h-3 w-3" />
                    Simulation
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-base font-bold text-blue-900">{monthlyPayment.toLocaleString('fr-FR')}</div>
                      <div className="text-[10px] text-blue-700">MAD / mois</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-blue-900">{Math.round(totalInterest).toLocaleString('fr-FR')}</div>
                      <div className="text-[10px] text-blue-700">Intérêts totaux</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-orange-700">{commissionPreview.toLocaleString('fr-FR')}</div>
                      <div className="text-[10px] text-orange-700">Votre commission</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Banque + Commission */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Banque partenaire</label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {MOROCCAN_BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Commission (%)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={10}
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Date décision */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Date décision attendue</label>
                <input
                  type="date"
                  value={expectedDecisionDate}
                  onChange={(e) => setExpectedDecisionDate(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Notes / Garanties</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Ex : Nantissement engin + caution dirigeant"
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
                {submitting ? 'Création…' : 'Créer la demande'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default QuickCreditApplicationForm;
