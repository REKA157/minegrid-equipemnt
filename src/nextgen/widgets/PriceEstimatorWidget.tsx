import React, { useMemo, useState } from 'react';
import { SectionCard } from '../ui/primitives';
import { estimatePrice } from '../data/estimatePrice';

/** Outil interactif : ESTIMER UN PRIX (médiane + IQR, logique réelle). */
export default function PriceEstimatorWidget() {
  const [raw, setRaw] = useState('95000, 102000, 110000, 118000, 125000');
  const result = useMemo(() => {
    const prices = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)).map((p) => ({ price: p }));
    return estimatePrice(prices);
  }, [raw]);

  return (
    <SectionCard title="Estimer un prix" subtitle="Saisissez des prix observés (virgules). Estimation par médiane + fourchette interquartile." live status="available">
      <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={raw} onChange={(e) => setRaw(e.target.value)} />
      <div className="mt-3 rounded-lg bg-gray-50 p-4 text-sm">
        {result.method === 'median_iqr' ? (
          <span className="text-gray-800">
            Estimation <strong className="text-lg">{result.estimate?.toLocaleString('fr-FR')} €</strong>{' '}
            (fourchette {result.low?.toLocaleString('fr-FR')}–{result.high?.toLocaleString('fr-FR')} €, n={result.n})
          </span>
        ) : (
          <span className="text-amber-700">Donnée non disponible — moins de 3 observations valides (on n'invente pas de prix).</span>
        )}
      </div>
    </SectionCard>
  );
}
