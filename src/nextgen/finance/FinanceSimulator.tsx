import React, { useMemo, useState } from 'react';
import { monthlyPayment } from './monthlyPayment';

// Simulateur de financement HONNÊTE : calcule une mensualité indicative (calcul local,
// pas de fausse promesse). L'octroi appartient au partenaire bancaire — c'est dit
// explicitement (anti-façade).

interface FinanceSimulatorProps {
  defaultAmount?: number;
}

export default function FinanceSimulator({ defaultAmount = 100000 }: FinanceSimulatorProps) {
  const [amount, setAmount] = useState(defaultAmount);
  const [downPayment, setDownPayment] = useState(Math.round(defaultAmount * 0.2));
  const [termMonths, setTermMonths] = useState(48);
  const [rate, setRate] = useState(12);

  const result = useMemo(
    () => monthlyPayment({ amount, downPayment, annualRatePct: rate, termMonths }),
    [amount, downPayment, rate, termMonths],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 max-w-md">
      <h3 className="text-base font-semibold text-gray-900">Simulateur de financement</h3>
      <div className="mt-4 space-y-3 text-sm">
        <Field label="Montant (€)" value={amount} onChange={setAmount} />
        <Field label="Apport (€)" value={downPayment} onChange={setDownPayment} />
        <Field label="Durée (mois)" value={termMonths} onChange={setTermMonths} min={6} max={120} />
        <Field label="Taux annuel (%)" value={rate} onChange={setRate} step={0.5} min={0} max={36} />
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-gray-600 text-sm">Mensualité indicative</span>
          <span className="text-2xl font-bold text-primary-700">
            {result.monthlyPayment.toLocaleString('fr-FR')} €
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Financé {result.financed.toLocaleString('fr-FR')} € · coût total{' '}
          {result.totalCost.toLocaleString('fr-FR')} € (intérêts{' '}
          {result.totalInterest.toLocaleString('fr-FR')} €)
        </p>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Estimation indicative. L'accord et le taux définitif dépendent du partenaire
        financier. MineGrid n'octroie pas de crédit.
      </p>
    </div>
  );
}

function Field({
  label, value, onChange, min, max, step = 1,
}: {
  label: string; value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-gray-700">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-32 rounded-md border border-gray-300 px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}
