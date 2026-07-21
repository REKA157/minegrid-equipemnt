/**
 * Onglet Exigences — le cœur de la réponse à l'appel d'offres.
 *
 * Référentiel des exigences du DCE = matrice de conformité vivante :
 * chaque exigence porte son code, sa source (CCTP/CCAP/RC), son niveau,
 * son statut de conformité ET la réponse point par point de l'entreprise.
 *
 * Alimentation : import depuis l'analyse DCE, extraction depuis un texte
 * collé (IA), ou saisie manuelle. Sorties : matrice de conformité (Excel)
 * et document « Réponse point par point » (Word), générés d'un clic.
 */

import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Download,
  FileSearch,
  FileText,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useNavigate } from '../../../router';
import { useTendersStore } from '../../store/tendersStore';
import { draftRequirementResponse, extractRequirements, isAiConnected } from '../../ai/aiService';
import {
  computeCoverageStats,
  deriveRequirementsFromAnalysis,
  makeRequirement,
  normalizeKey,
} from '../../lib/requirements';
import { attachDocToPieces } from '../../lib/pieces';
import { buildGrilleConformite, buildReponsePointParPoint } from '../../lib/docTemplates';
import { exportExcel } from '../../lib/exportDoc';
import {
  Card,
  CoverageBadge,
  EmptyState,
  GuideBanner,
  LevelBadge,
  Modal,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
  Select,
  TextArea,
  TextInput,
  WarningBanner,
} from '../../components/ui';
import { MemberSelect } from '../../components/MemberSelect';
import type {
  RequirementCoverage,
  RequirementLevel,
  Tender,
  TenderRequirement,
} from '../../types';
import {
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_COVERAGE_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  can,
} from '../../types';
import { toast } from '../../../utils/toast';

