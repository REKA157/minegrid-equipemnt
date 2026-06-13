# AUDIT STRATÉGIQUE COMPLET — MINEGRID ÉQUIPEMENT
### Rapport pré-investissement · Audit 12 juin 2026 · Remédiation au 13 juin 2026 · Confidentiel

> **Avertissement méthodologique.** Cet audit porte sur l'état réel du dépôt à la date du 12/06/2026 (HEAD `021e1e42`). Les chiffres de marché proviennent de sources publiques (Mordor, Grand View, AfDB, GSMA, RB Global, a16z…) de fiabilité variable, signalée. Audit du code réel (12 dimensions, ~135 findings, chaque finding critique/haut contre-vérifié de façon adversariale) + recherche marché/concurrence sourcée.
>
> **Fait structurant : le domaine `minegrid-equipement.com` n'est pas enregistré (NXDOMAIN), le site n'est pas en ligne, aucune page n'est indexée. MineGrid est un projet pré-lancement ; toute la thèse se lit au stade pré-seed.**
>
> 🛠️ **Une remédiation est en cours** (branche `fix/critical-security-hardening`). Voir l'**Annexe A** pour l'état d'avancement par finding.

---

## 1. RÉSUMÉ EXÉCUTIF

MineGrid est une marketplace B2B d'équipements miniers et BTP visant l'Afrique francophone (React/Vite/TypeScript sur Supabase, service Python de scraping/monitoring, automatisations n8n). Le projet est **ambitieux dans son périmètre** (catalogue, devis/leads, dossiers transactionnels, 8 dashboards métier, veille marché, IA) mais **immature dans son exécution** : aujourd'hui une **vitrine fonctionnelle partielle, non déployée, non sécurisée pour encaisser, et largement « façade » sur ses fonctionnalités premium.**

Trois constats dominants :

