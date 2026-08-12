/**
 * Stockage local cloisonne par utilisateur (MG-M04).
 *
 * CONSTAT
 *   Des donnees d'espace de travail — PII, documents, roles, devis, config de
 *   tableau de bord — etaient ecrites sous des cles GLOBALES
 *   (`dashboardConfig`, `savedQuotes`, `userRole`, `enterpriseService`...) et
 *   n'etaient PAS purgees a la deconnexion. Sur un poste partage, le compte B
 *   qui se connecte apres le compte A relit les donnees de A.
 *
 * PRINCIPE
 *   1. Toute cle de donnees utilisateur est prefixee par l'identifiant du
 *      compte : `mg:<uid>:<cle>`. Deux comptes ne peuvent plus se croiser,
 *      meme sans purge.
 *   2. La deconnexion purge tout ce qui appartient a un utilisateur.
 *
 *   La defense 1 rend la fuite structurellement impossible ; la defense 2 evite
 *   d'accumuler des donnees residuelles. Les deux sont conservees a dessein :
 *   un futur code qui oublierait d'appeler la purge reste couvert par le
 *   cloisonnement.
 *
 * Ce module ne stocke JAMAIS de jeton d'authentification : la session Supabase
 * reste geree par le SDK sous ses propres cles.
 */

const NS = 'mg';

/** Cles historiques non prefixees, a purger et a ne plus jamais ecrire. */
export const LEGACY_KEYS = [
  'dailyActionsDialerConfig',
  'dashboardConfig',
  'debugAutoSpecs',
  'enterpriseDashboardConfig',
  'enterpriseDashboardConfig_vendeur',
  'enterpriseDashboardConfigured',
  'enterpriseService',
  'favorite_machine_ids',
  'lastActiveMetier',
  'savedQuotes',
  'selectedSubscription',
  'subscriptionCancelled',
  'tempHasActiveSubscription',
  'tempSubscription',
  'user',
  'userRole',
  'userServices',
  'userSubscription',
] as const;

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Mode prive / stockage bloque : le produit doit continuer de fonctionner.
    return null;
  }
}

function scopedKey(userId: string | null | undefined, key: string): string {
  // Sans utilisateur identifie, on isole sous un espace anonyme plutot que
  // d'ecrire dans l'espace global : une donnee saisie avant connexion ne doit
  // pas se retrouver attribuee au premier compte qui se connecte.
  return `${NS}:${userId ?? 'anon'}:${key}`;
}

export function setScoped(userId: string | null | undefined, key: string, value: unknown): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(scopedKey(userId, key), JSON.stringify(value));
  } catch {
    // Quota depasse : ignorer plutot que casser le parcours.
  }
}

export function getScoped<T>(userId: string | null | undefined, key: string, fallback: T): T {
  const s = safeStorage();
  if (!s) return fallback;
  try {
    const raw = s.getItem(scopedKey(userId, key));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function removeScoped(userId: string | null | undefined, key: string): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.removeItem(scopedKey(userId, key));
  } catch {
    /* ignore */
  }
}

/**
 * Purge toutes les donnees applicatives locales.
 *
 * A appeler a la DECONNEXION. Supprime :
 *   - toutes les cles `mg:*` (tous utilisateurs confondus : sur un poste
 *     partage, laisser celles d'un autre compte serait precisement la fuite
 *     que l'on corrige) ;
 *   - les cles historiques non prefixees.
 *
 * Ne touche pas aux cles du SDK Supabase (`sb-*`) : c'est `signOut()` qui en a
 * la charge, et les supprimer nous-memes desynchroniserait le SDK.
 */
export function purgeLocalUserData(): void {
  const s = safeStorage();
  if (!s) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k) continue;
      if (k.startsWith(`${NS}:`)) toRemove.push(k);
    }
    for (const k of toRemove) s.removeItem(k);
    for (const k of LEGACY_KEYS) s.removeItem(k);
  } catch {
    /* ignore */
  }
}

/**
 * Migration douce : rapatrie une cle historique globale vers l'espace de
 * l'utilisateur courant, puis supprime l'originale. Evite de perdre les
 * preferences d'un utilisateur deja connecte lors du deploiement.
 *
 * Volontairement limite aux cles de PREFERENCE. Les cles portant des donnees
 * potentiellement sensibles (`user`, `savedQuotes`, `userRole`,
 * `enterpriseService`) ne sont PAS migrees : leur provenance est incertaine —
 * elles peuvent appartenir a un autre compte — donc on les supprime.
 */
const MIGRATABLE_KEYS = [
  'dashboardConfig',
  'enterpriseDashboardConfig',
  'enterpriseDashboardConfigured',
  'favorite_machine_ids',
  'lastActiveMetier',
] as const;

export function migrateLegacyKeys(userId: string): void {
  const s = safeStorage();
  if (!s) return;
  try {
    for (const k of MIGRATABLE_KEYS) {
      const raw = s.getItem(k);
      if (raw === null) continue;
      const target = scopedKey(userId, k);
      if (s.getItem(target) === null) s.setItem(target, raw);
      s.removeItem(k);
    }
    // Les cles non migrables sont supprimees sans etre rapatriees.
    for (const k of LEGACY_KEYS) {
      if ((MIGRATABLE_KEYS as readonly string[]).includes(k)) continue;
      s.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
