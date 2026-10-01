// Pas de ligne shebang : ce fichier est lance par `node scripts/...` et il
// est AUSSI importe par src/utils/api/verifierDeploiement.test.ts pour
// tester sa regle. L'outil de compilation des tests ne sait pas analyser
// un shebang, et le fichier entier devenait alors illisible.
/**
 * GARDE-FOU : le site en ligne exécute-t-il bien le code de ce dépôt ?
 *
 * POURQUOI
 * --------
 * Audit du 2026-09-29. Le paquet servi par minegrid-equipement.com était
 * `index-Dww9BKdi.js`, daté du 15 août. Le dépôt produisait `index-Bzddij97.js`.
 * Six semaines de correctifs — sécurité comprise — n'étaient pas en production,
 * et RIEN ne le signalait.
 *
 * Constaté par la mesure :
 *     chaîne « catalogue_facettes »  → en ligne : 0   local : 1
 *     chaîne « machines_catalogue »  → en ligne : 0   local : 1
 *
 * Conséquence : le correctif du catalogue, qui rendait 13 397 annonces
 * retrouvables, existait dans git et nulle part ailleurs. Tout audit du dépôt
 * décrivait une application que personne n'utilisait.
 *
 * CE QUE CE SCRIPT FAIT
 * ---------------------
 * Il télécharge le paquet réellement servi par le site et vérifie qu'il porte
 * les chaînes témoins du dépôt courant. Il ne compare PAS les empreintes : un
 * build reproductible n'est pas garanti ici. Il vérifie la seule chose qui
 * compte : « le correctif est-il là, oui ou non ? »
 *
 * USAGE
 *     node scripts/verifier-deploiement.mjs                  (site de production)
 *     node scripts/verifier-deploiement.mjs https://autre…   (autre domaine)
 * Code de sortie 1 si le site est en retard sur le dépôt.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { origineAutorisee, sourcesConnexion } from './csp.mjs';

const SITE = process.argv[2] || 'https://minegrid-equipement.com';

/**
 * Chaînes TÉMOINS : des littéraux présents dans le code source et qui
 * survivent à la minification (noms de tables, de fonctions RPC, messages).
 *
 * Ne JAMAIS y mettre un nom de variable ou de fonction interne : le minifieur
 * les renomme, la vérification serait toujours fausse. Ajouter une ligne ici
 * fait partie de la livraison d'un correctif important.
 */
export const TEMOINS = [
  { chaine: 'catalogue_facettes', depuis: 'e184562a — recherche du catalogue côté base' },
  { chaine: 'machines_catalogue', depuis: 'e184562a — vue de recherche' },
];

/**
 * Compare deux paquets et dit lesquels des témoins manquent EN LIGNE.
 *
 * Fonction pure, séparée du téléchargement : c'est elle qui porte la règle, et
 * c'est elle qui se teste. Un témoin absent du build LOCAL n'est pas un retard
 * de déploiement — c'est un témoin devenu obsolète, et le confondre avec un
 * retard ferait échouer le garde-fou à tort après un refactor.
 */
export function comparerPaquets(contenuLocal, contenuEnLigne, temoins = TEMOINS) {
  const lignes = [];
  for (const t of temoins) {
    const local = contenuLocal.includes(t.chaine);
    const enLigne = contenuEnLigne.includes(t.chaine);
    lignes.push({
      ...t,
      local,
      enLigne,
      etat: !local ? 'temoin-obsolete' : enLigne ? 'a-jour' : 'manquant-en-ligne',
    });
  }
  const manquants = lignes.filter((l) => l.etat === 'manquant-en-ligne');
  const obsoletes = lignes.filter((l) => l.etat === 'temoin-obsolete');
  return { lignes, manquants, obsoletes, aJour: manquants.length === 0 };
}

/**
 * Services que le navigateur doit pouvoir joindre depuis le site en ligne.
 *
 * Le paquet JavaScript n'est que la moitié du déploiement : la politique de
 * sécurité voyage dans `.htaccess`, un fichier CACHÉ que beaucoup de logiciels
 * FTP n'envoient pas par défaut. Téléverser `dist/` sans lui laisserait le
 * Global Monitor bloqué — constaté le 2026-10-01 — alors que les témoins
 * ci-dessus diraient « à jour ».
 */
export const SERVICES_APPELES = [
  { url: 'https://monitor.minegrid-equipement.com/health', role: 'le radar (Global Monitor)' },
];

/**
 * Compare la politique du paquet local et celle que le site envoie réellement.
 *
 * `politiqueEnLigne` est la valeur brute de l'en-tête Content-Security-Policy,
 * ou `null` si le site n'en envoie aucune (dans ce cas rien n'est bloqué).
 * Un service bloqué AUSSI en local n'est pas un retard de déploiement : c'est
 * au garde-fou du build (`verifier-bundle.mjs`) de le refuser.
 */
