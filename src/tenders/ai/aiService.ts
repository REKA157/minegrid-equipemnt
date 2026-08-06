/**
 * Couche IA abstraite du module Appels d'offres.
 *
 * Deux modes, sans changement d'écran :
 *
 * 1. SIMULATION (défaut) — mock déterministe avec latence simulée.
 *
 * 2. API RÉELLE — Edge Function Supabase `tenders-ai` (voir
 *    supabase/functions/tenders-ai/index.ts) qui appelle l'API Claude ;
 *    la clé Anthropic reste côté serveur, jamais dans le navigateur.
 *    Activation dans .env.local :
 *
 *      VITE_TENDERS_AI_URL=supabase
 *        → utilise VITE_SUPABASE_URL/functions/v1/tenders-ai avec la clé
 *          anon Supabase déjà présente dans l'app (rien d'autre à fournir).
 *
 *      ou une URL complète + VITE_TENDERS_AI_KEY pour un endpoint custom
 *      (POST JSON { action, payload }).
 *
 * En cas d'échec de l'API (réseau, quota, fonction non déployée), chaque
 * fonction retombe sur le mock : l'utilisateur n'est jamais bloqué.
 * Le champ `simulated` des résultats indique la source.
 */

import type {
  CahierDesChargesInput,
  CompanyProfile,
  DceAnalysisResult,
  DocSection,
  GoNoGoCriterion,
  GoNoGoResult,
  ResponseStrategy,
  Sector,
  Tender,
  TenderRequirement,
} from '../types';
import { SECTOR_LABELS, uid, nowIso, daysUntil } from '../types';
import { computeGoNoGo } from '../lib/scoring';
import { computeCoverageStats } from '../lib/requirements';

// ---------------------------------------------------------------------------
// Transport (API réelle optionnelle)
// ---------------------------------------------------------------------------

const RAW_AI_URL: string | undefined = import.meta.env.VITE_TENDERS_AI_URL;
const RAW_AI_KEY: string | undefined = import.meta.env.VITE_TENDERS_AI_KEY;

/**
 * Nom (slug) de l'Edge Function IA.
 *
 * ⚠️ RÉALITÉ DU DÉPLOIEMENT (vérifié 2026-08-03) : en PRODUCTION la fonction est
 * publiée sous « renders-ai » (déploiement manuel historique via le dashboard) —
 * c'est donc la valeur par défaut, sinon les appels IA tombent en 404 et
 * retombent en simulation. Le dossier du dépôt s'appelle `tenders-ai` : si tu
 * redéploies un jour sous ce nom (cf. docs/TENDERS_OPERATIONS.md), il suffit de
 * poser VITE_TENDERS_AI_FUNCTION=tenders-ai — aucun code à toucher.
 */
const FUNCTION_SLUG =
  String(import.meta.env.VITE_TENDERS_AI_FUNCTION ?? '').trim() || 'renders-ai';

/** Résout le sentinel « supabase » vers l'Edge Function du projet. */
function resolveEndpoint(): { url: string; key?: string } | null {
  if (!RAW_AI_URL) return null;
  if (RAW_AI_URL === 'supabase') {
    const base: string | undefined = import.meta.env.VITE_SUPABASE_URL;
    const anon: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!base) return null;
    return { url: `${base.replace(/\/$/, '')}/functions/v1/${FUNCTION_SLUG}`, key: anon };
  }
  return { url: RAW_AI_URL, key: RAW_AI_KEY };
}

const ENDPOINT = resolveEndpoint();

export function isAiConnected(): boolean {
  return Boolean(ENDPOINT);
}

async function callRealApi<T>(action: string, payload: unknown): Promise<T | null> {
  if (!ENDPOINT) return null;
  try {
    const res = await fetch(ENDPOINT.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ENDPOINT.key ? { Authorization: `Bearer ${ENDPOINT.key}` } : {}),
      },
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // fallback mock
  }
}

/**
 * Test de connexion (bouton « Tester » des Paramètres) : contrairement aux
 * autres fonctions, ne retombe pas silencieusement sur le mock — remonte le
 * détail pour que l'utilisateur comprenne ce qui manque.
 */
