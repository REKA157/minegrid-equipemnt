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
  const html = await (await fetch(SITE, { redirect: 'follow' })).text();
  const m = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
  if (!m) return null;
  const contenu = await (await fetch(`${SITE}/assets/${m[1]}`)).text();
  return { nom: m[1], contenu };
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

if (manquants.length === 0) {
  console.log('\n✅ Le site en ligne porte bien les correctifs du dépôt.\n');
  process.exit(0);
}

console.error(`\n❌ LE SITE EN LIGNE EST EN RETARD SUR LE DÉPÔT — ${manquants.length} correctif(s) absent(s) :\n`);
for (const t of manquants) console.error(`   • ${t.chaine}   (${t.depuis})`);
console.error(
  '\n   Les utilisateurs n’ont donc PAS ces corrections. Téléversez le contenu de dist/\n' +
    '   chez l’hébergeur, puis relancez cette commande.\n',
);
process.exit(1);

}
