# Déployer le monitor-service (appels d'offres réels)

Ce service Python récupère les **vrais appels d'offres** (portails publics, World Bank…),
en extrait les **engins** et les **lauréats**, et les sert au front MineGrid (Global Monitor).

Tant qu'il n'est pas déployé (ou s'il est injoignable), le Global Monitor l'indique
« hors ligne » : aucune donnée n'est inventée à sa place.

> ⚠️ **Sécurité** : les clés/secrets se mettent UNIQUEMENT dans le fichier `.env` **sur le
> serveur**. Ne les colle jamais dans un chat, un commit, ou le code.

---

## Ce qu'il te faut

- Un petit **serveur (VPS) avec Docker** (ex. Hetzner, DigitalOcean…). 2 Go de RAM suffisent pour démarrer.
- Le code de ce dossier `services/monitor-service/` sur le serveur.
- Tes infos **Supabase** (les mêmes que le site) : URL du projet, JWT secret, service role key.

> Pas besoin de clé OpenAI ni Mapbox pour démarrer : le service fonctionne **sans LLM ni
> géocodage** (extraction déterministe). Tu pourras les activer plus tard pour affiner.

---

## Étape 1 — Récupérer le code sur le serveur

```bash
# sur le serveur, dans un dossier de ton choix
git clone <URL_DU_REPO>
cd <repo>/services/monitor-service
```

## Étape 2 — Créer le fichier `.env`

```bash
cp .env.example .env
nano .env   # (ou l'éditeur de ton choix)
```

Renseigne au **minimum** (le reste peut rester par défaut) :

| Variable | Quoi mettre |
|---|---|
| `SUPABASE_URL` | l'URL de ton projet Supabase (`https://xxxx.supabase.co`) — **indispensable** : le service y lit la clé publique qui vérifie les connexions (voir l'encadré ci-dessous) |
| `SUPABASE_JWT_SECRET` | Supabase → Project Settings → API → **JWT Secret** (ancien système de clés ; à garder tant que d'anciens jetons circulent) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key |
| `ADMIN_TOKEN` | une **longue chaîne aléatoire** (≥ 32 caractères) que tu inventes |
| `ALLOWED_ORIGINS` | le domaine de ton site front, ex. `https://www.minegrid.ma` |

> 🔑 **Vérification des connexions (depuis le 2026-10-01)** : Supabase peut signer les jetons
> de connexion avec une clé **ES256** (publiée à l'adresse
> `SUPABASE_URL/auth/v1/.well-known/jwks.json`) ou avec l'ancien secret **HS256**. **Les deux
> sont acceptés.** Le service lit la clé publique tout seul (rien à copier) ; pour les jetons
> HS256, il utilise `SUPABASE_JWT_SECRET`.
>
> Attention : voir une clé ES256 dans ce fichier ne prouve pas que le site s'en sert déjà
> (Supabase y publie la future clé avant de signer avec elle). L'étape 6, point 8, montre
> comment le vérifier sur un vrai jeton.
>
> Si `SUPABASE_JWT_SECRET` est faux, les connexions HS256 marchent quand même (le service
> demande alors à Supabase, plus lentement) et le journal affiche
> « SUPABASE_JWT_SECRET ne correspond pas au projet Supabase » : corrige-le dans `.env`.

> `DATABASE_URL` est **géré automatiquement** par Docker (base Postgres incluse) — n'y touche pas.
> `LLM_PROVIDER=none` et `GEOCODER_MODE=none` sont OK pour démarrer.

## Étape 3 — Lancer

> ℹ️ **Deux modes** :
> - **Local / test** : `docker-compose.yml` (expose l'API sur `:8000`, et Postgres sur `:5432`).
> - **Production** : `docker-compose.prod.yml` — Postgres **privé** (non exposé) + **HTTPS
>   automatique** (voir Étape 5-bis). **À utiliser dès que le serveur est sur Internet.**

Local / test :

```bash
docker-compose up -d --build
```

Ça démarre **Postgres + l'API** sur le port `8000`.

> ⚠️ **Les tables ne sont PAS créées automatiquement** (ce n'est plus le cas depuis le
> 12/08 : les migrations Alembic font foi). À la toute première installation, crée-les :
>
> ```bash
> docker-compose run --rm monitor-api alembic upgrade head
> ```
>
> Sans cela, le service refuse de démarrer avec le message « Schema non migre ».
> Si la base n'est pas encore prête au démarrage, le service l'attend jusqu'à 60 s
> (réglable avec `MONITOR_DB_WAIT_SECONDS`) avant d'abandonner.

Vérifie :

```bash
curl http://localhost:8000/health      # doit répondre "status":"ok"
```

## Étape 4 — Première ingestion (pour avoir des AO tout de suite)

Le service ingère automatiquement **toutes les 3 h**. Pour ne pas attendre, déclenche-la :

```bash
curl -X POST http://localhost:8000/admin/ingest/run \
  -H "X-Admin-Token: TON_ADMIN_TOKEN"
```

Les connecteurs **sans clé externe** qui marchent immédiatement :
- **Portails publics** (Maroc `marchespublics.gov.ma`, Sénégal `marches.senegalpme.sn`…) — vrais AO.
- **World Bank Data360** et **PPI** (projets d'infrastructure).

(Configurés dans `sources.yaml`. Les connecteurs Mascus/Leboncoin nécessitent `PILOTERR_API_KEY` ;
l'enrichissement LLM nécessite `LLM_PROVIDER=openai` + `LLM_API_KEY`.)

## Étape 5 — Brancher le front

1. Mets le service derrière **HTTPS** (un reverse proxy Caddy/Nginx, ou un domaine type
   `https://monitor.minegrid.ma`).
2. Dans le `.env` du **front** (racine du projet), mets :
   ```
   VITE_MONITOR_API_URL=https://monitor.minegrid.ma
   ```
3. **Rebuild le front** (`npm run build`) et redéploie-le.
4. Vérifie que `ALLOWED_ORIGINS` (étape 2) contient bien le domaine du front, sinon le
   navigateur bloquera les appels (erreur CORS).

C'est fait : le Global Monitor affiche désormais de **vrais appels d'offres**.

---

## Étape 5-bis — Production : HTTPS + Postgres privé (en 1 commande)

En production, **n'utilise pas** `docker-compose up` (il expose Postgres sur Internet).
Utilise le mode prod fourni : **Postgres privé** + **HTTPS automatique** (certificat
Let's Encrypt géré par Caddy, renouvelé tout seul).

1. **DNS** : crée un enregistrement **A** `monitor.ton-domaine.ma` → l'**IP de ton VPS**.
2. Dans `.env`, renseigne :
   ```
   MONITOR_DOMAIN=monitor.ton-domaine.ma
   ACME_EMAIL=toi@ton-domaine.ma
   POSTGRES_PASSWORD=<un mot de passe long et aléatoire>
   ALLOWED_ORIGINS=https://www.minegrid.ma,https://minegrid.ma
   ```
3. Ouvre les ports **80 et 443** du VPS (firewall / security group).
4. Lance :
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
5. Vérifie (depuis n'importe où) :
   ```bash
   curl https://monitor.ton-domaine.ma/health      # doit répondre OK, en HTTPS
   ```

Puis à l'Étape 5 ci-dessus, mets `VITE_MONITOR_API_URL=https://monitor.ton-domaine.ma`
et rebuild le front.

> Le port `8000` n'est plus exposé directement : tout passe par Caddy en HTTPS. Postgres
> n'est joignable que par l'API, sur le réseau Docker interne (jamais depuis Internet).

## Étape 6 — Mettre à jour le service (redéployer)

À faire **à chaque nouvelle version** du code. Exemple concret : le 2026-10-01, le service
en ligne était plus ancien que les protections d'abonnement ajoutées le 12/08, et rien ne
permettait de le voir. Désormais `/health` affiche **quel code tourne** (`build_sha`).

Toutes les commandes se lancent **sur le serveur**, dans le dossier `services/monitor-service`.

**1. Noter la version actuellement en ligne** (pour comparer à la fin) :

```bash
curl https://monitor.ton-domaine.ma/health
# ex. {"status":"ok","version":"1.0.0","service":"monitor-service","build_sha":"inconnue",...}
```

`"build_sha":"inconnue"` (ou champ absent) veut dire : image construite avant cette procédure.

**2. Récupérer le nouveau code :**

```bash
git pull
git rev-parse --short HEAD        # affiche le commit, ex. 4b27cfc — note-le
```

**3. Sauvegarder la base** (au cas où une migration se passerait mal) :

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U monitor monitor_db > sauvegarde-monitor-$(date +%Y%m%d-%H%M).sql
```

**4. Construire la nouvelle image en y inscrivant la version :**

```bash
BUILD_SHA=$(git rev-parse --short HEAD) BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  docker compose -f docker-compose.prod.yml build monitor-api
```

**5. Mettre la base à jour (migrations) :**

```bash
docker compose -f docker-compose.prod.yml run --rm monitor-api alembic upgrade head
```

> 🟠 **Première fois seulement** — si la base a été créée par une ancienne version (avant le
> 12/08, tables créées automatiquement), `alembic upgrade head` échoue avec
> « relation … already exists ». Dans ce cas, et seulement dans ce cas :
>
> ```bash
> docker compose -f docker-compose.prod.yml run --rm monitor-api alembic current   # n'affiche aucune révision
> docker compose -f docker-compose.prod.yml run --rm monitor-api alembic stamp head # marque la base « à jour », sans rien modifier
> docker compose -f docker-compose.prod.yml run --rm monitor-api alembic check      # compare la base au code
> ```
>
> `alembic check` doit répondre « No new upgrade operations detected ». S'il liste des
> différences, **ne démarre pas** : garde la sauvegarde de l'étape 3 et demande à un
> développeur.

**6. Redémarrer avec la nouvelle image :**

```bash
docker compose -f docker-compose.prod.yml up -d
```

**7. Vérifier :**

```bash
curl https://monitor.ton-domaine.ma/health
```

- `"status":"ok"` et `"build_sha"` = le commit noté à l'étape 2 → c'est bon.
- `"build_sha":"inconnue"` → l'étape 4 a été faite sans `BUILD_SHA=…` : refais-la.
- Pas de réponse → regarde les journaux :
  `docker compose -f docker-compose.prod.yml logs --tail 100 monitor-api`
  (« Schema non migre » = étape 5 oubliée ; « Base de données pas encore joignable » qui se
  répète puis « Arrêt du service » = Postgres ne tourne pas).

**8. Contrôle des protections et des connexions**

a) **Sans être connecté**, l'API doit refuser (401) :

```bash
curl -s https://monitor.ton-domaine.ma/projects
# attendu : {"detail":"Token utilisateur requis"}
# l'ancien service répondait « Token utilisateur ou admin requis »
```

b) **Avec un compte abonné** (formule qui inclut le radar), les données doivent arriver.
Ce contrôle est indispensable : le point a) ne voit pas une panne qui refuserait **tous**
les abonnés.

- Sur le site, connecte-toi avec un compte abonné et ouvre le **Global Monitor** : des projets
  doivent s'afficher.
- Pour en être sûr, ouvre les outils du navigateur (touche **F12**) → onglet **Réseau**
  (Network) → recharge la page → clique sur la ligne `projects` : le statut doit être **200**.
  **401** = connexion refusée par le service (voir c) ; **403** = compte sans formule radar.

c) **Quel algorithme signe les jetons ?** (utile si b) donne 401)

1. Toujours dans les outils du navigateur (F12) → onglet **Application** → **Stockage local**
   (Local Storage) **ou** **Stockage de session** (Session Storage, si « Se souvenir de moi »
   n'était pas cochée) → l'adresse du site → la clé qui commence par `sb-` et finit par
   `-auth-token`. Copie la valeur du champ `access_token`.
   > ⚠️ Ce jeton donne accès au compte pendant environ 1 h : ne le colle **jamais** dans un
   > chat, un e-mail ou un ticket. Garde-le dans ton terminal, puis ferme-le.
2. Sur le serveur :
   ```bash
   read -s JETON          # colle le jeton puis Entrée (rien ne s'affiche, c'est normal)
   echo "$JETON" | cut -d. -f1 | tr '_-' '/+' | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | base64 -d; echo
   # ex. {"alg":"ES256","kid":"…","typ":"JWT"}   ou   {"alg":"HS256","typ":"JWT"}
   curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $JETON" \
     https://monitor.ton-domaine.ma/projects
   # attendu : 200 (compte abonné)
   unset JETON
   ```
3. Lecture du résultat :
   - `"alg":"ES256"` et 401 → `SUPABASE_URL` du `.env` n'est pas celle du site.
   - `"alg":"HS256"` et 401 → `SUPABASE_JWT_SECRET` faux **et**, en plus, `SUPABASE_URL` ou
     `SUPABASE_SERVICE_ROLE_KEY` faux (le service ne peut même pas demander à Supabase).
   - 200 mais le journal contient « SUPABASE_JWT_SECRET ne correspond pas » → ça marche, mais
     lentement : corrige `SUPABASE_JWT_SECRET` dans `.env`, puis
     `docker compose -f docker-compose.prod.yml up -d`.

```bash
docker compose -f docker-compose.prod.yml logs --tail 500 monitor-api | grep "SUPABASE_JWT_SECRET"
# attendu : aucune ligne
```

## Sécurité & bonnes pratiques

- **Accès au radar** : `/projects`, `/projects/{id}`, les événements d'alerte et les widgets IA
  sont réservés aux formules qui incluent le radar : code interne `premium` (plan affiché
  « Pro » 50 $) et `enterprise`. Le code interne `pro` (plan affiché « Premium » 20 $, gestion
  du parc) n'y a plus accès depuis le 2026-10-01 : c'était déjà le cas dans le site.
- **`ADMIN_TOKEN`** : garde-le secret. Ne le mets PAS dans le front (`VITE_MONITOR_ADMIN_TOKEN`)
  sauf pour un outil interne contrôlé — les utilisateurs normaux n'en ont pas besoin
  (le front lit `/projects` avec le JWT Supabase de l'utilisateur connecté).
- **HTTPS obligatoire** en production (reverse proxy).
- **Géocodage** : ne jamais utiliser l'instance publique Nominatim en volume (voir `README.md`).
  Pour la carte, préférer `photon` (gratuit) ou une instance self-hosted.
- **Coût LLM** : `LLM_PROVIDER=openai` améliore l'extraction engins/lauréats mais consomme des
  crédits. `AI_WIDGET_MAX_PER_MINUTE` limite déjà la charge.

## Dépannage rapide

| Symptôme | Cause probable |
|---|---|
| Front affiche « Service Radar injoignable » | `VITE_MONITOR_API_URL` non pointé / front pas rebuild / hôte absent de la politique `connect-src` du site |
| Version en ligne inconnue | `curl …/health` → champ `build_sha` (voir Étape 6) |
| Erreur **CORS** dans la console | `ALLOWED_ORIGINS` ne contient pas le domaine du front |
| `/projects` renvoie 401 à un abonné connecté | `SUPABASE_URL` absente ou d'un autre projet que le front, ou `SUPABASE_SERVICE_ROLE_KEY` faux (voir Étape 6, point 8 c) |
| Journal « SUPABASE_JWT_SECRET ne correspond pas » | le secret HS256 du `.env` n'est pas celui du projet : les connexions passent quand même, mais plus lentement ; corrige `SUPABASE_JWT_SECRET` |
| `/projects` renvoie 403 « Abonnement payant requis » | formule sans radar (gratuite ou « Premium » 20 $) : normal |
| Le conteneur redémarre en boucle | `docker compose … logs monitor-api` : « Schema non migre » → Étape 6, point 5 ; base injoignable plus de 60 s → Postgres arrêté |
| `/admin/ingest/run` renvoie 401 | mauvais `X-Admin-Token` |
| Aucun projet après ingestion | regarder les logs : `docker-compose logs -f monitor-api` |
| Une alerte n'apparaît pas | les alertes sont calculées à la fin de chaque ingestion et toutes les 6 h ; il n'y a **pas** d'envoi par e-mail ni de notification : elles s'affichent dans l'onglet alertes du Global Monitor |
