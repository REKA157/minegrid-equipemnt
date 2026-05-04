import React, { useEffect, useMemo, useState } from 'react';
import { Filter, RefreshCw } from 'lucide-react';
import { getQuoteRequests, updateQuoteRequestStatus } from '../utils/api/quoteRequests';
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

  const groupedCount = useMemo(() => {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
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
            {rows.length} lead(s) affiché(s) — nouveaux: {groupedCount.new || 0}
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

      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Machine</th>
              <th className="text-left px-4 py-3">Acheteur</th>
              <th className="text-left px-4 py-3">Budget</th>
              <th className="text-left px-4 py-3">Message</th>
              <th className="text-left px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-gray-500 text-center" colSpan={6}>
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
