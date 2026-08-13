import { useEffect, useState } from 'react';
import supabase from '../utils/supabaseClient';
import { getAuthLinkError, describeAuthLinkError, clearAuthLinkTraces } from '../utils/authLink';
import { getLoginUrl } from '../config/urls';

/**
 * Écran « définir un nouveau mot de passe », atteint depuis le lien e-mail.
 *
 * On ne lit PLUS les jetons à la main : le SDK Supabase le fait déjà
 * (`detectSessionInUrl`) et le faisait échouer ici, car il attendait un format
 * (`#page?access_token=…`) que le service ne produit jamais. On attend donc
 * simplement que la session issue du lien soit établie.
 */

const LONGUEUR_MINIMALE = 8;
/** Au-delà, c'est que le lien n'a pas ouvert de session : inutile d'attendre plus. */
const DELAI_SESSION_MS = 8000;

type Etat = 'verification' | 'pret' | 'invalide' | 'enregistre';

/**
 * Défini HORS du composant, volontairement.
 * Déclaré à l'intérieur, ce serait un type de composant NEUF à chaque rendu :
 * React démonterait puis remonterait le formulaire, et la saisie en cours
 * disparaîtrait à chaque rafraîchissement du parent. Constaté en test.
 */
function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-6 rounded shadow-md">{children}</div>
    </div>
  );
}

export default function UpdatePassword() {
  const [etat, setEtat] = useState<Etat>('verification');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    // Lien périmé ou déjà utilisé : le service l'a dit dans l'URL, inutile d'attendre.
    const erreurLien = getAuthLinkError();
    if (erreurLien) {
      setErreur(describeAuthLinkError(erreurLien));
      setEtat('invalide');
      clearAuthLinkTraces();
      return;
    }

    let resolu = false;
    const accepter = () => {
      if (resolu) return;
      resolu = true;
      setEtat('pret');
      // L'URL a joué son rôle : on la nettoie pour qu'un rechargement ne
      // ramène pas cet écran indéfiniment.
      clearAuthLinkTraces();
    };

    // La détection du lien par le SDK est asynchrone : la session peut arriver
    // avant OU après ce montage. On couvre les deux cas.
    const { data: abonnement } = supabase.auth.onAuthStateChange(
      (_evenement: string, session: unknown) => {
        if (session) accepter();
      },
    );
    supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (data?.session) accepter();
    });

    const minuteur = setTimeout(() => {
      if (!resolu) {
        setErreur(
          "Ce lien n'a pas ouvert de session. Il a probablement expiré ou a déjà servi : demandez-en un nouveau.",
        );
        setEtat('invalide');
      }
    }, DELAI_SESSION_MS);

    return () => {
      abonnement?.subscription?.unsubscribe();
      clearTimeout(minuteur);
    };
  }, []);

  const enregistrer = async () => {
    setErreur('');
    if (motDePasse.length < LONGUEUR_MINIMALE) {
      setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MINIMALE} caractères.`);
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne sont pas identiques.');
      return;
    }

    setEnregistrement(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: motDePasse });
      if (error) {
        setErreur(`L'enregistrement a échoué : ${error.message}`);
        return;
      }
      setEtat('enregistre');
    } catch {
      setErreur('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.');
    } finally {
      setEnregistrement(false);
    }
  };

  if (etat === 'verification') {
    return (
      <Cadre>
        <div className="flex items-center gap-3 text-gray-600">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-orange-500" />
          <span className="text-sm">Vérification du lien…</span>
        </div>
      </Cadre>
    );
  }

  if (etat === 'invalide') {
    return (
      <Cadre>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Lien inutilisable</h2>
        <p className="text-sm text-gray-700 mb-6">{erreur}</p>
        <a
          href="#mot-de-passe-oublie"
          className="block w-full text-center bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded"
        >
          Demander un nouveau lien
        </a>
        <a href="#connexion" className="block mt-3 text-center text-sm text-gray-600 hover:underline">
          Retour à la connexion
        </a>
      </Cadre>
    );
  }

  if (etat === 'enregistre') {
    return (
      <Cadre>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Mot de passe modifié</h2>
        <p className="text-sm text-gray-700 mb-6">
          Votre nouveau mot de passe est enregistré. Vous pouvez l'utiliser dès maintenant.
        </p>
        <button
          onClick={() => window.location.replace(getLoginUrl())}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded"
        >
          Aller à la connexion
        </button>
      </Cadre>
    );
  }

  return (
    <Cadre>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Définir un nouveau mot de passe</h2>
      <p className="text-sm text-gray-600 mb-6">
        Au moins {LONGUEUR_MINIMALE} caractères. Choisissez-en un que vous n'utilisez pas ailleurs.
      </p>

      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="mdp">
        Nouveau mot de passe
      </label>
      <input
        id="mdp"
        type="password"
        autoComplete="new-password"
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
        className="w-full px-4 py-2 border rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
      />

      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="mdp2">
        Confirmer le mot de passe
      </label>
      <input
        id="mdp2"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') enregistrer();
        }}
        className="w-full px-4 py-2 border rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
      />

      <button
        onClick={enregistrer}
        disabled={enregistrement || !motDePasse || !confirmation}
        className={`w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded ${
          enregistrement || !motDePasse || !confirmation ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {enregistrement ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
      </button>

      {erreur && <p className="mt-4 text-sm text-red-700">{erreur}</p>}
    </Cadre>
  );
}