export async function pingAi(): Promise<{ ok: boolean; detail: string }> {
  if (!ENDPOINT) {
    return { ok: false, detail: 'Aucun endpoint configuré (VITE_TENDERS_AI_URL absent).' };
  }
  try {
    const res = await fetch(ENDPOINT.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ENDPOINT.key ? { Authorization: `Bearer ${ENDPOINT.key}` } : {}),
      },
      body: JSON.stringify({ action: 'ping', payload: {} }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, detail: data.error ?? `Le serveur a répondu ${res.status}.` };
    }
    return {
      ok: true,
      detail: `Connecté — modèle ${data.model ?? '?'}${data.hasKey ? '' : ' (⚠ clé Anthropic absente côté serveur)'}.`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: `Endpoint injoignable (${e instanceof Error ? e.message : 'erreur réseau'}). La fonction est-elle déployée ?`,
    };
  }
}

/** Latence simulée pour que l'UI montre ses états de chargement réels. */
function simulateLatency(ms = 900): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 600));
}

// ---------------------------------------------------------------------------
// analyzeTender / summarizeDCE / extractRequirements
// ---------------------------------------------------------------------------

export interface AnalyzeTenderInput {
  /** base64 : contenu des PDF, envoyé uniquement à l'API réelle (jamais stocké). */
  files: { name: string; size: number; base64?: string }[];
  sector: Sector;
  title?: string;
}

/**
 * Analyse un DCE importé. En mode mock, produit une extraction plausible
 * adaptée au secteur — suffisante pour dérouler tout le workflow métier.
 */
export async function analyzeTender(input: AnalyzeTenderInput): Promise<DceAnalysisResult> {
  const real = await callRealApi<DceAnalysisResult>('analyzeTender', input);
  if (real) return { ...real, simulated: false };

  await simulateLatency(1400);

  const bySector: Partial<Record<Sector, Partial<DceAnalysisResult>>> = {
    btp: {
      technicalRequirements: [
        'Matériaux conformes aux normes NM / EN en vigueur, fiches techniques à soumettre au visa.',
        'Contrôles d\'exécution par laboratoire agréé à la charge de l\'entreprise.',
        'Plan d\'installation de chantier et PPSPS à remettre avant démarrage.',
        'Dossier de récolement (DOE) exigé à la réception.',
      ],
      contractualRisks: [
        'Prix fermes non révisables pendant la durée du marché.',
        'Pénalités de retard de 1/1000 par jour calendaire, plafond 10 %.',
        'Retenue de garantie de 10 % jusqu\'à la réception définitive.',
      ],
      blockingPoints: [
        'Visite de site obligatoire avec attestation jointe à l\'offre.',
        'Caution provisoire exigée à la remise des plis.',
      ],
    },
    securite: {
      technicalRequirements: [
        'Agrément de gardiennage en cours de validité (obligatoire).',
        'Centre de télésurveillance certifié avec levée de doute sous 15 minutes.',
        'Main courante électronique consultable par le client.',
      ],
      contractualRisks: [
        'Continuité de service exigée 24h/24 — pénalités par vacance de poste.',
        'Reprise du personnel du titulaire sortant possible selon la convention collective.',
      ],
      blockingPoints: ['Agrément administratif obligatoire sous peine de rejet.'],
    },
    informatique: {
      technicalRequirements: [
        'Hébergement des données sur le territoire national.',
        'Réversibilité : code source, documentation et plan de réversibilité contractuels.',
        'Interopérabilité avec l\'annuaire existant (SSO / LDAP).',
        'Maintenance corrective et évolutive sur 3 ans incluse dans le forfait.',
      ],
      contractualRisks: [
        'Recette prononcée uniquement après vérification d\'aptitude ET vérification de service régulier (double VABF/VSR).',
        'Propriété intellectuelle des développements cédée au maître d\'ouvrage.',
      ],
      blockingPoints: ['Soutenance orale imposée — équipe projet nominative exigée.'],
    },
  };

  const sectorData = bySector[input.sector] ?? {};
  const detected =
    input.files.length > 0
      ? input.files.flatMap((f) =>
          f.name.toLowerCase().endsWith('.zip')
            ? [
                { name: 'Règlement de consultation.pdf', type: 'RC', pages: 18 },
                { name: 'CCAP.pdf', type: 'CCAP', pages: 26 },
                { name: 'CCTP.pdf', type: 'CCTP', pages: 54 },
                { name: 'Bordereau des prix.xlsx', type: 'BPU' },
                { name: 'Annexes techniques.pdf', type: 'Annexes', pages: 31 },
              ]
            : [{ name: f.name, type: guessDocType(f.name), pages: Math.max(4, Math.round(f.size / 45_000)) }],
        )
      : [
          { name: 'Règlement de consultation.pdf', type: 'RC', pages: 18 },
          { name: 'CCTP.pdf', type: 'CCTP', pages: 54 },
        ];

  const inDays = (d: number) => {
    const date = new Date();
    date.setDate(date.getDate() + d);
    return date.toISOString();
  };

  return {
    analyzedAt: nowIso(),
    simulated: true,
    // Ne jamais conserver le base64 (poids en localStorage) : nom + taille suffisent.
    files: input.files.map((f) => ({ name: f.name, size: f.size })),
    detectedDocuments: detected,
    keyClauses: [
      {
        title: 'Pénalités de retard',
        excerpt: 'Pénalité de 1/1000 du montant du marché par jour de retard, plafonnée à 10 %.',
        risk: 'moyen',
      },
      {
        title: 'Modalités de paiement',
        excerpt: 'Paiement à 60 jours à compter de la réception de la facture et du décompte accepté.',
        risk: 'moyen',
      },
      {
        title: 'Résiliation',
        excerpt: 'Résiliation de plein droit en cas de défaillance non corrigée sous 15 jours après mise en demeure.',
        risk: 'faible',
      },
    ],
    keyDates: [
      { id: uid('kd'), label: 'Date limite des questions', date: inDays(7) },
      { id: uid('kd'), label: 'Remise des offres', date: inDays(15) },
      { id: uid('kd'), label: 'Ouverture des plis', date: inDays(16) },
    ],
    requiredDocuments: [
      { label: 'Dossier administratif complet', category: 'administratif' },
      { label: 'Mémoire technique', category: 'technique' },
      { label: 'Planning d\'exécution', category: 'technique' },
      { label: 'Offre financière (bordereau des prix)', category: 'financier' },
    ],
    awardCriteria: [
      { id: uid('c'), label: 'Prix', weight: 50 },
      { id: uid('c'), label: 'Valeur technique', weight: 40 },
      { id: uid('c'), label: 'Délai', weight: 10 },
    ],
    technicalRequirements: sectorData.technicalRequirements ?? [
      'Exigences techniques détaillées dans le CCTP — à relire section par section.',
    ],
    contractualRisks: sectorData.contractualRisks ?? [
      'Clauses de pénalités et de garantie à vérifier dans le CCAP.',
    ],
    blockingPoints: sectorData.blockingPoints ?? [],
    summary:
      `Analyse simulée du DCE « ${input.title ?? 'consultation'} » (secteur ${SECTOR_LABELS[input.sector]}). ` +
      `${detected.length} document(s) détecté(s). Les critères de jugement privilégient le prix (50 %) mais la valeur technique (40 %) reste déterminante : ` +
      'un mémoire technique soigné est indispensable. Vérifiez en priorité les points bloquants et les dates clés ci-dessous.',
  };
}

