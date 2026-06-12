import type { CorrelatedDailyAction } from './correlateLeadActions';
import { getUpcomingRentals } from './enterpriseApi/rentals';
import { getEquipmentAvailability } from './enterpriseApi/equipment';
import { getRentalPipelineLeads } from './enterpriseApi/rentals';

type UpcomingRental = Awaited<ReturnType<typeof getUpcomingRentals>>[number];
type EquipPack = Awaited<ReturnType<typeof getEquipmentAvailability>>;
type PipelineLead = Awaited<ReturnType<typeof getRentalPipelineLeads>>[number];

function rentalPriority(r: UpcomingRental): CorrelatedDailyAction['priority'] {
  if (r.daysUntilStart <= 1) return 'high';
  if (r.daysUntilStart <= 3) return 'high';
  if (r.daysUntilStart <= 7) return 'medium';
  return 'low';
}

function rentalCategory(r: UpcomingRental): CorrelatedDailyAction['category'] {
  if (r.daysUntilStart <= 0) return 'follow-up';
  if (r.daysUntilStart <= 2) return 'call';
  return 'meeting';
}

/**
 * Génère des actions corrélées pour le dashboard loueur à partir des données réelles :
 * 1. Locations imminentes / en cours → préparer, livrer, contacter client
 * 2. Équipements en maintenance → suivre le retour
 * 3. Pipeline location → relancer les demandes ouvertes
 */
export async function buildCorrelatedRentalActions(): Promise<CorrelatedDailyAction[]> {
  const [rentals, equipPack, pipelineLeads] = await Promise.allSettled([
    getUpcomingRentals(),
    getEquipmentAvailability(),
    getRentalPipelineLeads(),
  ]);

  const upcomingRentals: UpcomingRental[] =
    rentals.status === 'fulfilled' ? rentals.value : [];
  const equipment: EquipPack =
    equipPack.status === 'fulfilled'
      ? equipPack.value
      : { summary: [], details: [], stats: { total: 0, available: 0, rented: 0, maintenance: 0, averageUsageRate: 0 } };
  const pipeline: PipelineLead[] =
    pipelineLeads.status === 'fulfilled' ? pipelineLeads.value : [];

  const actions: CorrelatedDailyAction[] = [];

  for (const r of upcomingRentals.slice(0, 10)) {
    const isOngoing = r.daysUntilStart <= 0;
    const startLabel = r.start_date ? new Date(r.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';
    const endLabel = r.end_date ? new Date(r.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';

    let title: string;
    let desc: string;
    let aiRec: string;

    if (isOngoing) {
      title = `Suivi location en cours — ${r.equipmentFullName}`;
      desc = `Client : ${r.clientName} · Fin prévue ${endLabel} · ${r.durationDays}j`;
      aiRec = 'Vérifier le bon déroulement et anticiper le retour équipement';
    } else if (r.daysUntilStart <= 2) {
      title = `Préparer la livraison — ${r.equipmentFullName}`;
      desc = `Départ ${startLabel} · Client : ${r.clientName} · ${r.durationDays}j de location`;
      aiRec = 'Vérifier l\'état de l\'équipement et confirmer la livraison avec le client';
    } else {
      title = `Location à venir — ${r.equipmentFullName}`;
      desc = `${startLabel} → ${endLabel} · ${r.clientName} · ${r.durationDays}j`;
      aiRec = 'Confirmer la réservation et planifier la logistique';
    }

    actions.push({
      id: `rental:${r.id}`,
      title,
      description: desc,
      priority: rentalPriority(r),
      category: rentalCategory(r),
      dueTime: isOngoing ? '08:00' : '09:00',
      contact: { name: r.clientName, company: '' },
      value: r.total_price || 0,
      status: 'pending',
      aiRecommendation: aiRec,
      estimatedDuration: isOngoing ? 15 : 30,
      sourceKind: 'pipeline',
      sourceId: r.id,
    });
  }

  const inMaintenance = (equipment.details as any[]).filter(
    (m) => m.status === 'Maintenance',
  );
  for (const m of inMaintenance.slice(0, 5)) {
    const schedDate = m.currentIntervention?.scheduledDate
      ? new Date(m.currentIntervention.scheduledDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      : '';

    actions.push({
      id: `maint:${String(m.id)}`,
      title: `Maintenance — ${m.equipmentFullName || m.name || 'Équipement'}`,
      description: `Statut : ${m.currentIntervention?.status || 'En cours'}${schedDate ? ` · Prévu ${schedDate}` : ''}`,
      priority: 'high',
      category: 'follow-up',
      dueTime: '10:00',
      contact: { name: 'Atelier', company: '' },
      value: 0,
      status: 'pending',
      aiRecommendation: 'Équipement indisponible — vérifier l\'avancement et le retour au parc',
      estimatedDuration: 20,
      sourceKind: 'pipeline',
      sourceId: String(m.id || ''),
    });
  }

  const openPipeline = pipeline.filter(
    (l) => l.stage !== 'Conclu' && l.stage !== 'Perdu',
  );
  const rentalIds = new Set(upcomingRentals.map((r) => r.id));
  for (const lead of openPipeline.slice(0, 8)) {
    if (rentalIds.has(lead.id)) continue;

    actions.push({
      id: `rpipe:${lead.id}`,
      title: `Relancer — ${lead.title}`,
      description: `Étape : ${lead.stage} · ${lead.company || 'Client'}`,
      priority: lead.priority === 'high' ? 'high' : 'medium',
      category: 'call',
      dueTime: '11:00',
      contact: lead.contact
        ? { name: lead.contact.name, company: lead.contact.company || '', phone: lead.contact.phone, email: lead.contact.email }
        : { name: lead.company || 'Client', company: '' },
      value: lead.value || 0,
      status: 'pending',
      aiRecommendation: `Pipeline location · Probabilité ${lead.probability}%`,
      estimatedDuration: 20,
      sourceKind: 'pipeline',
      sourceId: lead.id,
    });
  }

  if (actions.length === 0) {
    const { stats } = equipment;
    actions.push({
      id: 'action-loueur-default',
      title: 'Piloter votre parc de location',
      description: `${stats.total} équipements · ${stats.available} disponibles · ${stats.rented} en location · ${stats.maintenance} en maintenance`,
      priority: 'medium',
      category: 'follow-up',
      dueTime: '09:00',
      contact: { name: 'Tableau de bord', company: 'Minegrid' },
      value: 0,
      status: 'pending',
      aiRecommendation: 'Créez des contrats de location pour voir les actions corrélées ici',
      estimatedDuration: 30,
      sourceKind: 'stats',
    });
  }

  actions.sort((a, b) => {
    const priMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return (priMap[b.priority] || 0) - (priMap[a.priority] || 0);
  });

  return actions.slice(0, 20);
}
