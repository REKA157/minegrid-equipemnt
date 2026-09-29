# MINEGRID — AUDIT DE SÉCURITÉ

**Date** : 2026-09-29 · **Méthode** : lecture des politiques RLS réelles + sondes en lecture
contre la production, en se comportant comme un utilisateur légitime cherchant à dépasser ses
droits. **Aucune écriture, aucune action destructrice.**

---

## Verdict : CONDITIONAL GO — la porte d'entrée tient, l'intérieur fuit

Un visiteur anonyme ne peut rien lire qu'il ne doive lire. En revanche, **une fois entré**, un
utilisateur légitime dispose de pouvoirs qu'il ne devrait pas avoir sur la chaîne
transactionnelle.

## Ce qui a été vérifié comme SOLIDE

```
$ grep -c service_role|sbp_|sk_live|sk_test|ANTHROPIC_API|PADDLE_API_KEY|RESEND_API  dist/assets/*.js
  → 0 sur les 8 motifs
```
**Aucun secret dans le paquet livré.** La clé anon présente est publique par construction.

```
pro_clients            200 []      (RLS filtre)
organizations          200 []      (RLS filtre)
organization_members   200 []      (RLS filtre)
transaction_cases      200 []      (RLS filtre)
quote_requests         200 []      (RLS filtre)
leads                  200 []      (RLS filtre)
platform_admins        401         (protégée)
promo_codes            401         (protégée)
machines               200 données (catalogue public — voulu)
```
**Aucune fuite de données vers l'anonyme.** Le durcissement RLS de juillet-août tient.

## L'exposition la plus grave, vérifiée personnellement

### `AO-06` — votre clé Anthropic est appelable avec la clé publique du site

```
POST .../functions/v1/renders-ai   {"action":"ping","payload":{}}
  sans aucune clé                     → 401  UNAUTHORIZED_NO_AUTH_HEADER
  avec la clé anon (publique)         → 200  {"ok":true,"model":"claude-opus-4-8","hasKey":true}
```

La fonction est déployée sous un nom **absent du dépôt** (`renders-ai`, alors que le dépôt
contient `tenders-ai`) : un déploiement manuel historique, jamais repris.

**Correction d'un énoncé** : l'audit initial parlait d'un proxy « ouvert sans authentification ».
C'est **FAUX** — sans clé, la passerelle Supabase renvoie 401. Ce qui est **PROUVÉ**, c'est que la
clé publique suffit, et qu'elle est lisible par quiconque ouvre le JavaScript du site.

**Piège de remédiation (`M-04`)** : le client n'envoie jamais le jeton de session à cette
fonction (`src/tenders/ai/aiService.ts:82-88`). Fermer la porte côté serveur sans corriger le
client basculerait 100 % des clients payants en « mode simulation ». Les deux corrections vont
ensemble.

---

## Les trois trous de la chaîne transactionnelle

Ils partagent une cause : `transaction_cases` et `transaction_participants` ont été ouvertes en
écriture directe aux utilisateurs authentifiés, et les correctifs existent dans le dépôt
(`p29`) mais **ne sont appliqués nulle part**.

#### `SEQ-01` — Le prix des annonces est stocke en TEXTE sans devise, et la chaine le convertit en MAD sans conversion

