import React, { useMemo, useState } from 'react';
import { SectionCard, NumberField, Toggle } from '../ui/primitives';
import { computeTrustScore } from '../trust/computeTrustScore';
import type { VerificationKind } from '../trust/types';
import TrustBadge from '../trust/TrustBadge';

const KINDS: Array<{ k: VerificationKind; label: string }> = [
  { k: 'identity', label: 'Identité (15)' },
  { k: 'company_registration', label: 'RC / société (15)' },
  { k: 'tax_id', label: 'Identifiant fiscal (10)' },
  { k: 'bank_account', label: 'Compte bancaire (10)' },
  { k: 'address', label: 'Adresse (5)' },
  { k: 'machine_document', label: 'Document machine (5)' },
];

/** Outil interactif : CALCULER UN SCORE DE CONFIANCE (logique réelle). */
export default function TrustScoreWidget() {
  const [approved, setApproved] = useState<Set<VerificationKind>>(new Set(['identity', 'company_registration']));
  const [inspPassed, setInspPassed] = useState(2);
  const [inspTotal, setInspTotal] = useState(2);
  const [tx, setTx] = useState(3);
  const [disputes, setDisputes] = useState(0);
  const [ageDays, setAgeDays] = useState(200);

  const result = useMemo(
    () => computeTrustScore({
      approvedVerifications: [...approved],
      inspectionsPassed: inspPassed, inspectionsTotal: inspTotal,
      completedTransactions: tx, disputes, accountAgeDays: ageDays,
    }),
    [approved, inspPassed, inspTotal, tx, disputes, ageDays],
  );

  const toggle = (k: VerificationKind) =>
    setApproved((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <SectionCard title="Calculer un score de confiance" subtitle="Cochez les pièces et ajustez l'historique : le score se recalcule en direct." live status="available">
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Vérifications approuvées</p>
          {KINDS.map(({ k, label }) => (
            <Toggle key={k} label={label} checked={approved.has(k)} onChange={() => toggle(k)} />
          ))}
        </div>
        <div className="space-y-2">
          <NumberField label="Inspections réussies" value={inspPassed} onChange={setInspPassed} min={0} />
          <NumberField label="Inspections totales" value={inspTotal} onChange={setInspTotal} min={0} />
          <NumberField label="Transactions complétées" value={tx} onChange={setTx} min={0} />
          <NumberField label="Litiges" value={disputes} onChange={setDisputes} min={0} />
          <NumberField label="Ancienneté (jours)" value={ageDays} onChange={setAgeDays} min={0} />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between rounded-lg bg-gray-50 p-4">
        <div>
          <div className="text-3xl font-bold text-gray-900">{result.score}<span className="text-base text-gray-400">/100</span></div>
          <div className="mt-1"><TrustBadge tier={result.tier} score={result.score} /></div>
        </div>
        <div className="text-xs text-gray-500 text-right space-y-0.5">
          <div>Vérifications : {result.breakdown.verifications}</div>
          <div>Inspections : {result.breakdown.inspections}</div>
          <div>Transactions : {result.breakdown.transactions}</div>
          <div>Ancienneté : {result.breakdown.tenure}</div>
          <div>Litiges : {result.breakdown.disputes}</div>
        </div>
      </div>
    </SectionCard>
  );
}