function guessDocType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('rc') || n.includes('reglement')) return 'RC';
  if (n.includes('ccap')) return 'CCAP';
  if (n.includes('cctp')) return 'CCTP';
  if (n.includes('bpu') || n.includes('bordereau') || n.endsWith('.xlsx')) return 'BPU';
  if (n.includes('dpgf')) return 'DPGF';
  if (n.includes('plan')) return 'Plans';
  return 'Document';
}

/**
 * Résumé exécutif d'un DCE déjà analysé.
 * Fait partie de l'API IA publique du module (avec generateDocument,
 * analyzeTender, extractRequirements…) : aucune UI ne l'appelle encore,
 * elle est exposée pour les intégrations futures (notifications, emails).
 */
export async function summarizeDCE(analysis: DceAnalysisResult): Promise<string> {
  const real = await callRealApi<{ summary: string }>('summarizeDCE', analysis);
  if (real) return real.summary;
  await simulateLatency(500);
  const blocking = analysis.blockingPoints.length;
  return (
    `${analysis.detectedDocuments.length} documents analysés. ` +
    `${analysis.keyClauses.length} clauses sensibles repérées, ${blocking} point(s) bloquant(s). ` +
    `Prochaine échéance : ${analysis.keyDates[0]?.label ?? '—'}. ` +
    'Recommandation : traiter les points bloquants avant d\'engager la rédaction.'
  );
}

/** Extrait les exigences d'un texte de consultation (mode saisie manuelle). */
export async function extractRequirements(text: string): Promise<string[]> {
  const real = await callRealApi<{ requirements: string[] }>('extractRequirements', { text });
  if (real) return real.requirements;
  await simulateLatency(700);
  // Mock honnête : découpe les phrases contenant des marqueurs d'obligation.
  const markers = ['doit', 'devra', 'obligatoire', 'exigé', 'exigée', 'au minimum', 'sous peine', 'impérativement'];
  const sentences = text
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && markers.some((m) => s.toLowerCase().includes(m)));
  // Tableau vide si rien de détecté : l'appelant affiche le message adapté
  // (ne JAMAIS retourner un message d'erreur comme pseudo-exigence).
  return sentences.slice(0, 12);
}

