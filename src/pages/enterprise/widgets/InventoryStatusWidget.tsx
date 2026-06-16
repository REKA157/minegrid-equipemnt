import React, { useEffect, useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { loadStockActions, type StockAction, type StockPriority } from '../../../utils/recommendations/stockActions';

/**
 * STOCK — ACTIONS COMMERCIALES RECOMMANDÉES (remplace l'ancien « état du stock » passif).
 * Self-contained : charge les annonces RÉELLES du vendeur et, pour chacune, croise vues ×
 * devis × dossier × ancienneté pour proposer UNE action (créer dossier, améliorer l'annonce,
 * booster la visibilité, promouvoir). Anti-façade : aucune donnée fabriquée ; une machine
 * saine ne génère rien ; état vide honnête si le stock est sain ou absent.
 */
const PRIO_CLS: Record<StockPriority, string> = {
  high: 'border-red-200 bg-red-50',
  medium: 'border-amber-200 bg-amber-50',
  low: 'border-gray-200 bg-gray-50',
};
const PRIO_BADGE: Record<StockPriority, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-100 text-gray-600',
};
const PRIO_LABEL: Record<StockPriority, string> = { high: 'Priorité haute', medium: 'À faire', low: 'À noter' };

const FILTERS: Array<{ key: 'all' | StockPriority; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'high', label: 'Haute' },
  { key: 'medium', label: 'Moyenne' },
  { key: 'low', label: 'Basse' },
];

export const InventoryStatusWidget: React.FC = () => {
  const [actions, setActions] = useState<StockAction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | StockPriority>('all');

  useEffect(() => {
    let cancelled = false;
    loadStockActions().then((a) => {
      if (!cancelled) {
        setActions(a);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(
    () => (actions ?? []).filter((a) => filter === 'all' || a.priority === filter),
    [actions, filter],
  );
  const empty = !actions || actions.length === 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-1">
        <Package className="h-4 w-4 text-orange-600" /> Stock — actions commerciales recommandées
      </h3>
      <p className="text-xs text-gray-500 mb-3">Que vendre / promouvoir maintenant, à partir de vos annonces réelles.</p>

      {loading ? (
        <p className="text-sm text-gray-500">Analyse de votre stock…</p>
      ) : empty ? (
        <p className="text-sm text-gray-500">
          Aucune action recommandée — votre stock actif est sain (ou aucune annonce disponible).
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  filter === f.key ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune action à ce niveau de priorité.</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((a) => (
                <li key={a.machineId} className={`rounded-lg border p-3 ${PRIO_CLS[a.priority]}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-gray-900">{a.title}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIO_BADGE[a.priority]}`}>
                      {PRIO_LABEL[a.priority]}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {a.category ? `${a.category} · ` : ''}
                    {a.reason}
                  </div>
                  <a href={a.href} className="mt-1 inline-block text-xs font-medium text-orange-700 hover:underline">
                    → {a.action}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

export default InventoryStatusWidget;
