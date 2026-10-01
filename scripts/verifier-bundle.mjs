#!/usr/bin/env node
/**
 * Garde-fou de mise en ligne : refuse un paquet construit contre la mauvaise base.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * Le 2026-08-12, un paquet de production a été construit contre la base de
 * STAGING sans le moindre avertissement. Cause : Vite charge `.env.local`
 * AUSSI pour `vite build`. Un fichier destiné au développement local prend donc
 * silencieusement le pas sur `.env` — et le site en ligne se retrouve branché
 * sur la mauvaise base, avec des comptes et des annonces qui n'existent pas.
 *
 * Rien dans la sortie de `vite build` ne le signale. D'où cette vérification,
 * exécutée automatiquement après chaque build (`postbuild`).
 *
 * Ce script ne lit AUCUN secret : il ne regarde que le contenu déjà public du
 * paquet (les fichiers qui seront servis à tous les visiteurs).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { origineAutorisee, sourcesConnexion } from './csp.mjs';

const DIST = 'dist';

/** Référence du projet Supabase de PRODUCTION. Publique (elle est dans l'URL du site). */
const REF_PRODUCTION = 'tnfbggrftmtxpgbcwqzo';

/** Références qui ne doivent JAMAIS se retrouver dans un paquet de production. */
const REFS_INTERDITES = [
  { ref: 'vrouxqofmlbkxgznftja', nom: 'base de STAGING' },
  { ref: 'gvbtydxkvuwrxawkxiyv', nom: 'ancienne base SUPPRIMÉE (site cassé de juillet)' },
];

/** Valeurs qui trahissent une configuration de test ou une fuite de secret. */
const MOTIFS_INTERDITS = [
  { motif: /changeme-admin-token/, nom: 'jeton administrateur du radar' },
  { motif: /\bsb_secret_|service_role/, nom: 'clé serveur Supabase (service_role)' },
  { motif: /\bsk_live_|\bsk_test_/, nom: 'clé secrète de paiement' },
];

function fichiersServis(racine) {
  const sortie = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersServis(chemin));
    else if (['.js', '.html', '.css'].includes(extname(entree))) sortie.push(chemin);
  }
  return sortie;
}

let fichiers;
try {
  fichiers = fichiersServis(DIST);
} catch {
  console.error(`\n❌ Aucun dossier « ${DIST} » à vérifier. Lancez d'abord le build.\n`);
  process.exit(1);
}

const contenu = fichiers.map((f) => readFileSync(f, 'utf8')).join('\n');
const erreurs = [];

if (!contenu.includes(REF_PRODUCTION)) {
  erreurs.push(
    `La base de PRODUCTION (${REF_PRODUCTION}) est ABSENTE du paquet.\n` +
      `      Cause probable : un fichier .env.local surcharge VITE_SUPABASE_URL.\n` +
      `      Vite charge .env.local même pour « vite build ».`,
  );
}

for (const { ref, nom } of REFS_INTERDITES) {
  if (contenu.includes(ref)) {
    erreurs.push(`Le paquet contient la ${nom} (${ref}). Il ne doit pas partir en ligne.`);
  }
}

for (const { motif, nom } of MOTIFS_INTERDITS) {
  if (motif.test(contenu)) {
    erreurs.push(`Fuite détectée dans le paquet : ${nom}.`);
  }
}

// Fichiers de test ou de débogage servis publiquement. `public/` est recopié
// tel quel dans le paquet : un script oublié là se retrouve en ligne, à une
// adresse devinable. Trouvé le 2026-08-15 : `test-reactivation.js`, orphelin
// depuis un an, exposait les anciennes clés d'abonnement du navigateur.
const suspects = fichiers.filter((f) =>
  /(^|[\\/])(test|debug|tmp|temp|old|copie|backup)[-_.]/i.test(f.split(/[\\/]/).pop()),
);
if (suspects.length > 0) {
  erreurs.push(
    `Fichier(s) de test/débogage dans le paquet public : ${suspects
      .map((f) => f.split(/[\\/]/).pop())
      .join(', ')}.\n      Ils seront servis en ligne à une adresse devinable. À sortir de public/.`,
  );
}

