/**
 * Préférences compte (forfait, config dashboard) dans localStorage,
 * **isolées par utilisateur Supabase** pour éviter le mélange Premium /
 * Entreprise quand plusieurs sessions / onglets utilisent le même navigateur.
 *
 * Préfixe : `mg:<user_id>:<clé>`
 */

export const SCOPED_PREFIX = 'mg:' as const;

/** Clés « forfait » / abonnement — ne jamais partager globalement entre comptes */
export const SUBSCRIPTION_KEYS = [
  'userSubscription',
  'selectedSubscription',
  'userServices',
  'enterpriseService',
  'subscriptionCancelled',
  'tempSubscription',
  'tempHasActiveSubscription',
  'subscriptionActivated',
  'promoCodeUsed',
] as const;

/** Config dashboard entreprise / rôle — par compte */
export const ENTERPRISE_CONFIG_BASE_KEYS = [
  'enterpriseDashboardConfigured',
  'enterpriseDashboardConfig',
  'enterpriseDashboardSaves',
  'lastActiveMetier',
  'dashboardConfig',
  'dashboardConfigured',
  'userRole',
  'userData',
] as const;

export function scopedStorageKey(userId: string, key: string): string {
  return `${SCOPED_PREFIX}${userId}:${key}`;
}

/** Préfixe de toutes les entrées d’un utilisateur (purge / enumeration). */
export function userScopedPrefix(userId: string): string {
  return `${SCOPED_PREFIX}${userId}:`;
}

export function getAccountItem(userId: string | undefined | null, key: string): string | null {
  if (userId) {
    return localStorage.getItem(scopedStorageKey(userId, key));
  }
  return localStorage.getItem(key);
}

export function setAccountItem(userId: string | undefined | null, key: string, value: string): void {
  if (userId) {
    localStorage.setItem(scopedStorageKey(userId, key), value);
  } else {
    localStorage.setItem(key, value);
  }
}

export function removeAccountItem(userId: string | undefined | null, key: string): void {
  if (userId) {
    localStorage.removeItem(scopedStorageKey(userId, key));
  }
  localStorage.removeItem(key);
}

/**
 * Migrer les anciennes clés globales vers le compte courant puis les supprimer.
 * Appeler au login (une fois par session) pour ne pas polluer le compte suivant.
 */
export function migrateLegacyKeysForUser(userId: string): void {
  const fixed = [...SUBSCRIPTION_KEYS, ...ENTERPRISE_CONFIG_BASE_KEYS];

  for (const key of fixed) {
    const scoped = localStorage.getItem(scopedStorageKey(userId, key));
    if (scoped !== null) continue;
    const legacy = localStorage.getItem(key);
    if (legacy === null) continue;
    try {
      localStorage.setItem(scopedStorageKey(userId, key), legacy);
      localStorage.removeItem(key);
    } catch {
      /* quota */
    }
  }

  /* enterpriseDashboardConfig_<metier> et autres variantes */
  const legacyMetierKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('enterpriseDashboardConfig')) legacyMetierKeys.push(k);
  }
  for (const k of legacyMetierKeys) {
    const nk = scopedStorageKey(userId, k);
    if (localStorage.getItem(nk) !== null) {
      localStorage.removeItem(k);
      continue;
    }
    const leg = localStorage.getItem(k);
    if (leg === null) continue;
    try {
      localStorage.setItem(nk, leg);
      localStorage.removeItem(k);
    } catch {
      /* quota */
    }
  }
}

/** Supprime toutes les entrées mg:<userId>:… */
export function clearAllScopedKeysForUser(userId: string): void {
  const prefix = userScopedPrefix(userId);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

/** Pour l’écouteur `storage` / intervalle : une clé nous concerne-t-elle ? */
export function isWatchedAccountKey(
  userId: string | undefined | null,
  storageKey: string | null | undefined,
  watchedBaseKeys: readonly string[],
): boolean {
  if (!storageKey) return false;
  if (!userId) {
    return watchedBaseKeys.some((w) => storageKey === w);
  }
  const prefix = userScopedPrefix(userId);
  if (!storageKey.startsWith(prefix)) return false;
  const suffix = storageKey.slice(prefix.length);
  return watchedBaseKeys.some((w) => suffix === w || suffix.startsWith(`${w}_`));
}
