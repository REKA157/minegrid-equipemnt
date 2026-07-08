/**
 * Onglet Aperçu : frise du workflow, prochaine action recommandée,
 * informations du marché, critères de notation, historique (traçabilité).
 * Le changement de statut est contrôlé ici (avec droits selon rôle).
 */

import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Trash2 } from 'lucide-react';
import { useNavigate } from '../../../router';
import { useTendersStore } from '../../store/tendersStore';
import {
  Card,
  ConfirmDialog,
  GuideBanner,
  SectionCard,
  Select,
  WarningBanner,
} from '../../components/ui';
import { nextAction } from '../TendersList';
import { MemberSelect } from '../../components/MemberSelect';
import type { Tender, TenderStatus } from '../../types';
import {
  MARKET_TYPE_LABELS,
  TENDER_STATUS_LABELS,
  TENDER_WORKFLOW,
  can,
  daysUntil,
  formatAmount,
  formatDate,
} from '../../types';
import { toast } from '../../../utils/toast';

export default function TenderOverview({ tender }: { tender: Tender }) {
  const navigate = useNavigate();
  const setTenderStatus = useTendersStore((s) => s.setTenderStatus);
  const updateTender = useTendersStore((s) => s.updateTender);
  const deleteTender = useTendersStore((s) => s.deleteTender);
  const role = useTendersStore((s) => s.settings.currentUserRole);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const action = nextAction(tender);
  const workflowIndex = TENDER_WORKFLOW.indexOf(tender.status);
  const isClosed = ['gagne', 'perdu', 'abandonne'].includes(tender.status);
  const days = daysUntil(tender.deadline);
  const editable = can(role, 'edit');

  const missingCritical =
    !tender.dceAnalysis ||
    tender.requirements.length === 0 ||
    !tender.goNoGo.decision ||
    !tender.strategy ||
    tender.requirements.some((r) => r.coverage === 'non_conforme');

  return (
    <div className="space-y-6">
      {/* Prochaine action — le « prochain bouton utile » */}
      <GuideBanner>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <strong>Prochaine étape :</strong> {action.label}
          </span>
          <button
            type="button"
            onClick={() => navigate(action.to)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Y aller <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </GuideBanner>

      {days >= 0 && days <= 5 && !isClosed && tender.status !== 'depose' && (
        <WarningBanner>
          ⏰ Il ne reste que <strong>{days} jour(s)</strong> avant la date limite de remise (
          {formatDate(tender.deadline)}). Concentrez l'équipe sur les pièces manquantes.
        </WarningBanner>
      )}

      {/* Frise du workflow */}
      {!isClosed && (
        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Avancement du dossier</h2>
          <ol className="flex flex-wrap items-center gap-y-3">
            {TENDER_WORKFLOW.map((status, i) => {
              const done = workflowIndex > i;
              const current = workflowIndex === i;
              return (
                <li key={status} className="flex items-center">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                        done
                          ? 'bg-green-500 text-white'
                          : current
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </span>
                    <span
                      className={`text-xs ${
                        current ? 'font-semibold text-primary-700' : done ? 'text-gray-600' : 'text-gray-400'
                      }`}
                    >
                      {TENDER_STATUS_LABELS[status]}
                    </span>
                  </div>
                  {i < TENDER_WORKFLOW.length - 1 && (
                    <span className={`mx-2 h-px w-5 ${done ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Informations du marché */}
        <SectionCard
          title="Informations du marché"
          action={
            editable ? (
              <div className="relative">
                <Select
                  value={tender.status}
                  onChange={(e) => {
                    setTenderStatus(tender.id, e.target.value as TenderStatus);
                    toast.success('Statut mis à jour.');
                  }}
                  className="!w-auto pr-8 text-xs"
                  title="Changer le statut du dossier"
                >
                  {Object.entries(TENDER_STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            ) : undefined
          }
        >
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Référence</dt>
              <dd className="font-medium text-gray-900">{tender.reference}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Acheteur</dt>
              <dd className="text-right font-medium text-gray-900">{tender.buyer}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Type de marché</dt>
              <dd className="font-medium text-gray-900">{MARKET_TYPE_LABELS[tender.marketType]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Montant estimé</dt>
              <dd className="font-medium text-gray-900">
                {formatAmount(tender.estimatedAmount, tender.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Date limite</dt>
              <dd className="font-medium text-gray-900">{formatDate(tender.deadline)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Rédacteur affecté</dt>
              <dd className="min-w-0 flex-1">
                {editable ? (
                  <MemberSelect
                    value={tender.leadWriter ?? ''}
                    onChange={(name, member) =>
                      updateTender(
                        tender.id,
                        {
                          leadWriter: name || undefined,
                          leadWriterId: member?.fromOrg ? member.id : undefined,
                        },
                        name ? `Rédacteur affecté : ${name}` : 'Rédacteur retiré',
                      )
                    }
                  />
                ) : (
                  <span className="block text-right font-medium text-gray-900">
                    {tender.leadWriter || '—'}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {tender.sourceUrl && (
            <a
              href={tender.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
            >
              <ArrowRight className="h-3 w-3" /> Voir l'appel d'offres d'origine (Global Monitor)
            </a>
          )}
          {tender.description && (
            <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">{tender.description}</p>
          )}
        </SectionCard>

        {/* Critères de notation */}
        <SectionCard
          title="Critères de notation"
          hint="Ils orientent l'effort : un critère « valeur technique » fort justifie d'investir dans le mémoire."
        >
          {tender.awardCriteria.length === 0 ? (
            <p className="text-sm text-gray-500">
              Aucun critère renseigné. L'analyse du DCE peut les extraire automatiquement (onglet Analyse DCE).
            </p>
          ) : (
            <ul className="space-y-2">
              {tender.awardCriteria.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-primary-500"
                      style={{ width: `${Math.min(100, c.weight)}%` }}
                    />
                  </div>
                  <span className="w-40 truncate text-sm text-gray-700">{c.label}</span>
                  <span className="w-12 text-right text-sm font-semibold text-gray-900">{c.weight} %</span>
                </li>
              ))}
            </ul>
          )}
          {missingCritical && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ Informations critiques incomplètes :{' '}
              {[
                !tender.dceAnalysis && 'analyse DCE non faite',
                tender.requirements.length === 0 && 'exigences non extraites',
                tender.requirements.some((r) => r.coverage === 'non_conforme') && 'non-conformités ouvertes',
                !tender.goNoGo.decision && 'décision go/no-go non actée',
                !tender.strategy && 'stratégie de réponse non définie',
              ]
                .filter(Boolean)
                .join(' · ')}
              .
            </p>
          )}
        </SectionCard>
      </div>

      {/* Historique — traçabilité */}
      <SectionCard
        title="Historique du dossier"
        hint="Toutes les actions importantes sont tracées automatiquement."
      >
        {tender.history.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun événement enregistré.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-gray-200 pl-5">
            {[...tender.history].reverse().map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary-400" />
                <div className="text-sm text-gray-900">
                  <span className="font-medium">{h.action}</span>
                  {h.detail && <span className="text-gray-500"> — {h.detail}</span>}
                </div>
                <div className="text-xs text-gray-400">
                  {h.author} · {formatDate(h.date)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      {can(role, 'delete') && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" /> Supprimer ce dossier
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer le dossier ?"
        message={`« ${tender.title} » et tous ses documents générés seront définitivement supprimés. Cette action est irréversible.`}
        confirmLabel="Supprimer définitivement"
        onConfirm={() => {
          deleteTender(tender.id);
          toast.success('Dossier supprimé.');
          navigate('appels-offres/liste');
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
