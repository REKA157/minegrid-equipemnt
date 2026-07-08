/**
 * Bibliothèque de contenus réutilisables : clauses, paragraphes types,
 * références, méthodologies, profils, matériels, certifications, documents
 * administratifs, modèles. CRUD complet + copie dans le presse-papiers.
 * Ces contenus sont insérables dans n'importe quel document depuis
 * l'éditeur (bouton « Bibliothèque » de chaque section).
 */

import React, { useMemo, useState } from 'react';
import { BookOpen, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTendersStore } from '../store/tendersStore';
import {
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  GuideBanner,
  Modal,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Select,
  TextArea,
  TextInput,
} from '../components/ui';
import type { LibraryCategory, LibraryItem } from '../types';
import { LIBRARY_CATEGORY_LABELS, can, nowIso, uid } from '../types';
import { toast } from '../../utils/toast';

export default function LibraryPage() {
  const library = useTendersStore((s) => s.library);
  const upsertLibraryItem = useTendersStore((s) => s.upsertLibraryItem);
  const deleteLibraryItem = useTendersStore((s) => s.deleteLibraryItem);
  const role = useTendersStore((s) => s.settings.currentUserRole);

  const [category, setCategory] = useState<LibraryCategory | 'tous'>('tous');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const editable = can(role, 'edit');

  const filtered = useMemo(() => {
    let list = [...library];
    if (category !== 'tous') list = list.filter((i) => i.category === category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.content.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [library, category, query]);

  const startNew = () =>
    setEditing({
      id: uid('lib'),
      category: category === 'tous' ? 'clause' : category,
      title: '',
      content: '',
      tags: [],
      updatedAt: nowIso(),
    });

  const save = () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.content.trim()) {
      toast.error('Titre et contenu sont obligatoires.');
      return;
    }
    upsertLibraryItem(editing);
    setEditing(null);
    toast.success('Contenu enregistré dans la bibliothèque.');
  };

  const copy = async (item: LibraryItem) => {
    try {
      await navigator.clipboard.writeText(item.content);
      toast.success('Contenu copié — collez-le où vous voulez.');
    } catch {
      toast.error('Copie impossible dans ce navigateur.');
    }
  };

  const counts = useMemo(() => {
    const map = new Map<LibraryCategory, number>();
    library.forEach((i) => map.set(i.category, (map.get(i.category) ?? 0) + 1));
    return map;
  }, [library]);

  return (
    <div>
      <PageHeader
        overline="Appels d'offres"
        title="Bibliothèque de contenus"
        description="Vos clauses, méthodologies et références réutilisables. Chaque élément est insérable dans un document en un clic depuis l'éditeur."
        action={
          editable ? (
            <PrimaryButton onClick={startNew}>
              <Plus className="h-4 w-4" /> Nouveau contenu
            </PrimaryButton>
          ) : undefined
        }
      />

      <GuideBanner>
        💡 Dans l'éditeur de documents, le bouton <strong>« Bibliothèque »</strong> de chaque
        section insère directement ces contenus. Capitalisez ici ce que vous réécrivez souvent.
      </GuideBanner>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <TextInput
          placeholder="Rechercher (titre, contenu, tag)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <div className="w-full sm:w-72">
          <Select value={category} onChange={(e) => setCategory(e.target.value as LibraryCategory | 'tous')}>
            <option value="tous">Toutes les catégories ({library.length})</option>
            {Object.entries(LIBRARY_CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l} ({counts.get(v as LibraryCategory) ?? 0})
              </option>
            ))}
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title={library.length === 0 ? 'Bibliothèque vide' : 'Aucun résultat'}
          message={
            library.length === 0
              ? 'Ajoutez vos premières clauses types, méthodologies et références. Vous les réutiliserez dans tous vos mémoires et cahiers des charges.'
              : 'Modifiez la recherche ou la catégorie.'
          }
          action={
            editable && library.length === 0 ? (
              <PrimaryButton onClick={startNew}>
                <Plus className="h-4 w-4" /> Ajouter un contenu
              </PrimaryButton>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className="flex flex-col p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="rounded bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                  {LIBRARY_CATEGORY_LABELS[item.category]}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => copy(item)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="Copier le contenu"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {editable && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing({ ...item })}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setToDelete(item.id)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-1 line-clamp-4 flex-1 whitespace-pre-line text-xs text-gray-500">
                {item.content}
              </p>
              {item.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modale édition */}
      <Modal
        open={editing !== null}
        title={editing && library.some((i) => i.id === editing.id) ? 'Modifier le contenu' : 'Nouveau contenu'}
        onClose={() => setEditing(null)}
        wide
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Titre" required>
                <TextInput
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Ex. : Clause de pénalités standard"
                />
              </Field>
              <Field label="Catégorie">
                <Select
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value as LibraryCategory })}
                >
                  {Object.entries(LIBRARY_CATEGORY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Contenu" required>
              <TextArea
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                rows={8}
                placeholder="Le texte réutilisable…"
              />
            </Field>
            <Field label="Tags" help="Séparés par des virgules — facilitent la recherche.">
              <TextInput
                value={editing.tags.join(', ')}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                  })
                }
                placeholder="pénalités, CCAP, délais"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => setEditing(null)}>Annuler</SecondaryButton>
              <PrimaryButton onClick={save}>Enregistrer</PrimaryButton>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ce contenu ?"
        message="Le contenu sera retiré de la bibliothèque (les documents où il a déjà été inséré ne changent pas)."
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (toDelete) deleteLibraryItem(toDelete);
          setToDelete(null);
          toast.success('Contenu supprimé.');
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
