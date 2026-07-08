/**
 * Documents générés : tous les documents de l'espace (tous dossiers
 * confondus), filtrables par type, avec statut et accès à l'éditeur.
 */

import React, { useMemo, useState } from 'react';
import { FileText, Trash2 } from 'lucide-react';
import { useNavigate } from '../../router';
import { useTendersStore } from '../store/tendersStore';
import {
  Card,
  ConfirmDialog,
  DocStatusBadge,
  EmptyState,
  PageHeader,
  Select,
  TextInput,
} from '../components/ui';
import type { DocumentType } from '../types';
import { DOCUMENT_TYPE_LABELS, can, formatDate } from '../types';
import { toast } from '../../utils/toast';

export default function DocumentsPage() {
  const navigate = useNavigate();
  const documents = useTendersStore((s) => s.documents);
  const tenders = useTendersStore((s) => s.tenders);
  const deleteDocument = useTendersStore((s) => s.deleteDocument);
  const role = useTendersStore((s) => s.settings.currentUserRole);
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'tous'>('tous');
  const [query, setQuery] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...documents];
    if (typeFilter !== 'tous') list = list.filter((d) => d.type === typeFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [documents, typeFilter, query]);

  const tenderName = (tenderId?: string) =>
    tenders.find((t) => t.id === tenderId)?.reference;

  const usedTypes = [...new Set(documents.map((d) => d.type))];

  return (
    <div>
      <PageHeader
        overline="Appels d'offres"
        title="Documents générés"
        description="Tous vos documents, tous dossiers confondus. Cliquez pour ouvrir l'éditeur, modifier et exporter."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <TextInput
          placeholder="Rechercher un document…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <div className="w-full sm:w-72">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as DocumentType | 'tous')}>
            <option value="tous">Tous les types</option>
            {usedTypes.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title={documents.length === 0 ? 'Aucun document généré' : 'Aucun résultat'}
          message={
            documents.length === 0
              ? 'Les documents se créent depuis un dossier d\'appel d\'offres (onglets Mémoire technique et Documents) ou via l\'assistant cahier des charges.'
              : 'Modifiez la recherche ou le filtre de type.'
          }
        />
      ) : (
        <Card className="divide-y divide-gray-100">
          {filtered.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              <FileText className="h-5 w-5 shrink-0 text-gray-400" />
              <button
                type="button"
                onClick={() => navigate(`appels-offres/document/${d.id}`)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-sm font-medium text-gray-900">{d.title}</div>
                <div className="text-xs text-gray-400">
                  {DOCUMENT_TYPE_LABELS[d.type]}
                  {tenderName(d.tenderId) ? ` · ${tenderName(d.tenderId)}` : ' · document autonome'} ·
                  modifié le {formatDate(d.updatedAt)}
                </div>
              </button>
              <DocStatusBadge status={d.status} />
              {can(role, 'delete') && (
                <button
                  type="button"
                  onClick={() => setToDelete(d.id)}
                  className="rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="Supprimer le document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </Card>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ce document ?"
        message="Le document sera définitivement supprimé. S'il couvrait une pièce exigée d'un dossier, celle-ci redeviendra « manquante »."
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (toDelete) {
            deleteDocument(toDelete);
            toast.success('Document supprimé.');
          }
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
