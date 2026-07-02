import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import { getCurrentSellerUserId, getMachineIdsForSellerUser } from './sellerScope';

async function scopedRentalsFilter() {
  const userId = await getCurrentSellerUserId();
  if (!userId) return { userId: null as string | null, machineIds: [] as string[] };
  const machineIds = await getMachineIdsForSellerUser(userId);
  return { userId, machineIds };
}

/** Filtre PostgREST : locations créées par le loueur OU sur son parc machines */
export function rentalScopeOrFilter(userId: string, machineIds: string[]): string {
  if (machineIds.length === 0) {
    return `created_by.eq.${userId}`;
  }
  return `created_by.eq.${userId},equipment_id.in.(${machineIds.join(',')})`;
}

// =====================================================
// APIs POUR LES WIDGETS LOUEUR
// =====================================================

// WIDGET "REVENUS DE LOCATION"
export async function getRentalRevenue() {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

  const { userId, machineIds } = await scopedRentalsFilter();
  if (!userId) {
    return { revenue: 0, count: 0, growth: 0 };
  }
  const scopeOr = rentalScopeOrFilter(userId, machineIds);

  const [currentMonthData, lastMonthData] = await Promise.all([
    supabaseCall<Array<{ total_price: number }>>(
      () =>
        supabase
          .from('rentals')
          .select('total_price')
          .or(scopeOr)
          .gte('start_date', startOfMonth.toISOString())
          .lte('start_date', endOfMonth.toISOString()),
      { label: 'getRentalRevenue.currentMonth', fallback: [] },
    ),
    supabaseCall<Array<{ total_price: number }>>(
      () =>
        supabase
          .from('rentals')
          .select('total_price')
          .or(scopeOr)
          .gte('start_date', startOfLastMonth.toISOString())
          .lte('start_date', endOfLastMonth.toISOString()),
      { label: 'getRentalRevenue.lastMonth', fallback: [] },
    ),
  ]);

  const currentRevenue = currentMonthData.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const rentalCount = currentMonthData.length;
  const lastRevenue = lastMonthData.reduce((sum, item) => sum + (item.total_price || 0), 0);

  let growth = 0;
  if (lastRevenue > 0) {
    growth = ((currentRevenue - lastRevenue) / lastRevenue) * 100;
  } else if (currentRevenue > 0) {
    growth = 100;
  }

  return {
    revenue: currentRevenue,
    count: rentalCount,
    growth: parseFloat(growth.toFixed(1)),
  };
}

