import React from 'react';
import { SectionCard, EmptyState } from '../../nextgen/ui/primitives';
import EscrowFlowWidget from '../../nextgen/widgets/EscrowFlowWidget';

export default function EscrowDashboard() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">MineGrid Escrow</h1>
        <p className="text-gray-600">Séquestre conditionné inspection + livraison. MineGrid n'encaisse jamais : les fonds vivent chez un PSP partenaire.</p>
      </header>

      <EscrowFlowWidget />

      <SectionCard title="Mes transactions sous séquestre (données live)" status="awaiting_partner">
        <EmptyState status="awaiting_partner" message="L'escrow s'active dès la signature d'un PSP partenaire (Stripe Connect / Flutterwave / Peach). L'Edge Function escrow-webhook (signée, idempotente) est déjà codée." />
      </SectionCard>
    </div>
  );
}