| | |
|---|---|
| **Sévérité** | P0 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `supabase/migrations/00000000000000_baseline.sql:3153 (type), :1062 et :1105-1112 (devise en dur), :1099-1101 et :1574-1577 (parsing du texte)` |
| **Table / API** | public.machines (price), public.transaction_cases (total_amount, currency), public.escrow_transactions (amount, currency), public.payment_records (amount, curr… |

La colonne machines.price est de type text et la table machines ne possede AUCUNE colonne de devise ; la devise reelle est enfouie dans le JSON specifications->>price_currency. Les deux fonctions serveur qui alimentent le montant du dossier (ensure_transaction_case_for_quote_request et open_case_escrow) extraient les chiffres du texte par expression reguliere puis ecrivent transaction_cases.total_amount avec currency = 'MAD' EN DUR. Aucune conversion de devise n'est faite. Le meme montant part ensuite dans escrow_transactions.amount et payment_records.amount. A titre de contre-exemple, la table price_observations (baseline:3290-3307) fait la meme chose correctement : price_amount numeric(14,2) NOT NULL + price_currency text NOT NULL + CHECK >= 0. L'equipe sait donc modeliser de l'argent ; machines.price est un vestige non corrige.

**Preuve**

```
1) Type de colonne — supabase/migrations/00000000000000_baseline.sql:3153 : ` "price" "text",` dans CREATE TABLE public.machines (aucune colonne currency dans toute la definition, lignes 3145-3180). 2) Devise en dur — baseline:1062 ` v_currency text := 'MAD';` puis baseline:1105-1112 `insert into public.transaction_cases (... total_amount, currency) values (... v_amount, v_currency)`. 3) Extraction depuis le texte — baseline:1099-1101 : `select nullif(regexp_replace(replace(m.price::text, ',', '.'), '[^0-9.]', '', 'g'), '')::numeric into v_amount from public.machines m where m.id = qr.machine_id limit 1;` (idem baseline:1574-1577 dans open_case_escrow). 4) Mesure en PRODUCTION (ref tnfbggrftmtxpgbcwqzo, cle anon) : curl -s -D - -o /dev/null -H "apikey: <ANON>" -H "Prefer: count=exact" -H "Range: 0-0" "https://tnfbggrftmtxpgbcwqzo.supabase.co/rest/v1/machines?select=id&specifications->>p…
```

**Reproduction** — 1. Ouvrir en production n'importe quelle annonce dont specifications->>price_currency vaut CNY, USD ou EUR (exemple machine 5b992e8e-b2ab-459e-85ac-c20837eeac0b, price="38821", CNY). 2. Etre connecte comme acheteur et envoyer une demande de prix sans renseigner budget_min/budget_max. 3. La RPC ensure_transaction_case_for_quote_request applique la branche de repli baseline:1099-1101 et cree le dos…

**Impact métier** — Le montant du dossier, du sequestre et de la facture de commission est faux d'un facteur 1 a 10 selon la devise d'origine, sur 100 % du catalogue (aucune annonce n'est en MAD). Sur une pelle a 120 000 EUR, le dossier ouvrirait un sequestre de 120 000 MAD, soit environ 11 000 EUR : l'acheteur paierait dix fois moins que le prix affiche, ou le vendeur reclamerait dix fois plus. Le jour de l'armement des paiements, chaque transaction est un litige potentiel.

**Impact sécurité** — Pas de fuite de donnees. Risque d'integrite financiere : un montant issu d'un champ texte libre n'est borne par aucune contrainte (ni CHECK > 0, ni precision, ni echelle), et le parsing par expression reguliere de '12.345.678' ou '1.234,56' produit silencieusement un nombre different du prix affiche.

**Cause racine** — machines a ete alimentee par un import de donnees externes (mascus, ironplanet, rbauction) qui recopie la chaine de prix telle quelle et range la devise dans un JSON libre, sans jamais normaliser. Le modele de donnees n'a jamais ete rattrape : la colonne price est restee text et aucune colonne currency n'a ete ajoutee, alors que price_observations…

**Correctif proposé** *(applicable sans risque sur le dépôt)* — Dans le depot uniquement : (1) ajouter une migration qui cree machines.price_amount numeric(14,2) et machines.price_currency text NOT NULL DEFAULT 'EUR' avec CHECK (price_amount >= 0), remplie depuis price et specifications->>price_currency ; (2) supprimer les deux branches de repli sur m.price (baseline:1099-1101 et :1574-1577) et les remplacer par la lecture de price_amount/price_currency ; (3) remplacer `v_currency text := 'MAD'` par la devis…

**Test de non-régression** — Pour une annonce dont price_currency = 'CNY' et price = '38821', ensure_transaction_case_for_quote_request doit produire un dossier dont currency = 'CNY' et total_amount = 38821.00 ; et aucune ligne de transaction_cases ne doit porter currency = 'MAD' lorsque la machine liee a une devise d'origine differente.


#### `SEQ-04` — Le sequestre n'existe pas : aucun prestataire de paiement, fonctions serveur absentes de la production

| | |
|---|---|
| **Sévérité** | P0 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `src/nextgen/escrow/escrowService.ts:46-50 et :59 ; supabase/migrations/00000000000000_baseline.sql:1552-1605 et :2694 ; supabase/functions/ (create-escrow absente)` |
| **Table / API** | public.escrow_transactions, public.escrow_events, public.payment_records ; Edge Functions create-escrow (inexistante) et escrow-webhook (404) |

A la question « ou est l'argent, qui peut le liberer, sous quelle condition », la reponse verifiee est : nulle part, personne, jamais. Les tables escrow_transactions et payment_records existent bien en production et sont protegees, mais rien ne peut y faire entrer de l'argent. La creation d'un sequestre passe par l'Edge Function create-escrow, qui n'existe meme pas dans le depot ; le financement et la liberation passent par escrow-webhook, present dans le depot mais NON DEPLOYE. La seule voie serveur reellement presente en production (open_case_escrow, baseline:1552) cree un escrow en statut 'created', explicitement non finance, et un payment_record en 'awaiting_partner' — un marqueur, pas un mouvement de fonds.

**Preuve**

```
Etat de deploiement mesure en production : for f in escrow-webhook create-payment stripe-webhook recompute-trust-score send-email ai-proxy; do curl -s -o /dev/null -w "%{http_code}" "https://tnfbggrftmtxpgbcwqzo.supabase.co/functions/v1/$f"; done -> escrow-webhook 404 | create-payment 404 | stripe-webhook 404 | recompute-trust-score 404 | send-email 404 | ai-proxy 401 (401 = deployee et protegee ; 404 = absente) Absence dans le depot — ls supabase/functions/ : ai-proxy, create-payment, delete-account, escrow-webhook, exchange-rates, paddle-cancel, paddle-upgrade, paddle-webhook, recompute-trust-score, send-contact-email, send-email, stripe-webhook, tenders-ai. Il n'y a PAS de create-escrow, alors que src/nextgen/escrow/escrowService.ts:59 l'invoque : `const { data, error } = await supabase.functions.invoke('create-escrow', { body: input });` Aveu dans le code — src/nextgen/escrow/escrow…
```

**Reproduction** — 1. curl -s -o /dev/null -w "%{http_code}" https://tnfbggrftmtxpgbcwqzo.supabase.co/functions/v1/escrow-webhook -> 404. 2. Chercher supabase/functions/create-escrow : le dossier n'existe pas. 3. Ouvrir un dossier et appeler open_case_escrow : l'escrow nait en statut 'created' et aucun evenement ne peut jamais le faire passer a 'funded', puisque le seul emetteur de cet evenement est escrow-webhook,…

**Impact métier** — La promesse centrale de la plateforme — « achetez en confiance, l'argent est sequestre » — n'est tenue par aucun mecanisme. Aucune transaction ne peut etre encaissee, donc aucune commission ne peut etre percue sur la vente de machines. Si l'interface laissait croire le contraire a un acheteur, la plateforme s'exposerait a une accusation de tromperie. A son credit, l'interface ne le laisse PAS croire : le bouton est grise et explique pourquoi (cf. ce_qui_marche).

**Impact sécurité** — Aucune faille exploitable aujourd'hui, precisement parce que rien n'est branche. Le risque est differe : le jour de l'armement, les invariants financiers (montant, devise, beneficiaire, conditions de liberation) ne sont controles que par p7e, qui n'est pas deploye — un evenement PSP signe mais errone passerait sans controle.

**Cause racine** — Le produit a ete construit de l'interface vers l'infrastructure : les ecrans, les tables et les machines a etats du sequestre ont ete ecrits avant qu'un prestataire de paiement soit choisi et contractualise. Le choix du PSP est un prealable commercial (Stripe refuse le Maroc) qui n'a pas ete tranche, et tout le reste attend.

**Correctif proposé** — Aucun correctif technique ne peut etre applique sur le depot : il s'agit d'une decision produit. A faire dans l'ordre : (1) choisir et contractualiser un prestataire de sequestre operant au Maroc ; (2) ecrire create-escrow selon son contrat ; (3) deployer p7e AVANT d'ouvrir le moindre flux, pour que montant, devise, beneficiaire et conditions de liberation soient verifies cote base ; (4) tester de bout en bout sur le projet de staging (vrouxqofm…

**Test de non-régression** — Tant qu'aucun PSP n'est connecte, une assertion doit garantir que la plateforme ne peut pas afficher qu'un paiement est sequestre : aucune ligne de escrow_transactions ne doit pouvoir atteindre les statuts 'funded' ou 'released' (select count(*) from escrow_transactions where status in ('funded','released') = 0), et l'interface du dossier ne doit …


#### `SEQ-05` — 83,7 % des annonces portent un vendeur fictif ; le filtre existe cote TypeScript mais PAS cote SQL

| | |
|---|---|
| **Sévérité** | P0 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `supabase/migrations/00000000000000_baseline.sql:1075-1081 (SQL sans filtre) contre src/pages/machineDetailHelpers.ts:44-63 (TypeScript avec filtre) ; origine services/monitor-service/app/ingestion/ma…` |
| **Table / API** | public.machines (sellerid, seller_id, user_id, owner_id), public.transaction_cases (seller_user_id), public.quote_requests (seller_id), RPC ensure_transaction_… |

L'import automatique des annonces attribue a chaque machine un vendeur factice, la constante MASCUS_SYSTEM_SELLER_ID = '00000000-0000-0000-0000-000000000001'. Le frontend connait ce piege et le neutralise : resolveSellerUuidFromMachineRecord refuse explicitement les UUID de remplissage, donc quote_requests.seller_id est laisse a NULL. Mais la fonction serveur ensure_transaction_case_for_quote_request, quand seller_id est NULL, retourne lire la machine directement avec `coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id)` — SANS le filtre anti-placeholder. Elle recupere donc l'UUID fictif et tente de creer un dossier dont le vendeur est ce fantome, et d'ecrire ce fantome dans quote_requests.seller_id. Le meme controle de securite existe donc a deux endroits avec deux regles differentes : c'est une rupture de chaine au sens strict.

**Preuve**

```
Mesure en PRODUCTION (ref tnfbggrftmtxpgbcwqzo, cle anon) : curl -s -D - -o /dev/null -H "apikey: <ANON>" -H "Prefer: count=exact" -H "Range: 0-0" "https://tnfbggrftmtxpgbcwqzo.supabase.co/rest/v1/machines?select=id&sellerid=eq.00000000-0000-0000-0000-000000000001" -> Content-Range: 0-0/13717 (sur 16397 annonces, soit 83,7 %) Origine — services/monitor-service/app/ingestion/machine_upsert.py:17 : `MASCUS_SYSTEM_SELLER_ID = "00000000-0000-0000-0000-000000000001"` et :44 `seller_id: str = MASCUS_SYSTEM_SELLER_ID,` (valeur par defaut de la fonction d'ingestion). Filtre cote TypeScript — src/pages/machineDetailHelpers.ts:44-51 : `export const PLACEHOLDER_SELLER_IDS = new Set(['00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000001']);` et :54-63 resolveSellerUuidFromMachineRecord -> `if (uuid && !isPlaceholderSellerUuid(uuid)) return uuid;` (renvoie null sinon). Appele …
```

**Reproduction** — 1. Choisir en production une annonce issue de l'import (source='mascus'), par exemple 5b992e8e-b2ab-459e-85ac-c20837eeac0b : ses quatre colonnes vendeur valent 00000000-0000-0000-0000-000000000001. 2. Connecte comme acheteur, envoyer une demande de prix : le frontend met seller_id a NULL (filtre TS). 3. Appeler ensure_transaction_case_for_quote_request sur ce devis : la branche baseline:1075-1081…

**Impact métier** — Dans les deux issues possibles, 83,7 % du catalogue ne peut pas produire de transaction utile. Soit la creation du dossier echoue en silence (le client TypeScript convertit l'erreur SQL en `reason: 'error'` et l'interface affiche « Action impossible pour le moment »), et l'acheteur ne comprend pas pourquoi sa demande n'aboutit jamais ; soit le dossier est cree avec un vendeur qui n'a pas de boite de reception, donc personne ne repond, personne n'inspecte, personne ne cloture. Sur 13 717 annonce…

**Impact sécurité** — Un identifiant de vendeur non contraint (aucune cle etrangere sur machines.sellerid) et non filtre cote serveur signifie que la resolution du vendeur d'un dossier depend d'une donnee d'import non validee. Si ce compte de remplissage venait a exister un jour, il deviendrait de facto partie prenante de milliers de dossiers, avec les droits de lecture correspondants.

**Cause racine** — Le meme controle metier a ete implemente deux fois, a deux couches, sans source unique : le frontend a ete rattrape (ajout de PLACEHOLDER_SELLER_IDS) alors que la branche de repli SQL, ecrite plus tot, n'a jamais ete alignee. Plus en amont, le pipeline d'ingestion inscrit une valeur de remplissage dans une colonne qui sert de cle metier, sans cont…

**Correctif proposé** *(applicable sans risque sur le dépôt)* — Dans le depot : (1) dans ensure_transaction_case_for_quote_request (baseline:1075-1081), exclure explicitement les UUID de remplissage — `and m.sellerid not in ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000001')` sur chaque colonne du coalesce — et retourner NULL plutot que de lever une exception, pour que l'interface puisse afficher un message clair ; (2) faire porter la liste des UUID interdits par une seule source …

**Test de non-régression** — Pour un devis portant sur une machine dont toutes les colonnes vendeur valent un UUID de remplissage, ensure_transaction_case_for_quote_request doit renvoyer NULL sans lever d'exception, et aucune ligne de transaction_cases ne doit jamais porter seller_user_id in ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000001').


#### `CTR-01` — Le montant, la devise et le statut du dossier sont écrits DIRECTEMENT par le client à la création — p3 ne protège que l'UPDATE

| | |
|---|---|
| **Sévérité** | P0 |
| **Niveau de preuve** | PROUVE (lecture). 1) Droits : `GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE ON TABLE "public"."transaction_cases" TO "authenticated";` (00000000000000_baseline.sql:7533) — p3 (20260702090400_p3_restrict_transaction_cases_update.sql:21-22) ne révoque QUE l'UPDATE et ne reconcède que title/notes/priority ; l'INSERT n'est pas touché, l'en-tête de p3 le dit explicitement : « Le parcours devis->dossier (INSERT) n'est pas touché ». 2) Policy : `CREATE POLICY "transaction_cases_insert" ... WITH CHECK ((seller_user_id = auth.uid()) OR (buyer_user_id = auth.uid() AND seller_user_id IS NOT NULL AND seller_user_id <> auth.uid()))` (baseline:6405) — elle contrôle QUI sont les parties, jamais total_amount, currency ni status. 3) Ce n'est pas théorique, c'est le chemin nominal du produit : `supabase.from('transaction_cases').insert({ kind, status: 'draft', ..., total_amount: opts.amount ?? null, currency: opts.currency ?? 'MAD' })` (src/utils/api/quoteRequests.ts:159-172), appelé en premier par submitQuoteRequest (quoteRequests.ts:300-306) ; la RPC SECURITY DEFINER n'est qu'un REPLI si cet INSERT échoue (quoteRequests.ts:310-313). |

**Preuve**

```
baseline:7533 + baseline:6405 + src/utils/api/quoteRequests.ts:159-172
```

**Impact métier** — Tout utilisateur authentifié peut POSTer /rest/v1/transaction_cases avec le montant de son choix, la devise de son choix, et n'importe lequel des dix statuts autorisés par la contrainte — y compris 'payment', 'delivery' ou 'closed'. Il peut aussi désigner comme vendeur n'importe quel compte réel, qui se retrouve partie d'un dossier qu'il n'a jamais accepté (le trigger trg_tx_cases_seed_participants l'y inscrit avec accepted_at renseigné). Le verrou p3, présenté par le premier auditeur comme « l…


