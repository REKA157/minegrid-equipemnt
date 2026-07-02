import React from 'react';
import { SectionCard, EmptyState } from '../../nextgen/ui/primitives';
import EscrowFlowWidget from '../../nextgen/widgets/EscrowFlowWidget';

export default function EscrowDashboard() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">MineGrid Escrow</h1>
        <p className="text-gray-600">Séquestre conditionné inspection + livraison. Paiement sécurisé à venir : aucun prestataire de paiement (PSP) n'est encore connecté, donc aucun fonds ne peut être séquestré aujourd'hui.</p>
      </header>

      <EscrowFlowWidget />

      <SectionCard title="Mes transactions sous séquestre (données live)" status="awaiting_partner">
        <EmptyState status="awaiting_partner" message="Le paiement séquestre n'est pas encore activé : il nécessite un prestataire de paiement (PSP) connecté (ex. Stripe Connect / Flutterwave / Peach). Tant qu'aucun opérateur n'est intégré, aucun fonds n'est séquestré ni libéré." />
      </SectionCard>
    </div>
  );
}
