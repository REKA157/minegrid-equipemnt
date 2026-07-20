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
            Vos dossiers d&apos;achat et de vente : devis, négociation, transaction et séquestre,
            partagés entre les participants du dossier.
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
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
          <FolderOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="font-semibold text-gray-900 mb-1">Aucun dossier pour le moment</p>
          <p className="text-sm text-gray-600 max-w-md mx-auto mb-6">
            Un dossier est créé automatiquement dès que vous envoyez une demande de devis
            sur une annonce, ou qu&apos;un acheteur en envoie une sur l&apos;une des vôtres.
            Vous y suivrez ensemble le devis, la négociation et la transaction.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="#machines"
              className="inline-flex rounded-md bg-orange-600 px-5 py-2.5 text-white text-sm font-medium hover:bg-orange-700"
            >
              Parcourir les machines
            </a>
            <a
              href="#leads"
              className="inline-flex rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Voir mes demandes reçues
            </a>
          </div>
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
