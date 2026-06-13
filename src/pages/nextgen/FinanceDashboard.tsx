import React from 'react';
import { SectionCard, EmptyState } from '../../nextgen/ui/primitives';
import FinanceSimulator from '../../nextgen/finance/FinanceSimulator';
import FinancePrescoringWidget from '../../nextgen/widgets/FinancePrescoringWidget';

export default function FinanceDashboard() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">MineGrid Finance</h1>
        <p className="text-gray-600">Apporteur d'affaires : MineGrid score et transmet le dossier. Aucun risque de crédit porté, aucun float.</p>
      </header>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <SectionCard title="Simuler un financement" subtitle="Calcul d'annuité réel — indicatif." live status="available">
          <FinanceSimulator />
        </SectionCard>
        <FinancePrescoringWidget />
      </div>

      <SectionCard title="Partenaires financiers & mes dossiers (données live)" status="awaiting_partner">
        <EmptyState status="awaiting_partner" message="Aucun partenaire financier signé à ce jour — aucun n'est inventé. Le catalogue (finance_partners) et les dossiers (finance_applications) sont prêts côté schéma." />
      </SectionCard>
    </div>
  );
}
