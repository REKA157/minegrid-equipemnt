# MINEGRID — APPEL D'OFFRES / RFQ : APTITUDE À LA PRODUCTION

**Date** : 2026-09-29 · **Périmètre** : `src/tenders/` (38 fichiers, 11 397 lignes), `quote_requests`, chaîne transactionnelle

---

# Verdict : **NO-GO** — et pas pour la raison attendue

Le cahier des charges demande de vérifier qu'une entreprise peut « lancer des appels d'offres et
recevoir des offres fournisseurs ».

**Le module MineGrid « Appels d'offres » fait l'inverse : il aide une entreprise à RÉPONDRE à un
appel d'offres lancé par quelqu'un d'autre.**

Ce n'est pas un défaut à corriger. C'est un module qui résout un autre problème — correctement,
d'ailleurs. Le moteur décrit dans le cahier des charges est un développement à faire.

## La preuve, en trois lignes

```
src/tenders/pages/TenderNew.tsx:148
    <Field label="Acheteur / maître d'ouvrage" required>
      placeholder="Ex. : Commune de Bouskoura"
```

L'acheteur est **quelqu'un d'autre**. L'utilisateur MineGrid est le soumissionnaire.

```
$ grep -niE "interface (Bid|Offer|Proposal|Soumission)|supplier" src/tenders/types.ts
    (aucun résultat)
```

Aucune notion d'offre fournisseur, nulle part.

Les onglets d'un dossier le confirment : `DceAnalysisTab`, `RequirementsTab`, `GoNoGoTab`,
`StrategyTab`, `MemoTab`, `DocsTab`, `TasksTab`. Ce sont les artefacts d'un **soumissionnaire** :
dépouiller un DCE, tracer les exigences du CCTP/CCAP/RC, décider go/no-go, rédiger un mémoire
technique.

---

## Architecture actuelle

```
Navigateur
  └── src/tenders/  (React + zustand)
        ├── store/tendersStore.ts  ──── persist(localStorage)
        │                               clé « minegrid-tenders-store »
        ├── store/tendersSync.ts   ──── OPTIONNEL : table tender_workspaces
        │                               → ABSENTE en production (404 PGRST205)
        └── ai/aiService.ts        ──── Edge Function « renders-ai »
                                        → déployée sous un nom absent du dépôt
```

### Où vivent les données : dans le navigateur

`src/tenders/store/tendersStore.ts:94,310` — `zustand/persist`, clé `minegrid-tenders-store`.

Le module de partage `tendersSync.ts` existe, mais :
- il est opt-in… **et l'option est ACTIVÉE dans la configuration de production**
  (`.env.production:32  VITE_TENDERS_SHARED=true`) — correction apportée par la contre-analyse,
  mon premier constat sur ce point était faux ;
- il repose sur la table `tender_workspaces`, **vérifiée absente en production** ;
- il est documenté « dernière écriture gagnante au niveau société » — deux collègues qui
  travaillent en même temps s'écrasent.

**Conséquence en production aujourd'hui** : chaque collaborateur travaille sur sa copie, dans son
navigateur. Vider le cache efface le travail. Rien n'est partagé. Aucun fournisseur ne peut rien
déposer.

> ⚠️ **Correction issue de la contre-analyse — piège de déploiement.**
> Le partage étant activé dans `.env.production` alors que la RPC
> `get_my_tender_workspace` n'existe pas en base (`PGRST202`), le paquet actuel ne « reste » pas
> en mode local : il tombe en mode **erreur**, et `TendersShell.tsx:167-176` affiche un bandeau
> rouge permanent « Vos modifications ne sont PAS partagées ». Déployer en l'état **dégrade**
> l'expérience des clients du module au lieu de l'améliorer.
> Remède : soit remettre `VITE_TENDERS_SHARED=false`, soit appliquer la migration qui crée
> `tender_workspaces` — **avant** de téléverser.

---

## Modèle de données actuel vs. modèle cible

Les 27 concepts d'un moteur d'appel d'offres industriel, confrontés à l'existant :

