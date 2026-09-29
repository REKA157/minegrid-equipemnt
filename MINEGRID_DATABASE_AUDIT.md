# MINEGRID — AUDIT DE LA BASE DE DONNÉES

**Date** : 2026-09-29 · 58 migrations · base de production `tnfbggrftmtxpgbcwqzo`

---

## La question centrale : peut-on reconstruire MineGrid depuis le seul dépôt git ?

# **OUI.**

C'est la bonne nouvelle de cet audit, et elle est prouvée, pas supposée : les **58 migrations ont
été rejouées dans l'ordre sur un PostgreSQL 16 vierge**, dans un conteneur jetable.

```
résultat : 57 / 58
seul échec : 20260708130000_teamB_org_members_rpc.sql
             « column au.last_sign_in_at does not exist »
             → vient du bouchon de test qui remplace auth.users, PAS du projet
```

Prérequis nécessaires, à documenter pour toute reconstruction : créer les rôles `anon`,
`authenticated`, `service_role`, un schéma `auth` minimal, et neutraliser deux objets
exclusivement Supabase (extension `supabase_vault`, publication `supabase_realtime`).

**Nuance importante** : le schéma est reconstructible, **les données ne le sont pas**. Il
n'existe aucune sauvegarde vérifiable (voir `SAUV-01`, `SAUV-02`). Reconstruire la base rendrait
une base vide.

## Une faiblesse du harnais de preuves, à connaître

Le harnais `supabase/tests/run_all_proofs.sh` est présenté comme un niveau d'exigence élevé. Il
l'est sur ce qu'il couvre, mais il ne couvre pas ce qu'on croit :

- `grep -c baseline run_all_proofs.sh` → **0** : le socle `00000000000000_baseline.sql` n'est
  **jamais** appliqué ;
- **18 migrations sur 58** y apparaissent ;
- `p30`, `p31`, `p32` et `p33` n'ont **aucun** harnais.

Il prouve donc chaque politique RLS isolément contre un schéma synthétique, **jamais que la
séquence complète produit le schéma réel**. C'est précisément ce test manquant qui a été fait
ci-dessus, et il passe.

---

## Le défaut structurel : l'argent est stocké en texte



### Vérifié personnellement

```
supabase/migrations/00000000000000_baseline.sql:3153
    "price" "text",
```

Sur une plateforme transactionnelle, un montant en texte signifie : pas de comparaison
numérique possible sans conversion, pas de contrainte d'intervalle, pas de devise attachée, et
un tri alphabétique qui place « 1 250 000 » avant « 95 000 ». La migration `p33` écrite cette
semaine ajoute une vue avec conversion — elle n'est appliquée nulle part.

---

## Problèmes de base de données et d'intégrité