#### `CTR-02` — Le vendeur peut SUPPRIMER le dossier : la cascade détruit commissions, paiements et rapports d'inspection

| | |
|---|---|
| **Sévérité** | P0 |
| **Niveau de preuve** | PROUVE (lecture). Policy : `CREATE POLICY "transaction_cases_delete" ON "public"."transaction_cases" FOR DELETE TO "authenticated" USING (("seller_user_id" = (SELECT auth.uid())));` (baseline:6401), assortie du droit DELETE (baseline:7533). Aucune condition d'état : un dossier 'payment', 'delivery' ou 'closed' est supprimable. Cascades attachées : commission_records ON DELETE CASCADE (baseline:5060), payment_records ON DELETE CASCADE (baseline:5310), inspection_reports ON DELETE CASCADE (baseline:5170), inspection_requests ON DELETE CASCADE (baseline:5185), customs_cases (5080), financing_requests (5150), logistics_tasks (5250), broker_cases (5045) ; escrow_transactions passe en ON DELETE SET NULL (baseline:5135) et devient orpheline. Le correctif existe et n'est appliqué nulle part : 20260814120000_p29_remediation_audit_consolide.sql:104-105 (`drop policy ... transaction_cases_delete` + `revoke delete ... from authenticated, anon`) et le trigger de garde _tc_guard_delete (p29:107-134) ; l'en-tête de p29 nomme ce défaut « R-01 : DELETE direct sur transaction_cases -> cascade destructrice ». Aucune trace de p29 dans .audit/APPLY_IN_PROD.sql (les 18 lots inclus y sont listés : p3, p8 à p24 ; p29 n'y est pas). |

