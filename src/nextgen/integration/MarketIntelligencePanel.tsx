import React, { useEffect, useState } from 'react';
import { SectionCard, EmptyState } from '../ui/primitives';
import { listProjects, getMyAlerts } from '../intelligence/marketService';

// Global Monitor : projets miniers/BTP, alertes opportunités, signaux demande.
// Lecture réelle (market_projects, réservé abonnés) avec fallback honnête tant que
// l'ingestion (monitor-service) et la table ne sont pas déployées.

export default function MarketIntelligencePanel() {
  const [projects, setProjects] = useState<unknown[] | null>(null);
  const [alerts, setAlerts] = useState<unknown[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await listProjects({ limit: 20 });
      const a = await getMyAlerts();
      if (!cancelled) { setProjects(p); setAlerts(a); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4 mb-6">
      <SectionCard title="Projets miniers & BTP (signaux de demande)" status="awaiting_deployment">
        {projects && projects.length > 0 ? (
          <ul className="text-sm text-gray-700 space-y-1">
            {projects.map((p, i) => (
              <li key={i}>
                {(p as { title?: string }).title ?? '—'} · {(p as { country?: string }).country ?? ''}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState status="awaiting_deployment" message="Projets indisponibles — ingestion monitor-service + table market_projects à déployer." />
        )}
      </SectionCard>

      <SectionCard title="Mes alertes opportunités équipement" status="awaiting_deployment">
        {alerts && alerts.length > 0 ? (
          <span className="text-sm text-gray-700">{alerts.length} alerte(s) configurée(s).</span>
        ) : (
          <EmptyState status="awaiting_deployment" message="Aucune alerte configurée." />
        )}
      </SectionCard>
    </div>
  );
}
