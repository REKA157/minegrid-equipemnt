import type { RealLead } from '../services/realPipelineService';
import type { MonitorLeadContext } from './globalMonitorEquipmentNeedsText';

export type StockMachineBrief = {
  id: string;
  name: string;
  category: string;
  brand?: string;
  model?: string;
  price?: number;
  /** Extrait description pour matcher mots-clés prospect */
  description?: string;
};

export type LeadStockSuggestion = {
  machine: StockMachineBrief;
  score: number;
  reason: string;
};

export type LeadStockSuggestionRow = {
  leadId: string;
  leadTitle: string;
  stage: string;
  contactLabel: string;
  suggested: LeadStockSuggestion[];
  /** Résumé besoins matériel Global Monitor quand le lead a un source_id projet */
  monitorNeedsSummary?: string | null;
};

/** Titre pipeline sans préfixe type « Prospect AO - » (affichage / comparaisons). */
export function leadTitleWithoutAoPrefix(title: string): string {
  return String(title || '')
    .trim()
    .replace(/^\s*prospect\s+ao\s*-\s*/i, '')
    .trim();
}

/**
 * True si `contactLabel` ne fait que répéter le nom de projet déjà présent dans le titre
 * (cas fréquent : title = `Prospect AO - ${projet}` et contact_company = même intitulé).
 */
export function isContactLabelRedundantWithLeadTitle(leadTitle: string, contactLabel: string): boolean {
  const c = String(contactLabel || '').trim();
  if (!c) return true;
  if (/^contact$/i.test(c)) return true;

  const t = String(leadTitle || '').trim();
  const tLow = t.toLowerCase();
  const cLow = c.toLowerCase();

  if (cLow.length >= 4 && tLow.includes(cLow)) return true;

  const core = leadTitleWithoutAoPrefix(t).toLowerCase();
  if (!core) return false;
  if (cLow === core) return true;

  const minLen = 8;
  if (cLow.length >= minLen && core.includes(cLow)) return true;
  if (core.length >= minLen && cLow.includes(core)) return true;

  return false;
}

const STOP = new Set([
  'pour',
  'des',
  'les',
  'une',
  'avec',
  'dans',
  'sur',
  'vos',
  'aux',
  'the',
  'and',
  'for',
  'vente',
  'location',
  'occasion',
  'neuf',
  'demande',
  'besoin',
  'client',
  'projet',
  'offre',
  'devis',
]);

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/gi, ' ');
}

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm(text).split(/\s+/)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return out;
}

function scoreMatch(
  leadNorm: string,
  leadTokens: Set<string>,
  machine: StockMachineBrief,
): { score: number; hits: string[] } {
  const bucket = [
    machine.name,
    machine.category,
    machine.brand || '',
    machine.model || '',
    (machine.description || '').slice(0, 400),
  ]
    .filter(Boolean)
    .join(' ');
  const mt = tokens(bucket);
  const hits: string[] = [];
  let score = 0;

  for (const t of leadTokens) {
    if (mt.has(t)) {
      score += 4;
      hits.push(t);
      continue;
    }
    for (const m of mt) {
      if (m.includes(t) || t.includes(m)) {
        score += 2;
        hits.push(`${t}~${m}`);
        break;
      }
    }
  }

  const cat = norm(machine.category);
  for (const t of leadTokens) {
    if (t.length >= 4 && (cat.includes(t) || t.includes(cat))) score += 1;
  }

  // Recoupement « phrase » : sous-chaînes du lead présentes dans l’annonce (marque, modèle, nom complet)
  if (leadNorm.length >= 4) {
    for (const piece of [machine.name, machine.brand, machine.model, machine.category].filter(Boolean)) {
      const p = norm(String(piece));
      if (p.length >= 4 && leadNorm.includes(p)) {
        score += 10;
        hits.push(`≈${piece}`);
      }
    }
    for (const w of mt) {
      if (w.length >= 4 && leadNorm.includes(w)) {
        score += 3;
        hits.push(w);
      }
    }
  }

  return { score, hits };
}

function openLead(stage: string): boolean {
  const s = norm((stage || '').trim());
  if (!s) return true;
  const closed = new Set([
    'conclu',
    'perdu',
    'gagne',
    'gagnee',
    'gagné',
    'gagnée',
    'clos',
    'closed',
    'lost',
  ]);
  return !closed.has(s);
}

/**
 * Pour chaque lead actif du pipeline, propose jusqu'à `maxPerLead` annonces du stock
 * du vendeur (score par mots communs titre / notes / société vs nom, marque, modèle, catégorie).
 * `monitorBySourceId` : pour les leads issus du Global Monitor (`source_id` = id projet), reprend
 * les besoins matériel du projet pour affiner le rapprochement.
 * Si aucun score > 0, retourne les premiers engins du stock comme pistes manuelles.
 */
export function buildLeadStockSuggestions(
  leads: RealLead[],
  machines: StockMachineBrief[],
  maxPerLead = 3,
  maxLeads = 14,
  monitorBySourceId?: Map<string, MonitorLeadContext>,
): LeadStockSuggestionRow[] {
  const rows: LeadStockSuggestionRow[] = [];
  const open = leads.filter((l) => openLead(l.stage || ''));

  const monitorLine = (lead: RealLead): string => {
    const id = lead.source_id?.trim();
    if (!id || !monitorBySourceId) return '';
    return monitorBySourceId.get(id)?.scoringText || '';
  };

  const monitorSummary = (lead: RealLead): string | null => {
    const id = lead.source_id?.trim();
    if (!id || !monitorBySourceId) return null;
    return monitorBySourceId.get(id)?.displayShort || null;
  };

  if (!machines.length) {
    return open.slice(0, maxLeads).map((lead) => ({
      leadId: lead.id,
      leadTitle: lead.title,
      stage: lead.stage,
      contactLabel: lead.contact_company || lead.contact_name || 'Contact',
      suggested: [],
      monitorNeedsSummary: monitorSummary(lead),
    }));
  }

  for (const lead of open.slice(0, maxLeads)) {
    const leadText = [
      lead.title,
      lead.notes,
      lead.next_action,
      lead.contact_company,
      lead.contact_name,
      monitorLine(lead),
    ]
      .filter(Boolean)
      .join(' ');

    const leadNorm = norm(leadText);

    let leadTokens = tokens(leadText);
    if (leadTokens.size === 0) {
      for (const w of norm(lead.title).split(/\s+/)) {
        if (w.length >= 2) leadTokens.add(w);
      }
    }

    const scored = machines
      .map((m) => {
        const { score, hits } = scoreMatch(leadNorm, leadTokens, m);
        return {
          machine: m,
          score,
          reason:
            hits.length > 0
              ? `Mots communs : ${[...new Set(hits)].slice(0, 6).join(', ')}`
              : 'Correspondance faible — à valider avec le prospect',
        } satisfies LeadStockSuggestion;
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPerLead);

    const suggested: LeadStockSuggestion[] =
      scored.length > 0
        ? scored
        : machines.slice(0, maxPerLead).map((m) => ({
            machine: m,
            score: 0,
            reason:
              'Aucun mot-clé automatique — proposer ces modèles du stock et affiner au téléphone',
          }));

    rows.push({
      leadId: lead.id,
      leadTitle: lead.title,
      stage: lead.stage,
      contactLabel: lead.contact_company || lead.contact_name || 'Contact',
      suggested,
      monitorNeedsSummary: monitorSummary(lead),
    });
  }

  return rows;
}
