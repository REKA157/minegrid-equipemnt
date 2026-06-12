import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import {
  listAccessibleTransactionCases,
  type TransactionCaseRow,
} from '../../../utils/api/transactionCases';

export interface TransactionCasesWidgetProps {
  widgetSize?: 'small' | 'medium' | 'large';
  dashboardRole?: string;
}

export default function TransactionCasesWidget({ widgetSize }: TransactionCasesWidgetProps) {
  const [rows, setRows] = useState<TransactionCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAccessibleTransactionCases();
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener('pipeline:refresh', onRefresh);
    return () => window.removeEventListener('pipeline:refresh', onRefresh);
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 py-6 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
        Chargement des dossiers…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 py-6 text-center text-sm text-gray-500">
        <FolderOpen className="h-10 w-10 text-gray-300" />
        <p>Aucun dossier transaction visible pour votre rôle.</p>
        <p className="text-xs text-gray-400">
          Un dossier est créé lorsqu’un acheteur connecté envoie une demande de prix sur une annonce (ou via workflows
          métier).
        </p>
        <a href="#dossiers" className="text-xs font-medium text-orange-700 hover:underline">
          Liste complète des dossiers
        </a>
      </div>
    );
  }

  const max = widgetSize === 'small' ? 5 : widgetSize === 'medium' ? 8 : 12;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <span className="text-xs text-gray-600">
          <span className="font-semibold text-gray-900">{rows.length}</span> dossier{rows.length > 1 ? 's' : ''}{' '}
          (RLS)
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600 transition hover:bg-gray-50"
        >
          <RefreshCw className="h-3 w-3" />
          Actualiser
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {rows.slice(0, max).map((r) => (
          <a
            key={r.id}
            href={`#dossier/${r.id}`}
            className="flex items-center justify-between gap-2 rounded border border-gray-100 bg-white px-2 py-1.5 text-left transition hover:border-orange-200 hover:bg-orange-50/40"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-gray-900">
                {r.title?.trim() || 'Dossier sans titre'}
              </div>
              <div className="truncate text-[10px] text-gray-500">
                {r.kind} · {r.status}
                {r.stage ? ` · ${r.stage}` : ''}
                {r.priority ? ` · prio ${r.priority}` : ''}
              </div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-orange-600" aria-hidden />
          </a>
        ))}
      </div>
      {rows.length > max ? (
        <div className="mt-2 text-center">
          <a href="#dossiers" className="text-[10px] font-medium text-orange-700 hover:underline">
            +{rows.length - max} autre(s)
          </a>
        </div>
      ) : null}
    </div>
  );
}