| Concept cible | État | Où |
|---|---|---|
| TENDER | **partiel** — objet local, sans propriétaire ni organisation | `types.ts` |
| ORGANISATION ACHETEUSE | **implicite** — champ texte libre `buyer` | `TenderNew.tsx:36` |
| LOTS | **ABSENT** | — |
| ARTICLES / QUANTITÉS | **ABSENT** | — |
| SPÉCIFICATIONS TECHNIQUES | **partiel** — exigences extraites d'un DCE reçu, pas rédigées | `RequirementsTab` |
| EXIGENCES COMMERCIALES | **ABSENT** | — |
| DOCUMENTS | **partiel** — documents *produits*, pas *publiés aux fournisseurs* | `DocsTab` |
| FOURNISSEURS INVITÉS | **ABSENT** | — |
| DATE LIMITE | **partiel** — champ `deadline`, aucune contrainte serveur | `TenderNew.tsx:39` |
| DEVISE | existe (champ) | `TenderNew.tsx:41` |
| LIEU DE LIVRAISON | **ABSENT** | — |
| INCOTERM | **ABSENT** | — |
| CONDITIONS DE PAIEMENT | **ABSENT** | — |
| QUESTIONS / RÉPONSES / ADDENDA | **ABSENT** | — |
| **OFFRE (BID)** | **ABSENT** | — |
| VERSION D'OFFRE | **ABSENT** | — |
| LIGNES D'OFFRE | **ABSENT** | — |
| RÉPONSE TECHNIQUE / COMMERCIALE | **ABSENT** | — |
| PIÈCES JOINTES D'OFFRE | **ABSENT** | — |
| CONFORMITÉ | **partiel** — matrice de conformité du soumissionnaire | `RequirementsTab` |
| CRITÈRES D'ÉVALUATION | **partiel** — `AwardCriterion` saisi à titre informatif | `TenderNew.tsx:43` |
| NOTATION | **partiel** — go/no-go pour soi-même | `lib/scoring.ts` |
| ATTRIBUTION / REJET | **ABSENT** | — |
| ÉVÉNEMENTS D'AUDIT | **partiel** — `HistoryEntry` en localStorage, falsifiable | `types.ts` |

**Bilan : 0 des 8 concepts qui font un moteur d'appel d'offres** (lots, invitations, offres,
versions, scellement, notation comparative, attribution, journal inviolable) n'existe.

---

## Machine à états : inexistante

Les statuts sont des chaînes de caractères dans un objet JavaScript en `localStorage`. Il n'y a
ni contrainte SQL, ni fonction serveur, ni vérification de transition. Un utilisateur peut, en
ouvrant les outils de développement de son navigateur, écrire n'importe quel statut.

La question « un client peut-il passer de BROUILLON à ATTRIBUÉ ? » n'a pas de sens ici : il n'y a
pas de serveur à contourner.

## Date limite : non opposable

Il n'existe aucune clôture serveur. La `deadline` est une donnée d'affichage.

## Secret des offres : sans objet

Il n'y a pas d'offres.

---

## Les deux P0 propres au module

### `M-01` — poste partagé : le classeur du collègue reste lisible après déconnexion

Les données étant dans `localStorage`, elles **ne sont pas effacées à la déconnexion**. Sur un
poste partagé — cas courant dans une PME du BTP — le collaborateur suivant ouvre le module et lit
la stratégie commerciale, les prix et le go/no-go du précédent.

### `M-02` — appliquer les migrations « prêtes » viderait l'espace de travail

Piège de remédiation majeur : activer le partage (`tender_workspaces`) fait que
`tendersSync.ts` **hydrate le store depuis la société**, donc remplace le cache local. Si la
table est créée vide et que le partage est activé avant toute sauvegarde, le travail local de
chaque utilisateur est écrasé par un espace vide.

Le code s'en protège partiellement (la sauvegarde n'est armée qu'après une hydratation réussie),
mais le contre-audit signale (`M-05`) que ce verrou est **muet à l'écran** : l'utilisateur ne sait
pas s'il est en mode local ou partagé.

---

# Proposition : un Tender Core minimal mais réel

Ce qui suit est une **proposition d'architecture**, pas du code livré. Elle est dimensionnée pour
le besoin réel de MineGrid — mettre un acheteur en face de plusieurs vendeurs d'engins — et non
pour reproduire un logiciel d'achat public.

## Modèle de données

```
tenders                  id, org_id, titre, description, devise, lieu_livraison,
                         incoterm, conditions_paiement, statut, deadline (timestamptz),
                         mode (ouvert|scelle), created_by, created_at
tender_lots              id, tender_id, numero, intitule, description
tender_items             id, lot_id, designation, quantite, unite, specifications (jsonb)
tender_documents         id, tender_id, lot_id?, chemin_storage, nom, visibilite
tender_invitations       id, tender_id, supplier_org_id, invited_at, responded_at, statut
tender_questions         id, tender_id, supplier_org_id, question, posee_at
tender_answers           id, question_id, reponse, publique (bool), repondue_at
tender_addenda           id, tender_id, numero, contenu, publie_at

bids                     id, tender_id, supplier_org_id, statut, version_courante,
                         submitted_at, submitted_by
bid_versions             id, bid_id, numero, cree_at, cree_par, gel (bool)
bid_items                id, bid_version_id, tender_item_id, prix_unitaire numeric(14,2),
                         delai_jours, commentaire
bid_documents            id, bid_version_id, chemin_storage, nom

evaluation_criteria      id, tender_id, libelle, poids numeric, type (prix|delai|technique|…)
bid_scores               id, bid_id, criterion_id, note numeric, commentaire, note_par, note_at
tender_awards            id, tender_id, lot_id, bid_id, motif, attribue_par, attribue_at,
                         transaction_case_id  UNIQUE(tender_id, lot_id)
tender_events            id, tender_id, acteur, action, ressource, detail jsonb, at
                         → table IMMUABLE (triggers BEFORE UPDATE/DELETE/TRUNCATE)
```

