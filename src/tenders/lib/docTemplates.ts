/**
 * Générateurs de documents du dossier de réponse / de consultation.
 *
 * Chaque générateur produit un GeneratedDocument structuré en sections
 * éditables, alimenté par les données réelles du dossier (AO, entreprise,
 * conformité, go/no-go). Les tableaux (BPU, DPGF, grilles) utilisent
 * DocSection.table et s'exportent aussi en Excel.
 */

import type {
  CompanyProfile,
  DocSection,
  DocumentType,
  GeneratedDocument,
  Tender,
} from '../types';
import {
  DOCUMENT_TYPE_LABELS,
  MARKET_TYPE_LABELS,
  REQUIREMENT_COVERAGE_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  TENDER_STATUS_LABELS,
  formatAmount,
  formatDate,
  nowIso,
  uid,
} from '../types';
import { RECOMMENDATION_LABELS } from './scoring';
import { computeCoverageStats } from './requirements';

function s(title: string, content: string, table?: DocSection['table']): DocSection {
  return { id: uid('s'), title, content, table };
}

function baseDoc(
  type: DocumentType,
  title: string,
  sections: DocSection[],
  author: string,
  tenderId?: string,
): GeneratedDocument {
  const now = nowIso();
  return {
    id: uid('doc'),
    type,
    title,
    tenderId,
    sections,
    status: 'brouillon',
    createdAt: now,
    updatedAt: now,
    simulated: true,
    history: [{ id: uid('h'), date: now, author, action: 'Génération initiale' }],
  };
}

function companyBlock(company: CompanyProfile): string {
  const ids = company.registrationIds.map((r) => `${r.label} : ${r.value}`).join(' — ');
  return `${company.name} — ${company.legalForm}\n${company.address}, ${company.city}, ${company.country}\n${ids}\nTél : ${company.phone} — Email : ${company.email}`;
}

// ---------------------------------------------------------------------------
// CCTP
// ---------------------------------------------------------------------------

