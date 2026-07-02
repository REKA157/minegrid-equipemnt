import React, { useState } from 'react';
import { registerUser } from '../utils/api';
import { Crown, Star, Building, Check, Lock } from 'lucide-react';
import supabase from '../utils/supabaseClient';
import PaymentPage from './PaymentPage';
import { toast } from '../utils/toast';
import { setAccountItem, removeAccountItem } from '../utils/accountLocalStorage';
const TEMP_ACCESS_CODE = (import.meta.env.VITE_MONITOR_TEMP_ACCESS_CODE || '').trim();

interface RegisterProps {
  /** Pré-sélection depuis l'URL (#inscription?type=seller). */
  initialType?: 'client' | 'seller' | null;
}

type SubscriptionId = 'gratuit' | 'premium' | 'pro' | 'enterprise';
type SubscriptionPlan = {
  id: SubscriptionId;
  name: string;
  icon: React.ReactNode;
  price: string;
  priceValue: number;
  features: string[];
  color: string;
};

function TempAccessPanel() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  if (!TEMP_ACCESS_CODE) {
    return null;
  }

  const handleAccess = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim() === TEMP_ACCESS_CODE) {
      sessionStorage.setItem('monitor_temp_access', 'granted');
      localStorage.setItem('user', JSON.stringify({
        email: 'demo@minegrid.com',
        firstName: 'Démo',
        lastName: 'Minegrid',
      }));
      localStorage.setItem('selectedSubscription', 'gratuit');
      window.location.hash = '#dashboard';
    } else {
      setError(true);
    }
  };

  if (!open) {
    return (
      <div className="mt-8 text-center">
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Accès démo (code temporaire)
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-md mx-auto bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="h-4 w-4 text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-700">Accès démo temporaire</h4>
      </div>
      <form onSubmit={handleAccess} className="flex gap-2">
        <input
          type="password"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(false); }}
          placeholder="Code d'accès"
          className={`flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ${
            error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'
          }`}
          autoFocus
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Accéder
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mt-2">Code incorrect.</p>}
    </div>
  );
}

