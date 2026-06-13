import React, { useMemo, useState } from 'react';
import { SectionCard, NumberField, EmptyState } from '../ui/primitives';
import { quoteEstimate, type TransportMode } from '../logistics/quoteEstimate';

const MODES: TransportMode[] = ['road', 'sea', 'rail', 'multimodal'];

/** Outil interactif : ESTIMER UN DEVIS TRANSPORT (grille réelle). */
export default function LogisticsWidget() {
  const [mode, setMode] = useState<TransportMode>('sea');
  const [weight, setWeight] = useState(20000);
  const [distance, setDistance] = useState(1200);

  const quote = useMemo(() => quoteEstimate({ mode, weightKg: weight, distanceKm: distance }), [mode, weight, distance]);

  return (
    <SectionCard title="Estimer un transport" subtitle="Devis d'apport indicatif selon mode, poids et distance." live status="available">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-gray-700">Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as TransportMode)} className="w-32 rounded-md border border-gray-300 px-2 py-1">
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <NumberField label="Poids (kg)" value={weight} onChange={setWeight} min={0} />
        <NumberField label="Distance (km, terrestre)" value={distance} onChange={setDistance} min={0} />
      </div>
      <div className="mt-4 rounded-lg bg-gray-50 p-4">
        {quote.method === 'tariff_grid' ? (
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-primary-700">{quote.price?.toLocaleString('fr-FR')} €</span>
            <span className="text-sm text-gray-600">ETA ~{quote.etaDays ?? '—'} jours</span>
          </div>
        ) : (
          <EmptyState status="unverified" message="Paramètres insuffisants (les modes terrestres exigent une distance)." />
        )}
      </div>
    </SectionCard>
  );
}
