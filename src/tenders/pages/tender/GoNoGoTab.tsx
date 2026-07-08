/**
 * Onglet Go/No-Go : notation des 10 critères (curseurs 0–5), pré-notation
 * automatique depuis les données du dossier (scoreOpportunity), calcul du
 * score global et recommandation motivée. La décision finale est humaine,
 * réservée aux rôles admin/validateur, et tracée dans l'historique.
 */

import React, { useState } from 'react';
import { Check, Scale, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTendersStore } from '../../store/tendersStore';
import { scoreOpportunity } from '../../ai/aiService';
import { computeGoNoGo, RECOMMENDATION_LABELS } from '../../lib/scoring';
import {
  Card,
  GuideBanner,
  HelpTip,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
  SectionCard,
} from '../../components/ui';
import type { GoNoGoCriterion, Tender } from '../../types';
import { can, daysUntil, formatDate, nowIso } from '../../types';
import { toast } from '../../../utils/toast';

export default function GoNoGoTab({ tender }: { tender: Tender }) {
  const setGoNoGo = useTendersStore((s) => s.setGoNoGo);
  const setTenderStatus = useTendersStore((s) => s.setTenderStatus);
  const settings = useTendersStore((s) => s.settings);
  const [busy, setBusy] = useState(false);

  const { criteria, result, decision } = tender.goNoGo;
  const canDecide = can(settings.currentUserRole, 'decide_gonogo');
  const editable = can(settings.currentUserRole, 'edit');

  const updateCriterion = (id: string, score: number) => {
    const next = criteria.map((c) => (c.id === id ? { ...c, score } : c));
    // Recalcule en direct pour un retour immédiat.
    const res = computeGoNoGo(next, {
      daysLeft: daysUntil(tender.deadline),
      nonCompliantCount: tender.requirements.filter((r) => r.coverage === 'non_conforme').length,
    });
    setGoNoGo(tender.id, { ...tender.goNoGo, criteria: next, result: res });
  };

  const autoScore = async () => {
    setBusy(true);
    try {
      const { criteria: adjusted, result: res } = await scoreOpportunity(tender, criteria);
      setGoNoGo(
        tender.id,
        { ...tender.goNoGo, criteria: adjusted, result: res },
        'Pré-notation automatique du go/no-go',
      );
      toast.success('Pré-notation faite à partir des données du dossier. Ajustez les curseurs.');
    } finally {
      setBusy(false);
    }
  };

  const decide = (d: 'go' | 'no_go') => {
    setGoNoGo(
      tender.id,
      {
        ...tender.goNoGo,
        decision: d,
        decidedBy: settings.currentUserName,
        decidedAt: nowIso(),
      },
      d === 'go' ? 'Décision GO — l\'entreprise répond' : 'Décision NO-GO — abandon du dossier',
    );
    if (d === 'no_go') {
      setTenderStatus(tender.id, 'abandonne');
      toast.success('Décision enregistrée. Le dossier passe en « Abandonné ».');
    } else {
      setTenderStatus(tender.id, 'en_redaction');
      toast.success('GO acté. Le dossier passe en « En rédaction » : produisez les pièces.');
    }
  };

  const recommendationStyle =
    result?.recommendation === 'repondre'
      ? 'bg-green-50 border-green-300 text-green-900'
      : result?.recommendation === 'prudence'
        ? 'bg-amber-50 border-amber-300 text-amber-900'
        : 'bg-red-50 border-red-300 text-red-900';

  return (
    <div className="space-y-6">
      <GuideBanner>
        Notez chaque critère de 0 (très défavorable) à 5 (très favorable). Utilisez la{' '}
        <strong>pré-notation automatique</strong> pour partir des données réelles du dossier
        (échéance, conformité, pièces), puis ajustez selon votre connaissance du terrain.
      </GuideBanner>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Notation */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Notation des critères"
            action={
              editable ? (
                <SecondaryButton onClick={autoScore} disabled={busy}>
                  <Sparkles className="h-4 w-4" />
                  {busy ? 'Calcul…' : 'Pré-noter automatiquement'}
                </SecondaryButton>
              ) : undefined
            }
          >
            <ul className="space-y-4">
              {criteria.map((c: GoNoGoCriterion) => (
                <li key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800">
                      {c.label}
                      <HelpTip text={c.help} />
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">poids {c.weight}</span>
                      <span
                        className={`w-9 rounded-md px-1.5 py-0.5 text-center text-xs font-bold ${
                          c.score >= 4
                            ? 'bg-green-100 text-green-800'
                            : c.score >= 2
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {c.score}
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={c.score}
                    disabled={!editable}
                    onChange={(e) => updateCriterion(c.id, Number(e.target.value))}
                    className="w-full accent-primary-600"
                  />
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        {/* Résultat */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Scale className="h-5 w-5 text-primary-500" /> Score global
            </h2>
            {result ? (
              <>
                <div className="mb-2 flex items-end gap-2">
                  <span className="text-4xl font-bold text-gray-900">{result.globalScore}</span>
                  <span className="pb-1 text-sm text-gray-400">/ 100</span>
                </div>
                <ProgressBar
                  value={result.globalScore}
                  colorClass={
                    result.globalScore >= 65
                      ? 'bg-green-500'
                      : result.globalScore >= 45
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }
                />
                <div className={`mt-4 rounded-lg border px-4 py-3 text-sm font-semibold ${recommendationStyle}`}>
                  Recommandation : {RECOMMENDATION_LABELS[result.recommendation]}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Calculé le {formatDate(result.computedAt)} — la recommandation est indicative,
                  la décision vous appartient.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Ajustez un curseur ou lancez la pré-notation pour calculer le score.
              </p>
            )}
          </Card>

          {/* Décision humaine */}
          <Card className="p-5">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Décision finale</h2>
            {decision ? (
              <div
                className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                  decision === 'go' ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'
                }`}
              >
                {decision === 'go' ? '✓ GO — l\'entreprise répond' : '✗ NO-GO — dossier abandonné'}
                <div className="mt-1 text-xs font-normal">
                  Décidé par {tender.goNoGo.decidedBy} le {formatDate(tender.goNoGo.decidedAt)}
                </div>
              </div>
            ) : canDecide ? (
              <>
                <p className="mb-3 text-sm text-gray-600">
                  Actez la décision en comité. Elle sera tracée dans l'historique du dossier.
                </p>
                <div className="flex gap-2">
                  <PrimaryButton onClick={() => decide('go')} disabled={!result}>
                    <ThumbsUp className="h-4 w-4" /> GO — répondre
                  </PrimaryButton>
                  <SecondaryButton onClick={() => decide('no_go')} disabled={!result}>
                    <ThumbsDown className="h-4 w-4" /> NO-GO
                  </SecondaryButton>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Seuls les rôles Administrateur et Validateur peuvent acter la décision
                (votre rôle : {settings.currentUserRole}).
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Détail : raisons, risques, actions */}
      {result && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <SectionCard title="Raisons principales">
            <ul className="list-inside list-disc space-y-1.5 text-sm text-gray-700">
              {result.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Risques">
            <ul className="list-inside list-disc space-y-1.5 text-sm text-gray-700">
              {result.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Actions recommandées">
            <ul className="space-y-1.5 text-sm text-gray-700">
              {result.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" /> {a}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
