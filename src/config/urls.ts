/**
 * URLs de retour des liens e-mail d'authentification.
 *
 * ⚠️ JAMAIS DE FRAGMENT (`#…`) DANS UNE URL DE RETOUR.
 * Le service d'authentification remplace le fragment par ses propres paramètres
 * (jetons, ou erreur si le lien a expiré) : tout ce qu'on y met est perdu.
 * Vérifié le 2026-08-12 sur le projet de production — voir `src/utils/authLink.ts`.
 * Le marqueur voyage donc dans la QUERY, qui, elle, survit au passage.
 */

/** Domaine public du site, utilisé quand on développe en local. */
function productionOrigin(): string {
  const configured = import.meta.env.VITE_PRODUCTION_URL;
  return (typeof configured === 'string' && configured.trim()) || 'https://minegrid-equipement.com';
}

function isLocalhost(): boolean {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * Où atterrit l'utilisateur après avoir cliqué le lien « mot de passe oublié ».
 *
 * En local, on renvoie volontairement vers le site public : l'adresse locale
 * n'est pas dans la liste blanche du service, qui la rejetterait au profit du
 * Site URL — autant être explicite. Pour tester la boucle complète en local,
 * ajouter `http://localhost:5188` aux « Redirect URLs » du projet Supabase et
 * définir `VITE_PRODUCTION_URL=http://localhost:5188`.
 */
export const getResetPasswordUrl = () => {
  const base = isLocalhost() ? productionOrigin() : window.location.origin;
  return `${base}/?type=recovery`;
};

export const getLoginUrl = () => {
  const baseUrl = window.location.origin;
  return `${baseUrl}/#connexion`;
};

export const getHomeUrl = () => {
  const baseUrl = window.location.origin;
  return `${baseUrl}/#`;
};