// ---------------------------------------------------------------------------
// Génération de documents
// ---------------------------------------------------------------------------

export interface GenerateDocumentInput {
  kind: 'cahier_des_charges';
  cdc: CahierDesChargesInput;
  company: CompanyProfile;
}

/**
 * Génère les sections d'un cahier des charges à partir de l'assistant.
 * Le mock assemble un document professionnel structuré à partir des
 * réponses de l'utilisateur (aucun contenu inventé sur les points clés).
 */
// Renvoie aussi la PROVENANCE (vraie IA vs simulation) — cf. generateTechnicalMemo.
export async function generateDocument(
  input: GenerateDocumentInput,
): Promise<{ sections: DocSection[]; simulated: boolean }> {
  const real = await callRealApi<{ sections: DocSection[] }>('generateDocument', input);
  if (real) return { sections: real.sections, simulated: false };

  await simulateLatency(1200);
  const { cdc } = input;
  const s = (title: string, content: string): DocSection => ({ id: uid('s'), title, content });

  const sections: DocSection[] = [
    s(
      '1. Objet et contexte',
      `Le présent cahier des charges a pour objet : ${cdc.projectName || 'le projet décrit ci-après'} (${cdc.projectType || 'nature à préciser'}), dans le secteur ${SECTOR_LABELS[cdc.sector]}.\n\n${cdc.context || 'Contexte à compléter par le rédacteur.'}`,
    ),
    s('2. Objectifs', cdc.objectives || 'Objectifs à compléter.'),
    s('3. Périmètre des prestations', cdc.scope || 'Périmètre à compléter.'),
    s(
      '4. Contraintes techniques',
      cdc.technicalConstraints || 'Aucune contrainte technique particulière renseignée.',
    ),
    s(
      '5. Contraintes réglementaires et normatives',
      cdc.regulatoryConstraints || 'Le prestataire respectera la réglementation et les normes en vigueur applicables aux prestations.',
    ),
    s('6. Livrables attendus', cdc.deliverables || 'Livrables à compléter.'),
    s('7. Planning prévisionnel', cdc.planning || 'Planning à définir avec le prestataire retenu.'),
    s(
      '8. Critères de qualité et niveaux de service',
      cdc.qualityCriteria || 'Les prestations seront réalisées selon les règles de l\'art.',
    ),
    s(
      '9. Modalités de réception',
      cdc.receptionTerms ||
        'La réception des prestations sera prononcée contradictoirement après vérification de conformité au présent cahier des charges. Les réserves éventuelles devront être levées dans un délai de 30 jours.',
    ),
    s(
      '10. Pénalités',
      cdc.penalties ||
        'En cas de retard imputable au prestataire, une pénalité de 1/1000 du montant de la commande par jour calendaire de retard pourra être appliquée, plafonnée à 10 %.',
    ),
    s(
      '11. Exigences de sécurité',
      cdc.safetyRequirements || 'Le prestataire se conformera aux exigences de sécurité applicables au site et à la réglementation du travail.',
    ),
    s(
      '12. Exigences environnementales',
      cdc.environmentalRequirements || 'Le prestataire mettra en œuvre une gestion responsable des déchets et limitera les nuisances.',
    ),
  ];

  if (cdc.estimatedBudget) {
    sections.push(s('13. Budget estimatif', `Enveloppe prévisionnelle : ${cdc.estimatedBudget}. Ce montant est donné à titre indicatif et ne constitue pas un engagement.`));
  }
  sections.push(
    s(
      `${cdc.estimatedBudget ? 14 : 13}. Annexes`,
      cdc.annexes || 'Liste des annexes à compléter (plans, inventaires, schémas, données existantes…).',
    ),
  );
  return { sections, simulated: true };
}

/**
 * Génère un mémoire technique complet pour un AO, à partir de la base
 * entreprise (références, équipe, matériel, certifications réelles de
 * l'utilisateur) et de l'analyse du DCE si disponible.
 */
