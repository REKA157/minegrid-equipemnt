# MineGrid — Analyse solution de paiement (société marocaine + IBAN devise)

Recherche multi-sources + vérification adverse (2026-07). Contexte : société **immatriculée au Maroc**
(→ Stripe impossible, pas de Maroc dans la sélection pays), **IBAN en devise**, besoin d'**abonnements
récurrents 29–299 €** (clients marocains ET internationaux) + **transactions d'engins** (5–6 chiffres).

## Conclusion : PAS une solution unique, mais une architecture à 3 rails

### Rail 1 — Abonnements (international + cartes internationales) → **Merchant of Record : Paddle**
Un MoR devient LE marchand légal à ta place (il vend depuis son entité UK/UE, encaisse, collecte la TVA
mondiale, te reverse par virement). **Le blocage « pas de Maroc » disparaît** : ta société n'est plus
« marchand » mais « bénéficiaire » d'un virement — reversé en **EUR/USD sur ton IBAN devise**.
- Paddle : mature, Maroc non exclu (liste d'exclusion = pays sanctionnés uniquement), récurrent natif
  (proration + relances), webhooks signés → **réutilise ta logique existante** (montant serveur, webhook
  signé, dédup, réconciliation). Frais ~5 % + 0,50 $ (effectif ~7 % avec change).
- **Runner-up : Polar** — seul MoR où le Maroc est explicitement listé ; meilleure DX React/Supabase ;
  bémols : +1,5 % cartes non-US, facturation (proration/dunning) à re-vérifier.
- À éviter (nouveau compte 2026) : Lemon Squeezy (reversement Maroc non confirmé + fusion dans Stripe).

### Rail 2 — Cartes MAROCAINES locales (MAD) → **Chari Pay / ChariBaaS** (si nécessaire)
Nécessaire seulement si tes clients marocains butent sur la « dotation e-commerce » (plafond 15 000 MAD/an
à activer sur la carte, quand ils paient un marchand étranger = le MoR). Chari Pay = **API calquée sur
Stripe** (Payment Intents/Subscriptions/webhooks HMAC/idempotence) → migration de code quasi directe ;
agréé Bank Al-Maghrib. Alternatives : PayZone, PayTabs Maroc. ⚠️ **Toutes règlent en MAD sur un compte
marocain, jamais sur l'IBAN devise** (→ deux poches de trésorerie).

### Rail 3 — Transactions ENGINS (5–6 chiffres) → **virement + séquestre (escrow)**, PAS la carte
La carte est inadaptée (frais de milliers d'€, plafonds réseau, chargeback jusqu'à 180 j). Standard B2B =
virement + séquestre (Escrow.com ou compte séquestre notarial/bancaire marocain). **C'est déjà ton
parcours devis→dossier→séquestre** — à formaliser, pas à réinventer.

## Tableau
| Solution | MoR | Récurrent | Cartes MA | Règle sur IBAN devise | Frais | Rôle |
|---|---|---|---|---|---|---|
| **Paddle** | Oui | Oui | via dotation e-com* | **Oui** | ~5 %+0,50 $ (~7 % eff.) | **Abonnements intl — n°1** |
| **Polar** | Oui | Oui (à vérifier) | via dotation* +1,5 % non-US | **Oui** | 5 %+0,50 $ | Backup Paddle |
| **Chari Pay** | Non | Oui | **Oui** (MAD) | Non (MAD) | ~1,8 % | Cartes marocaines |
| **PayTabs MA** | Non | Oui (via support) | Oui | Non (MAD) | ~1–2,25 % | Alt. locale |
*dotation e-commerce = plafond 15 000 MAD/an sur la carte du client marocain ; clients internationaux non concernés.

## ⚠️ Le VRAI point dur (vérification adverse) : le contrôle des changes, pas Paddle
- Paddle **n'exclut pas** le Maroc et paie EUR/USD sur un IBAN devise → techniquement OK. MAIS : **aucun
  témoignage réel** d'une société marocaine onboardée+payée par Paddle trouvé (angle mort à lever).
- **Office des Changes (IGOC 2026)** : un exportateur de services résident DOIT rapatrier ses recettes et
  les justifier. On peut conserver **jusqu'à 70 %** en devises sur un **compte en devises DOMICILIÉ DANS
  UNE BANQUE MAROCAINE**, ~30 % cédés en MAD. → L'IBAN devise doit être **marocain** (compliant).
  **Ne PAS** accumuler sur un Payoneer/compte offshore non rapatrié = infraction.
- **2 vérifications AVANT d'industrialiser** : (1) écrire au **support Paddle** (éligibilité entité
  marocaine + docs registre de commerce) ; (2) valider avec ta **banque marocaine + un conseil en change**
  le montage compte-en-devises / rapatriement pour des recettes SaaS via un MoR.

## Prochaines étapes concrètes
1. Site/produit SaaS crédible et fonctionnel AVANT toute demande (approbation Paddle stricte).
2. Demander un compte marchand **Paddle** (test onboarding marocain) + ouvrir **Polar** (sandbox) en secours.
3. **TEST CRITIQUE** : un abonnement de bout en bout avec une **vraie carte marocaine** via le checkout MoR
   → vérifier la dotation e-commerce. Décide si le Rail 2 (Chari Pay) est nécessaire.
4. Évaluer le sandbox **Chari Pay** (API Stripe-like → estimer la réutilisation des Edge Functions).
5. Valider **banque + Office des Changes** (le point réglementaire à sécuriser).
6. Formaliser le rail **virement + séquestre** pour les engins.
7. Toutes les clés API en variables d'env Supabase — jamais dans le chat ni committées.

Sources clés : Paddle supported countries / get-paid ; Office des Changes (oc.gov.ma) ; Polar supported
countries ; ChariBaaS ; Escrow.com. (Détail dans l'historique de la recherche.)
