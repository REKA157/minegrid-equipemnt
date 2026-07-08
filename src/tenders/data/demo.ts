/**
 * Données de démonstration du module Appels d'offres.
 *
 * Objectif : que l'application soit immédiatement utilisable et parlante
 * sans aucune API branchée. Les dates sont calculées par rapport à
 * aujourd'hui pour que le tableau de bord (urgences, échéances) reste
 * réaliste quel que soit le jour où l'on ouvre l'app.
 */

import type {
  CompanyProfile,
  GeneratedDocument,
  LibraryItem,
  Tender,
} from '../types';
import { nowIso } from '../types';
import { DEFAULT_GONOGO_CRITERIA } from '../lib/scoring';

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Entreprise exemple
// ---------------------------------------------------------------------------

export const DEMO_COMPANY: CompanyProfile = {
  name: 'Atlas Infrastructures SARL',
  legalForm: 'SARL au capital de 2 500 000 MAD',
  address: '14, Boulevard Mohammed V',
  city: 'Casablanca',
  country: 'Maroc',
  registrationIds: [
    { label: 'ICE', value: '001528374000045' },
    { label: 'RC', value: 'Casablanca 425 618' },
    { label: 'IF', value: '40587123' },
    { label: 'CNSS', value: '8514362' },
  ],
  phone: '+212 5 22 45 78 90',
  email: 'contact@atlas-infra.ma',
  website: 'www.atlas-infra.ma',
  capital: '2 500 000 MAD',
  employees: '85',
  yearFounded: '2009',
  presentation:
    "Atlas Infrastructures est une entreprise générale de BTP basée à Casablanca, spécialisée dans les travaux de voirie et réseaux divers (VRD), le génie civil et les aménagements urbains. Depuis 2009, l'entreprise a réalisé plus de 120 chantiers pour des maîtres d'ouvrage publics et privés au Maroc.\n\nNotre organisation repose sur trois pôles : un bureau d'études intégré (6 ingénieurs), un pôle travaux (10 conducteurs de travaux et chefs de chantier) et un parc matériel en propre qui garantit notre autonomie d'exécution.",
  insurances:
    'Responsabilité civile professionnelle — AXA Assurance Maroc, police n° RC-2024-88412 (couverture 10 000 000 MAD).\nTous risques chantier — Wafa Assurance, police n° TRC-2024-1157.\nDécennale génie civil — police n° DEC-2023-3391.',
  certifications: [
    { id: 'cert1', name: 'Qualification CNCE classe 2 — VRD', issuer: 'Ministère de l\'Équipement', validUntil: inDays(400) },
    { id: 'cert2', name: 'ISO 9001:2015', issuer: 'Bureau Veritas', validUntil: inDays(280) },
    { id: 'cert3', name: 'ISO 45001 — Santé et sécurité au travail', issuer: 'Bureau Veritas', validUntil: inDays(280) },
  ],
  references: [
    {
      id: 'ref1',
      title: 'Réhabilitation de la voirie du quartier Al Fida',
      client: 'Commune de Casablanca',
      year: '2024',
      amount: '18 400 000 MAD',
      description:
        'Réfection complète de 6,2 km de voirie urbaine : terrassements, assainissement, bordures, revêtement en enrobé, signalisation. Délai tenu : 9 mois. Zéro accident déclaré.',
    },
    {
      id: 'ref2',
      title: 'Plateforme logistique Zenata — lots VRD et clôtures',
      client: 'SAZ (Société d\'Aménagement Zenata)',
      year: '2023',
      amount: '11 250 000 MAD',
      description:
        'VRD complets d\'une plateforme de 14 ha : voiries lourdes, réseaux EP/EU, bassin de rétention, éclairage. Coordination avec 4 entreprises co-traitantes.',
    },
    {
      id: 'ref3',
      title: 'Aménagement de la corniche de Mohammedia — tranche 2',
      client: 'Agence Urbaine de Mohammedia',
      year: '2022',
      amount: '9 800 000 MAD',
      description:
        'Promenade piétonne, mobilier urbain, espaces verts et réseau d\'arrosage. Chantier en site occupé avec maintien des accès riverains.',
    },
  ],
  team: [
    { id: 'tm1', name: 'Karim Bensaïd', role: 'Directeur de projet', experience: '18 ans', qualifications: 'Ingénieur EHTP, habilitation AIPR' },
    { id: 'tm2', name: 'Salma El Amrani', role: 'Ingénieure méthodes / QSE', experience: '9 ans', qualifications: 'Ingénieure EMI, auditrice ISO 45001' },
    { id: 'tm3', name: 'Rachid Toumi', role: 'Conducteur de travaux principal', experience: '14 ans', qualifications: 'BTS Travaux Publics, CACES R482' },
    { id: 'tm4', name: 'Nadia Chraïbi', role: 'Responsable administrative marchés', experience: '11 ans', qualifications: 'Master droit des marchés publics' },
  ],
  equipment: [
    { id: 'eq1', name: 'Pelle hydraulique 21 t (CAT 320)', quantity: 3, note: 'Dont une avec BRH' },
    { id: 'eq2', name: 'Chargeuse sur pneus (966H)', quantity: 2, note: '' },
    { id: 'eq3', name: 'Finisseur enrobés', quantity: 1, note: 'Largeur 2,5–5 m' },
    { id: 'eq4', name: 'Compacteurs (mono-cylindre / tandem)', quantity: 4, note: '' },
    { id: 'eq5', name: 'Camions 8x4 (19 t)', quantity: 6, note: '' },
    { id: 'eq6', name: 'Centrale à béton mobile', quantity: 1, note: '30 m³/h' },
  ],
  adminDocs: [
    { id: 'ad1', name: 'Attestation fiscale', kind: 'Fiscal', validUntil: inDays(45), available: true },
    { id: 'ad2', name: 'Attestation CNSS', kind: 'Social', validUntil: inDays(30), available: true },
    { id: 'ad3', name: 'Attestation RC professionnelle', kind: 'Assurance', validUntil: inDays(200), available: true },
    { id: 'ad4', name: 'Certificat de qualification CNCE', kind: 'Qualification', validUntil: inDays(400), available: true },
    { id: 'ad5', name: 'Kbis / Modèle J récent', kind: 'Juridique', validUntil: inDays(-10), available: false },
  ],
  signatoryName: 'Karim Bensaïd',
  signatoryRole: 'Gérant',
};

