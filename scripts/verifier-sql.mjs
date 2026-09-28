#!/usr/bin/env node
/**
 * GARDE-FOU : un seul endroit pour le SQL destiné à une base.
 *
 * POURQUOI
 * --------
 * Avant le rangement du 2026-09-28, le SQL de la plateforme suivi par git vivait
 * dans QUATRE emplacements : 53 fichiers dans `supabase/migrations/`, et 109
 * AILLEURS — 44 dans `sql/`, 12 dans un dossier nommé « SQL_A_APPLIQUER » qui
 * était en réalité déjà appliqué depuis des mois, 53 dans `archive/scripts/sql/`.
 *
 * Quatre sources de vérité pour un seul schéma, c'est la garantie qu'aucune ne
 * soit fiable : le 2026-08-18, cinq pannes distinctes ont eu la même origine, un
 * objet présent dans une base et absent dans l'autre sans registre pour le dire.
 *
 * Ce script refuse qu'un fichier .sql réapparaisse ailleurs que dans les
 * emplacements autorisés. Il ne corrige rien : il empêche la rechute.
 * Son compagnon `npm run bases` traite l'autre moitié du problème — ce qui est
 * réellement APPLIQUÉ dans chaque base, que le rangement des fichiers ne dit pas.
 *
 * USAGE : node scripts/verifier-sql.mjs      (code 1 si un intrus est trouvé)
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Emplacements autorisés, et pourquoi chacun l'est.
 *
 *   supabase/migrations      LE schéma de la plateforme. Horodaté, rejouable,
 *                            appliqué dans les deux environnements.
 *   supabase/tests           prérequis et contre-cas des harnais Docker.
 *   .audit / AUDIT_CONTROL   sondes et rapports d'audit. Jamais exécutés par le
 *                            produit ; ce sont des instruments de mesure.
 *   archive                  trace historique, explicitement gelée (voir son README).
 *   services/monitor-service LE RADAR A SA PROPRE BASE. Ses migrations n'ont
 *                            rien à faire dans celles de la plateforme : les y
 *                            déplacer casserait le service. Première version de
 *                            ce garde-fou les signalait à tort.
 */
const AUTORISES = [
  join('supabase', 'migrations'),
  join('supabase', 'tests'),
  '.audit',
  'AUDIT_CONTROL',
  'archive',
  join('services', 'monitor-service'),
];

const IGNORES = new Set(['node_modules', '.git', 'dist', '.remediation', '__pycache__']);

function parcourir(racine, courant = '.', trouves = []) {
  for (const entree of readdirSync(join(racine, courant))) {
    if (IGNORES.has(entree)) continue;
    const relatif = courant === '.' ? entree : join(courant, entree);
    const absolu = join(racine, relatif);
    let st;
    try {
      st = statSync(absolu);
    } catch {
      continue;
    }
    if (st.isDirectory()) parcourir(racine, relatif, trouves);
    else if (entree.toLowerCase().endsWith('.sql')) trouves.push(relatif);
  }
  return trouves;
}

const racine = process.cwd();
const tous = parcourir(racine);
const intrus = tous.filter((f) => !AUTORISES.some((a) => f === a || f.startsWith(a + sep)));

if (intrus.length === 0) {
  console.log(
    `\n✅ SQL rangé : ${tous.length} fichiers, tous dans un emplacement autorisé ` +
      `(${AUTORISES.join(', ')}).\n`,
  );
  process.exit(0);
}

console.error(`\n❌ ${intrus.length} fichier(s) .sql hors des emplacements autorisés :\n`);
for (const f of intrus) console.error(`   • ${f}`);
console.error(
  '\n   Le SQL destiné à une base vit dans supabase/migrations/ — un seul endroit,\n' +
    '   horodaté, avec ses contre-cas dans supabase/tests/.\n' +
    '   Un script historique se range dans archive/sql-historique/.\n',
);
process.exit(1);
