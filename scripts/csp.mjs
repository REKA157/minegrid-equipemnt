/**
 * Lecture de la politique de sécurité (CSP) que l'hébergeur envoie au navigateur.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Constaté le 2026-10-01 : le Global Monitor ne fonctionnait pas en ligne alors
 * que son service répondait (`/health` → 200, CORS correct). La cause était
 * ailleurs : la directive `connect-src` de `public/.htaccess` n'autorisait pas
 * `monitor.minegrid-equipement.com`. Le navigateur refusait donc chaque appel,
 * avant même qu'il parte, et la console le disait en toutes lettres :
 *
 *     Connecting to 'https://monitor.minegrid-equipement.com/health' violates
 *     the following Content Security Policy directive: "connect-src …"
 *
 * Rien côté serveur ne pouvait le voir : la requête n'arrivait jamais.
 *
 * Ce module ne fait que LIRE un texte. Il est séparé du garde-fou pour pouvoir
 * être testé sans construire le site (cf. src/utils/api/csp.test.ts).
 */

/**
 * Sources autorisées pour les appels réseau (`fetch`, WebSocket…).
 *
 * Renvoie `null` quand le texte ne contient aucune politique : dans ce cas le
 * navigateur n'interdit rien. Sans directive `connect-src`, c'est `default-src`
 * qui s'applique — c'est la règle du navigateur, on la reproduit.
 */
export function sourcesConnexion(texte) {
  // Deux formats : `Header always set Content-Security-Policy "…"` (Apache,
  // .htaccess) et `Content-Security-Policy: …` (fichier _headers).
  const m = texte.match(/Content-Security-Policy:?\s*"?([^"\r\n]*)/i);
  if (!m) return null;

  const directives = new Map();
  for (const morceau of m[1].split(';')) {
    const [nom, ...sources] = morceau.trim().split(/\s+/);
    if (nom) directives.set(nom.toLowerCase(), sources);
  }
  return directives.get('connect-src') ?? directives.get('default-src') ?? null;
}

/** Vrai si le navigateur laissera partir un appel vers `url`. */
export function origineAutorisee(sources, url) {
  if (sources === null) return true;

  let cible;
  try {
    cible = new URL(url);
  } catch {
    return false;
  }

  return sources.some((source) => {
    if (source === '*') return true;
    // `https:` seul autorise tout domaine en https.
    if (/^(https?|wss?):$/.test(source)) return cible.protocol === source;
    // `'self'` ne couvre que le site lui-même ; on ne l'utilise ici que pour
    // des services tiers, donc il ne suffit jamais.
    const m = source.match(/^(https?|wss?):\/\/(\*\.)?([^/:]+)(?::(\d+))?\/?$/);
    if (!m) return false;
    const [, protocole, joker, hote, port] = m;
    if (`${protocole}:` !== cible.protocol) return false;
    if (port && port !== cible.port) return false;
    // `*.supabase.co` couvre `xxx.supabase.co`, mais pas `supabase.co` lui-même.
    return joker ? cible.hostname.endsWith(`.${hote}`) : cible.hostname === hote;
  });
}
