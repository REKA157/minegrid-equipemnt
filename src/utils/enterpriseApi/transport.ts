import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

// =====================================================
// APIs POUR LES WIDGETS TRANSPORTEUR / LOGISTIQUE
// =====================================================

export type DeliveryStatus = 'Planifiée' | 'En cours' | 'Livrée' | 'Retardée' | 'Annulée';
export type DeliveryPriority = 'Basse' | 'Moyenne' | 'Haute' | 'Urgente';

export type DeliveryRow = {
  id: string;
  equipment_id?: string | null;
  equipment_label?: string | null;
  driver_id?: string | null;
  vehicle_id?: string | null;
  origin_address?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_address?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  pickup_date?: string | null;
  expected_delivery_date?: string | null;
  actual_delivery_date?: string | null;
  distance_km?: number | null;
  transport_cost?: number | null;
  status: DeliveryStatus;
  priority: DeliveryPriority;
  client_name?: string | null;
  client_phone?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export type DriverRow = {
  id: string;
  name: string;
  phone?: string | null;
  license_number?: string | null;
  license_expiry?: string | null;
  availability_status: 'Disponible' | 'En mission' | 'En congé' | 'Indisponible';
  current_lat?: number | null;
  current_lng?: number | null;
  last_location_update?: string | null;
};

export type VehicleRow = {
  id: string;
  plate_number: string;
  type: string;
  brand?: string | null;
  model?: string | null;
  capacity_tons?: number | null;
  status: 'Disponible' | 'En mission' | 'Maintenance' | 'Hors service';
  current_driver_id?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  last_location_update?: string | null;
  fuel_level?: number | null;
  next_maintenance_date?: string | null;
};

const DELIVERY_COLUMNS = `
  id, equipment_id, equipment_label, driver_id, vehicle_id,
  origin_address, origin_lat, origin_lng,
  destination_address, destination_lat, destination_lng,
  pickup_date, expected_delivery_date, actual_delivery_date,
  distance_km, transport_cost, status, priority,
  client_name, client_phone, notes, created_at
`;

// ---------------------------------------------------------------------
// WIDGET 1 : "LIVRAISONS EN COURS" (active-deliveries → metric)
// ---------------------------------------------------------------------
export const getActiveDeliveries = async () => {
  const rows = await supabaseCall<DeliveryRow[]>(
    () =>
      supabase
        .from('deliveries')
        .select(DELIVERY_COLUMNS)
        .in('status', ['Planifiée', 'En cours', 'Retardée'])
        .order('expected_delivery_date', { ascending: true }),
    { label: 'getActiveDeliveries', fallback: [] },
  );

  const total = rows.length;
  const inProgress = rows.filter((r) => r.status === 'En cours').length;
  const planned = rows.filter((r) => r.status === 'Planifiée').length;
  const delayed = rows.filter((r) => r.status === 'Retardée').length;
  const urgent = rows.filter((r) => r.priority === 'Urgente' || r.priority === 'Haute').length;

  return {
    total,
    inProgress,
    planned,
    delayed,
    urgent,
    rows,
  };
};

// ---------------------------------------------------------------------
// WIDGET 2 : "CARTE DES LIVRAISONS" (delivery-map → map)
// Renvoie véhicules + livraisons actives avec coordonnées
// ---------------------------------------------------------------------
export const getDeliveryMapData = async () => {
  const [deliveries, vehicles] = await Promise.all([
    supabaseCall<DeliveryRow[]>(
      () =>
        supabase
          .from('deliveries')
          .select(DELIVERY_COLUMNS)
          .in('status', ['Planifiée', 'En cours', 'Retardée'])
          .order('expected_delivery_date', { ascending: true }),
      { label: 'getDeliveryMapData.deliveries', fallback: [] },
    ),
    supabaseCall<VehicleRow[]>(
      () =>
        supabase
          .from('vehicles')
          .select('id, plate_number, type, brand, model, status, current_lat, current_lng, last_location_update, fuel_level'),
      { label: 'getDeliveryMapData.vehicles', fallback: [] },
    ),
  ]);

  return {
    deliveries: deliveries.filter((d) => d.destination_lat != null && d.destination_lng != null),
    vehicles: vehicles.filter((v) => v.current_lat != null && v.current_lng != null),
  };
};

// ---------------------------------------------------------------------
// WIDGET 3 : "COÛTS DE TRANSPORT" (transport-costs → chart)
// Agrégation des coûts par mois sur les 6 derniers mois
// ---------------------------------------------------------------------
export const getTransportCosts = async () => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const rows = await supabaseCall<DeliveryRow[]>(
    () =>
      supabase
        .from('deliveries')
        .select('pickup_date, transport_cost, distance_km, status')
        .gte('pickup_date', sixMonthsAgo.toISOString())
        .order('pickup_date', { ascending: true }),
    { label: 'getTransportCosts', fallback: [] },
  );

  const buckets = new Map<string, { month: string; cost: number; trips: number; km: number }>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'short' });
    buckets.set(key, { month: label, cost: 0, trips: 0, km: 0 });
  }

  for (const row of rows) {
    if (!row.pickup_date) continue;
    const d = new Date(row.pickup_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.cost += Number(row.transport_cost || 0);
    bucket.km += Number(row.distance_km || 0);
    bucket.trips += 1;
  }

  return Array.from(buckets.values()).map((b) => ({
    name: b.month,
    label: b.month,
    value: Math.round(b.cost),
    cost: Math.round(b.cost),
    trips: b.trips,
    km: Math.round(b.km),
  }));
};

