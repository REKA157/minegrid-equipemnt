import type { DashboardStats, Message, Offer } from './api/types';
import type { RealLead } from '../services/realPipelineService';
import { isContactLabelRedundantWithLeadTitle, leadTitleWithoutAoPrefix } from './stockLeadSuggestions';

/** Action affichée dans le widget — enrichie pour rester alignée sur `public.leads`. */
export interface CorrelatedDailyAction {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'call' | 'email' | 'meeting' | 'follow-up' | 'quote' | 'proposal';
  dueTime: string;
  contact?: {
    name: string;
    company: string;
    phone?: string;
    email?: string;
  };
  value?: number;
  status: 'pending' | 'in-progress' | 'completed';
  aiRecommendation?: string;
  estimatedDuration: number;
  /** Id UUID du lead (`public.leads.id`) quand l'action vient du Kanban. */
  relatedLeadId?: string;
  sourceKind?: 'pipeline' | 'message' | 'offer' | 'stats';
  sourceId?: string;
}

const PRI: Record<string, number> = { high: 3, medium: 2, low: 1 };

function openLeadStage(stage: string): boolean {
  const s = (stage || '').trim();
  return s !== 'Conclu' && s !== 'Perdu';
}

function daysSinceContact(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function inferCategory(stage: string): CorrelatedDailyAction['category'] {
  const x = (stage || '').toLowerCase();
  if (x.includes('devis') || x.includes('qualification')) return 'quote';
  if (x.includes('négociation') || x.includes('negociation') || x.includes('proposition')) return 'proposal';
  return 'call';
}

function formatDueTime(iso: string | undefined): string {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '09:00';
  }
}

function priorityFromLead(lead: RealLead): CorrelatedDailyAction['priority'] {
  const stale = daysSinceContact(lead.last_contact);
  if (lead.priority === 'high' || stale >= 7) return 'high';
  if (lead.priority === 'low') return 'low';
  return 'medium';
}

function sourceRank(sk: CorrelatedDailyAction['sourceKind']): number {
  if (sk === 'pipeline') return 3;
  if (sk === 'message' || sk === 'offer') return 2;
  if (sk === 'stats') return 0;
  return 1;
}

function pipelineContactFromLead(lead: RealLead): CorrelatedDailyAction['contact'] {
  const title = lead.title || '';
  let name = (lead.contact_name || '').trim();
  let company = (lead.contact_company || '').trim();

  if (name && isContactLabelRedundantWithLeadTitle(title, name)) name = '';
  if (company && isContactLabelRedundantWithLeadTitle(title, company)) company = '';
  if (name && company && name.localeCompare(company, 'fr', { sensitivity: 'base' }) === 0) {
    company = '';
  }
  if (!name && company) {
    name = company;
    company = '';
  }

  const phone = lead.contact_phone?.trim() || undefined;
  const email = lead.contact_email?.trim() || undefined;

  if (!name && !company && !phone && !email) {
    return { name: '', company: '' };
  }

  return {
    name: name || (phone || email ? 'Contact' : ''),
    company,
    phone,
    email,
  };
}

function sortCorrelated(actions: CorrelatedDailyAction[]): void {
  actions.sort((a, b) => {
    const dr = sourceRank(b.sourceKind) - sourceRank(a.sourceKind);
    if (dr) return dr;
    return (PRI[b.priority] || 0) - (PRI[a.priority] || 0);
  });
}

function appendStatsFillers(actions: CorrelatedDailyAction[], dashboardStats: DashboardStats): void {
  if (actions.length >= 4) return;

  if (dashboardStats.totalViews > 0) {
    actions.push({
      id: 'action-views',
      title: 'Analyser les vues récentes',
      description: `${dashboardStats.totalViews} vues totales, identifier les annonces qui attirent le plus`,
      priority: 'medium',
      category: 'follow-up',
      dueTime: '14:00',
      contact: { name: 'Vitrine', company: 'Minegrid' },
      value: 0,
      status: 'pending',
      aiRecommendation: 'Croiser avec les leads du pipeline pour prioriser les relances',
      estimatedDuration: 45,
      sourceKind: 'stats',
    });
  }

  if (actions.length < 5 && dashboardStats.totalMessages > 0) {
    actions.push({
      id: 'action-messages-stats',
      title: 'Fluidifier la réponse aux messages',
      description: `${dashboardStats.totalMessages} messages — garder le même rythme sur les fiches lead`,
      priority: 'medium',
      category: 'call',
      dueTime: '16:00',
      contact: { name: 'Boîte message', company: 'Plateforme' },
      value: 0,
      status: 'pending',
      aiRecommendation: 'Les leads créés depuis les messages apparaissent aussi dans le Kanban',
      estimatedDuration: 20,
      sourceKind: 'stats',
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: 'action-default',
      title: 'Piloter votre pipeline',
      description: `Activité : ${dashboardStats.totalViews} vues, ${dashboardStats.totalMessages} messages. Ajoutez des leads dans le Kanban pour des actions ciblées.`,
      priority: 'medium',
      category: 'follow-up',
      dueTime: '11:00',
      contact: { name: 'Pilotage', company: 'Minegrid' },
      value: 0,
      status: 'pending',
      aiRecommendation: 'Créez ou importez des prospects : ils remonteront ici automatiquement',
      estimatedDuration: 30,
      sourceKind: 'stats',
    });
  }
}

