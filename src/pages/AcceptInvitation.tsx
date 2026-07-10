import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2, LogIn, UserPlus, ArrowRight, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useRouteParams, navigate } from '../router/hashRouter';
import { acceptInvitation } from '../utils/userManagement';

// On mémorise le jeton : si la personne doit d'abord se connecter, elle le
// retrouve en revenant sur cette page après authentification.
const PENDING_TOKEN_KEY = 'pendingInvitationToken';
const PENDING_EMAIL_KEY = 'pendingInvitationEmail';

type AcceptState = 'checking' | 'need-auth' | 'accepting' | 'success' | 'error';

const AcceptInvitation: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { searchParams } = useRouteParams();

  const [token, setToken] = useState<string>('');
  const [invitedEmail, setInvitedEmail] = useState<string>('');
  const [state, setState] = useState<AcceptState>('checking');
  const [message, setMessage] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');
  const attempted = useRef(false);

  // 1) Récupérer le jeton (URL en priorité, sinon celui mémorisé) + l'email invité.
  useEffect(() => {
    const fromUrl = searchParams.get('token');
    const t = fromUrl || localStorage.getItem(PENDING_TOKEN_KEY) || '';
    setToken(t);
    const emailFromUrl = searchParams.get('email');
    const e = emailFromUrl || localStorage.getItem(PENDING_EMAIL_KEY) || '';
    setInvitedEmail(e);
    try {
      if (t) localStorage.setItem(PENDING_TOKEN_KEY, t);
      // On mémorise l'email pour pré-remplir l'inscription simplifiée d'un invité.
      if (e) localStorage.setItem(PENDING_EMAIL_KEY, e);
    } catch {
      /* stockage indisponible : on continue avec les valeurs en mémoire */
    }
  }, [searchParams]);

  // 2) Dès que l'auth est connue, décider : accepter, ou demander la connexion.
  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setState('error');
      setMessage("Ce lien d'invitation est invalide (jeton manquant).");
      return;
    }
    if (!user) {
      setState('need-auth');
      return;
    }
    if (attempted.current) return;
    attempted.current = true;
    setState('accepting');
    acceptInvitation(token).then((res) => {
      if (res.success) {
        setOrgName(res.organizationName || '');
        setState('success');
        try {
          localStorage.removeItem(PENDING_TOKEN_KEY);
          localStorage.removeItem(PENDING_EMAIL_KEY);
        } catch {
          /* ignore */
        }
      } else {
        setMessage(res.error || "Impossible d'accepter l'invitation.");
        setState('error');
      }
    });
  }, [authLoading, token, user]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-gray-100 p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-orange-100 flex items-center justify-center mb-4">
          <Users className="h-7 w-7 text-orange-600" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Invitation à rejoindre une équipe</h1>

        {(state === 'checking' || state === 'accepting') && (
          <div className="mt-6 flex flex-col items-center text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500 mb-3" />
            <p className="text-sm">
              {state === 'accepting' ? 'Validation de votre invitation…' : 'Vérification du lien…'}
            </p>
          </div>
        )}

        {state === 'need-auth' && (
          <div className="mt-4">
            <p className="text-sm text-gray-600">
              Vous y êtes presque ! Connectez-vous (ou créez un compte) avec{' '}
              <strong>{invitedEmail || "l'adresse email qui a reçu cette invitation"}</strong>, puis
              rouvrez ce lien pour rejoindre l'équipe.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => navigate('connexion')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors"
              >
                <LogIn className="h-4 w-4" /> Se connecter
              </button>
              <button
                onClick={() => navigate('inscription')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <UserPlus className="h-4 w-4" /> Créer un compte
              </button>
            </div>
            <p className="mt-4 text-xs text-gray-400">
              Astuce : votre invitation reste valable — revenez simplement sur ce lien une fois connecté.
            </p>
          </div>
        )}

        {state === 'success' && (
          <div className="mt-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-3">
              <CheckCircle className="h-7 w-7 text-green-600" />
            </div>
            <p className="text-sm text-gray-700">
              Bienvenue{orgName ? <> dans <strong>{orgName}</strong></> : ''} ! Vous faites désormais
              partie de l'équipe et partagez son espace de travail.
            </p>
            <button
              onClick={() => navigate('dashboard')}
              className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors w-full"
            >
              Aller au tableau de bord <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="mt-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-3">
              <AlertCircle className="h-7 w-7 text-red-600" />
            </div>
            <p className="text-sm text-gray-700">{message}</p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => navigate('connexion')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <LogIn className="h-4 w-4" /> Changer de compte
              </button>
              <button
                onClick={() => navigate('')}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Retour à l'accueil
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcceptInvitation;
