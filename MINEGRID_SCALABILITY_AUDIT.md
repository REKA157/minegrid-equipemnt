# MINEGRID — AUDIT DE SCALABILITÉ

**Date** : 2026-09-29 · Mesures réelles contre la production, pas d'avis d'architecte.

---

## Verdict : CONDITIONAL GO — mais l'axe de mesure lui-même est faussé

### Le chiffre qui change la lecture de tout le reste

```
total annonces                                16 397
dont vendeur fictif 00000000-…-0001           13 717   (83,7 %)
dont vendeur réel                              2 680
```

**99,25 % du catalogue est du contenu tiers aspiré**, pas des annonces déposées par des clients.
Le « x1 » de référence n'est donc pas un trafic réel de place de marché : c'est un stock
d'amorçage. Toute projection x10/x100 construite sur ce volume mesure la capacité à afficher un
catalogue, pas à encaisser une activité commerciale.

C'est le contre-audit qui a relevé ce biais (`CA-SCA-A`), et il est décisif pour interpréter les
chiffres qui suivent.

---

## Ce qui a été MESURÉ

### La base n'est pas le goulot

```
lignes 0-399        0,231 s
lignes 8000-8399    0,261 s
lignes 15997-16396  0,270 s
```

Plate d'un bout à l'autre des 16 397 lignes. Index présents : `idx_machines_created_at`,
`idx_machines_category`, `idx_machines_seller_id`, `idx_machines_sellerid`, plus des index de
géolocalisation. **Elle tiendrait 100 000 annonces sans changement.**

### Le goulot est ailleurs, et il était dans le navigateur

Avant le correctif de cette semaine : 400 annonces chargées, 3 000 au maximum, filtrage et tri
**en mémoire**. 82 % du catalogue introuvable.

Corrigé **dans le dépôt** (commit `e184562a`, vérifié : « Hitachi » passe de 0 à 124 résultats)
— mais **absent de la production**, qui sert un paquet du 15 août. Le défaut est donc **toujours
actif pour vos visiteurs aujourd'hui**.

### Un plafond que personne n'avait vu

`SCA-03` — PostgREST plafonne **silencieusement** chaque réponse à 1 000 lignes. Plusieurs
fonctions du code demandent davantage et reçoivent 1 000 sans aucune erreur. C'est le genre de
limite qui ne se voit qu'en production, sur un compte qui a beaucoup de données.

---

## Points de rupture par palier