// WIDGET "LOCATIONS A VENIR"
export async function getUpcomingRentals() {
  const { userId, machineIds } = await scopedRentalsFilter();
  if (!userId) return [];

  const scopeOr = rentalScopeOrFilter(userId, machineIds);

  const now = new Date().toISOString();
  const data = await supabaseCall<Array<Record<string, any>>>(
    () =>
      supabase
        .from('rentals')
        .select(
          `id, start_date, end_date, total_price, status, created_at, equipment_id, client_id`,
        )
        .or(scopeOr)
        .gte('end_date', now)
        .order('start_date', { ascending: true })
        .limit(50),
    { label: 'getUpcomingRentals', fallback: [] },
  );

  if (!data.length) return [];

  const equipmentIds = [...new Set(data.map((r) => r.equipment_id).filter(Boolean))];
  const clientIds = [...new Set(data.map((r) => r.client_id).filter(Boolean))];

  const [equipmentList, clientList] = await Promise.all([
    equipmentIds.length > 0
      ? supabaseCall<Array<Record<string, any>>>(
          () =>
            supabase.from('machines').select('id, name, brand, model').in('id', equipmentIds),
          { label: 'getUpcomingRentals.equipment', fallback: [] },
        )
      : Promise.resolve<Array<Record<string, any>>>([]),
    clientIds.length > 0
      ? supabaseCall<Array<Record<string, any>>>(
          () =>
            supabase
              .from('pro_clients')
              .select('id, full_name, company_name')
              .in('id', clientIds),
          { label: 'getUpcomingRentals.clients', fallback: [] },
        )
      : Promise.resolve<Array<Record<string, any>>>([]),
  ]);

  const equipmentData: Record<string, any> = {};
  equipmentList.forEach((eq) => {
    equipmentData[eq.id] = eq;
  });
  const clientData: Record<string, any> = {};
  clientList.forEach((c) => {
    clientData[c.id] = c;
  });

  return data.map((rental) => {
    const startDate = new Date(rental.start_date);
    const endDate = new Date(rental.end_date);
    const now = new Date();

    const durationDays = Math.max(
      1,
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const daysUntilStart = Math.ceil(
      (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    let priority = 'normal';
    if (daysUntilStart <= 1) priority = 'urgent';
    else if (daysUntilStart <= 3) priority = 'high';
    else if (daysUntilStart <= 7) priority = 'medium';

    const pricePerDay = (rental.total_price || 0) / durationDays;
    const equipment = equipmentData[rental.equipment_id];
    const client = clientData[rental.client_id];

    return {
      id: rental.id as string,
      start_date: rental.start_date as string,
      end_date: rental.end_date as string,
      total_price: rental.total_price as number,
      status: rental.status as string,
      created_at: rental.created_at as string,
      equipment_id: rental.equipment_id as string,
      client_id: rental.client_id as string,
      durationDays,
      daysUntilStart,
      priority,
      pricePerDay: Math.round(pricePerDay * 100) / 100,
      clientName: client?.full_name || client?.company_name || 'Client non spécifié',
      equipmentFullName: equipment
        ? `${equipment.brand || ''} ${equipment.model || equipment.name}`.trim()
        : 'Équipement non spécifié',
    };
  });
}

/** Statut location → étapes pipeline (même libellés que SalesPipelineWidget). */
export function rentalStatusToPipelineStage(status: string): string {
  const s = (status || '').trim().toLowerCase();
  if (s.includes('annul')) return 'Perdu';
  if (s.includes('termin')) return 'Conclu';
  if (s.includes('en cours')) return 'Négociation';
  if (s.includes('prête') || s.includes('prete')) return 'Négociation';
  if (s.includes('préparation') || s.includes('preparation')) return 'Devis';
  if (s.includes('confirm')) return 'Devis';
  return 'Prospection';
}

/**
 * Pipeline de locations : contrats actifs ou en préparation (hors terminés / annulés).
 * Format aligné sur le widget pipeline commercial.
 */
export async function getRentalPipelineLeads() {
  const { userId, machineIds } = await scopedRentalsFilter();
  if (!userId) return [];

  const scopeOr = rentalScopeOrFilter(userId, machineIds);

  const rows = await supabaseCall<Array<Record<string, any>>>(
    () =>
      supabase
        .from('rentals')
        .select('id, start_date, end_date, total_price, status, equipment_id, client_id, created_at')
        .or(scopeOr)
        .order('start_date', { ascending: true })
        .limit(80),
    { label: 'getRentalPipelineLeads', fallback: [] },
  );

  const active = rows.filter((r) => {
    const st = (r.status || '').toLowerCase();
    if (st.includes('termin') || st.includes('annul')) return false;
    const end = r.end_date ? new Date(r.end_date).getTime() : 0;
    if (end && end < Date.now() - 86400000) return false;
    return true;
  });

  if (!active.length) return [];

  const equipmentIds = [...new Set(active.map((r) => r.equipment_id).filter(Boolean))];
  const clientIds = [...new Set(active.map((r) => r.client_id).filter(Boolean))];

  const [equipmentList, clientList] = await Promise.all([
    equipmentIds.length
      ? supabaseCall<Array<Record<string, any>>>(
          () =>
            supabase.from('machines').select('id, name, brand, model').in('id', equipmentIds),
          { label: 'getRentalPipelineLeads.equipment', fallback: [] },
        )
      : Promise.resolve([]),
    clientIds.length
      ? supabaseCall<Array<Record<string, any>>>(
          () =>
            supabase.from('pro_clients').select('id, full_name, company_name, phone').in('id', clientIds),
          { label: 'getRentalPipelineLeads.clients', fallback: [] },
        )
      : Promise.resolve([]),
  ]);

  const eqMap = Object.fromEntries((equipmentList || []).map((e: any) => [e.id, e]));
  const clMap = Object.fromEntries((clientList || []).map((c: any) => [c.id, c]));

  return active.map((rental) => {
    const equipment = eqMap[rental.equipment_id];
    const client = clMap[rental.client_id];
    const title = equipment
      ? `Location — ${`${equipment.brand || ''} ${equipment.model || equipment.name}`.trim()}`
      : 'Location — équipement';
    const stage = rentalStatusToPipelineStage(String(rental.status || ''));
    const value = Number(rental.total_price) || 0;
    const start = rental.start_date ? String(rental.start_date).split('T')[0] : '';
    const end = rental.end_date ? String(rental.end_date).split('T')[0] : '';

    return {
      id: rental.id,
      title,
      status: rental.status || '—',
      stage,
      priority: stage === 'Prospection' ? 'medium' : 'high',
      value,
      probability: stage === 'Conclu' ? 100 : stage === 'Perdu' ? 0 : stage === 'Négociation' ? 70 : 40,
      nextAction: `Période ${start} → ${end}`,
      lastContact: start || rental.created_at || new Date().toISOString().split('T')[0],
      assignedTo: '—',
      company: client?.company_name || client?.full_name || 'Client',
      email: '',
      phone: client?.phone || '',
      contact: {
        name: client?.full_name || 'Client',
        company: client?.company_name || '',
        phone: client?.phone || '',
        email: '',
      },
    };
  });
}

// WIDGET "LOCATIONS A VENIR" - Creation
export async function createRental(rentalData: {
  equipment_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  total_price: number;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('rentals')
        .insert([{ ...rentalData, created_by: userData.user.id }])
        .select()
        .single(),
    {
      label: 'createRental',
      toastOnError: true,
      toastMessage: 'Impossible de créer la location',
    },
  );
}

// WIDGET "LOCATIONS A VENIR" - Mise a jour du statut
export async function updateRentalStatus(rentalId: string, status: string) {
  return supabaseCall(
    () => supabase.from('rentals').update({ status }).eq('id', rentalId).select().single(),
    { label: 'updateRentalStatus', toastOnError: true },
  );
}

// WIDGET "LOCATIONS A VENIR" - Mise a jour complete
export async function updateRental(
  rentalId: string,
  rentalData: {
    start_date: string;
    end_date: string;
    total_price: number;
    status: string;
  },
) {
  return supabaseCall(
    () => supabase.from('rentals').update(rentalData).eq('id', rentalId).select().single(),
    { label: 'updateRental', toastOnError: true },
  );
}

// =====================================================
// WIDGET "RECOUVREMENT / IMPAYÉS DE LOCATION"
// Loyers échus et non soldés : total impayé MAD, nb de factures en retard,
// aging (0-30j / 31-60j / 60j+) et clients débiteurs triés par montant.
// Enjeu trésorerie n°1 du loueur d'engins.
// =====================================================

export type OverdueInvoiceItem = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  remaining: number;
  dueDate: string | null;
  daysLate: number;
  bucket: '0-30' | '31-60' | '60+';
};

function overdueBucket(daysLate: number): '0-30' | '31-60' | '60+' {
  if (daysLate > 60) return '60+';
  if (daysLate > 30) return '31-60';
  return '0-30';
}

export async function getRentalOverdue() {
  const { userId, machineIds } = await scopedRentalsFilter();
  if (!userId) {
    return {
      items: [] as OverdueInvoiceItem[],
      totalOverdue: 0,
      overdueCount: 0,
      maxDaysLate: 0,
      bucket0_30: 0,
      bucket31_60: 0,
      bucket60plus: 0,
    };
  }

  const scopeOr = rentalScopeOrFilter(userId, machineIds);

  const rows = await supabaseCall<Array<Record<string, any>>>(
    () =>
      supabase
        .from('rental_invoices')
        .select(
          'id, invoice_number, client_name, status, amount_due, amount_paid, due_date, equipment_id, created_by',
        )
        .or(scopeOr)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200),
    { label: 'getRentalOverdue', fallback: [] },
  );

  const DAY = 1000 * 3600 * 24;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items: OverdueInvoiceItem[] = rows
    .map((r) => {
      const status = String(r.status || '');
      const st = status.toLowerCase();
      if (st.includes('annul') || st.includes('sold') || st.includes('pay')) return null;
      const amountDue = Number(r.amount_due || 0);
      const amountPaid = Number(r.amount_paid || 0);
      const remaining = Math.round(amountDue - amountPaid);
      if (remaining <= 0) return null;
      if (!r.due_date) return null;
      const due = new Date(String(r.due_date));
      due.setHours(0, 0, 0, 0);
      const daysLate = Math.floor((today.getTime() - due.getTime()) / DAY);
      if (daysLate <= 0) return null; // pas encore échu -> pas un impayé
      return {
        id: String(r.id),
        invoiceNumber: String(r.invoice_number || '—'),
        clientName: String(r.client_name || 'Client'),
        status,
        amountDue: Math.round(amountDue),
        amountPaid: Math.round(amountPaid),
        remaining,
        dueDate: String(r.due_date).slice(0, 10),
        daysLate,
        bucket: overdueBucket(daysLate),
      };
    })
    .filter((x): x is OverdueInvoiceItem => !!x);

  return {
    items: items.sort((a, b) => b.remaining - a.remaining),
    totalOverdue: items.reduce((s, i) => s + i.remaining, 0),
    overdueCount: items.length,
    maxDaysLate: items.reduce((m, i) => Math.max(m, i.daysLate), 0),
    bucket0_30: items.filter((i) => i.bucket === '0-30').reduce((s, i) => s + i.remaining, 0),
    bucket31_60: items.filter((i) => i.bucket === '31-60').reduce((s, i) => s + i.remaining, 0),
    bucket60plus: items.filter((i) => i.bucket === '60+').reduce((s, i) => s + i.remaining, 0),
  };
}
