import React from 'react';
import { Shield, Video, FileText, BarChart as ChartBar, Bell, HeadphonesIcon, Check, Info } from 'lucide-react';
import type { PremiumPlan } from '../types';

const premiumPlans: PremiumPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 29.99,
    duration: 30,
    features: ['featured', 'enhanced-media']
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49.99,
    duration: 30,
    features: ['featured', 'enhanced-media', 'rich-description', 'statistics']
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99.99,
    duration: 30,
    features: ['featured', 'enhanced-media', 'rich-description', 'statistics', 'notifications', 'support']
  }
];

const features = {
  featured: {
    name: 'Annonces en vedette',
    description: 'Affichage prioritaire et badge Premium',
    icon: Shield
  },
  'enhanced-media': {
    name: 'Médias enrichis',
    description: 'Plus d\'images, vidéos et vues 360°',
    icon: Video
  },
  'rich-description': {
    name: 'Description enrichie',
    description: 'Mise en forme avancée et champs supplémentaires',
    icon: FileText
  },
  statistics: {
    name: 'Statistiques détaillées',
    description: 'Suivi des visites et interactions',
    icon: ChartBar
  },
  notifications: {
    name: 'Notifications temps réel',
    description: 'Alertes instantanées sur les interactions',
    icon: Bell
  },
  support: {
    name: 'Support prioritaire',
    description: 'Assistance dédiée 24/7',
    icon: HeadphonesIcon
  }
};

export default function Premium() {
  const [selectedPlan, setSelectedPlan] = React.useState<string>('pro');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Offres Premium
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Boostez la visibilité de vos annonces et bénéficiez de fonctionnalités exclusives
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        {premiumPlans.map((plan) => (
          <div 
            key={plan.id}
            className={`bg-white rounded-lg shadow-lg overflow-hidden ${
              selectedPlan === plan.id ? 'ring-2 ring-primary-500' : ''
            }`}
          >
            <div className="p-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
              <div className="flex items-baseline mb-4">
                <span className="text-4xl font-bold text-primary-600">{plan.price}€</span>
                <span className="text-gray-500 ml-2">/ mois</span>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature) => {
                  const FeatureIcon = features[feature].icon;
                  return (
                    <li key={feature} className="flex items-start">
                      <Check className="h-5 w-5 text-primary-600 mr-2 mt-0.5" />
                      <div>
                        <span className="font-medium">{features[feature].name}</span>
                        <p className="text-sm text-gray-500">{features[feature].description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full py-3 px-4 rounded-md font-semibold ${
                  selectedPlan === plan.id
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                Sélectionner
              </button>
              
              {selectedPlan === plan.id && (
                <button
                  onClick={() => window.location.hash = '#premium-dashboard'}
                  className="w-full mt-2 py-2 px-4 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                >
                  Accéder au tableau de bord Premium
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedPlan && (
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Choisir un moyen de paiement</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-4">Carte bancaire</h3>
              <div id="card-element" className="p-4 border rounded-md">
                {/* Stripe Card Element will be inserted here */}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Autres moyens de paiement</h3>
              <div className="space-y-3">
                <button className="w-full flex items-center justify-between p-4 border rounded-md hover:bg-gray-50">
                  <span>Mobile Money</span>
                  <Info className="h-5 w-5 text-gray-400" />
                </button>
                <button className="w-full flex items-center justify-between p-4 border rounded-md hover:bg-gray-50">
                  <span>Virement bancaire</span>
                  <Info className="h-5 w-5 text-gray-400" />
                </button>
                <button className="w-full flex items-center justify-between p-4 border rounded-md hover:bg-gray-50">
                  <span>PayPal</span>
                  <Info className="h-5 w-5 text-gray-400" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button className="bg-primary-600 text-white px-6 py-3 rounded-md hover:bg-primary-700">
              Procéder au paiement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}