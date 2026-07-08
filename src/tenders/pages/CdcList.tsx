/**
 * Cahiers des charges : liste des documents de consultation produits
 * (cahier des charges, CCTP, CCAP, règlement) + accès à l'assistant.
 */

import React from 'react';
import { Plus, ScrollText } from 'lucide-react';
import { useNavigate } from '../../router';
import { useTendersStore } from '../store/tendersStore';
import {
  Card,
  DocStatusBadge,
  EmptyState,
  PageHeader,
  PrimaryButton,
} from '../components/ui';
import { DOCUMENT_TYPE_LABELS, formatDate } from '../types';

const CONSULTATION_TYPES = new Set([
  'cahier_des_charges',
  'cctp',
  'ccap',
  'reglement_consultation',
]);

export default function CdcList() {
  const navigate = useNavigate();
  const documents = useTendersStore((s) => s.documents);
  const cahiers = documents.filter((d) => CONSULTATION_TYPES.has(d.type));

  return (
    <div>
      <PageHeader
        overline="Appels d'offres"
        title="Cahiers des charges"
        description="Rédigez vos consultations : l'assistant vous pose les bonnes questions, l'application génère un document structuré et modifiable."
        action={
          <PrimaryButton onClick={() => navigate('appels-offres/cahiers/nouveau')}>
            <Plus className="h-4 w-4" /> Nouveau cahier des charges
          </PrimaryButton>
        }
      />

      {cahiers.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-10 w-10" />}
          title="Aucun cahier des charges"
          message="Lancez l'assistant : type de projet, contexte, objectifs, périmètre, contraintes, livrables, planning, pénalités… À la fin, vous obtenez un document complet prêt à exporter."
          action={
            <PrimaryButton onClick={() => navigate('appels-offres/cahiers/nouveau')}>
              <Plus className="h-4 w-4" /> Lancer l'assistant
            </PrimaryButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cahiers.map((d) => (
            <Card key={d.id} className="p-4" onClick={() => navigate(`appels-offres/document/${d.id}`)}>
              <div className="flex items-start justify-between gap-2">
                <ScrollText className="h-5 w-5 shrink-0 text-primary-500" />
                <DocStatusBadge status={d.status} />
              </div>
              <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900">{d.title}</h3>
              <p className="mt-1 text-xs text-gray-400">
                {DOCUMENT_TYPE_LABELS[d.type]} · {d.sections.length} sections · modifié le{' '}
                {formatDate(d.updatedAt)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
