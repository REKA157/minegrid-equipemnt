import supabase from '../../utils/supabaseClient';
import type { ComponentGrade } from './inspectionGrade';

// Inspection — le client DEMANDE une inspection (status 'requested') et LIT ses rapports.
// L'affectation d'inspecteur, la rédaction et la certification sont serveur (RLS 0001).

export interface InspectionRequest {
  id: string;
  machine_id: string;
  status: 'requested' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  location: string | null;
  scheduled_at: string | null;
  created_at: string;
}

export interface InspectionReport {
  id: string;
  request_id: string;
  overall_grade: ComponentGrade | null;
  hours_meter: number | null;
  findings: Record<string, unknown>;
  pdf_url: string | null;
  certified: boolean;
  certified_at: string | null;
}

export async function requestInspection(input: {
  machine_id: string;
  location?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Non connecté' };
  const { data, error } = await supabase
    .from('inspection_requests')
    .insert({
      machine_id: input.machine_id,
      requester_id: user.id,
      location: input.location ?? null,
      status: 'requested',
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function getMyInspectionRequests(): Promise<InspectionRequest[]> {
  const { data, error } = await supabase
    .from('inspection_requests')
    .select('id, machine_id, status, location, scheduled_at, created_at')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as InspectionRequest[]) ?? [];
}

/** Rapport certifié public d'une machine (badge « Inspecté MineGrid »). */
export async function getCertifiedReport(requestId: string): Promise<InspectionReport | null> {
  const { data, error } = await supabase
    .from('inspection_reports')
    .select('id, request_id, overall_grade, hours_meter, findings, pdf_url, certified, certified_at')
    .eq('request_id', requestId)
    .maybeSingle();
  if (error) return null;
  return (data as InspectionReport) ?? null;
}
