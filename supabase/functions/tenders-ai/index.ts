// Edge Function `tenders-ai` — cerveau IA du module Appels d'offres.
//
// Reçoit { action, payload } depuis src/tenders/ai/aiService.ts et appelle
// l'API Claude (Anthropic). La clé ANTHROPIC_API_KEY reste ici, côté
// serveur : elle n'est JAMAIS exposée au navigateur.
//
// Actions : ping, analyzeTender (lit les PDF du DCE), extractRequirements,
// generateDocument, generateTechnicalMemo, improveSection,
// draftRequirementResponse, suggestStrategy, scoreOpportunity, summarizeDCE.
//
// Sorties structurées : chaque action force un schéma JSON via
// output_config.format — le frontend reçoit toujours un objet valide.
// En cas d'erreur (quota, clé absente…), on renvoie un statut non-2xx :
// le frontend retombe alors automatiquement sur son mode simulation.
//
// Secrets à configurer (Supabase → Edge Functions → Secrets) :
//   ANTHROPIC_API_KEY        (obligatoire)
//   TENDERS_AI_MODEL         (optionnel, défaut claude-opus-4-8)
//   TENDERS_AI_REQUIRE_AUTH  (optionnel, "true" = utilisateur connecté requis)
//   ALLOWED_ORIGINS          (optionnel, partagé avec les autres fonctions)

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = Deno.env.get('TENDERS_AI_MODEL') ?? 'claude-opus-4-8';
const REQUIRE_AUTH = (Deno.env.get('TENDERS_AI_REQUIRE_AUTH') ?? '').toLowerCase() === 'true';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- CORS (même convention durcie que send-email) -------------------------

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) {
    return [
      'https://minegrid-equipement.com',
      'http://localhost:5173',
      'http://localhost:4173',
      'http://localhost:5188',
      'http://localhost:5299',
    ];
  }
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || '';
  const allowed = getAllowedOrigins();
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

// --- Aide : appel Claude avec sortie JSON garantie -------------------------

interface ClaudeJsonCall {
  system: string;
  content: Anthropic.ContentBlockParam[] | string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

async function claudeJson<T>({ system, content, schema, maxTokens = 16000 }: ClaudeJsonCall): Promise<T> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema } },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('La requête a été refusée par les garde-fous du modèle.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Réponse tronquée (max_tokens atteint) — réessayez avec moins de contenu.');
  }
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') {
    throw new Error('Réponse du modèle sans contenu texte.');
  }
  return JSON.parse(text.text) as T;
}

const uid = () => crypto.randomUUID();

// --- Schémas JSON (alignés sur src/tenders/types.ts) -----------------------

const S = {
  str: { type: 'string' },
  num: { type: 'number' },
  strArr: { type: 'array', items: { type: 'string' } },
} as const;

function obj(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function arr(items: unknown): Record<string, unknown> {
  return { type: 'array', items };
}

const ANALYSIS_SCHEMA = obj({
  detectedDocuments: arr(obj({ name: S.str, type: S.str, pages: S.num })),
  keyClauses: arr(obj({ title: S.str, excerpt: S.str, risk: { type: 'string', enum: ['faible', 'moyen', 'eleve'] } })),
  keyDates: arr(obj({ label: S.str, date: { type: 'string', description: 'Date ISO AAAA-MM-JJ' } })),
  requiredDocuments: arr(obj({ label: S.str, category: { type: 'string', enum: ['administratif', 'technique', 'financier'] } })),
  awardCriteria: arr(obj({ label: S.str, weight: S.num })),
  technicalRequirements: S.strArr,
  contractualRisks: S.strArr,
  blockingPoints: S.strArr,
  summary: S.str,
});

const SECTIONS_SCHEMA = obj({
  sections: arr(obj({ title: S.str, content: S.str })),
});

const STRATEGY_SCHEMA = obj({
  positioning: S.str,
  winThemes: S.strArr,
  differentiators: S.str,
  criteriaApproaches: arr(obj({ criterionId: S.str, label: S.str, weight: S.num, approach: S.str })),
  vigilancePoints: S.str,
});

const SCORE_SCHEMA = obj({
  scores: arr(obj({ id: S.str, score: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] }, justification: S.str })),
  reasons: S.strArr,
  risks: S.strArr,
  actions: S.strArr,
});

// --- Contexte système commun ------------------------------------------------

const SYSTEM_BASE =
  'Tu es un expert des marchés publics et privés (BTP, services, informatique) au Maroc et en France. ' +
  'Tu aides une entreprise à analyser des dossiers de consultation (DCE) et à produire des réponses ' +
  'professionnelles, engageantes et conformes. Réponds toujours en français professionnel. ' +
  'Sois concret et précis ; ne prétends jamais qu\'une information figure dans un document si tu ne l\'y as pas lue.';