// La PROVENANCE (vraie IA vs simulation) est renvoyée par le service : le
// composant ne doit plus la deviner via isAiConnected(), qui ne reflète que la
// CONFIG — pas le succès réel de l'appel (404/quota → fallback mock silencieux
// qui était alors étiqueté à tort comme production IA).
export async function generateTechnicalMemo(
  tender: Tender,
  company: CompanyProfile,
): Promise<{ sections: DocSection[]; simulated: boolean }> {
  const real = await callRealApi<{ sections: DocSection[] }>('generateTechnicalMemo', {
    tender,
    company,
  });
  if (real) return { sections: real.sections, simulated: false };

  await simulateLatency(1600);
  const s = (title: string, content: string): DocSection => ({ id: uid('s'), title, content });

  const refs = company.references
    .slice(0, 3)
    .map((r) => `${r.title} — ${r.client}, ${r.amount}, ${r.year} : ${r.description}`)
    .join('\n\n');

  const team = company.team
    .map((m) => `${m.name} — ${m.role} (${m.experience}) : ${m.qualifications}`)
    .join('\n');

  const equipment = company.equipment
    .map((e) => `${e.quantity} × ${e.name}${e.note ? ` (${e.note})` : ''}`)
    .join('\n');

  const certifications = company.certifications.map((c) => `${c.name} — ${c.issuer}`).join(' ; ');

  const techReqs = tender.dceAnalysis?.technicalRequirements ?? [];
  const risks = tender.dceAnalysis?.contractualRisks ?? [];
  const strategy = tender.strategy;
  const reqStats = computeCoverageStats(tender.requirements);
  const imperatives = tender.requirements.filter((r) => r.level === 'imperatif');

  const sections: DocSection[] = [
    s(
      '1. Présentation de l\'entreprise',
      `${company.presentation}\n\nCertifications et qualifications : ${certifications || 'à renseigner dans la Base entreprise'}.` +
        (strategy?.positioning ? `\n\n${strategy.positioning}` : ''),
    ),
    s(
      '2. Compréhension du besoin',
      `Le marché « ${tender.title} » lancé par ${tender.buyer} porte sur : ${tender.description}\n\n` +
        (tender.requirements.length > 0
          ? `Notre offre a été construite en réponse directe au référentiel de ${reqStats.total} exigences extraites du DCE (dont ${imperatives.length} impératives), tracées dans la matrice de conformité jointe. Les exigences structurantes :\n${(imperatives.length > 0 ? imperatives : tender.requirements).slice(0, 6).map((r) => `• ${r.code} — ${r.text}`).join('\n')}`
          : techReqs.length > 0
            ? `Nous avons identifié les exigences techniques structurantes suivantes :\n${techReqs.map((r) => `• ${r}`).join('\n')}`
            : 'L\'analyse détaillée du DCE permettra d\'affiner les exigences structurantes (voir onglet Analyse DCE).') +
        (() => {
          const themes = (strategy?.winThemes ?? []).filter((t) => t.trim());
          return themes.length > 0
            ? `\n\nNotre réponse s'articule autour de ${themes.length} engagement(s) clé(s) :\n${themes.map((t) => `• ${t}`).join('\n')}`
            : '';
        })(),
    ),
    s(
      '3. Méthodologie d\'exécution',
      'Notre méthodologie repose sur une préparation rigoureuse (revue de conception, validation des points d\'arrêt avec le maître d\'ouvrage), une exécution par phases avec jalons contrôlés, et un dispositif de contrôle qualité à chaque étape.\n\n' +
        (strategy?.criteriaApproaches.find((c) => /technique|valeur/i.test(c.label))?.approach
          ? `Axe directeur (critère « valeur technique ») : ${strategy.criteriaApproaches.find((c) => /technique|valeur/i.test(c.label))!.approach}\n\n`
          : '') +
        '[À personnaliser : décrivez ici le mode opératoire spécifique à ce marché — vous pouvez insérer une méthodologie type depuis la Bibliothèque.]',
    ),
    s(
      '4. Organisation du projet',
      `L'opération sera pilotée par un interlocuteur unique responsable des engagements contractuels. Une réunion de suivi périodique sera tenue avec ${tender.buyer} avec compte rendu systématique sous 48 h.\n\nCircuit de décision court : direction de projet → direction générale, permettant des arbitrages rapides.`,
    ),
    s('5. Moyens humains affectés', team || '[Renseignez vos équipes dans la Base entreprise pour alimenter cette section.]'),
    s('6. Moyens matériels', equipment || '[Renseignez votre matériel dans la Base entreprise pour alimenter cette section.]'),
    s(
      '7. Planning',
      `Le planning d'exécution sera calé sur la date limite contractuelle. Jalons proposés : préparation, exécution par phases, contrôles et réception.\n\n[Générez le document « Planning prévisionnel » depuis l'onglet Documents pour joindre un planning détaillé.]`,
    ),
    s(
      '8. Dispositif qualité',
      'Un Plan d\'Assurance Qualité (PAQ) spécifique sera établi : points d\'arrêt et points critiques identifiés dès la préparation, contrôles tracés, traitement formalisé des non-conformités avec actions correctives.',
    ),
    s(
      '9. Sécurité',
      'Analyse des risques au poste, accueil sécurité systématique, causeries hebdomadaires, EPI adaptés et audits internes. Objectif : zéro accident.',
    ),
    s(
      '10. Environnement',
      'Tri et traçabilité des déchets vers des filières agréées, limitation des nuisances (bruit, poussières), sensibilisation des équipes aux bonnes pratiques environnementales.',
    ),
    s(
      '11. Gestion des risques',
      (risks.length > 0
        ? `Risques contractuels identifiés à l'analyse du DCE et mesures associées :\n${risks.map((r) => `• ${r} → mesure de couverture à détailler.`).join('\n')}`
        : 'Les risques du projet seront consignés dans un registre tenu à jour, avec propriétaire et plan de mitigation pour chaque risque.') +
        (strategy?.vigilancePoints ? `\n\nPoints de vigilance traités dans notre réponse : ${strategy.vigilancePoints}` : ''),
    ),
    s(
      '12. Contrôle et reporting',
      `Reporting périodique adressé à ${tender.buyer} : avancement physique, jalons, points de blocage, indicateurs qualité/sécurité. Tableau de bord partagé et traçabilité complète des échanges.`,
    ),
    s('13. Références similaires', refs || '[Renseignez vos références dans la Base entreprise pour alimenter cette section.]'),
    s(
      '14. Valeur ajoutée de notre offre',
      (() => {
        const themes = (strategy?.winThemes ?? []).filter((t) => t.trim());
        const diff = strategy?.differentiators.trim() ?? '';
        const parts = [
          themes.length > 0 ? themes.map((t) => `• ${t}`).join('\n') : '',
          diff,
        ].filter(Boolean);
        return parts.length > 0
          ? parts.join('\n\n')
          : `Points différenciants de ${company.name} : maîtrise complète des moyens (équipes et matériel en propre), système qualité certifié, références directement comparables et engagement de disponibilité immédiate de l'encadrement dès la notification.`;
      })(),
    ),
    s(
      '15. Conclusion',
      `${company.name} s'engage à mettre en œuvre l'ensemble des moyens décrits dans le présent mémoire pour la parfaite exécution du marché « ${tender.title} », dans le respect des délais, de la qualité et de la sécurité attendus par ${tender.buyer}.`,
    ),
  ];
  return { sections, simulated: true };
}

