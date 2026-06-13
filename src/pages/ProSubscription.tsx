import React, { useState } from 'react';
import { Check, Building2, Users, Shield, Clock, FileText, Wrench, Activity, Briefcase, CreditCard, Lock, X, ArrowLeft, Gift } from 'lucide-react';
import { upsertProClientProfile } from '../utils/proApi';
import supabase from '../utils/supabaseClient';
import { toast } from '../utils/toast';
interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
  popular?: boolean;
  maxUsers: number;
  maxEquipment: number;
}

// Grille tarifaire. Les valeurs doivent respecter la règle : Pro < Premium <
// Enterprise (l'ancienne grille avait Premium=30 < Pro=70, manifestement un
// bug). Si la grille réelle diffère, mettre à jour ici ET dans
// src/pages/Dashboard.jsx (fonction getPlanPrice autour de la ligne 696).
const plans: Plan[] = [
  {
    id: 'pro',
    name: 'Pro',
    price: 70,
    period: 'mois',
    maxUsers: 5,
    maxEquipment: 50,
    features: [
      'Portail utilisateur complet',
      'Gestion des équipements',
      'Suivi des commandes',
      'Documents techniques',
      'Maintenance préventive',
      'Notifications en temps réel',
      'Support email'
    ]
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 149,
    period: 'mois',
    maxUsers: 15,
    maxEquipment: 200,
    popular: true,
    features: [
      'Tout du plan Pro',
      'Gestion multi-sites',
      'Diagnostics avancés',
      'API personnalisée',
      'Support téléphonique',
      'Formation personnalisée',
      'Rapports avancés'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 299,
    period: 'mois',
    maxUsers: 50,
    maxEquipment: 1000,
    features: [
      'Tout du plan Premium',
      'Déploiement sur site',
      'Intégration personnalisée',
      'Support dédié 24/7',
      'Formation complète',
      'SLA garanti',
      'Consulting inclus'
    ]
  }
];

const PROMO_CODE = (import.meta.env.VITE_PROMO_CODE || '').trim();
const PROMO_ENABLED = PROMO_CODE.length > 0;

export default function ProSubscription() {
  const [selectedPlan, setSelectedPlan] = useState<string>('premium');
  const [isLoading, setIsLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    siret: '',
    address: '',
    phone: '',
    contactPerson: '',
    email: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Gérer l'affichage des formulaires selon la méthode de paiement
  React.useEffect(() => {
    if (showPayment) {
      const handlePaymentMethodChange = () => {
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked') as HTMLInputElement;
        const cardForm = document.getElementById('cardForm');
        const promoForm = document.getElementById('promoForm');
        const promoDiscount = document.getElementById('promoDiscount');
        const totalPrice = document.getElementById('totalPrice');
        
        if (paymentMethod?.value === 'promo') {
          cardForm!.style.display = 'none';
          promoForm!.style.display = 'block';
          promoDiscount!.style.display = 'flex';
          totalPrice!.textContent = '0 USD';
        } else {
          cardForm!.style.display = 'block';
          promoForm!.style.display = 'none';
          promoDiscount!.style.display = 'none';
          totalPrice!.textContent = `${plans.find(p => p.id === selectedPlan)?.price}€`;
        }
      };

      // Ajouter les event listeners
      document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
        radio.addEventListener('change', handlePaymentMethodChange);
      });

      // Initialiser l'affichage
      handlePaymentMethodChange();

      // Cleanup
      return () => {
        document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
          radio.removeEventListener('change', handlePaymentMethodChange);
        });
      };
    }
  }, [showPayment, selectedPlan]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🔍 handleSubmit appelé - redirection vers paiement');
    
    // Vérifier que tous les champs requis sont remplis
    if (!formData.companyName || !formData.contactPerson || !formData.email) {
      toast('Veuillez remplir tous les champs obligatoires');
      return;
    }

    // Au lieu d'activer directement l'abonnement, afficher la page de paiement
    setShowPayment(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <Building2 className="h-16 w-16 text-primary-600 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Portail Pro Minegrid
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Gérez vos équipements, commandes et maintenance en toute simplicité. 
            Accédez à un portail professionnel dédié aux acteurs du BTP et des mines.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white rounded-lg shadow-lg p-8 ${
                plan.popular ? 'ring-2 ring-primary-500' : ''
              } ${selectedPlan === plan.id ? 'border-2 border-primary-500' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-primary-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Le plus populaire
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <div className="text-4xl font-bold text-primary-600 mb-2">
                  {plan.id === 'enterprise' ? 'À partir de 200 USD' : `${plan.price} USD`}
                  <span className="text-lg text-gray-500 font-normal">/{plan.period}</span>
                </div>
                <p className="text-gray-600">
                  Jusqu'à {plan.maxUsers} utilisateurs • {plan.maxEquipment} équipements
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                  selectedPlan === plan.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {selectedPlan === plan.id ? 'Plan sélectionné' : 'Sélectionner'}
              </button>
            </div>
          ))}
        </div>

        {/* Formulaire d'inscription */}
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Souscrire au plan {plans.find(p => p.id === selectedPlan)?.name}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom de l'entreprise *
                </label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SIRET
                </label>
                <input
                  type="text"
                  name="siret"
                  value={formData.siret}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Téléphone *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact principal *
                </label>
                <input
                  type="text"
                  name="contactPerson"
                  value={formData.contactPerson}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adresse
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Récapitulatif de votre sélection</h3>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">
                  Plan {plans.find(p => p.id === selectedPlan)?.name}
                </span>
                <span className="font-semibold text-gray-900">
                  {plans.find(p => p.id === selectedPlan)?.price} USD/mois
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Traitement...' : `Continuer vers le paiement (${plans.find(p => p.id === selectedPlan)?.price} USD/mois)`}
            </button>

            <p className="text-sm text-gray-500 text-center">
              En souscrivant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
            </p>
          </form>
        </div>

        {/* Fonctionnalités détaillées */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Fonctionnalités du portail Pro
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <Briefcase className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Gestion d'équipements</h3>
              <p className="text-gray-600">
                Suivez vos machines par numéro de série et QR-codes
              </p>
            </div>

            <div className="text-center">
              <FileText className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Documents techniques</h3>
              <p className="text-gray-600">
                Accédez à tous vos manuels, certificats et garanties
              </p>
            </div>

            <div className="text-center">
              <Wrench className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Maintenance</h3>
              <p className="text-gray-600">
                Planifiez et suivez vos interventions de maintenance
              </p>
            </div>

            <div className="text-center">
              <Activity className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Diagnostics</h3>
              <p className="text-gray-600">
                Surveillez l'état de vos équipements en temps réel
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Page de paiement intégrée */}
      {showPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Finaliser votre abonnement</h2>
                  <p className="text-gray-600 mt-1">
                    {plans.find(p => p.id === selectedPlan)?.name} - {plans.find(p => p.id === selectedPlan)?.price} USD/mois
                  </p>
                </div>
                <button
                  onClick={() => setShowPayment(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Méthodes de paiement */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Choisissez votre méthode de paiement</h3>
                
                <div className="space-y-3">
                  {/* Option Carte */}
                  <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="card"
                      defaultChecked
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
              <div className="space-y-4">
                {/* Formulaire carte bancaire */}
                <div id="cardForm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Numéro de carte
                      </label>
                      <input
                        type="text"
                        placeholder="1234 5678 9012 3456"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Date d'expiration
                      </label>
                      <input
                        type="text"
                        placeholder="MM/AA"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CVC
                      </label>
                      <input
                        type="text"
                        placeholder="123"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nom sur la carte
                      </label>
                      <input
                        type="text"
                        placeholder="Jean Dupont"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Formulaire code promo */}
                <div id="promoForm" style={{ display: 'none' }}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Code promo
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Entrez votre code promo"
                        id="promoCode"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                      <button
                        onClick={() => {
                          const code = (document.getElementById('promoCode') as HTMLInputElement).value;
                          if (!PROMO_ENABLED) {
                            toast('Les codes promo sont désactivés sur cet environnement.');
                            return;
                          }
                          if (code === PROMO_CODE) {
                            toast('✅ Code promo valide ! Accès temporaire de 30 jours.');
                            // Activer l'abonnement avec code promo
                            activateSubscriptionWithPromo();
                          } else {
                            toast('❌ Code promo invalide');
                          }
                        }}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                      >
                        Valider
                      </button>
                    </div>
                  </div>

                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
                    <div className="flex items-center text-orange-800">
                      <Gift className="h-5 w-5 mr-2" />
                      <span className="font-medium">Offre spéciale</span>
                    </div>
                    <p className="text-sm text-orange-700 mt-1">
                      Utilisez le code promo pour un accès temporaire gratuit à tous les abonnements.
                    </p>
                  </div>
                </div>
              </div>

              {/* Résumé de la commande */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-3">Résumé de votre commande</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Abonnement {plans.find(p => p.id === selectedPlan)?.name}</span>
                    <span className="font-medium">{plans.find(p => p.id === selectedPlan)?.price} USD/mois</span>
                  </div>
                  <div className="flex justify-between text-green-600" id="promoDiscount" style={{ display: 'none' }}>
                    <span>Code promo appliqué</span>
                    <span>-{plans.find(p => p.id === selectedPlan)?.price} USD</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span id="totalPrice">{plans.find(p => p.id === selectedPlan)?.price} USD</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bouton de paiement */}
              <button
                onClick={() => {
                  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked') as HTMLInputElement;
                  if (paymentMethod?.value === 'promo') {
                    const code = (document.getElementById('promoCode') as HTMLInputElement).value;
                    if (!PROMO_ENABLED) {
                      toast('Les codes promo sont désactivés sur cet environnement.');
                      return;
                    }
                    if (code === PROMO_CODE) {
                      activateSubscriptionWithPromo();
                    } else {
                      toast('Veuillez entrer un code promo valide');
                    }
                  } else {
                    // SÉCURITÉ : plus de « simulation » de paiement carte (qui activait
                    // l'abonnement sans débit). Le paiement carte passe par le formulaire
                    // Stripe sécurisé (Edge Function create-payment + webhook serveur).
                    toast("Le paiement par carte se fait via le formulaire Stripe sécurisé. Aucun montant n'a été débité.");
                  }
                }}
                className="w-full mt-6 bg-orange-600 text-white py-3 px-4 rounded-lg hover:bg-orange-700 font-semibold flex items-center justify-center"
              >
                <Lock className="h-5 w-5 mr-2" />
                Payer {plans.find(p => p.id === selectedPlan)?.price} USD
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                Vos informations de paiement sont sécurisées et cryptées.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // SÉCURITÉ : l'activation d'abonnement par code promo côté client est supprimée
  // (la valeur du code est dans le bundle JS, donc contournable). La validation et
  // l'activation doivent passer par une Edge Function serveur. No-op informatif.
  const activateSubscriptionWithPromo = async () => {
    toast("La validation des codes promo est en cours de sécurisation côté serveur et n'active plus l'abonnement directement.");
  };
} 