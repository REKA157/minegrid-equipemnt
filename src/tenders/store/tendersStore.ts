/**
 * Store central du module Appels d'offres.
 *
 * zustand + persist (localStorage) : l'application fonctionne entièrement
 * en local, sans backend. Les données de démonstration sont injectées au
 * premier lancement (flag `seeded`) et peuvent être restaurées depuis les
 * Paramètres. Chaque mutation significative alimente l'historique du
 * dossier concerné (traçabilité).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CompanyProfile,
  DceAnalysisResult,
  DocSection,
  DocumentStatus,
  GeneratedDocument,
  GoNoGoState,
  HistoryEntry,
  LibraryItem,
  ResponseStrategy,
  RoleAssignment,
  Tender,
  TenderRequirement,
  TenderSettings,
  TenderStatus,
  TenderTask,
} from '../types';
import { TENDER_STATUS_LABELS, nowIso, uid } from '../types';
import {
  DEMO_COMPANY,
  buildDemoDocuments,
  buildDemoLibrary,
  buildDemoTenders,
} from '../data/demo';

interface TendersState {
  seeded: boolean;
  tenders: Tender[];
  documents: GeneratedDocument[];
  library: LibraryItem[];
  company: CompanyProfile;
  settings: TenderSettings;
  /** Rôles attribués aux membres de l'équipe (qui peut quoi). */
  roleAssignments: RoleAssignment[];

  // --- Appels d'offres ---
  addTender: (tender: Tender) => void;
  updateTender: (id: string, patch: Partial<Tender>, historyAction?: string) => void;
  deleteTender: (id: string) => void;
  setTenderStatus: (id: string, status: TenderStatus) => void;
  setDceAnalysis: (id: string, analysis: DceAnalysisResult) => void;
  setRequirements: (id: string, items: TenderRequirement[], historyAction?: string) => void;
  setStrategy: (id: string, strategy: ResponseStrategy, historyAction?: string) => void;
  setGoNoGo: (id: string, goNoGo: GoNoGoState, historyAction?: string) => void;
  upsertTask: (tenderId: string, task: TenderTask) => void;
  deleteTask: (tenderId: string, taskId: string) => void;

  // --- Documents générés ---
  addDocument: (doc: GeneratedDocument) => void;
  /** meta optionnel : trace une entrée d'historique (ex. régénération) et met à jour le flag simulated. */
  updateDocumentSections: (
    docId: string,
    sections: DocSection[],
    meta?: { historyAction: string; author: string; simulated?: boolean },
  ) => void;
  updateDocumentTitle: (docId: string, title: string) => void;
  setDocumentStatus: (docId: string, status: DocumentStatus, author: string) => void;
  deleteDocument: (docId: string) => void;

  // --- Bibliothèque ---
  upsertLibraryItem: (item: LibraryItem) => void;
  deleteLibraryItem: (id: string) => void;

  // --- Entreprise & paramètres ---
  updateCompany: (patch: Partial<CompanyProfile>) => void;
  updateSettings: (patch: Partial<TenderSettings>) => void;

  // --- Équipe & rôles ---
  upsertRoleAssignment: (assignment: RoleAssignment) => void;
  removeRoleAssignment: (memberId: string) => void;

  // --- Données démo ---
  seedIfNeeded: () => void;
  resetDemoData: () => void;
}

function entry(author: string, action: string, detail?: string): HistoryEntry {
  return { id: uid('h'), date: nowIso(), author, action, detail };
}

