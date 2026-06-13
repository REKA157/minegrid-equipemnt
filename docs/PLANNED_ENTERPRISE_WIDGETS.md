# Planned Enterprise Widgets — fiches techniques

Ces widgets ont une **vraie valeur métier** mais **pas encore** de provider de données réel
ni de table déployée. Ils ne sont **pas** supprimés : leur définition reste dans la config
métier, mais ils sont **exclus des `validIds`** → invisibles tant qu'ils ne sont pas branchés.

Source de vérité machine-lisible : [`src/pages/widgets/plannedEnterpriseWidgets.ts`](../src/pages/widgets/plannedEnterpriseWidgets.ts)
(garde-fou : `src/pages/widgets/plannedEnterpriseWidgets.test.ts`).

## Règles

- ❌ Ne pas afficher de widget vide.
- ❌ Ne pas inventer de données.
- ❌ Ne pas supprimer la valeur métier (définition conservée dans la config).
- ✅ Réactivation **uniquement** quand provider + table(s) + handler + validId existent.

## Checklist de réactivation (par widget)

1. Déployer la/les **table(s)** cible(s) (Supabase + RLS).
2. Écrire le **provider** réel (`utils/api/…`) avec un **état vide honnête** (jamais de mock).
3. Ajouter un **handler** `widget.id` dans `components/dashboard/WidgetRenderer.tsx`.
4. Ajouter l'id au **`validIds`** du `EnterpriseDashboard<Role>Display.tsx`.
5. Retirer l'entrée du registry `plannedEnterpriseWidgets.ts` + mettre à jour cette fiche.

---

## 1. `tx-assigned-inspections` — « Missions d'inspection » (Mécanicien)

- **Rôle** : mecanicien
- **Définition conservée** : `src/pages/widgets/MecanicienWidgets.js`
- **Tables cibles** : `inspection_requests`, `inspection_reports`
- **Provider à créer** : `getAssignedInspections` dans `utils/api/inspections.ts`
- **Valeur métier** : contrôles engins assignés au mécanicien sur les dossiers transaction.
  Alimente la confiance acheteur (inspection avant paiement) — cœur de la couche *trust*.
- **Statut** : `planned` (masqué).

## 2. `tx-assigned-transports` — « Missions transport » (Transporteur)

- **Rôle** : transporteur
- **Définition conservée** : `src/pages/widgets/TransporteurWidgets.js`
- **Tables cibles** : `logistics_requests`, `transport_quotes`, `shipments`
- **Provider à créer** : `getAssignedTransports` dans `utils/api/transport.ts`
- **Valeur métier** : enlèvements / livraisons rattachés aux dossiers transaction.
  Exécution logistique de la transaction de bout en bout.
- **Statut** : `planned` (masqué).

## 3. `transaction-broker-financing` — « Dossiers financement » (Courtier)

- **Rôle** : courtier
- **Définition conservée** : `src/pages/widgets/CourtierWidgets.js`
- **Tables cibles** : `finance_applications`, `partner_submissions`
- **Provider à créer** : `getBrokerFinancingDossiers` dans `utils/api/courtier.ts`
- **Valeur métier** : demandes de financement liées aux dossiers où l'utilisateur est courtier.
  Monétisation + déblocage d'achats.
- **Statut** : `planned` (masqué).