// ---------------------------------------------------------------------------
// Appels d'offres exemples
// ---------------------------------------------------------------------------

export function buildDemoTenders(): Tender[] {
  const now = nowIso();

  const tenderBtp: Tender = {
    id: 'demo_ao_btp',
    reference: 'AO n° 17/2026/DT',
    title: 'Travaux d\'aménagement de la voirie et des réseaux du parc industriel Ouled Saleh',
    buyer: 'Commune de Bouskoura — Direction des Travaux',
    sector: 'btp',
    marketType: 'travaux',
    status: 'en_redaction',
    deadline: inDays(12),
    estimatedAmount: 24_500_000,
    currency: 'MAD',
    description:
      'Aménagement de 4,8 km de voiries lourdes, réseaux d\'assainissement EP/EU, éclairage public et signalisation pour la tranche 1 du parc industriel. Visite de site obligatoire. Caution provisoire : 350 000 MAD.',
    awardCriteria: [
      { id: 'c1', label: 'Prix des prestations', weight: 50 },
      { id: 'c2', label: 'Valeur technique (mémoire)', weight: 40 },
      { id: 'c3', label: 'Délai d\'exécution', weight: 10 },
    ],
    requiredDocuments: [
      { id: 'rd1', label: 'Déclaration sur l\'honneur', category: 'administratif', available: true },
      { id: 'rd2', label: 'Attestation fiscale (moins de 3 mois)', category: 'administratif', available: true },
      { id: 'rd3', label: 'Attestation CNSS', category: 'administratif', available: true },
      { id: 'rd4', label: 'Certificat de qualification CNCE classe 2', category: 'administratif', available: true },
      { id: 'rd5', label: 'Caution provisoire (350 000 MAD)', category: 'administratif', available: false, note: 'Demande envoyée à la banque le ' + new Date().toLocaleDateString('fr-FR') },
      { id: 'rd6', label: 'Mémoire technique', category: 'technique', available: false, generatedDocId: 'demo_doc_memoire_btp' },
      { id: 'rd7', label: 'Planning d\'exécution détaillé', category: 'technique', available: false },
      { id: 'rd8', label: 'Bordereau des prix — détail estimatif', category: 'financier', available: false },
    ],
    requirements: [
      {
        id: 'req_btp_1',
        code: 'EL-001',
        text: 'Qualification CNCE classe 2 secteur VRD exigée',
        source: 'RC art. 5 — conditions de participation',
        category: 'Éligibilité',
        level: 'imperatif',
        coverage: 'conforme',
        response:
          'Atlas Infrastructures dispose de la qualification CNCE classe 2 secteur VRD, valide jusqu\'en 2027. La copie certifiée conforme du certificat est jointe au dossier administratif (pièce n° 4).',
        responsible: 'Nadia Chraïbi',
        evidence: 'Certificat CNCE n° C2-VRD-2024 (dossier administratif, pièce 4)',
        comment: 'Certificat valide jusqu\'en 2027.',
      },
      {
        id: 'req_btp_2',
        code: 'PI-001',
        text: 'Caution provisoire de 350 000 MAD à joindre au pli',
        source: 'RC art. 8 — garanties',
        category: 'Pièces à fournir',
        level: 'imperatif',
        coverage: 'a_traiter',
        response: '',
        responsible: 'Nadia Chraïbi',
        evidence: '',
        comment: 'Demande en cours auprès de la banque — délai d\'émission 5 jours ouvrés.',
      },
      {
        id: 'req_btp_3',
        code: 'EL-002',
        text: 'Chiffre d\'affaires travaux ≥ 20 M MAD/an sur les 3 derniers exercices',
        source: 'RC art. 5 — capacités financières',
        category: 'Éligibilité',
        level: 'imperatif',
        coverage: 'conforme',
        response:
          'Le chiffre d\'affaires travaux moyen d\'Atlas Infrastructures sur les exercices 2023-2025 s\'établit à 31 M MAD, soit 155 % du seuil exigé. Les attestations de chiffre d\'affaires visées par le commissaire aux comptes sont jointes.',
        responsible: 'Karim Bensaïd',
        evidence: 'Attestations CA 2023-2025 visées CAC',
        comment: 'CA moyen 2023–2025 : 31 M MAD.',
      },
      {
        id: 'req_btp_4',
        code: 'BL-001',
        text: 'Visite de site obligatoire avec attestation jointe à l\'offre, sous peine de rejet',
        source: 'RC art. 6 — visite des lieux',
        category: 'Point bloquant',
        level: 'imperatif',
        coverage: 'non_conforme',
        response: '',
        responsible: 'Rachid Toumi',
        evidence: '',
        comment: 'Visite pas encore effectuée — dernière session dans 4 jours. URGENT.',
      },
      {
        id: 'req_btp_5',
        code: 'DL-001',
        text: 'Délai d\'exécution plafonné à 10 mois à compter de l\'ordre de service',
        source: 'CCAP art. 3 — délais',
        category: 'Délais / planning',
        level: 'imperatif',
        coverage: 'partiel',
        response:
          'Notre planning d\'exécution respecte le délai de 10 mois grâce à une exécution « en tiroir » par tronçons de 1,2 km et une mobilisation en double équipe sur le lot assainissement. Le planning détaillé (Gantt) est joint à l\'offre technique.',
        responsible: 'Salma El Amrani',
        evidence: 'Planning prévisionnel joint à l\'offre',
        comment: 'Planning préliminaire à 10,5 mois — optimisation double équipe en cours de validation.',
      },
      {
        id: 'req_btp_6',
        code: 'TE-001',
        text: 'Compactage : 98,5 % OPM exigé sur les couches de forme, contrôles par laboratoire agréé à la charge de l\'entreprise',
        // NB : texte identique (après normalisation) à technicalRequirements[2]
        // de l'analyse démo — garantit l'idempotence de la reprise.
        source: 'CCTP art. 4.2 — terrassements',
        category: 'Technique',
        level: 'imperatif',
        coverage: 'conforme',
        response:
          'Le compactage sera contrôlé tronçon par tronçon par le laboratoire agréé LPEE (convention jointe), avec essais de plaque et gamma-densimètre. Objectif contractuel : 98,5 % OPM ; nos 4 compacteurs (mono-cylindre et tandem) garantissent l\'énergie de compactage requise. Les fiches de contrôle seront transmises au maître d\'œuvre au fil de l\'eau.',
        responsible: 'Rachid Toumi',
        evidence: 'Convention LPEE + fiches méthodes compactage',
        comment: '',
      },
      {
        id: 'req_btp_7',
        code: 'TE-002',
        text: 'Enrobés : grave bitume GB3 (fondation) + BBSG 0/10 (roulement), centrale agréée',
        source: 'CCTP art. 5.3 — chaussées',
        category: 'Technique',
        level: 'imperatif',
        coverage: 'conforme',
        response:
          'Les enrobés seront fournis par une centrale agréée (accord-cadre joint) et mis en œuvre avec notre finisseur (largeur 2,5–5 m). Les formulations GB3 et BBSG 0/10 seront soumises au visa du maître d\'œuvre avant application, avec planches d\'essai contractuelles.',
        responsible: 'Rachid Toumi',
        evidence: 'Accord-cadre centrale + fiches formulation',
        comment: '',
      },
      {
        id: 'req_btp_8',
        code: 'CO-001',
        // Même format que la dérivation depuis l'analyse (« titre : extrait »)
        // pour que « Reprendre dans le dossier » ne crée pas de doublon.
        text: 'Prix fermes et non révisables pendant toute la durée du marché : Aucune révision ni actualisation des prix ne sera admise (CCAP art. 10)',
        source: 'CCAP art. 10 — prix',
        category: 'Contractuel',
        level: 'important',
        coverage: 'partiel',
        response:
          'Nous acceptons le caractère ferme des prix. Pour sécuriser cet engagement sur 10 mois, nous avons obtenu de nos fournisseurs de liants et d\'acier des engagements de prix écrits couvrant la durée du chantier (joints en annexe), ce qui garantit l\'absence de réclamation ultérieure.',
        responsible: 'Karim Bensaïd',
        evidence: 'Engagements de prix fournisseurs (annexe)',
        comment: 'Engagement bitume signé ; engagement acier en attente de retour fournisseur.',
      },
    ],
    strategy: {
      positioning:
        'Positionner Atlas Infrastructures comme le candidat qui sécurise le délai de 10 mois : exécution en tiroir éprouvée sur deux chantiers comparables, moyens 100 % en propre, prix fournisseurs verrouillés dès la remise de l\'offre.',
      winThemes: [
        'Exécution « en tiroir » par tronçons : délai de 10 mois tenu avec 3 semaines de marge',
        'Centrale à béton mobile sur site : cadences indépendantes des fournisseurs',
        'Prix fermes sans risque : engagements fournisseurs signés sur 10 mois',
      ],
      differentiators:
        'Parc matériel en propre (taux de disponibilité 94 %), encadrement ayant déjà réalisé ensemble Al Fida (18,4 M MAD) et Zenata (11,25 M MAD), laboratoire partenaire mobilisé dès la préparation.',
      criteriaApproaches: [
        {
          criterionId: 'c1',
          label: 'Prix des prestations',
          weight: 50,
          approach:
            'Chiffrage serré grâce aux engagements fournisseurs et à la centrale sur site (économie estimée 4 % sur les bétons). Pas de provision « peur » : les risques sont couverts par des engagements écrits, pas par du prix.',
        },
        {
          criterionId: 'c2',
          label: 'Valeur technique (mémoire)',
          weight: 40,
          approach:
            'Mémoire structuré en miroir du CCTP : chaque exigence (compactage 98,5 %, GB3/BBSG, EP série 135A) reçoit une réponse dédiée avec preuve. Mettre en avant le phasage en tiroir avec schéma.',
        },
        {
          criterionId: 'c3',
          label: 'Délai d\'exécution',
          weight: 10,
          approach:
            'Proposer 10 mois ferme avec jalons intermédiaires contractuels et marge météo intégrée — crédibilisé par les références Al Fida (délai tenu).',
        },
      ],
      vigilancePoints:
        'Visite de site obligatoire (attestation sous peine de rejet) — à faire avant tout. Caution provisoire à obtenir. Prix fermes : joindre impérativement les engagements fournisseurs pour crédibiliser le chiffrage.',
      updatedAt: now,
      simulated: true,
    },
    dceAnalysis: {
      analyzedAt: now,
      simulated: true,
      files: [
        { name: 'DCE_AO17_2026_Bouskoura.zip', size: 18_432_000 },
      ],
      detectedDocuments: [
        { name: 'Règlement de consultation.pdf', type: 'RC', pages: 22 },
        { name: 'CCAP.pdf', type: 'CCAP', pages: 34 },
        { name: 'CCTP — Lot unique VRD.pdf', type: 'CCTP', pages: 87 },
        { name: 'Bordereau des prix.xlsx', type: 'BPU', pages: undefined },
        { name: 'Plans (12 fichiers).pdf', type: 'Plans', pages: 12 },
      ],
      keyClauses: [
        {
          title: 'Pénalités de retard',
          excerpt: 'Pénalité de 1/1000 du montant du marché par jour calendaire de retard, plafonnée à 10 %.',
          risk: 'moyen',
        },
        {
          // Le titre+extrait concaténés matchent CO-001 (dédup normalisée).
          title: 'Prix fermes et non révisables pendant toute la durée du marché',
          excerpt: 'Aucune révision ni actualisation des prix ne sera admise (CCAP art. 10).',
          risk: 'eleve',
        },
        {
          title: 'Retenue de garantie',
          excerpt: 'Retenue de 10 % remboursable à la réception définitive (12 mois après réception provisoire).',
          risk: 'moyen',
        },
        {
          title: 'Sous-traitance',
          excerpt: 'Sous-traitance limitée à 30 % du montant, avec agrément préalable du maître d\'ouvrage.',
          risk: 'faible',
        },
      ],
      keyDates: [
        { id: 'kd1', label: 'Visite de site (dernière session)', date: inDays(4) },
        { id: 'kd2', label: 'Date limite des questions', date: inDays(6) },
        { id: 'kd3', label: 'Remise des offres', date: inDays(12) },
        { id: 'kd4', label: 'Ouverture des plis', date: inDays(13) },
      ],
      // Libellés identiques aux pièces rd6/rd7/rd8 du dossier (idempotence).
      requiredDocuments: [
        { label: 'Mémoire technique', category: 'technique' },
        { label: 'Planning d\'exécution détaillé', category: 'technique' },
        { label: 'Bordereau des prix — détail estimatif', category: 'financier' },
      ],
      awardCriteria: [
        { id: 'c1', label: 'Prix des prestations', weight: 50 },
        { id: 'c2', label: 'Valeur technique (mémoire)', weight: 40 },
        { id: 'c3', label: 'Délai d\'exécution', weight: 10 },
      ],
      // Textes alignés sur les exigences pré-remplies (req_btp_6/7) pour que
      // « Reprendre dans le dossier » soit idempotent (dédup par texte normalisé).
      technicalRequirements: [
        'Enrobés : grave bitume GB3 (fondation) + BBSG 0/10 (roulement), centrale agréée',
        'Réseau EP en béton armé série 135A, Ø 400 à 1000 mm.',
        'Compactage : 98,5 % OPM exigé sur les couches de forme, contrôles par laboratoire agréé à la charge de l\'entreprise',
        'Éclairage public LED avec télégestion, conformité NM 06.7.001.',
      ],
      contractualRisks: [
        'Prix fermes non révisables sur 10 mois : risque bitume/acier à couvrir dans les prix.',
        'Pénalité plafonnée à 10 % mais sans clause d\'intempéries explicite.',
        'Réception définitive à 12 mois : immobilisation de la retenue de garantie.',
      ],
      // Alignés (à la normalisation près) sur BL-001 et PI-001 pré-remplis.
      blockingPoints: [
        'Visite de site obligatoire avec attestation jointe à l\'offre, sous peine de rejet',
        'Caution provisoire de 350 000 MAD à joindre au pli',
      ],
      summary:
        'Marché de travaux VRD classique et bien structuré, dans le cœur de métier de l\'entreprise. Deux points de vigilance majeurs : la visite de site obligatoire (dernière session imminente) et les prix fermes non révisables qui imposent de sécuriser les prix bitume. La pondération 50/40/10 valorise fortement le mémoire technique : un mémoire soigné peut compenser un prix légèrement supérieur.',
    },
    goNoGo: {
      criteria: DEFAULT_GONOGO_CRITERIA.map((c) => ({ ...c })),
      result: undefined,
      decision: undefined,
    },
    tasks: [
      { id: 't1', title: 'Inscrire Rachid à la visite de site', assignee: 'Nadia Chraïbi', dueDate: inDays(2), status: 'en_cours', comment: 'Formulaire envoyé, attente confirmation.' },
      { id: 't2', title: 'Obtenir la caution provisoire', assignee: 'Nadia Chraïbi', dueDate: inDays(7), status: 'en_cours' },
      { id: 't3', title: 'Rédiger le mémoire technique', assignee: 'Salma El Amrani', dueDate: inDays(8), status: 'a_faire' },
      { id: 't4', title: 'Chiffrer le bordereau des prix', assignee: 'Karim Bensaïd', dueDate: inDays(9), status: 'a_faire' },
      { id: 't5', title: 'Consultation fournisseurs enrobés (prix fermes)', assignee: 'Rachid Toumi', dueDate: inDays(5), status: 'a_faire' },
    ],
    history: [
      { id: 'h1', date: inDays(-6), author: 'Nadia Chraïbi', action: 'Création de l\'opportunité' },
      { id: 'h2', date: inDays(-5), author: 'Salma El Amrani', action: 'Analyse du DCE (simulation)', detail: '5 documents détectés, 2 points bloquants' },
      { id: 'h3', date: inDays(-3), author: 'Karim Bensaïd', action: 'Passage au statut « En rédaction »' },
    ],
    createdAt: inDays(-6),
    updatedAt: now,
  };

  const tenderSecu: Tender = {
    id: 'demo_ao_secu',
    reference: 'AO n° 42/2026/DSI',
    title: 'Gardiennage et télésurveillance de 8 sites administratifs — marché reconductible',
    buyer: 'Conseil Régional Casablanca-Settat',
    sector: 'securite',
    marketType: 'services',
    status: 'en_analyse',
    deadline: inDays(25),
    estimatedAmount: 6_800_000,
    currency: 'MAD',
    description:
      'Prestations de gardiennage humain (24h/24 sur 3 sites, horaires ouvrés sur 5 sites) et télésurveillance avec levée de doute. Marché d\'un an reconductible 2 fois. Agrément DGSN exigé.',
    awardCriteria: [
      { id: 'c1', label: 'Prix', weight: 60 },
      { id: 'c2', label: 'Valeur technique', weight: 30 },
      { id: 'c3', label: 'Performance sociale (insertion)', weight: 10 },
    ],
    requiredDocuments: [
      { id: 'rd1', label: 'Agrément DGSN gardiennage', category: 'administratif', available: false, note: 'Nous n\'avons PAS cet agrément — partenariat nécessaire.' },
      { id: 'rd2', label: 'Attestation fiscale', category: 'administratif', available: true },
      { id: 'rd3', label: 'Note méthodologique d\'exploitation', category: 'technique', available: false },
      { id: 'rd4', label: 'Bordereau des prix', category: 'financier', available: false },
    ],
    requirements: [
      {
        id: 'req_secu_1',
        code: 'BL-001',
        text: 'Agrément DGSN obligatoire pour les prestations de gardiennage, sous peine de rejet de l\'offre',
        source: 'RC art. 4 — conditions de participation',
        category: 'Point bloquant',
        level: 'imperatif',
        coverage: 'non_conforme',
        response: '',
        responsible: 'Karim Bensaïd',
        evidence: '',
        comment: 'Hors de notre périmètre d\'agrément actuel. Étudier un groupement avec une société agréée OU ne pas répondre.',
      },
      {
        id: 'req_secu_2',
        code: 'EL-001',
        text: 'Expérience de 3 marchés similaires de gardiennage sur les 5 dernières années',
        source: 'RC art. 5 — références exigées',
        category: 'Éligibilité',
        level: 'imperatif',
        coverage: 'non_conforme',
        response: '',
        responsible: 'Nadia Chraïbi',
        evidence: '',
        comment: 'Aucune référence en gardiennage. Vérifier si les références du partenaire potentiel peuvent être présentées en groupement.',
      },
      {
        id: 'req_secu_3',
        code: 'TE-001',
        text: 'Centre de télésurveillance certifié avec levée de doute sous 15 minutes',
        source: 'CCTP art. 3 — télésurveillance',
        category: 'Technique',
        level: 'imperatif',
        coverage: 'a_traiter',
        response: '',
        responsible: 'Salma El Amrani',
        evidence: '',
        comment: 'Dépend du partenaire retenu en cas de groupement.',
      },
    ],
    dceAnalysis: undefined,
    goNoGo: {
      criteria: DEFAULT_GONOGO_CRITERIA.map((c) => {
        // Pré-notation volontairement basse : hors cœur de métier.
        const low: Record<string, number> = {
          fit: 1, delay: 3, complexity: 2, competition: 1, margin: 2,
          capacity: 1, risk: 2, winChance: 1, workload: 3, admin: 1,
        };
        return { ...c, score: low[c.id] ?? 2 };
      }),
      result: undefined,
      decision: undefined,
    },
    tasks: [
      { id: 't1', title: 'Décision go/no-go en comité', assignee: 'Karim Bensaïd', dueDate: inDays(3), status: 'a_faire', comment: 'Le scoring préliminaire est défavorable.' },
    ],
    history: [
      { id: 'h1', date: inDays(-2), author: 'Nadia Chraïbi', action: 'Création de l\'opportunité', detail: 'Publication repérée sur le portail des marchés publics' },
    ],
    createdAt: inDays(-2),
    updatedAt: now,
  };

  const tenderIt: Tender = {
    id: 'demo_ao_it',
    reference: 'Consultation 2026-C-118',
    title: 'Refonte du portail intranet et gestion électronique des documents (GED)',
    buyer: 'Office National des Aéroports (ONDA) — DSI',
    sector: 'informatique',
    marketType: 'services',
    status: 'a_completer',
    deadline: inDays(19),
    estimatedAmount: 3_200_000,
    currency: 'MAD',
    description:
      'Conception, développement et déploiement d\'un portail intranet avec module GED (10 000 utilisateurs), reprise de l\'existant SharePoint, maintenance 3 ans. Soutenance orale prévue pour les 3 meilleurs offreurs.',
    awardCriteria: [
      { id: 'c1', label: 'Valeur technique', weight: 50 },
      { id: 'c2', label: 'Prix', weight: 30 },
      { id: 'c3', label: 'Équipe projet et références', weight: 20 },
    ],
    requiredDocuments: [
      { id: 'rd1', label: 'Dossier administratif', category: 'administratif', available: true },
      { id: 'rd2', label: 'Mémoire technique + maquettes', category: 'technique', available: false },
      { id: 'rd3', label: 'CV de l\'équipe projet', category: 'technique', available: true },
      { id: 'rd4', label: 'DPGF (décomposition du prix)', category: 'financier', available: false },
      { id: 'rd5', label: 'Plan d\'assurance qualité', category: 'technique', available: false },
    ],
    requirements: [
      {
        id: 'req_it_1',
        code: 'SE-001',
        text: 'Certification ISO 27001 ou politique de sécurité des systèmes d\'information documentée',
        source: 'CCTP art. 8 — sécurité',
        category: 'Sécurité / HSE',
        level: 'important',
        coverage: 'partiel',
        response:
          'Nous ne disposons pas de la certification ISO 27001, mais appliquons une politique SSI documentée (jointe en annexe) couvrant la gestion des accès, le chiffrement des données au repos et en transit, et la revue de sécurité avant chaque mise en production.',
        responsible: 'Salma El Amrani',
        evidence: 'Politique SSI v2.1 (annexe)',
        comment: 'Faire relire la politique SSI avant de la joindre.',
      },
      {
        id: 'req_it_2',
        code: 'TE-001',
        text: 'Hébergement des données sur le territoire marocain',
        source: 'CCTP art. 7 — hébergement',
        category: 'Technique',
        level: 'imperatif',
        coverage: 'conforme',
        response:
          'La solution sera hébergée dans le datacenter de notre partenaire à Casablanca (attestation d\'hébergement jointe), garantissant la localisation des données sur le territoire national et un PRA avec RPO < 4 h.',
        responsible: 'Karim Bensaïd',
        evidence: 'Attestation d\'hébergement du partenaire',
        comment: '',
      },
      {
        id: 'req_it_3',
        code: 'TE-002',
        text: 'Reprise de l\'existant : environ 250 000 documents SharePoint avec métadonnées',
        source: 'CCTP art. 5 — reprise de données',
        category: 'Technique',
        level: 'imperatif',
        coverage: 'a_traiter',
        response: '',
        responsible: 'Salma El Amrani',
        evidence: '',
        comment: 'Volumétrie à confirmer par question écrite — impact fort sur le chiffrage.',
      },
      {
        id: 'req_it_4',
        code: 'CO-001',
        text: 'Recette en deux temps : vérification d\'aptitude (VABF) puis vérification de service régulier (VSR) de 3 mois',
        source: 'CCAP art. 12 — réception',
        category: 'Contractuel',
        level: 'important',
        coverage: 'a_traiter',
        response: '',
        responsible: 'Karim Bensaïd',
        evidence: '',
        comment: 'Prévoir la charge de support pendant la VSR dans le chiffrage.',
      },
    ],
    dceAnalysis: undefined,
    goNoGo: {
      criteria: DEFAULT_GONOGO_CRITERIA.map((c) => {
        const mid: Record<string, number> = {
          fit: 3, delay: 4, complexity: 3, competition: 3, margin: 4,
          capacity: 3, risk: 3, winChance: 3, workload: 3, admin: 4,
        };
        return { ...c, score: mid[c.id] ?? 3 };
      }),
      result: undefined,
      decision: undefined,
    },
    tasks: [
      { id: 't1', title: 'Poser la question sur la volumétrie GED', assignee: 'Salma El Amrani', dueDate: inDays(4), status: 'a_faire' },
      { id: 't2', title: 'Confirmer la dispo de l\'équipe dev (nov–mars)', assignee: 'Karim Bensaïd', dueDate: inDays(6), status: 'a_faire' },
    ],
    history: [
      { id: 'h1', date: inDays(-4), author: 'Karim Bensaïd', action: 'Création de l\'opportunité' },
      { id: 'h2', date: inDays(-1), author: 'Nadia Chraïbi', action: 'Passage au statut « À compléter »', detail: '3 pièces techniques manquantes' },
    ],
    createdAt: inDays(-4),
    updatedAt: now,
  };

  return [tenderBtp, tenderSecu, tenderIt];
}

