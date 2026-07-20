import React, { useState } from 'react';
import {
  Check,
  Building2,
  Users,
  FileText,
  Wrench,
  Activity,
  Briefcase,
  Gift,
} from 'lucide-react';
import supabase from '../utils/supabaseClient';
import { toast } from '../utils/toast';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { FREE_PLAN, PAID_PLANS, PLAN_RANK, planHomeHash, type PaidPlanDef } from '../config/plans';
import PaddleCheckoutButton from '../components/PaddleCheckoutButton';

// Page de tarifs publique — grille validée 2026-07 (USD, mensuel) :
//   Gratuit 0 $ · Premium 20 $ · Pro 50 $ (populaire) · Enterprise 200 $.
// La grille vient EXCLUSIVEMENT de src/config/plans.ts (source unique).
// Paiement par carte : checkout hébergé Paddle (PaddleCheckoutButton) ; l'activation
// est faite par le webhook serveur, jamais par cette page. Code promo : RPC
// SECURITY DEFINER redeem_promo_code (aucun code dans le bundle).

export default function ProSubscription() {
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  // Situation du visiteur : connecté ? abonné à quel palier ? La page marque
  // « Votre plan actuel » sur la bonne carte au lieu de proposer de re-souscrire.
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const activeRank =
    subscription.isActive && subscription.type ? PLAN_RANK[subscription.type] : 0;

  const currentPlanBadge = (
    <div className="w-full text-center py-3 px-4 rounded-lg font-semibold bg-green-50 text-green-700 border border-green-200">
      ✓ Votre plan actuel
    </div>
  );
  const includedBadge = (
    <div className="w-full text-center py-3 px-4 rounded-lg font-semibold bg-gray-50 text-gray-400 border border-gray-200">
      Inclus dans votre plan
    </div>
  );

  const goToPlanHome = (internalId: string) => {
    window.location.hash = planHomeHash(internalId);
  };

  // Validation + activation 100 % CÔTÉ SERVEUR (RPC redeem_promo_code, migration
  // p15) : le serveur décide du plan accordé, limite les usages et la durée.
  const redeemPromo = async () => {
    const code = promoCode.trim();
    if (!code) {
      toast('Entrez un code promo.');
      return;
    }
    setPromoLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast('Connectez-vous pour utiliser un code promo.');
        window.location.hash = '#connexion';
        return;
      }
      const { data, error } = await supabase.rpc('redeem_promo_code', { p_code: code });
      if (error) {
        toast('Impossible de valider le code pour le moment. Réessayez.');
        return;
      }
      if (!data?.ok) {
        toast(`❌ ${data?.error || 'Code promo invalide'}`);
        return;
      }
      window.dispatchEvent(new Event('subscriptionRefreshRequested'));
      toast('✅ Abonnement activé grâce au code promo !');
      goToPlanHome(String(data.subscription_type ?? ''));
    } catch {
      toast("Erreur lors de l'activation de l'abonnement.");
    } finally {
      setPromoLoading(false);
    }
  };

  const renderPaidCard = (plan: PaidPlanDef) => (
    <div
      key={plan.internalId}
      className={`relative bg-white rounded-lg shadow-lg p-8 flex flex-col ${
        plan.popular ? 'ring-2 ring-primary-500' : ''
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span className="bg-primary-500 text-white px-4 py-1 rounded-full text-sm font-semibold whitespace-nowrap">
            ⭐ Le plus populaire
          </span>
        </div>
      )}

      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-1">{plan.displayName}</h3>
        <p className="text-sm text-gray-500 mb-3">{plan.tagline}</p>
        <div className="text-4xl font-bold text-primary-600 mb-2">
          {plan.priceUsd} USD
          <span className="text-lg text-gray-500 font-normal">/mois</span>
        </div>
        <p className="text-gray-600 flex items-center justify-center gap-1 text-sm">
          <Users className="h-4 w-4" />
          {plan.maxUsers > 1 ? `${plan.maxUsers} utilisateurs` : '1 utilisateur'}
        </p>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start">
            <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">{feature}</span>
          </li>
        ))}
      </ul>

      {activeRank === PLAN_RANK[plan.internalId] ? (
        currentPlanBadge
      ) : activeRank > PLAN_RANK[plan.internalId] ? (
        includedBadge
      ) : (
        // NB : « Passer à » ouvre un NOUVEL abonnement Paddle ; l'upgrade propre
        // (proration + annulation de l'ancien) sera géré côté Paddle avant la prod.
        <PaddleCheckoutButton
          planId={plan.internalId}
          label={
            activeRank > 0
              ? `Passer à ${plan.displayName} — ${plan.priceUsd} USD/mois`
              : `S'abonner — ${plan.priceUsd} USD/mois`
          }
          onSuccess={() => {
            toast('✅ Paiement confirmé. Votre abonnement est actif !');
            goToPlanHome(plan.internalId);
          }}
          onError={(message) => toast(message)}
        />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <Building2 className="h-16 w-16 text-primary-600 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Des formules pour chaque étape de votre activité
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Explorez gratuitement la marketplace, gérez votre parc, développez votre
            activité avec l'IA, ou pilotez toute votre équipe. Paiement sécurisé, sans
            engagement, résiliable à tout moment.
          </p>
        </div>

        {/* Plans : Gratuit + 3 payants */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12 items-stretch">
          {/* Gratuit */}
          <div className="relative bg-white rounded-lg shadow-lg p-8 flex flex-col">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                {FREE_PLAN.displayName}
              </h3>
              <p className="text-sm text-gray-500 mb-3">{FREE_PLAN.tagline}</p>
              <div className="text-4xl font-bold text-primary-600 mb-2">
                0 USD
                <span className="text-lg text-gray-500 font-normal">/mois</span>
              </div>
              <p className="text-gray-600 flex items-center justify-center gap-1 text-sm">
                <Users className="h-4 w-4" />1 utilisateur
              </p>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {FREE_PLAN.features.map((feature) => (
                <li key={feature} className="flex items-start">
                  <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
            {!user ? (
              <a
                href="#inscription"
                className="w-full text-center py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Créer un compte gratuit
              </a>
            ) : activeRank === 0 ? (
              currentPlanBadge
            ) : (
              includedBadge
            )}
          </div>

          {PAID_PLANS.map(renderPaidCard)}
        </div>

        {/* Code promo */}
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto mb-16">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="h-6 w-6 text-orange-600" />
            <h2 className="text-xl font-bold text-gray-900">Vous avez un code promo ?</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Un code promo donne un accès temporaire gratuit. Il est vérifié et activé
            par nos serveurs, en une seule fois par compte.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Entrez votre code promo"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <button
              type="button"
              onClick={() => void redeemPromo()}
              disabled={promoLoading || !promoCode.trim()}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {promoLoading ? 'Vérification…' : 'Valider'}
            </button>
          </div>
        </div>

        {/* Fonctionnalités détaillées */}
        <div>
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Ce que vous débloquez avec un abonnement
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <Briefcase className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Gestion du parc
              </h3>
              <p className="text-gray-600">
                Équipements, commandes et maintenance dans un seul tableau de bord
                (dès Premium)
              </p>
            </div>

            <div className="text-center">
              <FileText className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Appels d'offres IA
              </h3>
              <p className="text-gray-600">
                Analyse de DCE, go/no-go et mémoire technique assistés par IA (dès Pro)
              </p>
            </div>

            <div className="text-center">
              <Activity className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Radar d'opportunités
              </h3>
              <p className="text-gray-600">
                Détection automatique d'opportunités de vente adaptées à votre stock
                (dès Pro)
              </p>
            </div>

            <div className="text-center">
              <Wrench className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Cockpit métier & équipe
              </h3>
              <p className="text-gray-600">
                Dashboard personnalisable par métier, pipeline commercial et 5
                utilisateurs (Enterprise)
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-500 text-center mt-12">
          Paiement sécurisé opéré par Paddle (cartes internationales, TVA gérée
          automatiquement). En souscrivant, vous acceptez nos conditions d'utilisation
          et notre politique de confidentialité.
        </p>
      </div>
    </div>
  );
}
