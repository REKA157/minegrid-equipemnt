import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { supabaseClient as supabase } from '../utils/supabaseClient';
import { setAccountItem, removeAccountItem } from '../utils/accountLocalStorage';

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

interface StripePaymentFormProps {
  planType: 'premium' | 'pro' | 'enterprise';
  amount: number;
  onSuccess: () => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

const PaymentForm: React.FC<StripePaymentFormProps> = ({
  planType,
  amount,
  onSuccess,
  onError,
  onCancel
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => {
    // Créer le Payment Intent au chargement
    createPaymentIntent();
  }, [planType]);

  const createPaymentIntent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        onError('Utilisateur non connecté');
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          planId: planType,
        }
      });

      if (error) throw error;
      setClientSecret(data.clientSecret);
    } catch (error) {
      console.error('Erreur création Payment Intent:', error);
      onError('Erreur lors de l\'initialisation du paiement');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: {
            name: 'Nom du client', // Vous pouvez récupérer depuis un formulaire
          },
        }
      });

      if (error) {
        onError(error.message || 'Erreur lors du paiement');
      } else if (paymentIntent.status === 'succeeded') {
        // Paiement réussi - activer l'abonnement
        await activateSubscription(paymentIntent.id);
        onSuccess();
      }
    } catch (error) {
      console.error('Erreur paiement:', error);
      onError('Erreur lors du traitement du paiement');
    } finally {
      setIsProcessing(false);
    }
  };

  const activateSubscription = async (paymentIntentId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      // Activer l'abonnement dans la base de données
      const { error } = await supabase
        .from('pro_clients')
        .insert({
          user_id: user.id,
          company_name: user.user_metadata?.full_name || 'Entreprise',
          subscription_type: planType,
          subscription_status: 'active',
          subscription_start: new Date().toISOString().split('T')[0],
          payment_method: 'stripe',
          payment_amount: amount,
          stripe_payment_intent_id: paymentIntentId
        });

      if (error) throw error;

      // Mettre à jour le localStorage par compte
      setAccountItem(user.id, 'userSubscription', planType);
      removeAccountItem(user.id, 'subscriptionCancelled');
      
      // Mettre à jour les clés spécifiques pour l'abonnement entreprise
      if (planType === 'enterprise') {
        removeAccountItem(user.id, 'subscriptionCancelled');
        setAccountItem(user.id, 'userSubscription', 'enterprise');
        setAccountItem(user.id, 'enterpriseService', 'true');
        setAccountItem(user.id, 'userServices', 'enterprise');
        
          setTimeout(() => {
          window.dispatchEvent(new CustomEvent('enterpriseSubscriptionActivated', {
            detail: { planType: 'enterprise' }
          }));
        }, 100);
      }

    } catch (error) {
      console.error('Erreur activation abonnement:', error);
      throw error;
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#9e2146',
      },
    },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Informations de paiement sécurisées
        </h3>
        <CardElement options={cardElementOptions} />
        <p className="text-xs text-gray-500 mt-2">
          Vos informations de paiement sont sécurisées et cryptées par Stripe
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-lg font-medium text-gray-900 mb-3">Résumé de commande</h4>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">
            {planType === 'premium' ? 'Premium' : 
             planType === 'pro' ? 'Pro' : 'Enterprise'} - Abonnement mensuel
          </span>
          <span className="font-semibold text-lg">{amount}€</span>
        </div>
      </div>

      <div className="flex space-x-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing}
          className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors ${
            !stripe || isProcessing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-orange-600 text-white hover:bg-orange-700'
          }`}
        >
          {isProcessing ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Traitement...</span>
            </div>
          ) : (
            `Payer ${amount}€`
          )}
        </button>
      </div>
    </form>
  );
};

const StripePaymentForm: React.FC<StripePaymentFormProps> = (props) => {
  if (!stripeKey) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <p className="text-amber-800 font-medium">
          Le paiement en ligne n'est pas configuré pour le moment.
        </p>
        <p className="text-amber-700 text-sm mt-2">
          Veuillez contacter l'administrateur pour activer les paiements.
        </p>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise!}>
      <PaymentForm {...props} />
    </Elements>
  );
};

export default StripePaymentForm; 