export function comparerPolitiques(politiqueLocale, politiqueEnLigne, services = SERVICES_APPELES) {
  const local = sourcesConnexion(politiqueLocale);
  const enLigne =
    politiqueEnLigne === null ? null : sourcesConnexion(`Content-Security-Policy: ${politiqueEnLigne}`);
  const lignes = services.map((s) => {
    const okLocal = origineAutorisee(local, s.url);
    const okEnLigne = origineAutorisee(enLigne, s.url);
    return {
      ...s,
      etat: !okLocal ? 'bloque-en-local' : okEnLigne ? 'a-jour' : 'bloque-en-ligne',
    };
  });
  return { lignes, bloques: lignes.filter((l) => l.etat === 'bloque-en-ligne') };
}

function paquetLocal() {
  const index = join('dist', 'index.html');
  if (!existsSync(index)) return null;
  const html = readFileSync(index, 'utf8');
  const m = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
  if (!m) return null;
  const chemin = join('dist', 'assets', m[1]);
  return existsSync(chemin) ? { nom: m[1], contenu: readFileSync(chemin, 'utf8') } : null;
}

async function paquetEnLigne() {
  const page = await fetch(SITE, { redirect: 'follow' });
  const politique = page.headers.get('content-security-policy');
  const html = await page.text();
  const m = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
  if (!m) return null;
  const contenu = await (await fetch(`${SITE}/assets/${m[1]}`)).text();
  return { nom: m[1], contenu, politique };
}

// Le corps ci-dessous ne s'exécute QUE si le fichier est lancé directement.
// Sans cette garde, importer le module depuis un test déclencherait un appel
// réseau vers le site de production — un test ne doit dépendre de rien d'externe.
const lanceDirectement =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (!lanceDirectement) {
  // Importé pour ses fonctions : on s'arrête ici.
} else {

const local = paquetLocal();
if (!local) {
  console.error('\n❌ Aucun paquet local. Lancez `npm run build` d’abord.\n');
  process.exit(2);
}

let enLigne;
try {
  enLigne = await paquetEnLigne();
} catch (e) {
  console.error(`\n⚠️  Site injoignable (${SITE}) : ${e.message}`);
  console.error('   Vérification impossible — ce n’est PAS une validation.\n');
  process.exit(2);
}
if (!enLigne) {
  console.error(`\n⚠️  Aucun paquet trouvé sur ${SITE}.\n`);
  process.exit(2);
}

console.log(`\n  paquet local    : ${local.nom}`);
console.log(`  paquet en ligne : ${enLigne.nom}\n`);

const { lignes, manquants, obsoletes } = comparerPaquets(local.contenu, enLigne.contenu);
const LIBELLE = {
  'a-jour': 'présent',
  'manquant-en-ligne': 'MANQUANT EN LIGNE',
  'temoin-obsolete': 'absent du build LOCAL (témoin obsolète ?)',
};
for (const l of lignes) {
  console.log(`  ${l.etat === 'a-jour' ? '✅' : '❌'} ${l.chaine.padEnd(24)} ${LIBELLE[l.etat]}`);
}
if (obsoletes.length) {
  console.log(
    `
  ⚠️  ${obsoletes.length} témoin(s) absent(s) du build local : mettez la liste TEMOINS à jour.`,
  );
}

const htaccessLocal = join('dist', '.htaccess');
const { lignes: services, bloques } = comparerPolitiques(
  existsSync(htaccessLocal) ? readFileSync(htaccessLocal, 'utf8') : '',
  enLigne.politique,
);
console.log('\n  Politique de sécurité (services joignables depuis le site en ligne) :');
for (const s of services) {
  const libelle = { 'a-jour': 'autorisé', 'bloque-en-ligne': 'BLOQUÉ EN LIGNE', 'bloque-en-local': 'bloqué aussi en local' }[s.etat];
  console.log(`  ${s.etat === 'a-jour' ? '✅' : '❌'} ${new URL(s.url).host.padEnd(36)} ${libelle}`);
}

if (manquants.length === 0 && bloques.length === 0) {
  console.log('\n✅ Le site en ligne porte bien les correctifs du dépôt.\n');
  process.exit(0);
}

if (manquants.length > 0) {
  console.error(`\n❌ LE SITE EN LIGNE EST EN RETARD SUR LE DÉPÔT — ${manquants.length} correctif(s) absent(s) :\n`);
  for (const t of manquants) console.error(`   • ${t.chaine}   (${t.depuis})`);
}
if (bloques.length > 0) {
  console.error(`\n❌ LA POLITIQUE DE SÉCURITÉ EN LIGNE BLOQUE ${bloques.length} SERVICE(S) :\n`);
  for (const s of bloques) console.error(`   • ${s.role} — ${new URL(s.url).host}`);
  console.error(
    '\n   Le fichier .htaccess du site n’est pas celui du dépôt. C’est un fichier CACHÉ :\n' +
      '   vérifiez que votre logiciel de téléversement affiche et envoie les fichiers\n' +
      '   qui commencent par un point.',
  );
}
console.error(
  '\n   Les utilisateurs n’ont donc PAS ces corrections. Téléversez le contenu de dist/\n' +
    '   chez l’hébergeur, .htaccess compris, puis relancez cette commande.\n',
);
process.exit(1);

}