// ---------------------------------------------------------------------
// WIDGET 4 : "PLANNING CHAUFFEURS" (driver-schedule → calendar)
// Renvoie agenda 7j à venir avec missions assignées
// ---------------------------------------------------------------------
export const getDriverSchedule = async () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const [drivers, deliveries] = await Promise.all([
    supabaseCall<DriverRow[]>(
      () =>
        supabase
          .from('drivers')
          .select('id, name, phone, availability_status, license_expiry'),
      { label: 'getDriverSchedule.drivers', fallback: [] },
    ),
    supabaseCall<DeliveryRow[]>(
      () =>
        supabase
          .from('deliveries')
          .select('id, driver_id, equipment_label, pickup_date, expected_delivery_date, status, priority, destination_address, client_name')
          .gte('pickup_date', now.toISOString())
          .lte('pickup_date', sevenDaysLater.toISOString())
          .not('driver_id', 'is', null)
          .order('pickup_date', { ascending: true }),
      { label: 'getDriverSchedule.deliveries', fallback: [] },
    ),
  ]);

  const byDriver = new Map<string, DeliveryRow[]>();
  for (const d of deliveries) {
    if (!d.driver_id) continue;
    if (!byDriver.has(d.driver_id)) byDriver.set(d.driver_id, []);
    byDriver.get(d.driver_id)!.push(d);
  }

  return drivers.map((driver) => ({
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    status: driver.availability_status,
    licenseExpiry: driver.license_expiry,
    missions: (byDriver.get(driver.id) || []).map((m) => ({
      id: m.id,
      label: m.equipment_label || 'Mission',
      destination: m.destination_address,
      client: m.client_name,
      pickupDate: m.pickup_date,
      expectedDeliveryDate: m.expected_delivery_date,
      status: m.status,
      priority: m.priority,
    })),
  }));
};

// ---------------------------------------------------------------------
// LOOKUPS (pour formulaires)
// ---------------------------------------------------------------------
export const getDriversList = async () => {
  return supabaseCall<DriverRow[]>(
    () =>
      supabase
        .from('drivers')
        .select('id, name, phone, availability_status, license_expiry')
        .order('name', { ascending: true }),
    { label: 'getDriversList', fallback: [] },
  );
};

export const getVehiclesList = async () => {
  return supabaseCall<VehicleRow[]>(
    () =>
      supabase
        .from('vehicles')
        .select('id, plate_number, type, brand, model, capacity_tons, status')
        .order('plate_number', { ascending: true }),
    { label: 'getVehiclesList', fallback: [] },
  );
};

// ---------------------------------------------------------------------
// MUTATIONS
// ---------------------------------------------------------------------
export async function createDelivery(payload: {
  equipment_id?: string | null;
  equipment_label: string;
  driver_id?: string | null;
  vehicle_id?: string | null;
  origin_address: string;
  destination_address: string;
  pickup_date: string;
  expected_delivery_date: string;
  distance_km?: number | null;
  transport_cost?: number | null;
  priority?: DeliveryPriority;
  client_name?: string | null;
  client_phone?: string | null;
  notes?: string | null;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('deliveries')
        .insert([
          {
            ...payload,
            status: 'Planifiée' as DeliveryStatus,
            priority: payload.priority || 'Moyenne',
            created_by: userData.user.id,
          },
        ])
        .select()
        .single(),
    {
      label: 'createDelivery',
      toastOnError: true,
      toastMessage: 'Impossible de créer la livraison',
    },
  );
}

