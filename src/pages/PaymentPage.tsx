import React, { useState } from 'react';
import { CreditCard, Lock, Check, X, ArrowLeft, Gift } from 'lucide-react';
import supabase from '../utils/supabaseClient';
import { toast } from '../utils/toast';
import { setAccountItem } from '../utils/accountLocalStorage';
import StripePaymentForm from '../components/StripePaymentForm';
interface PaymentPageProps {
  subscription: {
    id: string;
    name: string;
    price: string;
    priceValue: number;
    features: string[];
  };
  userData: {
    email: string;
    firstName: string;
    lastName: string;
  };
  onSuccess: () => void;
  onBack: () => void;
}

export default function PaymentPage({ subscription, userData, onSuccess, onBack }: PaymentPageProps) {
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'promo'>('card');
  const [promoCode, setPromoCode] = useState('');
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [promoValid, setPromoValid] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [loading, setLoading] = useState(false);

  const VALID_PROMO_CODE = (import.meta.env.VITE_PROMO_CODE || '').trim();
  const promoEnabled = VALID_PROMO_CODE.length > 0;

  const handlePromoCodeValidation = async () => {
    if (!promoEnabled) {
      setPromoError('Les codes promo sont désactivés sur cet environnement');
      setPromoValid(false);
      return;
    }
    if (!promoCode.trim()) {
      setPromoError('Veuillez saisir un code promo');
      return;
    }

    setIsValidatingPromo(true);
    setPromoError('');

    // Simuler une validation
    setTimeout(() => {
      if (promoCode.trim() === VALID_PROMO_CODE) {
        setPromoValid(true);
        setPromoError('');
      } else {
        setPromoValid(false);
        setPromoError('Code promo invalide');
      }
      setIsValidatingPromo(false);
    }, 1000);
  };

  const handlePayment = async () => {
    if (paymentMethod !== 'promo') {
      toast('Utilisez le formulaire Stripe pour le paiement par carte.');
      return;
    }

    setLoading(true);

    try {
      if (paymentMethod === 'promo' && promoValid) {
        // Accès direct avec code promo
        await activateSubscriptionWithPromo();
      }
    } catch (error) {
      console.error('Erreur lors du paiement:', error);
      toast('Erreur lors du traitement du paiement');
    } finally {
      setLoading(false);
    }
  };

  const activateSubscriptionWithPromo = async () => {
    try {
      // Obtenir l'utilisateur actuel
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        // Flux inscription: l'utilisateur n'est pas encore connecté.
        // On conserve l'activation localement; Register finalisera l'inscription.
        setAccountItem(null, 'selectedSubscription', subscription.id);
        setAccountItem(null, 'subscriptionActivated', 'true');
        setAccountItem(null, 'promoCodeUsed', VALID_PROMO_CODE);
        onSuccess();
        return;
      }

      // Créer l'abonnement avec accès temporaire
      const { error: subscriptionError } = await supabase
        .from('pro_clients')
        .insert({
          user_id: user.id,
          company_name: `${userData.firstName} ${userData.lastName}`,
          subscription_type: subscription.id,
          subscription_status: 'active',
          subscription_start: new Date().toISOString().split('T')[0],
          subscription_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 jours
          max_users: subscription.id === 'enterprise' ? 10 : 5,
          promo_code_used: VALID_PROMO_CODE,
          payment_method: 'promo_code'
        });

      if (subscriptionError) {
        throw subscriptionError;
      }

      // Sauvegarder par compte
      setAccountItem(user.id, 'selectedSubscription', subscription.id);
      setAccountItem(user.id, 'subscriptionActivated', 'true');
      setAccountItem(user.id, 'promoCodeUsed', VALID_PROMO_CODE);

      toast('✅ Abonnement activé avec succès grâce au code promo ! Accès temporaire de 30 jours.');
      onSuccess();
    } catch (error) {
      console.error('Erreur activation abonnement promo:', error);
      throw error;
    }
  };

  const stripePlanType: 'premium' | 'pro' | 'enterprise' =
    subscription.id === 'enterprise'
      ? 'enterprise'
      : subscription.id === 'premium'
      ? 'premium'
      : 'pro';

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour à la sélection
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Finaliser votre abonnement</h1>
          <p className="text-gray-600 mt-2">
            {subscription.name} - {subscription.price}/mois
          </p>
        </div>

        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Méthodes de paiement */}
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold mb-4">Choisissez votre méthode de paiement</h2>
            
            <div className="space-y-3">
              {/* Option Carte */}
              <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="card"
                  checked={paymentMethod === 'card'}
                  onChange={(e) => setPaymentMethod(e.target.value as 'card')}
                  className="mr-3"
                />
                <CreditCard className="h-5 w-5 text-gray-600 mr-3" />
                <div>
                  <div className="font-medium">Carte bancaire</div>
                  <div className="text-sm text-gray-500">Paiement sécurisé</div>
                </div>
              </label>

              {/* Option Code Promo */}
              <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="promo"
                  checked={paymentMethod === 'promo'}
                  onChange={(e) => setPaymentMethod(e.target.value as 'promo')}
                  className="mr-3"
                />
                <Gift className="h-5 w-5 text-orange-600 mr-3" />
                <div>
                  <div className="font-medium">Code promo</div>
                  <div className="text-sm text-gray-500">Accès temporaire gratuit</div>
                </div>
              </label>
            </div>
          </div>

          {/* Formulaire de paiement */}
          <div className="p-6">
            {paymentMethod === 'card' ? (
              <StripePaymentForm
                planType={stripePlanType}
                amount={subscription.priceValue}
                onSuccess={() => {
                  toast('✅ Paiement confirmé. Abonnement activé.');
                  onSuccess();
                }}
                onError={(message) => {
                  toast(message || 'Erreur lors du paiement Stripe');
                }}
                onCancel={onBack}
              />
            ) : (
              /* Formulaire code promo */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Code promo
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Entrez votre code promo"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value);
                        setPromoValid(false);
                        setPromoError('');
                      }}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <button
                      onClick={handlePromoCodeValidation}
                      disabled={isValidatingPromo || !promoCode.trim()}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isValidatingPromo ? 'Vérification...' : 'Valider'}
                    </button>
                  </div>
                  
                  {promoError && (
                    <div className="flex items-center text-red-600 text-sm mt-2">
                      <X className="h-4 w-4 mr-1" />
                      {promoError}
                    </div>
                  )}
                  
                  {promoValid && (
                    <div className="flex items-center text-green-600 text-sm mt-2">
                      <Check className="h-4 w-4 mr-1" />
                      Code promo valide ! Accès temporaire de 30 jours.
                    </div>
                  )}
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center text-orange-800">
                    <Gift className="h-5 w-5 mr-2" />
                    <span className="font-medium">Offre spéciale</span>
                  </div>
                  <p className="text-sm text-orange-700 mt-1">
                    Utilisez le code promo pour un accès temporaire gratuit à tous les abonnements.
                  </p>
                </div>
              </div>
            )}

            {paymentMethod === 'promo' && (
              <>
                {/* Résumé de la commande */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-3">Résumé de votre commande</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Abonnement {subscription.name}</span>
                      <span className="font-medium">{subscription.price}/mois</span>
                    </div>
                    {promoValid && (
                      <div className="flex justify-between text-green-600">
                        <span>Code promo appliqué</span>
                        <span>-{subscription.price}</span>
                      </div>
                    )}
                    <div className="border-t pt-2">
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span>{promoValid ? '0 USD' : subscription.price}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handlePayment}
                  disabled={loading || !promoValid}
                  className="w-full mt-6 bg-orange-600 text-white py-3 px-4 rounded-lg hover:bg-orange-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Traitement en cours...
                    </>
                  ) : (
                    <>
                      <Lock className="h-5 w-5 mr-2" />
                      Activer avec code promo
                    </>
                  )}
                </button>
              </>
            )}

            <p className="text-xs text-gray-500 text-center mt-4">
              Vos informations de paiement sont sécurisées et cryptées.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 