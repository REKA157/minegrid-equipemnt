# Déployer le monitor-service (appels d'offres réels)

Ce service Python récupère les **vrais appels d'offres** (portails publics, World Bank…),
en extrait les **engins** et les **lauréats**, et les sert au front MineGrid (Global Monitor).

Tant qu'il n'est pas déployé, le front affiche des données de **démonstration**.

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
| `SUPABASE_URL` | l'URL de ton projet Supabase (`https://xxxx.supabase.co`) |
| `SUPABASE_JWT_SECRET` | Supabase → Project Settings → API → **JWT Secret** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key |
| `ADMIN_TOKEN` | une **longue chaîne aléatoire** (≥ 32 caractères) que tu inventes |
| `ALLOWED_ORIGINS` | le domaine de ton site front, ex. `https://www.minegrid.ma` |

> `DATABASE_URL` est **géré automatiquement** par Docker (base Postgres incluse) — n'y touche pas.
> `LLM_PROVIDER=none` et `GEOCODER_MODE=none` sont OK pour démarrer.

## Étape 3 — Lancer

```bash
docker-compose up -d --build
```

Ça démarre **Postgres + l'API** sur le port `8000`. Les tables sont créées
automatiquement au démarrage (rien à migrer à la main).

Vérifie :

```bash
curl http://localhost:8000/health      # doit répondre OK
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

## Sécurité & bonnes pratiques

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
| Front affiche encore la démo | `VITE_MONITOR_API_URL` non pointé / front pas rebuild |
| Erreur **CORS** dans la console | `ALLOWED_ORIGINS` ne contient pas le domaine du front |
| `/projects` renvoie 401 | `SUPABASE_JWT_SECRET` ne correspond pas au projet Supabase du front |
| `/admin/ingest/run` renvoie 401 | mauvais `X-Admin-Token` |
| Aucun projet après ingestion | regarder les logs : `docker-compose logs -f monitor-api` |