**Points non négociables du schéma :**
- les montants en `numeric(14,2)`, **jamais** en `text` ni en flottant ;
- `UNIQUE(tender_id, lot_id)` sur `tender_awards` : c'est **cette contrainte** qui rend
  l'attribution idempotente et empêche deux clics de créer deux dossiers ;
- `tender_events` immuable par trigger, pas seulement par politique RLS (un trigger s'applique
  aussi au `service_role`).

## Machine à états, imposée côté base

```
BROUILLON → PUBLIE → OUVERT → CLOS → EVALUATION → ATTRIBUE → TRANSACTION_CREEE → TERMINE
                ↘ ANNULE                      ↘ REOUVERT (trace, motif obligatoire)
```

Implémentée par une fonction `SECURITY DEFINER` `tender_changer_statut(tender_id, nouveau)` qui
refuse toute transition hors table, et par une contrainte `CHECK` sur le statut. Le client
n'obtient **jamais** le droit d'`UPDATE` direct sur la colonne `statut`.

## Clôture : l'heure de la base, jamais celle du navigateur

```sql
-- refus de soumission après la date limite, côté base
create or replace function public.bid_soumettre(p_bid uuid)
returns jsonb language plpgsql security definer as $$
declare v_deadline timestamptz;
begin
  select t.deadline into v_deadline
    from public.bids b join public.tenders t on t.id = b.tender_id
   where b.id = p_bid;
  if now() > v_deadline then           -- now() = horloge de la BASE
    return jsonb_build_object('ok', false, 'erreur', 'deadline_depassee');
  end if;
  ...
end $$;
```

Le client ne reçoit aucun droit d'`UPDATE` sur `bids.statut`. Une requête API directe envoyée
après la date limite est refusée par la base, pas par l'écran.

## RLS : les quatre règles qui font le secret des offres

| Table | Fournisseur | Acheteur |
|---|---|---|
| `tenders` | lecture **si invité** uniquement | lecture/écriture si de son organisation |
| `bids` | lecture/écriture **de sa seule offre** | lecture **après clôture** si mode scellé |
| `bid_items` | idem, via `bid_id` | idem |
| `tender_events` | lecture de ses propres événements | lecture complète, écriture interdite à tous |

La règle décisive s'écrit : un fournisseur ne voit une offre que si
`bids.supplier_org_id` appartient à ses organisations. Sans cette policy, tout fournisseur invité
lit les prix de ses concurrents.

## Index à créer, justifiés par les requêtes

`tenders(org_id, statut)`, `tenders(deadline)` — tableau de bord acheteur et clôture automatique ·
`tender_invitations(supplier_org_id, tender_id)` — « mes consultations » côté fournisseur ·
`bids(tender_id, statut)` — dépouillement · `bids(supplier_org_id)` — « mes offres » ·
`tender_events(tender_id, at desc)` — journal.

## Notifications et journal

Chaque événement (publication, invitation, question, addendum, soumission, clôture, attribution,
rejet) écrit dans `tender_events` **dans la même transaction** que l'action, et déclenche une
notification. Le journal doit rester lisible même si l'envoi de courriel échoue : la notification
est un effet, jamais une condition.

## Intégration à la chaîne transactionnelle

```sql
-- l'attribution crée le dossier, une seule fois
insert into public.transaction_cases (kind, status, buyer_user_id, seller_user_id,
                                      total_amount, currency, source_award_id)
values (...)
on conflict (source_award_id) do nothing
returning id;
```

`UNIQUE(source_award_id)` sur `transaction_cases` : deux attributions simultanées ne peuvent pas
créer deux dossiers. C'est la même discipline que celle qui manque aujourd'hui côté devis.

---

## Plan de migration sans casser l'existant

Le module actuel a de la valeur : il fait bien son travail de soumissionnaire. **Il ne faut pas
le remplacer, il faut lui ajouter le côté acheteur.**

| Étape | Contenu | Casse-t-il l'existant ? |
|---|---|---|
| **0** | Créer `tender_workspaces` et activer le partage — **sauvegarder d'abord le `localStorage` de chaque utilisateur** (piège `M-02`) | non, si l'ordre est respecté |
| **1** | Schéma Tender Core + RLS + index, sans interface | non — tables nouvelles |
| **2** | Interface acheteur : créer une consultation, lots, articles, inviter des vendeurs du catalogue | non |
| **3** | Interface fournisseur : voir ses invitations, déposer une offre, versionner | non |
| **4** | Clôture serveur + secret des offres + journal immuable | non |
| **5** | Notation, attribution, création idempotente du dossier | non |
| **6** | Renommer l'existant en « Réponse à appel d'offres » pour lever l'ambiguïté | cosmétique |

Les deux modules cohabitent : l'un pour répondre aux marchés publics, l'autre pour consulter des
fournisseurs. Ce sont deux métiers différents et les confondre est précisément ce qui a produit
cet écart.

---

## Tous les problèmes du module

