import React, { useMemo, useState } from 'react';
import { SectionCard, Toggle } from '../ui/primitives';
import { canReleaseFunds, isTerminal, type EscrowStatus } from '../escrow/escrowStateMachine';

const FLOW: EscrowStatus[] = ['created', 'funded', 'inspection_passed', 'delivered', 'released'];

/** Outil interactif : SIMULER UN SÉQUESTRE (machine d'état réelle). */
export default function EscrowFlowWidget() {
  const [status, setStatus] = useState<EscrowStatus>('delivered');
  const [inspectionPassed, setInspectionPassed] = useState(true);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(true);

  const releasable = useMemo(
    () => canReleaseFunds(status, { inspection: true, delivery: true }, { inspectionPassed, deliveryConfirmed }),
    [status, inspectionPassed, deliveryConfirmed],
  );

  return (
    <SectionCard title="Simuler un séquestre" subtitle="Les fonds ne se libèrent que depuis « delivered » et si les conditions sont réunies." live status="available">
      <ol className="flex flex-wrap items-center gap-2">
        {FLOW.map((s, i) => (
          <React.Fragment key={s}>
            <button onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-sm border ${status === s ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'}`}>
              {s}
            </button>
            {i < FLOW.length - 1 && <span className="text-gray-300">→</span>}
          </React.Fragment>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-5">
        <Toggle label="Inspection certifiée OK" checked={inspectionPassed} onChange={setInspectionPassed} />
        <Toggle label="Livraison confirmée" checked={deliveryConfirmed} onChange={setDeliveryConfirmed} />
      </div>
      <div className={`mt-4 rounded-lg p-4 text-sm font-medium ${releasable ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
        {releasable
          ? '✓ Fonds libérables vers le vendeur (toutes conditions satisfaites).'
          : status !== 'delivered'
          ? '✗ Libération bloquée : la transaction doit être à l\'état « delivered ».'
          : '✗ Libération bloquée : une condition (inspection ou livraison) n\'est pas satisfaite.'}
        {isTerminal(status) && <span className="block mt-1 text-xs opacity-70">État terminal.</span>}
      </div>
    </SectionCard>
  );
}