export const useTendersStore = create<TendersState>()(
  persist(
    (set, get) => ({
      seeded: false,
      tenders: [],
      documents: [],
      library: [],
      company: DEMO_COMPANY,
      settings: {
        currentUserName: 'Utilisateur',
        // MOINDRE PRIVILÈGE : par défaut lecteur ; le vrai rôle est dérivé du
        // rôle société (propriétaire/admin) ou attribué par l'admin en mode partagé.
        currentUserRole: 'lecteur',
        aiApiConfigured: false,
      },
      roleAssignments: [],

      addTender: (tender) =>
        set((s) => ({ tenders: [tender, ...s.tenders] })),

      updateTender: (id, patch, historyAction) =>
        set((s) => ({
          tenders: s.tenders.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...patch,
                  updatedAt: nowIso(),
                  history: historyAction
                    ? [...t.history, entry(s.settings.currentUserName, historyAction)]
                    : t.history,
                }
              : t,
          ),
        })),

      deleteTender: (id) =>
        set((s) => ({
          tenders: s.tenders.filter((t) => t.id !== id),
          documents: s.documents.filter((d) => d.tenderId !== id),
        })),

      setTenderStatus: (id, status) => {
        const { updateTender } = get();
        updateTender(id, { status }, `Statut changé : ${TENDER_STATUS_LABELS[status]}`);
      },

      setDceAnalysis: (id, analysis) => {
        const { updateTender } = get();
        updateTender(
          id,
          { dceAnalysis: analysis },
          `Analyse du DCE ${analysis.simulated ? '(simulation)' : ''}`.trim(),
        );
      },

      setRequirements: (id, items, historyAction) => {
        const { updateTender } = get();
        updateTender(id, { requirements: items }, historyAction);
      },

      setStrategy: (id, strategy, historyAction) => {
        const { updateTender } = get();
        updateTender(id, { strategy }, historyAction);
      },

      setGoNoGo: (id, goNoGo, historyAction) => {
        const { updateTender } = get();
        updateTender(id, { goNoGo }, historyAction);
      },

      upsertTask: (tenderId, task) =>
        set((s) => ({
          tenders: s.tenders.map((t) => {
            if (t.id !== tenderId) return t;
            const exists = t.tasks.some((x) => x.id === task.id);
            return {
              ...t,
              updatedAt: nowIso(),
              tasks: exists
                ? t.tasks.map((x) => (x.id === task.id ? task : x))
                : [...t.tasks, task],
            };
          }),
        })),

      deleteTask: (tenderId, taskId) =>
        set((s) => ({
          tenders: s.tenders.map((t) =>
            t.id === tenderId
              ? { ...t, tasks: t.tasks.filter((x) => x.id !== taskId), updatedAt: nowIso() }
              : t,
          ),
        })),

      addDocument: (doc) =>
        set((s) => ({ documents: [doc, ...s.documents] })),

      updateDocumentSections: (docId, sections, meta) =>
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  sections,
                  updatedAt: nowIso(),
                  // Sans meta (édition au fil de l'eau) : flag et historique inchangés.
                  simulated: meta?.simulated ?? d.simulated,
                  history: meta
                    ? [...d.history, entry(meta.author, meta.historyAction)]
                    : d.history,
                }
              : d,
          ),
        })),

      updateDocumentTitle: (docId, title) =>
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === docId ? { ...d, title, updatedAt: nowIso() } : d,
          ),
        })),

      setDocumentStatus: (docId, status, author) =>
        set((s) => ({
          documents: s.documents.map((d) => {
            if (d.id !== docId) return d;
            const label: Record<DocumentStatus, string> = {
              brouillon: 'Repassé en brouillon',
              en_validation: 'Envoyé en validation',
              valide: 'Document validé',
            };
            return {
              ...d,
              status,
              updatedAt: nowIso(),
              history: [...d.history, entry(author, label[status])],
            };
          }),
        })),

      deleteDocument: (docId) =>
        set((s) => ({
          documents: s.documents.filter((d) => d.id !== docId),
          // Détache la pièce des AO qui la référencent.
          tenders: s.tenders.map((t) => ({
            ...t,
            requiredDocuments: t.requiredDocuments.map((rd) =>
              rd.generatedDocId === docId ? { ...rd, generatedDocId: undefined } : rd,
            ),
          })),
        })),

      upsertLibraryItem: (item) =>
        set((s) => {
          const exists = s.library.some((x) => x.id === item.id);
          return {
            library: exists
              ? s.library.map((x) => (x.id === item.id ? { ...item, updatedAt: nowIso() } : x))
              : [{ ...item, updatedAt: nowIso() }, ...s.library],
          };
        }),

      deleteLibraryItem: (id) =>
        set((s) => ({ library: s.library.filter((x) => x.id !== id) })),

      updateCompany: (patch) =>
        set((s) => ({ company: { ...s.company, ...patch } })),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      upsertRoleAssignment: (assignment) =>
        set((s) => {
          const exists = s.roleAssignments.some((a) => a.memberId === assignment.memberId);
          return {
            roleAssignments: exists
              ? s.roleAssignments.map((a) =>
                  a.memberId === assignment.memberId ? { ...a, ...assignment } : a,
                )
              : [...s.roleAssignments, assignment],
          };
        }),

      removeRoleAssignment: (memberId) =>
        set((s) => ({
          roleAssignments: s.roleAssignments.filter((a) => a.memberId !== memberId),
        })),

      seedIfNeeded: () => {
        const s = get();
        if (s.seeded) return;
        // Ne JAMAIS écraser des données déjà présentes (ex. dossier créé
        // depuis le Global Monitor avant la première ouverture du module).
        if (s.tenders.length > 0 || s.documents.length > 0) {
          set({ seeded: true });
          return;
        }
        set({
          seeded: true,
          tenders: buildDemoTenders(),
          documents: buildDemoDocuments(),
          library: buildDemoLibrary(),
          company: DEMO_COMPANY,
        });
      },

      resetDemoData: () =>
        set({
          seeded: true,
          tenders: buildDemoTenders(),
          documents: buildDemoDocuments(),
          library: buildDemoLibrary(),
          company: DEMO_COMPANY,
        }),
    }),
    {
      name: 'minegrid-tenders-store',
      version: 2,
      /**
       * v1 → v2 : l'ancienne « grille de conformité » libre (compliance)
       * devient le référentiel d'exigences (requirements), pivot de la
       * réponse : chaque ligne migrée garde son statut, son responsable
       * et son commentaire ; l'« action à faire » devient l'ébauche de
       * réponse point par point.
       */
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown> | undefined;
        if (!state || version >= 2 || !Array.isArray(state.tenders)) return state;

        const coverageMap: Record<string, string> = {
          conforme: 'conforme',
          a_verifier: 'a_traiter',
          non_conforme: 'non_conforme',
        };

        state.tenders = (state.tenders as Record<string, unknown>[]).map((t) => {
          if (Array.isArray(t.requirements)) return t;
          const legacy = Array.isArray(t.compliance)
            ? (t.compliance as Record<string, string>[])
            : [];
          const requirements = legacy.map((c, i) => ({
            id: c.id ?? `req_mig_${i}_${String(t.id ?? '')}`,
            code: `EL-${String(i + 1).padStart(3, '0')}`,
            text: c.requirement ?? '',
            source: 'Grille de conformité (migration)',
            category: 'Éligibilité',
            level: 'imperatif',
            coverage: coverageMap[c.status] ?? 'a_traiter',
            response: c.action ?? '',
            responsible: c.responsible ?? '',
            evidence: '',
            comment: c.comment ?? '',
          }));
          const { compliance: _dropped, ...rest } = t;
          return { ...rest, requirements };
        });
        return state;
      },
    },
  ),
);

// --- Sélecteurs pratiques -------------------------------------------------

export function useTender(id?: string): Tender | undefined {
  return useTendersStore((s) => s.tenders.find((t) => t.id === id));
}

export function useDocument(id?: string): GeneratedDocument | undefined {
  return useTendersStore((s) => s.documents.find((d) => d.id === id));
}

export function useTenderDocuments(tenderId?: string): GeneratedDocument[] {
  return useTendersStore((s) => s.documents.filter((d) => d.tenderId === tenderId));
}
