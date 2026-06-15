import React, { useEffect, useMemo, useState } from 'react';
import { Filter, RefreshCw, Info, ChevronDown, ChevronUp, Mail, FolderOpen } from 'lucide-react';
import {
  getQuoteRequests,
  updateQuoteRequestStatus,
  ensureTransactionCaseForQuote,
} from '../utils/api/quoteRequests';
import type { QuoteRequestRow, QuoteRequestStatus } from '../utils/api/quoteRequests';
import { useAuth } from '../hooks/useAuth';
import { trackEvent } from '../utils/analytics';

const STATUS_OPTIONS: Array<{ id: QuoteRequestStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Tous' },
  { id: 'new', label: 'Nouveaux' },
  { id: 'contacted', label: 'Contactés' },
  { id: 'qualified', label: 'Qualifiés' },
  { id: 'closed', label: 'Clôturés' },
];

const STATUS_BADGE: Record<QuoteRequestStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-amber-100 text-amber-900',
  qualified: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-700',
};

export default function LeadsInbox() {
  const { user, loading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<QuoteRequestStatus | 'all'>('all');
  const [rows, setRows] = useState<QuoteRequestRow[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);

  const toggleHelp = () => setHelpExpanded((v) => !v);

  const [error, setError] = useState<string | null>(null);

  const loadRows = async (status: QuoteRequestStatus | 'all') => {
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await getQuoteRequests(status);
      setRows(data);
    } catch (err) {
      const isMissingTable =
        typeof err === 'object' &&
        err !== null &&
        ((err as { cause?: { code?: string } }).cause?.code === 'PGRST205' ||
          (err as { code?: string }).code === 'PGRST205');
      if (isMissingTable) {
        setRows([]);
        setError("Le module Leads n'est pas encore activé sur votre base. Exécutez le script `sql/quote_requests.sql`.");
        return;
      }
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void loadRows(statusFilter);
  }, [statusFilter, user]);

  // Rattrapage : crée le dossier transaction d'un devis sans dossier lié (RPC existante).
  const [creatingCase, setCreatingCase] = useState<string | null>(null);
  const handleCreateDossier = async (quoteRequestId: string) => {
    setCreatingCase(quoteRequestId);
    setError(null);
    const r = await ensureTransactionCaseForQuote(quoteRequestId);
    setCreatingCase(null);
    if (r.ok && r.caseId) {
      setRows((prev) =>
        prev.map((row) => (row.id === quoteRequestId ? { ...row, transaction_case_id: r.caseId } : row)),
      );
    } else if (r.reason === 'not_deployed') {
      setError('RPC ensure_transaction_case_for_quote_request absente : appliquez sql/rpc_ensure_transaction_case_for_quote_request.sql.');
    } else if (r.reason === 'forbidden') {
      setError('Création du dossier refusée (droits). Vérifiez que l’acheteur est bien relié à la ligne.');
    } else {
      setError('Création du dossier impossible pour le moment.');
    }
  };

  const groupedCount = useMemo(() => {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
  }, [rows]);

  const dossierStats = useMemo(() => {
    let sansDossier = 0;
    let sansDossierSansSession = 0;
    for (const r of rows) {
      if (!r.transaction_case_id) {
        sansDossier += 1;
        if (!r.buyer_user_id) sansDossierSansSession += 1;
      }
    }
    return { sansDossier, sansDossierSansSession };
  }, [rows]);

  const handleStatusChange = async (id: string, next: QuoteRequestStatus) => {
    try {
      await updateQuoteRequestStatus(id, next);
      trackEvent('lead_status_update', { next_status: next });
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: next } : r)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de mettre à jour');
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-12 text-gray-500">Chargement…</div>;
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-14 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Inbox leads</h1>
        <p className="text-gray-600 mb-6">
          Connectez-vous pour consulter les demandes de devis reçues.
        </p>
        <a
          href="#connexion"
          className="inline-flex rounded-md bg-orange-600 px-5 py-2.5 text-white font-medium hover:bg-orange-700"
        >
          Se connecter
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demandes de devis</h1>
          <p className="text-sm text-gray-600 mt-1">
            {rows.length} lead(s) affiché(s) — nouveaux : {groupedCount.new || 0}
            {dossierStats.sansDossier > 0 && (
              <span className="text-amber-800">
                {' '}
                · sans dossier lié : {dossierStats.sansDossier}
                {dossierStats.sansDossierSansSession > 0 ? (
                  <span className="text-gray-600">
                    {' '}
                    (dont {dossierStats.sansDossierSansSession} sans session acheteur)
                  </span>
                ) : null}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRows(statusFilter)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-700 font-medium">
          <Filter className="h-4 w-4" />
          Filtrer par statut
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                statusFilter === s.id
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {dossierStats.sansDossier > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium mb-1">Colonne « Dossier » en « — » : c’est attendu dans certains cas</p>
          <ul className="list-disc pl-5 space-y-1 text-amber-900/95">
            <li>
              <strong>Sans session</strong> : l’acheteur a envoyé le formulaire sans être connecté → lead enregistré, mais pas
              de dossier transaction automatique (le vendeur peut suivre depuis cette liste et par email).
            </li>
            <li>
              <strong>Avec session</strong> et toujours sans lien : vérifiez le déploiement SQL{' '}
              <code className="text-xs bg-white/90 px-1 rounded border border-amber-200/80">
                transaction_platform_core.sql
              </code>{' '}
              (+{' '}
              <code className="text-xs bg-white/90 px-1 rounded border border-amber-200/80">
                patch_transaction_participants_insert_buyer.sql
              </code>{' '}
              ou{' '}
              <code className="text-xs bg-white/90 px-1 rounded border border-amber-200/80">
                transaction_platform_extended.sql
              </code>
              ). Pour les anciennes lignes avec acheteur identifié :{' '}
              <code className="text-xs bg-white/90 px-1 rounded border border-amber-200/80">
                sql/backfill_dossiers_from_quote_requests.sql
              </code>
              .
            </li>
          </ul>
        </div>
      )}

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/90 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={toggleHelp}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-100/80 transition-colors"
          aria-expanded={helpExpanded}
          id="leads-help-toggle"
        >
          <span className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-800">
              <Info className="h-4 w-4" aria-hidden />
            </span>
            <span>
              <span className="font-semibold text-slate-900 block">Aide : Leads, dossiers et emails</span>
              {!helpExpanded && (
                <span className="text-sm text-slate-600 block mt-0.5">
                  Cet écran = vos demandes en tant que{' '}
                  <span className="whitespace-nowrap">vendeur en base</span>. Les emails Contact et les dossiers{' '}
                  <span className="whitespace-nowrap">transaction</span> ne sont pas la même chose — ouvrir pour le détail.
                </span>
              )}
            </span>
          </span>
          <span className="shrink-0 text-slate-500 flex items-center gap-1 text-sm font-medium">
            {helpExpanded ? (
              <>
                Masquer <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Afficher <ChevronDown className="h-4 w-4" />
              </>
            )}
          </span>
        </button>

        {helpExpanded && (
          <div
            className="px-4 pb-4 pt-0 border-t border-slate-200/80 text-sm text-slate-700 space-y-4"
            role="region"
            aria-labelledby="leads-help-toggle"
          >
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Qui voit ce tableau ?
              </h2>
              <ul className="list-disc pl-5 space-y-1 marker:text-orange-500">
                <li>
                  Vous voyez les lignes où la base vous a enregistré comme vendeur de la demande (
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">seller_id</code>
                  <span className="text-slate-500"> = votre compte</span>
                  ). C’est votre <strong className="font-medium text-slate-800">boîte vendeur</strong> pour les leads
                  capturés depuis le site.
                </li>
                <li>
                  Les <strong className="font-medium text-slate-800">acheteurs</strong> ne passent pas par cette page : ils utilisent le{' '}
                  <strong className="font-medium text-slate-800">formulaire sur la fiche machine</strong>.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                Colonne « Dossier » (pourquoi « — » ?)
              </h2>
              <p className="mb-2 text-slate-600">
                Ici, « Dossier » = <strong className="font-medium text-slate-800">dossier transaction</strong> déjà lié à la demande.
                Tant que{' '}
                <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">transaction_case_id</code> est vide, le lien
                reste « — » (normal dans plusieurs cas).
              </p>
              <p className="mb-2 font-medium text-slate-800">Pour qu’un lien « Ouvrir » apparaisse, il faut notamment :</p>
              <ul className="list-disc pl-5 space-y-1 marker:text-orange-500">
                <li>L’acheteur est <strong className="font-medium text-slate-800">connecté</strong> au moment de la demande (pour que le système crée et rattache un dossier).</li>
                <li>Le vendeur sur l’annonce est bien identifié dans la table machines (champs courants :{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">seller_id</code>,{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">sellerid</code>,{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">user_id</code>,{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">owner_id</code>…).</li>
                <li>L’acheteur n’est pas la même personne que le vendeur sur cette annonce.</li>
                <li>
                  Les scripts SQL plateforme transaction sont déployés :{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">
                    sql/transaction_platform_core.sql
                  </code>{' '}
                  , puis{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">
                    sql/transaction_platform_extended.sql
                  </code>{' '}
                  (ou au minimum{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">
                    sql/patch_transaction_participants_insert_buyer.sql
                  </code>{' '}
                  pour la policy participants compatible acheteur créateur).
                  Table{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">quote_requests</code>{' '}
                  à jour avec RLS permettant à l’acheteur de mettre à jour sa ligne après création du dossier.
                </li>
              </ul>
              <p className="mt-2 text-slate-600">
                Retrouvez vos dossiers depuis le menu{' '}
                <a href="#dossiers" className="text-orange-700 font-medium hover:underline">
                  Mes dossiers
                </a>
                , ou ouvrez directement{' '}
                <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">#dossier/&lt;uuid&gt;</code> si vous connaissez l’identifiant.
              </p>
            </section>

            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                Emails (contact) ≠ cette liste « Leads »
              </h2>
              <p className="mb-2 text-slate-600">
                La notification envoyée après le formulaire de contact passe par l’Edge Function{' '}
                <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">send-contact-email</code>.
                Elle ne réutilise pas la colonne dossier ci-dessus ; c’est un <strong className="font-medium text-slate-800">autre flux</strong> (email instantané).
              </p>
              <ul className="list-disc pl-5 space-y-1 marker:text-orange-500">
                <li>
                  Si le corps de la requête contient un{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">machineId</code>{' '}
                  valide, la fonction tente de joindre l’email du <strong className="font-medium text-slate-800">propriétaire de l’annonce</strong>, en lisant les champs vendeur/loueur sur{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">machines</code> puis Auth / tables annexes ({' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">users</code>,{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">pro_clients</code>…) — la clé{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">SUPABASE_SERVICE_ROLE_KEY</code> doit être disponible pour la fonction.
                </li>
                <li>
                  Sinon (ou si l’owner n’a pas été résolu), l’email part vers la boîte générique{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">CONTACT_RECEIVER_EMAIL</code>. Idéalement, gardez la même valeur dans{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">VITE_CONTACT_RECEIVER_EMAIL</code>{' '}
                  côté site pour ce repli cohérent.
                </li>
                <li>
                  Option trace :{' '}
                  <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200">CONTACT_INQUIRY_BCC_EMAIL</code>{' '}
                  pour une copie cachée quand le destinataire est le propriétaire de l’annonce (non obligatoire).
                </li>
              </ul>
            </section>
          </div>
        )}
      </div>

      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Machine</th>
              <th className="text-left px-4 py-3">Acheteur</th>
              <th className="text-left px-4 py-3">Budget</th>
              <th className="text-left px-4 py-3">Message</th>
              <th
                className="text-left px-4 py-3"
                title="Lien actif lorsque transaction_case_id est renseigné (dossier transaction lié au devis)."
              >
                Dossier
              </th>
              <th className="text-left px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-gray-500 text-center" colSpan={7}>
                  Aucun lead pour ce filtre.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                  {new Date(row.created_at).toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{row.machine_name}</div>
                  {row.brand && <div className="text-xs text-gray-500">{row.brand}</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{row.buyer_name}</div>
                  <a href={`mailto:${row.buyer_email}`} className="text-orange-700 hover:underline">
                    {row.buyer_email}
                  </a>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {row.buyer_user_id ? (
                      <span title="Une session acheteur était active lors de l’envoi (UUID stocké).">
                        Session acheteur : identifiée
                      </span>
                    ) : (
                      <span title="Pas de compte relié à la ligne : dossier transaction automatique impossible.">
                        Session acheteur : non reliée au site
                      </span>
                    )}
                  </div>
                  {row.buyer_phone && <div className="text-xs text-gray-500">{row.buyer_phone}</div>}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {row.budget_min || row.budget_max
                    ? `${row.budget_min || '—'} - ${row.budget_max || '—'}`
                    : 'Non renseigné'}
                </td>
                <td className="px-4 py-3 max-w-sm">
                  <p className="line-clamp-3 text-gray-700">{row.message || '—'}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.transaction_case_id ? (
                    <a
                      href={`#dossier/${row.transaction_case_id}`}
                      className="text-orange-700 font-medium text-sm hover:underline"
                    >
                      Ouvrir
                    </a>
                  ) : row.buyer_user_id ? (
                    <button
                      type="button"
                      disabled={creatingCase === row.id}
                      onClick={() => void handleCreateDossier(row.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-800 transition hover:bg-orange-100 disabled:opacity-50"
                      title="Créer le dossier transaction lié à ce devis (acheteur relié)."
                    >
                      {creatingCase === row.id ? 'Création…' : 'Créer le dossier'}
                    </button>
                  ) : (
                    <span
                      className="text-gray-400 text-sm"
                      title="Acheteur non relié : dossier transaction automatique impossible (voir l’aide ci-dessus)."
                    >
                      —
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={row.status}
                    onChange={(e) =>
                      void handleStatusChange(row.id, e.target.value as QuoteRequestStatus)
                    }
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}
                  >
                    <option value="new">new</option>
                    <option value="contacted">contacted</option>
                    <option value="qualified">qualified</option>
                    <option value="closed">closed</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
