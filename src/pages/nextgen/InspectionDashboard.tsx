import React from 'react';
import { SectionCard, EmptyState, StatusBadge } from '../../nextgen/ui/primitives';
import { InspectionGradeWidget, InspectionRequestWidget } from '../../nextgen/widgets/InspectionWidget';

export default function InspectionDashboard() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">MineGrid Inspection</h1>
        <p className="text-gray-600">Inspection certifiée : c'est ce qui permet d'acheter à distance en confiance.</p>
      </header>

      <div className="grid lg:grid-cols-2 gap-5">
        <InspectionGradeWidget />
        <InspectionRequestWidget />
      </div>

      <SectionCard title="Mes rapports d'inspection (données live)" status="awaiting_partner">
        <EmptyState status="awaiting_partner" message="Les rapports certifiés apparaîtront ici dès qu'un réseau d'inspecteurs est activé sur un corridor (Dakar/Abidjan/Casablanca)." />
      </SectionCard>

      <div className="text-xs text-gray-500 flex items-center gap-2">
        <StatusBadge status="roadmap" /> App inspecteur mobile, génération PDF certifié, analyse d'huile.
      </div>
    </div>
  );
}