| ID | Sév. | Preuve | Problème |
|---|---|---|---|
| `AO-06` | P0 | PROUVE | La fonction IA réellement déployée est un proxy Claude Opus ouvert à tout Internet, sans authentification |
| `M-01` | P0 | PROUVÉ | Poste partagé : le classeur d'appels d'offres du collègue précédent reste lisible après sa déconnexion |
| `M-02` | P0 | PROUVÉ | Appliquer les migrations que l'auditeur déclare « prêtes » viderait l'espace de travail des sociétés au lieu … |
| `AO-07` | P1 | PROUVE | En production, l'IA du module est injoignable : tout retombe en simulation pendant que l'écran annonce « via … |
| `AO-08` | P1 | PROUVE | Rôles et piste d'audit stockés dans le même localStorage que les données : ni l'un ni l'autre n'est opposable |
| `M-03` | P1 | PROUVÉ | La RPC de quota IA, qui écrit en base, est exécutable par n'importe quel anonyme en production |
| `M-04` | P1 | PROUVÉ | Piège de remédiation : fermer la faille AO-06 comme prévu mettrait 100 % des clients payants en simulation |
| `M-05` | P1 | PROUVÉ | Le verrou anti-écrasement entre collègues est muet à l'écran, et contourné à la première écriture de chaque s… |
| `AO-02` | P2 | PROUVE | Aucune notion d'offre fournisseur : le moteur est unidirectionnel et ne peut pas recevoir d'offres |
| `AO-05` | P2 | PROUVE | Aucune version : régénérer ou modifier un document écrase définitivement le contenu précédent |
| `AO-09` | P2 | PROUVE | Aucune pièce jointe n'est conservée : le contenu des fichiers du DCE est perdu après l'analyse |
| `AO-10` | P2 | PROUVE | Aucun lien avec la transaction : gagner un appel d'offres ne crée aucun dossier, donc la question de l'idempo… |
| `AO-11` | P2 | PROUVE | 8 862 lignes de module sans un seul test, et les contre-cas SQL écrits pour ce module n'ont jamais été joués … |
| `AO-12` | P2 | PROUVE | Le bordereau de prix (BPU/DPGF) est un gabarit à lignes codées en dur, sans modèle d'articles ni le moindre c… |
| `M-06` | P2 | PROUVÉ | En production, un client payant ouvre le module et le trouve entièrement vide |
| `M-07` | P2 | PROUVÉ | Aucune sauvegarde ni export de l'espace de travail : il n'existe aucun filet sous le défaut AO-01 |
| `AO-01` | P3 | PROUVE | Tout le travail d'appel d'offres vit dans le navigateur ; le partage société est cassé en production |
| `AO-03` | P3 | PROUVE | Aucune machine à états : un dossier passe de Brouillon à Gagné en un clic, sans aucune règle |
| `AO-04` | P3 | PROUVE | La date limite est jugée par l'horloge du visiteur, et rien ne se ferme à l'échéance |
| `AO-13` | P3 | TRES PROBABLE | Le quota du navigateur (environ 5 Mo) limite silencieusement le nombre de dossiers conservables |

## Détail des P0 et P1

#### `AO-06` — La fonction IA réellement déployée est un proxy Claude Opus ouvert à tout Internet, sans authentification

| | |
|---|---|
| **Sévérité** | P0 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `supabase/functions/tenders-ai/index.ts:27-33 (REQUIRE_AUTH), 443-472 (contrôle d'auth), 428-429 (default) — correctif présent dans le dépôt mais ABSENT de la version déployée sous « renders-ai »` |
| **Table / API** | Edge Function https://tnfbggrftmtxpgbcwqzo.supabase.co/functions/v1/renders-ai (DÉPLOYÉE, ouverte) ; RPC bump_tenders_usage (présente en base, mais contournée) |

