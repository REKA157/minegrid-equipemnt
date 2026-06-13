import React, { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import TrustBadge from '../trust/TrustBadge';
import { getTrustProfile, getMyTrustProfile } from '../trust/trustService';
import type { TrustProfile } from '../trust/types';
import { estimateMachinePrice } from '../data/priceService';
import { fraudSignals } from '../ai/fraudSignals';
import { requestInspection } from '../inspection/inspectionService';
import { monthlyPayment } from '../finance/monthlyPayment';

// Intégrations INLINE (pas de panneau) : chaque composant se greffe à côté d'un
// élément existant et rend `null` quand il n'a pas de donnée → invisible par défaut.
// La valeur apparaît seulement quand elle aide la décision.

interface MachineCtx {
  price?: number | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  category?: string | null;
  country?: string | null;
}

/** Confiance vendeur, à placer à côté du nom/vitrine du vendeur. */
export function SellerTrustInline({ sellerId }: { sellerId?: string | null }) {
  const [profile, setProfile] = useState<TrustProfile | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let c = false;
    (async () => {
      if (sellerId) { const r = await getTrustProfile(sellerId); if (!c) setProfile(r); }
      if (!c) setDone(true);
    })();
    return () => { c = true; };
  }, [sellerId]);
  if (!done) return null;
  if (profile) return <TrustBadge tier={profile.trust_tier} score={profile.trust_score} size="sm" />;
  return <span className="text-xs text-gray-400">Vendeur non vérifié</span>;
}

/** Confiance de l'utilisateur connecté (en-tête de dashboard). */
export function MyTrustInline() {
  const [profile, setProfile] = useState<TrustProfile | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let c = false;
    (async () => { const r = await getMyTrustProfile(); if (!c) { setProfile(r); setDone(true); } })();
    return () => { c = true; };
  }, []);
  if (!done) return null;
  return profile
    ? <TrustBadge tier={profile.trust_tier} score={profile.trust_score} size="sm" />
    : <span className="text-xs text-gray-400">Profil non vérifié</span>;
}

/** Financement indicatif INLINE (remplace le widget simulateur), à placer près du prix. */
export function FinancingInline({ price }: { price?: number | null }) {
  if (!price || price <= 0) return null;
  const r = monthlyPayment({ amount: price, downPayment: Math.round(price * 0.2), annualRatePct: 12, termMonths: 48 });
  return (
    <p className="text-sm text-gray-500">
      Financement : à partir de ~{Math.round(r.monthlyPayment).toLocaleString('fr-FR')} €/mois{' '}
      <span className="text-gray-400">(indicatif · 20 % d'apport sur 48 mois)</span>
    </p>
  );
}

/** Estimation marché, à placer sous le prix. Invisible si pas assez de données. */
export function PriceVsMarketInline({ price, ...ctx }: MachineCtx) {
  const [est, setEst] = useState<{ estimate: number | null; low: number | null; high: number | null } | null>(null);
  useEffect(() => {
    let c = false;
    (async () => {
      const e = await estimateMachinePrice({ machine_type: ctx.category, brand: ctx.brand, model: ctx.model, year: ctx.year, country: ctx.country });
      if (!c) setEst(e.method === 'median_iqr' ? e : null);
    })();
    return () => { c = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.brand, ctx.model, ctx.year, ctx.category, ctx.country]);
  if (!est || est.estimate == null) return null; // invisible sans donnée (anti-façade)
  let verdict = '';
  if (price) {
    if (price < (est.low ?? est.estimate)) verdict = 'sous le marché';
    else if (price > (est.high ?? est.estimate)) verdict = 'au-dessus du marché';
    else verdict = 'dans la fourchette du marché';
  }
  return (
    <p className="text-sm text-gray-500">
      Estimation marché ~{est.estimate.toLocaleString('fr-FR')} €{verdict ? ` · ${verdict}` : ''}
    </p>
  );
}

/** Alerte fraude inline — n'apparaît QUE si un risque réel est détecté. */
export function FraudInline({ price, sellerId, hasImages, ...ctx }: MachineCtx & { sellerId?: string | null; hasImages?: boolean }) {
  const [warn, setWarn] = useState<string | null>(null);
  useEffect(() => {
    let c = false;
    (async () => {
      if (!price) { if (!c) setWarn(null); return; }
      const e = await estimateMachinePrice({ machine_type: ctx.category, brand: ctx.brand, model: ctx.model, year: ctx.year, country: ctx.country });
      const tp = sellerId ? await getTrustProfile(sellerId) : null;
      const r = fraudSignals({
        price,
        estimate: e.estimate ?? null,
        sellerTrustScore: tp?.trust_score ?? 0,
        sellerVerifiedIdentity: !!tp && tp.trust_tier !== 'unverified',
        listingAgeMinutes: 10000,
        hasImages: !!hasImages,
      });
      if (!c) setWarn(r.risk !== 'low' ? (r.reasons[0] ?? 'Signaux à vérifier') : null);
    })();
    return () => { c = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price, sellerId, ctx.brand, ctx.model, ctx.year, ctx.category, ctx.country, hasImages]);
  if (!warn) return null;
  return (
    <div className="mt-2 rounded-md bg-amber-50 text-amber-800 text-xs px-3 py-2">
      ⚠ Vérifiez avant de payer : {warn}
    </div>
  );
}

/** Bouton « Demander une inspection » au style des CTA existants. */
export function InspectionInlineButton({ machineId, location }: { machineId?: string | null; location?: string | null }) {
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const onClick = async () => {
    if (!machineId) return;
    setPending(true);
    const r = await requestInspection({ machine_id: machineId, location: location ?? '' });
    setPending(false);
    setResult(r.ok
      ? `Demande d'inspection enregistrée (réf. ${r.id}).`
      : "Inspection bientôt disponible — en attente d'activation partenaire.");
  };
  return (
    <>
      <button
        onClick={onClick}
        disabled={pending || !machineId}
        className="w-full border border-gray-300 text-gray-700 px-6 py-3 rounded-md hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"
      >
        <ClipboardCheck className="h-5 w-5 mr-2" />
        {pending ? 'Envoi…' : 'Demander une inspection'}
      </button>
      {result && <p className="text-xs text-amber-700">{result}</p>}
    </>
  );
}