| ID | Sév. | Preuve | Problème |
|---|---|---|---|
| `SEQ-01` | P0 | PROUVE | Le prix des annonces est stocke en TEXTE sans devise, et la chaine le convertit en MAD sans conversion |
| `SEQ-04` | P0 | PROUVE | Le sequestre n'existe pas : aucun prestataire de paiement, fonctions serveur absentes de la production |
| `SEQ-05` | P0 | PROUVE | 83,7 % des annonces portent un vendeur fictif ; le filtre existe cote TypeScript mais PAS cote SQL |
| `CTR-01` | P0 | PROUVE (lecture). 1) Droits : `GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE ON TABLE "public"."transaction_cases" TO "authenticated";` (00000000000000_baseline.sql:7533) — p3 (20260702090400_p3_restrict_transaction_cases_update.sql:21-22) ne révoque QUE l'UPDATE et ne reconcède que title/notes/priority ; l'INSERT n'est pas touché, l'en-tête de p3 le dit explicitement : « Le parcours devis->dossier (INSERT) n'est pas touché ». 2) Policy : `CREATE POLICY "transaction_cases_insert" ... WITH CHECK ((seller_user_id = auth.uid()) OR (buyer_user_id = auth.uid() AND seller_user_id IS NOT NULL AND seller_user_id <> auth.uid()))` (baseline:6405) — elle contrôle QUI sont les parties, jamais total_amount, currency ni status. 3) Ce n'est pas théorique, c'est le chemin nominal du produit : `supabase.from('transaction_cases').insert({ kind, status: 'draft', ..., total_amount: opts.amount ?? null, currency: opts.currency ?? 'MAD' })` (src/utils/api/quoteRequests.ts:159-172), appelé en premier par submitQuoteRequest (quoteRequests.ts:300-306) ; la RPC SECURITY DEFINER n'est qu'un REPLI si cet INSERT échoue (quoteRequests.ts:310-313). | Le montant, la devise et le statut du dossier sont écrits DIRECTEMENT par le client à la création — p3 ne pro… |
| `CTR-02` | P0 | PROUVE (lecture). Policy : `CREATE POLICY "transaction_cases_delete" ON "public"."transaction_cases" FOR DELETE TO "authenticated" USING (("seller_user_id" = (SELECT auth.uid())));` (baseline:6401), assortie du droit DELETE (baseline:7533). Aucune condition d'état : un dossier 'payment', 'delivery' ou 'closed' est supprimable. Cascades attachées : commission_records ON DELETE CASCADE (baseline:5060), payment_records ON DELETE CASCADE (baseline:5310), inspection_reports ON DELETE CASCADE (baseline:5170), inspection_requests ON DELETE CASCADE (baseline:5185), customs_cases (5080), financing_requests (5150), logistics_tasks (5250), broker_cases (5045) ; escrow_transactions passe en ON DELETE SET NULL (baseline:5135) et devient orpheline. Le correctif existe et n'est appliqué nulle part : 20260814120000_p29_remediation_audit_consolide.sql:104-105 (`drop policy ... transaction_cases_delete` + `revoke delete ... from authenticated, anon`) et le trigger de garde _tc_guard_delete (p29:107-134) ; l'en-tête de p29 nomme ce défaut « R-01 : DELETE direct sur transaction_cases -> cascade destructrice ». Aucune trace de p29 dans .audit/APPLY_IN_PROD.sql (les 18 lots inclus y sont listés : p3, p8 à p24 ; p29 n'y est pas). | Le vendeur peut SUPPRIMER le dossier : la cascade détruit commissions, paiements et rapports d'inspection |
| `CTR-03` | P0 | PROUVE (lecture). La policy `transaction_participants_insert` (baseline:6467) est un OR de quatre branches. La quatrième s'écrit : `EXISTS (SELECT 1 FROM "public"."transaction_participants" "p" WHERE (("p"."case_id" = "p"."case_id") AND ("p"."user_id" = (SELECT auth.uid())) AND ("p"."revoked_at" IS NULL) AND ("p"."role" = ANY (ARRAY['broker','admin_delegate']))))`. Le prédicat `p.case_id = p.case_id` est une tautologie : il ne rattache la vérification à AUCUN dossier. La condition se réduit donc à « l'appelant est courtier ou délégué sur au moins un dossier quelque part ». Les droits sont ouverts : `GRANT ALL ON TABLE "public"."transaction_participants" TO "authenticated"` (baseline:7569). Et la lecture suit automatiquement : `can_access_transaction_case` (baseline, fonction SECURITY DEFINER) renvoie vrai dès qu'il existe une ligne transaction_participants avec user_id = appelant et revoked_at is null. L'équipe a identifié ce défaut : p29 le nomme « RLS-01 : prédicat TAUTOLOGIQUE `p.case_id = p.case_id` -> une fois la récursion levée naïvement, tout broker deviendrait partie de N'IMPORTE QUEL dossier » et le corrige (p29:40-100) — p29 n'est appliqué nulle part. La même policy est en outre récursive (elle interroge transaction_participants depuis une policy de transaction_participants), défaut « NEW-01 » de p29, ce qui peut faire échouer l'INSERT avec « infinite recursion detected in policy » selon l'ordre d'évaluation du OR — c'est d'ailleurs ce que documente le commentaire de quoteRequests.ts:180-188. | Prédicat tautologique dans la policy des participants : un courtier d'un dossier s'ajoute à N'IMPORTE QUEL do… |
| `MANQUE-01` | P1 | PROUVE | La methode de detection d'ecart ne voit que les migrations qui creent une table : tout le durcissement de sec… |
| `MANQUE-02` | P1 | PROUVE | La reconstructibilite n'a ete traitee que pour le schema : les donnees n'existent nulle part ailleurs qu'en p… |
| `SEQ-06` | P1 | PROUVE | L'etape « confiance » n'existe pas en base de production : ce sont des ecrans devant le vide |
| `SEQ-07` | P1 | PROUVE | En production, le vendeur peut etre son propre inspecteur et declarer l'inspection terminee |
| `SEQ-08` | P1 | PROUVE | Le journal du dossier est falsifiable en production : un participant peut ecrire un evenement systeme sans ac… |
| `SEQ-15` | P1 | PROUVE | En production, les transitions d'etat du dossier ne sont controlees ni en ordre ni en role |
| `CTR-04` | P1 | PROUVE (lecture). `can_access_transaction_case(p_case_id, p_uid)` (00000000000000_baseline.sql, fonction SQL STABLE SECURITY DEFINER) renvoie vrai si l'appelant est vendeur/acheteur OU s'il existe une ligne transaction_participants non révoquée. La colonne accepted_at n'est jamais testée. Or `assign_transaction_partner` (baseline:391-401) permet à un principal d'ajouter n'importe quel utilisateur existant par son e-mail, avec invited_at renseigné et accepted_at nul. Cette fonction pilote ensuite l'accès en lecture de presque toute la chaîne : transaction_cases_select (baseline:6409), transaction_events_select (baseline:6451), transaction_participants_select (baseline:6479), inspection_req_select (5888), inspection_rep_select (5877), transaction_tasks_access (6489), transaction_messages_access (6459). L'équipe l'a identifié : p29 en-tête, « R-02 : can_access_transaction_case ignore accepted_at -> un participant invité mais jamais accepté lit tout le dossier », corrigé p29:145-177 avec accept/decline_transaction_invitation (p29:179-254) — non appliqué. | Un partenaire invité mais jamais acceptant lit l'intégralité du dossier |
| `CTR-05` | P1 | PROUVE (lecture croisée). Le dépôt contient bien un filtre du vendeur fantôme, à deux endroits : `PLACEHOLDER_SELLER_IDS` + `isPlaceholderSellerUuid` + `resolveSellerUuidFromMachineRecord` (src/pages/machineDetailHelpers.ts:44-61) et la même fonction côté serveur dans supabase/functions/send-contact-email/index.ts:96-101. Mais le parcours devis ne les utilise pas : src/utils/api/quoteRequests.ts n'importe que supabaseClient, supabaseCall et logger (lignes 1-3) ; sa résolution de vendeur passe par `parseSellerUuid` (quoteRequests.ts:69-78), qui ne fait QUE valider le format UUID par expression régulière et accepte donc 00000000-0000-0000-0000-000000000001 ; `fetchSellerUserIdFromMachine` (quoteRequests.ts:131+, appelée ligne 251) l'utilise telle quelle. Côté base, même absence de filtre : `coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id)` dans ensure_transaction_case_for_quote_request (baseline:1076-1079). Rappel de volume : 13 717 annonces portent ce seller_id (mesure production ci-dessus). | Le parcours devis -> dossier ne filtre PAS le vendeur fantôme du scraper, alors que l'envoi de mail le filtre |
| `CTR-06` | P1 | PROUVE (lecture) pour l'existence dans la baseline ; TRES PROBABLE pour la présence effective en production (la baseline EST le dump du schéma de production, les tables escrow_transactions et escrow_events y répondent 200, et je me suis interdit l'appel POST qui l'aurait prouvé car il écrirait). La fonction `open_case_escrow(p_case_id uuid)` (baseline:1552) est SECURITY DEFINER, propriétaire postgres, `GRANT ALL ... TO anon / authenticated` (baseline:7051-7053). Elle contrôle uniquement que l'appelant est vendeur ou acheteur, puis (a) si le dossier n'a pas de montant, elle EXECUTE `update public.transaction_cases set total_amount = (select nullif(regexp_replace(replace(m.price::text, ',', '.'), '[^0-9.]', '', 'g'), '')::numeric from public.machines m ...), currency = coalesce(v_case.currency, 'MAD')` (baseline:1571-1579), et (b) elle insère dans public.escrow_transactions (baseline:1592-1597) avec `coalesce(v_case.currency, 'MAD')`. | open_case_escrow est en base, ouvert à toute partie, écrit la table monétaire du séquestre et réécrit le mont… |
| `CTR-07` | P1 | PROUVE (lecture). Le premier auditeur cite le bouton grisé de TransactionCasePage.tsx:122-128 (« Séquestre — activation opérateur requise », disabled) et en conclut que « l'interface ne ment PAS sur le séquestre ». Il n'a pas lu les vingt lignes au-dessus. STEP_ACTIONS (TransactionCasePage.tsx:64-70) contient cinq entrées, dont `{ step: 'payment', label: 'Préparer le séquestre (après inspection)' }` (ligne 69). Ces cinq boutons sont rendus lignes 110-118 avec `disabled={pending !== null}` — c'est-à-dire actifs. Le clic appelle advanceTransactionCaseStep(caseId, 'payment') (ligne 84) -> RPC advance_transaction_case_step, dont la version DE PRODUCTION (baseline:282-318) pose `v_new_status := 'payment'` puis `update public.transaction_cases set status = 'payment'` (baseline:311-315) sans aucun contrôle d'ordre ni de rôle au-delà de _tc_is_party. En amont, create_payment_step (baseline) insère une ligne payment_records en 'awaiting_partner' avec le montant du dossier. La mention « (après inspection) » du libellé n'est enforcée nulle part en production (c'est exactement SEQ-15). | Le bouton « Préparer le séquestre » est ACTIF et fait basculer le dossier en statut 'payment' sans qu'un cent… |
| `DB-02` | P2 | PROUVE | Aucune contrainte de signe sur les montants : un paiement negatif est accepte par la base |
| `DB-04` | P2 | PROUVE | machine_id sans cle etrangere dans six tables, dont escrow_transactions ou il est NOT NULL |
| `DB-06` | P2 | PROUVE | Le socle Supabase requis par les migrations n'est documente nulle part dans le depot, et la baseline n'est pa… |
| `DB-07` | P2 | PROUVE | p33 (recherche catalogue, commit du jour) n'est pas en production : le filtre et le tri par prix restent degr… |
| `DB-08` | P2 | PROUVE | Aucune donnee de reference ni seed dans git : la reconstruction donne un schema vide |
| `MANQUE-03` | P2 | PROUVE | L'UNIQUE sur pro_clients(user_id), presente comme un acquis fonctionnel, n'existe pas en production — et les … |
| `MANQUE-04` | P2 | PROUVE | p33 peut echouer en production sur gin_trgm_ops, et son garde-fou ne rattrape pas cette erreur-la : la correc… |
| `MANQUE-05` | P2 | PROUVE | Les harnais de preuve des deux migrations les plus recentes existent mais ne sont pas executes par la CI : le… |
| `MANQUE-06` | P2 | PROUVE | Un `supabase db push` sur la prod executerait un DELETE sur la table des abonnes payants, angle mort d'un aud… |
| `SEQ-10` | P2 | PROUVE | Aucune ré-affectation d'inspecteur : une inspection ouverte sans mecanicien reste bloquee a vie |
| `SEQ-11` | P2 | PROUVE | Quatre statuts de dossier sur dix sont morts : autorises par la contrainte, ecrits par personne |
| `SEQ-12` | P2 | PROUVE | L'etape « offre / attribution » n'existe pas : table absente en production, code d'acces conserve |
| `SEQ-13` | P2 | PROUVE | 46 % des annonces n'ont aucun prix exploitable : le sequestre y est impossible par construction |
| `SEQ-14` | P2 | PROUVE | La chaine est modelisee deux fois : paires de tables concurrentes pour la douane, l'inspection et le financem… |
| `CTR-08` | P2 | PROUVE (lecture). La preuve SEQ-01 cite `v_currency text := 'MAD';` (baseline:1062) dans ensure_transaction_case_for_quote_request. Or cette RPC n'est que le REPLI : submitQuoteRequest appelle d'abord tryLinkQuoteToNewTransactionCase (quoteRequests.ts:300) avec `currency: 'MAD'` en dur (quoteRequests.ts:306), qui fait un INSERT client direct portant `currency: opts.currency ?? 'MAD'` (quoteRequests.ts:171) et `total_amount: opts.amount ?? null` (ligne 170), le montant venant de fetchMachinePrice (quoteRequests.ts:131-145) qui lit machines.price sans jamais regarder specifications->>'price_currency'. La RPC n'est appelée que si cet INSERT échoue (quoteRequests.ts:310-313). Complément mesuré en production : la devise EXISTE bel et bien dans la base, dans specifications->>'price_currency' — USD 7 715, EUR 5 276, CNY 1 407, GBP 182, absente 388, MAD 0 (curl avec `specifications->>price_currency=eq.<code>` et Prefer: count=exact). La plateforme dispose même d'une table de change : la RPC publique `exchange_rates()` répond 200 et renvoie EUR 1.0000, USD 1.0850, MAD 10.8500 (appel GET /rest/v1/rpc/exchange_rates effectué). | 'MAD' est aussi codé en dur sur le chemin réellement emprunté (client), pas seulement dans la RPC de repli ci… |
| `CTR-09` | P2 | PROUVE (commande exécutée). La seule mention d'escrowBridge dans toute l'application est src/pages/TransactionCasePage.tsx:100 : « La logique serveur (openCaseEscrow / escrowBridge) reste en place pour l'activation future ». Aucun composant, aucune page, aucun service n'importe ce module. Le premier auditeur cite src/utils/api/escrowBridge.ts:33-42 parmi ses points FONCTIONNELS (« les fonctions d'accès client remontent des échecs honnêtes ») : la lecture du code est juste (reasonFromMessage traduit bien buyer_required / amount_required / machine_required / escrow_already_linked / forbidden, escrowBridge.ts:34-43), mais elle ne prouve rien sur le produit, puisque ce code n'est jamais atteint. J'ai rejoué la suite qu'il cite : `npx vitest run src/utils/api/transactionChain.test.ts src/utils/api/escrowBridge.test.ts src/utils/api/ensureTransactionCaseForQuote.test.ts src/utils/api/quoteRequests.test.ts src/nextgen/escrow/escrowStateMachine.test.ts src/pages/TransactionCasePage.test.tsx` -> « Test Files 6 passed (6) / Tests 50 passed (50) », 1,47 s : le chiffre est exact. | escrowBridge.ts est du code mort : aucun appelant dans l'application, mais il sert de preuve « fonctionnel » … |

## Détail

#### `MANQUE-01` — La methode de detection d'ecart ne voit que les migrations qui creent une table : tout le durcissement de securite est hors de portee du verdict

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |

**Preuve**

```
L'auditeur etablit l'ecart prod en interrogeant l'existence de TABLES (ses preuves DB-01 : trust_profiles, verifications, tender_workspaces, toutes en PGRST205). Or j'ai compte, par extraction sur les 58 fichiers, que 41 migrations sur 58 ne creent AUCUNE table : elles posent des colonnes, des fonctions, des policies et des REVOKE. Je prouve par deux contre-exemples que la methode rate des migrations reelles : (1) curl -H "apikey: <ANON>" ".../rest/v1/machines?select=id,moderation_hidden_at&limit=1" -> {"code":"42703","details":null,"hint":null,"message":"column machines.moderation_hidden_at does not exist"}|400, donc p32 (moderation des annonces, 26 aout) est absente de la prod alors qu'elle ne cree aucune table et qu'aucun test d'existence de table ne pouvait la reveler ; (2) curl -X POST ".../rest/v1/rpc/admin_contact_unread_count" -d '{}' -> PGRST202|404 sur une fonction dont la sig…
```

**Impact métier** — Le chiffre « six migrations d'ecart » rassure a tort : l'ecart reel est d'au moins sept fichiers et, surtout, on ne sait toujours pas quels verrous de securite sont reellement en vigueur en production. La question a laquelle le comite doit repondre avant toute mise en service — « les protections que nous avons ecrites sont-elles actives sur la vraie base ? » — reste ouverte apres cet audit, alors que le rapport laisse croire qu'elle est fermee.


#### `MANQUE-02` — La reconstructibilite n'a ete traitee que pour le schema : les donnees n'existent nulle part ailleurs qu'en production et la sauvegarde est un chantier jamais fait

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |

**Preuve**

```
La dimension auditee est « la base est-elle reconstructible ? » et la reponse donnee est OUI, sur la seule foi de 58 migrations rejouees. Or le depot dit lui-meme que le volet donnees n'est pas traite : docs/OPERATIONS_SUPABASE.md, section « ## 2. Sauvegardes / PITR », s'ouvre par « ATTENTION Action manuelle requise (Supabase Dashboard) — non activable depuis le code : PITR (Point-In-Time Recovery) ... Necessite le plan Pro (ou +). Recommande : retention 7 jours minimum », puis propose un pg_dump hebdomadaire « a planifier, ex. cron sur un VPS ». Rien n'indique que l'une ou l'autre action ait ete faite. PROUVE qu'aucune n'est outillee dans le depot : `ls scripts/` -> comparer-bases.mjs, refactor, remediation, validate_agent_output.py, verifier-bundle.mjs, verifier-sql.mjs ; `grep -rn "pg_dump\|backup\|sauvegarde" scripts/ package.json` ne retourne aucun script de sauvegarde (seulement u…
```

**Impact métier** — 16 397 annonces, les comptes clients, les dossiers de transaction et l'historique des paiements n'existent qu'a un seul endroit. En cas d'incident, le schema revient en quelques minutes depuis git — ce que l'audit a brillamment prouve — et le metier ne revient pas du tout. Repondre OUI a « la base est-elle reconstructible ? » sans avoir regarde la sauvegarde des donnees est precisement le type de reassurance qui coute une entreprise. C'est, a mon sens, le point le plus important que ce contre-a…