**Preuve**

```
baseline:6401 + baseline:7533 + baseline:5060/5310/5170/5185
```

**Impact métier** — Un vendeur mécontent d'un rapport d'inspection défavorable, ou souhaitant échapper à la commission de la plateforme, supprime son dossier d'un appel REST et efface du même coup la ligne de commission (revenu MineGrid), le rapport d'inspection (l'artefact de confiance vendu au marché) et l'historique de paiement. C'est une destruction de piste d'audit et de revenu à l'initiative de la partie qui y a intérêt, accessible aujourd'hui par l'API publique. Le premier auditeur a classé le verrouillage …


#### `CTR-03` — Prédicat tautologique dans la policy des participants : un courtier d'un dossier s'ajoute à N'IMPORTE QUEL dossier

| | |
|---|---|
| **Sévérité** | P0 |
| **Niveau de preuve** | PROUVE (lecture). La policy `transaction_participants_insert` (baseline:6467) est un OR de quatre branches. La quatrième s'écrit : `EXISTS (SELECT 1 FROM "public"."transaction_participants" "p" WHERE (("p"."case_id" = "p"."case_id") AND ("p"."user_id" = (SELECT auth.uid())) AND ("p"."revoked_at" IS NULL) AND ("p"."role" = ANY (ARRAY['broker','admin_delegate']))))`. Le prédicat `p.case_id = p.case_id` est une tautologie : il ne rattache la vérification à AUCUN dossier. La condition se réduit donc à « l'appelant est courtier ou délégué sur au moins un dossier quelque part ». Les droits sont ouverts : `GRANT ALL ON TABLE "public"."transaction_participants" TO "authenticated"` (baseline:7569). Et la lecture suit automatiquement : `can_access_transaction_case` (baseline, fonction SECURITY DEFINER) renvoie vrai dès qu'il existe une ligne transaction_participants avec user_id = appelant et revoked_at is null. L'équipe a identifié ce défaut : p29 le nomme « RLS-01 : prédicat TAUTOLOGIQUE `p.case_id = p.case_id` -> une fois la récursion levée naïvement, tout broker deviendrait partie de N'IMPORTE QUEL dossier » et le corrige (p29:40-100) — p29 n'est appliqué nulle part. La même policy est en outre récursive (elle interroge transaction_participants depuis une policy de transaction_participants), défaut « NEW-01 » de p29, ce qui peut faire échouer l'INSERT avec « infinite recursion detected in policy » selon l'ordre d'évaluation du OR — c'est d'ailleurs ce que documente le commentaire de quoteRequests.ts:180-188. |

**Preuve**

```
baseline:6467-6474, dernière branche : `EXISTS (SELECT 1 FROM transaction_participants p WHERE p.case_id = p.case_id AND p.user_id = auth.uid() ...)`
```

**Impact métier** — Fuite de données clients entre dossiers. Un courtier légitimement invité sur un seul dossier peut s'inscrire lui-même sur tous les autres et lire montants, identités acheteur/vendeur, documents, messages et événements de dossiers de tiers. C'est le type même de défaut qui doit être classé P0 (confidentialité client), et il est indépendant de l'absence de séquestre : il mord dès qu'il existe deux dossiers et un courtier. Je n'ai pas pu l'exécuter (règle de lecture seule : l'exploiter demanderait…


---

## Autres problèmes de sécurité et de droits (P1)

| ID | Sév. | Preuve | Problème |
|---|---|---|---|
| `RLS-01` | P1 | PROUVE | Fuite inter-locataires : tout utilisateur connecte lit les locations, factures et interventions de TOUS les l… |
| `SEQ-06` | P1 | PROUVE | L'etape « confiance » n'existe pas en base de production : ce sont des ecrans devant le vide |
| `SEQ-07` | P1 | PROUVE | En production, le vendeur peut etre son propre inspecteur et declarer l'inspection terminee |
| `SEQ-08` | P1 | PROUVE | Le journal du dossier est falsifiable en production : un participant peut ecrire un evenement systeme sans ac… |
| `SEQ-15` | P1 | PROUVE | En production, les transitions d'etat du dossier ne sont controlees ni en ordre ni en role |
| `CTR-04` | P1 | PROUVE (lecture). `can_access_transaction_case(p_case_id, p_uid)` (00000000000000_baseline.sql, fonction SQL STABLE SECURITY DEFINER) renvoie vrai si l'appelant est vendeur/acheteur OU s'il existe une ligne transaction_participants non révoquée. La colonne accepted_at n'est jamais testée. Or `assign_transaction_partner` (baseline:391-401) permet à un principal d'ajouter n'importe quel utilisateur existant par son e-mail, avec invited_at renseigné et accepted_at nul. Cette fonction pilote ensuite l'accès en lecture de presque toute la chaîne : transaction_cases_select (baseline:6409), transaction_events_select (baseline:6451), transaction_participants_select (baseline:6479), inspection_req_select (5888), inspection_rep_select (5877), transaction_tasks_access (6489), transaction_messages_access (6459). L'équipe l'a identifié : p29 en-tête, « R-02 : can_access_transaction_case ignore accepted_at -> un participant invité mais jamais accepté lit tout le dossier », corrigé p29:145-177 avec accept/decline_transaction_invitation (p29:179-254) — non appliqué. | Un partenaire invité mais jamais acceptant lit l'intégralité du dossier |
| `CTR-05` | P1 | PROUVE (lecture croisée). Le dépôt contient bien un filtre du vendeur fantôme, à deux endroits : `PLACEHOLDER_SELLER_IDS` + `isPlaceholderSellerUuid` + `resolveSellerUuidFromMachineRecord` (src/pages/machineDetailHelpers.ts:44-61) et la même fonction côté serveur dans supabase/functions/send-contact-email/index.ts:96-101. Mais le parcours devis ne les utilise pas : src/utils/api/quoteRequests.ts n'importe que supabaseClient, supabaseCall et logger (lignes 1-3) ; sa résolution de vendeur passe par `parseSellerUuid` (quoteRequests.ts:69-78), qui ne fait QUE valider le format UUID par expression régulière et accepte donc 00000000-0000-0000-0000-000000000001 ; `fetchSellerUserIdFromMachine` (quoteRequests.ts:131+, appelée ligne 251) l'utilise telle quelle. Côté base, même absence de filtre : `coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id)` dans ensure_transaction_case_for_quote_request (baseline:1076-1079). Rappel de volume : 13 717 annonces portent ce seller_id (mesure production ci-dessus). | Le parcours devis -> dossier ne filtre PAS le vendeur fantôme du scraper, alors que l'envoi de mail le filtre |
| `CTR-06` | P1 | PROUVE (lecture) pour l'existence dans la baseline ; TRES PROBABLE pour la présence effective en production (la baseline EST le dump du schéma de production, les tables escrow_transactions et escrow_events y répondent 200, et je me suis interdit l'appel POST qui l'aurait prouvé car il écrirait). La fonction `open_case_escrow(p_case_id uuid)` (baseline:1552) est SECURITY DEFINER, propriétaire postgres, `GRANT ALL ... TO anon / authenticated` (baseline:7051-7053). Elle contrôle uniquement que l'appelant est vendeur ou acheteur, puis (a) si le dossier n'a pas de montant, elle EXECUTE `update public.transaction_cases set total_amount = (select nullif(regexp_replace(replace(m.price::text, ',', '.'), '[^0-9.]', '', 'g'), '')::numeric from public.machines m ...), currency = coalesce(v_case.currency, 'MAD')` (baseline:1571-1579), et (b) elle insère dans public.escrow_transactions (baseline:1592-1597) avec `coalesce(v_case.currency, 'MAD')`. | open_case_escrow est en base, ouvert à toute partie, écrit la table monétaire du séquestre et réécrit le mont… |
| `CTR-07` | P1 | PROUVE (lecture). Le premier auditeur cite le bouton grisé de TransactionCasePage.tsx:122-128 (« Séquestre — activation opérateur requise », disabled) et en conclut que « l'interface ne ment PAS sur le séquestre ». Il n'a pas lu les vingt lignes au-dessus. STEP_ACTIONS (TransactionCasePage.tsx:64-70) contient cinq entrées, dont `{ step: 'payment', label: 'Préparer le séquestre (après inspection)' }` (ligne 69). Ces cinq boutons sont rendus lignes 110-118 avec `disabled={pending !== null}` — c'est-à-dire actifs. Le clic appelle advanceTransactionCaseStep(caseId, 'payment') (ligne 84) -> RPC advance_transaction_case_step, dont la version DE PRODUCTION (baseline:282-318) pose `v_new_status := 'payment'` puis `update public.transaction_cases set status = 'payment'` (baseline:311-315) sans aucun contrôle d'ordre ni de rôle au-delà de _tc_is_party. En amont, create_payment_step (baseline) insère une ligne payment_records en 'awaiting_partner' avec le montant du dossier. La mention « (après inspection) » du libellé n'est enforcée nulle part en production (c'est exactement SEQ-15). | Le bouton « Préparer le séquestre » est ACTIF et fait basculer le dossier en statut 'payment' sans qu'un cent… |

## Détail des P1 les plus structurants

#### `RLS-01` — Fuite inter-locataires : tout utilisateur connecte lit les locations, factures et interventions de TOUS les loueurs

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `supabase/migrations/00000000000000_baseline.sql:6315, :6296, :5931 (correctif non applique : supabase/migrations/20260702090200_p3_rls_loueur_tenant_isolation.sql:16-33)` |
| **Table / API** | public.rentals, public.rental_invoices, public.interventions (API PostgREST /rest/v1/rentals, /rest/v1/rental_invoices, /rest/v1/interventions) |

En production, les policies de lecture de rentals, rental_invoices et interventions sont USING (auth.role() = 'authenticated') : elles n'exigent aucune appartenance, seulement d'etre connecte. N'importe quel compte gratuit lit donc les contrats de location, les montants dus, les noms de clients et les interventions de tous les autres loueurs de la plateforme. Le correctif (created_by = auth.uid()) existe dans le depot depuis le 2 juillet 2026 mais n'a jamais ete pousse : il n'est PAS dans le bundle .audit/APPLY_IN_PROD.sql applique le 2026-07-16 (grep -c 'rentals' .audit/APPLY_IN_PROD.sql -> 0), et le dump reel de la prod contient encore les policies fautives.

**Preuve**

```
1) Le dump du schema REEL de la prod (commit 4b5fdea5 'baseline schema reel de la prod') contient : supabase/migrations/00000000000000_baseline.sql:6315 CREATE POLICY "rentals_select_auth" ON "public"."rentals" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text")); idem :6296 rental_invoices_select_auth et :5931 interventions_select_auth. 2) grep -niE "rentals|interventions|rental_invoices" .audit/APPLY_IN_PROD.sql -> AUCUNE ligne. 3) Rejeu du dump dans un PostgreSQL jetable (docker run postgres:16-alpine), base 'prod2' = baseline + p25 + p26, puis balayage de lecture sous le role authenticated avec un utilisateur qui ne possede AUCUNE ligne (44444444-4444-4444-4444-444444444444) : 'select * from public.__audit_sweep(...)' renvoie interventions=1, rental_invoices=1, rentals=1 lignes lisibles alors que toutes appartiennent a 11111111-1111-1111-1111-111111111111. Temoin negatif :…
```

**Reproduction** — 1) docker run -d --name x -e POSTGRES_PASSWORD=test -e POSTGRES_DB=t postgres:16-alpine ; 2) charger les stubs auth.uid()/auth.role() puis supabase/migrations/00000000000000_baseline.sql ; 3) inserer une location appartenant a l'utilisateur A ; 4) set role authenticated + set_config('request.jwt.claim.sub','<uuid de B>') + set_config('request.jwt.claim.role','authenticated') ; 5) select count(*) …

