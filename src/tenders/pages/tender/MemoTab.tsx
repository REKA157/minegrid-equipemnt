/**
 * Onglet Mémoire technique : génère le mémoire structuré en 15 sections à
 * partir de la Base entreprise et de l'analyse DCE, puis ouvre l'éditeur
 * partagé (modification section par section avant export).
 */

import React, { useState } from 'react';
import { FileText, RefreshCw, Sparkles } from 'lucide-react';
import { useTendersStore, useTenderDocuments } from '../../store/tendersStore';
import { generateTechnicalMemo, isAiConnected } from '../../ai/aiService';
import { attachDocToPieces } from '../../lib/pieces';
import { DocumentEditorView } from '../../components/DocumentEditorView';
import { EmptyState, GuideBanner, PrimaryButton, SecondaryButton } from '../../components/ui';
import type { GeneratedDocument, Tender } from '../../types';
import { can, nowIso, uid } from '../../types';
import { toast } from '../../../utils/toast';

export default function MemoTab({ tender }: { tender: Tender }) {
  const addDocument = useTendersStore((s) => s.addDocument);
  const updateDocumentSections = useTendersStore((s) => s.updateDocumentSections);
  const updateTender = useTendersStore((s) => s.updateTender);
  const company = useTendersStore((s) => s.company);
  const settings = useTendersStore((s) => s.settings);
  const docs = useTenderDocuments(tender.id);
  const [generating, setGenerating] = useState(false);

  const memo = docs.find((d) => d.type === 'memoire_technique');
  const editable = can(settings.currentUserRole, 'edit');

  const generate = async () => {
    setGenerating(true);
    try {
      const sections = await generateTechnicalMemo(tender, company);
      if (memo) {
        updateDocumentSections(memo.id, sections);
        toast.success('Mémoire regénéré — vos modifications précédentes ont été remplacées.');
      } else {
        const doc: GeneratedDocument = {
          id: uid('doc'),
          type: 'memoire_technique',
          title: `Mémoire technique — ${tender.reference}`,
          tenderId: tender.id,
          sections,
          status: 'brouillon',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          simulated: !isAiConnected(),
          history: [
            {
              id: uid('h'),
              date: nowIso(),
              author: settings.currentUserName,
              action: `Génération initiale${isAiConnected() ? '' : ' (mode simulation)'}`,
            },
          ],
        };
        addDocument(doc);
        // Couvre la pièce exigée « Mémoire technique » de la check-list.
        const attached = attachDocToPieces(tender, 'memoire_technique', doc.id);
        if (attached) {
          updateTender(
            tender.id,
            { requiredDocuments: attached.requiredDocuments },
            `Pièce « ${attached.attachedLabel} » couverte par ${doc.title}`,
          );
        }
        toast.success('Mémoire technique généré. Relisez et personnalisez chaque section.');
      }
    } finally {
      setGenerating(false);
    }
  };

  if (!memo) {
    return (
      <div className="space-y-6">
        <GuideBanner>
          Le mémoire technique est généralement <strong>le document le plus noté</strong> de
          votre offre. Le générateur crée une trame complète en 15 sections, pré-remplie avec
          vos données réelles (présentation, équipes, matériel, références de la Base
          entreprise, exigences de l'analyse DCE). Vous la personnalisez ensuite section par
          section.
        </GuideBanner>
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="Aucun mémoire technique pour ce dossier"
          message={
            editable
              ? 'Générez la première version : présentation, compréhension du besoin, méthodologie, moyens, planning, qualité, sécurité, environnement, risques, références, valeur ajoutée…'
              : 'Votre rôle ne permet pas de générer des documents (lecture seule).'
          }
          action={
            editable ? (
              <PrimaryButton onClick={generate} disabled={generating}>
                {generating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Génération en cours…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Générer le mémoire technique
                  </>
                )}
              </PrimaryButton>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {editable && memo.status !== 'valide' && (
        <div className="flex justify-end">
          <SecondaryButton onClick={generate} disabled={generating}>
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Régénération…' : 'Régénérer depuis les données du dossier'}
          </SecondaryButton>
        </div>
      )}
      <DocumentEditorView doc={memo} />
    </div>
  );
}