/** Améliore/reformule une section de document. */
export async function improveSection(section: DocSection, instruction?: string): Promise<string> {
  const real = await callRealApi<{ content: string }>('improveSection', { section, instruction });
  if (real) return real.content;
  await simulateLatency(800);
  // Mock : enrichit la section avec une structure plus affirmée, sans
  // inventer de faits — l'utilisateur garde la main.
  const base = section.content.trim();
  const already = base.includes('Engagement :');
  const complement = instruction
    ? `\n\n[Simulation IA — consigne appliquée : « ${instruction} ». Branchez une API IA dans Paramètres pour une vraie reformulation.]`
    : '';
  if (already) return base + complement;
  return (
    base +
    '\n\nEngagement : les dispositions décrites ci-dessus sont contractuelles pour notre entreprise ; leur mise en œuvre est vérifiée par notre encadrement et tracée dans nos outils de suivi.' +
    complement
  );
}

// ---------------------------------------------------------------------------
// draftRequirementResponse — réponse point par point
// ---------------------------------------------------------------------------

const RESPONSE_HINTS_BY_CATEGORY: Record<string, { dispositif: string; preuve: string }> = {
  Technique: {
    dispositif:
      'moyens techniques dédiés, mode opératoire détaillé dans le mémoire technique, contrôles internes tracés et points d\'arrêt avec le maître d\'œuvre',
    preuve: 'fiches méthodes, références de chantiers comparables et qualifications de l\'encadrement',
  },
  'Pièces à fournir': {
    dispositif: 'la pièce demandée sera jointe au dossier, vérifiée en revue interne avant dépôt',
    preuve: 'pièce jointe au dossier (voir check-list de l\'onglet Documents)',
  },
  Contractuel: {
    dispositif:
      'acceptation de la clause avec les mesures de couverture associées (provisions chiffrées, engagements fournisseurs, assurances adaptées)',
    preuve: 'attestations d\'assurance et engagements écrits joints en annexe',
  },
  'Point bloquant': {
    dispositif: 'action immédiate planifiée et suivie dans l\'onglet Tâches jusqu\'à levée complète du point',
    preuve: 'justificatif à joindre dès obtention',
  },
  'Sécurité / HSE': {
    dispositif:
      'plan de prévention spécifique, personnel formé et habilité, audits sécurité périodiques avec indicateurs partagés',
    preuve: 'habilitations du personnel, statistiques sécurité, certification ISO 45001 le cas échéant',
  },
  Environnement: {
    dispositif: 'schéma de gestion des déchets (tri, traçabilité, filières agréées) et limitation des nuisances',
    preuve: 'bordereaux de suivi des déchets et procédures environnementales',
  },
  Qualité: {
    dispositif: 'plan d\'assurance qualité spécifique décliné de notre système certifié, non-conformités tracées et traitées',
    preuve: 'certificat ISO 9001 et modèle de fiche de contrôle',
  },
  'Délais / planning': {
    dispositif: 'planning détaillé avec jalons contractuels, marges identifiées et pilotage hebdomadaire de l\'avancement',
    preuve: 'planning prévisionnel joint à l\'offre',
  },
};