1. **Marché réel, vaste, mal servi.** TAM africain construction+mines+location ≈ **9-11 Md$/an** (croissance 5-8 %), SAM francophone intermédiable ≈ **1,2-1,6 Md€/an**. Pipeline de projets exceptionnel (Simandou 20 Md$, PND Côte d'Ivoire 206 Md$, Maroc pré-Mondial 2030, Kamoa-Kakula). **Aucune marketplace transactionnelle ne domine la zone francophone.** La fenêtre existe.
2. **Le produit ne tient pas ses promesses et ne peut pas encaisser fiablement.** Activation d'abonnement 100 % côté client (aucun webhook Stripe), codes promo/accès dans le bundle JS, gating `localStorage` falsifiable, import Excel insérant des machines fictives, « Assistant IA » factice, boutons d'action à succès simulés. **Un utilisateur peut s'octroyer un abonnement Enterprise gratuitement en 30 secondes.**
3. **Dette technique/opérationnelle lourde, risque clé-homme maximal.** Pas de séparation d'environnements (dev → prod), CI jamais exécutée, lint cassé, couverture ~1,1 %, schéma BD non maîtrisé (81 scripts SQL), secrets prod en clair sur disque, **un seul développeur sous trois identités**, SEO structurellement nul (1 URL indexable).

**Verdict synthétique :** opportunité de marché solide (8/10), actif technique faible et risqué (3/10), traction nulle (0/10), équipe fragile (2/10). **Score : 34/100. Décision : investir sous conditions strictes, en pré-seed, sur la thèse et l'équipe — pas sur le code actuel.**

---

## 2. ANALYSE SWOT

**Forces (vérifiées)** — positionnement sur marché en croissance sous-digitalisé ; parcours acheteur lead-to-deal **réellement câblé** (`submitQuoteRequest` → `quote_requests` + `transaction_cases` + email Resend, testé) ; Edge Function `create-payment` **sécurisée** (montant serveur, JWT, rate-limit, idempotency) ; service monitor FastAPI substantiel (JWT HS256, admin constant-time, paid-access durci/testé) ; effort d'assainissement récent (`ai-context/`, `governance/`, checklist sécurité, ErrorBoundary, code-splitting).

**Faiblesses (critiques)** — monétisation non opposable ; façades ; aucune traction (site hors ligne) ; SEO nul ; schéma BD chaotique ; bus factor = 1 ; conformité légale/RGPD = canevas.

**Opportunités** — devenir le **« trust layer »** (inspection, escrow, dédouanement, financement) que ni Via Mobilis (SEO sans opérations), ni RB Global (pas de présence), ni l'informel WhatsApp (pas de confiance) n'occupent ; gap de financement 100-120 Md$/an ; mobile money massif (1 400 Md$ SSA) ; hub Tanger Med (10,2 M TEU).

**Menaces** — désintermédiation (30-80 % du revenu) ; captation OEM sur le neuf (Neemba/CAT, 7 000 machines) ; cyclicité capex miniers ; Via Mobilis qui descend localement ; échecs sectoriels (Tradus/OLX fermé, Kobo360/Lori effondrés sur le working capital).

**MODE DESTRUCTION.** Forces majoritairement potentielles + faiblesses majoritairement actuelles ⇒ MineGrid dépense son capital crédibilité sur des promesses que le premier acheteur sérieux démonte en une session. Le risque létal : **brûler la confiance du marché avant d'avoir construit la couche qui la mérite.**

---

## 3. ANALYSE MARCHÉ

**Tailles (fiabilité moyenne).** Construction MEA 8,35 Md$ (2025) → 13,13 Md$ (2031, CAGR 7,83 %) ; construction lourde Afrique 4,3 Md$ (2024) ; mines Afrique 3,12 Md$ (2025, RSA ~40 %, RDC +6,5 %) ; **location MEA 2,78 Md$ (2025, CAGR 6,5 %)** ; occasion mondiale 120 Md$ dont ~5 % MEA.

**Estimation propre (hypothèses explicites, fiabilité basse) :** TAM Afrique ≈ **9-11 Md$** ; SAM francophone ≈ **1,9-2,5 Md€** ; SAM intermédiable (hors OEM direct ~40 %) ≈ **1,2-1,6 Md€/an** ; SOM 5 ans = 1-3 % ≈ **15-50 M€ de GMV → 0,5-2,5 M€ de revenus** (take rate 2-5 %).

**Lecture business :** TAM modeste pour une commission pure → **monétiser des services** (financement, inspection, escrow, logistique).

**Demande (fiabilité haute) :** PND Côte d'Ivoire 2026-2030 (206 Md$, 70 % privé) ; Maroc pré-Mondial 2030 (rail 9,5 Md$, ~40 Md$ eau, OCP 13 Md$) ; Simandou (~20 Md$) ; RDC Kamoa-Kakula/CMOC (4+ Md$) ; Sénégal (>10 Md$). Cible adressable = **sous-traitants miniers locaux**, pas les majors.

**Frictions (cœur de la thèse) :** financement (gap 100-120 Md$/an, financement équipement MEA 2,6 Md$) ; paiement (mobile money massif mais inadapté >50 k€ → escrow) ; logistique/douane (hub marocain compétitif, pratiques hétérogènes).

**Pourquoi cette conclusion pourrait être fausse.** Vide statistique sur l'occasion (pas de HS 8429 par pays francophone) → SAM incertain ; la digitalisation peut rester bloquée par la culture du courtier.

---

## 4. ANALYSE CONCURRENCE

| Acteur | Modèle | Présence Afr. francophone | Menace |
|---|---|---|---|
| **Via Mobilis** (MachineryZone, Europe-TP, Maroc-TP 256k, senegal-tp 250k) | Listing/abonnement | **Forte SEO** (miroirs), stock européen, **0 opérations locales** | Élevée acquisition, faible transaction |
| **Mascus** (Ritchie Bros) | Abonnement dealers, 38 langues, ~3,3 M visites/mois | Vitrine | Moyenne |
| **RB Global / IronPlanet** | Enchères + services, **take rate 21,3 %** | Aucun site d'enchères SSA francophone | Faible local, fort modèle |
| **Avito.ma** | Annonces généralistes (~4,5 M visites/mois) | Forte mais engins ~1 700-2 600, sans services B2B | Moyenne |
| **Concessionnaires OEM** (Neemba, Tractafric, SMT, BIA) | Distribution verrouillée | Très forte sur le neuf | **Partenaires d'inventaire** |
| **Informel WhatsApp/Facebook** | Mise en relation sociale | Dominant (social commerce ~4,45 Md$, +27 %) | **Le vrai concurrent** — sans confiance ni recours |

**Enseignements (fiabilité haute) :** Tradus (OLX) fermé en 2021 → listing global sans transaction = mort-né. Le canal informel domine (85 % des acheteurs en ligne échangent sur un réseau social avant achat) mais défaillant (arnaques acompte, faux contrats). IronPlanet n'a vendu à 500 k$ sans inspection physique que grâce à **IronClad Assurance** — le produit qui crée la confiance.

**MODE CONCURRENT.** « Première marketplace francophone » : copiable < 3 mois par Via Mobilis. « Trust layer local » : **défendable** (opérations + partenariats au sol). « Données scrapées » : passif juridique (CGU interdisent le scraping).

---

## 5. ANALYSE UTILISATEURS

**Vendeurs** — veulent des leads qualifiés + vitrine crédible. Or : aucune modération, modèle vendeur fragmenté (`sellerid`/`seller_id`/`user_id`/`owner_id`), import Excel qui pollue le catalogue. Un dealer paie pour des leads avant un abonnement — MineGrid n'a pas de preuve de leads.

**Acheteurs** — cherchent prix transparent + provenance + financement + livraison dédouanée. Annonces avec prix convertissent **8×** ; or `machines.price` en TEXT s'affiche à **0** si non numérique. Bouton « Modifier » mensonger, devis PDF jamais généré, demande de financement n'envoie que les *noms* des fichiers.

**Prestataires** — 8 dashboards métier, mais widgets majoritairement mock/aléatoires, config persistée seulement en `localStorage`.

**MODE RÉALITÉ TERRAIN.** Un acheteur ne vire pas 120 000 € sur une fiche web : il veut WhatsApp qui répond, inspecteur, séquestre, transitaire identifié. MineGrid annonce « chat en direct » (bot), masque son téléphone, affiche 3 domaines d'email contradictoires, mentions légales invalides. **Le terrain ne fait pas confiance à ce qu'il voit.**

---

## 6. AUDIT FONCTIONNEL (réel vs façade)

| Parcours | Statut | Détail |
|---|---|---|
| Catalogue + fiche machine | **Fonctionnel** | Supabase réel, pagination, images storage |
| Devis/leads → dossier | **Fonctionnel** | `submitQuoteRequest` + `transaction_cases` + email Resend, testé |
| Contact | **Fonctionnel** | Insert réel, sans « faux succès » |
| ChatWidget public | **Fonctionnel** | n8n, timeout 30 s, fallback WhatsApp |
| Publication manuelle | **Partiel** | Insert réel **mais aucune modération** |
| Import Excel | **FAÇADE DANGEREUSE** | OCR simulé, insère 2 machines hardcodées dans la base |
| AssistantIA | **FAÇADE TOTALE** | Templates « [À compléter] », délai 2 s, aucun appel IA |
| Boutons dashboards | **FAÇADE** | ~22 succès simulés ; SMS/email/CRM ne partent pas ; « export Excel » = JSON |
| Dashboards Enterprise (grille mock) | **Code mort** | `EnterpriseDashboard.tsx` non routé |
| Dashboard perso + widgets vendeur | **Hybride** | Supabase réel **+ `Math.random`** |
| GlobalMonitor | **Partiel** | Dépend du service Python ; défaut `localhost:8000` |

**Note de contre-vérification :** la pire façade (`EnterpriseDashboard.tsx`) est **code mort non routé** (atténuation réelle). En revanche `Dashboard.jsx`, les stubs `apiService`, l'import Excel, l'AssistantIA et les `Math.random` sont **dans le chemin de production**.

---

## 7. AUDIT UX/UI

- Navigation principale **inaccessible au clavier** (menus au survol souris, pas d'`aria-expanded`) — WCAG 2.1.1.
- Formulaire d'inscription : 15 `<label>` sans `htmlFor` → illisible aux lecteurs d'écran.
- Contrastes : CTA blanc/orange-600 à **3,55:1** (< 4,5), liens orange-400 à 2,26:1.
- Dark mode fantôme (`ThemeToggle` jamais monté, `darkMode` absent de Tailwind).
- **i18n inexistant** : 100 % français codé en dur → exclut Ghana/Nigeria/RSA (anglophones), Angola/Mozambique (lusophones).
- Messages techniques (`sql/quote_requests.sql`, « policy RLS », `.env`) exposés à l'utilisateur final.

---

## 8. AUDIT SEO

**SEO ≈ 0 (le plus grave pour une marketplace).**
- Routing **100 % hash-based** → Google ignore les fragments → **1 seule URL indexable**, HTML vide (`<div id="root">`).
- Aucun SSR/prerender, pas de sitemap.xml/robots.txt, `og-image.jpg`/`logo.svg` **404**.
- Domaine non enregistré, zéro page indexée.

**Pourquoi rédhibitoire :** l'acquisition du secteur est le **pSEO longue traîne**. Mascus.fr ≈ 488 000 annonces indexées ; organique = 54 % du trafic de MachineryZone. MineGrid n'a aucune page. Via Mobilis occupe déjà « pelle occasion Maroc/Sénégal ».

**Coût/délai (fiabilité moyenne) :** 1,74 % des pages neuves atteignent le top 10 en < 1 an. Pour 10 k visites/mois : domaine + SSR + 1 000-3 000 pages réelles + sitemap, puis **12-24 mois et ~30-80 k€** — inutile tant que l'inventaire réel est faible.

---

## 9. AUDIT TECHNIQUE

- 88 159 lignes front, 362 fichiers, routing = switch hash 48 routes (mini-routeur testé mais adopté par 1 seul fichier ; 48 `window.location.hash=` directs).
- **Typage neutralisé** : build sur `tsconfig.json` `strict:false` ; `tsconfig.app.json` strict orphelin → **693 erreurs / 148 fichiers** (~130 substantielles). Client Supabase `: any`.
- **God components** : `WidgetRenderer.tsx` 3 041 l, `Dashboard.jsx` 2 329 l (JS pur), `VitrinePersonnalisee` 1 950, `PublicationRapide` 1 906 ; 16 fichiers > 1 000 l ; ~5 700 l de widgets dupliqués divergés.
- **Triple couche d'accès données** avec collisions de noms (écrit dans la mauvaise table, compile car `any`).
- 562 `console.*` ; React Query marginal (44 hooks vs 157 `useEffect`).
- **Maintenabilité : 4/10.**

---

## 10. AUDIT SÉCURITÉ

**7 findings critiques + 44 hauts.** Les plus graves :
1. **Contournement total du paiement** : pas de webhook Stripe ; `StripePaymentForm` écrit `pro_clients {active}` côté client, RLS `WITH CHECK auth.uid()=user_id` l'autorise → abonnement gratuit.
2. **Faux paiement carte** dans `ProSubscription` (toast succès + insert, aucun Stripe).
3. **Rôles/abonnements en `localStorage`** (`auth.ts`) → auto-attribution en 1 ligne console ; `#demo-entreprise` débloque l'Enterprise.
4. **Codes promo/accès dans le bundle** (`VITE_PROMO_CODE=Minegrid2026`, `VITE_MONITOR_ADMIN_TOKEN=changeme-…`).
5. **`ProtectedRoute` ne vérifie que la session**, pas le rôle/abonnement ; dashboards payants non gardés.
6. **`/projects` du monitor** en `require_user_or_admin` → tout compte gratuit lit la veille payante.
7. **`send-email` = relais ouvert** (CORS `*`, sans auth, `service_role`).
8. **Secrets prod en clair sur disque** (`monitor-service/.env` : `service_role` exp 2090, JWT secret vérifié authentique, OpenAI, Piloterr, mdp DB) — non commités mais world-readable.
9. **Token n8n hardcodé** (`minegrid-secret-token-2025`) dans le bundle.
10. **Aucun en-tête de sécurité HTTP** (CSP/X-Frame/HSTS), **aucune conformité RGPD/loi 09-08**.

**Atténuations :** `create-payment` durci, monitor paid-access durci/testé, JWT HS256 correct, admin constant-time, RLS `quote_requests` scopée, clé ANON seule côté front.

---

## 11. AUDIT SUPABASE

- RLS des tables cœur **non auditable** (`machines`/`messages`/`notifications`/`offers`/`pro_clients` sans DDL/RLS dans le SQL actif ; seulement `archive/`, versions contradictoires).
- RLS `machines` contradictoire : un script « OBLIGATOIRE » ouvre `USING(true)` (modif/suppression par tous).
- `interventions` définie 2× (policies SELECT divergentes → fuite inter-locataires).
- 8 tables interrogées sans DDL (`devis`/`documents`/`planning_events`/`vitrines`/`actions`/`equipments`/`user_settings`/`users`).
- Tables monitor `data_sources`/`geocode_cache` sans RLS ni REVOKE.
- Edge Functions : deux fonctions email opposées, SDK Stripe en 2 versions majeures, import `supabase-js@2` flottant.

---

## 12. AUDIT BASE DE DONNÉES

- **Pas de source de vérité du schéma** : 81 fichiers SQL, aucune migration versionnée → reconstruction impossible.
- `profiles` : 10 définitions concurrentes + 2 triggers `on_auth_user_created` destructeurs.
- `machines.price` en **TEXT** (corruption en 0) ; 4 colonnes vendeur sans FK + vendeur fantôme `00000000-…-0001`.
- Aucune FK sur `quote_requests`/`leads`/`machine_views`/`transaction_cases` → machine.
- Volumétrie 10k non tenue (filtres 100 % client, plafond 3 000 → 70 % du stock invisible).
- `machine_views` : INSERT anonyme illimité (stats gonflables).
- Aucun backup/PITR ; scripts historiques `DROP TABLE … CASCADE` en prod.

---

## 13. AUDIT PERFORMANCE

- Chemin critique ≈ **674 KB JS (183 KB gzip)** + 89 KB CSS → FCP 3-5 s, LCP 8-12 s à 2 Mbps (Android d'entrée de gamme).
- `leaflet.css` render-blocking depuis `unpkg` (SPOF/RGPD/sans SRI).
- Logo 241 KB en 48 px, hero 1950 px sans srcset, image blog 3 MB, lazy sur 2 `<img>`/29.
- Atténuations : 7 manualChunks, exceljs (940 KB) en import dynamique, 33 routes lazy.

---

## 14. AUDIT SCALABILITÉ

- Données : filtres/agrégations côté client cassent dès quelques milliers de lignes → SQL+index+RPC.
- Code : god components + triple couche + ~1 % de tests = régression silencieuse au scale.
- Monitor : APScheduler in-process mono-instance, `create_all` au boot, pas de healthcheck profond.
- Unit economics du monitor (scraping + OpenAI/Piloterr) non modélisé.
- Le vrai obstacle au scale est commercial (liquidité de l'offre), pas l'infra.

---

## 15. AUDIT DEVOPS

- **CI jamais exécutée** (triggers sur branches inexistantes sur le remote ; serait rouge car lint cassé).
- Aucun déploiement automatisé (pas de vercel.json/netlify.toml ; `dist/` buildé localement).
- **Aucune séparation d'environnements** (dev → Supabase + n8n de prod).
- Observabilité nulle (pas de Sentry, analytics fantôme, pas d'uptime).
- Monitor sans supervision (`/health` statique, Postgres 5432 mdp « monitor »).
- SPOF totaux (Supabase/n8n/monitor), aucun RTO/RPO.
- Hygiène git : 2 remotes/2 comptes, pas de `main` sur le remote actif, 14 `.pyc` trackés.

---

## 16. AUDIT IA

| Fonctionnalité | Problème | Donnée | Faisabilité | Verdict |
|---|---|---|---|---|
| AssistantIA | Réel (saisie vendeur) | Oui | Webhook n8n existe | **À brancher ou supprimer (100 % factice)** |
| ChatWidget public | Qualification lead | Oui | **Déjà branché** | **Conserver** |
| Auto-specs (n8n) | Réel | Oui | Existe | Conserver, sécuriser le token |
| Global Monitor / rules engine | Veille marché | Scraping | 1 test échoue | Valeur réelle mais à fiabiliser + risque légal |
| Widgets « IA » | Faible | `Math.random` | — | **Supprimer** |

**Conclusion :** une seule brique a une valeur démontrée (ChatWidget). ROI IA court terme faible ; seuls l'auto-remplissage de fiches et l'estimation de prix d'occasion (après volume) sont à fort ROI.

---

## 17. AUDIT FINANCIER

**Modèle gagnant (fiabilité haute) :** empilement frais acheteur + services. RB Global 21,3 % de take rate de services ; ACV Auctions ~2 % GMV cœur, >4 % avec services (55 % du revenu). Pure-listers = abonnement vendeur (MachineryTrader 799-3 000 $/mois).
**Métriques :** conversion lead→vente 1,9 %, cycle 180 j, CAC ~20 800 $, annonces avec prix 8×. Seuils VC : rétention M12 ≥30 %, LTV:CAC ≥3, payback <12 mois.

**Unit economics MineGrid (estimation) :** SOM 15-50 M€ GMV → 0,3-2 M€/an (modeste). Coûts initiaux refonte 150-300 k€ ; opérations terrain 300-600 k€/an ; équipe 250-450 k€/an. Rentabilité non atteignable avant 3-5 ans.

**MODE CFO — règle absolue (Kobo360/Lori) :** **ne jamais porter le float.** Externaliser le financement vers des banques partenaires (8-24 %).

---

## 18. ANALYSE DES RISQUES

| Risque | Probabilité | Impact | Niveau |
|---|---|---|---|
| Contournement paiement | Certaine | Fatal | **Critique** |
| Fuite secrets prod | Moyenne | Fatal | **Critique** |
| Liquidité d'offre insuffisante | Élevée | Fatal | **Critique** |
| Désintermédiation | Élevée | Majeur | Élevé |
| Bus factor = 1 | Certaine | Majeur | Élevé |
| Risque légal scraping + RGPD | Moyenne | Majeur | Élevé |
| SEO nul + Via Mobilis | Élevée | Majeur | Élevé |
| Pas de séparation d'env | Moyenne | Majeur | Élevé |
| Cyclicité capex miniers | Moyenne | Modéré | Moyen |

---

## 19. ANALYSE DES ANGLES MORTS

1. **Stock réel inconnu** (une marketplace sans inventaire n'a aucune valeur).
2. Unit economics du monitor non modélisé.
3. Pas d'en-têtes de sécurité HTTP.
4. Région de données Supabase non documentée (PII Afrique/UE).
5. Provenance/légalité du catalogue (si scraping).
6. `send-email` relais ouvert (réputation d'expéditeur).
7. Documentation interne trompeuse (« 95 % connecté »).

---

## 20. OPPORTUNITÉS CACHÉES

1. **Inspection certifiée** comme produit d'entrée (IronClad/Boom&Bucket ~199 $/machine).
2. **Escrow mobile money CFA** (<50 k€).
3. **Apport financement** (gap 100-120 Md$/an, sans float).
4. **Hub réexport marocain** (Tanger Med, occasion européenne *légale*).
5. **WhatsApp Business** comme front d'acquisition (`VITE_WHATSAPP_NUMBER` existe, vide).
6. **Partenariats OEM** comme fournisseurs d'inventaire certifié.

---

## 21. AVANTAGES CONCURRENTIELS

**Défendable :** la couche d'exécution transactionnelle locale (inspection + escrow CFA + dédouanement + financement) — opérations + partenariats qu'un acteur SEO ne montera pas vite. **Non défendable :** « première marketplace », le logiciel, le catalogue scrapé. **Impératif : se définir comme tiers de confiance opéré, pas comme petites annonces.**

---

## 22. PLAN ANTI-CONCURRENCE

1. Verrouiller un corridor (Dakar/Abidjan) avant Via Mobilis.
2. Signer l'offre locale en exclusivité (50-100 dealers, annonces réelles).
3. Faire de l'inspection le produit d'appel.
4. Capturer le post-match (escrow, transport, financement) → tuer la désintermédiation.
5. pSEO défensif une fois l'inventaire réel constitué.

---

## 23. ROADMAP 30 JOURS — « Arrêter l'hémorragie »

1. Rotation de tous les secrets prod ; sortir le projet de `C:\Users\Public` ; vider les `VITE_*` sensibles.
2. Fermer le contournement paiement (webhook Stripe + RLS `pro_clients` service_role + suppression écritures client).
3. Dériver rôle/abonnement du serveur ; supprimer `#demo-entreprise` du build prod.
4. Durcir/supprimer `send-email`, `create-payment-intent`, `create-payment/index.js` ; en-têtes HTTP.
5. Désactiver les façades (Excel, AssistantIA, stubs, `Math.random`).
6. Séparer les environnements (Supabase + n8n de staging).
7. Réparer la CI ; **mesurer le stock réel**.

## 24. ROADMAP 90 JOURS — « Socle »

1. Baseline de schéma (`supabase db pull`, migrations versionnées, `price`→NUMERIC, FK, RLS canonique, colonne vendeur unique).
2. Filtres/agrégations en SQL + modération des annonces.
3. Conformité (mentions/CGV/RGPD/loi 09-08, cookies, région Supabase, domaine email unique).
4. Observabilité (Sentry + Plausible + uptime + healthcheck monitor).
5. Pilote « trust layer » sur 1 corridor (50-100 annonces réelles, 1 inspection, 1 escrow).
6. Backup/PITR + runbook de restauration testé.

## 25. ROADMAP 1 AN — « PMF transactionnel »

1. SEO : routing path-based + SSR/prerender, sitemap, JSON-LD, 1 000-3 000 pages réelles.
2. Monétisation : abonnements vendeurs + lead fees + 2-4 % take rate via inspection/escrow/financement.
3. Financement intégré via banques (jamais de float).
4. Élargissement 2-3 corridors ; rétention M12 ≥30 %, LTV:CAC ≥3.
5. Équipe : sortir du bus-factor 1, protection de branche + revue.

## 26. ROADMAP 3 ANS — « Scale du tiers de confiance »

1. Couverture multi-pays UEMOA + Maghreb + RDC ; hub réexport opérationnel.
2. Place de marché du financement/assurance d'équipement (marge fintech).
3. Données propriétaires de prix d'occasion → IA à valeur démontrée.
4. Internationalisation anglophone/lusophone si rétention prouvée.
5. Cible : 50-150 M€ de GMV, leadership du segment.

---

# VERDICT FINAL

### 1. Score global : **34/100**
Opportunité marché 8 · Produit/exécution 3 · Sécurité 2 · Technique 4 · Données/BD 2 · DevOps 2 · Traction 0 · Équipe 2 · Défendabilité 6 · Conformité 1 (/10).

### 2. Probabilité de succès (5 ans)
- En l'état : **~15-20 %**.
- Avec exécution disciplinée + pivot trust layer + équipe + financement : **~40-45 %**.

### 3. Probabilité d'échec
- En l'état : **~80-85 %**.

### 4. Conditions indispensables
1. Fermer le contournement paiement + sécuriser les secrets **avant tout euro**.
2. Prouver une liquidité d'offre locale réelle.
3. Se repositionner en tiers de confiance opéré.
4. Ne jamais porter le float.
5. Sortir du bus-factor 1 + CI/revue/staging.
6. Conformité légale/RGPD/loi 09-08.

### 5. Top 20 problèmes critiques
1. Contournement paiement. 2. Secrets prod world-readable. 3. Domaine non enregistré/zéro traction. 4. SEO nul. 5. Rôles/abonnement `localStorage`. 6. Pas de séparation d'env. 7. Schéma BD non maîtrisé. 8. `send-email` relais ouvert. 9. Promo/accès dans le bundle. 10. Aucune modération. 11. `price` en TEXT. 12. Bus factor = 1. 13. CI/lint/tests ~1 %. 14. RGPD/légal = canevas. 15. Façades produit. 16. Volumétrie non tenue. 17. Risque légal scraping. 18. Backup/DR/SPOF. 19. Observabilité absente. 20. Grille tarifaire incohérente + premium rejeté.

### 6. Top 20 opportunités majeures
1. Marché sans leader francophone. 2. Pipeline projets. 3. Inspection certifiée. 4. Escrow mobile money. 5. Apport financement. 6. Hub Tanger Med. 7. WhatsApp acquisition. 8. Partenariats OEM. 9. Location MEA. 10. pSEO défensif. 11. Verrouillage corridor. 12. Sous-traitants miniers locaux. 13. Parc vieillissant. 14. Confiance comme moat. 15. Données prix occasion. 16. Expansion anglophone/lusophone. 17. Auto-remplissage de fiches. 18. Marketplace financement/assurance. 19. Parcours acheteur déjà câblé. 20. Assainissement entamé.

### 7. Décision d'investissement
> **INVESTIR SOUS CONDITIONS — pré-seed uniquement, sur la thèse et le fondateur, pas sur le code.**

Ticket pré-seed **50-150 k€**. Conditions : milestones 30/90 j (paiement + secrets + staging + stock mesuré), pivot trust layer acté, lead technique recruté, 50-100 annonces locales + pilote inspection/escrow, conformité engagée. ROI asymétrique (10-20× si PMF transactionnel), risque élevé (~80 % de perte sans exécution). **Ne pas valoriser le code/produit actuel comme un actif.**

**MODE CONTRADICTION.** *Trop pessimiste ?* La plupart des défauts sont corrigeables en semaines ; le parcours acheteur est réel ; le marché est indéniable. *Trop optimiste ?* Le marché « digitalisable » peut rester bloqué ; Via Mobilis peut écraser le SEO ; aucun marketplace pur d'engins n'a survécu indépendant ; bus-factor 1. La vérité dépend de l'exécution sur 6 mois — nature d'un pari pré-seed.

### 8. Plan d'action priorisé par ROI

| Priorité | Action | Effort | ROI |
|---|---|---|---|
| P0 | Fermer paiement + rotation secrets + staging | M | Vital |
| P0 | Mesurer le stock réel | S | Vital |
| P1 | Repositionnement trust layer + pilote | L | Très élevé |
| P1 | Honnêteté produit (façades) + conformité | M | Élevé |
| P1 | Baseline schéma BD | L | Élevé |
| P2 | SSR/SEO + sitemap | XL | Élevé (différé) |
| P2 | Observabilité + CI + bus-factor | M | Élevé |
| P3 | Performance | M | Moyen |
| P3 | Stripe SDK/deps/dead code | M | Moyen |

---

**En une phrase :** *MineGrid vise le bon marché avec le bon angle potentiel (le tiers de confiance), mais livre aujourd'hui un produit pré-lancement, non sécurisé pour encaisser, sans traction et porté par une seule personne — pari fondateur pré-seed à fort risque, à financer petit et jalonner serré, jamais une marketplace prête à scaler.*

---

# ANNEXE A — ÉTAT DE LA REMÉDIATION (au 13/06/2026)

Branche `fix/critical-security-hardening`. Vérifié : `tsc` 0 erreur · **80 tests verts** (était 63) · `vite build` OK. **Non commité, non déployé** (les migrations SQL et Edge Functions nécessitent un déploiement Supabase manuel — voir `docs/DEPLOIEMENT_FIX_PAIEMENT.md`).

Légende : ✅ corrigé (code, actif) · ⏳ corrigé, à déployer · 🟡 partiel · ⛔ non commencé.

| # Top 20 | Statut | Détail |
|---|---|---|
| 1. Contournement paiement | 🟡⏳ | Écritures client supprimées ✅ ; faux paiement/promo neutralisés ✅ ; **12 routes payantes gardées serveur** (`RequireSubscription`) ✅ ; webhook `stripe-webhook` + RLS `pro_clients` = ⏳ à déployer |
| 2. Secrets prod | ⛔ | Rotation + déplacement = action humaine (runbook fourni) |
| 3. Domaine/traction | ⛔ | Ops |
| 4. SEO nul | ⛔ | Phase 7 (og:image absolue + og:url/type ✅ mineurs) |
| 5. Rôles/abonnement `localStorage` | ✅(routes) 🟡 | Primitif serveur `getMySubscription` + hook + garde sur 12 routes ✅ ; reste onglets `Header`/sections `Dashboard.jsx` (cosmétique, Phase 6) |
| 6. Séparation d'env | ⛔ | Staging = ops |
| 7. Schéma BD | ⛔ | Phase 3 |
| 8. `send-email` relais | ⏳ | Durci (JWT + allow-list + destinataire fixe) ✅, à déployer ; orphelines `create-payment-intent`/`index.js` supprimées ✅ |
| 9. Promo/accès bundle | 🟡 | Exploit neutralisé ; garder `VITE_*` vides au build prod |
| 10. Modération annonces | ⛔ | Phase 6 (insert Excel fictif ✅ supprimé) |
| 11. `price` TEXT | ⛔ | Phase 3 |
| 12. Bus factor 1 | ⛔ | Organisationnel |
| 13. CI/lint/tests | 🟡 | Tests 63→80 ; CI/lint ⛔ |
| 14. RGPD/légal | ⛔ | Juridique (en-têtes CSP/HSTS ✅) |
| 15. Façades | 🟡 | Excel ✅, stubs `apiService` ✅ ; AssistantIA ⛔, `Math.random` ⛔ |
| 16. Volumétrie filtres client | ⛔ | Phase 4 |
| 17. Scraping légal | ⛔ | Juridique/ops |
| 18. Backup/SPOF | 🟡 | SPOF Leaflet ✅ supprimé ; reste ⛔ |
| 19. Observabilité | ⛔ | Phase 5 |
| 20. Grille tarifaire/premium | 🟡 | Serveur : premium accepté + grille EUR unique ✅ ; labels « USD » front ⛔ |

**Fichiers de remédiation créés/modifiés :** `supabase/functions/stripe-webhook/`, `sql/2026-06_pro_clients_rls_hardening.sql`, `sql/diagnostic_stock_reel.sql`, `public/_headers`, `docs/DEPLOIEMENT_FIX_PAIEMENT.md`, `src/utils/api/subscription.ts`, `src/hooks/useSubscription.ts`, `src/components/RequireSubscription.tsx` ; durcissements de `StripePaymentForm`, `ProSubscription`, `PaymentPage`, `PublicationRapide`, `apiService`, `proApi/profile`, `create-payment`, `send-email`, `index.html`, `main.tsx`.

**Impact investisseur :** une fois déployé (verrou n°4 armé), la sécurité passe de 2 à ~4/10 et le red-flag « ne peut pas encaisser » disparaît → score **34 → ~40/100**. La suite (stock réel, équipe, pivot) reste majoritairement hors-code.
