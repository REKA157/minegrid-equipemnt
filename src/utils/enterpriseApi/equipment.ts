import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import { getCurrentSellerUserId, getMachineIdsForSellerUser } from './sellerScope';
import { rentalScopeOrFilter } from './rentals';

export const getEquipmentList = async () => {
  return supabaseCall(
    () => supabase.from('machines').select('id, name').order('name', { ascending: true }),
    { label: 'getEquipmentList', fallback: [] },
  );
};

interface RentalRow {
  equipment_id: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}

interface InterventionRow {
  equipment_id: string;
  status?: string;
  scheduled_date?: string;
}

// WIDGET "DISPONIBILITE EQUIPEMENTS"
export async function getEquipmentAvailability() {
  const userId = await getCurrentSellerUserId();
  const machineIds = userId ? await getMachineIdsForSellerUser(userId) : [];

  const [machines, activeRentals, activeInterventions] = await Promise.all([
    machineIds.length === 0
      ? Promise.resolve<Array<Record<string, any>>>([])
      : supabaseCall<Array<Record<string, any>>>(
          () =>
            supabase
              .from('machines')
              .select('id, name, brand, model, condition, year, price, updated_at')
              .in('id', machineIds)
              .order('name', { ascending: true }),
          { label: 'getEquipmentAvailability.machines', fallback: [] },
        ),
    userId
      ? supabaseCall<RentalRow[]>(
          () =>
            supabase
              .from('rentals')
              .select('equipment_id, start_date, end_date, status')
              .or(rentalScopeOrFilter(userId, machineIds))
              .in('status', ['En cours', 'Confirmée', 'Prête', 'En préparation']),
          { label: 'getEquipmentAvailability.rentals', fallback: [] },
        )
      : Promise.resolve<RentalRow[]>([]),
    machineIds.length === 0
      ? Promise.resolve<InterventionRow[]>([])
      : supabaseCall<InterventionRow[]>(
          () =>
            supabase
              .from('interventions')
              .select('equipment_id, status, scheduled_date')
              .in('equipment_id', machineIds)
              .in('status', ['En cours', 'En attente']),
          { label: 'getEquipmentAvailability.interventions', fallback: [] },
        ),
  ]);

  const enrichedMachines = machines.map((machine) => {
    const currentRental = activeRentals.find((r) => r.equipment_id === machine.id);
    const currentIntervention = activeInterventions.find((i) => i.equipment_id === machine.id);
    const isRented = !!currentRental;
    const isInMaintenance = !!currentIntervention;

    let status = 'Disponible';
    let statusColor = 'green';
    let usageRate = 0;

    if (isInMaintenance) {
      status = 'Maintenance';
      statusColor = 'red';
      usageRate = 0;
    } else if (isRented) {
      status = 'En location';
      statusColor = 'orange';
      const t0 = currentRental?.start_date ? new Date(currentRental.start_date).getTime() : 0;
      const t1 = currentRental?.end_date ? new Date(currentRental.end_date).getTime() : 0;
      const span = Math.max(1, t1 - t0);
      usageRate =
        t0 && t1
          ? Math.min(100, Math.round((Math.max(0, Date.now() - t0) / span) * 100))
          : 85;
    } else {
      status = 'Disponible';
      statusColor = 'green';
      usageRate = 0;
    }

    return {
      ...machine,
      status,
      statusColor,
      usageRate,
      isRented,
      isInMaintenance,
      currentRental: currentRental
        ? {
            startDate: currentRental.start_date,
            endDate: currentRental.end_date,
            status: currentRental.status,
          }
        : null,
      currentIntervention: currentIntervention
        ? {
            scheduledDate: currentIntervention.scheduled_date,
            status: currentIntervention.status,
          }
        : null,
      equipmentFullName: `${machine.brand || ''} ${machine.model || machine.name}`.trim(),
    };
  });

  const total = enrichedMachines.length;
  const available = enrichedMachines.filter((m) => m.status === 'Disponible').length;
  const rented = enrichedMachines.filter((m) => m.status === 'En location').length;
  const maintenance = enrichedMachines.filter((m) => m.status === 'Maintenance').length;
  const averageUsageRate =
    total > 0 ? enrichedMachines.reduce((sum, m) => sum + m.usageRate, 0) / total : 0;

  return {
    summary: [
      { name: 'Disponible', value: available, color: 'green' },
      { name: 'En location', value: rented, color: 'orange' },
      { name: 'Maintenance', value: maintenance, color: 'red' },
    ],
    details: enrichedMachines,
    stats: {
      total,
      available,
      rented,
      maintenance,
      averageUsageRate: Math.round(averageUsageRate),
    },
  };
}
