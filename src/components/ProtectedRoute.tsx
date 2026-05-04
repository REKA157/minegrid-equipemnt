import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Loader2, Lock, Globe } from 'lucide-react';

const TEMP_ACCESS_CODE = (import.meta.env.VITE_MONITOR_TEMP_ACCESS_CODE || '').trim();
const TEMP_ACCESS_ENABLED = TEMP_ACCESS_CODE.length > 0;

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [codeInput, setCodeInput] = useState('');
  const [tempGranted, setTempGranted] = useState(() =>
    TEMP_ACCESS_ENABLED && sessionStorage.getItem('monitor_temp_access') === 'granted'
  );
  const [error, setError] = useState(false);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (user || (TEMP_ACCESS_ENABLED && tempGranted)) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!TEMP_ACCESS_ENABLED) {
      setError(true);
      return;
    }
    if (codeInput.trim() === TEMP_ACCESS_CODE) {
      sessionStorage.setItem('monitor_temp_access', 'granted');
      setTempGranted(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-full bg-primary-100 flex items-center justify-center mb-4">
            <Globe className="h-7 w-7 text-primary-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Global Monitor</h2>
          <p className="text-sm text-gray-500 mt-1 text-center">
            {TEMP_ACCESS_ENABLED
              ? "Accès réservé. Entrez le code d'accès temporaire ou connectez-vous."
              : 'Accès réservé. Connectez-vous avec un compte autorisé.'}
          </p>
        </div>

        {TEMP_ACCESS_ENABLED && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="password"
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value);
                    setError(false);
                  }}
                  placeholder="Code d'accès"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2
                  ${error
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-primary-500'}`}
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-xs text-red-600 mt-1.5">Code incorrect. Réessayez.</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Accéder
            </button>
          </form>
        )}

        <div className="mt-4 pt-4 border-t border-gray-100 text-center">
          <a
            href="#connexion"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Ou se connecter avec un compte
          </a>
        </div>
      </div>
    </div>
  );
}