// L'ESPACE INTERNE #nextgen NE DOIT PAS ETRE OUVERT DANS UN PAQUET DE PRODUCTION.
//
// Trouve par la contre-analyse du 2026-09-29, et c'est le defaut le plus
// sournois rencontre sur ce depot : la SOURCE annonce « jamais ouvert au public
// par defaut » (src/nextgen/integration/InternalGate.tsx:4-7), mais
// `.env:16 VITE_ENABLE_NEXTGEN=true` etait charge par Vite dans TOUS les modes,
// y compris la construction de production. La garde se compilait alors en
// `return!0` — toujours vrai — et televerser aurait publie les ecrans acheter,
// vendre, trust, inspection, escrow, finance et logistique, qui n'ont pas de
// base derriere.
//
// Lire la source ne suffisait pas : il fallait lire l'ARTEFACT. Ce controle le
// fait a chaque construction.
const gardeInterne = fichiers.filter((f) => /InternalGate-[^\/]*\.js$/.test(f));
if (gardeInterne.length === 0) {
  erreurs.push(
    "Garde de l'espace interne introuvable dans le paquet.\n" +
      '      Le controle ne peut pas conclure : verifiez que InternalGate est bien construit.',
  );
} else {
  // Apres minification, `return true` s'ecrit `return!0`. On cherche donc une
  // fonction sans argument dont le corps entier est un retour de vrai.
  const TOUJOURS_VRAI = /function\s+\w*\s*\(\s*\)\s*\{\s*return\s*(!\s*0|true)\s*\}/;
  const ouverte = gardeInterne.filter((f) => TOUJOURS_VRAI.test(readFileSync(f, 'utf8')));
  if (ouverte.length > 0) {
    erreurs.push(
      'ESPACE INTERNE #nextgen OUVERT AU PUBLIC dans ce paquet.\n' +
        '      La garde se compile en « toujours vrai ». Televerser publierait les ecrans\n' +
        '      acheter, vendre, trust, inspection, escrow, finance et logistique.\n' +
        '      Cause habituelle : VITE_ENABLE_NEXTGEN=true dans .env, charge par Vite dans\n' +
        '      TOUS les modes. Mettez-le a false avant de construire un paquet de production.',
    );
  }
}

// LES AUTRES PORTES DEROBEES, MEME MOTIF.
//
// L'espace interne n'etait pas la seule garde pilotee par une variable de
// construction. La relecture independante du 2026-09-29 en a trouve deux
// autres, avec exactement le meme mode de defaillance : une valeur posee dans
// un fichier d'environnement, figee a la compilation, que plus personne ne
// regarde ensuite.
//
//   VITE_MONITOR_TEMP_ACCESS_CODE  ouvre TOUTES les routes protegees sans
//                                  compte (src/components/ProtectedRoute.tsx:5-6
//                                  puis ligne 28)
//   VITE_TENDERS_SHARED            branche le partage des appels d'offres sur
//                                  une table absente de la production
//
// Ce controle-ci lit les FICHIERS D'ENVIRONNEMENT et non l'artefact, parce
// qu'une valeur vide ne laisse aucune trace reconnaissable apres minification.
// C'est une limite assumee, et elle est dite : il protege contre l'oubli, pas
// contre quelqu'un qui contournerait volontairement le garde-fou.
const DRAPEAUX_DANGEREUX = [
  {
    nom: 'VITE_MONITOR_TEMP_ACCESS_CODE',
    sur: (v) => v.trim() === '',
    risque:
      'ouvre TOUTES les routes protegees sans compte : un visiteur qui connait le code\n' +
      '      entre partout. A laisser VIDE en production.',
  },
  {
    nom: 'VITE_TENDERS_SHARED',
    sur: (v) => v.trim() !== 'true',
    risque:
      'branche le partage des appels d\'offres sur la table tender_workspaces, absente\n' +
      '      de la production : bandeau rouge permanent chez tous les clients.\n' +
      '      A remettre a true LE JOUR OU la migration teamE est appliquee.',
  },
];

