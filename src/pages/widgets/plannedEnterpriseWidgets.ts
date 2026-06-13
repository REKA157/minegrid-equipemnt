/**
 * Registry « Planned Enterprise Widgets ».
 *
 * Ces widgets ont une VRAIE valeur métier mais pas encore de provider de
 * données réel ni de table déployée. Règle anti-façade appliquée :
 *   - leur définition RESTE dans la config métier (valeur conservée, jamais supprimée) ;
 *   - ils sont ABSENTS des `validIds` → invisibles, jamais rendus vides ;
 *   - aucune donnée fictive n'est inventée ;
 *   - réactivation = quand provider + table(s) + validId existent (voir checklist).
 *
 * Procédure de réactivation d'un widget planifié :
 *   1. Déployer la/les table(s) cible(s) (Supabase + RLS).
 *   2. Écrire le provider réel (utils/api/…), avec état vide honnête.
 *   3. Ajouter un handler `widget.id` dans `components/dashboard/WidgetRenderer.tsx`.
 *   4. Ajouter l'id au `validIds` du dashboard du rôle (EnterpriseDashboard<Role>Display.tsx).
 *   5. Retirer l'entrée correspondante de ce registry.
 *
 * Tant que ces 5 étapes ne sont pas faites, NE PAS ajouter l'id au validId.
 * Voir aussi docs/PLANNED_ENTERPRISE_WIDGETS.md (fiches techniques détaillées).
 */
export interface PlannedEnterpriseWidget {
  /** id du widget, tel que défini dans la config métier (ne pas renommer sans migration). */
  id: string;
  /** rôle/métier porteur. */
  role: 'mecanicien' | 'transporteur' | 'courtier';
  /** fichier de config où la définition est conservée. */
  configModule: string;
  /** libellé cible une fois branché (peut différer du title actuel). */
  targetTitle: string;
  /** tables Supabase requises avant activation. */
  targetTables: string[];
  /** provider data réel à écrire (utils/api). */
  targetProvider: string;
  /** valeur métier visée (pourquoi on ne supprime pas). */
  businessValue: string;
  status: 'planned';
}

export const PLANNED_ENTERPRISE_WIDGETS: PlannedEnterpriseWidget[] = [
  {
    id: 'tx-assigned-inspections',
    role: 'mecanicien',
    configModule: 'src/pages/widgets/MecanicienWidgets.js',
    targetTitle: "Missions d'inspection",
    targetTables: ['inspection_requests', 'inspection_reports'],
    targetProvider: 'getAssignedInspections (à créer dans utils/api/inspections.ts)',
    businessValue:
      "Contrôles engins assignés au mécanicien sur les dossiers transaction : alimente la confiance acheteur (inspection avant paiement) — cœur de la couche trust.",
    status: 'planned',
  },
  {
    id: 'tx-assigned-transports',
    role: 'transporteur',
    configModule: 'src/pages/widgets/TransporteurWidgets.js',
    targetTitle: 'Missions transport',
    targetTables: ['logistics_requests', 'transport_quotes', 'shipments'],
    targetProvider: 'getAssignedTransports (à créer dans utils/api/transport.ts)',
    businessValue:
      "Enlèvements / livraisons rattachés aux dossiers transaction : exécution logistique de la transaction de bout en bout.",
    status: 'planned',
  },
  {
    id: 'transaction-broker-financing',
    role: 'courtier',
    configModule: 'src/pages/widgets/CourtierWidgets.js',
    targetTitle: 'Dossiers financement',
    targetTables: ['finance_applications', 'partner_submissions'],
    targetProvider: 'getBrokerFinancingDossiers (à créer dans utils/api/courtier.ts)',
    businessValue:
      "Demandes de financement liées aux dossiers où l'utilisateur est courtier : monétisation + déblocage d'achats.",
    status: 'planned',
  },
];

/** ids des widgets planifiés — NE DOIVENT PAS apparaître dans un validId tant que `status==='planned'`. */
export const PLANNED_ENTERPRISE_WIDGET_IDS: string[] = PLANNED_ENTERPRISE_WIDGETS.map((w) => w.id);
