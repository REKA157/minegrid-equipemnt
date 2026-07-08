/**
 * Onglet Analyse DCE : import des documents (PDF/Word/Excel/ZIP), analyse
 * (mock IA tant qu'aucune API n'est branchée), restitution structurée
 * (documents détectés, clauses, dates, pièces, critères, risques, points
 * bloquants) et reprise des résultats dans le dossier en un clic.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  AlertOctagon,
  CalendarDays,
  FileSearch,
  FileText,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import { useTendersStore } from '../../store/tendersStore';
import { analyzeTender, isAiConnected } from '../../ai/aiService';
import { deriveRequirementsFromAnalysis, normalizeKey } from '../../lib/requirements';
import {
  Card,
  EmptyState,
  GuideBanner,
  PrimaryButton,
  SectionCard,
} from '../../components/ui';
import type { ResponseStrategy, Tender } from '../../types';
import { can, formatDate, nowIso, uid } from '../../types';
import { toast } from '../../../utils/toast';

const RISK_STYLES: Record<string, string> = {
  faible: 'bg-green-100 text-green-800',
  moyen: 'bg-amber-100 text-amber-800',
  eleve: 'bg-red-100 text-red-700',
};

export default function DceAnalysisTab({ tender }: { tender: Tender }) {
  const setDceAnalysis = useTendersStore((s) => s.setDceAnalysis);
  const updateTender = useTendersStore((s) => s.updateTender);
  const role = useTendersStore((s) => s.settings.currentUserRole);
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const analysis = tender.dceAnalysis;
  const editable = can(role, 'edit');

  const onFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const accepted = Array.from(list).filter((f) =>
      /\.(pdf|docx?|xlsx?|zip)$/i.test(f.name),
    );
    if (accepted.length === 0) {
      toast.error('Formats acceptés : PDF, Word, Excel, ZIP.');
      return;
    }
    setFiles((prev) => [...prev, ...accepted]);
  }, []);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await analyzeTender({
        files: files.map((f) => ({ name: f.name, size: f.size })),
        sector: tender.sector,
        title: tender.title,
      });
      setDceAnalysis(tender.id, result);
      toast.success('Analyse terminée. Passez en revue les points bloquants.');
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * Reprend TOUT dans le dossier : critères de notation, pièces exigées et
   * référentiel d'exigences (matrice de conformité) dérivé de l'analyse.
   * La stratégie de réponse, si elle existe, est resynchronisée sur les
   * nouveaux critères (les angles rédigés sont conservés par libellé).
   */
  const adoptResults = () => {
    if (!analysis) return;
    const existingLabels = new Set(
      tender.requiredDocuments.map((d) => normalizeKey(d.label)),
    );
    const newDocs = analysis.requiredDocuments
      .filter((d) => !existingLabels.has(normalizeKey(d.label)))
      .map((d) => ({
        id: uid('rd'),
        label: d.label,
        category: d.category,
        available: false,
      }));
    const newRequirements = deriveRequirementsFromAnalysis(analysis, tender.requirements);

    // Resynchronise la stratégie : nouveaux criterionId/label/weight, en
    // conservant les textes « approach » déjà rédigés (match par libellé).
    let strategy: ResponseStrategy | undefined = tender.strategy;
    if (strategy) {
      const oldApproaches = strategy.criteriaApproaches;
      strategy = {
        ...strategy,
        criteriaApproaches: analysis.awardCriteria.map((c) => {
          const match = oldApproaches.find(
            (a) =>
              normalizeKey(a.label) === normalizeKey(c.label) ||
              normalizeKey(a.label).includes(normalizeKey(c.label)) ||
              normalizeKey(c.label).includes(normalizeKey(a.label)),
          );
          return {
            criterionId: c.id,
            label: c.label,
            weight: c.weight,
            approach: match?.approach ?? '',
          };
        }),
        updatedAt: nowIso(),
      };
    }

    updateTender(
      tender.id,
      {
        awardCriteria: analysis.awardCriteria,
        requiredDocuments: [...tender.requiredDocuments, ...newDocs],
        requirements: [...tender.requirements, ...newRequirements],
        ...(strategy ? { strategy } : {}),
      },
      `Analyse DCE reprise : ${newRequirements.length} exigence(s), ${newDocs.length} pièce(s), critères mis à jour`,
    );
    toast.success(
      `${newRequirements.length} exigence(s) et ${newDocs.length} pièce(s) ajoutées. Prochaine étape : l'onglet Exigences.`,
    );
  };

  return (
    <div className="space-y-6">
      {!isAiConnected() && (
        <GuideBanner>
          Mode simulation : l'analyse produit un résultat réaliste sans lire réellement vos
          fichiers. Branchez une API IA dans <a href="#appels-offres/parametres" className="font-semibold underline">Paramètres</a> pour
          activer l'analyse réelle — les écrans resteront identiques.
        </GuideBanner>
      )}

      {!editable && (
        <GuideBanner>
          Votre rôle ({role}) est en lecture seule : vous pouvez consulter les résultats de
          l'analyse mais pas lancer d'analyse ni modifier le dossier.
        </GuideBanner>
      )}

      {/* Zone d'import — réservée aux rôles pouvant modifier le dossier */}
      {editable && (
      <SectionCard
        title="1. Importer le DCE"
        hint="Déposez les documents de la consultation : PDF, Word, Excel ou ZIP complet."
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
          }`}
        >
          <UploadCloud className="mb-2 h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">
            Glissez-déposez vos fichiers ici, ou cliquez pour parcourir
          </p>
          <p className="mt-1 text-xs text-gray-400">PDF, DOC(X), XLS(X), ZIP — plusieurs fichiers possibles</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}_${i}`}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2 truncate text-gray-700">
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  {f.name}
                  <span className="text-xs text-gray-400">({Math.round(f.size / 1024)} Ko)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center gap-3">
          <PrimaryButton onClick={runAnalysis} disabled={analyzing}>
            {analyzing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Analyse en cours…
              </>
            ) : (
              <>
                <FileSearch className="h-4 w-4" /> {analysis ? 'Relancer l\'analyse' : 'Analyser le DCE'}
              </>
            )}
          </PrimaryButton>
          {files.length === 0 && !analysis && (
            <span className="text-xs text-gray-500">
              Astuce : vous pouvez lancer l'analyse sans fichier pour voir une démonstration.
            </span>
          )}
        </div>
      </SectionCard>
      )}

      {/* Résultats */}
      {!analysis ? (
        <EmptyState
          icon={<FileSearch className="h-10 w-10" />}
          title="Pas encore d'analyse"
          message="Importez le DCE puis cliquez sur « Analyser le DCE ». Vous obtiendrez les documents détectés, les clauses sensibles, les dates clés, les pièces exigées et les points bloquants."
        />
      ) : (
        <>
          <GuideBanner>
            <strong>Synthèse :</strong> {analysis.summary}
          </GuideBanner>

          {analysis.blockingPoints.length > 0 && (
            <Card className="border-red-200 bg-red-50/50 p-5">
              <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-red-800">
                <AlertOctagon className="h-5 w-5" /> Points bloquants — à traiter immédiatement
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-red-900">
                {analysis.blockingPoints.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SectionCard title="Documents détectés" hint={`Analysé le ${formatDate(analysis.analyzedAt)}${analysis.simulated ? ' (simulation)' : ''}`}>
              <ul className="divide-y divide-gray-100">
                {analysis.detectedDocuments.map((d, i) => (
                  <li key={i} className="flex items-center justify-between py-2 text-sm">
                    <span className="flex items-center gap-2 truncate text-gray-700">
                      <FileText className="h-4 w-4 shrink-0 text-gray-400" /> {d.name}
                    </span>
                    <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {d.type}
                      {d.pages ? ` · ${d.pages} p.` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Dates clés" hint="Reportez-les dans vos agendas — la date de remise pilote les alertes.">
              <ul className="space-y-2">
                {analysis.keyDates.map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-700">
                      <CalendarDays className="h-4 w-4 text-gray-400" /> {d.label}
                    </span>
                    <span className="font-semibold text-gray-900">{formatDate(d.date)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Clauses importantes" hint="Niveau de risque estimé pour chaque clause repérée.">
              <ul className="space-y-3">
                {analysis.keyClauses.map((c, i) => (
                  <li key={i} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">{c.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLES[c.risk]}`}
                      >
                        Risque {c.risk}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">{c.excerpt}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Exigences techniques">
              <ul className="list-inside list-disc space-y-1.5 text-sm text-gray-700">
                {analysis.technicalRequirements.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {analysis.contractualRisks.length > 0 && (
                <>
                  <h4 className="mb-1.5 mt-4 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <ShieldAlert className="h-4 w-4 text-amber-500" /> Risques contractuels
                  </h4>
                  <ul className="list-inside list-disc space-y-1.5 text-sm text-gray-700">
                    {analysis.contractualRisks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="2. Reprendre les résultats dans le dossier"
            hint="Crée le référentiel d'exigences (matrice de conformité), ajoute les pièces exigées et met à jour les critères de notation."
            action={
              editable ? (
                <PrimaryButton onClick={adoptResults}>
                  <ListChecks className="h-4 w-4" /> Reprendre dans le dossier
                </PrimaryButton>
              ) : undefined
            }
          >
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <div className="mb-1 font-medium text-gray-900">Pièces exigées détectées</div>
                <ul className="list-inside list-disc space-y-1 text-gray-600">
                  {analysis.requiredDocuments.map((d, i) => (
                    <li key={i}>
                      {d.label} <span className="text-xs text-gray-400">({d.category})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 font-medium text-gray-900">Critères de jugement détectés</div>
                <ul className="list-inside list-disc space-y-1 text-gray-600">
                  {analysis.awardCriteria.map((c) => (
                    <li key={c.id}>
                      {c.label} — {c.weight} %
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Étape suivante : traitez chaque exigence dans l'onglet{' '}
              <a href={`#appels-offres/ao/${tender.id}/exigences`} className="font-semibold text-primary-700 underline">Exigences &amp; conformité</a>{' '}
              puis décidez le <a href={`#appels-offres/ao/${tender.id}/gonogo`} className="font-semibold text-primary-700 underline">go / no-go</a>.
            </p>
          </SectionCard>
        </>
      )}
    </div>
  );
}