| Palier | Premier point de rupture | Ce que voit l'utilisateur |
|---|---|---|
| **x1 (aujourd'hui)** | Déjà rompu : filtrage navigateur en production | « Aucun résultat » alors que la machine existe |
| **x10** (160 k annonces) | Images : 215 ko par vignette, jamais redimensionnées | Catalogue très lent en 3G/4G, forfait data consommé |
| **x100** (1,6 M) | Plafond PostgREST de 1 000 lignes ; pagination par offset | Comptes et exports silencieusement tronqués |
| **x1000** | Recherche `ilike` sur `description` sans index trigramme | Recherche de plusieurs secondes, puis expiration |

Le contre-audit (`CA-SCA-B`) signale que le remède déjà écrit ne suffit pas à l'échelle : la
recherche textuelle porte aussi sur `description`, que l'index trigramme de `p33` ne couvre pas.

---

## Problèmes mesurés

| ID | Sév. | Preuve | Problème |
|---|---|---|---|
| `SCA-01` | P1 | PROUVE | Le filtre et le tri par prix ne portent que sur 400 annonces sur 16 397 : la migration p33 n'est pas appliqué… |
| `SCA-03` | P1 | PROUVE | PostgREST plafonne silencieusement chaque réponse à 1 000 lignes : plusieurs fonctions croient en obtenir 3 0… |
| `SCA-07` | P1 | PROUVE | Les images du catalogue pèsent 215 ko chacune, ne sont jamais redimensionnées et sont hébergées chez un tiers |
| `CA-SCA-A` | P1 | PROUVE | L'axe x1 de tout l'audit est faux : 99,25 % du catalogue est du contenu tiers aspire, et il n'existe aucune a… |
| `CA-SCA-B` | P1 | PROUVE | Le remede deja ecrit ne repare pas la recherche a l'echelle : description.ilike dans le or(...) annule les tr… |
| `SCA-02` | P2 | PROUVE | Tableau de bord vendeur : la liste des identifiants machines est passée dans l'URL et casse le serveur au-del… |
| `SCA-04` | P2 | PROUVE | Chaque recherche du catalogue demande un comptage exact, qui force un parcours complet de la table |
| `SCA-05` | P2 | PROUVE | Aucun index sur marque, année, état, nom ni recherche textuelle : la recherche parcourt toute la table |
| `SCA-08` | P2 | PROUVE | Le tableau de bord Pro émet au moins 16 requêtes à l'ouverture, dont 7 sont des doublons exacts |
| `SCA-10` | P2 | PROUVE | React Query est installé et configuré, mais court-circuité par 405 appels directs à la base |
| `SCA-11` | P2 | PROUVE | Requêtes N+1 : une requête par machine dans le calcul des métriques de stock et sur la vitrine vendeur |
| `CA-SCA-C` | P2 | PROUVE | Le menu « Marque » reste bloque a 44 marques sur 449 malgre le commit e184562a, et le premier auditeur l'a de… |
| `CA-SCA-D` | P2 | PROUVE | 46 % des annonces n'ont aucun prix exploitable : appliquer p33 ne donnera pas un filtre prix sur 16 397 annon… |
| `CA-SCA-E` | P2 | PROUVE | Le quota IA n'est applique a personne en production : la fonction deployee echoue ouverte sur une RPC absente |

## Détail des plus structurants

#### `SCA-01` — Le filtre et le tri par prix ne portent que sur 400 annonces sur 16 397 : la migration p33 n'est pas appliquée en production

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `src/utils/api/catalogueRecherche.ts:96-113 (sonde vueDisponible) ; src/pages/Machines.tsx:405-437 (repli prix côté navigateur) ; supabase/migrations/20260929100000_p33_recherche_catalogue.sql (écrite…` |
| **Table / API** | vue public.machines_catalogue + fonction public.catalogue_facettes() — GET /rest/v1/machines_catalogue, POST /rest/v1/rpc/catalogue_facettes |

Le module de recherche du catalogue teste au démarrage la présence de la vue `machines_catalogue` (migration p33). Cette vue est ABSENTE de la production : la sonde reçoit un 404 PGRST205. Le code retombe alors sur la table `machines`, et le filtre prix + le tri prix sont exécutés DANS LE NAVIGATEUR, sur les seules lignes déjà téléchargées (400 au premier chargement). Un acheteur qui demande « moins de 100 000 € » n'interroge donc que 2,4 % du catalogue. La fonction d'agrégation `catalogue_facettes()` est absente elle aussi (PGRST202) : la liste des marques du menu retombe sur les marques présentes dans les 400 lignes chargées.

**Preuve**

```
curl -s -w "HTTP=%{http_code}" -H "apikey: <ANON>" "https://tnfbggrftmtxpgbcwqzo.supabase.co/rest/v1/machines_catalogue?select=id&limit=1" -> {"code":"PGRST205","hint":"Perhaps you meant the table 'public.machines'","message":"Could not find the table 'public.machines_catalogue' in the schema cache"} HTTP=404 curl -X POST .../rest/v1/rpc/catalogue_facettes -d '{}' -> {"code":"PGRST202","message":"Could not find the function public.catalogue_facettes..."} Et côté code, src/pages/Machines.tsx:410 : « if (prixCoteBase) return machines; » puis 433 : « if (sortBy === 'price' && !prixCoteBase) { return [...filteredMachines].sort(...) } » — le repli JS ne voit que `machines`, c'est-à-dire les 400 lignes chargées.
```

**Reproduction** — 1. Ouvrir https://minegrid-equipement.com/#machines. 2. Saisir « prix max = 50000 ». 3. Le compteur « annonces trouvées » (qui vient du count exact côté base) ne change pas, mais la liste affichée est filtrée en mémoire : seules les annonces parmi les 400 chargées et sous 50 000 apparaissent. 4. Vérification directe : la requête curl ci-dessus renvoie 404 sur machines_catalogue.

**Impact métier** — Un acheteur avec un budget — le cas le plus courant sur une marketplace d'engins — ne voit qu'un quarantième du stock correspondant. Les vendeurs dont les annonces sont hors des 400 dernières publiées ne reçoivent aucun contact venant d'une recherche par budget. C'est du chiffre d'affaires perdu sans qu'aucune alerte ne se déclenche, puisque techniquement la page fonctionne.

**Impact sécurité** — Aucun. La vue p33 est écrite avec security_invoker = true, donc son application ne contourne pas la RLS (supabase/migrations/20260929100000_p33_recherche_catalogue.sql, clause « with (security_invoker = true) »).

**Cause racine** — La migration p33 a été écrite le 2026-09-29 et commitée, mais aucune application n'a été faite sur la production. Le code a été conçu pour fonctionner dans les deux cas (repli explicite et documenté) — ce qui est une bonne pratique, mais masque le fait que la moitié de la fonctionnalité livrée n'est pas active.

**Correctif proposé** — Appliquer la migration 20260929100000_p33_recherche_catalogue.sql sur la production (elle ne crée qu'une vue, une fonction et trois index ; elle ne modifie aucune donnée et se défait par trois DROP). Puis vérifier que GET /rest/v1/machines_catalogue?select=id&limit=1 répond 200 et que POST /rest/v1/rpc/catalogue_facettes répond une liste de marques.

**Test de non-régression** — Après application : une requête GET /rest/v1/machines_catalogue?select=id&price_num=gte.50000&price_num=lte.100000 avec Prefer: count=exact doit renvoyer un Content-Range dont le total est strictement supérieur au nombre d'annonces entre 50 000 et 100 000 présentes dans les 400 dernières annonces créées.


#### `SCA-03` — PostgREST plafonne silencieusement chaque réponse à 1 000 lignes : plusieurs fonctions croient en obtenir 3 000

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `src/constants/machineQueryFields.ts:47-50 (MACHINES_CATALOG_MEMORY_CAP = 3000 ; MACHINES_CATALOG_MAX_ROWS = MACHINES_CATALOG_MEMORY_CAP) ; src/utils/proApi/machines.ts:100-121 (getAllMachinesWithDeta…` |
| **Table / API** | GET /rest/v1/machines — plafond db-max-rows de PostgREST |

La production applique un plafond serveur de 1 000 lignes par réponse. Une demande de 3 000 lignes renvoie 1 000 lignes avec un en-tête Content-Range: 0-999/* et le statut 206 — aucune erreur. La constante MACHINES_CATALOG_MAX_ROWS vaut 3 000 et est utilisée telle quelle dans getAllMachinesWithDetails ; getSellerMachineIds n'a aucune borne du tout. Ces deux fonctions travaillent donc sur un sous-ensemble tronqué sans le savoir, et tout calcul fait dessus (totaux, statistiques, exports) est faux au-delà de 1 000 lignes.

**Preuve**

```
curl -o /dev/null -D - -H "apikey: <ANON>" -H "Range: 0-2999" ".../rest/v1/machines?select=id&order=created_at.desc" -> Content-Range: 0-999/* curl -o /dev/null -D - -H "Range: 0-1500" (même URL) -> Content-Range: 0-999/* Sans aucun en-tête Range, sur le plus gros vendeur : curl -o /dev/null -D - ".../rest/v1/machines?select=id&sellerid=eq.00000000-0000-0000-0000-000000000001" -> Content-Range: 0-999/* (alors que ce vendeur a 13 717 annonces)
```

**Reproduction** — Exécuter la commande curl ci-dessus avec Range: 0-2999 : le serveur répond 206 avec exactement 1 000 lignes et Content-Range: 0-999/*. Aucun code d'erreur, aucun avertissement côté client.

**Impact métier** — Tout chiffre agrégé calculé dans le navigateur sur ces listes (nombre total d'équipements, valeur du parc, exports Excel) est plafonné à 1 000 sans que rien ne le signale. Un vendeur avec 2 672 annonces voit « 1 000 annonces » dans son espace et croit avoir perdu les deux tiers de son stock ; un export Excel livré à un client contient 1 000 lignes au lieu de 2 672, ce qui est un document faux envoyé à l'extérieur.

**Cause racine** — Le plafond serveur n'est pas connu du code client. Les constantes (3 000) ont été choisies pour protéger la mémoire du navigateur, pas alignées sur la limite réelle de l'API, et aucune vérification ne compare le nombre de lignes reçues au nombre demandé.

**Correctif proposé** *(applicable sans risque sur le dépôt)* — Aligner MACHINES_CATALOG_MAX_ROWS sur 1 000, et surtout paginer explicitement : boucler sur des tranches de 1 000 avec Range tant que la réponse en contient exactement 1 000, ou basculer ces agrégats côté base via une fonction SQL. Ajouter dans le client une vérification « lignes reçues == lignes demandées » qui journalise un avertissement sinon.

**Test de non-régression** — Un appel à getAllMachinesWithDetails() sur une base contenant 2 500 machines doit renvoyer 2 500 éléments (et non 1 000), ou lever une erreur explicite indiquant la troncature.


#### `SCA-07` — Les images du catalogue pèsent 215 ko chacune, ne sont jamais redimensionnées et sont hébergées chez un tiers

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `src/utils/imageOptimization.ts (fonction buildSrcSet, condition « if (!isSupabase && !isExternalWithWidthParam) return '' ») ; src/components/MachineCard.tsx:72-95 (zone d'affichage h-48 = 192 px, sr…` |
| **Table / API** | colonne machines.images — CDN tiers dnge9sb91helb.cloudfront.net |

16 396 annonces sur 16 397 proviennent d'un import (colonne `source` non nulle) et leurs images pointent vers le CDN d'un tiers (dnge9sb91helb.cloudfront.net, images Ritchie Bros / IronPlanet). Le composant de carte appelle buildSrcSet() pour proposer une version adaptée à l'écran, mais cette fonction renvoie une chaîne vide dès que l'URL n'est pas hébergée chez Supabase et ne porte pas de paramètre de largeur : c'est le cas de toutes ces images. Pire, getOptimizedImageUrl() appelle upgradeImageUrl() qui, pour certains hébergeurs, réécrit l'URL vers une version PLUS GRANDE. Le navigateur télécharge donc l'image pleine taille pour l'afficher dans une vignette de 192 pixels de haut.

**Preuve**

```
Poids mesuré sur 15 images réelles tirées des 15 dernières annonces : n=15 médiane=215 Ko min=139 Ko max=378 Ko total=3,43 Mo hôte : Counter({'dnge9sb91helb.cloudfront.net': 15}) Projection : 400 cartes entièrement défilées = 84 Mo. Part du catalogue concernée : curl -H "Prefer: count=exact" -H "Range: 0-0" ".../machines?select=id&source=not.is.null" -> Content-Range: 0-0/16396 (sur 16 397) Code : src/utils/imageOptimization.ts, buildSrcSet : « const isSupabase = rawUrl.includes(SUPABASE_STORAGE_OBJECT_MARKER) || ... ; const isExternalWithWidthParam = /[?&](w|width)=\d+/.test(rawUrl); if (!isSupabase && !isExternalWithWidthParam) return ''; » Les URL cloudfront ne remplissent aucune des deux conditions.
```

**Reproduction** — 1. Récupérer une URL d'image : curl -H "apikey: <ANON>" -H "Range: 0-0" ".../machines?select=images&order=created_at.desc". 2. curl -sL -o /dev/null -w "%{size_download}" sur cette URL -> 215 231 octets. 3. Ouvrir #machines et observer dans l'onglet Réseau que l'URL demandée est identique, sans paramètre de largeur.

**Impact métier** — Un acheteur sur chantier en 4G télécharge environ 2 Mo d'images rien que pour le premier écran de résultats, et 84 Mo s'il fait défiler les 400 annonces chargées. Sur un forfait mobile marocain, c'est un motif d'abandon immédiat. Par ailleurs les images ne sont pas chez vous : si le tiers change ses URL, bloque le lien direct ou coupe le service, le catalogue entier devient une grille de cadres gris — 16 396 annonces sur 16 397 — sans qu'aucune intervention de votre côté puisse le réparer.

**Impact sécurité** — Chaque visiteur du catalogue est signalé au CDN d'un tiers (adresse IP, page d'origine via l'en-tête Referer, empreinte de navigateur) sans consentement ni mention. C'est un transfert de données personnelles vers un tiers non déclaré. La politique de sécurité du site l'autorise (« img-src ... https: »), ce qui est très permissif.

**Cause racine** — Le travail d'optimisation d'images a été fait pour les images hébergées chez Supabase (endpoint de transformation) et pour deux hébergeurs connus (Mascus, LeBonCoin), mais le CDN qui sert en réalité 99,99 % du catalogue n'est couvert par aucune règle. Le repli est « ne rien faire », donc pleine taille.

**Correctif proposé** *(applicable sans risque sur le dépôt)* — Deux options, la seconde étant la vraie : (1) court terme, insérer un proxy de redimensionnement devant les images distantes (par exemple une Edge Function ou un service d'images qui renvoie du WebP à 800 px) et faire pointer getOptimizedImageUrl vers lui pour les hôtes non-Supabase ; (2) fond, rapatrier les vignettes dans le bucket Supabase `machine-image` à l'import, ce qui rend la plateforme indépendante du tiers. Dans les deux cas, ajouter w…

**Test de non-régression** — Un test doit vérifier que getOptimizedImageUrl('https://dnge9sb91helb.cloudfront.net/image/product/large/x.jpg', { width: 800 }) renvoie une URL DIFFÉRENTE de l'entrée et portant une contrainte de largeur ; et qu'un téléchargement de cette URL pèse moins de 60 ko.


#### `CA-SCA-A` — L'axe x1 de tout l'audit est faux : 99,25 % du catalogue est du contenu tiers aspire, et il n'existe aucune annonce organique

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |

**Preuve**

```
Comptages exacts sur la production (curl, en-tete Prefer: count=exact, Range: 0-0, cle anon) : source=eq.mascus -> Content-Range: 0-0/16274 source=neq.mascus -> Content-Range: 0-0/122 source=is.null -> Content-Range: 0-0/1 sellerid=eq.00000000-0000-0000-0000-000000000001 -> Content-Range: 0-0/13717 sellerid=neq.00000000-0000-0000-0000-000000000001 -> Content-Range: 0-0/2680 Echantillon des 1 000 annonces les plus recentes : sellerid unique 00000000-0000-0000-0000-000000000001 (1000/1000), source 'mascus' (1000/1000), premiere image sur dnge9sb91helb.cloudfront.net (1000/1000). Echantillon des 10 annonces les plus recentes hors mascus : source='leboncoin', images sur img.leboncoin.fr, toutes creees le 2026-03-26, intitulees « Camion pizza », « Camion magasin »... Le second compte, 1c92ff55-00ef-4653-98b5-2203057a6f6a, porte lui aussi du source='mascus' (999/999 sur l'echantillon). TOTAL …
```

**Impact métier** — Le premier auditeur mesure la tenue en charge d'un catalogue de 16 397 annonces et projette x10, x100, x1000 a partir de ce chiffre. Ce chiffre n'est pas le volume du metier : c'est le volume d'un aspirateur. Le volume organique est zero. Trois consequences concretes. (1) Les priorites sont fausses : on s'apprete a payer des index et une pagination par curseur pour tenir un corpus que personne n'a vendu, pendant que le vrai x1 — la premiere annonce deposee par un vrai concessionnaire — n'a jama…


#### `CA-SCA-B` — Le remede deja ecrit ne repare pas la recherche a l'echelle : description.ilike dans le or(...) annule les trois index trigrammes de p33

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |

**Preuve**

```
Le code cherche dans QUATRE colonnes — src/utils/api/catalogueRecherche.ts:138-146 : q = q.or([`name.ilike.${motif}`, `brand.ilike.${motif}`, `model.ilike.${motif}`, `description.ilike.${motif}`].join(',')); La migration p33 n'indexe que TROIS d'entre elles — supabase/migrations/20260929100000_p33_recherche_catalogue.sql, bloc do $p33_trgm$ : idx_machines_nom_trgm (name), idx_machines_marque_trgm (brand), idx_machines_modele_trgm (model). Aucun index sur description. MESURE, base jetable PostgreSQL 16.13, 1 639 700 lignes (x100), les trois index trigrammes de p33 crees et ANALYZE passe, terme rare (une reference precise, 0 resultat) : AVEC description dans le or(...) -> Parallel Seq Scan on machines, Rows Removed by Filter: 546567 x3, Execution Time: 1007.099 ms SANS description -> Bitmap Heap Scan + BitmapOr sur les 3 index trigrammes, Execution Time: 0.388 ms Meme chose pour le compta…
```

**Impact métier** — C'est le constat le plus utile de ce contre-audit parce qu'il arrive AVANT le deploiement. L'equipe s'apprete a appliquer p33 en croyant regler la recherche ; elle reglera le prix et les facettes, et la recherche texte restera un parcours complet de table. A x100 (1,6 million d'annonces), un acheteur qui tape une reference precise attendra une seconde par frappe debouncee, et le comptage exact doublera l'addition. Le correctif est d'une ligne et coute zero : soit retirer description du or(...) …


---

## Non vérifié, et pourquoi

- **Poids réel des images en conditions de navigation** : le CDN des photos
  (`dnge9sb91helb.cloudfront.net`) est injoignable depuis cet environnement, et en développement
  les milliers de requêtes de modules saturent le tampon de mesure du navigateur. Le chiffre de
  215 ko par vignette vient de la lecture des URL sources, pas d'un téléchargement mesuré ici.
  **Mesurable en deux minutes** sur le site en ligne, onglet Réseau.
- **Charge concurrente réelle** : aucun test de montée en charge n'a été exécuté contre la
  production — ce serait une écriture et un risque pour un service en exploitation.
