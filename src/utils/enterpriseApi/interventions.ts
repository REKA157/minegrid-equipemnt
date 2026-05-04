import { INTERVENTION_URGENT_COLUMNS } from '../../constants/enterpriseApiQueryFields';
import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

// =====================================================
// APIs POUR LES WIDGETS MECANICIEN
// =====================================================

type InterventionRow = {
  id: string;
  description: string;
  intervention_date: string;
  priority: 'Basse' | 'Moyenne' | 'Haute' | 'Urgente';
  status: string;
  estimated_duration?: number | null;
  equipment_id?: string | null;
  technician_id?: string | null;
  created_at?: string | null;
};

type EquipmentRow = {
  id: string;
  name?: string | null;
  brand?: string | null;
  model?: string | null;
};

type TechnicianRow = {
  id: string;
  name?: string | null;
  specialization?: string | null;
};

// WIDGET "INTERVENTIONS DU JOUR"
export async function getDailyInterventions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const data = await supabaseCall<Array<{ status: string }>>(
    () =>
      supabase
        .from('interventions')
        .select('status')
        .gte('intervention_date', today.toISOString())
        .lt('intervention_date', tomorrow.toISOString()),
    { label: 'getDailyInterventions', fallback: [] },
  );

  const completed = data.filter((i) => i.status === 'Terminé').length;
  const pending = data.filter((i) => i.status !== 'Terminé').length;

  return [
    { name: 'Terminé', value: completed },
    { name: 'En attente', value: pending },
  ];
}

export async function getInterventionsByStatus(status: 'Terminé' | 'En attente' | 'En cours') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return supabaseCall(
    () =>
      supabase
        .from('interventions')
        .select(
          `id, description, status, priority, intervention_date,
           equipment:machines ( name ),
           technician:technicians ( name )`,
        )
        .eq('status', status)
        .gte('intervention_date', today.toISOString())
        .lt('intervention_date', tomorrow.toISOString()),
    { label: `getInterventionsByStatus.${status}`, fallback: [] },
  );
}

export async function createIntervention(interventionData: {
  equipment_id: string;
  description: string;
  technician_id?: string;
  intervention_date: string;
  priority: 'Basse' | 'Moyenne' | 'Haute';
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('interventions')
        .insert([
          {
            ...interventionData,
            status: 'En attente',
            created_by: userData.user.id,
          },
        ])
        .select()
        .single(),
    {
      label: 'createIntervention',
      toastOnError: true,
      toastMessage: "Impossible de créer l'intervention",
    },
  );
}

export const getUrgentInterventions = async () => {
  return supabaseCall(
    () =>
      supabase
        .from('interventions')
        .select(INTERVENTION_URGENT_COLUMNS)
        .eq('priority', 'Urgente')
        .not('status', 'eq', 'Terminé')
        .order('scheduled_date', { ascending: true }),
    { label: 'getUrgentInterventions', fallback: [] },
  );
};