/**
 * Construit la liste d'actions du jour : une ligne par lead actif (Kanban),
 * puis messages / offres sans doublon si un lead existe déjà (source_id),
 * puis indicateurs stats si la liste est courte.
 */
export function buildCorrelatedDailyActions(input: {
  leads: RealLead[];
  messages: Message[];
  offers: Offer[];
  dashboardStats: DashboardStats;
}): CorrelatedDailyAction[] {
  const { leads, messages, offers, dashboardStats } = input;
  const actions: CorrelatedDailyAction[] = [];

  const leadByMessageId = new Map<string, RealLead>();
  const leadByOfferId = new Map<string, RealLead>();
  for (const L of leads) {
    if (L.source === 'message' && L.source_id) leadByMessageId.set(String(L.source_id), L);
    if (L.source === 'offer' && L.source_id) leadByOfferId.set(String(L.source_id), L);
  }

  for (const lead of leads.filter((l) => openLeadStage(l.stage))) {
    const stale = daysSinceContact(lead.last_contact);
    const projectLabel = (leadTitleWithoutAoPrefix(lead.title) || lead.title || '').trim();
    const cn = (lead.contact_name || '').trim();
    const cc = (lead.contact_company || '').trim();
    const contactOnlyRepeatsTitle =
      (!cn || isContactLabelRedundantWithLeadTitle(lead.title, cn)) &&
      (!cc || isContactLabelRedundantWithLeadTitle(lead.title, cc));
    const relancerFallback = contactOnlyRepeatsTitle
      ? projectLabel
      : cc || cn || projectLabel;
    const title =
      lead.next_action?.trim() ||
      `Relancer — ${relancerFallback}`;
    const desc =
      `Étape : ${lead.stage} · ${projectLabel}` +
      (stale >= 5 ? ` · Sans contact depuis ${stale} j` : '');
    const contact = pipelineContactFromLead(lead);
    const withContact =
      Boolean(contact.phone) ||
      Boolean(contact.email) ||
      Boolean((contact.name || '').trim()) ||
      Boolean((contact.company || '').trim());

    actions.push({
      id: `lead:${lead.id}`,
      title,
      description: desc,
      priority: priorityFromLead(lead),
      category: inferCategory(lead.stage || ''),
      dueTime: formatDueTime(lead.last_contact),
      contact: withContact ? contact : undefined,
      value: typeof lead.value === 'number' ? lead.value : Number(lead.value) || 0,
      status: 'pending',
      aiRecommendation: `Lié au Kanban · priorité ${lead.priority} · prob. ${lead.probability ?? 0} %`,
      estimatedDuration: 20,
      relatedLeadId: lead.id,
      sourceKind: 'pipeline',
      sourceId: lead.id,
    });
  }

  const sortedMsgs = [...messages].sort((a, b) => {
    if (a.is_read !== b.is_read) return Number(a.is_read) - Number(b.is_read);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  for (const msg of sortedMsgs.slice(0, 8)) {
    if (leadByMessageId.has(String(msg.id))) continue;
    const sn = msg.sender_name?.trim() || 'Expéditeur';
    actions.push({
      id: `msg:${msg.id}`,
      title: `Répondre — ${msg.subject?.trim() || 'Message'}`,
      description: (msg.content || '').slice(0, 120) + (msg.content && msg.content.length > 120 ? '…' : ''),
      priority: 'high',
      category: 'email',
      dueTime: formatDueTime(msg.created_at),
      contact: { name: sn, company: 'Messagerie' },
      value: 0,
      status: 'pending',
      aiRecommendation:
        'Pas encore de fiche lead liée — créez un lead (Kanban / Global Monitor) pour suivre ce fil',
      estimatedDuration: 15,
      sourceKind: 'message',
      sourceId: String(msg.id),
    });
  }

  for (const offer of offers.slice(0, 6)) {
    if (leadByOfferId.has(String(offer.id))) continue;
    const buyer = offer.buyer_name?.trim() || 'Acheteur';
    actions.push({
      id: `offer:${offer.id}`,
      title: `Traiter l'offre${offer.machine_name ? ` — ${offer.machine_name}` : ''}`,
      description: offer.message?.slice(0, 100) || `Montant : ${offer.amount} · statut ${offer.status}`,
      priority: 'high',
      category: 'proposal',
      dueTime: formatDueTime(offer.created_at),
      contact: { name: buyer, company: 'Offre reçue' },
      value: offer.amount || 0,
      status: offer.status === 'pending' ? 'pending' : 'in-progress',
      aiRecommendation: 'Si le lead existe déjà dans le Kanban, une seule ligne y est affiché pour éviter les doublons',
      estimatedDuration: 30,
      sourceKind: 'offer',
      sourceId: String(offer.id),
    });
  }

  sortCorrelated(actions);
  appendStatsFillers(actions, dashboardStats);
  sortCorrelated(actions);

  return actions.slice(0, 28);
}