// --- Traitement des actions -------------------------------------------------

// deno-lint-ignore no-explicit-any
async function handleAction(action: string, payload: any): Promise<unknown> {
  switch (action) {
    case 'ping': {
      return { ok: true, model: MODEL, hasKey: Boolean(ANTHROPIC_API_KEY) };
    }

    case 'analyzeTender': {
      const files: { name: string; size: number; base64?: string }[] = payload.files ?? [];
      const pdfBlocks: Anthropic.ContentBlockParam[] = files
        .filter((f) => f.base64 && f.name.toLowerCase().endsWith('.pdf'))
        .map((f) => ({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: f.base64! },
        }));
      const unreadable = files.filter((f) => !f.base64).map((f) => f.name);

      const prompt =
        `Analyse ce dossier de consultation (DCE).\n` +
        `Consultation : « ${payload.title ?? 'sans titre'} » — secteur : ${payload.sector ?? 'inconnu'}.\n` +
        (pdfBlocks.length > 0
          ? `Les documents PDF du DCE sont joints ci-dessus : lis-les intégralement.\n`
          : `Aucun document lisible n'est joint : réponds uniquement à partir du titre et du secteur, en restant générique et en le signalant dans summary.\n`) +
        (unreadable.length > 0
          ? `Fichiers non lisibles ici (Word/Excel/ZIP) : ${unreadable.join(', ')} — mentionne dans summary qu'ils restent à dépouiller manuellement.\n`
          : '') +
        `Extrais : documents détectés, clauses importantes (avec niveau de risque), dates clés (format ISO), ` +
        `pièces exigées des candidats, critères de jugement avec pondérations, exigences techniques, ` +
        `risques contractuels, points bloquants (motifs de rejet de l'offre), et une synthèse actionnable de 3-4 phrases.`;

      const result = await claudeJson<Record<string, unknown>>({
        system: SYSTEM_BASE,
        content: [...pdfBlocks, { type: 'text', text: prompt }],
        schema: ANALYSIS_SCHEMA,
        maxTokens: 16000,
      });

      // Complète la forme attendue par le frontend (ids, dates, echo fichiers).
      return {
        ...result,
        keyDates: (result.keyDates as { label: string; date: string }[]).map((d) => ({ ...d, id: uid() })),
        awardCriteria: (result.awardCriteria as { label: string; weight: number }[]).map((c) => ({ ...c, id: uid() })),
        analyzedAt: new Date().toISOString(),
        files: files.map((f) => ({ name: f.name, size: f.size })),
      };
    }

    case 'extractRequirements': {
      const result = await claudeJson<{ requirements: string[] }>({
        system: SYSTEM_BASE,
        content:
          `Voici un extrait d'un cahier des charges. Extrais chaque exigence distincte imposée au titulaire ` +
          `(obligations, seuils, pièces à fournir, contraintes). Reformule chaque exigence en une phrase autonome ` +
          `et fidèle au texte. Si aucune exigence n'est présente, renvoie un tableau vide.\n\n---\n${payload.text}`,
        schema: obj({ requirements: S.strArr }),
        maxTokens: 8000,
      });
      return result;
    }

    case 'generateDocument': {
      const { cdc, company } = payload;
      const result = await claudeJson<{ sections: { title: string; content: string }[] }>({
        system: SYSTEM_BASE,
        content:
          `Rédige un cahier des charges complet et professionnel, structuré en 12 à 15 sections numérotées ` +
          `(objet/contexte, objectifs, périmètre, contraintes techniques, contraintes réglementaires, livrables, ` +
          `planning, qualité, réception, pénalités, sécurité, environnement, budget si fourni, annexes).\n` +
          `Développe et professionnalise les réponses du client sans les trahir ; propose des clauses standard ` +
          `équilibrées quand un champ est vide.\n\nDonnées du client (JSON) :\n${JSON.stringify(cdc)}\n\n` +
          `Entreprise émettrice : ${company?.name ?? ''} (${company?.city ?? ''}, ${company?.country ?? ''}).`,
        schema: SECTIONS_SCHEMA,
        maxTokens: 20000,
      });
      return { sections: result.sections.map((s) => ({ ...s, id: uid() })) };
    }

    case 'generateTechnicalMemo': {
      const { tender, company } = payload;
      const result = await claudeJson<{ sections: { title: string; content: string }[] }>({
        system: SYSTEM_BASE,
        content:
          `Rédige un mémoire technique complet (15 sections numérotées : présentation de l'entreprise, ` +
          `compréhension du besoin, méthodologie d'exécution, organisation, moyens humains, moyens matériels, ` +
          `planning, qualité, sécurité, environnement, gestion des risques, contrôle et reporting, références ` +
          `similaires, valeur ajoutée, conclusion) pour répondre à cet appel d'offres.\n` +
          `Utilise UNIQUEMENT les données réelles fournies (équipes, matériel, références, certifications) — ` +
          `n'invente aucun chiffre ni aucune référence. Intègre la stratégie de réponse si elle est fournie ` +
          `(messages clés, angles par critère, points de vigilance) et réponds aux exigences du référentiel.\n\n` +
          `Appel d'offres (JSON) :\n${JSON.stringify({
            reference: tender.reference,
            title: tender.title,
            buyer: tender.buyer,
            sector: tender.sector,
            description: tender.description,
            awardCriteria: tender.awardCriteria,
            requirements: tender.requirements,
            strategy: tender.strategy,
            dceAnalysis: tender.dceAnalysis
              ? {
                  technicalRequirements: tender.dceAnalysis.technicalRequirements,
                  contractualRisks: tender.dceAnalysis.contractualRisks,
                  blockingPoints: tender.dceAnalysis.blockingPoints,
                }
              : null,
          })}\n\nEntreprise (JSON) :\n${JSON.stringify(company)}`,
        schema: SECTIONS_SCHEMA,
        maxTokens: 24000,
      });
      return { sections: result.sections.map((s) => ({ ...s, id: uid() })) };
    }

    case 'improveSection': {
      const { section, instruction } = payload;
      const result = await claudeJson<{ content: string }>({
        system: SYSTEM_BASE,
        content:
          `Améliore cette section d'un document de réponse à appel d'offres : rends-la plus professionnelle, ` +
          `engageante et convaincante, sans inventer de faits ni de chiffres. Conserve les informations factuelles.\n` +
          (instruction ? `Consigne particulière : ${instruction}\n` : '') +
          `\nTitre : ${section.title}\n\nContenu actuel :\n${section.content}`,
        schema: obj({ content: S.str }),
        maxTokens: 8000,
      });
      return result;
    }

    case 'draftRequirementResponse': {
      const { requirement, tender, company } = payload;
      const result = await claudeJson<{ response: string }>({
        system: SYSTEM_BASE,
        content:
          `Rédige la réponse de l'entreprise à UNE exigence d'un DCE, pour le document « réponse point par ` +
          `point ». La réponse doit être engageante (l'entreprise s'engage), concrète (dispositif proposé, ` +
          `moyens, preuves) et s'appuyer uniquement sur les données réelles de l'entreprise fournies.\n\n` +
          `Exigence ${requirement.code} (${requirement.source || 'source non précisée'}, niveau ${requirement.level}) :\n` +
          `${requirement.text}\n\nMarché : ${tender?.title ?? ''} (secteur ${tender?.sector ?? ''}).\n\n` +
          `Entreprise (JSON) :\n${JSON.stringify(company)}`,
        schema: obj({ response: S.str }),
        maxTokens: 4000,
      });
      return result;
    }

    case 'suggestStrategy': {
      const { tender, company } = payload;
      const result = await claudeJson<Record<string, unknown>>({
        system: SYSTEM_BASE,
        content:
          `Propose une stratégie de réponse gagnante pour cet appel d'offres : positionnement (2-3 phrases), ` +
          `3 messages clés maximum (win themes) appuyés sur les forces réelles de l'entreprise, différenciateurs ` +
          `concrets, un angle de réponse par critère de notation (reprends criterionId, label et weight EXACTEMENT ` +
          `tels que fournis), et les points de vigilance (points bloquants, exigences non couvertes).\n\n` +
          `Appel d'offres (JSON) :\n${JSON.stringify({
            title: tender.title,
            buyer: tender.buyer,
            sector: tender.sector,
            description: tender.description,
            awardCriteria: tender.awardCriteria,
            requirements: tender.requirements,
            blockingPoints: tender.dceAnalysis?.blockingPoints ?? [],
          })}\n\nEntreprise (JSON) :\n${JSON.stringify(company)}`,
        schema: STRATEGY_SCHEMA,
        maxTokens: 8000,
      });
      return result;
    }

    case 'scoreOpportunity': {
      const { tender, criteria } = payload;
      const result = await claudeJson<{
        scores: { id: string; score: number; justification: string }[];
        reasons: string[];
        risks: string[];
        actions: string[];
      }>({
        system: SYSTEM_BASE,
        content:
          `Évalue cette opportunité d'appel d'offres pour décider go/no-go. Pour CHAQUE critère fourni ` +
          `(reprends son id exactement), attribue une note de 0 (très défavorable) à 5 (très favorable) ` +
          `justifiée par les données du dossier. Donne aussi les raisons principales, les risques et les ` +
          `actions recommandées (3 à 5 de chaque, concrètes).\n\n` +
          `Critères (JSON) :\n${JSON.stringify(criteria)}\n\n` +
          `Dossier (JSON) :\n${JSON.stringify({
            title: tender.title,
            buyer: tender.buyer,
            sector: tender.sector,
            deadline: tender.deadline,
            estimatedAmount: tender.estimatedAmount,
            description: tender.description,
            requirements: tender.requirements,
            requiredDocuments: tender.requiredDocuments,
            dceAnalysis: tender.dceAnalysis
              ? {
                  contractualRisks: tender.dceAnalysis.contractualRisks,
                  blockingPoints: tender.dceAnalysis.blockingPoints,
                }
              : null,
          })}`,
        schema: SCORE_SCHEMA,
        maxTokens: 8000,
      });

      // Fusionne les notes du modèle puis calcule le score déterministe
      // (même formule que src/tenders/lib/scoring.ts — à garder en phase).
      const scoreById = new Map(result.scores.map((s) => [s.id, s.score]));
      const adjusted = (criteria as { id: string; weight: number; score: number }[]).map((c) => ({
        ...c,
        score: scoreById.get(c.id) ?? c.score,
      }));
      const totalWeight = adjusted.reduce((sum, c) => sum + c.weight, 0) || 1;
      const weighted = adjusted.reduce((sum, c) => sum + (c.score / 5) * c.weight, 0);
      const globalScore = Math.round((weighted / totalWeight) * 100);
      let recommendation: 'repondre' | 'prudence' | 'ne_pas_repondre' =
        globalScore >= 65 ? 'repondre' : globalScore >= 45 ? 'prudence' : 'ne_pas_repondre';
      const critical = adjusted.filter((c) => c.score <= 1 && c.weight >= 10);
      if (critical.length >= 2 && recommendation === 'repondre') recommendation = 'prudence';
      if (critical.length >= 3) recommendation = 'ne_pas_repondre';

      return {
        criteria: adjusted,
        result: {
          computedAt: new Date().toISOString(),
          globalScore,
          recommendation,
          reasons: result.reasons,
          risks: result.risks,
          actions: result.actions,
        },
      };
    }

    case 'summarizeDCE': {
      const result = await claudeJson<{ summary: string }>({
        system: SYSTEM_BASE,
        content:
          `Résume en 3 phrases exécutives cette analyse de DCE pour un dirigeant pressé ` +
          `(points bloquants d'abord, puis prochaine échéance, puis recommandation) :\n${JSON.stringify(payload)}`,
        schema: obj({ summary: S.str }),
        maxTokens: 2000,
      });
      return result;
    }

    default:
      throw new Error(`Action inconnue : ${action}`);
  }
}