// WIDGET "MAINTENANCE PREVENTIVE"
export async function getPreventiveMaintenance() {
  const interventions = await supabaseCall<InterventionRow[]>(
    () =>
      supabase
        .from('interventions')
        .select(
          `id, description, intervention_date, priority, status,
           estimated_duration, equipment_id, technician_id, created_at`,
        )
        .gte('intervention_date', new Date().toISOString())
        .order('intervention_date', { ascending: true })
        .limit(20),
    { label: 'getPreventiveMaintenance.interventions', fallback: [] },
  );

  const equipmentIds = [...new Set(interventions.map((i) => i.equipment_id).filter(Boolean))];
  const technicianIds = [...new Set(interventions.map((i) => i.technician_id).filter(Boolean))];

  const [equipmentList, technicianList] = await Promise.all([
    equipmentIds.length > 0
      ? supabaseCall<EquipmentRow[]>(
          () => supabase.from('machines').select('id, name, brand, model').in('id', equipmentIds),
          { label: 'getPreventiveMaintenance.equipment', fallback: [] },
        )
      : Promise.resolve<EquipmentRow[]>([]),
    technicianIds.length > 0
      ? supabaseCall<TechnicianRow[]>(
          () =>
            supabase
              .from('technicians')
              .select('id, name, specialization')
              .in('id', technicianIds),
          { label: 'getPreventiveMaintenance.technicians', fallback: [] },
        )
      : Promise.resolve<TechnicianRow[]>([]),
  ]);

  const equipmentData: Record<string, EquipmentRow> = {};
  equipmentList.forEach((eq) => {
    equipmentData[eq.id] = eq;
  });
  const technicianData: Record<string, TechnicianRow> = {};
  technicianList.forEach((t) => {
    technicianData[t.id] = t;
  });

  const enrichedInterventions = interventions.map((intervention) => {
    const interventionDate = new Date(intervention.intervention_date);
    const now = new Date();
    const timeUntil = interventionDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(timeUntil / (1000 * 60 * 60 * 24));
    const hoursUntil = Math.ceil(timeUntil / (1000 * 60 * 60));

    let urgency = 'normal';
    if (daysUntil < 0) urgency = 'overdue';
    else if (daysUntil === 0 && hoursUntil <= 2) urgency = 'urgent';
    else if (daysUntil <= 1) urgency = 'high';
    else if (daysUntil <= 3) urgency = 'medium';

    const equipment = equipmentData[intervention.equipment_id];
    const technician = technicianData[intervention.technician_id];

    return {
      ...intervention,
      daysUntil,
      hoursUntil,
      urgency,
      equipmentName: equipment
        ? `${equipment.brand || ''} ${equipment.model || equipment.name}`.trim()
        : 'Équipement non spécifié',
      technicianName: technician?.name || 'Non assigné',
      technicianSpecialization: technician?.specialization || '',
      isOverdue: daysUntil < 0,
      isToday: daysUntil === 0,
      isThisWeek: daysUntil <= 7,
    };
  });

  const total = enrichedInterventions.length;
  const today = enrichedInterventions.filter((i) => i.isToday).length;
  const thisWeek = enrichedInterventions.filter((i) => i.isThisWeek).length;
  const overdue = enrichedInterventions.filter((i) => i.isOverdue).length;
  const byPriority = {
    haute: enrichedInterventions.filter((i) => i.priority === 'Haute').length,
    moyenne: enrichedInterventions.filter((i) => i.priority === 'Moyenne').length,
    basse: enrichedInterventions.filter((i) => i.priority === 'Basse').length,
  };
  const byStatus = {
    'En attente': enrichedInterventions.filter((i) => i.status === 'En attente').length,
    'En cours': enrichedInterventions.filter((i) => i.status === 'En cours').length,
    'Terminé': enrichedInterventions.filter((i) => i.status === 'Terminé').length,
    'Annulé': enrichedInterventions.filter((i) => i.status === 'Annulé').length,
  };

  return {
    interventions: enrichedInterventions,
    stats: { total, today, thisWeek, overdue, byPriority, byStatus },
  };
}

// CREER UNE NOUVELLE INTERVENTION
export async function createMaintenanceIntervention(interventionData: {
  equipment_id: string;
  description: string;
  intervention_date: string;
  priority: 'Basse' | 'Moyenne' | 'Haute';
  estimated_duration?: number;
  technician_id?: string;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('interventions')
        .insert([
          { ...interventionData, status: 'En attente', created_by: userData.user.id },
        ])
        .select()
        .single(),
    { label: 'createMaintenanceIntervention', toastOnError: true },
  );
}

// METTRE A JOUR LE STATUT D'UNE INTERVENTION
export async function updateInterventionStatus(interventionId: string, status: string) {
  return supabaseCall(
    () =>
      supabase.from('interventions').update({ status }).eq('id', interventionId).select().single(),
    { label: 'updateInterventionStatus', toastOnError: true },
  );
}

// MODIFIER UNE INTERVENTION
export async function updateMaintenanceIntervention(
  interventionId: string,
  interventionData: {
    description?: string;
    intervention_date?: string;
    priority?: 'Basse' | 'Moyenne' | 'Haute';
    estimated_duration?: number;
    technician_id?: string;
  },
) {
  return supabaseCall(
    () =>
      supabase
        .from('interventions')
        .update(interventionData)
        .eq('id', interventionId)
        .select()
        .single(),
    { label: 'updateMaintenanceIntervention', toastOnError: true },
  );
}

// SUPPRIMER UNE INTERVENTION
export async function deleteMaintenanceIntervention(interventionId: string) {
  await supabaseCall(
    () => supabase.from('interventions').delete().eq('id', interventionId),
    { label: 'deleteMaintenanceIntervention', toastOnError: true },
  );
  return true;
}
