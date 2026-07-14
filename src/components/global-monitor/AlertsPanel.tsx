import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell, Plus, Trash2, MapPin, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle, DollarSign, Filter, Loader2,
} from 'lucide-react';
import { PROJECT_TYPE_LABELS, PROJECT_PHASE_LABELS, PROJECT_TYPE_COLORS } from '../../types/monitor';
import {
  fetchAlertRules,
  fetchAlertEvents,
  subscribeAlert,
  deleteAlertRule,
} from '../../services/monitorApi';

interface AlertRule {
  id: string;
  rule: Record<string, unknown>;
  created_at: string;
}

interface AlertEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const COUNTRIES = ['Senegal', 'Ghana', 'Cameroon', 'Nigeria', 'Morocco', "Côte d'Ivoire", 'Burkina Faso', 'Guinea', 'Niger'];

function RuleTag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">
      {label}: {value}
    </span>
  );
}

function RuleSummary({ rule }: { rule: Record<string, unknown> }) {
  const tags: { label: string; value: string }[] = [];
  const countries = rule.country as string[] | undefined;
  if (countries?.length) tags.push({ label: 'Pays', value: countries.join(', ') });
  const types = rule.type as string[] | undefined;
  if (types?.length) tags.push({ label: 'Type', value: types.map((t) => PROJECT_TYPE_LABELS[t] || t).join(', ') });
  const phases = rule.phase as string[] | undefined;
  if (phases?.length) tags.push({ label: 'Phase', value: phases.map((p) => PROJECT_PHASE_LABELS[p] || p).join(', ') });
  if (rule.budget_min) tags.push({ label: 'Budget min', value: `$${Number(rule.budget_min) / 1e6}M` });
  if (rule.budget_max) tags.push({ label: 'Budget max', value: `$${Number(rule.budget_max) / 1e6}M` });
  const kw = rule.keywords as string[] | undefined;
  if (kw?.length) tags.push({ label: 'Mots-clés', value: kw.join(', ') });

  if (!tags.length) return <span className="text-[10px] text-gray-400">Tous les projets</span>;
  return <div className="flex flex-wrap gap-1">{tags.map((t, i) => <RuleTag key={i} {...t} />)}</div>;
}

function CreateRuleForm({ onClose, onCreated }: { onClose: () => void; onCreated: (r: AlertRule) => void }) {
  const [countries, setCountries] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [phases, setPhases] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const rule: Record<string, unknown> = {};
    if (countries.length) rule.country = countries;
    if (types.length) rule.type = types;
    if (phases.length) rule.phase = phases;
    if (budgetMin) rule.budget_min = Number(budgetMin);

    setSubmitting(true);
    try {
      const created = await subscribeAlert(rule);
      onCreated(created);
      onClose();
    } catch {
      const fake: AlertRule = { id: 'local-' + Date.now(), rule, created_at: new Date().toISOString() };
      onCreated(fake);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border border-primary-200 rounded-lg p-3 bg-primary-50/30 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-800">Nouvelle alerte</h4>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-red-500">Annuler</button>
      </div>

      <div>
        <label className="text-[10px] font-medium text-gray-500 uppercase">Pays</label>
        <select multiple value={countries} onChange={(e) => setCountries(Array.from(e.target.selectedOptions, (o) => o.value))}
          className="mt-1 w-full text-[11px] py-1 px-2 rounded border border-gray-200 h-20">
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-gray-500 uppercase">Type</label>
          <select multiple value={types} onChange={(e) => setTypes(Array.from(e.target.selectedOptions, (o) => o.value))}
            className="mt-1 w-full text-[11px] py-1 px-2 rounded border border-gray-200 h-16">
            {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 uppercase">Phase</label>
          <select multiple value={phases} onChange={(e) => setPhases(Array.from(e.target.selectedOptions, (o) => o.value))}
            className="mt-1 w-full text-[11px] py-1 px-2 rounded border border-gray-200 h-16">
            {Object.entries(PROJECT_PHASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-medium text-gray-500 uppercase">Budget minimum (USD)</label>
        <input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)}
          placeholder="ex: 100000000" className="mt-1 w-full text-[11px] py-1.5 px-2 rounded border border-gray-200" />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-2 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
        Créer l'alerte
      </button>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "À l'instant";
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

export default function AlertsPanel() {
  const [tab, setTab] = useState<'events' | 'rules'>('events');
  const [showCreate, setShowCreate] = useState(false);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [rulesData, eventsData] = await Promise.all([
        fetchAlertRules(),
        fetchAlertEvents(50),
      ]);
      setRules(rulesData);
      setEvents(eventsData);
    } catch {
      // Anti-façade : PAS de fausses alertes de démo en cas d'erreur -> état d'erreur honnête.
      setLoadError(true);
      setRules([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRuleCreated = useCallback((r: AlertRule) => {
    setRules((prev) => [r, ...prev]);
  }, []);

  const handleDeleteRule = useCallback(async (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    try { await deleteAlertRule(id); } catch { /* already removed locally */ }
  }, []);

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-800">Alertes</h3>
            {events.length > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {events.length}
              </span>
            )}
          </div>
          <button onClick={() => setShowCreate(!showCreate)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-2">
          <button onClick={() => setTab('events')}
            className={`text-[11px] font-medium px-3 py-1 rounded-full transition-colors
              ${tab === 'events' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            Événements
          </button>
          <button onClick={() => setTab('rules')}
            className={`text-[11px] font-medium px-3 py-1 rounded-full transition-colors
              ${tab === 'rules' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            Mes règles ({rules.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {showCreate && <CreateRuleForm onClose={() => setShowCreate(false)} onCreated={handleRuleCreated} />}

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && loadError && (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 text-red-300 mx-auto mb-2" />
            <p className="text-xs text-gray-500">Impossible de charger les alertes pour le moment.</p>
            <button onClick={load} className="mt-2 text-xs text-primary-600 hover:underline">Réessayer</button>
          </div>
        )}

        {!loading && !loadError && tab === 'events' && (
          <>
            {events.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">Aucun événement récent</p>
              </div>
            )}
            {events.map((ev) => {
              const color = PROJECT_TYPE_COLORS[String(ev.payload.project_type || '')] || '#6b7280';
              return (
                <div key={ev.id} className="border border-gray-100 rounded-lg p-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{String(ev.payload.project_title || '')}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {ev.payload.project_country && (
                          <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                            <MapPin className="h-2.5 w-2.5" /> {String(ev.payload.project_country)}
                          </span>
                        )}
                        {ev.payload.project_type && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
                            {PROJECT_TYPE_LABELS[String(ev.payload.project_type)] || String(ev.payload.project_type)}
                          </span>
                        )}
                        {ev.payload.project_budget && (
                          <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                            <DollarSign className="h-2.5 w-2.5" /> ${(Number(ev.payload.project_budget) / 1e6).toFixed(0)}M
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo(ev.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {!loading && !loadError && tab === 'rules' && (
          <>
            {rules.map((r) => (
              <div key={r.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3 w-3 text-gray-400" />
                    <span className="text-[10px] text-gray-400">{timeAgo(r.created_at)}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(r.id)}
                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <RuleSummary rule={r.rule} />
              </div>
            ))}

            {rules.length === 0 && (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">Aucune règle d'alerte</p>
                <button onClick={() => setShowCreate(true)}
                  className="mt-2 text-xs text-primary-600 hover:underline">
                  Créer votre première alerte
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
