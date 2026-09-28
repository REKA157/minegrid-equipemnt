/**
 * Logique de la vitrine publique d'un professionnel, sortie de
 * VitrinePersonnalisee.tsx (2 109 lignes).
 *
 * CORRECTION D'UN DÉFAUT RÉEL AU PASSAGE — lisez ceci avant de toucher à
 * `lireIdentifiantVendeurDepuisHash`.
 *
 * L'ancienne version s'écrivait :
 *
 *     hash.match(/^#vitrine\/?(\w+)?/)
 *
 * `\w` vaut `[A-Za-z0-9_]` et **n'inclut pas le tiret**. Or les identifiants
 * d'utilisateur Supabase sont des UUID à tirets, et les trois endroits qui
 * fabriquent ce lien passent bien un UUID complet :
 *
 *   - `VitrinePersonnalisee.tsx` — bouton « Voir en public »
 *   - `MachineDetail.tsx`        — bouton « Voir vitrine du professionnel »
 *   - le texte affiché au vendeur : « Partagez votre vitrine : …/#vitrine/<user_id> »
 *
 * Conséquence : `#vitrine/3f2b1c4a-9d7e-4f11-8a20-0b6c5d4e3f21` était tronqué en
 * `3f2b1c4a`. Cet identifiant ne correspondait à aucune ligne, l'erreur PGRST116
 * était avalée en silence, et la page s'affichait **vide**. Autrement dit : tout
 * lien de vitrine qu'un vendeur envoyait à ses clients menait à une page sans
 * aucune de ses machines, sans le moindre message d'erreur.
 *
 * Le test existant passait au travers parce qu'il utilisait `#vitrine/vendeur1`,
 * qui ne contient pas de tiret. C'est exactement le cas qu'un test doit couvrir :
 * la vraie forme de la donnée, pas une forme commode.
 */

/**
 * Identifiant du vendeur porté par le fragment d'URL, ou `null`.
 *
 * Le hash est passé en argument plutôt que lu dans `window` : c'est ce qui rend
 * la fonction testable sans navigateur.
 */
export function lireIdentifiantVendeurDepuisHash(hash: string): string | null {
  if (!hash) return null;
  // Tout sauf un séparateur : accepte donc les tirets des UUID. Le `?` et le `#`
  // sont exclus pour ne pas happer une chaîne de requête collée derrière.
  const trouve = hash.match(/^#vitrine\/?([^/?#]+)?/);
  const brut = trouve && trouve[1] ? trouve[1].trim() : '';
  return brut === '' ? null : brut;
}

/** Valeurs initiales du formulaire de demande de location. */
export const FORMULAIRE_LOCATION_VIDE = {
  nom: '',
  email: '',
  telephone: '',
  chantier: 'Construction',
  dateDebut: '',
  dateFin: '',
  lieu: '',
  transport: false,
  chauffeur: false,
  maintenance: false,
};

/** Vrai si la chaîne est une URL exploitable pour une balise image. */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmedUrl = url.trim();
  if (trimmedUrl === '') return false;

  try {
    new URL(trimmedUrl);
    return true;
  } catch {
    return false;
  }
}

const IMAGES_PAR_CATEGORIE: { [key: string]: string } = {
  excavator: 'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
  loader: 'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80',
  bulldozer: 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
  crane: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
  drill: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
  truck: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80',
  compactor: 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
  grader: 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
  construction: 'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
  excavatrice: 'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
  pelle: 'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
  chargeuse: 'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80',
  bouteur: 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
  grue: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
  foreuse: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
  forage: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
  camion: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80',
  compacteur: 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
  niveleuse: 'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80',
};

/** Image de repli quand une annonce n'a aucune photo. Jamais vide. */
export function getDefaultImageForCategory(category: string): string[] {
  const normalizedCategory = (category || '').toLowerCase().trim();
  return [IMAGES_PAR_CATEGORIE[normalizedCategory] || IMAGES_PAR_CATEGORIE['construction']];
}
