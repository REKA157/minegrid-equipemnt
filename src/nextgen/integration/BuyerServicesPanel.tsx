import React, { useEffect, useState } from 'react';
import { SectionCard, EmptyState } from '../ui/primitives';
import { getMyInspectionRequests } from '../inspection/inspectionService';
import { getMyApplications } from '../finance/financeService';
import { getMyEscrows } from '../escrow/escrowService';

// Dashboard acheteur : demandes d'inspection / financement, dossiers de séquestre,
// suivi logistique. Lecture réelle (services) avec fallback honnête.

export default function BuyerServicesPanel() {
  const [insp, setInsp] = useState<unknown[] | null>(null);
  const [fin, setFin] = useState<unknown[] | null>(null);
  const [esc, setEsc] = useState<unknown[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const i = await getMyInspectionRequests();
      const f = await getMyApplications();
      const e = await getMyEscrows();
      if (!cancelled) { setInsp(i); setFin(f); setEsc(e); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <ListBlock
        title="Mes demandes d'inspection" items={insp} empty="Aucune demande d'inspection."
        render={(x) => `${(x as { machine_id?: string }).machine_id ?? '—'} · ${(x as { status?: string }).status ?? ''}`}
      />
      <ListBlock
        title="Mes demandes de financement" items={fin} empty="Aucune demande de financement."
        render={(x) => `${(x as { amount?: number }).amount ?? '—'} ${(x as { currency?: string }).currency ?? ''} · ${(x as { status?: string }).status ?? ''}`}
      />
      <ListBlock
        title="Mes dossiers de séquestre" items={esc} empty="Aucun dossier de séquestre."
        render={(x) => `${(x as { amount?: number }).amount ?? '—'} ${(x as { currency?: string }).currency ?? ''} · ${(x as { status?: string }).status ?? ''}`}
      />
      <SectionCard title="Suivi logistique" status="awaiting_partner">
        <EmptyState status="awaiting_partner" message="Le suivi transport s'active avec des transitaires partenaires." />
      </SectionCard>
    </div>
  );
}

function ListBlock({
  title, items, empty, render,
}: {
  title: string;
  items: unknown[] | null;
  empty: string;
  render: (x: unknown) => string;
}) {
  return (
    <SectionCard title={title} status="awaiting_deployment">
      {items === null ? null
        : items.length === 0 ? <EmptyState status="awaiting_deployment" message={empty} />
        : <ul className="text-sm text-gray-700 space-y-1">{items.map((x, i) => <li key={i}>{render(x)}</li>)}</ul>}
    </SectionCard>
  );
}