// --- Point d'entrée ---------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Méthode non autorisée' }, 405);

  if (!ANTHROPIC_API_KEY) {
    return json(req, { error: 'ANTHROPIC_API_KEY non configurée sur le serveur.' }, 503);
  }

  // Authentification renforcée optionnelle : exige un utilisateur connecté
  // (recommandé en production pour protéger le crédit API).
  if (REQUIRE_AUTH) {
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return json(req, { error: 'Authentification requise.' }, 401);
    }
  }

  let body: { action?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Corps JSON invalide.' }, 400);
  }
  if (!body.action) return json(req, { error: 'Champ "action" manquant.' }, 400);

  try {
    const result = await handleAction(body.action, body.payload ?? {});
    return json(req, result);
  } catch (err) {
    // Erreurs typées du SDK : on distingue quota/surcharge (réessayable)
    // du reste, et on renvoie un statut non-2xx pour déclencher le
    // fallback simulation côté frontend.
    if (err instanceof Anthropic.RateLimitError) {
      return json(req, { error: 'Quota API atteint — réessayez dans quelques minutes.' }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json(req, { error: 'Clé API Anthropic invalide.' }, 502);
    }
    if (err instanceof Anthropic.APIError) {
      return json(req, { error: `Erreur API Claude (${err.status ?? '?'}) : ${err.message}` }, 502);
    }
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[tenders-ai]', body.action, message);
    return json(req, { error: message }, 500);
  }
});