La fonction serveur du module est déployée en production sous le nom « renders-ai » (le dépôt l'appelle « tenders-ai »). Le code du dépôt a été corrigé (constante REQUIRE_AUTH à vrai par défaut, plus de dépense possible sans utilisateur résolu), MAIS la version en ligne ne porte pas ce correctif : un appel avec la seule clé anon — qui est PUBLIQUE, lisible dans le bundle JavaScript du site — franchit le contrôle d'authentification et atteint le routeur d'actions. Toute action coûteuse (generateTechnicalMemo, analyzeTender, generateDocument…) est donc exécutable anonymement et facturée sur la clé Anthropic de l'entreprise.

**Preuve**

```
Sonde 1 (gratuite, sans appel modèle) : ``` curl -X POST -H "Authorization: Bearer <CLE_ANON_PUBLIQUE>" -H "Content-Type: application/json" \ -d '{"action":"ping","payload":{}}' https://tnfbggrftmtxpgbcwqzo.supabase.co/functions/v1/renders-ai -> HTTP 200 {"ok":true,"model":"claude-opus-4-8","hasKey":true} ``` Sonde 2, décisive (action inexistante -> le modèle n'est PAS appelé, mais on voit jusqu'où la requête est allée) : ``` curl -X POST -H "Authorization: Bearer <CLE_ANON_PUBLIQUE>" -H "Content-Type: application/json" \ -d '{"action":"__sonde_audit_lecture_seule__","payload":{}}' .../functions/v1/renders-ai -> HTTP 500 {"error":"Action inconnue : __sonde_audit_lecture_seule__"} ``` La réponse provient de `default: throw new Error(\`Action inconnue : ${action}\`)` (supabase/functions/tenders-ai/index.ts:428-429), c'est-à-dire de handleAction : la requête a donc traversé TOUS les contrô…
```

**Reproduction** — Récupérer la clé anon dans le bundle public du site, puis POSTer sur /functions/v1/renders-ai un corps {"action":"generateTechnicalMemo","payload":{...}} sans aucun jeton utilisateur. (Sonde NON exécutée volontairement pour ne pas engager de dépense : la sonde 2 ci-dessus prouve déjà que le contrôle d'auth est franchi avant le routeur d'actions.)

**Impact métier** — Dépense directe et non plafonnée sur le crédit Anthropic de l'entreprise, au tarif Claude Opus, par n'importe qui sur Internet ayant ouvert le site une fois. Le plafond quotidien par utilisateur (TENDERS_AI_DAILY_LIMIT, 100 appels) est inopérant puisqu'il n'y a pas d'utilisateur à compter. Facture potentiellement à quatre chiffres en une nuit.

**Impact sécurité** — Proxy LLM anonyme exposé : détournement du crédit, mais aussi utilisation du compte Anthropic de l'entreprise pour générer des contenus arbitraires, avec la responsabilité qui en découle. La sonde révèle en outre publiquement le modèle utilisé et la présence de la clé (hasKey:true).

**Cause racine** — Déploiement manuel historique de la fonction sous un nom différent (« renders-ai ») via le tableau de bord Supabase. Les correctifs ultérieurs ont été poussés sur le dossier `tenders-ai` du dépôt, jamais redéployés sur le nom réellement en ligne : le dépôt et la production ont divergé sans que rien ne le signale.

**Correctif proposé** — 1) Immédiat : poser le secret TENDERS_AI_REQUIRE_AUTH=true sur la fonction « renders-ai » en production (opt-out explicite requis par le code corrigé ; sur l'ancien code, c'est l'inverse — vérifier alors la version déployée). 2) Redéployer supabase/functions/tenders-ai/index.ts sous le nom « renders-ai » pour aligner la production sur le dépôt corrigé. 3) Rejouer les contre-cas supabase/tests/p24_tenders_quota.countercases.sql. 4) Vérifier que l…

**Test de non-régression** — Test d'intégration contre la production : un POST sur /functions/v1/renders-ai avec la seule clé anon et {"action":"generateTechnicalMemo"} renvoie HTTP 401, et jamais un message « Action inconnue » ni une réponse 2xx.


#### `M-01` — Poste partagé : le classeur d'appels d'offres du collègue précédent reste lisible après sa déconnexion

| | |
|---|---|
| **Sévérité** | P0 |
| **Niveau de preuve** | PROUVÉ |

**Preuve**

```
Le projet s'est doté d'un dispositif anti-fuite (MG-M04) : src/utils/api/auth.ts:41-50, `logoutUser()` appelle `purgeLocalUserData()`. Cette purge (src/utils/scopedStorage.ts:111-126) ne supprime que deux choses : les clés préfixées `mg:` (NS='mg', ligne 26) et la liste close LEGACY_KEYS (lignes 28-47). Or la clé du module vaut `minegrid-tenders-store` (src/tenders/store/tendersStore.ts:310) : elle n'est pas préfixée `mg:` et ne figure PAS dans LEGACY_KEYS — je l'ai vérifiée ligne à ligne. Elle survit donc intégralement à la déconnexion. Contenu persisté : aucun `partialize` (tendersStore.ts:308-352), donc TOUT l'état, y compris `roleAssignments` qui porte nom + adresse e-mail de comptes réels de la société (types.ts:571-579, alimenté par la RPC get_org_members via src/tenders/hooks/useTeamMembers.ts:41-49), la fiche entreprise, tous les dossiers et tous les documents générés. Le verrou…
```

**Impact métier** — Sur un poste partagé — cas courant dans une PME ou une agence — le commercial B qui se connecte après le commercial A ouvre « Appels d'offres » et lit les dossiers de A : stratégie de prix, mémoire technique, décision go/no-go, nom et e-mail des salariés affectés. C'est exactement la fuite que la remédiation MG-M04 a été écrite pour fermer, et le module d'appels d'offres est le seul espace du produit resté hors de son périmètre. Correctif minimal : deux lignes — ajouter 'minegrid-tenders-store'…


#### `M-02` — Appliquer les migrations que l'auditeur déclare « prêtes » viderait l'espace de travail des sociétés au lieu de le réparer

| | |
|---|---|
| **Sévérité** | P0 |
| **Niveau de preuve** | PROUVÉ |

**Preuve**

```
J'ai monté un PostgreSQL 16 jetable (`docker run -d --name pg-ao-contre-audit -e POSTGRES_PASSWORD=test -e POSTGRES_DB=t postgres:16-alpine`, supprimé en fin de travail), stubé auth.uid()/organizations/organization_members, puis rejoué 20260708160000_teamE_tender_workspace.sql puis 20260718150000_p7g_workspace_concurrency.sql. Trois résultats mesurés, aucun supposé. (A) AMORÇAGE IMPOSSIBLE : pour une société membre SANS ligne d'espace, `select public.get_my_tender_workspace()` renvoie NULL — parce que p7g remplace le `left join` d'origine par un `join` partant de tender_workspaces (p7g lignes 111-124). Le client traduit NULL en `{mode:'local'}` (src/utils/api/tendersWorkspace.ts:67-68), donc `ready` n'est jamais armé (tendersSync.ts:123) et `saveWorkspace` n'est jamais appelé : la première ligne ne peut JAMAIS être créée. Blocage circulaire définitif. (B) FORME INCOMPATIBLE : après une …
```

**Impact métier** — L'auditeur conclut « Elle est prête à appliquer » et « Ce code est prêt ; il lui manque uniquement sa base ». Une équipe qui suit cette conclusion et applique le lot en production provoque l'incident même que l'audit prétend prévenir : soit le partage ne s'amorce jamais (A), soit il s'amorce et le premier collègue qui touche une virgule écrase tout le classeur de la société par du vide (B), soit les rôles attribués dans « Équipe & rôles » disparaissent à chaque rechargement (C). Aucune de ces t…


#### `AO-07` — En production, l'IA du module est injoignable : tout retombe en simulation pendant que l'écran annonce « via votre API IA »

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `src/tenders/ai/aiService.ts:53-77, 88-92 ; .env.production:19 ; src/tenders/pages/CdcWizard.tsx:294 ; src/tenders/components/DocumentEditorView.tsx:226` |
| **Table / API** | Edge Function /functions/v1/tenders-ai (404 en prod) vs /functions/v1/renders-ai (déployée) |

Le front construit son URL d'IA à partir de VITE_TENDERS_AI_FUNCTION. Le fichier .env.production pose « tenders-ai », or c'est « renders-ai » qui est déployé (AO-06). Le bundle EN LIGNE contient donc une URL qui renvoie 404, et callRealApi() retombe silencieusement sur le mock. Dans le même temps, isAiConnected() ne teste QUE la présence d'une configuration, jamais l'accessibilité : l'interface affirme « via votre API IA » alors que 100 % des contenus produits sortent du simulateur.

**Preuve**

```
1) Bundle EN LIGNE https://minegrid-equipement.com/assets/index-BFLLSToL.js : ``` const St="tenders-ai".trim()||"renders-ai"; function Tt(){return{url:`${"https://tnfbggrftmtxpgbcwqzo.supabase.co".replace(/\/$/,"")}/functions/v1/${St}`,key:"eyJ..."}} ``` 2) `curl -X POST .../functions/v1/tenders-ai -> HTTP 404 {"code":"NOT_FOUND","message":"Requested function was not found"}` ; `.../functions/v1/renders-ai -> HTTP 200`. 3) .env.production:19 `VITE_TENDERS_AI_FUNCTION=tenders-ai` ; .env.production:29 `VITE_TENDERS_AI_URL=supabase`. 4) Repli silencieux : src/tenders/ai/aiService.ts:88-92 `if (!res.ok) return null;` puis `catch { return null; // fallback mock }`. 5) Façade : src/tenders/ai/aiService.ts:75-77 `export function isAiConnected(): boolean { return Boolean(ENDPOINT); }` — utilisé pour afficher « via votre API IA » (src/tenders/pages/CdcWizard.tsx:294) et « Reformuler avec l'API I…
```

**Reproduction** — Sur le site en production, onglet DCE d'un dossier, déposer un PDF et lancer l'analyse : le résultat arrive, mais c'est le mock. La mention honnête « (simulation) » apparaît bien (DceAnalysisTab.tsx:316), tandis que d'autres écrans continuent d'annoncer une API réelle.

**Impact métier** — Le client paie un module « premium » pour une analyse de DCE et une rédaction assistée par IA, et reçoit des textes génériques pré-écrits. Le jour où il compare le mémoire produit au DCE réel, la confiance dans le produit s'effondre. Écart entre la promesse commerciale et la livraison.

**Impact sécurité** — Risque inverse et plus subtil : le contenu des PDF du DCE est encodé en base64 et envoyé à l'URL configurée (src/tenders/pages/tender/DceAnalysisTab.tsx:84-108). Le jour où le slug sera corrigé, des documents de consultation confidentiels partiront vers une fonction qui, aujourd'hui, n'authentifie pas ses appelants (AO-06). Corriger AO-06 AVANT AO-07.

**Cause racine** — Divergence non détectée entre le nom de fonction déployé manuellement et le nom configuré au build, aggravée par un repli silencieux sur le mock qui empêche tout signalement.

**Correctif proposé** *(applicable sans risque sur le dépôt)* — Aligner le nom : soit poser VITE_TENDERS_AI_FUNCTION=renders-ai dans .env.production, soit (préférable) redéployer la fonction sous le nom « tenders-ai » et supprimer le sentinel historique dans aiService.ts:53-58. En complément : faire de isAiConnected() un état réellement vérifié (résultat d'un ping mis en cache) plutôt qu'un simple booléen de configuration, et afficher la mention « simulation » sur TOUS les écrans qui produisent du contenu, p…

**Test de non-régression** — Test d'intégration : un POST {"action":"ping"} sur l'URL exactement calculée par resolveEndpoint() avec la configuration de production renvoie HTTP 200 ; et lorsque l'endpoint renvoie 404, aucun écran n'affiche le libellé « via votre API IA ».


#### `AO-08` — Rôles et piste d'audit stockés dans le même localStorage que les données : ni l'un ni l'autre n'est opposable

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVE |
| **Fichier** | `src/tenders/store/tendersStore.ts:101-107, 308-352 ; src/tenders/types.ts:600-617 ; src/tenders/pages/tender/GoNoGoTab.tsx:61-71` |
| **Table / API** | localStorage « minegrid-tenders-store » (aucune table en production) |

Le rôle de l'utilisateur (settings.currentUserRole) et tout l'historique des dossiers et documents (HistoryEntry) sont des champs ordinaires du store zustand persisté. Le persist n'a PAS de `partialize` : l'état entier, rôle compris, est écrit dans la clé localStorage « minegrid-tenders-store ». Comme rien n'est vérifié côté serveur (AO-01), la fonction can() de types.ts n'est qu'un masquage d'interface : modifier une chaîne dans le stockage du navigateur suffit à devenir « admin », à supprimer des dossiers et à acter des décisions go/no-go signées d'un nom choisi librement. Symétriquement, l'historique est réécrivable à volonté.

**Preuve**

```
1) Aucun partialize : src/tenders/store/tendersStore.ts:308-352, l'objet d'options ne contient que `name`, `version` et `migrate` — l'état complet est persisté. 2) Le rôle est dans l'état persisté : src/tenders/store/tendersStore.ts:101-107 `settings: { currentUserName: 'Utilisateur', currentUserRole: 'lecteur', aiApiConfigured: false }`. 3) Contrôle purement client : src/tenders/types.ts:600-617 `export function can(role, action)` — un simple switch ; appelé à l'affichage, ex. src/tenders/pages/tender/TenderOverview.tsx:45 `const editable = can(role, 'edit');` et src/tenders/pages/TenderNew.tsx:95 `if (!can(role, 'edit')) return (<EmptyState .../>)`. 4) Signature des décisions par une chaîne du store : src/tenders/pages/tender/GoNoGoTab.tsx:61-71 `decidedBy: settings.currentUserName`. 5) Aucun recours serveur : les RPC du module sont absentes en production (cf. AO-01, sorties PGRST202).
```

**Reproduction** — Ouvrir la console du navigateur sur #appels-offres. Lire `localStorage.getItem('minegrid-tenders-store')` : le JSON contient `"settings":{"currentUserName":"...","currentUserRole":"lecteur"}` ainsi que tous les tableaux `history`. Remplacer « lecteur » par « admin » et recharger : tous les boutons réservés apparaissent, y compris la suppression de dossier et la décision go/no-go.

**Impact métier** — L'écran « Équipe & rôles » vend un contrôle « qui peut quoi » (types.ts:557-562) qui n'existe pas. Une décision GO/NO-GO, qui engage l'entreprise à répondre ou à renoncer à un marché, est signée d'un nom que l'utilisateur choisit et peut effacer. Aucune responsabilité n'est établissable.

**Impact sécurité** — Élévation de privilège triviale, sans outil, sans compte, depuis la console du navigateur. Et piste d'audit non fiable : les HistoryEntry peuvent être ajoutées, modifiées ou supprimées par la personne même qu'elles sont censées tracer — c'est l'inverse d'un journal d'audit.

**Cause racine** — Le contrôle d'accès a été conçu comme une aide à l'ergonomie (masquer ce qui ne sert pas) puis présenté comme une sécurité. Sans persistance serveur (AO-01), aucune autorité ne peut trancher.

**Correctif proposé** *(applicable sans risque sur le dépôt)* — 1) Dire la vérité dans l'UI tant que AO-01 n'est pas corrigé : indiquer sur l'écran Équipe & rôles que les rôles sont un confort d'affichage local, pas une sécurité. 2) Ne plus persister settings.currentUserRole : ajouter un `partialize` au persist qui exclut `settings`, et dériver le rôle à chaque chargement depuis get_my_member_scope (le code de dérivation existe déjà : tendersSync.ts:80-118). 3) À terme, faire appliquer les droits par le serv…

**Test de non-régression** — Test : après avoir forcé `settings.currentUserRole = 'admin'` dans localStorage puis rechargé, le rôle effectif redevient celui renvoyé par get_my_member_scope, et le bouton de suppression de dossier reste masqué pour un membre 'viewer'.


#### `M-03` — La RPC de quota IA, qui écrit en base, est exécutable par n'importe quel anonyme en production

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVÉ |

**Preuve**

```
POST anonyme, avec la seule clé anon publique, sur https://tnfbggrftmtxpgbcwqzo.supabase.co/rest/v1/rpc/bump_tenders_usage avec {"p_user":"00000000-0000-0000-0000-000000000000","p_daily_limit":1} -> HTTP 200, corps `false`. Témoins de discrimination, pour ne pas confondre 401 et 404 : la même sonde sur ensure_transaction_case_for_quote_request donne HTTP 400 P0001 « authentification requise » (fonction présente ET protégée), et sur get_my_member_scope HTTP 200 (fonction présente). Le 200 obtenu prouve donc à la fois la présence ET l'absence de protection. Cause en dépôt : supabase/migrations/00000000000000_baseline.sql:6834 `GRANT ALL ON FUNCTION "public"."bump_tenders_usage" TO "anon"` — c'est l'état réel de la production. Deux migrations corrigent exactement cela et n'ont jamais été appliquées : 20260718140000_p7f_least_privilege.sql:5 (« MG-M02 : anon peut executer bump_ai_usage et b…
```

**Impact métier** — Deux abus concrets, sans compte et sans outil. Premièrement, déni de service ciblé sur une fonction payante : connaissant l'identifiant d'un utilisateur, un tiers épuise son plafond IA quotidien en quelques requêtes ; le client Pro paie 50 $/mois et s'entend répondre « quota atteint ». Deuxièmement, grossissement non borné de tenders_ai_usage_daily, une ligne par identifiant arbitraire, sans limitation de débit. Même racine que la fonction voisine bump_ai_usage (p7f:33), donc le correctif est c…


#### `M-04` — Piège de remédiation : fermer la faille AO-06 comme prévu mettrait 100 % des clients payants en simulation

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVÉ |

**Preuve**

```
Le client n'envoie JAMAIS le jeton de session de l'utilisateur à la fonction IA, seulement la clé anon publique : src/tenders/ai/aiService.ts:82-88, l'en-tête vaut `Authorization: Bearer ${ENDPOINT.key}` où `key` est `import.meta.env.VITE_SUPABASE_ANON_KEY` (aiService.ts:66-68). Vérification négative : `grep -n "getSession|access_token|supabase" src/tenders/ai/aiService.ts` ne renvoie que des commentaires — aucune récupération de session dans tout le fichier, alors que le reste du produit le fait bien ailleurs (src/utils/api/quoteRequests.ts:241). Côté serveur, le dépôt exige par défaut un utilisateur RÉSOLU : supabase/functions/tenders-ai/index.ts:32 (`REQUIRE_AUTH` vaut true sauf opt-out explicite), 452-454 (401 si aucun utilisateur), 469-472 (401 pour toute action non-ping sans utilisateur). Or `supabase.auth.getUser(token)` sur une clé anon ne résout aucun utilisateur. Conclusion ar…
```

**Impact métier** — L'auditeur écrit « Le problème AO-06 est un problème de déploiement, pas de conception ». C'est la phrase qui coûtera le plus cher : elle invite à poser TENDERS_AI_REQUIRE_AUTH=true et à considérer l'affaire close. Le résultat serait de remplacer une faille financière par une panne totale de la fonctionnalité vendue — et, pire, une panne SILENCIEUSE, puisque isAiConnected() continuerait d'afficher « via votre API IA » (cf. AO-07). L'ordre des opérations est imposé : (1) faire envoyer au client …


#### `M-05` — Le verrou anti-écrasement entre collègues est muet à l'écran, et contourné à la première écriture de chaque session

| | |
|---|---|
| **Sévérité** | P1 |
| **Niveau de preuve** | PROUVÉ |

**Preuve**

```
Deux défauts distincts sur le mécanisme que l'auditeur cite comme exemplaire. (1) AUCUNE INTERFACE POUR L'ÉTAT 'conflit'. Le code le produit bien (src/tenders/store/tendersSync.ts:186-188, `setStatus('conflit')`) et son propre commentaire, lignes 40-42, prescrit : « L'interface doit proposer un rechargement plutot que d'ecraser silencieusement ». Elle ne le fait pas : src/tenders/components/TendersShell.tsx:113-137, le badge ne distingue que 'partage' et 'chargement', tout le reste tombe dans la branche par défaut et affiche l'étiquette ambre « Non partagé » ; et le seul bandeau explicatif, TendersShell.tsx:167-176, est conditionné à `syncStatus === 'erreur'` strictement. `grep -rn "conflit" src/tenders/` hors tendersSync.ts ne renvoie qu'une clause de document sans rapport (docTemplates.ts:285). Un collaborateur en conflit voit donc une pastille discrète, continue de travailler, et plu…
```

**Impact métier** — L'auditeur présente ce mécanisme comme « soigneusement pensé » et « prêt ». Il ne l'est pas : à chaque ouverture du module, la première sauvegarde de chaque collaborateur écrase le travail des autres sans contrôle — c'est précisément la perte de données MG-M07 que le verrou est censé fermer. Et lorsque le verrou joue enfin (deuxième écriture et suivantes), l'utilisateur n'en est pas averti et travaille dans le vide. À corriger AVANT toute mise en service du partage, donc en même temps que M-02.