/** Valeur qu'une variable prendra dans un build de production. */
function valeurEnProduction(nom) {
  // `.env.production` l'emporte sur `.env` et `.env.local` en mode production.
  // On lit donc dans cet ordre et on retient la DERNIERE definition trouvee.
  let valeur = null;
  let source = null;
  for (const fichier of ['.env', '.env.local', '.env.production']) {
    if (!existsSync(fichier)) continue;
    for (const ligne of readFileSync(fichier, 'utf8').split(/\r?\n/)) {
      const m = ligne.match(new RegExp(`^\\s*${nom}\\s*=(.*)$`));
      if (m) {
        valeur = m[1];
        source = fichier;
      }
    }
  }
  return { valeur, source };
}

for (const d of DRAPEAUX_DANGEREUX) {
  const { valeur, source } = valeurEnProduction(d.nom);
  if (valeur !== null && !d.sur(valeur)) {
    erreurs.push(
      `${d.nom} est dans un etat dangereux pour la production (${source}).\n` +
        `      Il ${d.risque}`,
    );
  }
}

// LES SERVICES QUE LE SITE APPELLE DOIVENT ETRE AUTORISES PAR LA CSP.
//
// Constate le 2026-10-01 : le Global Monitor etait casse en ligne alors que son
// service repondait. La politique de securite de `public/.htaccess` n'autorisait
// pas son domaine dans `connect-src` : le navigateur refusait chaque appel avant
// qu'il parte. Le service, lui, ne voyait rien — la requete n'arrivait jamais.
//
// Ce controle relie les deux bouts que personne ne relisait ensemble : l'adresse
// compilee dans le paquet, et la politique qui l'accompagne.
const SERVICES_APPELES = [
  { nom: 'VITE_SUPABASE_URL', role: 'la base (connexion, catalogue, comptes)' },
  { nom: 'VITE_MONITOR_API_URL', role: 'le radar (Global Monitor, Opportunites de vente)' },
];
const fichierPolitique = join(DIST, '.htaccess');
if (!existsSync(fichierPolitique)) {
  erreurs.push(
    'Aucun .htaccess dans le paquet : ni redirections, ni politique de securite.\n' +
      '      Il doit venir de public/.htaccess.',
  );
} else {
  const sources = sourcesConnexion(readFileSync(fichierPolitique, 'utf8'));
  for (const { nom, role } of SERVICES_APPELES) {
    const { valeur, source } = valeurEnProduction(nom);
    const url = (valeur ?? '').trim().replace(/^["']|["']$/g, '');
    if (!url) continue;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) {
      erreurs.push(
        `${nom} pointe vers ${url} (${source}).\n` +
          `      Cette adresse n'existe que sur votre poste : en ligne, ${role} serait injoignable.`,
      );
    } else if (!origineAutorisee(sources, url)) {
      erreurs.push(
        `${nom} = ${url} est BLOQUE par la politique de securite du site.\n` +
          `      Le navigateur refusera tout appel vers ${role}.\n` +
          `      Ajoutez ce domaine a « connect-src » dans public/.htaccess.`,
      );
    }
  }
}

// Le lien de réinitialisation ne doit JAMAIS porter de fragment : le service
// d'authentification l'écrase (cf. src/utils/authLink.ts).
if (/\/#update-password/.test(contenu)) {
  erreurs.push(
    "L'URL de retour du lien « mot de passe oublié » contient encore un fragment\n" +
      '      (/#update-password) : il serait effacé et le lien ramènerait à l’accueil.',
  );
}

if (erreurs.length > 0) {
  console.error('\n❌ PAQUET REFUSÉ — ne pas le mettre en ligne :\n');
  erreurs.forEach((e, i) => console.error(`   ${i + 1}. ${e}`));
  console.error('');
  process.exit(1);
}

console.log(
  `\n✅ Paquet vérifié : base de production ${REF_PRODUCTION}, ` +
    `aucune base de test, aucun secret, base et radar autorisés par la politique ` +
    `de sécurité, lien de réinitialisation valide ` +
    `(${fichiers.length} fichiers analysés).\n`,
);
