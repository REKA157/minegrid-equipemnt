import React, { useState } from 'react';
import { Building2 } from 'lucide-react';

/**
 * Page cachée / réservée (accessible via `#demo-entreprise`) qui permet
 * d'activer un accès temporaire au service entreprise (configuration des
 * widgets) pour démonstrations. Elle NE DOIT PAS être exposée dans la
 * navigation publique.
 *
 * Protégée par un code temporaire injecté via VITE_MONITOR_TEMP_ACCESS_CODE.
 */
const DEMO_ACCESS_CODE = (import.meta.env.VITE_MONITOR_TEMP_ACCESS_CODE || '').trim();

export default function DemoEntrepriseAccess() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [granted, setGranted] = useState(false);

  const grantAccess = () => {
    localStorage.setItem('userSubscription', 'entreprise');
    localStorage.setItem('enterpriseService', 'true');
    localStorage.setItem('userServices', 'enterprise');
    localStorage.setItem('tempSubscription', 'entreprise');
    localStorage.setItem('tempHasActiveSubscription', 'true');
    localStorage.setItem('widgetsTemporaryAccess', 'granted');
    localStorage.removeItem('enterpriseDashboardConfigured');
    localStorage.removeItem('enterpriseDashboardConfig_vendeur');
    localStorage.removeItem('enterpriseDashboardConfig');
    localStorage.removeItem('subscriptionCancelled');
    window.dispatchEvent(
      new CustomEvent('enterpriseSubscriptionActivated', {
        detail: { planType: 'entreprise', source: 'demo-entreprise-page' },
      }),
    );
    setGranted(true);
    setTimeout(() => {
      window.location.hash = '#dashboard-entreprise';
    }, 600);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim() === DEMO_ACCESS_CODE) {
      setError(false);
      grantAccess();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-full bg-orange-100 flex items-center justify-center mb-4">
            <Building2 className="h-7 w-7 text-orange-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Accès démo — Service entreprise</h1>
          <p className="text-sm text-gray-500 mt-1 text-center">
            Espace réservé aux démonstrations. Entrez le code d'accès pour déverrouiller
            la configuration des widgets entreprise.
          </p>
        </div>

        {!DEMO_ACCESS_CODE ? (
          <div className="bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-md">
            Accès démo désactivé sur cet environnement.
          </div>
        ) : granted ? (
          <div className="bg-green-50 text-green-800 text-sm px-4 py-3 rounded-md">
            Accès activé. Redirection vers la configuration…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(false);
                }}
                placeholder="Code d'accès démo"
                className={`w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 ${
                  error
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-orange-500'
                }`}
                autoFocus
              />
              {error && (
                <p className="text-xs text-red-600 mt-1.5">Code incorrect.</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors"
            >
              Activer l'accès démo
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
