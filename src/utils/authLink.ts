/**
 * Liens e-mail d'authentification (réinitialisation de mot de passe, confirmation…).
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Le service d'authentification (GoTrue) **remplace le fragment** de l'URL de
 * retour par ses propres paramètres. Vérifié le 2026-08-12 sur le vrai projet :
 *
 *   redirect_to = https://minegrid-equipement.com/#update-password
 *   -> Location: https://minegrid-equipement.com/#error=access_denied&error_code=otp_expired…
 *      ^ le « #update-password » a purement et simplement disparu.
 *
 *   redirect_to = https://minegrid-equipement.com/?type=recovery
 *   -> Location: https://minegrid-equipement.com/?type=recovery#error=access_denied…
 *      ^ la partie « ? » survit.
 *
 * L'application étant routée par le fragment (#machines, #connexion…), le lien de
 * réinitialisation renvoyait donc l'utilisateur sur la PAGE D'ACCUEIL, jamais sur
 * l'écran « définir un nouveau mot de passe ». D'où le marqueur en `?type=recovery`.
 *
 * POURQUOI UNE CAPTURE AU CHARGEMENT
 * ----------------------------------
 * Deux consommateurs se disputent le fragment et l'effacent :
 *   - le SDK Supabase (`detectSessionInUrl`) le nettoie dès la création du client ;
 *   - le routeur interne le réécrit à la première navigation.
 * On lit donc l'URL UNE FOIS, à l'évaluation du module — importé en tout premier
 * dans `main.tsx`, avant le client Supabase et avant l'application.
 */

export interface AuthLinkError {
  /** Code technique renvoyé par le service (ex. `otp_expired`). */
  code: string;
  /** Message lisible tel que fourni par le service, si présent. */
  description: string;
}

function readParams(source: string): URLSearchParams {
  const clean = source.startsWith('#') || source.startsWith('?') ? source.slice(1) : source;
  return new URLSearchParams(clean);
}

/**
 * Instantané pris à l'évaluation du module. `window` peut manquer (tests Node,
 * rendu serveur) : on retombe alors sur des valeurs vides plutôt que de planter.
 */
const snapshot = (() => {
  if (typeof window === 'undefined') {
    return { recovery: false, error: null as AuthLinkError | null, credential: false };
  }

  const query = readParams(window.location.search);
  const fragment = readParams(window.location.hash);

  // Le marqueur voyage dans la query (elle survit) ; on accepte aussi le
  // fragment, que le SDK renseigne encore sur certains parcours.
  const recovery = query.get('type') === 'recovery' || fragment.get('type') === 'recovery';

  // Lien périmé ou déjà utilisé : le service renvoie l'erreur dans le fragment.
  const code = fragment.get('error_code') ?? fragment.get('error');
  const error: AuthLinkError | null = code
    ? { code, description: fragment.get('error_description') ?? '' }
    : null;

  // PREUVE que la page vient bien d'un lien e-mail et non d'une adresse tapée à
  // la main : le service dépose un jeton (parcours implicite) ou un code
  // d'échange (parcours PKCE). Sans cette preuve, `?type=recovery` seul
  // permettrait à quiconque trouve une session ouverte sur un poste partagé de
  // changer le mot de passe sans le connaître.
  const credential = Boolean(fragment.get('access_token')) || Boolean(query.get('code'));

  return { recovery, error, credential };
})();

/** Vrai si la page a été ouverte depuis un lien de réinitialisation de mot de passe. */
export function isPasswordRecoveryLink(): boolean {
  return snapshot.recovery;
}

/**
 * Vrai si la page a été ouverte depuis N'IMPORTE QUEL lien e-mail
 * d'authentification — y compris un lien périmé, qui n'arrive qu'avec une
 * erreur et mérite une explication plutôt qu'un retour muet à l'accueil.
 */
export function isAuthLinkReturn(): boolean {
  return snapshot.recovery || snapshot.error !== null;
}

/** Vrai si le lien portait bien un jeton (ou un code) émis par le service. */
export function hasAuthLinkCredential(): boolean {
  return snapshot.credential;
}

/** L'erreur portée par le lien e-mail (lien périmé, déjà utilisé…), sinon `null`. */
export function getAuthLinkError(): AuthLinkError | null {
  return snapshot.error;
}

/** Message en français pour l'utilisateur, à partir du code technique. */
export function describeAuthLinkError(error: AuthLinkError): string {
  if (/expired/i.test(error.code) || /expired/i.test(error.description)) {
    return "Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau : les liens ne sont valables qu'une seule fois, pendant une durée limitée.";
  }
  if (/access_denied|unauthorized/i.test(error.code)) {
    return "Ce lien n'est plus valable. Demandez-en un nouveau depuis la page « Mot de passe oublié ».";
  }
  return error.description || "Ce lien n'a pas pu être vérifié. Demandez-en un nouveau.";
}

/**
 * Retire de la barre d'adresse les traces du lien (`?type=recovery` et le
 * fragment technique). Sans cela, un rechargement ramènerait l'écran de mot de
 * passe indéfiniment, et l'URL resterait illisible.
 */
export function clearAuthLinkTraces(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;

  const url = new URL(window.location.href);
  let touched = false;

  if (url.searchParams.has('type')) {
    url.searchParams.delete('type');
    touched = true;
  }
  // Fragment technique (jetons ou erreur) : il n'a rien à faire dans le routeur.
  const fragment = readParams(url.hash);
  if (fragment.get('access_token') || fragment.get('error') || fragment.get('error_code')) {
    url.hash = '';
    touched = true;
  }

  if (touched) {
    window.history.replaceState(null, '', url.toString());
  }
}
