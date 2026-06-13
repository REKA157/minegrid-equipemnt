import React, { useEffect, useState } from 'react';
import { SectionCard, StatusBadge, EmptyState } from '../ui/primitives';
import TrustBadge from '../trust/TrustBadge';
import { getMyTrustProfile, getMyVerifications } from '../trust/trustService';
import type { TrustProfile, Verification, VerificationKind } from '../trust/types';

// Dashboard vendeur : profil de confiance, documents à fournir, niveau, actions,
// historique. Lecture réelle (Trust Layer) avec fallback honnête « Non vérifié ».

const DOCS: Array<{ kind: VerificationKind; label: string; points: number }> = [
  { kind: 'identity', label: "Pièce d'identité", points: 15 },
  { kind: 'company_registration', label: 'Registre de commerce', points: 15 },
  { kind: 'tax_id', label: 'Identifiant fiscal', points: 10 },
  { kind: 'bank_account', label: 'RIB', points: 10 },
  { kind: 'address', label: "Justificatif d'adresse", points: 5 },
];

export default function SellerTrustPanel() {
  const [profile, setProfile] = useState<TrustProfile | null>(null);
  const [verifs, setVerifs] = useState<Verification[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getMyTrustProfile();
      if (!cancelled) setProfile(p);
      if (p) {
        const v = await getMyVerifications(p.id);
        if (!cancelled) setVerifs(v);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const statusFor = (kind: VerificationKind) => verifs.find((v) => v.kind === kind)?.status;

  return (
    <SectionCard title="Mon profil de confiance" subtitle="Plus votre profil est vérifié, plus vous inspirez confiance et convertissez vos leads.">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-600">Niveau de vérification actuel</span>
        {profile ? <TrustBadge tier={profile.trust_tier} score={profile.trust_score} /> : <StatusBadge status="unverified" />}
      </div>

      <p className="text-sm font-medium text-gray-700 mb-1">Documents à fournir</p>
      <ul className="space-y-1.5 mb-4">
        {DOCS.map(({ kind, label, points }) => {
          const st = statusFor(kind);
          return (
            <li key={kind} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{label} <span className="text-gray-400">(+{points})</span></span>
              {st === 'approved' ? <StatusBadge status="available" />
                : st === 'pending' ? <StatusBadge status="unverified" />
                : <span className="text-xs text-gray-400">À fournir</span>}
            </li>
          );
        })}
      </ul>

      <p className="text-sm font-medium text-gray-700 mb-1">Actions pour améliorer votre score</p>
      <ul className="list-disc list-inside text-xs text-gray-500 mb-4 space-y-0.5">
        <li>Faites vérifier votre identité (+15) et votre RC (+15).</li>
        <li>Ajoutez un RIB vérifié (+10) pour débloquer le paiement sécurisé.</li>
        <li>Obtenez des inspections certifiées et concluez des ventes sécurisées.</li>
      </ul>

      <p className="text-sm font-medium text-gray-700 mb-1">Historique des vérifications</p>
      {loaded && verifs.length === 0 ? (
        <EmptyState status="awaiting_deployment" message="Aucune vérification soumise (Trust Layer à déployer)." />
      ) : (
        <ul className="text-xs text-gray-500 space-y-1">
          {verifs.map((v) => <li key={v.id}>{v.kind} — {v.status}</li>)}
        </ul>
      )}
    </SectionCard>
  );
}
