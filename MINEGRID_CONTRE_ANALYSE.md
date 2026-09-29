# MINEGRID — CONTRE-ANALYSE DE L'AUDIT

**Date** : 2026-09-29 · Quatre angles indépendants chargés de **réfuter l'audit lui-même** :
l'avocat de la défense, le procureur, l'exploitant, le client payant. Aucun ne voyait les autres.

Cette passe a trouvé **trois erreurs dans mon propre audit** et **deux problèmes que personne
n'avait vus**, dont un plus lourd que les treize P0 réunis.

---

# 🔴 Le piège de déploiement : mon action « prioritaire » était dangereuse

Ma feuille de route disait : *« Téléverser `dist/` chez l'hébergeur — 30 min — sans risque,
sans écrire une ligne de code. »*

**C'est faux.** Vérifié personnellement :

```
$ cat dist/assets/InternalGate-VFpDfocY.js
  function r(){return!0}   ← la garde de l'espace interne vaut TOUJOURS vrai
```

La source dit pourtant le contraire :

```
src/nextgen/integration/InternalGate.tsx:4-7
  « par défaut, l'espace est INACCESSIBLE […] jamais ouvert au public par défaut »
```

Cause : `.env:16  VITE_ENABLE_NEXTGEN=true`, et Vite charge `.env` **dans tous les modes**.
`.env.production` ne le corrige pas.

**Téléverser le paquet actuel publierait l'espace interne `#nextgen`** — acheter, vendre, trust,
inspection, escrow, finance, logistics, intelligence — c'est-à-dire exactement les « écrans sans
base derrière » que ma propre liste de contrôle range en zone jaune.

### Correction de la marche à suivre

Avant tout téléversement :

1. Retirer `VITE_ENABLE_NEXTGEN=true` de `.env` (ou le forcer à `false` dans `.env.production`)
2. Remettre `VITE_TENDERS_SHARED=false` **ou** appliquer la migration `tender_workspaces`
3. Reconstruire, vérifier `dist/assets/InternalGate-*.js` → la garde ne doit plus valoir `return!0`
4. **Puis** téléverser, puis `npm run verifier:deploiement`

---

# 🔴 Le risque que personne n'avait nommé : la provenance du catalogue

99,25 % des annonces sont importées. Les photos ne sont pas hébergées par MineGrid :

```
sur 200 annonces échantillonnées :
  197 images  →  dnge9sb91helb.cloudfront.net   (chemins : rbauctioncanadaone,
                                                  ironplanetus, rbauctionmiddleeast
                                                  → Ritchie Bros / IronPlanet)
   27 images  →  img.leboncoin.fr
```

Autrement dit : **le catalogue affiche les annonces et les photographies de tiers, servies depuis
leurs propres serveurs, sous un vendeur fantôme, sans attribution visible.**

Je constate le fait technique, je ne me prononce pas sur le droit — ce n'est pas ma compétence.
Mais c'est la question à poser en premier, avant toute ouverture commerciale : **existe-t-il un
accord avec ces sources ?**

- Si **oui** : documentez-le, et le sujet est clos.
- Si **non** : c'est une exposition plus lourde que les treize P0 techniques réunis, et aucune
  correction de code ne la réduit.

S'y ajoute une dépendance d'exploitation : les images de votre catalogue sont servies par une
infrastructure que vous ne contrôlez pas. Le jour où ce CDN bloque les liens externes, **83 % de
vos vignettes disparaissent** — sans que rien dans votre code ne change.

---

# Les trois erreurs de mon audit

| Ce que j'affirmais | Ce qui est vrai | Comment je m'étais trompé |
|---|---|---|
| « Téléverser `dist/` : 30 min, sans risque » | Publierait l'espace interne au public | Je n'ai pas inspecté l'artefact construit, seulement la source |
| « Le partage AO est opt-in, donc le module reste local » | `.env.production:32 VITE_TENDERS_SHARED=true` → mode **erreur**, bandeau rouge permanent | Je n'ai pas lu la configuration de build |
| « 167 versions n'existent que sur cette machine » | Deux remotes existent ; **329** commits d'avance sur l'un, **373** sur l'autre, 407 au total | Chiffre repris sans vérification |

Le point commun des trois : **j'ai audité le code source et pas ce qui est réellement construit
et configuré.** C'est la même faute que celle que je reproche au projet — croire que le dépôt
décrit la réalité.

---

# Ce que la contre-analyse confirme

L'avocat de la défense, chargé de démolir le NO-GO, a re-exécuté les preuves et concède :

- `verifier-deploiement` sort en **code 1** — le site est bien en retard ;
- `renders-ai` répond bien **200** avec la clé publique, clé Anthropic derrière ;
- `send-contact-email` répond bien `{"ok":true}` à un corps vide ;
- `CTR-01` — le client écrit lui-même `total_amount`, `currency` et `status` — est concédé
  entièrement.

---

# Le désaccord sur le verdict, et ma décision

**L'avocat plaide CONDITIONAL GO**, avec un argument sérieux : *« un verdict dont le remède tient
en huit jours est un CONDITIONAL GO daté, pas un NO-GO »*. Il relève aussi, à juste titre, que
je classe NO-GO une dimension (l'appel d'offres) dont ma propre recommandation est **d'attendre
qu'un client le demande** — on ne bloque pas une ouverture sur une fonctionnalité qu'on conseille
de ne pas construire.

**Je maintiens NO-GO**, pour deux raisons qu'il n'a pas levées :

1. **L'action la plus urgente est aujourd'hui dangereuse.** Tant que le téléversement publie
   l'espace interne, il n'y a pas de chemin sûr vers la mise en service. Un CONDITIONAL GO
   supposerait que les conditions sont connues et sûres : l'une d'elles ne l'était pas il y a une
   heure.
2. **La provenance du catalogue est une question ouverte dont je ne connais pas la réponse.**
   Un verdict conditionnel suppose des conditions techniques ; celle-ci est contractuelle, et
   personne ne peut la cocher à ma place.

**Je retire en revanche l'appel d'offres des motifs de blocage.** C'est un écart au cahier des
charges, pas un défaut de production. Il reste NO-GO *pour la promesse « recevoir des offres
fournisseurs »*, pas pour l'ouverture de la place de marché.

**Le NO-GO devient un GO** le jour où : le téléversement est rendu sûr (2 variables), le paquet
est en ligne, `renders-ai` est fermée avec `aiService.ts` corrigé, `p29` est appliquée,
`paddle-webhook` est déployée, et la question de la provenance a une réponse écrite.

**C'est une affaire de jours, pas de mois** — et sur ce point, l'avocat a raison.
