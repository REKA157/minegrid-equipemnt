import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertCircle, CheckCircle2, Loader2, Target, TrendingUp } from 'lucide-react';
import {
  createOpportunity,
  computeOpportunityMetrics,
  type OpportunityRecommendation,
  type OpportunitySource,
} from '../../../utils/enterpriseApi/investisseur';

interface QuickOpportunityFormProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const CATEGORIES = [
  'Pelle hydraulique', 'Bulldozer', 'Chargeuse', 'Camion-benne',
  'Concasseur', 'Foreuse', 'Tombereau', 'Niveleuse',
  'Compacteur', 'Grue', 'Convoyeur', 'Autre engin',
];

const SOURCES: OpportunitySource[] = [
  'Annonce Minegrid', 'Marché secondaire', 'Vente directe',
  'Encan / Enchères', 'Concessionnaire', 'Reprise client', 'Autre',
];

const RECOMMENDATIONS: OpportunityRecommendation[] = ['Acheter', 'Étudier', 'Suivre', 'Passer'];

const QuickOpportunityForm: React.FC<QuickOpportunityFormProps> = ({ open, onClose, onCreated }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [equipmentLabel, setEquipmentLabel] = useState('');
  const [category, setCategory] = useState('Pelle hydraulique');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear() - 3));
  const [source, setSource] = useState<OpportunitySource>('Marché secondaire');
  const [askingPrice, setAskingPrice] = useState('');
  const [estimatedMarketValue, setEstimatedMarketValue] = useState('');
  const [acquisitionCosts, setAcquisitionCosts] = useState('');
  const [expectedMonthlyRevenue, setExpectedMonthlyRevenue] = useState('');
  const [expectedMonthlyCosts, setExpectedMonthlyCosts] = useState('');
  const [expectedHoldingYears, setExpectedHoldingYears] = useState('5');
  const [expectedResaleValue, setExpectedResaleValue] = useState('');
  const [riskScore, setRiskScore] = useState(5);
  const [riskFactors, setRiskFactors] = useState('');
  const [recommendation, setRecommendation] = useState<OpportunityRecommendation>('À étudier');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) return;
    setEquipmentLabel(''); setCategory('Pelle hydraulique'); setBrand(''); setModel('');
    setYear(String(new Date().getFullYear() - 3)); setSource('Marché secondaire');
    setAskingPrice(''); setEstimatedMarketValue(''); setAcquisitionCosts('');
    setExpectedMonthlyRevenue(''); setExpectedMonthlyCosts(''); setExpectedHoldingYears('5');
    setExpectedResaleValue(''); setRiskScore(5); setRiskFactors('');
    setRecommendation('À étudier'); setContactName(''); setContactPhone(''); setExpiryDate('');
    setNotes(''); setError(null); setSuccess(false);
  }, [open]);

  // Suggestion expiry à J+30
  useEffect(() => {
    if (open && !expiryDate) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setExpiryDate(d.toISOString().slice(0, 10));
    }
  }, [open, expiryDate]);

  const metrics = useMemo(
    () =>
      computeOpportunityMetrics({
        asking_price: Number(askingPrice) || 0,
        acquisition_costs: Number(acquisitionCosts) || 0,
        expected_monthly_revenue: Number(expectedMonthlyRevenue) || 0,
        expected_monthly_costs: Number(expectedMonthlyCosts) || 0,
        expected_holding_years: Number(expectedHoldingYears) || 5,
        expected_resale_value: Number(expectedResaleValue) || 0,
      }),
    [askingPrice, acquisitionCosts, expectedMonthlyRevenue, expectedMonthlyCosts, expectedHoldingYears, expectedResaleValue],
  );

  const negotiationMargin = useMemo(() => {
    const ask = Number(askingPrice) || 0;
    const market = Number(estimatedMarketValue) || 0;
    if (!ask || !market) return null;
    return Math.round(((market - ask) / market) * 100 * 10) / 10;
  }, [askingPrice, estimatedMarketValue]);

  // Auto-recommandation basée sur ROI + risque
  useEffect(() => {
    if (!metrics.roiAnnualPercent) return;
    if (recommendation !== 'À étudier') return; // n'override pas le choix manuel
    if (metrics.roiAnnualPercent >= 12 && riskScore <= 5) setRecommendation('Acheter');
    else if (metrics.roiAnnualPercent >= 6 && riskScore <= 7) setRecommendation('Étudier');
    else if (metrics.roiAnnualPercent < 4 || riskScore >= 8) setRecommendation('Passer');
    else setRecommendation('Suivre');
  }, [metrics.roiAnnualPercent, riskScore, recommendation]);

  const canSubmit = useMemo(
    () => equipmentLabel.trim().length >= 3 && Number(askingPrice) > 0 && !submitting,
    [equipmentLabel, askingPrice, submitting],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await createOpportunity({
        equipment_label: equipmentLabel.trim(),
        category, brand: brand.trim() || null, model: model.trim() || null,
        year: year ? Number(year) : null,
        source,
        asking_price: Number(askingPrice),
        estimated_market_value: estimatedMarketValue ? Number(estimatedMarketValue) : null,
        estimated_acquisition_costs: acquisitionCosts ? Number(acquisitionCosts) : 0,
        expected_monthly_revenue: expectedMonthlyRevenue ? Number(expectedMonthlyRevenue) : null,
        expected_monthly_costs: expectedMonthlyCosts ? Number(expectedMonthlyCosts) : 0,
        expected_holding_years: Number(expectedHoldingYears) || 5,
        expected_resale_value: expectedResaleValue ? Number(expectedResaleValue) : null,
        risk_score: riskScore,
        risk_factors: riskFactors.trim() || null,
        recommendation,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        expiry_date: expiryDate || null,
        notes: notes.trim() || null,
      });
      setSuccess(true);
      onCreated?.();
      window.dispatchEvent(new CustomEvent('pipeline:refresh'));
      setTimeout(() => onClose(), 900);
    } catch (e: any) {
      setError(e?.message || "Erreur lors de la création de l'opportunité.");
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
            <Target className="h-4 w-4 text-orange-600" />
            Nouvelle opportunité d'investissement
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4">
          {success ? (
            <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              Opportunité enregistrée. Mise à jour du pipeline…
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Désignation <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={equipmentLabel}
                  onChange={(e) => setEquipmentLabel(e.target.value)}
                  placeholder="Ex : Pelle Komatsu PC290LC"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Catégorie</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Année</label>
                  <input
                    type="number" min={1990} max={new Date().getFullYear() + 1}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Source</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value as OpportunitySource)}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {SOURCES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Marque</label>
                  <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Komatsu" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Modèle</label>
                  <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="PC290LC-11" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </div>
              </div>

              {/* Prix demandé + valeur marché estimée */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Prix demandé (MAD) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number" min={0}
                    value={askingPrice}
                    onChange={(e) => setAskingPrice(e.target.value)}
                    placeholder="980000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Valeur marché estimée (MAD)</label>
                  <input
                    type="number" min={0}
                    value={estimatedMarketValue}
                    onChange={(e) => setEstimatedMarketValue(e.target.value)}
                    placeholder="1050000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  {negotiationMargin != null && (
                    <div className={`mt-0.5 text-[10px] ${negotiationMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {negotiationMargin >= 0 ? 'Décote' : 'Surcote'} : {Math.abs(negotiationMargin)}% vs marché
                    </div>
                  )}
                </div>
              </div>

              {/* Coûts acquisition + revente prévue */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Coûts annexes (transport, MAD)</label>
                  <input
                    type="number" min={0}
                    value={acquisitionCosts}
                    onChange={(e) => setAcquisitionCosts(e.target.value)}
                    placeholder="35000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Prix revente prévu (MAD)</label>
                  <input
                    type="number" min={0}
                    value={expectedResaleValue}
                    onChange={(e) => setExpectedResaleValue(e.target.value)}
                    placeholder="520000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Revenu / Coûts mensuels + durée */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Revenu/mois (MAD)</label>
                  <input
                    type="number" min={0}
                    value={expectedMonthlyRevenue}
                    onChange={(e) => setExpectedMonthlyRevenue(e.target.value)}
                    placeholder="48000"
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Coûts/mois (MAD)</label>
                  <input
                    type="number" min={0}
                    value={expectedMonthlyCosts}
                    onChange={(e) => setExpectedMonthlyCosts(e.target.value)}
                    placeholder="12000"
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Détention (ans)</label>
                  <input
                    type="number" min={1} max={20} step="0.5"
                    value={expectedHoldingYears}
                    onChange={(e) => setExpectedHoldingYears(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Simulation ROI */}
              {metrics.roiAnnualPercent !== 0 && (
                <div className="rounded border border-blue-200 bg-blue-50 p-3">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
                    <TrendingUp className="h-3 w-3" />
                    Simulation rentabilité
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <div className={`text-base font-bold ${metrics.roiAnnualPercent >= 10 ? 'text-green-700' : metrics.roiAnnualPercent >= 5 ? 'text-orange-700' : 'text-red-700'}`}>
                        {metrics.roiAnnualPercent}%
                      </div>
                      <div className="text-[9px] text-blue-700">ROI annuel</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-blue-900">{metrics.paybackMonths || '∞'}</div>
                      <div className="text-[9px] text-blue-700">{metrics.paybackMonths ? 'Mois retour' : 'Pas rentable'}</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-blue-900">{metrics.monthlyNet.toLocaleString('fr-FR')}</div>
                      <div className="text-[9px] text-blue-700">Cash flow/mois</div>
                    </div>
                    <div>
                      <div className={`text-base font-bold ${metrics.totalGain >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {Math.round(metrics.totalGain / 1000)}k
                      </div>
                      <div className="text-[9px] text-blue-700">Gain total ({expectedHoldingYears}a)</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Risque */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Score risque ({riskScore}/10) — {riskScore <= 3 ? '🟢 Faible' : riskScore <= 6 ? '🟠 Modéré' : riskScore <= 8 ? '🔴 Élevé' : '⚠️ Critique'}
                </label>
                <input
                  type="range" min={1} max={10} value={riskScore}
                  onChange={(e) => setRiskScore(Number(e.target.value))}
                  className="w-full accent-orange-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Facteurs de risque</label>
                <textarea
                  value={riskFactors}
                  onChange={(e) => setRiskFactors(e.target.value)}
                  rows={2}
                  placeholder="Ex : Vétusté moteur, marché en baisse, pièces difficiles à trouver…"
                  className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Recommandation */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Recommandation <span className="text-[10px] font-normal text-gray-500">(suggestion auto basée sur ROI + risque)</span>
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {RECOMMENDATIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRecommendation(r)}
                      className={`rounded border px-2 py-1.5 text-xs font-medium transition ${
                        recommendation === r
                          ? r === 'Acheter' ? 'border-green-500 bg-green-50 text-green-700'
                            : r === 'Passer' ? 'border-red-500 bg-red-50 text-red-700'
                            : r === 'Étudier' ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact + Expiration */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Contact</label>
                  <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nom" className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Téléphone</label>
                  <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+212 6..." className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Expire le</label>
                  <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Ex : Inspection technique réalisée. Vendeur ouvert à -5%."
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
                {submitting ? 'Création…' : "Enregistrer l'opportunité"}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default QuickOpportunityForm;
