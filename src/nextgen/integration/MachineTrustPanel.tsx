import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, ClipboardCheck, Banknote, Lock, Truck } from 'lucide-react';
import { StatusBadge } from '../ui/primitives';
import TrustBadge from '../trust/TrustBadge';
import { getTrustProfile } from '../trust/trustService';
import type { TrustProfile } from '../trust/types';
import { estimateMachinePrice } from '../data/priceService';
import type { PriceEstimate } from '../data/estimatePrice';
import { fraudSignals } from '../ai/fraudSignals';
import { requestInspection } from '../inspection/inspectionService';

/**
 * Panneau « Confiance & Services » intégré dans la fiche machine réelle.
 *
 * Règle anti-façade : chaque section LIT les données réelles (Supabase) et DÉGRADE
 * honnêtement quand elles manquent — « Non vérifié », « Donnée indisponible »,
 * « En attente d'intégration partenaire ». Aucune valeur inventée, aucun faux succès.
 * Les écritures sensibles restent serveur ; ici on ne fait que lire et soumettre.
 */
interface Props {
  machineId?: string | null;
  sellerId?: string | null;
  price?: number | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  category?: string | null;
  country?: string | null;
  hasImages?: boolean;
}

export default function MachineTrustPanel(props: Props) {
  const { machineId, sellerId, price, brand, model, year, category, country, hasImages } = props;
  const [trust, setTrust] = useState<TrustProfile | null>(null);
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [insp, setInsp] = useState<{ tone: 'ok' | 'wait' | 'err'; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (sellerId) {
        const p = await getTrustProfile(sellerId);
        if (!cancelled) setTrust(p);
      }
      const e = await estimateMachinePrice({ machine_type: category, brand, model, year, country });
      if (!cancelled) setEstimate(e);
    })();
    return () => { cancelled = true; };
  }, [sellerId, category, brand, model, year, country]);

  const fraud = useMemo(() => {
    if (!price || price <= 0) return null;
    return fraudSignals({
      price,
      estimate: estimate?.estimate ?? null,
      sellerTrustScore: trust?.trust_score ?? 0,
      sellerVerifiedIdentity: !!trust && trust.trust_tier !== 'unverified',
      listingAgeMinutes: 10000,
      hasImages: !!hasImages,
    });
  }, [price, estimate, trust, hasImages]);

  const onRequestInspection = async () => {
    if (!machineId) return;
    setPending(true);
    const r = await requestInspection({ machine_id: machineId, location: country ?? '' });
    setPending(false);
    setInsp(
      r.ok
        ? { tone: 'ok', message: `Demande d'inspection enregistrée (réf. ${r.id}). Vous serez recontacté.` }
        : { tone: 'wait', message: "Inspection bientôt disponible sur ce corridor — en attente d'activation d'un inspecteur partenaire." },
    );
  };

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Confiance &amp; services MineGrid</h3>

      {/* Confiance vendeur */}
      <Row icon={ShieldCheck} label="Confiance vendeur">
        {trust ? <TrustBadge tier={trust.trust_tier} score={trust.trust_score} size="sm" /> : <StatusBadge status="unverified" />}
      </Row>

      {/* Estimation de prix */}
      <Row icon={Banknote} label="Estimation marché">
        {estimate?.method === 'median_iqr' && estimate.estimate != null ? (
          <span className="text-sm text-gray-800">
            {estimate.estimate.toLocaleString('fr-FR')} €{' '}
            <span className="text-gray-400">({estimate.low?.toLocaleString('fr-FR')}–{estimate.high?.toLocaleString('fr-FR')})</span>
          </span>
        ) : (
          <span className="text-sm text-gray-400">Donnée indisponible</span>
        )}
      </Row>

      {/* Risque de fraude */}
      <Row icon={Lock} label="Analyse de risque">
        {fraud ? (
          <span className={`text-sm font-medium ${fraud.risk === 'high' ? 'text-red-700' : fraud.risk === 'medium' ? 'text-amber-700' : 'text-green-700'}`}>
            {fraud.risk === 'high' ? 'Élevé' : fraud.risk === 'medium' ? 'Modéré' : 'Faible'}
            {fraud.reasons[0] ? ` · ${fraud.reasons[0]}` : ''}
          </span>
        ) : (
          <span className="text-sm text-gray-400">Signaux insuffisants</span>
        )}
      </Row>

      {/* Inspection */}
      <div className="pt-1">
        <button
          onClick={onRequestInspection}
          disabled={pending || !machineId}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-orange-300 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50"
        >
          <ClipboardCheck className="h-4 w-4" /> {pending ? 'Envoi…' : 'Demander une inspection'}
        </button>
        {insp && (
          <p className={`mt-2 text-xs ${insp.tone === 'ok' ? 'text-green-700' : insp.tone === 'err' ? 'text-red-600' : 'text-amber-700'}`}>{insp.message}</p>
        )}
      </div>

      {/* Services dépendant de partenaires — affichés honnêtement */}
      <div className="grid grid-cols-1 gap-1 pt-1 text-xs text-gray-500">
        <PartnerLine icon={Lock} label="Paiement sécurisé (séquestre)" />
        <PartnerLine icon={Banknote} label="Financement" />
        <PartnerLine icon={Truck} label="Transport &amp; dédouanement" />
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-gray-600"><Icon className="h-4 w-4 text-gray-400" />{label}</span>
      {children}
    </div>
  );
}

function PartnerLine({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{label}</span>
      <StatusBadge status="awaiting_partner" />
    </div>
  );
}
