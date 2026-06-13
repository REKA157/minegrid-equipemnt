import React, { useMemo, useState } from 'react';
import { SectionCard } from '../ui/primitives';
import { matchesAlert, type ProjectLite, type AlertQuery } from '../intelligence/matchAlert';

/** Outil interactif : VOIR UNE ALERTE MARCHÉ (matching réel projet ↔ alerte). */
export default function MarketAlertWidget() {
  const [project, setProject] = useState<ProjectLite>({
    country: 'Sénégal', sector: 'mining', budget: 5_000_000,
    title: 'Nouvelle mine d’or — besoin de pelles et chargeuses', description: 'Terrassement et concassage',
  });
  const [country, setCountry] = useState('Sénégal');
  const [sector, setSector] = useState('mining');
  const [minBudget, setMinBudget] = useState(1_000_000);
  const [equip, setEquip] = useState('pelle');

  const query: AlertQuery = useMemo(
    () => ({ country, sector, minBudget, equipmentTypes: equip ? equip.split(',').map((s) => s.trim()) : [] }),
    [country, sector, minBudget, equip],
  );
  const result = useMemo(() => matchesAlert(project, query), [project, query]);

  return (
    <SectionCard title="Voir une alerte marché" subtitle="Un projet déclenche-t-il votre veille ? Matching réel." live status="available">
      <div className="grid sm:grid-cols-2 gap-5 text-sm">
        <div className="space-y-2">
          <p className="font-medium text-gray-700">Projet (exemple éditable)</p>
          <input className="w-full rounded-md border border-gray-300 px-2 py-1" value={project.title ?? ''} onChange={(e) => setProject((p) => ({ ...p, title: e.target.value }))} />
          <input className="w-full rounded-md border border-gray-300 px-2 py-1" value={project.country ?? ''} onChange={(e) => setProject((p) => ({ ...p, country: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <p className="font-medium text-gray-700">Critères d'alerte</p>
          <input className="w-full rounded-md border border-gray-300 px-2 py-1" placeholder="Pays" value={country} onChange={(e) => setCountry(e.target.value)} />
          <input className="w-full rounded-md border border-gray-300 px-2 py-1" placeholder="Secteur" value={sector} onChange={(e) => setSector(e.target.value)} />
          <input className="w-full rounded-md border border-gray-300 px-2 py-1" type="number" placeholder="Budget min" value={minBudget} onChange={(e) => setMinBudget(Number(e.target.value))} />
          <input className="w-full rounded-md border border-gray-300 px-2 py-1" placeholder="Équipements (pelle, grue...)" value={equip} onChange={(e) => setEquip(e.target.value)} />
        </div>
      </div>
      <div className={`mt-4 rounded-lg p-4 text-sm font-medium ${result.matches ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'}`}>
        {result.matches ? '✓ Correspondance — l\'abonné serait notifié' : '✗ Pas de correspondance'} ({result.reasons.join(', ')})
      </div>
    </SectionCard>
  );
}
