import React, { useEffect, useState } from 'react';
import { SectionCard } from '../ui/primitives';
import { buildNetworkForRole } from '../../utils/partner/partnerPerformanceService';
import { trustTierLabel } from '../../utils/partner/partnerTrust';
import type { NetworkPartner, NetworkRanking } from '../../utils/partner/partnerNetwork';
import type { PartnerRole } from '../../utils/partner/partnerEvents';

const ROLES: Array<{ role: PartnerRole; label: string }> = [
  { role: 'mechanic', label: 'Mécaniciens' },
  { role: 'broker', label: 'Courtiers' },
  { role: 'carrier', label: 'Transporteurs' },
  { role: 'forwarder', label: 'Transitaires' },
];

/**
 * Outil de DÉCISION RÉSEAU (plus un calculateur de démo). Branché UNIQUEMENT sur des
 * moteurs réels : Partner Trust + Partner Performance + Matching + charge, dérivés des
 * dossiers/transaction_events. Montre recommandés / saturés / à éviter, la RAISON du
 * classement et une ACTION concrète. Anti-façade : aucun score saisi, aucun partenaire
 * inventé ; rien (état vide court) si aucune donnée réelle.
 */

/** Raison concise du classement, tirée des raisons réelles du Partner Trust. */
function rankReason(p: NetworkPartner): string {
  const r = p.trust.reasons;
  return (
    r.find((x) => x.toLowerCase().includes('échec') || x.toLowerCase().includes('plafonn')) ||
    r.find((x) => x.toLowerCase().includes('complétion')) ||
    r[0] ||
    ''
  );
}

function PartnerRow({ p, action }: { p: NetworkPartner; action?: React.ReactNode }) {
  return (
    <li className="px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-gray-500">{p.partnerId.slice(0, 8)}…</span>
        <span className="text-sm text-gray-800">
          {trustTierLabel(p.trust.tier)} · {p.trust.trustScore}/100 · charge {p.openLoad}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">{rankReason(p)}</span>
        {action}
      </div>
    </li>
  );
}

export default function TrustScoreWidget() {
  const [role, setRole] = useState<PartnerRole>('mechanic');
  const [net, setNet] = useState<NetworkRanking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void buildNetworkForRole(role).then((n) => {
      if (!cancelled) {
        setNet(n);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const empty = !net || net.ranked.length === 0;
  const avoidIds = new Set((net?.toAvoid ?? []).map((p) => p.partnerId));
  const satIds = new Set((net?.saturated ?? []).map((p) => p.partnerId));
  // Disponibles « autres » = classés, hors recommandé, hors saturés, hors à-éviter.
  const others = (net?.ranked ?? []).filter(
    (p) => p.partnerId !== net?.best?.partnerId && !avoidIds.has(p.partnerId) && !satIds.has(p.partnerId),
  );

  const assignCta = (
    <a href="#dossiers" className="text-xs font-medium text-orange-700 hover:underline">
      → Assigner sur un dossier
    </a>
  );

  return (
    <SectionCard
      title="Réseau partenaire — qui mobiliser"
      subtitle="Classement par confiance et charge, sur vos dossiers réels."
      live
      status="available"
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {ROLES.map((r) => (
          <button
            key={r.role}
            type="button"
            onClick={() => setRole(r.role)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              role === r.role ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Chargement du réseau…</p>
      ) : empty ? (
        <p className="text-sm text-gray-500">
          Aucun partenaire évalué pour ce rôle — la confiance se construit avec les dossiers traités.
        </p>
      ) : (
        <div className="space-y-4">
          {net!.best && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50">
              <div className="px-3 pt-2 text-xs font-semibold text-emerald-800">✅ Recommandé (meilleur disponible)</div>
              <ul>
                <PartnerRow p={net!.best} action={assignCta} />
              </ul>
            </div>
          )}

          {others.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-1">Autres disponibles</div>
              <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100 bg-white">
                {others.map((p) => (
                  <PartnerRow key={p.partnerId} p={p} action={assignCta} />
                ))}
              </ul>
            </div>
          )}

          {net!.toAvoid.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-700 mb-1">⚠️ À éviter (taux d'échec élevé)</div>
              <ul className="rounded-lg border border-amber-200 divide-y divide-amber-100 bg-amber-50">
                {net!.toAvoid.map((p) => (
                  <PartnerRow
                    key={p.partnerId}
                    p={p}
                    action={<span className="text-xs text-amber-700">éviter d'assigner</span>}
                  />
                ))}
              </ul>
            </div>
          )}

          {net!.saturated.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">⏳ Saturés (forte charge)</div>
              <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100 bg-gray-50">
                {net!.saturated.map((p) => (
                  <PartnerRow
                    key={p.partnerId}
                    p={p}
                    action={<span className="text-xs text-gray-500">réorienter</span>}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