**Impact métier** — Un concurrent qui cree un compte gratuit telecharge le carnet de commandes de tous les loueurs : clients, montants factures, impayes, planning d'interventions. Fuite RGPD (noms de clients professionnels) et renseignement concurrentiel direct. C'est le type de fuite qui fait perdre un client entreprise du jour au lendemain.

**Impact sécurité** — Violation de confidentialite inter-locataires (OWASP A01 Broken Access Control). Aucune elevation de privilege necessaire : un simple compte connecte suffit.

**Cause racine** — Les policies viennent des scripts historiques archive/sql-historique/sql/deploy_rentals_loueur.sql:31-32 et deploy_loueur_recouvrement.sql:46-47 qui posaient deliberement auth.role()='authenticated'. L'isolation etait faite cote API seulement. Le correctif a ete ecrit en juillet mais le bundle de remediation pousse en prod (.audit/APPLY_IN_PROD.sq…

**Correctif proposé** *(applicable sans risque sur le dépôt)* — Appliquer supabase/migrations/20260702090200_p3_rls_loueur_tenant_isolation.sql tel quel en production. Il est idempotent : il DROP rentals_select_auth / interventions_select_auth / rental_invoices_select_auth puis recree des policies SELECT TO authenticated USING (created_by = auth.uid()). Verifie sur base jetable : apres application, le balayage sous l'utilisateur 44444444 ne voit plus aucune de ces trois tables.

**Test de non-régression** — Avec deux comptes loueurs A et B et une location creee par A : la requete select count(*) from public.rentals executee sous l'identite de B doit renvoyer 0 ; la meme requete sous l'identite de A doit renvoyer 1. Idem pour rental_invoices et interventions.

