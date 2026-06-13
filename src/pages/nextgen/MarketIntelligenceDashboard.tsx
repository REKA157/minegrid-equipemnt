import React from 'react';
import { SectionCard, EmptyState } from '../../nextgen/ui/primitives';
import { isDemoBackend } from '../../nextgen/ui/demoMode';
import MarketAlertWidget from '../../nextgen/widgets/MarketAlertWidget';

export default function MarketIntelligenceDashboard() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">MineGrid Intelligence</h1>
        <p className="text-gray-600">Projets miniers/BTP & alertes ciblées — un driver d'abonnement (réservé aux abonnés).</p>
      </header>

      <MarketAlertWidget />

      <SectionCard title="Projets marché (données live)" status="awaiting_deployment">
        {isDemoBackend() ? (
          <EmptyState status="awaiting_deployment" message="Les projets réels proviennent du service monitor (ingestion ~35 portails) vers la table market_projects, lisible par les abonnés. Déploiement requis." />
        ) : (
          <EmptyState status="unverified" message="Aucun projet disponible (ou abonnement requis)." />
        )}
      </SectionCard>
    </div>
  );
}
