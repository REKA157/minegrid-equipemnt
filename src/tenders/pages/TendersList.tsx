/**
 * Liste des appels d'offres avec filtre par statut et recherche.
 * Chaque ligne mène au dossier ; la colonne « Prochaine action » dit
 * concrètement quoi faire (règle UX du module).
 */

import React, { useMemo, useState } from 'react';
import { FolderOpen, Plus, Search } from 'lucide-react';
import { useNavigate } from '../../router';
import { useTendersStore } from '../store/tendersStore';
import {
  Card,
  DeadlineBadge,
  EmptyState,
  PageHeader,
  PrimaryButton,
  Select,
  TenderStatusBadge,
  TextInput,
} from '../components/ui';
import type { Tender, TenderStatus } from '../types';
import { SECTOR_LABELS, TENDER_STATUS_LABELS, daysUntil, formatAmount } from '../types';

/**
 * Prochaine action conseillée — suit la logique centrale du module :
 * DCE reçu → extraction des exigences → analyse de conformité → go/no-go
 * → stratégie de réponse → réponse point par point → pièces finales.
 */
export function nextAction(t: Tender): { label: string; to: string } {
  const base = `appels-offres/ao/${t.id}`;
  if (['gagne', 'perdu', 'abandonne'].includes(t.status)) {
    return { label: 'Consulter l\'historique', to: base };
  }
  if (t.status === 'depose') return { label: 'Saisir le résultat (gagné/perdu)', to: base };
  if (!t.dceAnalysis) return { label: 'Analyser le DCE', to: `${base}/dce` };
  if (t.requirements.length === 0) {
    return { label: 'Extraire les exigences du DCE', to: `${base}/exigences` };
  }
  const nonCompliant = t.requirements.filter((r) => r.coverage === 'non_conforme');
  if (nonCompliant.length > 0) {
    return { label: `Lever ${nonCompliant.length} non-conformité(s)`, to: `${base}/exigences` };
  }
  if (!t.goNoGo.decision) return { label: 'Décider go / no-go', to: `${base}/gonogo` };
  if (!t.strategy) return { label: 'Définir la stratégie de réponse', to: `${base}/strategie` };
  const unanswered = t.requirements.filter((r) => !r.response.trim());
  if (unanswered.length > 0) {
    return { label: `Répondre à ${unanswered.length} exigence(s)`, to: `${base}/exigences` };
  }
  const missing = t.requiredDocuments.filter((d) => !d.available && !d.generatedDocId);
  if (missing.length > 0) {
    return { label: `Produire ${missing.length} pièce(s)`, to: `${base}/documents` };
  }
  if (t.status === 'en_validation') return { label: 'Faire valider les documents', to: `${base}/documents` };
  if (t.status === 'pret_a_deposer') return { label: 'Exporter le dossier final (ZIP)', to: `${base}/documents` };
  return { label: 'Finaliser le dossier de réponse', to: `${base}/documents` };
}

export default function TendersList() {
  const navigate = useNavigate();
  const tenders = useTendersStore((s) => s.tenders);
  const currentUserName = useTendersStore((s) => s.settings.currentUserName);
  const currentUserId = useTendersStore((s) => s.settings.currentUserId);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TenderStatus | 'tous' | 'actifs'>('actifs');
  const [mineOnly, setMineOnly] = useState(false);

  // Dossiers où l'utilisateur courant est affecté (rédacteur du dossier, ou
  // responsable/assigné d'une exigence ou d'une tâche). En mode partagé, on
  // matche d'abord par id de compte (fiable) ; sinon par nom (mode local).
  const isMine = (t: (typeof tenders)[number]): boolean => {
    if (currentUserId && t.leadWriterId === currentUserId) return true;
    const me = currentUserName.trim().toLowerCase();
    if (!me) return false;
    if ((t.leadWriter ?? '').trim().toLowerCase() === me) return true;
    if (t.requirements.some((r) => r.responsible.trim().toLowerCase() === me)) return true;
    return t.tasks.some((tk) => tk.assignee.trim().toLowerCase() === me);
  };
  const mineCount = tenders.filter(isMine).length;

  const filtered = useMemo(() => {
    let list = [...tenders];
    if (mineOnly) list = list.filter(isMine);
    if (statusFilter === 'actifs') {
      list = list.filter((t) => !['gagne', 'perdu', 'abandonne'].includes(t.status));
    } else if (statusFilter !== 'tous') {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.reference.toLowerCase().includes(q) ||
          t.buyer.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenders, query, statusFilter, mineOnly, currentUserName, currentUserId]);

  return (
    <div>
      <PageHeader
        overline="Appels d'offres"
        title="Mes dossiers"
        description="Retrouvez tous vos dossiers de réponse. La colonne « Prochaine action » vous dit quoi faire sur chacun."
        action={
          <PrimaryButton onClick={() => navigate('appels-offres/nouveau')}>
            <Plus className="h-4 w-4" /> Nouvel appel d'offres
          </PrimaryButton>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <TextInput
            placeholder="Rechercher par titre, référence ou acheteur…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-60">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TenderStatus | 'tous' | 'actifs')}
          >
            <option value="actifs">Dossiers actifs</option>
            <option value="tous">Tous les statuts</option>
            {Object.entries(TENDER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          className={`shrink-0 whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-medium ${
            mineOnly
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title="N'afficher que les dossiers où je suis affecté (rédacteur, responsable ou assigné)"
        >
          Mes affectations ({mineCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-10 w-10" />}
          title={tenders.length === 0 ? 'Aucun appel d\'offres' : 'Aucun résultat'}
          message={
            tenders.length === 0
              ? 'Créez un dossier pour démarrer : saisissez les informations de l\'AO, importez le DCE, puis laissez le parcours guidé vous accompagner jusqu\'au dépôt.'
              : 'Modifiez votre recherche ou le filtre de statut pour retrouver vos dossiers.'
          }
          action={
            tenders.length === 0 ? (
              <PrimaryButton onClick={() => navigate('appels-offres/nouveau')}>
                <Plus className="h-4 w-4" /> Créer un dossier
              </PrimaryButton>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Dossier</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Échéance</th>
                  <th className="hidden px-4 py-3 md:table-cell">Montant estimé</th>
                  <th className="px-4 py-3">Prochaine action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map((t) => {
                  const action = nextAction(t);
                  return (
                    <tr
                      key={t.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`appels-offres/ao/${t.id}`)}
                    >
                      <td className="max-w-xs px-4 py-3">
                        <div className="truncate font-medium text-gray-900">{t.title}</div>
                        <div className="truncate text-xs text-gray-500">
                          {t.reference} — {t.buyer} — {SECTOR_LABELS[t.sector]}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <TenderStatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3">
                        <DeadlineBadge date={t.deadline} />
                      </td>
                      <td className="hidden px-4 py-3 text-gray-700 md:table-cell">
                        {formatAmount(t.estimatedAmount, t.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`#${action.to}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                        >
                          {action.label} →
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
