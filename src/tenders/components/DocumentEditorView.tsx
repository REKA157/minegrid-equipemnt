/**
 * Éditeur de document généré — vue partagée entre l'onglet Mémoire
 * technique d'un dossier et la page Documents.
 *
 * Chaque section est modifiable avant export ; boutons par section :
 * « Améliorer (IA) » et « Insérer depuis la bibliothèque ». Workflow de
 * validation (brouillon → en validation → validé) avec droits par rôle et
 * traçabilité. Exports : Word, PDF, Excel (si tableaux).
 */

import React, { useState } from 'react';
import {
  BookOpen,
  Download,
  FileSpreadsheet,
  History,
  Printer,
  Send,
  ShieldCheck,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useTendersStore } from '../store/tendersStore';
import { improveSection, isAiConnected } from '../ai/aiService';
import { exportExcel, exportPdf, exportWord } from '../lib/exportDoc';
import {
  Card,
  DocStatusBadge,
  GuideBanner,
  Modal,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from './ui';
import type { DocSection, GeneratedDocument, LibraryItem } from '../types';
import { DOCUMENT_TYPE_LABELS, LIBRARY_CATEGORY_LABELS, can, formatDate } from '../types';
import { toast } from '../../utils/toast';

export function DocumentEditorView({ doc }: { doc: GeneratedDocument }) {
  const updateDocumentSections = useTendersStore((s) => s.updateDocumentSections);
  const updateDocumentTitle = useTendersStore((s) => s.updateDocumentTitle);
  const setDocumentStatus = useTendersStore((s) => s.setDocumentStatus);
  const company = useTendersStore((s) => s.company);
  const library = useTendersStore((s) => s.library);
  const settings = useTendersStore((s) => s.settings);

  const [improving, setImproving] = useState<string | null>(null);
  const [libraryTarget, setLibraryTarget] = useState<DocSection | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const role = settings.currentUserRole;
  const isValidated = doc.status === 'valide';
  const editable = can(role, 'edit') && !isValidated;
  const hasTables = doc.sections.some((s) => s.table);

  const updateSection = (id: string, content: string) => {
    updateDocumentSections(
      doc.id,
      doc.sections.map((s) => (s.id === id ? { ...s, content } : s)),
    );
  };

  const updateSectionTitle = (id: string, title: string) => {
    updateDocumentSections(
      doc.id,
      doc.sections.map((s) => (s.id === id ? { ...s, title } : s)),
    );
  };

  const improve = async (section: DocSection) => {
    setImproving(section.id);
    try {
      const content = await improveSection(section);
      updateSection(section.id, content);
      toast.success('Section améliorée — relisez et ajustez.');
    } finally {
      setImproving(null);
    }
  };

  const insertFromLibrary = (item: LibraryItem) => {
    if (!libraryTarget) return;
    const current = doc.sections.find((s) => s.id === libraryTarget.id);
    if (!current) return;
    updateSection(
      libraryTarget.id,
      current.content ? `${current.content}\n\n${item.content}` : item.content,
    );
    setLibraryTarget(null);
    toast.success(`« ${item.title} » inséré dans la section.`);
  };

  const updateTableCell = (sectionId: string, rowIdx: number, colIdx: number, value: string) => {
    updateDocumentSections(
      doc.id,
      doc.sections.map((s) => {
        if (s.id !== sectionId || !s.table) return s;
        const rows = s.table.rows.map((r, ri) =>
          ri === rowIdx ? r.map((c, ci) => (ci === colIdx ? value : c)) : r,
        );
        return { ...s, table: { ...s.table, rows } };
      }),
    );
  };

  return (
    <div className="space-y-5">
      {/* Bandeau statut + exports */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <DocStatusBadge status={doc.status} />
          <span className="text-xs text-gray-400">
            {DOCUMENT_TYPE_LABELS[doc.type]} — modifié le {formatDate(doc.updatedAt)}
            {doc.simulated && ' — contenu initial simulé'}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <SecondaryButton onClick={() => setShowHistory(true)} title="Historique des modifications">
              <History className="h-4 w-4" /> Historique
            </SecondaryButton>
            <SecondaryButton
              onClick={() => {
                if (!exportPdf(doc, company)) {
                  toast.error('Popup bloquée : autorisez les fenêtres pour exporter en PDF.');
                }
              }}
            >
              <Printer className="h-4 w-4" /> PDF
            </SecondaryButton>
            {hasTables && (
              <SecondaryButton onClick={() => exportExcel(doc).then(() => toast.success('Export Excel téléchargé.'))}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </SecondaryButton>
            )}
            <PrimaryButton
              onClick={() => {
                exportWord(doc, company);
                toast.success('Document Word téléchargé.');
              }}
            >
              <Download className="h-4 w-4" /> Word
            </PrimaryButton>
          </div>
        </div>

        {/* Workflow de validation */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          {doc.status === 'brouillon' && can(role, 'edit') && (
            <SecondaryButton onClick={() => setDocumentStatus(doc.id, 'en_validation', settings.currentUserName)}>
              <Send className="h-4 w-4" /> Envoyer en validation
            </SecondaryButton>
          )}
          {doc.status === 'en_validation' && can(role, 'validate') && (
            <PrimaryButton onClick={() => setDocumentStatus(doc.id, 'valide', settings.currentUserName)}>
              <ShieldCheck className="h-4 w-4" /> Valider le document
            </PrimaryButton>
          )}
          {doc.status === 'en_validation' && !can(role, 'validate') && (
            <span className="text-xs text-gray-500">
              En attente de validation par un rôle Validateur ou Administrateur.
            </span>
          )}
          {isValidated && can(role, 'validate') && (
            <SecondaryButton onClick={() => setDocumentStatus(doc.id, 'brouillon', settings.currentUserName)}>
              <Undo2 className="h-4 w-4" /> Repasser en brouillon
            </SecondaryButton>
          )}
          {isValidated && (
            <span className="text-xs text-green-700">
              ✓ Document validé — verrouillé en modification. Repassez-le en brouillon pour l'éditer.
            </span>
          )}
        </div>
      </Card>

      {!editable && !isValidated && (
        <GuideBanner>
          Votre rôle ({role}) ne permet pas de modifier les documents — lecture seule.
        </GuideBanner>
      )}

      {/* Titre */}
      <Card className="p-4">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
          Titre du document
        </label>
        <TextInput
          value={doc.title}
          disabled={!editable}
          onChange={(e) => updateDocumentTitle(doc.id, e.target.value)}
          className="text-base font-semibold"
        />
      </Card>

      {/* Sections */}
      {doc.sections.map((section) => (
        <Card key={section.id} className="p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TextInput
              value={section.title}
              disabled={!editable}
              onChange={(e) => updateSectionTitle(section.id, e.target.value)}
              className="!w-auto min-w-[240px] flex-1 border-transparent bg-transparent px-0 text-sm font-semibold text-gray-900 focus:border-gray-300 focus:bg-white"
            />
            {editable && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setLibraryTarget(section)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  title="Insérer un contenu type de la bibliothèque"
                >
                  <BookOpen className="h-3.5 w-3.5" /> Bibliothèque
                </button>
                <button
                  type="button"
                  onClick={() => improve(section)}
                  disabled={improving === section.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                  title={isAiConnected() ? 'Reformuler avec l\'API IA' : 'Améliorer (simulation IA)'}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {improving === section.id ? 'En cours…' : 'Améliorer'}
                </button>
              </div>
            )}
          </div>

          <TextArea
            value={section.content}
            disabled={!editable}
            onChange={(e) => updateSection(section.id, e.target.value)}
            rows={Math.min(14, Math.max(3, section.content.split('\n').length + 1))}
          />

          {section.table && (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border border-gray-200 text-xs">
                <thead>
                  <tr className="bg-primary-50 text-left">
                    {section.table.columns.map((c, i) => (
                      <th key={i} className="border border-gray-200 px-2 py-1.5 font-semibold text-primary-900">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.table.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border border-gray-200 p-0">
                          <input
                            value={cell}
                            disabled={!editable}
                            onChange={(e) => updateTableCell(section.id, ri, ci, e.target.value)}
                            className="w-full bg-transparent px-2 py-1.5 focus:bg-primary-50 focus:outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-gray-400">
                Tableau modifiable cellule par cellule — utilisez l'export Excel pour le chiffrage.
              </p>
            </div>
          )}
        </Card>
      ))}

      {/* Modale bibliothèque */}
      <Modal
        open={libraryTarget !== null}
        title="Insérer depuis la bibliothèque"
        onClose={() => setLibraryTarget(null)}
        wide
      >
        {library.length === 0 ? (
          <p className="text-sm text-gray-500">
            La bibliothèque est vide. Ajoutez des clauses et paragraphes types depuis l'onglet
            Bibliothèque.
          </p>
        ) : (
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
            {library.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => insertFromLibrary(item)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-left hover:border-primary-300 hover:bg-primary-50/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                    <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {LIBRARY_CATEGORY_LABELS[item.category]}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.content}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Modale historique */}
      <Modal open={showHistory} title="Historique du document" onClose={() => setShowHistory(false)}>
        <ol className="space-y-3">
          {[...doc.history].reverse().map((h) => (
            <li key={h.id} className="text-sm">
              <div className="font-medium text-gray-900">{h.action}</div>
              <div className="text-xs text-gray-400">
                {h.author} · {formatDate(h.date)}
              </div>
            </li>
          ))}
        </ol>
      </Modal>
    </div>
  );
}
