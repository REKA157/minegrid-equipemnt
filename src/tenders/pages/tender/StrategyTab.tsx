/**
 * Onglet Stratégie de réponse : comment gagner ce marché.
 *
 * Positionnement, messages clés (win themes), différenciateurs, angle de
 * réponse par critère de notation, points de vigilance. Peut être proposée
 * automatiquement (IA mock) à partir des critères, des exigences non
 * couvertes et des forces de la Base entreprise, puis affinée à la main.
 * Elle alimente ensuite la génération du mémoire technique et la réponse
 * point par point.
 */

import React, { useState } from 'react';
import { Lightbulb, Plus, RefreshCw, Sparkles, Target, Trash2 } from 'lucide-react';
import { useTendersStore } from '../../store/tendersStore';
import { suggestStrategy, isAiConnected } from '../../ai/aiService';
import {
  EmptyState,
  GuideBanner,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  TextArea,
  TextInput,
} from '../../components/ui';
import type { ResponseStrategy, Tender } from '../../types';
import { can, formatDate, nowIso } from '../../types';
import { toast } from '../../../utils/toast';

export default function StrategyTab({ tender }: { tender: Tender }) {
  const setStrategy = useTendersStore((s) => s.setStrategy);
  const company = useTendersStore((s) => s.company);
  const settings = useTendersStore((s) => s.settings);
  const [busy, setBusy] = useState(false);

  const editable = can(settings.currentUserRole, 'edit');
  const strategy = tender.strategy;

  const propose = async () => {
    setBusy(true);
    try {
      const proposal = await suggestStrategy(tender, company);
      setStrategy(tender.id, proposal, 'Proposition de stratégie de réponse (IA)');
      toast.success('Stratégie proposée à partir des données du dossier — affinez-la.');
    } finally {
      setBusy(false);
    }
  };

  const startBlank = () => {
    const blank: ResponseStrategy = {
      positioning: '',
      winThemes: [''],
      differentiators: '',
      criteriaApproaches: tender.awardCriteria.map((c) => ({
        criterionId: c.id,
        label: c.label,
        weight: c.weight,
        approach: '',
      })),
      vigilancePoints: '',
      updatedAt: nowIso(),
    };
    setStrategy(tender.id, blank, 'Création de la stratégie de réponse');
  };

  const patch = (p: Partial<ResponseStrategy>) => {
    if (!strategy) return;
    setStrategy(tender.id, { ...strategy, ...p, updatedAt: nowIso() });
  };

  if (!strategy) {
    return (
      <div className="space-y-6">
        <GuideBanner>
          La stratégie répond à une question : <strong>comment gagner ce marché ?</strong> Elle
          fixe le positionnement, les messages clés et l'angle d'attaque pour chaque critère de
          notation. Une fois définie, elle alimente automatiquement le mémoire technique et
          oriente la réponse point par point.
        </GuideBanner>
        <EmptyState
          icon={<Target className="h-10 w-10" />}
          title="Pas encore de stratégie de réponse"
          message={
            editable
              ? 'Laissez l\'application proposer une première stratégie à partir des critères de notation, des exigences non couvertes et de vos forces (Base entreprise) — ou partez d\'une page blanche.'
              : 'Votre rôle ne permet pas de définir la stratégie (lecture seule).'
          }
          action={
            editable ? (
              <div className="flex gap-2">
                <PrimaryButton onClick={propose} disabled={busy}>
                  {busy ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Analyse…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Proposer une stratégie
                    </>
                  )}
                </PrimaryButton>
                <SecondaryButton onClick={startBlank}>Partir de zéro</SecondaryButton>
              </div>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          Dernière mise à jour : {formatDate(strategy.updatedAt)}
          {strategy.simulated && ' — proposition initiale simulée'}
        </p>
        {editable && (
          <SecondaryButton onClick={propose} disabled={busy}>
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Analyse…' : 'Régénérer une proposition'}
          </SecondaryButton>
        )}
      </div>

      <GuideBanner>
        💡 Cette stratégie est <strong>reprise automatiquement</strong> dans le mémoire
        technique (sections « Compréhension du besoin », « Gestion des risques » et « Valeur
        ajoutée ») lors de sa génération ou régénération.
      </GuideBanner>

      <SectionCard
        title="Positionnement"
        hint="En 2-3 phrases : pourquoi c'est vous que l'acheteur devrait retenir."
      >
        <TextArea
          value={strategy.positioning}
          disabled={!editable}
          rows={3}
          onChange={(e) => patch({ positioning: e.target.value })}
          placeholder="Ex. : positionner l'entreprise comme le candidat qui sécurise le délai grâce à…"
        />
      </SectionCard>

      <SectionCard
        title="Messages clés (win themes)"
        hint="3 idées maximum, répétées partout dans le dossier : mémoire, réponse point par point, courriers."
      >
        <div className="space-y-2">
          {strategy.winThemes.map((theme, i) => (
            <div key={i} className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 shrink-0 text-primary-400" />
              <TextInput
                value={theme}
                disabled={!editable}
                onChange={(e) =>
                  patch({
                    winThemes: strategy.winThemes.map((t, j) => (j === i ? e.target.value : t)),
                  })
                }
                placeholder={`Message clé ${i + 1}`}
              />
              {editable && (
                <button
                  type="button"
                  onClick={() => patch({ winThemes: strategy.winThemes.filter((_, j) => j !== i) })}
                  className="rounded p-2 text-gray-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="Supprimer le message"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {editable && strategy.winThemes.length < 5 && (
            <SecondaryButton onClick={() => patch({ winThemes: [...strategy.winThemes, ''] })}>
              <Plus className="h-4 w-4" /> Ajouter un message
            </SecondaryButton>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Angle de réponse par critère de notation"
        hint="Les critères viennent de la fiche du dossier — c'est là que la note se joue."
      >
        {strategy.criteriaApproaches.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucun critère de notation renseigné sur le dossier. Lancez l'
            <a
              href={`#appels-offres/ao/${tender.id}/dce`}
              className="font-semibold text-primary-700 underline"
            >
              analyse DCE
            </a>{' '}
            puis « Reprendre dans le dossier » pour les récupérer, et régénérez la proposition.
          </p>
        ) : (
          <div className="space-y-4">
            {strategy.criteriaApproaches.map((c, i) => (
              <div key={c.criterionId} className="rounded-xl border border-gray-100 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{c.label}</span>
                  <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">
                    {c.weight} %
                  </span>
                </div>
                <TextArea
                  value={c.approach}
                  disabled={!editable}
                  rows={2}
                  onChange={(e) =>
                    patch({
                      criteriaApproaches: strategy.criteriaApproaches.map((x, j) =>
                        j === i ? { ...x, approach: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="Comment maximiser la note sur ce critère ?"
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Différenciateurs" hint="Ce que la concurrence ne peut pas dire.">
          <TextArea
            value={strategy.differentiators}
            disabled={!editable}
            rows={4}
            onChange={(e) => patch({ differentiators: e.target.value })}
            placeholder="Parc en propre, références comparables, certifications, implantation locale…"
          />
        </SectionCard>
        <SectionCard
          title="Points de vigilance"
          hint="Risques et exigences sensibles à couvrir explicitement dans la réponse."
        >
          <TextArea
            value={strategy.vigilancePoints}
            disabled={!editable}
            rows={4}
            onChange={(e) => patch({ vigilancePoints: e.target.value })}
            placeholder="Points bloquants du RC, clauses à risque, exigences non couvertes…"
          />
        </SectionCard>
      </div>

      <p className="text-xs text-gray-500">
        Étape suivante : générez ou régénérez le{' '}
        <a href={`#appels-offres/ao/${tender.id}/memoire`} className="font-semibold text-primary-700 underline">
          mémoire technique
        </a>{' '}
        pour y intégrer cette stratégie, puis complétez la{' '}
        <a href={`#appels-offres/ao/${tender.id}/exigences`} className="font-semibold text-primary-700 underline">
          réponse point par point
        </a>.
      </p>
    </div>
  );
}
