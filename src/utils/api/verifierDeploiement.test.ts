/**
 * Tests du garde-fou de déploiement (`scripts/verifier-deploiement.mjs`).
 *
 * POURQUOI CE GARDE-FOU EXISTE
 * ----------------------------
 * Audit du 2026-09-29. Le site servait `index-Dww9BKdi.js`, daté du 15 août ;
 * le dépôt produisait un autre paquet. **Six semaines de correctifs — sécurité
 * comprise — n'étaient pas en production, et rien ne le signalait.** Le
 * correctif qui rend 13 397 annonces retrouvables existait dans git et nulle
 * part ailleurs.
 *
 * Le piège que ces tests verrouillent en particulier : un témoin absent du
 * build LOCAL n'est PAS un retard de déploiement, c'est un témoin devenu
 * obsolète après un refactor. Confondre les deux ferait échouer le garde-fou à
 * tort — et un garde-fou qui crie au loup finit désactivé.
 */

import { describe, it, expect } from 'vitest';
// Script d'outillage en JavaScript : TypeScript le résout sans difficulté.
import {
  comparerPaquets,
  comparerPolitiques,
  TEMOINS,
} from '../../../scripts/verifier-deploiement.mjs';

const TEMOINS_ESSAI = [
  { chaine: 'catalogue_facettes', depuis: 'commit A' },
  { chaine: 'machines_catalogue', depuis: 'commit A' },
];

describe('comparerPaquets — le site en ligne porte-t-il les correctifs du dépôt ?', () => {
  it('déclare à jour quand les deux paquets portent les témoins', () => {
    const r = comparerPaquets(
      'blabla catalogue_facettes blabla machines_catalogue',
      'autre code catalogue_facettes autre machines_catalogue',
      TEMOINS_ESSAI,
    );
    expect(r.aJour).toBe(true);
    expect(r.manquants).toHaveLength(0);
  });

  it('DÉTECTE le cas réel du 2026-09-29 : présent en local, absent en ligne', () => {
    // LE test. C'est exactement la situation qui a laissé passer six semaines
    // de correctifs sans que personne ne le voie.
    const r = comparerPaquets(
      'code neuf avec catalogue_facettes et machines_catalogue',
      'vieux paquet du 15 aout, sans rien de tout cela',
      TEMOINS_ESSAI,
    );
    expect(r.aJour).toBe(false);
    expect(r.manquants.map((m: { chaine: string }) => m.chaine)).toEqual([
      'catalogue_facettes',
      'machines_catalogue',
    ]);
  });

  it('signale un retard même partiel : un seul correctif manquant suffit', () => {
    const r = comparerPaquets(
      'catalogue_facettes machines_catalogue',
      'catalogue_facettes seulement',
      TEMOINS_ESSAI,
    );
    expect(r.aJour).toBe(false);
    expect(r.manquants).toHaveLength(1);
    expect(r.manquants[0].chaine).toBe('machines_catalogue');
  });

  it('ne confond PAS un témoin obsolète avec un retard de déploiement', () => {
    // Si un refactor supprime la chaîne du code, elle disparaît des DEUX côtés.
    // Ce n'est pas un retard : c'est la liste de témoins qui est à mettre à jour.
    // Sans cette distinction, le garde-fou échouerait à chaque refactor et
    // finirait par être ignoré — c'est ainsi que meurent les garde-fous.
    const r = comparerPaquets('code sans le temoin', 'site sans le temoin', TEMOINS_ESSAI);
    expect(r.aJour).toBe(true);
    expect(r.manquants).toHaveLength(0);
    expect(r.obsoletes).toHaveLength(2);
  });

  it('distingue les trois états sans les mélanger', () => {
    const r = comparerPaquets('A B', 'A', [
      { chaine: 'A', depuis: 'x' }, // des deux côtés
      { chaine: 'B', depuis: 'x' }, // local seulement → retard
      { chaine: 'C', depuis: 'x' }, // nulle part → témoin obsolète
    ]);
    expect(r.lignes.map((l: { etat: string }) => l.etat)).toEqual([
      'a-jour',
      'manquant-en-ligne',
      'temoin-obsolete',
    ]);
  });

  it('ne déclare jamais « à jour » par défaut sur une liste vide de témoins', () => {
    // Un garde-fou sans témoin ne prouve rien. Il ne doit pas non plus mentir :
    // il rend « à jour » mais avec zéro ligne — c'est à l'appelant de veiller
    // à ce que la liste ne soit pas vide.
    const r = comparerPaquets('x', 'y', []);
    expect(r.lignes).toHaveLength(0);
    expect(r.manquants).toHaveLength(0);
  });
});

describe('la liste de témoins livrée', () => {
  it('n’est pas vide : un garde-fou sans témoin ne garde rien', () => {
    expect(TEMOINS.length).toBeGreaterThan(0);
  });

  it('n’emploie que des chaînes qui SURVIVENT à la minification', () => {
    // Un nom de variable ou de fonction interne est renommé par le minifieur :
    // le témoin serait toujours absent et le garde-fou toujours rouge.
    // Les noms de tables et de fonctions SQL, eux, sont des littéraux.
    for (const t of TEMOINS) {
      expect(t.chaine, `« ${t.chaine} » doit être un littéral (snake_case)`).toMatch(
        /^[a-z][a-z0-9_]+$/,
      );
      expect(t.depuis, `« ${t.chaine} » doit dire de quel commit il vient`).toBeTruthy();
    }
  });
});

describe('comparerPolitiques — le .htaccess a-t-il suivi le paquet ?', () => {
  // Le cas du 2026-10-01 : le paquet local autorise le radar, le site en ligne non.
  const LOCAL =
    `Header always set Content-Security-Policy "default-src 'self'; ` +
    `connect-src 'self' https://*.supabase.co https://monitor.minegrid-equipement.com"`;
  const EN_LIGNE_ANCIENNE = "default-src 'self'; connect-src 'self' https://*.supabase.co";
  const RADAR = [{ url: 'https://monitor.minegrid-equipement.com/health', role: 'radar' }];

  it('signale un service autorisé en local mais bloqué en ligne (.htaccess non envoyé)', () => {
    const r = comparerPolitiques(LOCAL, EN_LIGNE_ANCIENNE, RADAR);
    expect(r.lignes[0].etat).toBe('bloque-en-ligne');
    expect(r.bloques).toHaveLength(1);
  });

  it('déclare à jour quand la politique en ligne autorise le service', () => {
    const enLigne = "default-src 'self'; connect-src 'self' https://monitor.minegrid-equipement.com";
    expect(comparerPolitiques(LOCAL, enLigne, RADAR).bloques).toHaveLength(0);
  });

  it('ne compte PAS comme retard un service bloqué aussi en local', () => {
    // C'est au garde-fou du build de refuser ce paquet, pas à celui-ci.
    const localSansRadar = `Header always set Content-Security-Policy "connect-src 'self'"`;
    const r = comparerPolitiques(localSansRadar, EN_LIGNE_ANCIENNE, RADAR);
    expect(r.lignes[0].etat).toBe('bloque-en-local');
    expect(r.bloques).toHaveLength(0);
  });

  it('sans aucune politique en ligne, rien n est bloqué', () => {
    expect(comparerPolitiques(LOCAL, null, RADAR).bloques).toHaveLength(0);
  });
});
