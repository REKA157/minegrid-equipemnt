import React, { useMemo, useState } from 'react';
import { SectionCard, NumberField, Toggle } from '../ui/primitives';
import { fraudSignals } from '../ai/fraudSignals';

/** Outil interactif : DÉTECTER UN RISQUE DE FRAUDE (règles réelles). */
export default function FraudWidget() {
  const [price, setPrice] = useState(35000);
  const [estimate, setEstimate] = useState(110000);
  const [trust, setTrust] = useState(15);
  const [verified, setVerified] = useState(false);
  const [images, setImages] = useState(true);

  const result = useMemo(
    () => fraudSignals({ price, estimate, sellerTrustScore: trust, sellerVerifiedIdentity: verified, listingAgeMinutes: 30, hasImages: images }),
    [price, estimate, trust, verified, images],
  );
  const cls = { low: 'bg-green-50 text-green-800', medium: 'bg-amber-50 text-amber-800', high: 'bg-red-50 text-red-800' }[result.risk];

  return (
    <SectionCard title="Détecter un risque de fraude" subtitle="Prix appât, vendeur non vérifié, confiance faible… règles réelles." live status="available">
      <div className="grid sm:grid-cols-2 gap-3">
        <NumberField label="Prix annoncé (€)" value={price} onChange={setPrice} min={0} />
        <NumberField label="Estimation marché (€)" value={estimate} onChange={setEstimate} min={0} />
        <NumberField label="Score confiance vendeur" value={trust} onChange={setTrust} min={0} max={100} />
        <Toggle label="Identité vendeur vérifiée" checked={verified} onChange={setVerified} />
        <Toggle label="Photos présentes" checked={images} onChange={setImages} />
      </div>
      <div className={`mt-3 rounded-lg p-4 text-sm font-medium ${cls}`}>
        Risque : {result.risk.toUpperCase()} ({result.score}/100)
        {result.reasons.length > 0 && (
          <ul className="mt-1 list-disc list-inside font-normal text-xs">
            {result.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
