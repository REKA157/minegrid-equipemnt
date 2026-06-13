import React from 'react';
import { SectionCard, EmptyState } from '../../nextgen/ui/primitives';
import { isDemoBackend } from '../../nextgen/ui/demoMode';
import TrustScoreWidget from '../../nextgen/widgets/TrustScoreWidget';

export default function TrustDashboard() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Trust Layer</h1>
        <p className="text-gray-600">Le score de confiance rend la fiabilité vendeur visible et comparable.</p>
      </header>

      <TrustScoreWidget />

      <SectionCard title="Mon profil de confiance (données live)" status="awaiting_deployment">
        {isDemoBackend() ? (
          <EmptyState status="awaiting_deployment" message="Le profil réel sera lu depuis Supabase (table trust_profiles) une fois les migrations déployées." />
        ) : (
          <EmptyState status="unverified" message="Aucun profil de confiance pour ce compte." />
        )}
      </SectionCard>
    </div>
  );
}
