# MINEGRID — LISTE DE CONTRÔLE AVANT OUVERTURE

**Date** : 2026-09-29 · À cocher **avant** d'ouvrir commercialement. Chaque ligne est vérifiable
par une commande, pas par une impression.

---

## 🔴 BLOQUANT — sans ces lignes, ne pas ouvrir

### Sécurité immédiate

- [ ] **`renders-ai` coupée ou protégée.** Vérifier :
      ```bash
      curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer <CLE_ANON>" -H 'Content-Type: application/json' -d '{"action":"ping"}' https://tnfbggrftmtxpgbcwqzo.supabase.co/functions/v1/renders-ai
      ```
      **Attendu : 401.** Un 200 signifie que n'importe qui peut dépenser votre clé Anthropic.
- [ ] **Consommation Anthropic des 6 dernières semaines vérifiée.** Si anormale : révoquer la clé.
- [ ] **Le client envoie le jeton de session à la fonction IA** (`aiService.ts` — sinon fermer la
      porte bascule tous les clients payants en simulation, cf. `M-04`).

### Conformité dépôt ↔ production

- [ ] **`npm run verifier:deploiement` sort en code 0.** Aujourd'hui il sort **1**.
- [ ] **Les Edge Functions déployées sont celles du dépôt.** Vérifier qu'un corps vide sur
      `send-contact-email` renvoie **400** et non `{"ok":true}`.
- [ ] **Aucune fonction déployée sous un nom absent du dépôt** (cas `renders-ai`).

### Argent et intégrité transactionnelle

- [ ] **`p29` appliquée** (staging puis production) : elle ferme `CTR-01` (le client écrit
      `total_amount`), `CTR-02` (suppression en cascade d'un dossier payé) et `CTR-03`
      (prédicat tautologique). Trois P0 dans une seule migration déjà écrite.
- [ ] **`paddle-webhook` déployée.** Sans elle, un paiement réussi n'active aucun abonnement :
      le client est débité et n'a rien.
- [ ] **Un paiement de bout en bout réussi en bac à sable**, du clic à l'abonnement actif.

### Données

- [ ] **Les 13 717 annonces à vendeur fictif sont traitées** : soit rattachées à un vendeur réel,
      soit retirées du catalogue, soit marquées « à titre indicatif, non contactable ».
      Aujourd'hui elles représentent 83,7 % de ce qu'un acheteur voit.
- [ ] **Une sauvegarde de la base a été restaurée avec succès** sur un projet de test. Pas
      « configurée » : **restaurée**.
- [ ] **Le dépôt est poussé sur un remote.** 167 versions n'existent que sur une machine.

---

## 🟠 FORTEMENT RECOMMANDÉ — ouvrir sans, c'est accepter un risque connu

- [ ] `p27`, `p28`, `p29b`, `p30`, `p31`, `p32`, `p33` appliquées (staging puis prod), puis
      `npm run bases` sans écart.
- [ ] `delete-account` déployée (obligation RGPD).
- [ ] Les 33 tables absentes de production sont soit créées, soit les écrans qui en dépendent
      sont désactivés. Aujourd'hui ils affichent une liste vide, ce qui se lit comme
      « vous n'avez rien » et non comme « indisponible ».
- [ ] Un outil de collecte d'erreurs est branché. Aujourd'hui, comprendre un incident exige de
      le reproduire.
- [ ] Les en-têtes de cache sur `index.html` sont posés (aujourd'hui aucun : la stratégie
      d'empreinte des fichiers ne sert à rien si la page qui les référence est mise en cache).
- [ ] Le pipeline d'intégration continue se déclenche réellement (il vise des branches qui
      n'existent pas, et ses garde-fous sont neutralisés par `|| true`).

---

## 🟡 À SAVOIR AVANT D'OUVRIR — ce qui n'existe pas

Ces points ne bloquent pas techniquement, mais promettre la fonctionnalité serait inexact.

- [ ] **Le séquestre n'existe pas.** Aucun prestataire de paiement raccordé, fonctions absentes
      de production. Le bouton « Préparer le séquestre » est pourtant actif et fait basculer le
      dossier en statut « paiement ».
- [ ] **Le moteur d'appel d'offres acheteur n'existe pas.** Le module actuel sert à *répondre*
      à un appel d'offres, pas à en lancer un. Voir `MINEGRID_RFQ_TENDER_AUDIT.md`.
- [ ] **L'étape « confiance » n'a pas de base derrière** : ce sont des écrans.
- [ ] **Le vendeur peut être son propre inspecteur** et déclarer l'inspection terminée.

---

## ✅ DÉJÀ VÉRIFIÉ — inutile d'y revenir

- [x] Aucun secret dans le paquet livré (8 motifs testés, 0 occurrence)
- [x] Les tables sensibles ne fuient pas vers l'anonyme
- [x] La base est reconstructible depuis git (57/58 migrations rejouées)
- [x] La base tient la charge : 0,27 s sur la 16 000ᵉ ligne
- [x] HTTPS, HSTS, X-Content-Type-Options, Referrer-Policy présents
- [x] 634 tests verts, types stricts sur la nullité, build reproductible en local

---

## La commande qui résume l'état

```bash
npm run verifier      # SQL rangé + déploiement à jour + bases alignées
```

Aujourd'hui elle échoue sur le deuxième point. **Le jour où elle passe entièrement, la moitié de
cette liste est cochée.**