export async function updateDeliveryStatus(id: string, status: DeliveryStatus) {
  const patch: Record<string, unknown> = { status };
  if (status === 'Livrée') {
    patch.actual_delivery_date = new Date().toISOString();
  }
  return supabaseCall(
    () =>
      supabase
        .from('deliveries')
        .update(patch)
        .eq('id', id)
        .select()
        .single(),
    { label: 'updateDeliveryStatus', toastOnError: true },
  );
}

// =====================================================================
// WIDGET "KM À VIDE / COÛT DU RETOUR À VIDE (DEADHEAD)"
// Par trajet : km en charge vs km à vide, taux de retour à vide (%),
// et COÛT du vide en MAD (km à vide × coût/km complet).
// Le retour à vide est un coût sec 100% non facturé : enjeu marge n°1
// du transport routier d'engins. RLS : deliveries.created_by = auth.uid().
// =====================================================================

/** Seuil (%) au-delà duquel un trajet est jugé au pire taux de retour à vide. */
export const DEADHEAD_ALERT_THRESHOLD = 40;

export type DeadheadItem = {
  id: string;
  label: string;
  client: string | null;
  destination: string | null;
  status: DeliveryStatus;
  loadedKm: number;
  emptyKm: number;
  totalKm: number;
  emptyRate: number; // pourcentage 0-100
  costPerKm: number;
  emptyCost: number; // MAD gaspillés sur le retour à vide
  overThreshold: boolean;
};

export const getDeadheadCost = async () => {
  const rows = await supabaseCall<
    Array<
      Pick<
        DeliveryRow,
        'id' | 'equipment_label' | 'client_name' | 'destination_address' | 'status' | 'distance_km'
      > & {
        distance_loaded_km?: number | null;
        distance_empty_km?: number | null;
        cost_per_km?: number | null;
      }
    >
  >(
    () =>
      supabase
        .from('deliveries')
        .select(
          'id, equipment_label, client_name, destination_address, status, distance_km, distance_loaded_km, distance_empty_km, cost_per_km',
        )
        .neq('status', 'Annulée')
        .order('pickup_date', { ascending: false })
        .limit(200),
    { label: 'getDeadheadCost', fallback: [] },
  );

  const items: DeadheadItem[] = rows
    .map((r) => {
      const loadedKm = Number(r.distance_loaded_km ?? r.distance_km ?? 0);
      const emptyKm = Number(r.distance_empty_km ?? 0);
      const totalKm = loadedKm + emptyKm;
      if (totalKm <= 0) return null; // trajet non chiffré -> exclu (démo honnête)
      const costPerKm = Number(r.cost_per_km ?? 0);
      const emptyRate = Math.round((emptyKm / totalKm) * 100);
      const emptyCost = Math.round(emptyKm * costPerKm);
      return {
        id: String(r.id),
        label: String(r.equipment_label || 'Trajet'),
        client: (r.client_name as string) || null,
        destination: (r.destination_address as string) || null,
        status: r.status,
        loadedKm: Math.round(loadedKm),
        emptyKm: Math.round(emptyKm),
        totalKm: Math.round(totalKm),
        emptyRate,
        costPerKm,
        emptyCost,
        overThreshold: emptyRate > DEADHEAD_ALERT_THRESHOLD,
      };
    })
    .filter((x): x is DeadheadItem => !!x);

  const totalEmptyKm = items.reduce((s, i) => s + i.emptyKm, 0);
  const totalKmAll = items.reduce((s, i) => s + i.totalKm, 0);
  const totalEmptyCost = items.reduce((s, i) => s + i.emptyCost, 0);
  const globalEmptyRate = totalKmAll > 0 ? Math.round((totalEmptyKm / totalKmAll) * 100) : 0;

  return {
    items: items.sort((a, b) => b.emptyCost - a.emptyCost),
    totalEmptyKm,
    totalEmptyCost,
    globalEmptyRate,
    aboveThresholdCount: items.filter((i) => i.overThreshold).length,
    threshold: DEADHEAD_ALERT_THRESHOLD,
  };
};