export default function Register({ initialType }: RegisterProps) {
  const [formData, setFormData] = useState<{
    accountType: '' | 'client' | 'seller';
    email: string;
    password: string;
    confirmPassword: string;
    firstName: string;
    lastName: string;
    phone: string;
    subscription: 'gratuit' | 'premium' | 'pro' | 'enterprise';
    company: string;
    website: string;
    address: string;
    businessType: string;
    licenseNumber: string;
    country: string;
    city: string;
  }>({
    accountType:
      initialType === 'seller' || initialType === 'client' ? initialType : '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    subscription: 'gratuit',
    company: '',
    website: '',
    address: '',
    businessType: '',
    licenseNumber: '',
    country: '',
    city: '',
  });

  const [loading, setLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error && err.message) return err.message;
    return 'Erreur inconnue';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateBeforePayment = (): boolean => {
    const isBusinessProfile = formData.accountType === 'seller' || formData.subscription === 'enterprise';

    if (!formData.accountType) {
      toast("Veuillez sélectionner un type de compte : Client ou Revendeur.");
      return false;
    }
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast("Veuillez renseigner votre prénom et votre nom.");
      return false;
    }
    if (!formData.phone.trim()) {
      toast("Veuillez renseigner votre téléphone.");
      return false;
    }
    if (!formData.email.trim()) {
      toast("Veuillez renseigner votre email.");
      return false;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(formData.email.trim())) {
      toast("Veuillez saisir une adresse email valide.");
      return false;
    }
    if (formData.password.length < 8) {
      toast("Le mot de passe doit contenir au moins 8 caractères.");
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      toast("Les mots de passe ne correspondent pas.");
      return false;
    }
    if (isBusinessProfile) {
      if (!formData.company.trim() || !formData.businessType.trim() || !formData.address.trim() || !formData.country.trim() || !formData.city.trim()) {
        toast("Veuillez compléter les informations entreprise obligatoires (société, secteur, adresse, pays, ville).");
        return false;
      }
    }

    return true;
  };

  const preparePaidCheckout = async (): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await registerUser({
        ...formData,
        accountType: formData.accountType as 'client' | 'seller',
      });
      const hasSession = Boolean(response?.session);
      localStorage.setItem('selectedSubscription', formData.subscription);
      if (response?.user) {
        localStorage.setItem('user', JSON.stringify(response.user));
      }

      if (!hasSession) {
        toast(
          "Compte créé. Confirmez votre email puis connectez-vous pour finaliser le paiement."
        );
        window.location.hash = '#connexion';
        return false;
      }
      return true;
    } catch (err: unknown) {
      toast("Erreur lors de la création du compte : " + getErrorMessage(err));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubscriptionSelect = async (subscription: SubscriptionId) => {
    setFormData(prev => ({ ...prev, subscription }));
    if (subscription !== 'gratuit') {
      // Les formules payantes redirigent vers le paiement dès la sélection,
      // après validation des informations obligatoires.
      if (validateBeforePayment()) {
        const ready = await preparePaidCheckout();
        if (ready) setShowPayment(true);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateBeforePayment()) return;

    if (formData.subscription === 'gratuit') {
      try {
        setLoading(true);
        const { user } = await registerUser({
          ...formData,
          accountType: formData.accountType as 'client' | 'seller',
        });
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('selectedSubscription', formData.subscription);
        window.location.hash = '#dashboard';
      } catch (err: unknown) {
        toast('Erreur lors de l\'inscription : ' + getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    } else {
      const ready = await preparePaidCheckout();
      if (ready) setShowPayment(true);
    }
  };

  const createSubscription = async (userId: string, subscriptionType: string) => {
    try {
      const { error } = await supabase
        .from('pro_clients')
        .insert({
          user_id: userId,
          company_name: formData.company || `${formData.firstName} ${formData.lastName}`,
          subscription_type: subscriptionType,
          subscription_status: 'active',
          subscription_start: new Date().toISOString().split('T')[0],
          max_users: subscriptionType === 'enterprise' ? 10 : 5
        });

      if (error) {
        console.error('Erreur création abonnement:', error);
      } else {
        console.log('✅ Abonnement créé:', subscriptionType);
      }
    } catch (error) {
      console.error('Erreur création abonnement:', error);
    }
  };

  const finalizePaidRegistration = async () => {
    try {
      const sub = formData.subscription;
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const uid = authUser?.id ?? null;

      setAccountItem(uid, 'selectedSubscription', sub);
      setAccountItem(uid, 'subscriptionActivated', 'true');

      /** Aligne Dashboard / Header sur le plan paye (premium ≠ entreprise). */
      if (sub === 'premium' || sub === 'pro' || sub === 'enterprise') {
        setAccountItem(uid, 'userSubscription', sub);
        setAccountItem(uid, 'tempHasActiveSubscription', 'true');
        setAccountItem(uid, 'tempSubscription', sub);
        removeAccountItem(uid, 'subscriptionCancelled');
      }
      if (sub !== 'enterprise') {
        removeAccountItem(uid, 'enterpriseService');
        removeAccountItem(uid, 'userServices');
      }

      /** Premium / Pro → espace « classique », pas la grille configurateur ENT. */
      if (sub === 'premium') {
        window.location.hash = '#premium-dashboard';
        return;
      }
      if (sub === 'pro') {
        window.location.hash = '#pro';
        return;
      }

      window.location.hash = '#dashboard';
    } finally {
      setShowPayment(false);
    }
  };

  const subscriptionPlans: SubscriptionPlan[] = [
    {
      id: 'gratuit',
      name: 'Gratuit',
      icon: <Star className="h-6 w-6" />,
      price: '0 USD',
      priceValue: 0,
      features: [
        'Publier des annonces',
        'Gestion basique',
        'Support communautaire',
        'Jusqu\'à 3 images par annonce'
      ],
      color: 'border-gray-300 bg-gray-50'
    },
    {
      id: 'premium',
      name: 'Premium',
      icon: <Crown className="h-6 w-6" />,
      price: '30 USD/mois',
      priceValue: 30,
      features: [
        'Visibilité renforcée',
        'Jusqu\'à 10 images par annonce',
        'Support prioritaire',
        'Statistiques détaillées',
        'Badge Premium'
      ],
      color: 'border-purple-300 bg-purple-50'
    },
    {
      id: 'pro',
      name: 'Pro',
      icon: <Building className="h-6 w-6" />,
      price: '70 USD/mois',
      priceValue: 70,
      features: [
        'Dashboard Pro personnalisé',
        'Support dédié',
        'Statistiques complètes',
        'Outils de gestion commerciale',
        'Gestion des contacts clients'
      ],
      color: 'border-blue-300 bg-blue-50'
    },
    {
      id: 'enterprise',
      name: 'Entreprise',
      icon: <Crown className="h-6 w-6" />,
      price: 'À partir de 200 USD/mois',
      priceValue: 200,
      features: [
        'Dashboard personnalisable',
        'Gestion multi-utilisateurs',
        'Support 24/7',
        'API dédiée',
        'Workflows automatisés',
        'Box IA + LLM dédié'
      ],
      color: 'border-orange-300 bg-orange-50'
    }
  ];

  if (showPayment) {
    return (
      <PaymentPage
        subscription={subscriptionPlans.find(p => p.id === formData.subscription)!}
        userData={{
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName
        }}
        onSuccess={finalizePaidRegistration}
        onBack={() => {
          console.log('⬅️ Retour depuis la page de paiement');
          setShowPayment(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold mb-8 text-gray-900 text-center">
          Créer votre compte
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Formulaire d'inscription */}
          <div className="bg-white shadow-md rounded-lg p-8">
            <h3 className="text-xl font-semibold mb-6">Informations personnelles</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700">Prénom *</label>
                  <input
                    name="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Nom *</label>
                  <input
                    name="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700">Téléphone *</label>
                <input
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700">Email *</label>
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700">Mot de passe *</label>
                  <input
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Confirmation *</label>
                  <input
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-4">
                <span className="block text-sm text-gray-700">Type de compte *</span>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="accountType"
                    value="client"
                    checked={formData.accountType === 'client'}
                    onChange={handleInputChange}
                  />
                  Client
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="accountType"
                    value="seller"
                    checked={formData.accountType === 'seller'}
                    onChange={handleInputChange}
                  />
                  Revendeur
                </label>
              </div>

              {(formData.accountType === 'seller' || formData.subscription === 'enterprise') && (
                <div className="mt-6 border-t pt-4 space-y-4">
                  <h4 className="text-lg font-semibold text-gray-900">Informations entreprise</h4>

                  <div>
                    <label className="block text-sm text-gray-700">Raison sociale *</label>
                    <input
                      name="company"
                      type="text"
                      value={formData.company}
                      onChange={handleInputChange}
                      className="w-full border rounded px-3 py-2"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700">Secteur d'activité *</label>
                      <input
                        name="businessType"
                        type="text"
                        placeholder="Ex: BTP, Mines, Transport..."
                        value={formData.businessType}
                        onChange={handleInputChange}
                        className="w-full border rounded px-3 py-2"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">N° registre / licence</label>
                      <input
                        name="licenseNumber"
                        type="text"
                        value={formData.licenseNumber}
                        onChange={handleInputChange}
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700">Adresse *</label>
                    <input
                      name="address"
                      type="text"
                      value={formData.address}
                      onChange={handleInputChange}
                      className="w-full border rounded px-3 py-2"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700">Pays *</label>
                      <input
                        name="country"
                        type="text"
                        value={formData.country}
                        onChange={handleInputChange}
                        className="w-full border rounded px-3 py-2"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Ville *</label>
                      <input
                        name="city"
                        type="text"
                        value={formData.city}
                        onChange={handleInputChange}
                        className="w-full border rounded px-3 py-2"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700">Site web</label>
                    <input
                      name="website"
                      type="url"
                      placeholder="https://"
                      value={formData.website}
                      onChange={handleInputChange}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Sélection d'abonnement */}
          <div className="bg-white shadow-md rounded-lg p-8">
            <h3 className="text-xl font-semibold mb-6">Choisissez votre abonnement</h3>
            <div className="space-y-4">
              {subscriptionPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                    formData.subscription === plan.id
                      ? `${plan.color} border-2 border-primary-500`
                      : 'border-gray-200 hover:border-gray-300'
                  } ${plan.id !== 'gratuit' ? 'hover:border-orange-400 hover:shadow-lg' : ''}`}
                  onClick={() => void handleSubscriptionSelect(plan.id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {plan.icon}
                      <div>
                        <h4 className="font-semibold text-lg">{plan.name}</h4>
                        <p className="text-2xl font-bold text-primary-600">{plan.price}</p>
                      </div>
                    </div>
                    {formData.subscription === plan.id ? (
                      <Check className="h-6 w-6 text-primary-600" />
                    ) : plan.id !== 'gratuit' ? (
                      <div className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                        Paiement
                      </div>
                    ) : null}
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              onClick={(e) => {
                console.log('🔘 Bouton cliqué');
                console.log('📊 Abonnement actuel:', formData.subscription);
                void handleSubmit(e);
              }}
              className="w-full mt-6 bg-primary-600 text-white py-3 px-4 rounded-lg hover:bg-primary-700 font-semibold"
            >
              {loading ? 'Création en cours...' : formData.subscription === 'gratuit' ? 'Créer mon compte gratuit' : `Continuer vers le paiement (${subscriptionPlans.find(p => p.id === formData.subscription)?.price})`}
            </button>
          </div>
        </div>

        {/* Accès temporaire démo */}
        <TempAccessPanel />
      </div>

    </div>
  );
}
