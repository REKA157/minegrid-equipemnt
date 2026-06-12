import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  const msg = (e?.message || '').toLowerCase();
  return code === 'PGRST205' || msg.includes('could not find the table');
}

async function readTable<T>(label: string, fn: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  try {
    return await supabaseCall<T>(fn, { label, fallback: [] as unknown as T });
  } catch (err) {
    if (isMissingTableError(err)) return [] as unknown as T;
    throw err;
  }
}

export interface TransactionDocumentRow {
  id: string;
  transaction_case_id: string;
  uploaded_by: string | null;
  document_type: string;
  title: string | null;
  file_path: string;
  storage_bucket: string | null;
  visibility_scope: string | null;
  allowed_roles: string[] | null;
  requires_consent: boolean;
  consent_status: string | null;
  created_at: string;
}

export interface FinancingRequestRow {
  id: string;
  transaction_case_id: string;
  buyer_id: string | null;
  broker_id: string | null;
  requested_amount: number | null;
  currency: string | null;
  status: string;
  documents_status: string | null;
  scoring_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrokerCaseRow {
  id: string;
  transaction_case_id: string;
  broker_id: string;
  case_status: string;
  commission_rate: number | null;
  commission_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionRequestRow {
  id: string;
  transaction_case_id: string;
  machine_id: string | null;
  requested_by: string | null;
  assigned_to: string | null;
  status: string;
  scheduled_at: string | null;
  created_at: string;
}

export interface InspectionReportRow {
  id: string;
  inspection_request_id: string;
  transaction_case_id: string;
  mechanic_id: string | null;
  condition_score: number | null;
  summary: string | null;
  photos: unknown;
  recommendations: string | null;
  created_at: string;
}

export interface TransportRequestRow {
  id: string;
  transaction_case_id: string;
  transporter_id: string | null;
  pickup_location: string | null;
  delivery_location: string | null;
  machine_weight: number | null;
  machine_dimensions: string | null;
  status: string;
  eta: string | null;
  proof_of_delivery_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomsCaseRow {
  id: string;
  transaction_case_id: string;
  forwarder_id: string | null;
  origin_country: string | null;
  destination_country: string | null;
  customs_status: string;
  required_documents: unknown;
  missing_documents: unknown;
  created_at: string;
  updated_at: string;
}

export interface LogisticsTaskRow {
  id: string;
  transaction_case_id: string;
  logistician_id: string | null;
  task_type: string;
  location: string | null;
  status: string;
  scheduled_at: string | null;
  created_at: string;
}

export interface TransactionTaskRow {
  id: string;
  transaction_case_id: string;
  assigned_to: string | null;
  role: string | null;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  priority: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionMessageRow {
  id: string;
  transaction_case_id: string;
  sender_id: string;
  message: string;
  visibility_scope: string | null;
  created_at: string;
}

export interface PaymentRecordRow {
  id: string;
  transaction_case_id: string;
  payer_id: string | null;
  payee_id: string | null;
  amount: number;
  currency: string | null;
  payment_type: string;
  status: string;
  created_at: string;
}

export interface CommissionRecordRow {
  id: string;
  transaction_case_id: string;
  beneficiary_id: string | null;
  role: string;
  commission_type: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  organization_id: string | null;
  transaction_case_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export const transactionDocumentService = {
  listByCase: (caseId: string) =>
    readTable<TransactionDocumentRow[]>(
      'transactionDocuments.listByCase',
      () =>
        supabase
          .from('transaction_documents')
          .select('*')
          .eq('transaction_case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(100),
    ),
};

export const financingRequestService = {
  listByCase: (caseId: string) =>
    readTable<FinancingRequestRow[]>(
      'financingRequests.listByCase',
      () =>
        supabase
          .from('financing_requests')
          .select('*')
          .eq('transaction_case_id', caseId)
          .order('updated_at', { ascending: false }),
    ),
};

export const brokerCaseService = {
  listByCase: (caseId: string) =>
    readTable<BrokerCaseRow[]>(
      'brokerCases.listByCase',
      () =>
        supabase.from('broker_cases').select('*').eq('transaction_case_id', caseId).order('updated_at', { ascending: false }),
    ),
};

export const inspectionService = {
  listRequestsByCase: (caseId: string) =>
    readTable<InspectionRequestRow[]>(
      'inspectionRequests.listByCase',
      () =>
        supabase
          .from('inspection_requests')
          .select('*')
          .eq('transaction_case_id', caseId)
          .order('created_at', { ascending: false }),
    ),
  listReportsByCase: (caseId: string) =>
    readTable<InspectionReportRow[]>(
      'inspectionReports.listByCase',
      () =>
        supabase
          .from('inspection_reports')
          .select('*')
          .eq('transaction_case_id', caseId)
          .order('created_at', { ascending: false }),
    ),
};

export const transportRequestService = {
  listByCase: (caseId: string) =>
    readTable<TransportRequestRow[]>(
      'transportRequests.listByCase',
      () =>
        supabase
          .from('transport_requests')
          .select('*')
          .eq('transaction_case_id', caseId)
          .order('updated_at', { ascending: false }),
    ),
};

export const customsCaseService = {
  listByCase: (caseId: string) =>
    readTable<CustomsCaseRow[]>(
      'customsCases.listByCase',
      () =>
        supabase.from('customs_cases').select('*').eq('transaction_case_id', caseId).order('updated_at', { ascending: false }),
    ),
};

export const logisticsTaskService = {
  listByCase: (caseId: string) =>
    readTable<LogisticsTaskRow[]>(
      'logisticsTasks.listByCase',
      () =>
        supabase.from('logistics_tasks').select('*').eq('transaction_case_id', caseId).order('created_at', { ascending: false }),
    ),
};

export const transactionTaskService = {
  listByCase: (caseId: string) =>
    readTable<TransactionTaskRow[]>(
      'transactionTasks.listByCase',
      () =>
        supabase.from('transaction_tasks').select('*').eq('transaction_case_id', caseId).order('due_date', { ascending: true }),
    ),
};

export const transactionMessageService = {
  listByCase: (caseId: string) =>
    readTable<TransactionMessageRow[]>(
      'transactionMessages.listByCase',
      () =>
        supabase
          .from('transaction_messages')
          .select('*')
          .eq('transaction_case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(200),
    ),
};

export const paymentRecordService = {
  listByCase: (caseId: string) =>
    readTable<PaymentRecordRow[]>(
      'paymentRecords.listByCase',
      () =>
        supabase.from('payment_records').select('*').eq('transaction_case_id', caseId).order('created_at', { ascending: false }),
    ),
};

export const commissionRecordService = {
  listByCase: (caseId: string) =>
    readTable<CommissionRecordRow[]>(
      'commissionRecords.listByCase',
      () =>
        supabase
          .from('commission_records')
          .select('*')
          .eq('transaction_case_id', caseId)
          .order('created_at', { ascending: false }),
    ),
};

export const auditLogService = {
  listByCase: (caseId: string) =>
    readTable<AuditLogRow[]>(
      'auditLogs.listByCase',
      () =>
        supabase
          .from('audit_logs')
          .select('*')
          .eq('transaction_case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(100),
    ),
};
