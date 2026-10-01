/**
 * Sert le paquet construit (`dist/`) AVEC les en-têtes de `dist/.htaccess`.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * `vite preview` ignore `.htaccess` : il sert le site sans sa politique de
 * sécurité. Un service bloqué par cette politique fonctionne donc en local et
 * casse en ligne — c'est exactement ce qui est arrivé au Global Monitor
 * (constaté le 2026-10-01).
 *
 * Ce serveur relit les lignes `Header always set …` de `dist/.htaccess` et les
 * applique à chaque réponse : ce que vous voyez ici est ce que le navigateur
 * d'un visiteur verra. Port 4173, l'une des origines que le radar accepte.
 *
 *     npm run build && node scripts/servir-paquet.mjs
 */

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const DIST = 'dist';
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('Aucun paquet dans dist/. Lancez d abord « npm run build ».');
  process.exit(1);
}

// `Header always set Nom "valeur"` → { Nom: valeur }
const entetes = {};
for (const ligne of readFileSync(join(DIST, '.htaccess'), 'utf8').split(/\r?\n/)) {
  const m = ligne.match(/^\s*Header\s+(?:always\s+)?set\s+([\w-]+)\s+"(.*)"\s*$/);
  if (m) entetes[m[1]] = m[2];
}

createServer((req, res) => {
  const chemin = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let fichier = normalize(join(DIST, chemin));
  // Refuse de sortir de dist/, et renvoie index.html pour les routes du site.
  if (!fichier.startsWith(normalize(DIST)) || !existsSync(fichier) || statSync(fichier).isDirectory()) {
    fichier = join(DIST, 'index.html');
  }
  res.writeHead(200, { ...entetes, 'Content-Type': TYPES[extname(fichier)] ?? 'application/octet-stream' });
  createReadStream(fichier).pipe(res);
}).listen(PORT, () => {
  console.log(`Paquet servi sur http://localhost:${PORT} avec ${Object.keys(entetes).length} en-têtes de .htaccess`);
});
