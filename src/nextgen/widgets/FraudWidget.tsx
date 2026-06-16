import React, { useEffect, useState } from 'react';
import { SectionCard } from '../ui/primitives';
import { loadCaseRisks, type CaseRisk } from '../../utils/risk/caseRiskService';

/**
 * Moniteur de RISQUE DOSSIER (plus un simulateur à saisie). Branché sur le Risk Engine
 * réel (computeTransactionRisk) : n'affiche QUE des risques EXPLICABLES dérivés de faits
 * (paiement en litige, fonds séquestrés sans inspection, partenaire désengagé…). Chaque
 * dossier à risque mène à une ACTION : ouvrir le dossier pour corriger. Anti-façade :
 * aucun risque inventé ; rien si aucun fait à risque.
 */
export default function FraudWidget() {
  const [risks, setRisks] = useState<CaseRisk[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCaseRisks().then((r) => {
      if (!cancelled) {
        setRisks(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const empty = !risks || risks.length === 0;

  return (
    <SectionCard
      title="Risques de dossier — alertes explicables"
      subtitle="Signaux de risque réels sur vos dossiers, avec l'action à mener."
      live
      status="available"
    >
      {loading ? (
        <p className="text-sm text-gray-500">Analyse des dossiers…</p>
      ) : empty ? (
        <p className="text-sm text-gray-500">
          Aucun risque détecté sur vos dossiers — rien à signaler (aucune alerte sans fait réel).
        </p>
      ) : (
        <ul className="space-y-3">
          {risks!.map((r) => {
            const high = r.risk.level === 'high';
            return (
              <li
                key={r.caseId}
                className={`rounded-lg border p-3 ${high ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}
              >
                <div className={`text-sm font-semibold ${high ? 'text-red-800' : 'text-amber-900'}`}>
                  {high ? '⛔' : '⚠️'} {r.title} — risque {high ? 'élevé' : 'à surveiller'} (score {r.risk.score}/100)
                </div>
                <ul className="mt-1 list-disc list-inside text-xs text-gray-700 space-y-0.5">
                  {r.risk.signals.map((s) => (
                    <li key={s.code}>{s.label}</li>
                  ))}
                </ul>
                <a
                  href={`#dossier/${r.caseId}`}
                  className="mt-2 inline-block text-xs font-medium text-orange-700 hover:underline"
                >
                  → Ouvrir le dossier pour corriger
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
