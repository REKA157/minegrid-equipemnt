#!/usr/bin/env node
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

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SITE = process.argv[2] || 'https://minegrid-equipement.com';

/**
 * Chaînes TÉMOINS : des littéraux présents dans le code source et qui
 * survivent à la minification (noms de tables, de fonctions RPC, messages).
 *
 * Ne JAMAIS y mettre un nom de variable ou de fonction interne : le minifieur
 * les renomme, la vérification serait toujours fausse. Ajouter une ligne ici
 * fait partie de la livraison d'un correctif important.
 */
const TEMOINS = [
  { chaine: 'catalogue_facettes', depuis: 'e184562a — recherche du catalogue côté base' },
  { chaine: 'machines_catalogue', depuis: 'e184562a — vue de recherche' },
];

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

const manquants = [];
for (const t of TEMOINS) {
  const l = local.contenu.includes(t.chaine);
  const e = enLigne.contenu.includes(t.chaine);
  const etat = !l ? 'absent du build LOCAL (témoin obsolète ?)' : e ? 'présent' : 'MANQUANT EN LIGNE';
  console.log(`  ${e && l ? '✅' : '❌'} ${t.chaine.padEnd(24)} ${etat}`);
  if (l && !e) manquants.push(t);
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
