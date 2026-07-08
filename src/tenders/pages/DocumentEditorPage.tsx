/**
 * Page d'édition d'un document généré (route appels-offres/document/:id).
 * Utilise la vue partagée DocumentEditorView ; le fil d'Ariane ramène au
 * dossier lié ou à la liste des documents.
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useDocument, useTendersStore } from '../store/tendersStore';
import { DocumentEditorView } from '../components/DocumentEditorView';
import { EmptyState, PageHeader } from '../components/ui';
import { DOCUMENT_TYPE_LABELS } from '../types';

export default function DocumentEditorPage({ docId }: { docId: string }) {
  const doc = useDocument(docId);
  const tenders = useTendersStore((s) => s.tenders);

  if (!doc) {
    return (
      <EmptyState
        title="Document introuvable"
        message="Ce document n'existe pas ou a été supprimé."
        action={
          <a href="#appels-offres/documents" className="text-sm font-semibold text-primary-700 underline">
            ← Retour aux documents
          </a>
        }
      />
    );
  }

  const tender = tenders.find((t) => t.id === doc.tenderId);
  const backHref = tender ? `#appels-offres/ao/${tender.id}/documents` : '#appels-offres/documents';
  const backLabel = tender ? `Retour au dossier ${tender.reference}` : 'Retour aux documents';

  return (
    <div className="mx-auto max-w-4xl">
      <a
        href={backHref}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary-700"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </a>
      <PageHeader
        overline={`Documents › ${DOCUMENT_TYPE_LABELS[doc.type]}`}
        title={doc.title}
        description="Modifiez chaque section puis exportez. Les documents validés sont verrouillés."
      />
      <DocumentEditorView doc={doc} />
    </div>
  );
}
