import { MACHINES_CATALOG_MAX_ROWS, MACHINE_LIST_COLUMNS, SELLER_MACHINES_MAX_ROWS } from '../../constants/machineQueryFields';
import { PRO_EQUIPMENT_DETAILS_COLUMNS } from '../../constants/proClientQueryFields';
import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import { logger } from '../logger';

// =====================================================
// FONCTIONS API ANNONCES UTILISATEUR
// =====================================================

interface ProEquipmentDetail {
  machine_id: string;
  total_hours?: number;
  fuel_consumption?: number;
  serial_number?: string;
  purchase_date?: string | null;
  warranty_end?: string | null;
  last_maintenance?: string | null;
  next_maintenance?: string | null;
  notes?: string | null;
}

type MachineWithProDetails = Record<string, unknown> & {
  id: string;
  name?: string;
  total_hours?: number;
  fuel_consumption?: number;
  serial_number?: string;
  purchase_date?: string | null;
  warranty_end?: string | null;
  last_maintenance?: string | null;
  next_maintenance?: string | null;
  notes?: string | null;
};

function mergeMachinesWithProDetails(
  machines: MachineWithProDetails[],
  proDetails: ProEquipmentDetail[],
): MachineWithProDetails[] {
  const proDetailsMap = new Map<string, ProEquipmentDetail>();
  proDetails.forEach((detail) => {
    if (detail?.machine_id) proDetailsMap.set(detail.machine_id, detail);
  });

  return machines.map((machine) => {
    const proDetail = proDetailsMap.get(machine.id);
    return {
      ...machine,
      total_hours: proDetail?.total_hours || 0,
      fuel_consumption: proDetail?.fuel_consumption || 0,
      serial_number: proDetail?.serial_number || machine.name,
      purchase_date: proDetail?.purchase_date || null,
      warranty_end: proDetail?.warranty_end || null,
      last_maintenance: proDetail?.last_maintenance || null,
      next_maintenance: proDetail?.next_maintenance || null,
      notes: proDetail?.notes || null,
    };
  });
}

// Récupérer les annonces d'équipements de l'utilisateur (avec détails Pro)
export async function getUserMachines(): Promise<MachineWithProDetails[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Utilisateur non connecté');

  const machines = await supabaseCall<MachineWithProDetails[]>(
    () =>
      supabase
        .from('machines')
        .select(MACHINE_LIST_COLUMNS)
        .eq('sellerid', user.id)
        .order('created_at', { ascending: false })
        .limit(SELLER_MACHINES_MAX_ROWS),
    { label: 'getUserMachines', fallback: [] },
  );

  if (!machines.length) return [];

  const machineIds = machines.map((m) => m.id);
  const proDetails = await supabaseCall<ProEquipmentDetail[]>(
    () =>
      supabase
        .from('pro_equipment_details')
        .select(PRO_EQUIPMENT_DETAILS_COLUMNS)
        .in('machine_id', machineIds),
    { label: 'getUserMachines.proDetails', fallback: [] },
  );

  const merged = mergeMachinesWithProDetails(machines, proDetails);
  logger.info(`[getUserMachines] ${merged.length} annonces`);
  return merged;
}

// =====================================================
// FONCTIONS GÉNÉRIQUES POUR TOUS LES UTILISATEURS
// =====================================================

// Récupérer toutes les machines avec leurs détails Pro
export async function getAllMachinesWithDetails(): Promise<MachineWithProDetails[]> {
  const machines = await supabaseCall<MachineWithProDetails[]>(
    () =>
      supabase
        .from('machines')
        .select(MACHINE_LIST_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(MACHINES_CATALOG_MAX_ROWS),
    { label: 'getAllMachinesWithDetails.machines', fallback: [] },
  );

  if (!machines.length) return [];

  const proDetails = await supabaseCall<ProEquipmentDetail[]>(
    () =>
      supabase
        .from('pro_equipment_details')
        .select(PRO_EQUIPMENT_DETAILS_COLUMNS)
        .limit(MACHINES_CATALOG_MAX_ROWS),
    { label: 'getAllMachinesWithDetails.proDetails', fallback: [] },
  );

  const merged = mergeMachinesWithProDetails(machines, proDetails);
  logger.info(`[getAllMachinesWithDetails] ${merged.length} machines`);
  return merged;
}
