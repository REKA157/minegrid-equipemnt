/**
 * Caractéristiques PERTINENTES par type d'engin, pour le formulaire de
 * publication et l'affichage des fiches.
 *
 * Les champs UNIVERSELS (poids opérationnel, puissance moteur, dimensions) sont
 * déjà gérés directement par le formulaire. Ce fichier ajoute, PAR CATÉGORIE,
 * les caractéristiques spécifiques attendues d'un tel engin (ex : capacité en
 * t/h pour un concasseur, capacité de levage pour une grue).
 *
 * Le stockage reste souple : toutes ces valeurs vont dans la colonne JSONB
 * `machines.specifications`, sous la clé indiquée par `key`.
 */
export interface SpecFieldDef {
  /** Clé stockée dans `specifications` (ex : "bucketCapacity"). */
  key: string;
  /** Libellé affiché à l'utilisateur (ex : "Capacité du godet"). */
  label: string;
  /** Unité affichée à côté du champ / de la valeur (ex : "m³"). */
  unit?: string;
  /** Type de saisie. `select` utilise `options`. */
  type?: 'number' | 'text' | 'select';
  /** Choix pour un champ `select`. */
  options?: string[];
  /** Exemple de valeur (placeholder). */
  placeholder?: string;
}

/**
 * Champs spécifiques par catégorie. Les libellés de catégorie doivent
 * correspondre EXACTEMENT à ceux du sélecteur de publication.
 */
export const SPEC_FIELDS_BY_CATEGORY: Record<string, SpecFieldDef[]> = {
  'Pelles hydrauliques': [
    { key: 'digDepth', label: 'Profondeur de fouille max', unit: 'm', type: 'number', placeholder: 'Ex : 6.5' },
    { key: 'bucketCapacity', label: 'Capacité du godet', unit: 'm³', type: 'number', placeholder: 'Ex : 1.2' },
    { key: 'maxReach', label: 'Portée max', unit: 'm', type: 'number', placeholder: 'Ex : 9.8' },
  ],
  'Bulldozers': [
    { key: 'bladeCapacity', label: 'Capacité de la lame', unit: 'm³', type: 'number', placeholder: 'Ex : 3.4' },
    { key: 'bladeWidth', label: 'Largeur de lame', unit: 'm', type: 'number', placeholder: 'Ex : 3.2' },
    { key: 'bladeType', label: 'Type de lame', type: 'select', options: ['Droite (S)', 'Inclinable (A)', 'En U', 'Semi-U (SU)'] },
  ],
  'Chargeurs': [
    { key: 'bucketCapacity', label: 'Capacité du godet', unit: 'm³', type: 'number', placeholder: 'Ex : 2.5' },
    { key: 'tippingLoad', label: 'Charge de basculement', unit: 'kg', type: 'number', placeholder: 'Ex : 8200' },
  ],
  'Concasseurs': [
    { key: 'throughput', label: 'Capacité', unit: 't/h', type: 'number', placeholder: 'Ex : 250' },
    { key: 'crusherType', label: 'Type', type: 'select', options: ['Mâchoire', 'Percussion', 'Cône', 'Giratoire'] },
    { key: 'feedOpening', label: "Ouverture d'admission", unit: 'mm', type: 'number', placeholder: 'Ex : 1100' },
  ],
  'Cribles': [
    { key: 'throughput', label: 'Capacité', unit: 't/h', type: 'number', placeholder: 'Ex : 300' },
    { key: 'screeningArea', label: 'Surface de criblage', unit: 'm²', type: 'number', placeholder: 'Ex : 12' },
    { key: 'deckCount', label: "Nombre d'étages", type: 'number', placeholder: 'Ex : 3' },
  ],
  'Foreuses': [
    { key: 'drillDepth', label: 'Profondeur de forage', unit: 'm', type: 'number', placeholder: 'Ex : 30' },
    { key: 'drillDiameter', label: 'Diamètre de forage', unit: 'mm', type: 'number', placeholder: 'Ex : 115' },
  ],
  'Grues': [
    { key: 'liftCapacity', label: 'Capacité de levage max', unit: 't', type: 'number', placeholder: 'Ex : 50' },
    { key: 'boomHeight', label: 'Hauteur de flèche', unit: 'm', type: 'number', placeholder: 'Ex : 40' },
    { key: 'maxReach', label: 'Portée max', unit: 'm', type: 'number', placeholder: 'Ex : 32' },
  ],
  'Niveleuses': [
    { key: 'bladeWidth', label: 'Largeur de la lame', unit: 'm', type: 'number', placeholder: 'Ex : 3.7' },
    { key: 'gearCount', label: 'Nombre de vitesses', type: 'number', placeholder: 'Ex : 6' },
  ],
  'Compacteurs': [
    { key: 'compactionWidth', label: 'Largeur de compactage', unit: 'm', type: 'number', placeholder: 'Ex : 2.1' },
    { key: 'centrifugalForce', label: 'Force centrifuge', unit: 'kN', type: 'number', placeholder: 'Ex : 250' },
  ],
  'Outils de démolition': [
    { key: 'toolWeight', label: "Poids de l'outil", unit: 'kg', type: 'number', placeholder: 'Ex : 1500' },
    { key: 'oilFlow', label: "Débit d'huile requis", unit: 'l/min', type: 'number', placeholder: 'Ex : 120' },
    { key: 'reach', label: 'Portée', unit: 'm', type: 'number', placeholder: 'Ex : 18' },
  ],
};

/** Champs spécifiques attendus pour une catégorie donnée (vide si inconnue). */
export function specFieldsForCategory(category?: string | null): SpecFieldDef[] {
  if (!category) return [];
  return SPEC_FIELDS_BY_CATEGORY[category] || [];
}

/**
 * Table de correspondance clé → (libellé, unité), pour l'AFFICHAGE des fiches.
 * Couvre à la fois les champs universels historiques et tous les champs
 * spécifiques ci-dessus, afin d'afficher n'importe quelle caractéristique
 * enregistrée sans coder chaque cas en dur.
 */
export const SPEC_LABELS: Record<string, { label: string; unit?: string }> = {
  weight: { label: 'Poids', unit: 'kg' },
  workingWeight: { label: 'Poids opérationnel', unit: 'kg' },
  operatingCapacity: { label: "Capacité d'exploitation", unit: 'kg' },
  dimensions: { label: 'Dimensions' },
  ...Object.fromEntries(
    Object.values(SPEC_FIELDS_BY_CATEGORY)
      .flat()
      .map((f) => [f.key, { label: f.label, unit: f.unit }]),
  ),
};

/**
 * Transforme un objet `specifications` en lignes affichables
 * `{ label, value }`, en ignorant les valeurs vides et l'objet `power`
 * (affiché séparément par les fiches). Utilisé pour montrer les
 * caractéristiques spécifiques d'un engin quelle que soit sa catégorie.
 */
export function formatSpecEntries(
  specifications: Record<string, unknown> | null | undefined,
): Array<{ key: string; label: string; value: string }> {
  if (!specifications) return [];
  const rows: Array<{ key: string; label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(specifications)) {
    if (key === 'power') continue; // géré à part par les fiches
    if (raw == null || raw === '' || raw === 0) continue;
    if (typeof raw === 'object') continue; // pas d'objet imbriqué inattendu
    const meta = SPEC_LABELS[key];
    const label = meta?.label || key;
    const unit = meta?.unit ? ` ${meta.unit}` : '';
    const value = typeof raw === 'number' ? `${raw.toLocaleString('fr-FR')}${unit}` : `${raw}${unit}`;
    rows.push({ key, label, value });
  }
  return rows;
}
