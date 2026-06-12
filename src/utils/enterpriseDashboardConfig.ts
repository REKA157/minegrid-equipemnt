import supabase from './supabaseClient';
import type { ShellDashboardConfig } from '../pages/enterprise-shell/shellTypes';

const TABLE = 'enterprise_dashboard_configs';

function normalizeRemote(raw: unknown): ShellDashboardConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<ShellDashboardConfig>;
  return {
    widgets: Array.isArray(o.widgets) ? o.widgets : [],
    layout:
      o.layout && Array.isArray(o.layout.lg) ? o.layout : { lg: [] },
    widgetSizes: (o.widgetSizes as Record<string, string>) ?? {},
    lastSaved: o.lastSaved,
  };
}

export async function fetchEnterpriseDashboardConfig(
  userId: string,
  role: string,
): Promise<ShellDashboardConfig | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('config')
    .eq('user_id', userId)
    .eq('role', role)
    .maybeSingle();

  if (error) {
    return null;
  }
  return normalizeRemote(data?.config);
}

export async function upsertEnterpriseDashboardConfig(
  userId: string,
  role: string,
  config: ShellDashboardConfig,
): Promise<{ ok: boolean; error?: string }> {
  const lastSaved = config.lastSaved ?? new Date().toISOString();
  const body = {
    user_id: userId,
    role,
    config: { ...config, lastSaved },
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(TABLE).upsert(body, {
    onConflict: 'user_id,role',
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