export default function RequirementsTab({ tender }: { tender: Tender }) {
  const navigate = useNavigate();
  const setRequirements = useTendersStore((s) => s.setRequirements);
  const addDocument = useTendersStore((s) => s.addDocument);
  const company = useTendersStore((s) => s.company);
  const settings = useTendersStore((s) => s.settings);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [filter, setFilter] = useState<'toutes' | 'critiques' | RequirementCoverage>('toutes');

  const editable = can(settings.currentUserRole, 'edit');
  const requirements = tender.requirements;
  const stats = useMemo(() => computeCoverageStats(requirements), [requirements]);

  /** Point critique = impérative non conforme ou à traiter (même règle que computeCoverageStats). */
  const isCritical = (r: TenderRequirement) =>
    r.level === 'imperatif' && (r.coverage === 'non_conforme' || r.coverage === 'a_traiter');

  const shown =
    filter === 'toutes'
      ? requirements
      : filter === 'critiques'
        ? requirements.filter(isCritical)
        : requirements.filter((r) => r.coverage === filter);

  const update = (id: string, patch: Partial<TenderRequirement>) => {
    setRequirements(
      tender.id,
      requirements.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  };

  const remove = (id: string) => {
    setRequirements(tender.id, requirements.filter((r) => r.id !== id));
  };

  const addManual = () => {
    const req = makeRequirement(requirements, {
      text: '',
      category: 'Technique',
      responsible: settings.currentUserName,
    });
    setRequirements(tender.id, [req, ...requirements]);
    setExpanded(req.id);
  };

  const importFromAnalysis = () => {
    if (!tender.dceAnalysis) {
      toast.error('Lancez d\'abord l\'analyse du DCE (onglet Analyse DCE).');
      return;
    }
    const created = deriveRequirementsFromAnalysis(tender.dceAnalysis, requirements);
    if (created.length === 0) {
      toast('Rien de nouveau : toutes les exigences de l\'analyse sont déjà dans le référentiel.', 'info');
      return;
    }
    setRequirements(
      tender.id,
      [...requirements, ...created],
      `${created.length} exigence(s) importée(s) depuis l'analyse DCE`,
    );
    toast.success(`${created.length} exigence(s) ajoutée(s) depuis l'analyse DCE.`);
  };

  const extractFromText = async () => {
    if (!pasteText.trim()) {
      toast.error('Collez d\'abord un extrait du cahier des charges.');
      return;
    }
    setExtracting(true);
    try {
      const found = await extractRequirements(pasteText);
      const known = new Set(requirements.map((r) => normalizeKey(r.text)));
      const created: TenderRequirement[] = [];
      found
        .filter((t) => !known.has(normalizeKey(t)))
        .forEach((text) => {
          created.push(
            makeRequirement([...requirements, ...created], {
              text,
              category: 'Technique',
              source: 'Extrait collé (extraction IA)',
              level: 'important',
            }),
          );
        });
      if (created.length === 0) {
        toast('Aucune exigence nouvelle détectée dans ce texte.', 'info');
      } else {
        setRequirements(
          tender.id,
          [...requirements, ...created],
          `${created.length} exigence(s) extraites d'un texte collé`,
        );
        toast.success(`${created.length} exigence(s) extraite(s). Ajustez catégorie et niveau.`);
        setPasteOpen(false);
        setPasteText('');
      }
    } finally {
      setExtracting(false);
    }
  };

  const draft = async (req: TenderRequirement) => {
    setDrafting(req.id);
    try {
      const response = await draftRequirementResponse(req, tender, company);
      update(req.id, {
        response,
        coverage: req.coverage === 'a_traiter' ? 'partiel' : req.coverage,
      });
      toast.success(`Projet de réponse rédigé pour ${req.code} — relisez et personnalisez.`);
    } finally {
      setDrafting(null);
    }
  };

  const exportMatrix = async () => {
    if (requirements.length === 0) {
      toast.error('Le référentiel est vide — ajoutez des exigences d\'abord.');
      return;
    }
    const doc = buildGrilleConformite(tender, company, settings.currentUserName);
    try {
      await exportExcel(doc);
      toast.success('Matrice de conformité exportée en Excel.');
    } catch {
      toast.error("Échec de l'export Excel — réessayez.");
    }
  };

  const generateResponseDoc = () => {
    // Défense en profondeur : ce bouton était accessible au rôle « lecteur »
    // (hors de la garde editable) et créait un document dans l'espace partagé.
    if (!editable) {
      toast.error('Votre rôle est en lecture seule.');
      return;
    }
    if (requirements.length === 0) {
      toast.error('Le référentiel est vide — ajoutez des exigences d\'abord.');
      return;
    }
    const doc = buildReponsePointParPoint(tender, company, settings.currentUserName);
    addDocument(doc);
    // Couvre une éventuelle pièce exigée « réponse point par point ».
    const attached = attachDocToPieces(tender, doc.type, doc.id);
    if (attached) {
      useTendersStore
        .getState()
        .updateTender(
          tender.id,
          { requiredDocuments: attached.requiredDocuments },
          `Pièce « ${attached.attachedLabel} » couverte par ${doc.title}`,
        );
    }
    toast.success('Document « Réponse point par point » généré.');
    navigate(`appels-offres/document/${doc.id}`);
  };

  return (
    <div className="space-y-6">
      <GuideBanner>
        Ce référentiel est votre <strong>matrice de conformité</strong> : chaque exigence du DCE
        y est tracée avec sa source, son niveau et <strong>votre réponse point par point</strong>.
        Alimentez-le (analyse DCE, texte collé ou saisie), répondez à chaque exigence, puis
        générez la matrice (Excel) et la réponse (Word) d'un clic.
      </GuideBanner>

      {stats.criticalGaps > 0 && (
        <WarningBanner>
          ⚠ <strong>{stats.criticalGaps} exigence(s) impérative(s)</strong> non conforme(s) ou à
          traiter : chacune peut entraîner le rejet de l'offre ou une note dégradée.{' '}
          <button
            type="button"
            onClick={() => setFilter('critiques')}
            className="font-semibold underline underline-offset-2"
          >
            Afficher les points critiques →
          </button>
        </WarningBanner>
      )}

      {/* Statistiques + progression */}
      {requirements.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['toutes', 'critiques', 'a_traiter', 'partiel', 'non_conforme', 'conforme'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  filter === f
                    ? 'bg-primary-600 text-white'
                    : f === 'critiques' && stats.criticalGaps > 0
                      ? 'bg-red-50 text-red-700 hover:bg-red-100'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'toutes'
                  ? `Toutes (${stats.total})`
                  : f === 'critiques'
                    ? `Points critiques (${stats.criticalGaps})`
                    : `${REQUIREMENT_COVERAGE_LABELS[f]} (${stats.byCoverage[f]})`}
              </button>
            ))}
            <div className="ml-auto flex min-w-[220px] items-center gap-2">
              <span className="whitespace-nowrap text-xs text-gray-500">
                Réponses rédigées : {stats.responseRate} %
              </span>
              <div className="w-28">
                <ProgressBar
                  value={stats.responseRate}
                  colorClass={stats.responseRate >= 80 ? 'bg-green-500' : 'bg-primary-500'}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Actions d'alimentation et d'export */}
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <>
            <PrimaryButton
              onClick={importFromAnalysis}
              disabled={!tender.dceAnalysis}
              title={
                tender.dceAnalysis
                  ? "Crée les exigences depuis les résultats de l'analyse DCE"
                  : "Lancez d'abord l'analyse dans l'onglet Analyse DCE"
              }
            >
              <FileSearch className="h-4 w-4" /> Importer depuis l'analyse DCE
            </PrimaryButton>
            <SecondaryButton onClick={() => setPasteOpen(true)} title="Collez un extrait du CCTP/RC pour en extraire les exigences">
              <ClipboardPaste className="h-4 w-4" /> Extraire d'un texte
            </SecondaryButton>
            <SecondaryButton onClick={addManual}>
              <Plus className="h-4 w-4" /> Ajouter manuellement
            </SecondaryButton>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <SecondaryButton onClick={exportMatrix} disabled={requirements.length === 0}>
            <Download className="h-4 w-4" /> Matrice (Excel)
          </SecondaryButton>
          <PrimaryButton
            onClick={generateResponseDoc}
            disabled={requirements.length === 0 || !editable}
            title={!editable ? 'Votre rôle est en lecture seule — un rédacteur ou administrateur génère ce document.' : undefined}
          >
            <FileText className="h-4 w-4" /> Générer la réponse point par point
          </PrimaryButton>
        </div>
      </div>

      {/* Liste des exigences */}
      {requirements.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-10 w-10" />}
          title="Aucune exigence dans le référentiel"
          message={
            !editable
              ? 'Aucune exigence pour l\'instant — votre rôle est en lecture seule, un rédacteur ou administrateur doit alimenter le référentiel.'
              : tender.dceAnalysis
                ? 'Commencez par « Importer depuis l\'analyse DCE » : les exigences techniques, clauses, points bloquants et pièces exigées deviennent des lignes de la matrice. Vous pouvez aussi coller un extrait du CCTP ou saisir manuellement.'
                : 'Première étape : analysez le DCE (onglet Analyse DCE). Ses résultats alimenteront ce référentiel en un clic. Vous pouvez aussi coller un extrait du CCTP ou saisir les exigences manuellement.'
          }
          action={
            editable ? (
              tender.dceAnalysis ? (
                <PrimaryButton onClick={importFromAnalysis}>
                  <FileSearch className="h-4 w-4" /> Importer depuis l'analyse DCE
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={() => navigate(`appels-offres/ao/${tender.id}/dce`)}>
                  <FileSearch className="h-4 w-4" /> Analyser d'abord le DCE
                </PrimaryButton>
              )
            ) : undefined
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title="Aucune exigence avec ce statut"
          message="Changez de filtre pour afficher les autres exigences du référentiel."
        />
      ) : (
        <div className="space-y-2">
          {shown.map((req) => {
            const isOpen = expanded === req.id;
            const noResponse = !req.response.trim();
            return (
              <Card
                key={req.id}
                className={
                  req.coverage === 'non_conforme'
                    ? '!border-red-200'
                    : isCritical(req)
                      ? '!border-amber-200'
                      : ''
                }
              >
                {/* Ligne compacte */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : req.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                  <span className="w-16 shrink-0 font-mono text-xs font-semibold text-gray-500">
                    {req.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {req.text || '(exigence à décrire)'}
                    </span>
                    <span className="block truncate text-xs text-gray-400">
                      {req.source || 'source non renseignée'}
                      {noResponse ? ' — réponse à rédiger' : ' — réponse rédigée ✓'}
                    </span>
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <LevelBadge level={req.level} />
                  </span>
                  <span className="shrink-0">
                    <CoverageBadge status={req.coverage} />
                  </span>
                </button>

                {/* Panneau d'édition */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="block lg:col-span-2">
                        <span className="mb-1 block text-xs font-medium text-gray-500">Exigence</span>
                        <TextArea
                          value={req.text}
                          disabled={!editable}
                          rows={2}
                          onChange={(e) => update(req.id, { text: e.target.value })}
                          placeholder="Texte de l'exigence telle qu'exprimée dans le DCE…"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">
                          Source (document, article)
                        </span>
                        <TextInput
                          value={req.source}
                          disabled={!editable}
                          onChange={(e) => update(req.id, { source: e.target.value })}
                          placeholder="Ex. : CCTP art. 4.2"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">Catégorie</span>
                        <Select
                          value={req.category}
                          disabled={!editable}
                          onChange={(e) => update(req.id, { category: e.target.value })}
                        >
                          {REQUIREMENT_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </Select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">Niveau</span>
                        <Select
                          value={req.level}
                          disabled={!editable}
                          onChange={(e) => update(req.id, { level: e.target.value as RequirementLevel })}
                        >
                          {Object.entries(REQUIREMENT_LEVEL_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </Select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">Conformité</span>
                        <Select
                          value={req.coverage}
                          disabled={!editable}
                          onChange={(e) => update(req.id, { coverage: e.target.value as RequirementCoverage })}
                        >
                          {Object.entries(REQUIREMENT_COVERAGE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </Select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">Responsable</span>
                        <MemberSelect
                          value={req.responsible}
                          disabled={!editable}
                          onChange={(name) => update(req.id, { responsible: name })}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">
                          Preuve / justificatif
                        </span>
                        <TextInput
                          value={req.evidence}
                          disabled={!editable}
                          onChange={(e) => update(req.id, { evidence: e.target.value })}
                          placeholder="Certificat, référence, annexe…"
                        />
                      </label>
                    </div>

                    <label className="mt-3 block">
                      <span className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
                        <span>Notre réponse point par point</span>
                        {editable && (
                          <button
                            type="button"
                            onClick={() => draft(req)}
                            disabled={drafting === req.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                            title={isAiConnected() ? 'Rédiger via l\'API IA' : 'Rédiger un projet de réponse (simulation)'}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {drafting === req.id ? 'Rédaction…' : 'Rédiger la réponse (IA)'}
                          </button>
                        )}
                      </span>
                      <TextArea
                        value={req.response}
                        disabled={!editable}
                        rows={Math.min(10, Math.max(3, req.response.split('\n').length + 1))}
                        onChange={(e) => update(req.id, { response: e.target.value })}
                        placeholder="Engagement de l'entreprise en réponse à cette exigence — repris tel quel dans le document « Réponse point par point »."
                      />
                    </label>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <TextInput
                        value={req.comment}
                        disabled={!editable}
                        onChange={(e) => update(req.id, { comment: e.target.value })}
                        placeholder="Commentaire interne (non exporté dans la réponse)…"
                        className="max-w-md !text-xs"
                      />
                      {editable && (
                        <button
                          type="button"
                          onClick={() => remove(req.id)}
                          className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Supprimer l'exigence
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modale extraction depuis texte collé */}
      <Modal
        open={pasteOpen}
        title="Extraire les exigences d'un texte"
        onClose={() => setPasteOpen(false)}
        wide
      >
        <p className="mb-3 text-sm text-gray-600">
          Collez un extrait du cahier des charges (CCTP, RC, CCAP). L'application détecte les
          phrases exprimant une obligation (« doit », « devra », « obligatoire », « exigé »…)
          et les transforme en exigences à classer.
          {!isAiConnected() && ' (Mode simulation : détection par mots-clés — une API IA affinera l\'extraction.)'}
        </p>
        <TextArea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={10}
          placeholder="Collez ici le texte du cahier des charges…"
        />
        <div className="mt-4 flex justify-end gap-2">
          <SecondaryButton onClick={() => setPasteOpen(false)}>Annuler</SecondaryButton>
          <PrimaryButton onClick={extractFromText} disabled={extracting}>
            <Sparkles className="h-4 w-4" />
            {extracting ? 'Extraction…' : 'Extraire les exigences'}
          </PrimaryButton>
        </div>
      </Modal>
    </div>
  );
}