/**
 * Rédige un projet de réponse professionnel pour UNE exigence du DCE.
 * Mock : assemble un paragraphe engageant à partir de la catégorie de
 * l'exigence et des données réelles de l'entreprise. L'utilisateur relit
 * et personnalise — le texte le rappelle explicitement.
 */
export async function draftRequirementResponse(
  requirement: TenderRequirement,
  tender: Tender,
  company: CompanyProfile,
): Promise<string> {
  const real = await callRealApi<{ response: string }>('draftRequirementResponse', {
    requirement,
    tender: { id: tender.id, title: tender.title, sector: tender.sector },
    company,
  });
  if (real) return real.response;

  await simulateLatency(700);
  const hints = RESPONSE_HINTS_BY_CATEGORY[requirement.category] ?? {
    dispositif: 'organisation et moyens décrits dans le mémoire technique',
    preuve: 'références et qualifications jointes au dossier',
  };
  const cert = company.certifications[0]?.name;
  const ref = company.references[0];

  return (
    `${company.name} s'engage à satisfaire pleinement l'exigence ${requirement.code}${requirement.source ? ` (${requirement.source})` : ''} : ${requirement.text}\n\n` +
    `Dispositif proposé : ${hints.dispositif}.` +
    (cert ? ` Notre organisation s'appuie sur ${cert}.` : '') +
    `\n\nÉléments de preuve : ${hints.preuve}.` +
    (ref ? ` Référence comparable : ${ref.title} (${ref.client}, ${ref.year}).` : '') +
    `\n\n[Projet de réponse généré en simulation — précisez les moyens, chiffres et modalités propres à ce marché avant validation.]`
  );
}

// ---------------------------------------------------------------------------
// suggestStrategy — stratégie de réponse
// ---------------------------------------------------------------------------

/**
 * Propose une stratégie de réponse à partir des données réelles du dossier :
 * critères de notation (où se joue la note), exigences non couvertes
 * (points de vigilance) et forces de l'entreprise (Base entreprise).
 */
