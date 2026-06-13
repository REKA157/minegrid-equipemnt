import React, { useEffect, useState } from 'react';
import { SectionCard, StatusBadge, EmptyState } from '../ui/primitives';
import TrustBadge from '../trust/TrustBadge';
import { getMyTrustProfile } from '../trust/trustService';
import { getMyAlerts } from '../intelligence/marketService';
import supabase from '../../utils/supabaseClient';
import type { TrustProfile } from '../trust/types';

// Espace Pro : résumé Trust, leads qualifiés (RÉELS via quote_requests), score
// vendeur, alertes marché. Fallback honnête « Donnée indisponible ».

export default function ProTrustSummary() {
  const [profile, setProfile] = useState<TrustProfile | null>(null);
  const [leads, setLeads] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<unknown[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyTrustProfile();
      if (!cancelled) setProfile(p);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { count, error } = await supabase
            .from('quote_requests')
            .select('id', { count: 'exact', head: true })
            .eq('seller_id', user.id);
          if (!cancelled) setLeads(error ? null : (count ?? 0));
        } else if (!cancelled) {
          setLeads(null);
        }
      } catch {
        if (!cancelled) setLeads(null);
      }
      const a = await getMyAlerts();
      if (!cancelled) setAlerts(a);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="grid md:grid-cols-3 gap-4 mb-6">
      <SectionCard title="Confiance vendeur">
        {profile ? <TrustBadge tier={profile.trust_tier} score={profile.trust_score} /> : <StatusBadge status="unverified" />}
      </SectionCard>
      <SectionCard title="Leads qualifiés reçus">
        {leads === null
          ? <span className="text-sm text-gray-400">Donnée indisponible</span>
          : <span className="text-3xl font-bold text-gray-900">{leads}</span>}
      </SectionCard>
      <SectionCard title="Alertes marché" status="awaiting_deployment">
        {alerts && alerts.length > 0
          ? <span className="text-sm text-gray-700">{alerts.length} alerte(s) active(s)</span>
          : <EmptyState status="awaiting_deployment" message="Aucune alerte (Market Intelligence à déployer)." />}
      </SectionCard>
    </div>
  );
}
