import { useState } from 'react';
import supabase from '../utils/supabaseClient';
import { getResetPasswordUrl } from '../config/urls';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getResetPasswordUrl(),
      });

      if (error) {
        // Le quota d'envoi est la cause la plus frequente. On le reconnait
        // d'abord sur le CODE renvoye par le serveur (429 / code d'erreur) et
        // seulement en dernier recours sur le texte anglais : une reformulation
        // cote Supabase suffisait a faire retomber l'utilisateur sur un message
        // technique en anglais, qu'il prenait pour une panne du site.
        const statut = (error as { status?: number }).status;
        const code = String((error as { code?: string }).code ?? '');
        const rateLimited =
          statut === 429 ||
          /rate.?limit|too_many/i.test(code) ||
          /rate limit|too many/i.test(error.message);

        setIsError(true);
        setMessage(
          rateLimited
            ? "Trop de demandes en peu de temps. Patientez quelques minutes avant de réessayer."
            : "L'envoi n'a pas pu aboutir. Réessayez dans un instant ; si cela persiste, " +
                'écrivez à contact@minegrid.ma.',
        );
        return;
      }

      // Supabase confirme avoir ACCEPTE la demande — pas que le message est
      // arrive. On ne promet donc pas une reception, et on indique quoi faire
      // si rien n'arrive.
      setSent(true);
      setMessage(
        "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. " +
          "Pensez à vérifier vos courriers indésirables.",
      );
    } catch (e) {
      // Sans ce catch, une coupure reseau laissait le bouton bloque sur
      // « Envoi en cours... » indefiniment.
      setIsError(true);
      setMessage(
        "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-6 rounded shadow-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Mot de passe oublié</h2>
        <p className="text-sm text-gray-600 mb-6">
          Entrez votre adresse email pour recevoir un lien de réinitialisation.
        </p>
        <input
          type="email"
          placeholder="Votre email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 border rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          onClick={handleReset}
          disabled={loading || !email}
          className={`w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded ${loading || !email ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
        </button>

        {message && (
          <p className={`mt-4 text-sm ${isError ? 'text-red-700' : 'text-gray-700'}`}>
            {message}
          </p>
        )}

        {sent && (
          <p className="mt-3 text-xs text-gray-500">
            Rien reçu après quelques minutes ? Réessayez, ou contactez-nous à
            contact@minegrid.ma pour une réinitialisation manuelle.
          </p>
        )}
      </div>
    </div>
  );
}