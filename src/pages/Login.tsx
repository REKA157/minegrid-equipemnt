import React, { useState } from 'react';
import { Mail, Lock, ChevronRight } from 'lucide-react';
import { loginUser } from '../utils/api';
import { toast } from '../utils/toast';
import supabase from '../utils/supabaseClient';
const TEMP_ACCESS_CODE = (import.meta.env.VITE_MONITOR_TEMP_ACCESS_CODE || '').trim();

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const handleOAuthLogin = async (provider: 'google' | 'linkedin_oidc') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      toast(`Connexion ${provider === 'google' ? 'Google' : 'LinkedIn'} indisponible : ${error.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { user, session } = await loginUser(email, password);
      if (!session) { throw new Error("La session est manquante après la connexion.");
      }
      // Optionnel : tu peux stocker la session dans le localStorage si tu veux
      localStorage.setItem('user', JSON.stringify(user));
      window.location.hash = '#dashboard';  
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      toast('Erreur de connexion : ' + message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        {/* Fil d'Ariane */}
        <nav className="flex mb-8" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-2">
            <li>
              <a href="#" className="text-gray-500 hover:text-primary-600">Accueil</a>
            </li>
            <ChevronRight className="h-4 w-4 text-gray-400" />
            <li>
              <span className="text-gray-900">Connexion</span>
            </li>
          </ol>
        </nav>

        <div className="bg-white py-8 px-4 shadow-md rounded-lg sm:px-10">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <h2 className="text-center text-3xl font-bold text-gray-900">
              Connexion
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Ou{' '}
              <a href="#inscription" className="font-medium text-primary-600 hover:text-primary-500">
                créez un compte gratuitement
              </a>
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="mt-1 relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
                <Mail className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Mot de passe
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
                <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                  Se souvenir de moi
                </label>
              </div>

              <div className="text-sm">
                <a href="#mot-de-passe-oublie" className="font-medium text-primary-600 hover:text-primary-500">
                  Mot de passe oublié ?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Se connecter
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Ou continuer avec</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleOAuthLogin('google')}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                Google
              </button>
              <button
                type="button"
                onClick={() => void handleOAuthLogin('linkedin_oidc')}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                LinkedIn
              </button>
            </div>
          </div>

          <TempAccessBlock />
        </div>
      </div>
    </div>
  );
}

function TempAccessBlock() {
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
      <div className="mt-6 text-center">
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
    <div className="mt-6 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lock className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">Accès démo temporaire</span>
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
