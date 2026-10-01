/**
 * Tests de la lecture de la politique de sécurité (`scripts/csp.mjs`).
 *
 * POURQUOI CES TESTS EXISTENT
 * ---------------------------
 * Constaté le 2026-10-01 : le Global Monitor était cassé en ligne alors que son
 * service répondait. La directive `connect-src` de `public/.htaccess` n'autorisait
 * pas `monitor.minegrid-equipement.com`, et le navigateur refusait chaque appel
 * avant qu'il parte. Le garde-fou du build (`scripts/verifier-bundle.mjs`)
 * s'appuie sur ce module pour que cela ne se reproduise pas en silence.
 *
 * Le piège que ces tests verrouillent en particulier : un joker `*.supabase.co`
 * mal interprété ferait soit crier le garde-fou à tort (et il finirait
 * désactivé), soit laisser passer un domaine qui sera bloqué en ligne.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
// Script d'outillage en JavaScript : TypeScript le résout sans difficulté.
import { origineAutorisee, sourcesConnexion } from '../../../scripts/csp.mjs';

const HTACCESS =
  `Header always set Content-Security-Policy "default-src 'self'; img-src 'self' https:; ` +
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org; ` +
  `frame-src https://*.paddle.com"`;

describe('sourcesConnexion', () => {
  it('lit connect-src au format Apache (.htaccess)', () => {
    expect(sourcesConnexion(HTACCESS)).toEqual([
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://nominatim.openstreetmap.org',
    ]);
  });

  it('lit connect-src au format _headers', () => {
    const texte = "/*\n  Content-Security-Policy: default-src 'self'; connect-src 'self' https://a.exemple.ma\n";
    expect(sourcesConnexion(texte)).toEqual(["'self'", 'https://a.exemple.ma']);
  });

  it('sans connect-src, retombe sur default-src comme le navigateur', () => {
    const texte = `Header always set Content-Security-Policy "default-src 'self' https://b.exemple.ma"`;
    expect(sourcesConnexion(texte)).toEqual(["'self'", 'https://b.exemple.ma']);
  });

  it('sans aucune politique, renvoie null (rien n est interdit)', () => {
    expect(sourcesConnexion('RewriteEngine On\n')).toBeNull();
    expect(origineAutorisee(null, 'https://nimporte.ou')).toBe(true);
  });
});

describe('origineAutorisee', () => {
  const sources = sourcesConnexion(HTACCESS);

  it('LE CAS DU 2026-10-01 : le radar absent de connect-src est bloqué', () => {
    expect(origineAutorisee(sources, 'https://monitor.minegrid-equipement.com')).toBe(false);
  });

  it('un domaine listé tel quel est autorisé, chemin compris', () => {
    expect(origineAutorisee(sources, 'https://nominatim.openstreetmap.org/search?q=x')).toBe(true);
  });

  it('le joker couvre les sous-domaines, pas le domaine nu ni un faux suffixe', () => {
    expect(origineAutorisee(sources, 'https://tnfbggrftmtxpgbcwqzo.supabase.co')).toBe(true);
    expect(origineAutorisee(sources, 'https://supabase.co')).toBe(false);
    expect(origineAutorisee(sources, 'https://piege-supabase.co')).toBe(false);
  });

  it('le protocole compte : http ne passe pas pour https', () => {
    expect(origineAutorisee(sources, 'http://nominatim.openstreetmap.org')).toBe(false);
  });

  it("'self' ne suffit jamais pour un service tiers", () => {
    expect(origineAutorisee(["'self'"], 'https://monitor.minegrid-equipement.com')).toBe(false);
  });

  it('un schéma seul (https:) autorise tout domaine en https', () => {
    expect(origineAutorisee(['https:'], 'https://monitor.minegrid-equipement.com')).toBe(true);
    expect(origineAutorisee(['https:'], 'http://monitor.minegrid-equipement.com')).toBe(false);
  });

  it('une adresse illisible est refusée plutôt qu acceptée', () => {
    expect(origineAutorisee(sources, 'pas une url')).toBe(false);
  });
});

describe('la politique réellement livrée (public/.htaccess)', () => {
  // Le fichier recopié tel quel dans le paquet, puis servi par l'hébergeur.
  const sources = sourcesConnexion(readFileSync('public/.htaccess', 'utf8'));

  it('autorise le radar (Global Monitor)', () => {
    expect(origineAutorisee(sources, 'https://monitor.minegrid-equipement.com/projects')).toBe(true);
  });

  it('autorise la base de production', () => {
    expect(origineAutorisee(sources, 'https://tnfbggrftmtxpgbcwqzo.supabase.co/rest/v1/machines')).toBe(true);
  });
});
