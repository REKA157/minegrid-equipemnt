import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

// =====================================================
// APIs POUR LES WIDGETS COURTIER (Crédit + Assurance)
// =====================================================

export type CreditStatus = 'Brouillon' | 'En cours' | 'Approuvé' | 'Refusé' | 'Décaissé' | 'Annulé';
export type PolicyStatus = 'Devis' | 'En cours' | 'Active' | 'Expirée' | 'Résiliée' | 'Suspendue';
export type PolicyType =
  | 'Responsabilité Civile'
  | 'Tous risques'
  | 'Bris de machine'
  | 'Multirisques chantier'
  | 'Transport marchandises'
  | 'Flotte automobile'
  | 'Multirisques professionnelle';
export type ClientStatus = 'Prospect' | 'Actif' | 'Inactif' | 'Bloqué';

export type BrokerClientRow = {
  id: string;
  name: string;
  company_name?: string | null;
  type: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  sector?: string | null;
  status: ClientStatus;
  ice_number?: string | null;
  created_at?: string | null;
};

export type CreditApplicationRow = {
  id: string;
  reference?: string | null;
  client_id?: string | null;
  client_name_snapshot?: string | null;
  equipment_label: string;
  equipment_value?: number | null;
  requested_amount?: number | null;
  down_payment?: number | null;
  duration_months?: number | null;
  interest_rate?: number | null;
  monthly_payment?: number | null;
  bank_name?: string | null;
  application_date?: string | null;
  expected_decision_date?: string | null;
  decision_date?: string | null;
  disbursement_date?: string | null;
  status: CreditStatus;
  commission_rate?: number | null;
  commission_amount?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

export type InsurancePolicyRow = {
  id: string;
  policy_number?: string | null;
  client_id?: string | null;
  client_name_snapshot?: string | null;
  equipment_label?: string | null;
  insurer_name: string;
  policy_type: PolicyType;
  insured_value?: number | null;
  annual_premium?: number | null;
  payment_frequency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: PolicyStatus;
  commission_rate?: number | null;
  commission_amount?: number | null;
  deductible?: number | null;
  claim_count?: number | null;
  auto_renewal?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
};

const CREDIT_COLUMNS = `
  id, reference, client_id, client_name_snapshot,
  equipment_label, equipment_value, requested_amount, down_payment,
  duration_months, interest_rate, monthly_payment, bank_name,
  application_date, expected_decision_date, decision_date, disbursement_date,
  status, commission_rate, commission_amount, notes, created_at
`;

const POLICY_COLUMNS = `
  id, policy_number, client_id, client_name_snapshot,
  equipment_label, insurer_name, policy_type,
  insured_value, annual_premium, payment_frequency,
  start_date, end_date, status, commission_rate, commission_amount,
  deductible, claim_count, auto_renewal, notes, created_at
`;

// ---------------------------------------------------------------------
// WIDGET 1 : "DEMANDES DE CRÉDIT" (credit-applications → list)
// ---------------------------------------------------------------------
export const getCreditApplications = async () => {
  return supabaseCall<CreditApplicationRow[]>(
    () =>
      supabase
        .from('credit_applications')
        .select(CREDIT_COLUMNS)
        .order('application_date', { ascending: false }),
    { label: 'getCreditApplications', fallback: [] },
  );
};

// ---------------------------------------------------------------------
// WIDGET 2 : "POLICES D'ASSURANCE" (insurance-policies → list)
// ---------------------------------------------------------------------
export const getInsurancePolicies = async () => {
  return supabaseCall<InsurancePolicyRow[]>(
    () =>
      supabase
        .from('insurance_policies')
        .select(POLICY_COLUMNS)
        .order('end_date', { ascending: true, nullsFirst: false }),
    { label: 'getInsurancePolicies', fallback: [] },
  );
};

// ---------------------------------------------------------------------
// WIDGET 3 : "SUIVI DES COMMISSIONS" (commission-tracking → metric)
// Agrégation crédit + assurance, mois courant + 12 derniers mois
// ---------------------------------------------------------------------
export const getCommissionTracking = async () => {
  const startOfYear = new Date();
  startOfYear.setMonth(0, 1);
  startOfYear.setHours(0, 0, 0, 0);

  const [credits, policies] = await Promise.all([
    supabaseCall<CreditApplicationRow[]>(
      () =>
        supabase
          .from('credit_applications')
          .select('commission_amount, status, decision_date, disbursement_date, application_date')
          .in('status', ['Approuvé', 'Décaissé']),
      { label: 'getCommissionTracking.credits', fallback: [] },
    ),
    supabaseCall<InsurancePolicyRow[]>(
      () =>
        supabase
          .from('insurance_policies')
          .select('commission_amount, status, start_date')
          .in('status', ['Active', 'En cours']),
      { label: 'getCommissionTracking.policies', fallback: [] },
    ),
  ]);

  const creditCommissionTotal = credits.reduce((s, c) => s + Number(c.commission_amount || 0), 0);
  const policyCommissionTotal = policies.reduce((s, p) => s + Number(p.commission_amount || 0), 0);

  // Commissions ENCAISSÉES (crédit décaissé + police active) vs DUES / à recouvrer
  // (crédit approuvé mais pas encore décaissé → commission acquise mais non versée).
  const commissionDue = credits
    .filter((c) => c.status === 'Approuvé')
    .reduce((s, c) => s + Number(c.commission_amount || 0), 0);
  const commissionEarned =
    credits
      .filter((c) => c.status === 'Décaissé')
      .reduce((s, c) => s + Number(c.commission_amount || 0), 0) + policyCommissionTotal;

  // Mois courant
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString().slice(0, 10);

  const creditThisMonth = credits
    .filter((c) => {
      const date = c.disbursement_date || c.decision_date || c.application_date;
      return date && date >= monthStartIso;
    })
    .reduce((s, c) => s + Number(c.commission_amount || 0), 0);

  const policyThisMonth = policies
    .filter((p) => p.start_date && p.start_date >= monthStartIso)
    .reduce((s, p) => s + Number(p.commission_amount || 0), 0);

  return {
    totalCommission: creditCommissionTotal + policyCommissionTotal,
    creditCommission: creditCommissionTotal,
    policyCommission: policyCommissionTotal,
    monthCommission: creditThisMonth + policyThisMonth,
    creditMonth: creditThisMonth,
    policyMonth: policyThisMonth,
    commissionDue,
    commissionEarned,
    creditCount: credits.length,
    policyCount: policies.length,
  };
};

// ---------------------------------------------------------------------
// WIDGET 4 : "PORTEFEUILLE CLIENTS" (client-portfolio → list)
// Liste clients enrichie avec stats par client
// ---------------------------------------------------------------------
export const getClientPortfolio = async () => {
  const [clients, credits, policies] = await Promise.all([
    supabaseCall<BrokerClientRow[]>(
      () =>
        supabase
          .from('broker_clients')
          .select('id, name, company_name, type, email, phone, city, sector, status, ice_number, created_at')
          .order('name', { ascending: true }),
      { label: 'getClientPortfolio.clients', fallback: [] },
    ),
    supabaseCall<CreditApplicationRow[]>(
      () =>
        supabase
          .from('credit_applications')
          .select('client_id, status, commission_amount, requested_amount'),
      { label: 'getClientPortfolio.credits', fallback: [] },
    ),
    supabaseCall<InsurancePolicyRow[]>(
      () =>
        supabase
          .from('insurance_policies')
          .select('client_id, status, commission_amount, annual_premium'),
      { label: 'getClientPortfolio.policies', fallback: [] },
    ),
  ]);

  return clients.map((c) => {
    const clientCredits = credits.filter((cr) => cr.client_id === c.id);
    const clientPolicies = policies.filter((p) => p.client_id === c.id);
    const activeCredits = clientCredits.filter((cr) => cr.status === 'Approuvé' || cr.status === 'Décaissé').length;
    const activePolicies = clientPolicies.filter((p) => p.status === 'Active' || p.status === 'En cours').length;
    const totalCommission =
      clientCredits.reduce((s, cr) => s + Number(cr.commission_amount || 0), 0) +
      clientPolicies.reduce((s, p) => s + Number(p.commission_amount || 0), 0);
    const totalPremiums = clientPolicies.reduce((s, p) => s + Number(p.annual_premium || 0), 0);
    const totalCreditVolume = clientCredits.reduce((s, cr) => s + Number(cr.requested_amount || 0), 0);
    return {
      ...c,
      activeCredits,
      activePolicies,
      totalCommission,
      totalPremiums,
      totalCreditVolume,
    };
  });
};

// ---------------------------------------------------------------------
// WIDGET 5 : "ANALYTICS DE PERFORMANCE" (performance-analytics → chart)
// Évolution commissions sur 6 mois — crédit vs assurance
// ---------------------------------------------------------------------
export const getPerformanceAnalytics = async () => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);
  const fromIso = sixMonthsAgo.toISOString().slice(0, 10);

  const [credits, policies] = await Promise.all([
    supabaseCall<CreditApplicationRow[]>(
      () =>
        supabase
          .from('credit_applications')
          .select('commission_amount, application_date, decision_date, disbursement_date, status')
          .gte('application_date', fromIso),
      { label: 'getPerformanceAnalytics.credits', fallback: [] },
    ),
    supabaseCall<InsurancePolicyRow[]>(
      () =>
        supabase
          .from('insurance_policies')
          .select('commission_amount, start_date, status')
          .gte('start_date', fromIso),
      { label: 'getPerformanceAnalytics.policies', fallback: [] },
    ),
  ]);

  const buckets = new Map<string, { month: string; credit: number; assurance: number; total: number }>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'short' });
    buckets.set(key, { month: label, credit: 0, assurance: 0, total: 0 });
  }

  for (const c of credits) {
    if (c.status !== 'Approuvé' && c.status !== 'Décaissé') continue;
    const date = c.disbursement_date || c.decision_date || c.application_date;
    if (!date) continue;
    const d = new Date(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = Number(c.commission_amount || 0);
    bucket.credit += amount;
    bucket.total += amount;
  }

  for (const p of policies) {
    if (p.status !== 'Active' && p.status !== 'En cours') continue;
    if (!p.start_date) continue;
    const d = new Date(p.start_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = Number(p.commission_amount || 0);
    bucket.assurance += amount;
    bucket.total += amount;
  }

  return Array.from(buckets.values()).map((b) => ({
    name: b.month,
    label: b.month,
    value: Math.round(b.total),
    credit: Math.round(b.credit),
    assurance: Math.round(b.assurance),
    total: Math.round(b.total),
  }));
};

// ---------------------------------------------------------------------
// LOOKUPS
// ---------------------------------------------------------------------
export const getBrokerClientsList = async () => {
  return supabaseCall<BrokerClientRow[]>(
    () =>
      supabase
        .from('broker_clients')
        .select('id, name, company_name, type, email, phone, city, status')
        .order('name', { ascending: true }),
    { label: 'getBrokerClientsList', fallback: [] },
  );
};

// ---------------------------------------------------------------------
// MUTATIONS — CLIENTS
// ---------------------------------------------------------------------
export async function createBrokerClient(payload: {
  name: string;
  company_name?: string | null;
  type?: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  sector?: string | null;
  ice_number?: string | null;
  status?: ClientStatus;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('broker_clients')
        .insert([{ ...payload, type: payload.type || 'Entreprise', status: payload.status || 'Prospect', created_by: userData.user.id }])
        .select()
        .single(),
    { label: 'createBrokerClient', toastOnError: true, toastMessage: 'Impossible de créer le client' },
  );
}

// ---------------------------------------------------------------------
// MUTATIONS — CRÉDIT
// ---------------------------------------------------------------------
export async function createCreditApplication(payload: {
  client_id?: string | null;
  client_name_snapshot?: string | null;
  reference?: string | null;
  equipment_label: string;
  equipment_value?: number | null;
  requested_amount: number;
  down_payment?: number | null;
  duration_months?: number;
  interest_rate?: number | null;
  monthly_payment?: number | null;
  bank_name?: string | null;
  application_date?: string;
  expected_decision_date?: string | null;
  status?: CreditStatus;
  commission_rate?: number;
  notes?: string | null;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('credit_applications')
        .insert([
          {
            ...payload,
            application_date: payload.application_date || new Date().toISOString().slice(0, 10),
            duration_months: payload.duration_months || 60,
            commission_rate: payload.commission_rate ?? 1.5,
            status: payload.status || 'En cours',
            created_by: userData.user.id,
          },
        ])
        .select()
        .single(),
    { label: 'createCreditApplication', toastOnError: true, toastMessage: 'Impossible de créer la demande de crédit' },
  );
}

export async function updateCreditApplicationStatus(id: string, status: CreditStatus) {
  const patch: Record<string, unknown> = { status };
  if (status === 'Approuvé' || status === 'Refusé') {
    patch.decision_date = new Date().toISOString().slice(0, 10);
  }
  if (status === 'Décaissé') {
    patch.disbursement_date = new Date().toISOString().slice(0, 10);
  }
  return supabaseCall(
    () => supabase.from('credit_applications').update(patch).eq('id', id).select().single(),
    { label: 'updateCreditApplicationStatus', toastOnError: true },
  );
}

// ---------------------------------------------------------------------
// MUTATIONS — POLICE
// ---------------------------------------------------------------------
export async function createInsurancePolicy(payload: {
  client_id?: string | null;
  client_name_snapshot?: string | null;
  policy_number?: string | null;
  equipment_label?: string | null;
  insurer_name: string;
  policy_type: PolicyType;
  insured_value?: number | null;
  annual_premium: number;
  payment_frequency?: string;
  start_date?: string;
  end_date?: string | null;
  status?: PolicyStatus;
  commission_rate?: number;
  deductible?: number | null;
  auto_renewal?: boolean;
  notes?: string | null;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('insurance_policies')
        .insert([
          {
            ...payload,
            payment_frequency: payload.payment_frequency || 'Annuel',
            start_date: payload.start_date || new Date().toISOString().slice(0, 10),
            commission_rate: payload.commission_rate ?? 12,
            status: payload.status || 'Active',
            auto_renewal: payload.auto_renewal ?? true,
            created_by: userData.user.id,
          },
        ])
        .select()
        .single(),
    { label: 'createInsurancePolicy', toastOnError: true, toastMessage: 'Impossible de créer la police' },
  );
}

export async function renewInsurancePolicy(id: string, durationYears = 1) {
  const policy = await supabaseCall<InsurancePolicyRow>(
    () => supabase.from('insurance_policies').select(POLICY_COLUMNS).eq('id', id).single(),
    { label: 'renewInsurancePolicy.fetch' },
  );
  const now = new Date();
  const newEnd = new Date(now);
  newEnd.setFullYear(newEnd.getFullYear() + durationYears);
  return supabaseCall(
    () =>
      supabase
        .from('insurance_policies')
        .update({
          start_date: now.toISOString().slice(0, 10),
          end_date: newEnd.toISOString().slice(0, 10),
          status: 'Active',
          policy_number: `${(policy.policy_number || 'POL').replace(/-R\d+$/, '')}-R${now.getFullYear()}`,
        })
        .eq('id', id)
        .select()
        .single(),
    { label: 'renewInsurancePolicy', toastOnError: true, toastMessage: 'Impossible de renouveler la police' },
  );
}

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------
/** Calcul mensualité (formule classique amortissement constant) */
export function computeMonthlyPayment(amount: number, annualRatePercent: number, durationMonths: number): number {
  if (!amount || !durationMonths) return 0;
  if (!annualRatePercent) return Math.round(amount / durationMonths);
  const monthlyRate = annualRatePercent / 100 / 12;
  const factor = Math.pow(1 + monthlyRate, durationMonths);
  return Math.round((amount * monthlyRate * factor) / (factor - 1));
}

// ---------------------------------------------------------------------
// WIDGET : "COMPARATEUR MULTI-BANQUES" (bank-comparator -> list)
// Pour une demande de credit (montant + duree), compare les offres des
// banques partenaires : taux, mensualite, cout total du credit, et met
// en avant la moins chere. Coeur de metier du courtier en financement.
// Formule d'annuite : M = C*(t/12) / (1 - (1 + t/12)^(-n)).
// ---------------------------------------------------------------------
export type BankOfferRow = {
  id: string;
  bank_name: string;
  annual_rate: number | null;
  max_duration_months: number | null;
  file_fees: number | null;
  min_amount?: number | null;
  max_amount?: number | null;
  active?: boolean | null;
};

export type BankComparisonItem = {
  id: string;
  bankName: string;
  annualRate: number;
  durationMonths: number;      // duree effectivement appliquee (bornee par max_duration_months)
  monthlyPayment: number;      // mensualite MAD
  totalPaid: number;           // total rembourse = mensualite * duree + frais de dossier
  totalCost: number;           // cout du credit = totalPaid - montant emprunte
  fileFees: number;
  eligible: boolean;           // banque capable de financer ce montant sur cette duree
  isBest: boolean;             // meilleure offre eligible (cout total le plus bas)
};

const BANK_OFFER_COLUMNS = `
  id, bank_name, annual_rate, max_duration_months, file_fees, min_amount, max_amount, active
`;

/** Mensualite via formule d'annuite. Renvoie 0 si donnees insuffisantes. */
function annuityMonthlyPayment(amount: number, annualRatePercent: number, durationMonths: number): number {
  if (!amount || !durationMonths) return 0;
  if (!annualRatePercent) return amount / durationMonths;
  const t = annualRatePercent / 100 / 12;
  return (amount * t) / (1 - Math.pow(1 + t, -durationMonths));
}

export async function getBankComparison() {
  const [offers, lastApps] = await Promise.all([
    supabaseCall<BankOfferRow[]>(
      () =>
        supabase
          .from('bank_offers')
          .select(BANK_OFFER_COLUMNS)
          .eq('active', true)
          .order('annual_rate', { ascending: true }),
      { label: 'getBankComparison.offers', fallback: [] },
    ),
    supabaseCall<CreditApplicationRow[]>(
      () =>
        supabase
          .from('credit_applications')
          .select('requested_amount, duration_months, equipment_label, application_date')
          .order('application_date', { ascending: false })
          .limit(1),
      { label: 'getBankComparison.lastApp', fallback: [] },
    ),
  ]);

  // Montant / duree de reference : derniere demande de credit, sinon valeurs par defaut.
  const lastApp = lastApps[0];
  const refAmount = Number(lastApp?.requested_amount) > 0 ? Number(lastApp!.requested_amount) : 1_000_000;
  const refDuration = Number(lastApp?.duration_months) > 0 ? Number(lastApp!.duration_months) : 60;
  const refLabel = lastApp?.equipment_label || null;
  const usingRealApp = !!(lastApp && Number(lastApp.requested_amount) > 0);

  const rawItems = offers.map((o) => {
    const annualRate = Number(o.annual_rate || 0);
    const maxDuration = Number(o.max_duration_months || 0);
    const fileFees = Number(o.file_fees || 0);
    const minAmount = o.min_amount != null ? Number(o.min_amount) : null;
    const maxAmount = o.max_amount != null ? Number(o.max_amount) : null;

    // Duree effective : bornee par la duree max de la banque.
    const durationMonths = maxDuration > 0 ? Math.min(refDuration, maxDuration) : refDuration;
    const monthlyPayment = annuityMonthlyPayment(refAmount, annualRate, durationMonths);
    const totalPaid = monthlyPayment * durationMonths + fileFees;
    const totalCost = totalPaid - refAmount;

    // Eligible si la banque couvre le montant demande et la duree souhaitee.
    const eligible =
      (minAmount == null || refAmount >= minAmount) &&
      (maxAmount == null || refAmount <= maxAmount) &&
      (maxDuration === 0 || maxDuration >= refDuration);

    return {
      id: String(o.id),
      bankName: String(o.bank_name || ''),
      annualRate,
      durationMonths,
      monthlyPayment: Math.round(monthlyPayment),
      totalPaid: Math.round(totalPaid),
      totalCost: Math.round(totalCost),
      fileFees: Math.round(fileFees),
      eligible,
      isBest: false,
    } as BankComparisonItem;
  });

  // Meilleure offre = cout total le plus bas parmi les banques eligibles.
  const eligibleItems = rawItems.filter((i) => i.eligible && i.monthlyPayment > 0);
  let bestId: string | null = null;
  let bestCost = Infinity;
  for (const i of eligibleItems) {
    if (i.totalCost < bestCost) {
      bestCost = i.totalCost;
      bestId = i.id;
    }
  }

  const items = rawItems
    .map((i) => ({ ...i, isBest: i.id === bestId }))
    // Eligibles d'abord, puis par cout total croissant.
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.totalCost - b.totalCost;
    });

  const worstCost = eligibleItems.reduce((m, i) => Math.max(m, i.totalCost), 0);
  const best = items.find((i) => i.isBest) || null;

  return {
    items,
    bankCount: items.length,
    eligibleCount: eligibleItems.length,
    refAmount: Math.round(refAmount),
    refDuration,
    refLabel,
    usingRealApp,
    bestBankName: best?.bankName || null,
    bestMonthlyPayment: best?.monthlyPayment || 0,
    bestTotalCost: best?.totalCost || 0,
    // Economie realisee en choisissant la meilleure offre plutot que la plus chere.
    savingsVsWorst: best ? Math.max(0, Math.round(worstCost - best.totalCost)) : 0,
  };
}