// ---------------------------------------------------------------------------
// Bibliothèque de contenus
// ---------------------------------------------------------------------------

export function buildDemoLibrary(): LibraryItem[] {
  const now = nowIso();
  return [
    {
      id: 'lib_clause_penalites',
      category: 'clause',
      title: 'Clause de pénalités de retard (standard)',
      content:
        'En cas de dépassement du délai contractuel d\'exécution, il sera appliqué une pénalité de 1/1000 (un pour mille) du montant du marché par jour calendaire de retard, sans mise en demeure préalable. Le montant cumulé des pénalités est plafonné à 10 % du montant du marché. Au-delà, le maître d\'ouvrage se réserve le droit de résilier le marché aux torts du titulaire.',
      tags: ['pénalités', 'délais', 'CCAP'],
      updatedAt: now,
    },
    {
      id: 'lib_clause_reception',
      category: 'clause',
      title: 'Clause de réception des prestations',
      content:
        'La réception provisoire sera prononcée après constat contradictoire de l\'achèvement des prestations conformément aux spécifications du CCTP. Les réserves éventuelles devront être levées dans un délai de 30 jours. La réception définitive interviendra 12 mois après la réception provisoire, sous réserve de la bonne tenue des ouvrages pendant le délai de garantie.',
      tags: ['réception', 'garantie'],
      updatedAt: now,
    },
    {
      id: 'lib_para_engagement_qualite',
      category: 'paragraphe',
      title: 'Engagement qualité (introduction mémoire)',
      content:
        'Notre entreprise place la qualité d\'exécution au cœur de son organisation. Chaque chantier fait l\'objet d\'un Plan d\'Assurance Qualité (PAQ) spécifique, décliné du système de management certifié ISO 9001:2015. Les points d\'arrêt et points critiques sont identifiés dès la préparation et tracés dans un registre de contrôle tenu à disposition du maître d\'œuvre.',
      tags: ['qualité', 'mémoire technique'],
      updatedAt: now,
    },
    {
      id: 'lib_para_dechets',
      category: 'paragraphe',
      title: 'Gestion des déchets de chantier',
      content:
        'Un Schéma d\'Organisation et de Gestion des Déchets (SOGED) sera mis en place dès l\'installation de chantier : tri à la source (inertes, DIB, déchets dangereux), bennes dédiées, bordereaux de suivi et évacuation exclusivement vers des filières agréées. Objectif : valorisation d\'au moins 70 % des déchets inertes.',
      tags: ['environnement', 'déchets', 'SOGED'],
      updatedAt: now,
    },
    {
      id: 'lib_metho_phasage_vrd',
      category: 'methodologie',
      title: 'Méthodologie type — chantier VRD en site urbain',
      content:
        'Phase 1 — Préparation (3 semaines) : installations, implantations, DICT et repérage des réseaux existants, constat d\'huissier des existants.\nPhase 2 — Terrassements et assainissement : exécution par tronçons de 200 m pour maintenir les circulations, blindage systématique des fouilles > 1,30 m.\nPhase 3 — Corps de chaussée et bordures : approvisionnements en flux tendu, contrôles de compactage par tronçon.\nPhase 4 — Revêtements et finitions : enrobés de nuit si nécessaire, signalisation définitive.\nPhase 5 — Réception : essais (étanchéité, ITV, plaque), dossier de récolement (DOE), levée de réserves.',
      tags: ['VRD', 'phasage', 'méthodologie'],
      updatedAt: now,
    },
    {
      id: 'lib_metho_agile',
      category: 'methodologie',
      title: 'Méthodologie type — projet informatique (agile sécurisé)',
      content:
        'Cadrage (4 semaines) : ateliers utilisateurs, backlog priorisé, architecture cible et POC des points à risque.\nRéalisation en sprints de 2 semaines : démonstration à chaque sprint, recette continue par le métier.\nQualité : revue de code systématique, chaîne CI/CD, tests automatisés (unitaires ≥ 70 % de couverture), audit de sécurité avant chaque mise en production.\nDéploiement progressif : site pilote puis généralisation, plan de conduite du changement (formations, guides, référents).\nRéversibilité : livraison du code source, de la documentation et un plan de réversibilité contractuel.',
      tags: ['informatique', 'agile', 'sprints'],
      updatedAt: now,
    },
    {
      id: 'lib_ref_alfida',
      category: 'reference',
      title: 'Référence — Voirie Al Fida (18,4 M MAD, 2024)',
      content:
        'Réhabilitation de 6,2 km de voirie urbaine pour la Commune de Casablanca : terrassements, assainissement, bordures, enrobés, signalisation. Contraintes : maintien de la circulation, coordination avec les concessionnaires de réseaux. Résultats : délai tenu (9 mois), zéro accident, PV de réception sans réserve.',
      tags: ['VRD', 'référence', 'voirie'],
      updatedAt: now,
    },
    {
      id: 'lib_profil_dirprojet',
      category: 'profil',
      title: 'Profil type — Directeur de projet',
      content:
        'Karim Bensaïd — Ingénieur EHTP, 18 ans d\'expérience en conduite de grands chantiers VRD et génie civil. A dirigé plus de 25 opérations dont 8 marchés publics supérieurs à 15 M MAD. Interlocuteur unique du maître d\'ouvrage, garant des engagements contractuels (délais, qualité, sécurité).',
      tags: ['CV', 'encadrement'],
      updatedAt: now,
    },
    {
      id: 'lib_materiel_parc',
      category: 'materiel',
      title: 'Parc matériel principal (extrait)',
      content:
        '3 pelles hydrauliques 21 t (dont 1 BRH) — 2 chargeuses — 1 finisseur (2,5 à 5 m) — 4 compacteurs — 6 camions 8x4 — 1 centrale à béton mobile 30 m³/h. Entretien assuré par notre atelier intégré ; taux de disponibilité constaté 2025 : 94 %.',
      tags: ['matériel', 'parc'],
      updatedAt: now,
    },
    {
      id: 'lib_cert_iso9001',
      category: 'certification',
      title: 'ISO 9001:2015 (Bureau Veritas)',
      content:
        'Système de management de la qualité certifié ISO 9001:2015 par Bureau Veritas, périmètre : études et travaux de VRD et génie civil. Première certification 2018, renouvelée sans écart majeur.',
      tags: ['ISO', 'qualité'],
      updatedAt: now,
    },
    {
      id: 'lib_admin_dossier',
      category: 'document_admin',
      title: 'Check-list dossier administratif (marché public MA)',
      content:
        '1. Déclaration sur l\'honneur (modèle du RC).\n2. Attestation fiscale de moins de 3 mois.\n3. Attestation CNSS de moins de 3 mois.\n4. Certificat d\'immatriculation au RC (modèle J).\n5. Certificat(s) de qualification et classification.\n6. Attestations d\'assurance RC et TRC en cours de validité.\n7. Caution provisoire au montant exigé par le RC.\n8. Statuts et pouvoirs du signataire.',
      tags: ['administratif', 'check-list'],
      updatedAt: now,
    },
    {
      id: 'lib_modele_courrier',
      category: 'modele_reponse',
      title: 'Courrier de transmission de l\'offre',
      content:
        'Objet : {reference} — Remise de l\'offre.\n\nMonsieur le Président,\n\nNous avons l\'honneur de vous transmettre, sous pli fermé, notre offre relative à la consultation citée en objet, comprenant le dossier administratif, l\'offre technique et l\'offre financière, établis conformément au règlement de consultation.\n\nNous restons à votre disposition pour toute information complémentaire et vous prions d\'agréer, Monsieur le Président, l\'expression de notre considération distinguée.\n\n{signataire}, {fonction}',
      tags: ['courrier', 'modèle'],
      updatedAt: now,
    },
    {
      id: 'lib_modele_cdc_batiment',
      category: 'modele_cdc',
      title: 'Trame — cahier des charges travaux de bâtiment',
      content:
        '1. Contexte et objet — 2. Description de l\'existant — 3. Programme des travaux par lot — 4. Contraintes de site (occupation, accès, horaires) — 5. Exigences techniques et normes — 6. Exigences HSE — 7. Planning et phasage — 8. Modalités de réception — 9. Garanties — 10. Pénalités — 11. Pièces à remettre par les candidats — 12. Critères de jugement des offres.',
      tags: ['cahier des charges', 'bâtiment', 'trame'],
      updatedAt: now,
    },
  ];
}