export async function suggestStrategy(
  tender: Tender,
  company: CompanyProfile,
): Promise<ResponseStrategy> {
  const real = await callRealApi<ResponseStrategy>('suggestStrategy', { tender, company });
  if (real) return { ...real, updatedAt: nowIso(), simulated: false };

  await simulateLatency(1100);

  const approachFor = (label: string): string => {
    const l = label.toLowerCase();
    if (l.includes('prix')) {
      return 'Chiffrage au plus juste : consulter les fournisseurs avant remise, chercher les optimisations (moyens en propre, variantes autorisées) plutôt que des provisions de précaution.';
    }
    if (l.includes('technique') || l.includes('valeur') || l.includes('mémoire')) {
      return 'Construire le mémoire en miroir des exigences du DCE : une réponse dédiée et prouvée pour chaque exigence impérative (voir matrice de conformité), avec schémas et références comparables.';
    }
    if (l.includes('délai') || l.includes('delai') || l.includes('planning')) {
      return 'Proposer un délai réaliste et démontré (phasage, jalons, marge identifiée) plutôt qu\'un délai optimiste non crédible.';
    }
    if (l.includes('social') || l.includes('insertion') || l.includes('environnement') || l.includes('rse')) {
      return 'Formaliser des engagements mesurables (heures d\'insertion, % de valorisation des déchets) avec un dispositif de suivi.';
    }
    if (l.includes('équipe') || l.includes('equipe') || l.includes('référence') || l.includes('reference')) {
      return 'Mettre en avant des CV nominatifs engagés sur le marché et des références directement comparables, chiffrées et vérifiables.';
    }
    return 'Répondre précisément à ce que le règlement de consultation demande de fournir pour ce critère — ni plus, ni moins.';
  };

  const stats = computeCoverageStats(tender.requirements);
  const gaps = tender.requirements.filter(
    (r) => r.level === 'imperatif' && (r.coverage === 'non_conforme' || r.coverage === 'a_traiter'),
  );
  const blocking = tender.dceAnalysis?.blockingPoints ?? [];

  const winThemes: string[] = [];
  if (company.equipment.length > 0) winThemes.push('Moyens matériels en propre : autonomie d\'exécution et cadences garanties');
  if (company.certifications.length > 0) {
    const certNames = [
      ...new Set(company.certifications.map((c) => c.name.split(/\s*[—:(]\s*/)[0].trim().slice(0, 40))),
    ].slice(0, 2);
    winThemes.push(`Organisation certifiée (${certNames.join(', ')}) : qualité démontrable, pas déclarative`);
  }
  if (company.references.length > 0) winThemes.push(`Références directement comparables (${company.references[0].title.slice(0, 50)}…)`);
  if (winThemes.length === 0) winThemes.push('Compléter la Base entreprise (références, certifications, matériel) pour construire des messages clés crédibles');

  return {
    positioning:
      `Positionner ${company.name} comme le candidat qui maîtrise le besoin de ${tender.buyer} : réponse construite exigence par exigence (${stats.total} exigences tracées), moyens démontrés et engagements vérifiables.`,
    winThemes,
    differentiators:
      `${company.team.length > 0 ? `Encadrement expérimenté (${company.team[0].name}, ${company.team[0].experience}). ` : ''}` +
      `${company.equipment.length > 0 ? `Parc matériel en propre (${company.equipment.length} familles d'équipements). ` : ''}` +
      `${company.references.length > 0 ? `${company.references.length} références vérifiables jointes au dossier.` : ''}`,
    criteriaApproaches: tender.awardCriteria.map((c) => ({
      criterionId: c.id,
      label: c.label,
      weight: c.weight,
      approach: approachFor(c.label),
    })),
    vigilancePoints:
      [
        ...blocking.map((b) => `Point bloquant : ${b}`),
        ...gaps.slice(0, 4).map((g) => `${g.code} (${g.level}) : ${g.text.slice(0, 90)}${g.text.length > 90 ? '…' : ''}`),
      ].join('\n') || 'Aucun point de vigilance majeur identifié à ce stade — vérifier la matrice de conformité.',
    updatedAt: nowIso(),
    simulated: true,
  };
}

// ---------------------------------------------------------------------------
// scoreOpportunity
// ---------------------------------------------------------------------------

/**
 * Pré-notation automatique des critères go/no-go à partir des données du
 * dossier (échéance, conformité, pièces). L'utilisateur ajuste ensuite.
 */
export async function scoreOpportunity(
  tender: Tender,
  criteria: GoNoGoCriterion[],
): Promise<{ criteria: GoNoGoCriterion[]; result: GoNoGoResult }> {
  const real = await callRealApi<{ criteria: GoNoGoCriterion[]; result: GoNoGoResult }>(
    'scoreOpportunity',
    { tender, criteria },
  );
  if (real) return real;

  await simulateLatency(900);

  // Même calcul (normalisé à minuit) que le badge J-x et GoNoGoTab : sinon la
  // pré-notation « délai » divergeait d'un jour selon l'heure de la journée.
  const daysLeft = daysUntil(tender.deadline);
  const nonCompliant = tender.requirements.filter((r) => r.coverage === 'non_conforme').length;
  // Même convention que buildPiecesManquantes : une pièce générée dans
  // l'application (generatedDocId) est couverte même si non « disponible ».
  const missingDocs = tender.requiredDocuments.filter(
    (d) => !d.available && !d.generatedDocId,
  ).length;

  const adjusted = criteria.map((c) => {
    let score = c.score;
    if (c.id === 'delay') score = daysLeft >= 21 ? 5 : daysLeft >= 14 ? 4 : daysLeft >= 7 ? 2 : 1;
    if (c.id === 'admin') score = missingDocs === 0 ? 5 : missingDocs <= 2 ? 3 : 2;
    if (c.id === 'risk' && nonCompliant > 0) score = Math.min(score, 2);
    return { ...c, score };
  });

  const result = computeGoNoGo(adjusted, { daysLeft, nonCompliantCount: nonCompliant });
  return { criteria: adjusted, result };
}
