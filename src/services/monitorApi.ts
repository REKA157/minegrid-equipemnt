import supabaseClient from '../utils/supabaseClient';
import type {
  MonitorProject,
  MonitorProjectDetail,
  ProjectListResponse,
  ProjectFilters,
  DataSource,
} from '../types/monitor';

const BASE_URL = import.meta.env.VITE_MONITOR_API_URL || 'http://localhost:8000';
const ADMIN_TOKEN = import.meta.env.VITE_MONITOR_ADMIN_TOKEN || 'changeme-admin-token-2026';
const hasConfiguredAdminToken =
  Boolean(ADMIN_TOKEN) && ADMIN_TOKEN !== 'changeme-admin-token-2026';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(hasConfiguredAdminToken ? { 'X-Admin-Token': ADMIN_TOKEN } : {}),
  };
  return headers;
}

type ApiFetchInit = RequestInit & { timeoutMs?: number };

async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const headers = await getAuthHeaders();
  const timeoutMs = typeof init?.timeoutMs === 'number' ? init.timeoutMs : 20_000;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
    signal: init?.signal || controller.signal,
  });
  window.clearTimeout(timeoutId);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function fetchProjects(
  filters: ProjectFilters,
  page = 1,
  pageSize = 20,
): Promise<ProjectListResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  if (filters.country) params.set('country', filters.country);
  if (filters.type) params.set('type', filters.type);
  if (filters.phase) params.set('phase', filters.phase);
  if (filters.source_kind) params.set('source_kind', filters.source_kind);
  if (filters.search) params.set('search', filters.search);
  return apiFetch(`/projects?${params}`);
}

export async function fetchProjectDetail(
  id: string,
  withAi = true,
  /** Recalcul LLM même si des besoins existent déjà (query `force_ai` côté API). */
  forceAi = false,
): Promise<MonitorProjectDetail> {
  const params = new URLSearchParams();
  if (withAi) params.set('ai', 'true');
  if (forceAi) params.set('force_ai', 'true');
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiFetch(`/projects/${id}${suffix}`);
}

export interface AnalysisCompareNeed {
  category: string;
  qty_min: number;
  qty_max: number;
  confidence: number;
  rationale: string;
}

export interface ProjectAnalysisCompare {
  project_id: string;
  deterministic_count: number;
  llm_count: number;
  agreement: {
    intersection_count: number;
    intersection_categories: string[];
    only_deterministic: string[];
    only_llm: string[];
  };
  spread: {
    deterministic_qty_span_sum: number;
    llm_qty_span_sum: number;
  };
  llm_meta: {
    called: boolean;
    model?: string;
    tokens?: number;
  };
  deterministic_preview: AnalysisCompareNeed[];
  llm_preview: AnalysisCompareNeed[];
}

export async function fetchProjectAnalysisCompare(id: string): Promise<ProjectAnalysisCompare> {
  try {
    return await apiFetch(`/projects/${id}/analysis-compare`, { timeoutMs: 45_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // Compatibilité backend: anciens serveurs n'ont que la route admin.
    if (message.includes('API 404')) {
      return apiFetch(`/admin/projects/${id}/analysis-compare`, {
        headers: adminHeaders(),
        timeoutMs: 45_000,
      });
    }
    throw error;
  }
}

export async function subscribeAlert(rule: Record<string, unknown>): Promise<{ id: string; rule: Record<string, unknown>; created_at: string }> {
  return apiFetch('/alerts/subscribe', {
    method: 'POST',
    body: JSON.stringify({ rule }),
  });
}

export async function fetchAlertRules(): Promise<{ id: string; rule: Record<string, unknown>; created_at: string }[]> {
  return apiFetch('/alerts/rules');
}

export async function deleteAlertRule(ruleId: string): Promise<void> {
  await apiFetch(`/alerts/rules/${ruleId}`, { method: 'DELETE' });
}

export async function fetchAlertEvents(limit = 50): Promise<{
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}[]> {
  return apiFetch(`/alerts/events?limit=${limit}`);
}

// ---------- Admin Sources ----------

function adminHeaders(): Record<string, string> {
  return hasConfiguredAdminToken ? { 'X-Admin-Token': ADMIN_TOKEN } : {};
}

export async function fetchSources(): Promise<DataSource[]> {
  return apiFetch('/admin/sources', { headers: adminHeaders() });
}

export async function createSource(body: {
  name: string;
  connector_type: string;
  url?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}): Promise<DataSource> {
  return apiFetch('/admin/sources', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
}

export async function updateSource(
  id: string,
  body: Partial<{ name: string; url: string; enabled: boolean; config: Record<string, unknown> }>,
): Promise<DataSource> {
  return apiFetch(`/admin/sources/${id}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
}

export async function deleteSource(id: string): Promise<void> {
  await apiFetch(`/admin/sources/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}

export async function runSource(id: string): Promise<{ inserted: number; updated: number; skipped: number; errors: number }> {
  return apiFetch(`/admin/sources/${id}/run`, {
    method: 'POST',
    headers: adminHeaders(),
    timeoutMs: 240_000,
  });
}

export async function runAllSources(): Promise<{
  total_sources: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  by_connector: Record<string, { inserted: number; updated: number; skipped: number; errors: number }>;
  details: Array<Record<string, unknown>>;
}> {
  return apiFetch('/admin/sources/run-all', {
    method: 'POST',
    headers: adminHeaders(),
    timeoutMs: 300_000,
  });
}

// ---------- Mascus Import ----------

export interface MascusRunParams {
  search_queries?: string[];
  country?: string;
  max_pages?: number;
}

export interface MascusRunResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  total_fetched: number;
  details: string[];
}

export async function runMascusImport(params?: MascusRunParams): Promise<MascusRunResult> {
  return apiFetch('/admin/mascus/run', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(params || {}),
    // Mascus -> Piloterr peut prendre du temps (plusieurs pages/requêtes).
    // Le timeout par défaut (20s) peut interrompre l'import et afficher
    // "signal aborted without reason".
    timeoutMs: 300_000,
  });
}

export async function getMascusStatus(): Promise<{
  piloterr_api_key_configured: boolean;
  supabase_configured: boolean;
  ready: boolean;
}> {
  return apiFetch('/admin/mascus/status', { headers: adminHeaders() });
}

// ---------- Leboncoin Import ----------

export interface LeboncoinRunParams {
  search_queries?: string[];
  max_pages?: number;
}

export interface LeboncoinRunResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  total_fetched: number;
  details: string[];
}

export async function runLeboncoinImport(params?: LeboncoinRunParams): Promise<LeboncoinRunResult> {
  return apiFetch('/admin/leboncoin/run', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(params || {}),
    timeoutMs: 300_000,
  });
}

export async function getLeboncoinStatus(): Promise<{
  piloterr_api_key_configured: boolean;
  supabase_configured: boolean;
  ready: boolean;
}> {
  return apiFetch('/admin/leboncoin/status', { headers: adminHeaders() });
}
