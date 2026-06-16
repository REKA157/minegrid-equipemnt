import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertCircle, CheckCircle2, Loader2, Briefcase } from 'lucide-react';
import {
  createInvestment,
  type FinancingType,
  type InvestmentStatus,
  type ExitStrategy,
} from '../../../utils/enterpriseApi/investisseur';

interface QuickInvestmentFormProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const CATEGORIES = [
  'Pelle hydraulique', 'Bulldozer', 'Chargeuse', 'Camion-benne',
  'Concasseur', 'Foreuse', 'Tombereau', 'Niveleuse',
  'Compacteur', 'Grue', 'Convoyeur', 'Autre engin',
];

const FINANCING_TYPES: FinancingType[] = ['Cash', 'Crédit', 'Crédit-bail', 'LOA', 'Mixte'];
const STATUSES: InvestmentStatus[] = ['Détenu', 'En location', 'En maintenance', 'En cession'];
const EXIT_STRATEGIES: ExitStrategy[] = ['Conserver', 'Revendre court terme', 'Revendre moyen terme', 'Démanteler / Pièces'];

const QuickInvestmentForm: React.FC<QuickInvestmentFormProps> = ({ open, onClose, onCreated }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [equipmentLabel, setEquipmentLabel] = useState('');
  const [category, setCategory] = useState('Pelle hydraulique');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [acquisitionPrice, setAcquisitionPrice] = useState('');
  const [financingType, setFinancingType] = useState<FinancingType>('Cash');
  const [monthlyFinancingCost, setMonthlyFinancingCost] = useState('');
  const [currentMarketValue, setCurrentMarketValue] = useState('');
  const [currentRevenueMonthly, setCurrentRevenueMonthly] = useState('');
  const [expectedLifespanYears, setExpectedLifespanYears] = useState('10');
  const [status, setStatus] = useState<InvestmentStatus>('Détenu');
  const [exitStrategy, setExitStrategy] = useState<ExitStrategy>('Conserver');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) return;
    setEquipmentLabel(''); setCategory('Pelle hydraulique'); setBrand(''); setModel('');
    setYear(String(new Date().getFullYear())); setAcquisitionDate(new Date().toISOString().slice(0, 10));
    setAcquisitionPrice(''); setFinancingType('Cash'); setMonthlyFinancingCost('');
    setCurrentMarketValue(''); setCurrentRevenueMonthly(''); setExpectedLifespanYears('10');
    setStatus('Détenu'); setExitStrategy('Conserver'); setNotes('');
    setError(null); setSuccess(false);
  }, [open]);

  // Auto current_market_value = acquisition_price si non renseigné
  useEffect(() => {
    if (!currentMarketValue && acquisitionPrice) {
      setCurrentMarketValue(acquisitionPrice);
    }
  }, [acquisitionPrice, currentMarketValue]);

  const annualNetCash = useMemo(() => {
    const rev = (Number(currentRevenueMonthly) || 0) * 12;
    const fin = (Number(monthlyFinancingCost) || 0) * 12;
    return rev - fin;
  }, [currentRevenueMonthly, monthlyFinancingCost]);

  const yieldPercent = useMemo(() => {
    const acq = Number(acquisitionPrice) || 0;
    if (!acq) return 0;
    return Math.round(((annualNetCash / acq) * 100) * 10) / 10;
  }, [annualNetCash, acquisitionPrice]);

  const canSubmit = useMemo(
    () => equipmentLabel.trim().length >= 3 && Number(acquisitionPrice) > 0 && !submitting,
    [equipmentLabel, acquisitionPrice, submitting],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await createInvestment({
        equipment_label: equipmentLabel.trim(),
        category,
        brand: brand.trim() || null,
        model: model.trim() || null,
        year: year ? Number(year) : null,
        acquisition_date: acquisitionDate,
        acquisition_price: Number(acquisitionPrice),
        financing_type: financingType,
        monthly_financing_cost: monthlyFinancingCost ? Number(monthlyFinancingCost) : 0,
        current_market_value: currentMarketValue ? Number(currentMarketValue) : Number(acquisitionPrice),
        current_revenue_monthly: currentRevenueMonthly ? Number(currentRevenueMonthly) : 0,
        expected_lifespan_years: expectedLifespanYears ? Number(expectedLifespanYears) : 10,
        status,
        exit_strategy: exitStrategy,
        notes: notes.trim() || null,
      });
      setSuccess(true);
      onCreated?.();
      window.dispatchEvent(new CustomEvent('pipeline:refresh'));
      setTimeout(() => onClose(), 900);
    } catch (e: any) {
      setError(e?.message || "Erreur lors de la création de l'investissement.");
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
            <Briefcase className="h-4 w-4 text-orange-600" />
            Nouvel investissement
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4">
          {success ? (
            <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              Investissement créé. Mise à jour du portefeuille…
            </div>
          ) : (
            <div className="space-y-3">
              {/* Désignation */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Désignation <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={equipmentLabel}
                  onChange={(e) => setEquipmentLabel(e.target.value)}
                  placeholder="Ex : Pelle Caterpillar 320D 2018"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Catégorie + Année */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Catégorie</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Année</label>
                  <input
                    type="number"
                    min={1990}
                    max={new Date().getFullYear() + 1}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Marque + Modèle */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Marque</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Caterpillar"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Modèle</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="320D"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Date acquisition + Prix */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Date acquisition</label>
                  <input
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Prix d'achat (MAD) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={acquisitionPrice}
                    onChange={(e) => setAcquisitionPrice(e.target.value)}
                    placeholder="1100000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Financement */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Financement</label>
                  <select
                    value={financingType}
                    onChange={(e) => setFinancingType(e.target.value as FinancingType)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {FINANCING_TYPES.map((f) => (<option key={f} value={f}>{f}</option>))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Mensualité financement (MAD)</label>
                  <input
                    type="number"
                    min={0}
                    value={monthlyFinancingCost}
                    onChange={(e) => setMonthlyFinancingCost(e.target.value)}
                    disabled={financingType === 'Cash'}
                    placeholder={financingType === 'Cash' ? '0' : '18500'}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-50"
                  />
                </div>
              </div>

              {/* Valeur marché + Revenu mensuel */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Valeur marché actuelle (MAD)</label>
                  <input
                    type="number"
                    min={0}
                    value={currentMarketValue}
                    onChange={(e) => setCurrentMarketValue(e.target.value)}
                    placeholder="850000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Revenu mensuel actuel (MAD)</label>
                  <input
                    type="number"
                    min={0}
                    value={currentRevenueMonthly}
                    onChange={(e) => setCurrentRevenueMonthly(e.target.value)}
                    placeholder="45000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Estimation rendement : arithmétique sur les montants SAISIS (revenu/coûts
                  déclarés). Pas un score validé — simple projection à la saisie. */}
              {acquisitionPrice && currentRevenueMonthly && (
                <div className="rounded border border-blue-200 bg-blue-50 p-2.5">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div>
                      <div className="text-base font-bold text-blue-900">{annualNetCash.toLocaleString('fr-FR')} MAD</div>
                      <div className="text-[10px] text-blue-700">Cash flow annuel net</div>
                    </div>
                    <div>
                      <div className={`text-base font-bold ${yieldPercent >= 8 ? 'text-green-700' : yieldPercent >= 4 ? 'text-orange-700' : 'text-red-700'}`}>
                        {yieldPercent}%
                      </div>
                      <div className="text-[10px] text-blue-700">Rendement annuel brut</div>
                    </div>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-blue-600/80">
                    Estimation à la saisie, calculée sur vos montants déclarés (revenu × 12 − financement × 12).
                  </p>
                </div>
              )}

              {/* Statut + Stratégie */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Statut</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as InvestmentStatus)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Stratégie de sortie</label>
                  <select
                    value={exitStrategy}
                    onChange={(e) => setExitStrategy(e.target.value as ExitStrategy)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {EXIT_STRATEGIES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Ex : Acquis lot complet avec garantie 2 ans"
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
              <button type="button" onClick={onClose} disabled={submitting} className="rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                Annuler
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex items-center gap-1.5 rounded bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? 'Création…' : 'Ajouter au portefeuille'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default QuickInvestmentForm;