export function buildCctp(tender: Tender, company: CompanyProfile, author: string): GeneratedDocument {
  const reqs = tender.dceAnalysis?.technicalRequirements ?? [];
  return baseDoc(
    'cctp',
    `CCTP — ${tender.title}`,
    [
      s(
        'Article 1 — Objet du marché',
        `Le présent Cahier des Clauses Techniques Particulières (CCTP) définit les spécifications techniques des prestations : ${tender.title}.\n\nMaître d'ouvrage : ${tender.buyer}.\nType de marché : ${MARKET_TYPE_LABELS[tender.marketType]}.`,
      ),
      s(
        'Article 2 — Consistance des prestations',
        `${tender.description}\n\n[Détaillez ici la décomposition des prestations par lot ou par poste.]`,
      ),
      s(
        'Article 3 — Spécifications techniques',
        reqs.length > 0
          ? `Les prestations respecteront notamment les exigences suivantes :\n${reqs.map((r) => `• ${r}`).join('\n')}`
          : 'Les prestations seront exécutées conformément aux normes en vigueur et aux règles de l\'art. [Complétez avec les spécifications propres au projet.]',
      ),
      s(
        'Article 4 — Contrôles et essais',
        'Les contrôles d\'exécution sont à la charge du titulaire. Les points d\'arrêt définis au PAQ ne pourront être levés qu\'après accord du maître d\'œuvre. Les essais de réception seront réalisés contradictoirement.',
      ),
      s(
        'Article 5 — Documents à fournir',
        'Avant exécution : programme d\'exécution, plans et notes de calcul, fiches techniques des matériaux soumises au visa.\nEn fin de prestation : dossier des ouvrages exécutés (DOE), fiches de contrôle, notices d\'exploitation et de maintenance.',
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// CCAP simplifié
// ---------------------------------------------------------------------------

export function buildCcap(tender: Tender, company: CompanyProfile, author: string): GeneratedDocument {
  return baseDoc(
    'ccap',
    `CCAP simplifié — ${tender.title}`,
    [
      s(
        'Article 1 — Objet et pièces contractuelles',
        `Marché : ${tender.title} (${tender.reference}).\nMaître d'ouvrage : ${tender.buyer}.\n\nPièces contractuelles par ordre de priorité : acte d'engagement, CCAP, CCTP, bordereau des prix, offre technique du titulaire.`,
      ),
      s(
        'Article 2 — Durée et délais d\'exécution',
        `Le délai d'exécution court à compter de l'ordre de service de démarrage. Date limite de remise des offres : ${formatDate(tender.deadline)}.\n\n[Précisez le délai contractuel d'exécution.]`,
      ),
      s(
        'Article 3 — Prix et modalités de paiement',
        `Montant estimé : ${formatAmount(tender.estimatedAmount, tender.currency)}.\nLes prix sont réputés fermes sauf mention contraire. Paiement sur présentation de décomptes, dans le délai réglementaire en vigueur.`,
      ),
      s(
        'Article 4 — Pénalités',
        'Retard d\'exécution : 1/1000 du montant du marché par jour calendaire, plafonné à 10 %. Le maître d\'ouvrage peut résilier le marché au-delà du plafond.',
      ),
      s(
        'Article 5 — Garanties',
        'Retenue de garantie de 10 % du montant, remboursable à la réception définitive. Le titulaire maintiendra ses assurances (RC professionnelle, garanties spécifiques) en vigueur pendant toute la durée du marché.',
      ),
      s(
        'Article 6 — Résiliation et litiges',
        'Résiliation possible aux torts du titulaire après mise en demeure restée sans effet 15 jours. En cas de litige, les parties rechercheront un règlement amiable avant toute action contentieuse devant la juridiction compétente.',
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Règlement de consultation
// ---------------------------------------------------------------------------

export function buildReglementConsultation(
  tender: Tender,
  company: CompanyProfile,
  author: string,
): GeneratedDocument {
  const criteria = tender.awardCriteria
    .map((c) => `• ${c.label} : ${c.weight} %`)
    .join('\n');
  const docs = tender.requiredDocuments.map((d) => `• ${d.label} (${d.category})`).join('\n');
  return baseDoc(
    'reglement_consultation',
    `Règlement de consultation — ${tender.title}`,
    [
      s(
        'Article 1 — Objet de la consultation',
        `${tender.title}\nRéférence : ${tender.reference}.\nAcheteur : ${tender.buyer}.\nType de marché : ${MARKET_TYPE_LABELS[tender.marketType]}.`,
      ),
      s(
        'Article 2 — Conditions de la consultation',
        `Date et heure limites de remise des offres : ${formatDate(tender.deadline)} à 12h00.\nLes offres parvenues hors délai seront rejetées.\nDélai de validité des offres : 90 jours.`,
      ),
      s('Article 3 — Contenu du dossier de réponse', docs || '[Listez les pièces exigées des candidats.]'),
      s(
        'Article 4 — Critères de jugement des offres',
        criteria
          ? `Les offres seront jugées selon les critères pondérés suivants :\n${criteria}`
          : '[Définissez les critères de jugement et leur pondération.]',
      ),
      s(
        'Article 5 — Conditions d\'envoi et de remise',
        'Les plis seront remis contre récépissé ou transmis par voie électronique selon les modalités indiquées dans l\'avis de publicité. Chaque pli portera la référence de la consultation.',
      ),
      s(
        'Article 6 — Renseignements complémentaires',
        `Les questions doivent être posées par écrit au plus tard 7 jours avant la date limite. Contact : ${tender.buyer}.`,
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// BPU / DPGF
// ---------------------------------------------------------------------------

const BPU_ROWS_BY_SECTOR: Record<string, string[][]> = {
  btp: [
    ['1.1', 'Installation et repli de chantier', 'forfait', '1', '', ''],
    ['1.2', 'Études d\'exécution et plans de récolement', 'forfait', '1', '', ''],
    ['2.1', 'Terrassements généraux (déblais)', 'm³', '12 500', '', ''],
    ['2.2', 'Remblais compactés en matériaux sélectionnés', 'm³', '8 200', '', ''],
    ['3.1', 'Canalisation EP béton armé Ø 600', 'ml', '1 850', '', ''],
    ['3.2', 'Regards de visite Ø 1000', 'u', '46', '', ''],
    ['4.1', 'Grave non traitée 0/31,5 (ép. 30 cm)', 'm²', '38 000', '', ''],
    ['4.2', 'Grave bitume GB3 (ép. 12 cm)', 't', '9 100', '', ''],
    ['4.3', 'Béton bitumineux BBSG 0/10 (ép. 6 cm)', 't', '4 800', '', ''],
    ['5.1', 'Bordures T2 posées sur béton', 'ml', '9 600', '', ''],
    ['6.1', 'Candélabre LED 8 m avec massif', 'u', '120', '', ''],
    ['7.1', 'Signalisation horizontale et verticale', 'forfait', '1', '', ''],
  ],
  default: [
    ['1', 'Prestation principale — tranche 1', 'forfait', '1', '', ''],
    ['2', 'Prestation principale — tranche 2', 'forfait', '1', '', ''],
    ['3', 'Prestations complémentaires sur bons de commande', 'jour', '20', '', ''],
    ['4', 'Formation / transfert de compétences', 'jour', '5', '', ''],
    ['5', 'Maintenance / garantie annuelle', 'an', '1', '', ''],
  ],
};

export function buildBpu(tender: Tender, company: CompanyProfile, author: string): GeneratedDocument {
  const rows = BPU_ROWS_BY_SECTOR[tender.sector] ?? BPU_ROWS_BY_SECTOR.default;
  return baseDoc(
    'bpu',
    `BPU — ${tender.title}`,
    [
      s(
        'Bordereau des prix unitaires',
        `Marché : ${tender.title} (${tender.reference}).\nLes prix unitaires ci-dessous s'entendent hors taxes, toutes sujétions comprises. Les quantités sont indicatives ; complétez les colonnes « P.U. » et « Total ».`,
        {
          columns: ['N°', 'Désignation', 'Unité', 'Quantité', 'P.U. (HT)', 'Total (HT)'],
          rows: rows.map((r) => [...r]),
        },
      ),
      s(
        'Conditions',
        'Le candidat certifie que les prix proposés couvrent l\'ensemble des sujétions d\'exécution, y compris les contrôles à sa charge. Toute ligne non chiffrée rendra l\'offre irrégulière.',
      ),
    ],
    author,
    tender.id,
  );
}

export function buildDpgf(tender: Tender, company: CompanyProfile, author: string): GeneratedDocument {
  const rows = (BPU_ROWS_BY_SECTOR[tender.sector] ?? BPU_ROWS_BY_SECTOR.default).map((r) => [...r]);
  return baseDoc(
    'dpgf',
    `DPGF — ${tender.title}`,
    [
      s(
        'Décomposition du prix global et forfaitaire',
        `Marché : ${tender.title} (${tender.reference}).\nLa présente décomposition détaille le prix global et forfaitaire proposé. Montant estimé par l'acheteur : ${formatAmount(tender.estimatedAmount, tender.currency)}.`,
        {
          columns: ['N°', 'Poste', 'Unité', 'Quantité', 'P.U. (HT)', 'Montant (HT)'],
          rows,
        },
      ),
      s(
        'Récapitulatif',
        'Total HT : [à compléter]\nTVA (20 %) : [à compléter]\nTotal TTC : [à compléter]\n\nArrêté le présent prix global et forfaitaire à la somme de : [montant en lettres].',
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Réponse administrative
// ---------------------------------------------------------------------------

export function buildReponseAdministrative(
  tender: Tender,
  company: CompanyProfile,
  author: string,
): GeneratedDocument {
  const availableDocs = company.adminDocs
    .filter((d) => d.available)
    .map((d) => `• ${d.name} (${d.kind}) — valide jusqu'au ${formatDate(d.validUntil)}`)
    .join('\n');
  const missing = company.adminDocs
    .filter((d) => !d.available)
    .map((d) => `• ${d.name} (${d.kind}) — À OBTENIR`)
    .join('\n');
  return baseDoc(
    'reponse_administrative',
    `Réponse administrative — ${tender.reference}`,
    [
      s('Identification du candidat', companyBlock(company)),
      s(
        'Déclaration sur l\'honneur',
        `Je soussigné ${company.signatoryName}, agissant en qualité de ${company.signatoryRole} de ${company.name}, déclare sur l'honneur :\n\n1. Que l'entreprise est en situation fiscale et sociale régulière ;\n2. Qu'elle ne fait l'objet d'aucune procédure de redressement ou de liquidation judiciaire ;\n3. Qu'elle n'est pas en situation de conflit d'intérêts vis-à-vis de la présente consultation ;\n4. L'exactitude des renseignements fournis dans le présent dossier.\n\nFait pour servir et valoir ce que de droit.`,
      ),
      s(
        'Capacités économiques et financières',
        `Capital social : ${company.capital}.\nEffectif : ${company.employees} collaborateurs.\nAssurances en vigueur :\n${company.insurances}`,
      ),
      s('Pièces jointes au dossier administratif', availableDocs || '[Renseignez vos documents administratifs dans la Base entreprise.]'),
      ...(missing
        ? [s('⚠ Pièces à obtenir avant dépôt', missing)]
        : []),
      s(
        'Signature',
        `Fait à ${company.city}, le ${formatDate(nowIso())}.\n\n${company.signatoryName}\n${company.signatoryRole}\n(signature et cachet)`,
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Planning prévisionnel
// ---------------------------------------------------------------------------

export function buildPlanning(tender: Tender, company: CompanyProfile, author: string): GeneratedDocument {
  const phases =
    tender.sector === 'btp'
      ? [
          ['Phase 1', 'Préparation, installations, études d\'exécution', 'M1', '3 semaines'],
          ['Phase 2', 'Terrassements et réseaux', 'M1 → M4', '14 semaines'],
          ['Phase 3', 'Corps de chaussée / gros œuvre', 'M4 → M7', '12 semaines'],
          ['Phase 4', 'Revêtements, équipements, finitions', 'M7 → M9', '10 semaines'],
          ['Phase 5', 'Essais, récolement, réception', 'M10', '4 semaines'],
        ]
      : [
          ['Phase 1', 'Cadrage et préparation', 'M1', '4 semaines'],
          ['Phase 2', 'Réalisation — itération 1', 'M2 → M3', '8 semaines'],
          ['Phase 3', 'Réalisation — itération 2', 'M4 → M5', '8 semaines'],
          ['Phase 4', 'Recette et corrections', 'M6', '4 semaines'],
          ['Phase 5', 'Déploiement et transfert', 'M6', '2 semaines'],
        ];
  return baseDoc(
    'planning',
    `Planning prévisionnel — ${tender.title}`,
    [
      s(
        'Hypothèses',
        `Le présent planning est établi sur la base d'un ordre de service à la notification du marché. Date limite de remise des offres : ${formatDate(tender.deadline)}.\n\nLes durées seront affinées lors de la mise au point du marché.`,
        {
          columns: ['Phase', 'Contenu', 'Période', 'Durée'],
          rows: phases,
        },
      ),
      s(
        'Jalons contractuels proposés',
        '• J0 : notification / ordre de service.\n• J1 : fin de préparation — validation du programme d\'exécution.\n• J2 : mi-parcours — revue d\'avancement contractuelle.\n• J3 : pré-réception — levée des réserves.\n• J4 : réception.',
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Note méthodologique
// ---------------------------------------------------------------------------

export function buildNoteMethodologique(
  tender: Tender,
  company: CompanyProfile,
  author: string,
): GeneratedDocument {
  return baseDoc(
    'note_methodologique',
    `Note méthodologique — ${tender.title}`,
    [
      s(
        '1. Approche générale',
        `Pour le marché « ${tender.title} », ${company.name} propose une approche en trois temps : sécuriser (préparation approfondie), exécuter (phases jalonnées avec contrôles), garantir (réception sans réserve et accompagnement).`,
      ),
      s(
        '2. Organisation proposée',
        'Interlocuteur unique côté titulaire, réunions de suivi périodiques avec relevé de décisions, circuit de validation court. [Adaptez à l\'organisation réellement proposée.]',
      ),
      s(
        '3. Points critiques identifiés et parades',
        (tender.dceAnalysis?.blockingPoints?.length
          ? tender.dceAnalysis.blockingPoints.map((b) => `• ${b} → parade à décrire.`).join('\n')
          : '• [Identifiez les points critiques du projet et la parade prévue pour chacun.]'),
      ),
      s(
        '4. Autocontrôle et traçabilité',
        'Chaque phase fait l\'objet de fiches d\'autocontrôle. Les non-conformités sont tracées, traitées et clôturées avec action corrective. Un dossier qualité est remis à la réception.',
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Analyse des risques
// ---------------------------------------------------------------------------

export function buildAnalyseRisques(
  tender: Tender,
  company: CompanyProfile,
  author: string,
): GeneratedDocument {
  const contractual = tender.dceAnalysis?.contractualRisks ?? [];
  const uncovered = tender.requirements.filter(
    (r) => r.level === 'imperatif' && (r.coverage === 'non_conforme' || r.coverage === 'a_traiter'),
  );
  const rows: string[][] = [
    ...uncovered.map((r) => [
      r.code,
      `Exigence impérative non couverte : ${r.text}`,
      'Conformité',
      'Élevé',
      r.comment || 'Traiter dans la matrice de conformité avant dépôt',
      r.responsible || 'Direction de projet',
    ]),
    ...contractual.map((r, i) => [
      `R${i + 1}`,
      r,
      'Contractuel',
      'Moyen',
      'Provision dans le prix / négociation à la mise au point',
      'Direction de projet',
    ]),
    ['RX1', 'Indisponibilité de moyens internes au démarrage', 'Ressources', 'Moyen', 'Plan de charge validé avant remise de l\'offre', 'Direction'],
    ['RX2', 'Dérive de délai sur les approvisionnements critiques', 'Planning', 'Élevé', 'Commandes anticipées + fournisseurs alternatifs identifiés', 'Achats'],
    ['RX3', 'Accident de travail sur site', 'Sécurité', 'Élevé', 'PPSPS, accueils sécurité, audits hebdomadaires', 'QSE'],
  ];
  return baseDoc(
    'analyse_risques',
    `Analyse des risques — ${tender.title}`,
    [
      s(
        'Registre des risques',
        'Registre initial établi à partir de l\'analyse du DCE et du retour d\'expérience de l\'entreprise. À réévaluer à chaque jalon.',
        {
          columns: ['ID', 'Risque', 'Catégorie', 'Criticité', 'Mesure de maîtrise', 'Propriétaire'],
          rows,
        },
      ),
      s(
        'Méthode d\'évaluation',
        'Criticité = probabilité × gravité, évaluées sur 3 niveaux (faible / moyen / élevé). Tout risque « élevé » doit disposer d\'une mesure de maîtrise avant remise de l\'offre.',
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Matrice de conformité (générée depuis le référentiel d'exigences)
// ---------------------------------------------------------------------------

export function buildGrilleConformite(
  tender: Tender,
  company: CompanyProfile,
  author: string,
): GeneratedDocument {
  const stats = computeCoverageStats(tender.requirements);
  return baseDoc(
    'grille_conformite',
    `Matrice de conformité — ${tender.reference}`,
    [
      s(
        'Matrice de conformité aux exigences du DCE',
        `Dossier « ${tender.title} » — état au ${formatDate(nowIso())} (statut : ${TENDER_STATUS_LABELS[tender.status]}).\n\n` +
          `${stats.total} exigence(s) tracée(s) : ${stats.byCoverage.conforme} conforme(s), ${stats.byCoverage.partiel} partiellement conforme(s), ${stats.byCoverage.non_conforme} non conforme(s), ${stats.byCoverage.a_traiter} à traiter. ` +
          `Taux de réponse rédigée : ${stats.responseRate} %.`,
        {
          columns: ['Code', 'Exigence', 'Source', 'Niveau', 'Conformité', 'Notre réponse', 'Preuve', 'Responsable'],
          rows: tender.requirements.map((r) => [
            r.code,
            r.text,
            r.source,
            REQUIREMENT_LEVEL_LABELS[r.level],
            REQUIREMENT_COVERAGE_LABELS[r.coverage],
            r.response || '[réponse à rédiger]',
            r.evidence,
            r.responsible,
          ]),
        },
      ),
      s(
        'Lecture de la matrice',
        'Toute exigence impérative « non conforme » ou « à traiter » au moment du dépôt expose l\'offre à un rejet ou à une note dégradée. Les réponses détaillées figurent dans le document « Réponse point par point ».',
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Réponse point par point au cahier des charges
// ---------------------------------------------------------------------------

export function buildReponsePointParPoint(
  tender: Tender,
  company: CompanyProfile,
  author: string,
): GeneratedDocument {
  const stats = computeCoverageStats(tender.requirements);
  const categories = [...new Set(tender.requirements.map((r) => r.category))];

  const intro = s(
    'Objet et engagement',
    `Le présent document constitue la réponse point par point de ${company.name} aux exigences du dossier de consultation « ${tender.title} » (${tender.reference}) lancé par ${tender.buyer}.\n\n` +
      `Chaque exigence extraite du DCE est reprise ci-dessous avec son code, sa source et la réponse engageante de l'entreprise. ${stats.total} exigence(s) sont traitées.` +
      (tender.strategy?.positioning ? `\n\n${tender.strategy.positioning}` : ''),
  );

  const sections = categories.map((category) => {
    const reqs = tender.requirements.filter((r) => r.category === category);
    const content = reqs
      .map((r) => {
        const header = `${r.code} — ${r.text}${r.source ? `\n(Source : ${r.source} — niveau : ${REQUIREMENT_LEVEL_LABELS[r.level]})` : ` (niveau : ${REQUIREMENT_LEVEL_LABELS[r.level]})`}`;
        const answer = r.response.trim()
          ? `Notre réponse : ${r.response}`
          : 'Notre réponse : [À RÉDIGER — utilisez l\'onglet Exigences du dossier pour compléter cette réponse avant export.]';
        const proof = r.evidence.trim() ? `Preuve / justificatif : ${r.evidence}` : '';
        return [header, answer, proof].filter(Boolean).join('\n\n');
      })
      .join('\n\n————————————————\n\n');
    return s(`Exigences — ${category}`, content);
  });

  return baseDoc(
    'reponse_point_par_point',
    `Réponse point par point — ${tender.reference}`,
    [intro, ...sections],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Synthèse go/no-go
// ---------------------------------------------------------------------------

export function buildSyntheseGoNoGo(
  tender: Tender,
  company: CompanyProfile,
  author: string,
): GeneratedDocument {
  const r = tender.goNoGo.result;
  const criteriaRows = tender.goNoGo.criteria.map((c) => [
    c.label,
    `${c.score} / 5`,
    `${c.weight}`,
  ]);
  return baseDoc(
    'synthese_gonogo',
    `Synthèse Go/No-Go — ${tender.reference}`,
    [
      s(
        'Synthèse de la décision',
        r
          ? `Score global : ${r.globalScore} / 100.\nRecommandation du scoring : ${RECOMMENDATION_LABELS[r.recommendation]}.\n` +
              (tender.goNoGo.decision
                ? `Décision retenue : ${tender.goNoGo.decision === 'go' ? 'GO — répondre' : 'NO-GO — ne pas répondre'} (par ${tender.goNoGo.decidedBy ?? '—'}, le ${formatDate(tender.goNoGo.decidedAt)}).`
                : 'Décision finale : non actée à ce jour.')
          : 'Le scoring n\'a pas encore été calculé — utilisez l\'onglet Go/No-Go du dossier.',
      ),
      s('Notation des critères', 'Notes saisies par l\'équipe (0 à 5) et pondérations utilisées.', {
        columns: ['Critère', 'Note', 'Pondération'],
        rows: criteriaRows,
      }),
      ...(r
        ? [
            s('Raisons principales', r.reasons.map((x) => `• ${x}`).join('\n')),
            s('Risques identifiés', r.risks.map((x) => `• ${x}`).join('\n')),
            s('Actions recommandées', r.actions.map((x) => `• ${x}`).join('\n')),
          ]
        : []),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Liste des pièces manquantes
// ---------------------------------------------------------------------------

export function buildPiecesManquantes(
  tender: Tender,
  company: CompanyProfile,
  author: string,
): GeneratedDocument {
  const missing = tender.requiredDocuments.filter((d) => !d.available && !d.generatedDocId);
  const covered = tender.requiredDocuments.filter((d) => d.available || d.generatedDocId);
  return baseDoc(
    'pieces_manquantes',
    `Pièces manquantes — ${tender.reference}`,
    [
      s(
        'État du dossier',
        `Dossier « ${tender.title} » — date limite : ${formatDate(tender.deadline)}.\n${missing.length} pièce(s) manquante(s) sur ${tender.requiredDocuments.length} exigée(s).`,
        {
          columns: ['Pièce', 'Catégorie', 'État', 'Note'],
          rows: [
            ...missing.map((d) => [d.label, d.category, 'MANQUANTE', d.note ?? '']),
            ...covered.map((d) => [
              d.label,
              d.category,
              d.available ? 'Disponible' : 'Générée dans l\'application',
              d.note ?? '',
            ]),
          ],
        },
      ),
      s(
        'Consignes',
        'Traiter en priorité les pièces marquées MANQUANTE : chaque pièce absente au dépôt rend l\'offre irrégulière. Affectez un responsable et une échéance à chaque pièce dans l\'onglet Tâches.',
      ),
    ],
    author,
    tender.id,
  );
}

// ---------------------------------------------------------------------------
// Registre des générateurs (pour l'écran Documents du dossier)
// ---------------------------------------------------------------------------

export interface DocGeneratorInfo {
  type: DocumentType;
  label: string;
  description: string;
  build: (tender: Tender, company: CompanyProfile, author: string) => GeneratedDocument;
}

export const TENDER_DOC_GENERATORS: DocGeneratorInfo[] = [
  {
    type: 'reponse_administrative',
    label: DOCUMENT_TYPE_LABELS.reponse_administrative,
    description: 'Déclaration sur l\'honneur, identification et pièces du dossier administratif, pré-remplies depuis la Base entreprise.',
    build: buildReponseAdministrative,
  },
  {
    type: 'planning',
    label: DOCUMENT_TYPE_LABELS.planning,
    description: 'Planning par phases avec jalons contractuels, adapté au secteur du marché.',
    build: buildPlanning,
  },
  {
    type: 'note_methodologique',
    label: DOCUMENT_TYPE_LABELS.note_methodologique,
    description: 'Approche, organisation, points critiques et autocontrôle.',
    build: buildNoteMethodologique,
  },
  {
    type: 'analyse_risques',
    label: DOCUMENT_TYPE_LABELS.analyse_risques,
    description: 'Registre des risques avec criticité et mesures de maîtrise, initialisé depuis l\'analyse du DCE.',
    build: buildAnalyseRisques,
  },
  {
    type: 'bpu',
    label: DOCUMENT_TYPE_LABELS.bpu,
    description: 'Bordereau de prix pré-structuré par secteur, exportable en Excel pour chiffrage.',
    build: buildBpu,
  },
  {
    type: 'dpgf',
    label: DOCUMENT_TYPE_LABELS.dpgf,
    description: 'Décomposition du prix global et forfaitaire, exportable en Excel.',
    build: buildDpgf,
  },
  {
    type: 'reponse_point_par_point',
    label: DOCUMENT_TYPE_LABELS.reponse_point_par_point,
    description: 'Réponse structurée exigence par exigence (code, source, engagement, preuve) — le cœur de votre offre technique.',
    build: buildReponsePointParPoint,
  },
  {
    type: 'grille_conformite',
    label: DOCUMENT_TYPE_LABELS.grille_conformite,
    description: 'Matrice de conformité générée depuis le référentiel d\'exigences — exportable en Excel.',
    build: buildGrilleConformite,
  },
  {
    type: 'synthese_gonogo',
    label: DOCUMENT_TYPE_LABELS.synthese_gonogo,
    description: 'Synthèse de la décision go/no-go : score, raisons, risques, actions.',
    build: buildSyntheseGoNoGo,
  },
  {
    type: 'pieces_manquantes',
    label: DOCUMENT_TYPE_LABELS.pieces_manquantes,
    description: 'Liste à jour des pièces exigées, disponibles et manquantes.',
    build: buildPiecesManquantes,
  },
];

/** Générateurs côté acheteur (rédaction d'une consultation). */
export const CONSULTATION_DOC_GENERATORS: DocGeneratorInfo[] = [
  {
    type: 'cctp',
    label: DOCUMENT_TYPE_LABELS.cctp,
    description: 'Clauses techniques particulières structurées en articles.',
    build: buildCctp,
  },
  {
    type: 'ccap',
    label: DOCUMENT_TYPE_LABELS.ccap,
    description: 'Clauses administratives simplifiées : prix, délais, pénalités, garanties.',
    build: buildCcap,
  },
  {
    type: 'reglement_consultation',
    label: DOCUMENT_TYPE_LABELS.reglement_consultation,
    description: 'Règles du jeu de la consultation : remise des offres, critères, contacts.',
    build: buildReglementConsultation,
  },
];
