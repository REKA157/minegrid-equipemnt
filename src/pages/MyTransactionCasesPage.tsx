import React, { useEffect, useState } from 'react';
import { FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { listMyTransactionCases, type TransactionCaseRow } from '../utils/api/transactionCases';

export default function MyTransactionCasesPage() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<TransactionCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listMyTransactionCases();
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [user?.id]);

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-gray-500 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Chargement…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14 text-center">
        <FolderOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Mes dossiers</h1>
        <p className="text-gray-600 text-sm mb-6">Connectez-vous pour voir les dossiers transaction liés à votre compte.</p>
        <a
          href="#connexion"
          className="inline-flex rounded-md bg-orange-600 px-5 py-2.5 text-white text-sm font-medium hover:bg-orange-700"
        >
          Connexion
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderOpen className="h-7 w-7 text-orange-600" />
            Mes dossiers
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Dossiers visibles selon vos droits Supabase : vendeur / acheteur, participant ou admin d&apos;organisation sur
            le dossier (RLS).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-gray-600 py-8">
          <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
          Chargement des dossiers…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-950 space-y-3">
          <p className="font-medium">Aucun dossier visible pour votre compte.</p>
          <p className="text-amber-900/90">
            Ce n’est pas une erreur si vous n’avez pas encore de flux « acheteur connecté → devis sur annonce d’un tiers » : les dossiers sont une couche distincte des emails et des lignes{' '}
            <a href="#leads" className="underline font-medium">
              Leads
            </a>
            .
          </p>
          <ul className="list-disc pl-5 space-y-1 text-amber-900/90">
            <li>
              Déploiement conseillé :{' '}
              <code className="text-xs bg-white/80 px-1 rounded">sql/transaction_platform_core.sql</code> puis{' '}
              <code className="text-xs bg-white/80 px-1 rounded">sql/transaction_platform_extended.sql</code> (ou{' '}
              <code className="text-xs bg-white/80 px-1 rounded">sql/patch_transaction_participants_insert_buyer.sql</code>{' '}
              pour corriger la policy participants si vous n’utilisez pas l’extended).
            </li>
            <li>
              Création automatique : un <strong>acheteur connecté</strong> envoie une <strong>demande de devis</strong> sur une annonce d’un{' '}
              <strong>autre</strong> vendeur — la ligne Leads peut alors afficher « Ouvrir » dans la colonne Dossier.
            </li>
            <li>
              <strong>Rattrapage données</strong> (SQL Editor, rôle postgres) :{' '}
              <code className="text-xs bg-white/80 px-1 rounded">sql/backfill_dossiers_from_quote_requests.sql</code>{' '}
              pour les anciennes demandes avec acheteur déjà stocké dans la colonne{' '}
              <code className="text-xs bg-white/80 px-1 rounded">buyer_user_id</code>.
            </li>
            <li>
              Ouverture directe si vous connaissez l’id :{' '}
              <span className="font-mono text-xs">#dossier/&lt;uuid&gt;</span>
            </li>
          </ul>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-700">
              <tr>
                <th className="px-4 py-3">Titre</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Créé le</th>
                <th className="px-4 py-3 w-28">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {r.title?.trim() || 'Dossier sans titre'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.kind}</td>
                  <td className="px-4 py-3 text-gray-700">{r.status}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {new Date(r.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`#dossier/${r.id}`}
                      className="text-orange-700 font-medium hover:underline"
                    >
                      Ouvrir
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