// ---------------------------------------------------------------------------
// Documents générés d'exemple (un mémoire technique + un cahier des charges)
// ---------------------------------------------------------------------------

export function buildDemoDocuments(): GeneratedDocument[] {
  const now = nowIso();
  return [
    {
      id: 'demo_doc_memoire_btp',
      type: 'memoire_technique',
      title: 'Mémoire technique — AO n° 17/2026/DT (voirie Ouled Saleh)',
      tenderId: 'demo_ao_btp',
      status: 'brouillon',
      simulated: true,
      createdAt: now,
      updatedAt: now,
      history: [
        { id: 'h1', date: now, author: 'Salma El Amrani', action: 'Génération initiale (mode simulation)' },
      ],
      sections: [
        {
          id: 's1',
          title: '1. Présentation de l\'entreprise',
          content:
            'Atlas Infrastructures est une entreprise générale de BTP basée à Casablanca, spécialisée en VRD et génie civil depuis 2009 (85 collaborateurs, qualification CNCE classe 2, ISO 9001 et ISO 45001).\n\nNotre bureau d\'études intégré et notre parc matériel en propre (pelles, finisseur, centrale à béton mobile) garantissent une exécution autonome et maîtrisée des travaux objet du présent marché.',
        },
        {
          id: 's2',
          title: '2. Compréhension du besoin et des enjeux',
          content:
            'Le marché porte sur l\'aménagement de 4,8 km de voiries lourdes et des réseaux du parc industriel Ouled Saleh (tranche 1). Nous avons identifié trois enjeux majeurs :\n\n1. Tenir le délai de 10 mois malgré l\'enchaînement terrassements / réseaux / chaussées, ce qui impose un phasage par tronçons et une mobilisation en double équipe sur l\'assainissement.\n\n2. Garantir la qualité des compactages (98,5 % OPM exigé) sur des plateformes destinées à un trafic industriel lourd.\n\n3. Sécuriser l\'approvisionnement en enrobés à prix fermes sur toute la durée du chantier.',
        },
        {
          id: 's3',
          title: '3. Méthodologie d\'exécution',
          content:
            'Le chantier sera découpé en 4 tronçons de 1,2 km traités en tiroir : pendant que le tronçon N est en phase réseaux, le tronçon N-1 reçoit ses corps de chaussée. Ce mode opératoire lisse les moyens et réduit le délai global de 15 % par rapport à une exécution linéaire.\n\nLes fouilles supérieures à 1,30 m seront systématiquement blindées. Les essais (étanchéité, inspection télévisée, essais de plaque) seront réalisés par un laboratoire agréé au fur et à mesure, tronçon par tronçon, pour ne pas retarder les réceptions partielles.',
        },
        {
          id: 's4',
          title: '4. Organisation et moyens humains',
          content:
            'Direction de projet : Karim Bensaïd (18 ans d\'expérience), interlocuteur unique du maître d\'ouvrage.\nConduite de travaux : Rachid Toumi (14 ans), présent à temps plein sur site.\nQSE : Salma El Amrani, en charge du PAQ, du PPSPS et des contrôles.\nEffectif de pointe prévu : 45 personnes en phase réseaux/chaussées.',
        },
        {
          id: 's5',
          title: '5. Moyens matériels affectés',
          content:
            'Moyens affectés en propre : 2 pelles 21 t, 1 chargeuse, 1 finisseur, 3 compacteurs, 4 camions 8x4, 1 centrale à béton mobile 30 m³/h installée sur site.\n\nLa centrale sur site supprime la dépendance aux fournisseurs extérieurs pour les bétons d\'ouvrages et regards, et sécurise les cadences de pose.',
        },
        {
          id: 's6',
          title: '6. Planning d\'exécution',
          content:
            'Durée totale proposée : 10 mois, dont 3 semaines de préparation.\nJalon 1 (M+3) : tronçon 1 — réseaux terminés.\nJalon 2 (M+6) : tronçons 1 et 2 — chaussées terminées.\nJalon 3 (M+9) : ensemble des revêtements terminés.\nM+10 : essais, signalisation, récolement, réception.\nLe planning détaillé (diagramme de Gantt) est joint en annexe.',
        },
        {
          id: 's7',
          title: '7. Dispositions qualité, sécurité, environnement',
          content:
            'Qualité : PAQ spécifique, points d\'arrêt formalisés avec le maître d\'œuvre, contrôles internes + laboratoire externe agréé.\n\nSécurité : PPSPS, accueil sécurité obligatoire, quart d\'heure sécurité hebdomadaire, objectif zéro accident (résultat 2024 : 0 AT sur nos chantiers).\n\nEnvironnement : SOGED avec tri des déchets et objectif de 70 % de valorisation des inertes, arrosage des pistes pour limiter les poussières, kits antipollution sur chaque engin.',
        },
        {
          id: 's8',
          title: '8. Gestion des risques et points de vigilance',
          content:
            'Risque prix (marché ferme non révisable) : consultation groupée des fournisseurs de liants avec engagement de prix sur 10 mois, signée avant remise de l\'offre.\n\nRisque réseaux existants : investigations complémentaires et sondages manuels avant terrassements dans les zones sensibles.\n\nRisque météo : phasage prévoyant les terrassements de masse hors période pluvieuse, marge de 3 semaines intégrée au planning.',
        },
        {
          id: 's9',
          title: '9. Références similaires',
          content:
            'Réhabilitation de la voirie du quartier Al Fida — Commune de Casablanca, 18,4 M MAD, 2024 : 6,2 km de voirie urbaine, délai tenu, zéro accident.\n\nPlateforme logistique Zenata (lots VRD) — SAZ, 11,25 M MAD, 2023 : voiries lourdes et réseaux d\'une plateforme de 14 ha, coordination multi-entreprises.',
        },
        {
          id: 's10',
          title: '10. Valeur ajoutée et conclusion',
          content:
            'Notre offre se distingue par : une exécution en tiroir qui sécurise le délai de 10 mois, une centrale à béton sur site, des prix fournisseurs verrouillés dès la remise de l\'offre, et une équipe d\'encadrement ayant déjà réalisé ensemble deux opérations comparables.\n\nNous nous engageons à mobiliser ces moyens dès la notification et à faire de la tranche 1 du parc Ouled Saleh une référence de qualité pour le maître d\'ouvrage.',
        },
      ],
    },
    {
      id: 'demo_doc_cdc_exemple',
      type: 'cahier_des_charges',
      title: 'Cahier des charges — Maintenance multi-technique du siège (exemple)',
      status: 'valide',
      simulated: true,
      createdAt: now,
      updatedAt: now,
      history: [
        { id: 'h1', date: now, author: 'Nadia Chraïbi', action: 'Génération initiale (mode simulation)' },
        { id: 'h2', date: now, author: 'Karim Bensaïd', action: 'Validation du document' },
      ],
      sections: [
        {
          id: 's1',
          title: '1. Objet et contexte',
          content:
            'Le présent cahier des charges définit les prestations de maintenance multi-technique (CVC, électricité, plomberie, portes automatiques) du siège social, un immeuble R+4 de 6 500 m² occupé par 320 collaborateurs.\n\nLe prestataire sortant arrive en fin de contrat : la continuité de service devra être assurée sans interruption à la prise d\'effet du nouveau marché.',
        },
        {
          id: 's2',
          title: '2. Objectifs',
          content:
            'Garantir la disponibilité des installations (objectif ≥ 98 % sur les équipements critiques), maîtriser le budget de maintenance, disposer d\'un reporting mensuel fiable et anticiper le renouvellement des équipements vieillissants via un plan pluriannuel.',
        },
        {
          id: 's3',
          title: '3. Périmètre des prestations',
          content:
            'Maintenance préventive selon gammes constructeur, maintenance corrective avec astreinte 24h/7j (GTI 4 h sur équipements critiques), conduite des installations CVC, petits travaux induits (< 20 000 MAD par intervention) sur bons de commande.',
        },
        {
          id: 's4',
          title: '4. Exigences techniques et réglementaires',
          content:
            'Personnel habilité électrique, habilitations fluides frigorigènes pour le CVC, respect des normes NM et DTU applicables, GMAO fournie par le prestataire avec accès client, traçabilité complète des interventions.',
        },
        {
          id: 's5',
          title: '5. Planning et durée',
          content:
            'Marché d\'une durée de 12 mois reconductible deux fois. Période de tuilage de 2 semaines avec le prestataire sortant, incluse dans le prix. Inventaire contradictoire des équipements dans le premier mois.',
        },
        {
          id: 's6',
          title: '6. Modalités de réception et pénalités',
          content:
            'Comité mensuel de suivi avec revue des indicateurs (disponibilité, délais d\'intervention, taux de préventif réalisé). Pénalités : 500 MAD par heure de dépassement du GTI sur équipement critique, plafonnées à 8 % du montant annuel.',
        },
        {
          id: 's7',
          title: '7. Pièces attendues des candidats',
          content:
            'Mémoire d\'exploitation (organisation, moyens, GMAO), tableau des effectifs affectés et habilitations, bordereau de prix (forfait annuel + bordereau des petits travaux), références de contrats comparables, attestations d\'assurance et de régularité fiscale et sociale.',
        },
      ],
    },
  ];
}
