import React, { useEffect, useState } from 'react';
import supabase from '../../utils/supabaseClient';

// Recommandations d'équipements — DONNÉES RÉELLES (table machines existante).
// Recherche des machines similaires (même marque). Fallback honnête : si aucune
// donnée / erreur, on n'affiche RIEN (pas de bloc vide trompeur, pas de mock).

interface RecoMachine {
  id: string | number;
  name?: string | null;
  brand?: string | null;
  model?: string | null;
}

interface Props {
  machineId?: string | null;
  brand?: string | null;
  category?: string | null;
}

export default function RecommendedMachines({ machineId, brand }: Props) {
  const [items, setItems] = useState<RecoMachine[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!brand) { setItems([]); return; }
      try {
        const { data, error } = await supabase
          .from('machines')
          .select('id, name, brand, model')
          .eq('brand', brand)
          .limit(6);
        if (cancelled) return;
        if (error || !Array.isArray(data)) { setItems([]); return; }
        setItems(
          (data as RecoMachine[])
            .filter((m) => String(m.id) !== String(machineId))
            .slice(0, 4),
        );
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [machineId, brand]);

  if (!items || items.length === 0) return null; // honnête : rien à recommander → rien

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Machines similaires</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((m) => (
          <a
            key={String(m.id)}
            href={`#machines/${m.id}`}
            className="block rounded-lg border border-gray-200 p-3 hover:border-primary-300 hover:shadow-sm transition"
          >
            <div className="text-sm font-medium text-gray-900 truncate">
              {m.name ?? `${m.brand ?? ''} ${m.model ?? ''}`.trim()}
            </div>
            <div className="text-xs text-gray-500 truncate">{[m.brand, m.model].filter(Boolean).join(' ')}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
