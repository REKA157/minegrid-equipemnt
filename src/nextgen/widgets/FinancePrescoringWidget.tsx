import React, { useMemo, useState } from 'react';
import { SectionCard, NumberField } from '../ui/primitives';
import { scoreApplication } from '../finance/scoreApplication';

/** Outil interactif : PRÉ-SCORER UN DOSSIER DE FINANCEMENT (logique réelle). */
export default function FinancePrescoringWidget() {
  const [trustScore, setTrustScore] = useState(70);
  const [ltv, setLtv] = useState(0.7);
  const [completeness, setCompleteness] = useState(1);
  const [tx, setTx] = useState(3);
  const [disputes, setDisputes] = useState(0);
  const [ageDays, setAgeDays] = useState(300);

  const score = useMemo(
    () => scoreApplication({
      trustScore, ltv, dossierCompleteness: completeness,
      completedTransactions: tx, disputes, accountAgeDays: ageDays,
    }),
    [trustScore, ltv, completeness, tx, disputes, ageDays],
  );
  const bandColor = { A: 'text-green-700', B: 'text-blue-700', C: 'text-amber-700', D: 'text-red-700' }[score.band];

  return (
    <SectionCard title="Pré-scorer un dossier" subtitle="Pré-tri pour les partenaires (pas une décision de crédit)." live status="available">
      <div className="space-y-2">
        <NumberField label="Score de confiance (0-100)" value={trustScore} onChange={setTrustScore} min={0} max={100} />
        <NumberField label="LTV (montant / valeur)" value={ltv} onChange={setLtv} step={0.05} min={0} max={2} />
        <NumberField label="Complétude dossier (0-1)" value={completeness} onChange={setCompleteness} step={0.1} min={0} max={1} />
        <NumberField label="Transactions complétées" value={tx} onChange={setTx} min={0} />
        <NumberField label="Litiges" value={disputes} onChange={setDisputes} min={0} />
        <NumberField label="Ancienneté (jours)" value={ageDays} onChange={setAgeDays} min={0} />
      </div>
      <div className="mt-4 rounded-lg bg-gray-50 p-4">
        <div className="flex items-baseline gap-3">
          <span className={`text-3xl font-bold ${bandColor}`}>{score.band}</span>
          <span className="text-gray-700">{score.score}/100</span>
          <span className={`text-sm ${score.eligible ? 'text-green-700' : 'text-red-700'}`}>
            {score.eligible ? 'Éligible à transmission' : 'Non éligible'}
          </span>
        </div>
        {score.reasons.length > 0 && (
          <ul className="mt-2 text-xs text-gray-500 list-disc list-inside">
            {score.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
