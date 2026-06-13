import React from 'react';
import { SectionCard, EmptyState } from '../../nextgen/ui/primitives';
import LogisticsWidget from '../../nextgen/widgets/LogisticsWidget';

export default function LogisticsDashboard() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">MineGrid Logistics</h1>
        <p className="text-gray-600">Devis transport, transit et dédouanement — capture du post-match depuis le hub marocain et les corridors ouest-africains.</p>
      </header>

      <LogisticsWidget />

      <SectionCard title="Mes expéditions & dédouanement (données live)" status="awaiting_partner">
        <EmptyState status="awaiting_partner" message="Le suivi réel s'active avec des transitaires/transporteurs partenaires. Schéma (logistics_quotes, customs_cases) prêt." />
      </SectionCard>
    </div>
  );
}
