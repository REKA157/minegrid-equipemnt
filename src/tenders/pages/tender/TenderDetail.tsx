/**
 * Détail d'un appel d'offres — hub du dossier.
 *
 * Navigation par onglets (sous-routes) qui suit le workflow métier :
 * Aperçu → Analyse DCE → Conformité → Go/No-Go → Mémoire → Documents → Tâches.
 * L'onglet Aperçu affiche la frise d'avancement et la prochaine action.
 */

import React from 'react';
import { useRouteParams } from '../../../router';
import { useTender } from '../../store/tendersStore';
import { EmptyState, PageHeader, TenderStatusBadge, DeadlineBadge } from '../../components/ui';
import { SECTOR_LABELS } from '../../types';
import TenderOverview from './TenderOverview';
import DceAnalysisTab from './DceAnalysisTab';
import RequirementsTab from './RequirementsTab';
import StrategyTab from './StrategyTab';
import GoNoGoTab from './GoNoGoTab';
import MemoTab from './MemoTab';
import DocsTab from './DocsTab';
import TasksTab from './TasksTab';

/** Onglets dans l'ordre du workflow métier : comprendre → extraire →
 * décider → construire la réponse → produire les pièces → suivre. */
const TABS: { id: string; label: string }[] = [
  { id: '', label: 'Aperçu' },
  { id: 'dce', label: 'Analyse DCE' },
  { id: 'exigences', label: 'Exigences & conformité' },
  { id: 'gonogo', label: 'Go / No-Go' },
  { id: 'strategie', label: 'Stratégie' },
  { id: 'memoire', label: 'Mémoire technique' },
  { id: 'documents', label: 'Documents' },
  { id: 'taches', label: 'Tâches' },
];

export default function TenderDetail({ tenderId }: { tenderId: string }) {
  const { segments } = useRouteParams();
  const tender = useTender(tenderId);
  const rawTab = segments[3] ?? '';
  // 'conformite' = ancienne URL de la grille : la matrice vit désormais dans
  // l'onglet Exigences (normalisé ici pour que le surlignage suive).
  const tab = rawTab === 'conformite' ? 'exigences' : rawTab;

  if (!tender) {
    return (
      <EmptyState
        title="Dossier introuvable"
        message="Ce dossier n'existe pas ou a été supprimé. Retournez à la liste des appels d'offres."
        action={
          <a href="#appels-offres/liste" className="text-sm font-semibold text-primary-700 underline">
            ← Retour à la liste
          </a>
        }
      />
    );
  }

  const renderTab = () => {
    switch (tab) {
      case 'dce':
        return <DceAnalysisTab tender={tender} />;
      case 'exigences':
        return <RequirementsTab tender={tender} />;
      case 'strategie':
        return <StrategyTab tender={tender} />;
      case 'gonogo':
        return <GoNoGoTab tender={tender} />;
      case 'memoire':
        return <MemoTab tender={tender} />;
      case 'documents':
        return <DocsTab tender={tender} />;
      case 'taches':
        return <TasksTab tender={tender} />;
      default:
        return <TenderOverview tender={tender} />;
    }
  };

  return (
    <div>
      <PageHeader
        overline={`Appels d'offres › ${tender.reference}`}
        title={tender.title}
        description={`${tender.buyer} — ${SECTOR_LABELS[tender.sector]}`}
        action={<DeadlineBadge date={tender.deadline} />}
        secondaryAction={<TenderStatusBadge status={tender.status} />}
      />

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <a
                key={t.id}
                href={`#appels-offres/ao/${tender.id}${t.id ? `/${t.id}` : ''}`}
                className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {t.label}
              </a>
            );
          })}
        </nav>
      </div>

      {renderTab()}
    </div>
  );
}
