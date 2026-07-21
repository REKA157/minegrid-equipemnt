/**
 * Tableau de bord du module — chaque bloc mène à une action concrète :
 * cliquer sur une urgence ouvre le dossier, cliquer sur une pièce manquante
 * ouvre l'onglet documents du dossier, etc. Pas de widget décoratif.
 */

import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  FileWarning,
  FolderOpen,
  Plus,
  ScrollText,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from '../../router';
import { useTendersStore } from '../store/tendersStore';
import {
  Card,
  DeadlineBadge,
  EmptyState,
  GuideBanner,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  TenderStatusBadge,
} from '../components/ui';
import { can, daysUntil, formatDate } from '../types';

export default function TendersDashboard() {
  const navigate = useNavigate();
  const tenders = useTendersStore((s) => s.tenders);
  const documents = useTendersStore((s) => s.documents);
  // Création masquée pour le rôle « lecteur » (consultation seule).
  const canCreate = can(useTendersStore((s) => s.settings.currentUserRole), 'edit');

  const active = tenders.filter(
    (t) => !['gagne', 'perdu', 'abandonne', 'depose'].includes(t.status),
  );
  const urgent = active
    .filter((t) => daysUntil(t.deadline) <= 10 && daysUntil(t.deadline) >= 0)
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));
  const toAnalyze = tenders.filter((t) => ['brouillon', 'en_analyse'].includes(t.status));
  const toComplete = tenders.filter((t) => t.status === 'a_completer');
  const missingPieces = active
    .map((t) => ({
      tender: t,
      missing: t.requiredDocuments.filter((d) => !d.available && !d.generatedDocId),
    }))
    .filter((x) => x.missing.length > 0);
  const pendingGoNoGo = active.filter((t) => !t.goNoGo.decision);

  const nextDeadline = [...active]
    .filter((t) => daysUntil(t.deadline) >= 0)
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline))[0];

  const stats: {
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    to: string;
    accent?: string;
  }[] = [
    { label: 'AO en cours', value: active.length, icon: FolderOpen, to: 'appels-offres/liste' },
    {
      label: 'Dossiers urgents (≤ 10 j)',
      value: urgent.length,
      icon: CalendarClock,
      to: 'appels-offres/liste',
      accent: urgent.length > 0 ? 'text-red-600' : undefined,
    },
    {
      label: 'À analyser (go/no-go)',
      value: pendingGoNoGo.length,
      icon: Sparkles,
      to: pendingGoNoGo[0] ? `appels-offres/ao/${pendingGoNoGo[0].id}/gonogo` : 'appels-offres/liste',
    },
    {
      label: 'Documents générés',
      value: documents.length,
      icon: ScrollText,
      to: 'appels-offres/documents',
    },
  ];

  return (
    <div>
      <PageHeader
        overline="Appels d'offres"
        title="Tableau de bord"
        description="Vue d'ensemble de vos dossiers. Commencez par les urgences ci-dessous, ou créez un nouveau dossier."
        action={
          canCreate ? (
            <PrimaryButton onClick={() => navigate('appels-offres/nouveau')}>
              <Plus className="h-4 w-4" /> Nouvel appel d'offres
            </PrimaryButton>
          ) : undefined
        }
        secondaryAction={
          canCreate ? (
            <SecondaryButton onClick={() => navigate('appels-offres/cahiers/nouveau')}>
              <ScrollText className="h-4 w-4" /> Créer un cahier des charges
            </SecondaryButton>
          ) : undefined
        }
      />

      {tenders.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-10 w-10" />}
          title="Aucun dossier pour l'instant"
          message="Créez votre premier appel d'offres pour dérouler le parcours complet : analyse du DCE, conformité, décision go/no-go, production des pièces et export du dossier."
          action={
            canCreate ? (
              <PrimaryButton onClick={() => navigate('appels-offres/nouveau')}>
                <Plus className="h-4 w-4" /> Créer mon premier dossier
              </PrimaryButton>
            ) : undefined
          }
        />
      ) : (
        <>
          {nextDeadline && (
            <GuideBanner>
              <strong>Prochaine échéance :</strong> « {nextDeadline.title} » —{' '}
              {formatDate(nextDeadline.deadline)} (J-{daysUntil(nextDeadline.deadline)}).{' '}
              <a
                href={`#appels-offres/ao/${nextDeadline.id}`}
                className="font-semibold underline underline-offset-2"
              >
                Ouvrir le dossier →
              </a>
            </GuideBanner>
          )}

          {/* Indicateurs — chacun est cliquable */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card
                  key={stat.label}
                  className="p-4"
                  onClick={() => navigate(stat.to)}
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-gray-400" />
                    <ArrowRight className="h-4 w-4 text-gray-300" />
                  </div>
                  <div className={`mt-2 text-3xl font-bold ${stat.accent ?? 'text-gray-900'}`}>
                    {stat.value}
                  </div>
                  <div className="text-sm text-gray-500">{stat.label}</div>
                </Card>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Échéances proches */}
            <Card className="p-5">
              <h2 className="mb-1 text-base font-semibold text-gray-900">
                Dates limites de remise
              </h2>
              <p className="mb-4 text-xs text-gray-500">
                Cliquez sur un dossier pour reprendre le travail là où il en est.
              </p>
              {active.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun dossier actif.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {[...active]
                    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline))
                    .slice(0, 5)
                    .map((t) => (
                      <li key={t.id}>
                        <a
                          href={`#appels-offres/ao/${t.id}`}
                          className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 rounded-lg px-2 -mx-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-gray-900">
                              {t.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <TenderStatusBadge status={t.status} />
                              <span className="text-xs text-gray-400">{t.buyer}</span>
                            </div>
                          </div>
                          <DeadlineBadge date={t.deadline} />
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            {/* Alertes pièces manquantes */}
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
                <FileWarning className="h-4 w-4 text-amber-500" />
                Pièces manquantes
              </h2>
              <p className="mb-4 text-xs text-gray-500">
                Chaque pièce absente au dépôt rend l'offre irrégulière — traitez-les en priorité.
              </p>
              {missingPieces.length === 0 ? (
                <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  ✓ Aucune pièce manquante sur les dossiers actifs.
                </p>
              ) : (
                <ul className="space-y-3">
                  {missingPieces.slice(0, 4).map(({ tender, missing }) => (
                    <li key={tender.id}>
                      <a
                        href={`#appels-offres/ao/${tender.id}/documents`}
                        className="block rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 hover:bg-amber-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {tender.reference}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-amber-700">
                            {missing.length} pièce(s)
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-gray-600">
                          {missing.map((m) => m.label).join(' · ')}
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Opportunités à analyser */}
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
                <Sparkles className="h-4 w-4 text-primary-500" />
                Opportunités à analyser
              </h2>
              <p className="mb-4 text-xs text-gray-500">
                Dossiers sans décision go/no-go : décidez vite pour ne pas mobiliser les équipes inutilement.
              </p>
              {pendingGoNoGo.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Toutes les opportunités actives ont une décision.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {pendingGoNoGo.slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <a
                        href={`#appels-offres/ao/${t.id}/gonogo`}
                        className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">{t.title}</div>
                          <div className="text-xs text-gray-400">{t.buyer}</div>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary-700">
                          Scorer <ArrowRight className="h-3 w-3" />
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Dossiers à compléter */}
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Dossiers à compléter ou en analyse
              </h2>
              <p className="mb-4 text-xs text-gray-500">
                Ces dossiers attendent une action de votre équipe.
              </p>
              {toComplete.length + toAnalyze.length === 0 ? (
                <p className="text-sm text-gray-500">Rien en attente — bon signe.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {[...toComplete, ...toAnalyze].slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <a
                        href={`#appels-offres/ao/${t.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">{t.title}</div>
                          <div className="mt-0.5">
                            <TenderStatusBadge status={t.status} />
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
