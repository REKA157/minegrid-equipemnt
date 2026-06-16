import React, { useEffect, useState } from 'react';
import { SectionCard } from '../ui/primitives';
import { buildNetworkForRole } from '../../utils/partner/partnerPerformanceService';
import { trustTierLabel } from '../../utils/partner/partnerTrust';
import type { NetworkRanking } from '../../utils/partner/partnerNetwork';
import type { PartnerRole } from '../../utils/partner/partnerEvents';

const ROLES: Array<{ role: PartnerRole; label: string }> = [
  { role: 'mechanic', label: 'Mécaniciens' },
  { role: 'broker', label: 'Courtiers' },
  { role: 'carrier', label: 'Transporteurs' },
  { role: 'forwarder', label: 'Transitaires' },
];

/**
 * Assistant RÉSEAU PARTENAIRE — ne montre plus un score brut saisi à la main, mais
 * les partenaires RECOMMANDÉS / À ÉVITER / SATURÉS, dérivés du moteur Partner Network
 * (confiance + charge) sur les dossiers réels. Anti-façade : rien si aucune donnée.
 */
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

  return (
    <SectionCard
      title="Réseau partenaire — confiance & disponibilité"
      subtitle="Qui recommander, qui éviter, qui est saturé — sur vos dossiers réels."
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
          Aucune donnée partenaire pour ce rôle. La confiance se construit à mesure que les partenaires
          traitent des dossiers — rien n'est affiché tant qu'aucun n'a été évalué (anti-façade).
        </p>
      ) : (
        <div className="space-y-4">
          {net!.best && net!.best.trust.trustScore != null && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs font-semibold text-emerald-800">✅ Recommandé (meilleur disponible)</div>
              <div className="mt-1 text-sm text-gray-800">
                <span className="font-mono text-xs">{net!.best.partnerId.slice(0, 8)}…</span> · confiance{' '}
                <span className="font-medium">{trustTierLabel(net!.best.trust.tier)}</span> (
                {net!.best.trust.trustScore}/100) · {net!.best.openLoad} dossier(s) en cours
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1">Classement par confiance</div>
            <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100 bg-white">
              {net!.ranked.map((p) => (
                <li key={p.partnerId} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="font-mono text-xs text-gray-500">{p.partnerId.slice(0, 8)}…</span>
                  <span className="text-gray-800">
                    {trustTierLabel(p.trust.tier)} · {p.trust.trustScore}/100 · charge {p.openLoad}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {net!.toAvoid.length > 0 && (
            <p className="text-xs text-amber-700">
              ⚠️ {net!.toAvoid.length} partenaire(s) à éviter (taux d'échec élevé).
            </p>
          )}
          {net!.saturated.length > 0 && (
            <p className="text-xs text-gray-500">⏳ {net!.saturated.length} partenaire(s) saturé(s) (forte charge).</p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
