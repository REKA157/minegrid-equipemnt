import supabase from '../../utils/supabaseClient';

// Finance — le client crée/soumet un dossier (status draft|submitted). Le scoring et
// la transmission partenaire sont serveur (RLS 0002). Aucune décision de crédit ici.

export interface FinancePartner {
  id: string;
  name: string;
  country: string | null;
  products: string[];
  min_amount: number | null;
  max_amount: number | null;
}

export interface FinanceApplication {
  id: string;
  machine_id: string | null;
  amount: number;
  currency: string;
  term_months: number | null;
  status: 'draft' | 'submitted' | 'scoring' | 'forwarded' | 'approved' | 'rejected' | 'cancelled';
  score: number | null;
  created_at: string;
}

export async function getActivePartners(): Promise<FinancePartner[]> {
  const { data, error } = await supabase
    .from('finance_partners')
    .select('id, name, country, products, min_amount, max_amount')
    .eq('active', true);
  if (error) return [];
  return (data as FinancePartner[]) ?? [];
}

export async function getMyApplications(): Promise<FinanceApplication[]> {
  const { data, error } = await supabase
    .from('finance_applications')
    .select('id, machine_id, amount, currency, term_months, status, score, created_at')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as FinanceApplication[]) ?? [];
}

export async function createDraftApplication(input: {
  machine_id?: string;
  amount: number;
  currency?: string;
  term_months?: number;
  dossier?: Record<string, unknown>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Non connecté' };
  const { data, error } = await supabase
    .from('finance_applications')
    .insert({
      applicant_id: user.id,
      machine_id: input.machine_id ?? null,
      amount: input.amount,
      currency: input.currency ?? 'EUR',
      term_months: input.term_months ?? null,
      dossier: input.dossier ?? {},
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

/** Soumet un dossier brouillon (déclenche le scoring serveur en aval). */
export async function submitApplication(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('finance_applications')
    .update({ status: 'submitted', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
