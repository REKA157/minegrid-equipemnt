# Actions qui te reviennent (l'assistant ne peut pas les faire)

Ces 4 points nécessitent **tes accès** (hébergement, jetons, DNS, identité de la société).
Rien ici ne demande de compétence technique : c'est du copier-coller et des clics.
Mis à jour : 2026-08-03.

---

## 1. 🚨 Remettre le site en ligne (5 min) — LE BLOQUANT N°1

**Pourquoi** : le site déployé appelle une base de données supprimée → **personne ne peut se connecter**.

1. Hostinger → **Gestionnaire de fichiers** → dossier **`public_html`**
2. Renommer le contenu actuel en `ancien/` (roue de secours) — ou le supprimer
3. Téléverser **`minegrid-site.zip`** *(à la racine du dossier de travail)* → clic droit → **Extraire**
   ⚠️ Les fichiers doivent atterrir **directement** dans `public_html`, pas dans un sous-dossier
4. Sur https://minegrid-equipement.com : **Ctrl + F5**, puis connexion avec ton compte

✅ Vérifié dans ce paquet : bonne base de données, ancienne base absente, radar de prod, fonction IA `tenders-ai`.

---

## 2. Déployer l'IA des appels d'offres (2 min)

**Pourquoi** : un défaut serveur (réponse trop longue sans mode « flux ») faisait échouer la génération —
le site retombait **en silence** sur la simulation, y compris en production. Correctif committé, à déployer.

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_ton_jeton"   # https://supabase.com/dashboard/account/tokens
cd "C:\Users\Public\projets\SITE_MINEGRID_EQUIPEMENT_COVER\SITE_MINEGRID_EQUIPEMENT_cover 1"
npx supabase functions deploy tenders-ai --project-ref tnfbggrftmtxpgbcwqzo
```

Ta clé Anthropic est déjà enregistrée au niveau du projet : la nouvelle fonction en hérite.
Après coup, l'ancienne fonction `renders-ai` peut être supprimée du dashboard.

---

## 3. Pouvoir encaisser : compte Paddle « live » (délai externe)

**Pourquoi** : aujourd'hui seul le bac à sable fonctionne. Aucun vrai paiement n'est possible.

1. Créer le compte **live** sur Paddle (≠ sandbox) — vérification d'identité de la société
   (registre de commerce, IBAN en devise). Compter plusieurs jours de validation.
2. Une fois approuvé, refaire côté **live** ce qui a été fait en sandbox (runbook `.audit/PADDLE_SETUP.md`) :
   catalogue 3 produits (20/50/200 USD), jeton client, destination de notification, clé API.
3. Me transmettre les **3 identifiants de prix `pri_…`** (publics) : je bascule la configuration et je rebuild.

---

## 4. Délivrabilité des e-mails : SPF / DKIM (30 min)

**Pourquoi** : les e-mails partent bien (vérifié), mais sans ces enregistrements DNS, Gmail et Outlook
les classent en spam — or c'est par là que passent **les confirmations d'inscription**.

1. Dans **StackCP/20i** (l'hébergeur mail de `minegrid.ma`) : section **Email → DKIM** → activer et
   copier l'enregistrement proposé. Récupérer aussi la valeur **SPF** recommandée.
2. Chez le **registrar du domaine** (là où `minegrid.ma` est géré), ajouter :
   - **SPF** (type TXT, nom `@`) : la valeur donnée par StackCP, généralement de la forme
     `v=spf1 include:... ~all` — s'il existe déjà un SPF, **fusionner**, ne jamais en créer un second.
   - **DKIM** (type TXT, nom `xxxx._domainkey`) : la valeur donnée par StackCP.
   - (optionnel, recommandé plus tard) **DMARC** (TXT, nom `_dmarc`) : `v=DMARC1; p=none; rua=mailto:contact@minegrid.ma`
3. Attendre la propagation (jusqu'à 24 h), puis tester en s'inscrivant avec une adresse Gmail.

---

## Ordre conseillé

**1 → 2 → 4 → 3** : la remise en ligne débloque tout le reste ; Paddle live peut avancer en parallèle
puisque le délai dépend de Paddle, pas de toi.
