import React, { useMemo, useState } from 'react';
import { SectionCard, StatusBadge, EmptyState, Toggle, type DemoStatus } from '../../nextgen/ui/primitives';
import { isDemoBackend } from '../../nextgen/ui/demoMode';
import { computeTrustScore } from '../../nextgen/trust/computeTrustScore';
import type { VerificationKind } from '../../nextgen/trust/types';
import TrustBadge from '../../nextgen/trust/TrustBadge';

const STEPS: Array<{ n: number; title: string; desc: string; status: DemoStatus }> = [
  { n: 1, title: 'Publier l’annonce', desc: 'Fiche machine avec photos et spécifications.', status: 'awaiting_deployment' },
  { n: 2, title: 'Se faire vérifier', desc: 'Soumettre identité, RC, fiscal, RIB (revue back-office).', status: 'awaiting_deployment' },
  { n: 3, title: 'Obtenir le badge de confiance', desc: 'Score calculé après approbation (aperçu live ci-dessous).', status: 'available' },
  { n: 4, title: 'Recevoir des leads qualifiés', desc: 'Acheteurs sécurisés par le parcours de confiance.', status: 'awaiting_deployment' },
  { n: 5, title: 'Vendre sous séquestre', desc: 'Paiement sécurisé (opérateur PSP à venir), libéré après inspection + livraison. Non encore activé.', status: 'awaiting_partner' },
];

const KINDS: Array<{ k: VerificationKind; label: string }> = [
  { k: 'identity', label: 'Pièce d’identité' },
  { k: 'company_registration', label: 'Registre de commerce' },
  { k: 'tax_id', label: 'Identifiant fiscal' },
  { k: 'bank_account', label: 'RIB' },
  { k: 'address', label: 'Justificatif d’adresse' },
];

export default function SellWithVerification() {
  const [provided, setProvided] = useState<Set<VerificationKind>>(new Set(['identity']));

  const preview = useMemo(
    () => computeTrustScore({
      approvedVerifications: [...provided],
      inspectionsPassed: 0, inspectionsTotal: 0, completedTransactions: 0, disputes: 0, accountAgeDays: 30,
    }),
    [provided],
  );

  const toggle = (k: VerificationKind) =>
    setProvided((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Vendre avec vérification</h1>
        <p className="text-gray-600">Un vendeur vérifié inspire confiance, convertit mieux et accède au paiement sécurisé.</p>
      </header>

      <ol className="space-y-3">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-lg border border-gray-200 bg-white p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="h-6 w-6 shrink-0 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center">{s.n}</span>
              <div>
                <div className="font-medium text-gray-900">{s.title}</div>
                <div className="text-sm text-gray-500">{s.desc}</div>
              </div>
            </div>
            <StatusBadge status={s.status} />
          </li>
        ))}
      </ol>

      <SectionCard title="Aperçu de mon badge selon les pièces fournies" subtitle="Calcul réel : voyez l'effet de chaque pièce sur le tier de confiance." live status="available">
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            {KINDS.map(({ k, label }) => (
              <Toggle key={k} label={label} checked={provided.has(k)} onChange={() => toggle(k)} />
            ))}
          </div>
          <div className="flex flex-col items-start justify-center gap-2 rounded-lg bg-gray-50 p-4">
            <TrustBadge tier={preview.tier} score={preview.score} />
            <p className="text-xs text-gray-500">
              {provided.has('identity')
                ? 'Identité fournie : le tier peut progresser au-delà de « basic ».'
                : 'Sans identité vérifiée, le tier reste plafonné à « basic ».'}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Soumettre mes vérifications (données live)" status="awaiting_deployment">
        {isDemoBackend()
          ? <EmptyState status="awaiting_deployment" message="La soumission écrit dans la table verifications (statut 'pending'), revue ensuite en back-office. Déploiement Supabase requis — aucune fausse validation n'est affichée." />
          : <EmptyState status="unverified" message="Connectez-vous pour soumettre vos pièces." />}
      </SectionCard>
    </div>
  );
}
