import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Globe, RefreshCw, Wifi, WifiOff, Bell, Activity, Settings2 } from 'lucide-react';
import ProjectMap from '../components/global-monitor/ProjectMap';
import ProjectList from '../components/global-monitor/ProjectList';
import ProjectDetails from '../components/global-monitor/ProjectDetails';
import ProjectFiltersPanel from '../components/global-monitor/ProjectFilters';
import AlertsPanel from '../components/global-monitor/AlertsPanel';
import type { LayerKey } from '../components/global-monitor/LayersToggle';
import type { MonitorProject, MonitorProjectDetail, ProjectFilters, ProjectContact } from '../types/monitor';
import { RealPipelineService } from '../services/realPipelineService';
import { toast } from '../utils/toast';
import { supabaseClient } from '../utils/supabaseClient';
import {
  fetchProjects,
  fetchProjectDetail,
  fetchProjectAnalysisCompare,
  type ProjectAnalysisCompare,
} from '../services/monitorApi';
import { normalizeBudget as normalizeBudgetUtil } from '../utils/globalMonitorCoverage';
import { equipmentNeedsToNotesBlock } from '../utils/globalMonitorEquipmentNeedsText';
import {
  classifyRole,
  prospectAngle,
  matchNeedsToStock,
  stockMatchNotesBlock,
  loadSellerStockCategories,
} from '../utils/monitorProspectMatch';

/**
 * N'enregistre pas contact_company si c'est le même libellé que le titre projet
 * (sinon le Kanban répète deux fois l'intitulé sous « Prospect AO - … »).
 */
function contactCompanyForPipeline(projectTitle: string, organization: string | null | undefined): string | undefined {
  const o = (organization || '').trim();
  if (!o) return undefined;
  const p = (projectTitle || '').trim();
  const oLow = o.toLowerCase();
  const pLow = p.toLowerCase();
  if (oLow === pLow) return undefined;
  if (oLow.length >= 8 && pLow.includes(oLow)) return undefined;
  if (pLow.length >= 8 && oLow.includes(pLow)) return undefined;
  return o;
}

export default function GlobalMonitor() {
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [projects, setProjects] = useState<MonitorProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<MonitorProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analysisCompare, setAnalysisCompare] = useState<ProjectAnalysisCompare | null>(null);
  const [analysisCompareLoading, setAnalysisCompareLoading] = useState(false);
  const [analysisCompareError, setAnalysisCompareError] = useState<string | null>(null);
  const [createLeadsLoading, setCreateLeadsLoading] = useState(false);
  const [rightPanel, setRightPanel] = useState<'details' | 'alerts'>('details');
  const [activeLayers, setActiveLayers] = useState<Set<LayerKey>>(new Set(['mine', 'infrastructure', 'energy', 'btp', 'tender']));

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const requestSeqRef = useRef(0);
  const hadLiveSuccessRef = useRef(false);

  const loadProjects = useCallback(async () => {
    const reqId = ++requestSeqRef.current;
    setLoading(true);
    try {
      const pageSize = 100;
      const first = await fetchProjects(filtersRef.current, 1, pageSize);
      let allItems = [...(first.items || [])];
      const totalFromApi = first.total ?? allItems.length;
      const totalPages = Math.max(1, Math.ceil(totalFromApi / pageSize));

      for (let p = 2; p <= totalPages; p += 1) {
        if (reqId !== requestSeqRef.current) return;
        try {
          const next = await fetchProjects(filtersRef.current, p, pageSize);
          allItems = allItems.concat(next.items || []);
        } catch {
          // keep partial live data
        }
      }

      if (reqId !== requestSeqRef.current) return;
      // Anti-façade : on affiche UNIQUEMENT les vrais projets du monitor-service,
      // sans remplissage par seeds/démo (ensureCoverage/enrichForDisplay retirés).
      const display = allItems.map(normalizeBudgetUtil);
      setProjects(display);
      setTotal(totalFromApi || display.length);
      setPage(1);
      setHasMore(false);
      setIsLive(true);
      setLiveError(null);
      hadLiveSuccessRef.current = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur API Monitor';
      setLiveError(message);
      if (!hadLiveSuccessRef.current) {
        // API injoignable et jamais de succès : on n'invente rien (anti-façade) -> vide + erreur.
        setProjects([]);
        setTotal(0);
        setIsLive(false);
      }
    } finally {
      if (reqId === requestSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { loadProjects(); }, [filters, loadProjects]);
  useEffect(() => {
    const id = window.setInterval(() => loadProjects(), 45000);
    return () => window.clearInterval(id);
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      setAnalysisCompare(null);
      setAnalysisCompareError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setAnalysisCompare(null);
    setAnalysisCompareError(null);
    fetchProjectDetail(selectedId)
      .then((d) => { if (!cancelled) setSelectedDetail(d); })
      .catch(() => {
        if (cancelled) return;
        const base = projects.find((p) => p.id === selectedId);
        setSelectedDetail(base ? { ...base, documents: [], entities: [], contacts: [], equipment_needs: [] } : null);
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, projects]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadProjects();
  }, [loadProjects]);

  const handleCompareAnalysis = useCallback(async () => {
    if (!selectedId) return;
    setAnalysisCompareLoading(true);
    setAnalysisCompareError(null);
    try {
      const data = await fetchProjectAnalysisCompare(selectedId);
      setAnalysisCompare(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setAnalysisCompareError(message);
      setAnalysisCompare(null);
    } finally {
      setAnalysisCompareLoading(false);
    }
  }, [selectedId]);

  const activeMetier = localStorage.getItem('lastActiveMetier') || 'vendeur';
  const assignedToLabel = activeMetier.charAt(0).toUpperCase() + activeMetier.slice(1);

  const handleCreateLeadFromContact = useCallback(async (contact: ProjectContact) => {
    if (!selectedDetail) return;
    const { data: authData } = await supabaseClient.auth.getUser();
    if (!authData?.user) {
      toast.error("Session expirée. Reconnectez-vous puis réessayez l'envoi vers Kanban.");
      return;
    }
    const gmNeedsNote = equipmentNeedsToNotesBlock(selectedDetail.equipment_needs ?? []);
    const stockNote = stockMatchNotesBlock(
      matchNeedsToStock(selectedDetail.equipment_needs ?? [], await loadSellerStockCategories()),
    );
    const kind = classifyRole(contact.role);
    const angle = prospectAngle(kind);

    const { lead, error } = await RealPipelineService.createLeadWithStatus({
      title: `${angle.titlePrefix} - ${selectedDetail.title}`,
      stage: 'Prospection',
      priority: (contact.confidence ?? 0.6) >= 0.75 ? 'high' : 'medium',
      value: Math.round((selectedDetail.budget_usd || 0) * 0.03) || 0,
      probability: Math.min(65, Math.max(15, Math.round((contact.confidence ?? 0.6) * 100))),
      next_action: angle.nextAction,
      assigned_to: assignedToLabel,
      last_contact: new Date().toISOString(),
      notes: [
        `Source AO: ${selectedDetail.source || 'inconnue'}`,
        `Organisation: ${contact.organization || 'n/a'}`,
        contact.address ? `Adresse: ${contact.address}` : null,
        contact.website ? `Site: ${contact.website}` : null,
        angle.roleNote,
        contact.rationale ? `Preuve extraction: ${contact.rationale}` : null,
        gmNeedsNote,
        stockNote,
      ].filter(Boolean).join('\n'),
      contact_name: contact.person_name || undefined,
      contact_company: contactCompanyForPipeline(selectedDetail.title, contact.organization),
      contact_phone: contact.phone || undefined,
      contact_email: contact.email || undefined,
      contact_role: kind === 'unknown' ? null : kind, // lauréat vs maître d'ouvrage (colonne optionnelle)
      source: 'monitor', // lead RÉELLEMENT issu du Global Monitor (AO) -> convergence moteur 'monitor'
      source_id: selectedDetail.id,
    });
    if (lead) {
      toast.success('Prospect envoyé dans le pipeline (Kanban).');
      window.dispatchEvent(new Event('pipeline:refresh'));
      return;
    }
    toast.error(`Insertion Kanban refusée: ${error?.message || "raison inconnue"}`);
  }, [selectedDetail]);

  const handleCreateLeadsFromProject = useCallback(async () => {
    if (!selectedDetail) return;
    const { data: authData } = await supabaseClient.auth.getUser();
    if (!authData?.user) {
      toast.error("Session expirée. Reconnectez-vous puis réessayez l'envoi vers Kanban.");
      return;
    }
    const contacts = selectedDetail.contacts ?? [];
    const buyerOrWinner =
      selectedDetail.entities?.find((ent) =>
        ['client', 'buyer', 'acheteur', 'adjudicateur', 'winner', 'attributaire', 'contractor'].some((k) =>
          (ent.role || '').toLowerCase().includes(k),
        ),
      ) || null;
    const fallbackProspect: ProjectContact | null = contacts.length === 0
      ? {
          id: `fallback-${selectedDetail.id}`,
          project_id: selectedDetail.id,
          organization: buyerOrWinner?.name || selectedDetail.title || 'Prospect projet',
          person_name: null,
          role: buyerOrWinner?.role || 'prospect projet',
          email: null,
          phone: null,
          website: null,
          address: [selectedDetail.country, selectedDetail.region].filter(Boolean).join(', ') || null,
          confidence: selectedDetail.confidence ?? 0.45,
          rationale: 'Fallback validation flux Global Monitor -> Kanban (aucun contact AO explicite)',
          created_at: new Date().toISOString(),
        }
      : null;
    const contactsToTransfer = contacts.length > 0 ? contacts : [fallbackProspect as ProjectContact];

    setCreateLeadsLoading(true);
    const gmNeedsNote = equipmentNeedsToNotesBlock(selectedDetail.equipment_needs ?? []);
    // Croisement besoins de l'AO <-> stock RÉEL du vendeur (« vous avez X compatibles »).
    const stockCategories = await loadSellerStockCategories();
    const stockNote = stockMatchNotesBlock(
      matchNeedsToStock(selectedDetail.equipment_needs ?? [], stockCategories),
    );

    try {
      const contactKey = (contact: ProjectContact) => {
        const email = (contact.email || '').trim().toLowerCase();
        const company = (contact.organization || '').trim().toLowerCase();
        const person = (contact.person_name || '').trim().toLowerCase();
        const stableIdentity = email || company || person || contact.id || 'unknown';
        return `${selectedDetail.id}|${stableIdentity}`;
      };

      const existingLeads = await RealPipelineService.getLeads();
      const existingKeys = new Set(
        existingLeads.map((lead) => {
          const email = (lead.contact_email || '').trim().toLowerCase();
          const company = (lead.contact_company || '').trim().toLowerCase();
          const person = '';
          const stableIdentity = email || company || person || lead.id || 'unknown';
          return `${lead.source_id || ''}|${stableIdentity}`;
        }),
      );

      let created = 0;
      let skipped = 0;
      let failed = 0;
      let lastInsertErrorMessage: string | null = null;

      for (const contact of contactsToTransfer) {
        const dedupeKey = contactKey(contact);

        if (existingKeys.has(dedupeKey)) {
          skipped += 1;
          continue;
        }

        // Angle commercial selon le rôle : LAURÉAT (négocier) vs maître d'ouvrage (soumissionner).
        const kind = classifyRole(contact.role);
        const angle = prospectAngle(kind);
        const { lead, error } = await RealPipelineService.createLeadWithStatus({
          title: `${angle.titlePrefix} - ${selectedDetail.title}`,
          stage: 'Prospection',
          priority: (contact.confidence ?? 0.6) >= 0.75 ? 'high' : 'medium',
          value: Math.round((selectedDetail.budget_usd || 0) * 0.03) || 0,
          probability: Math.min(65, Math.max(15, Math.round((contact.confidence ?? 0.6) * 100))),
          next_action: angle.nextAction,
          assigned_to: assignedToLabel,
          last_contact: new Date().toISOString(),
          notes: [
            `Source AO: ${selectedDetail.source || 'inconnue'}`,
            `Organisation: ${contact.organization || 'n/a'}`,
            contact.address ? `Adresse: ${contact.address}` : null,
            contact.website ? `Site: ${contact.website}` : null,
            angle.roleNote,
            selectedDetail.phase ? `Phase: ${selectedDetail.phase}` : null,
            selectedDetail.type ? `Type projet: ${selectedDetail.type}` : null,
            contact.rationale ? `Preuve extraction: ${contact.rationale}` : null,
            gmNeedsNote,
            stockNote,
          ].filter(Boolean).join('\n'),
          contact_name: contact.person_name || undefined,
          contact_company: contactCompanyForPipeline(selectedDetail.title, contact.organization),
          contact_phone: contact.phone || undefined,
          contact_email: contact.email || undefined,
          contact_role: kind === 'unknown' ? null : kind, // lauréat vs maître d'ouvrage (colonne optionnelle)
          source: 'monitor', // lead RÉELLEMENT issu du Global Monitor (AO) -> convergence moteur 'monitor'
          source_id: selectedDetail.id,
        });

        if (lead) {
          created += 1;
          existingKeys.add(dedupeKey);
        } else {
          failed += 1;
          if (error?.message) {
            lastInsertErrorMessage = error.message;
            console.error('Insertion lead refusée (GlobalMonitor):', error.message);
          }
        }
      }

      if (created > 0) {
        const fallbackNote = contacts.length === 0 ? ' (mode validation sans contact explicite)' : '';
        toast.success(
          `${created} prospect(s) envoyé(s) vers le Kanban` +
          `${skipped > 0 ? ` · ${skipped} déjà présent(s)` : ''}` +
          `${failed > 0 ? ` · ${failed} échec(s)` : ''}` +
          `${fallbackNote}.`,
        );
        window.dispatchEvent(new Event('pipeline:refresh'));
      } else {
        if (failed > 0) {
          toast.error(
            `Échec d'insertion Supabase: ${failed} prospect(s) non ajouté(s).` +
            `${lastInsertErrorMessage ? ` Détail: ${lastInsertErrorMessage}` : ''}`,
          );
        } else {
          toast.error("Aucun nouveau prospect ajouté: déjà transférés.");
        }
      }
    } finally {
      setCreateLeadsLoading(false);
    }
  }, [selectedDetail]);

  const stats = useMemo(() => {
    const totalBudget = projects.reduce((sum, p) => sum + (p.budget_usd || 0), 0);
    return { count: total, totalBudget };
  }, [projects, total]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3">
        <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary-600 flex items-center justify-center">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Minegrid Global Monitor</h1>
              <p className="text-xs text-gray-500">{stats.count} projets · Budget total ${Math.round(stats.totalBudget / 1e6)}M</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${isLive ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
              {isLive ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isLive ? 'Live' : 'Démo'}
            </span>
            {!isLive && liveError && (
              <span className="text-[11px] text-orange-700 max-w-[18rem] truncate" title={liveError}>
                {liveError}
              </span>
            )}
            <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <a href="#admin-sources" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500" title="Catalogue de sources">
              <Settings2 className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-4 lg:px-6 py-4">
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-140px)] min-h-[550px]">
          <div className="col-span-12 md:col-span-3 flex flex-col gap-4 overflow-hidden">
            <ProjectFiltersPanel filters={filters} onChange={setFilters} />
            <div className="flex-1 overflow-hidden">
              <ProjectList projects={projects} selectedId={selectedId} onSelect={setSelectedId} loading={loading} hasMore={hasMore} onLoadMore={() => setPage(page + 1)} total={total} />
            </div>
          </div>

          <div className="col-span-12 md:col-span-6 overflow-hidden">
            <ProjectMap projects={projects} selectedId={selectedId} onSelect={setSelectedId} activeLayers={activeLayers} onToggleLayer={(layer) => {
              const next = new Set(activeLayers);
              next.has(layer) ? next.delete(layer) : next.add(layer);
              setActiveLayers(next);
            }} />
          </div>

          <div className="col-span-12 md:col-span-3 flex flex-col gap-2 overflow-hidden">
            <div className="flex bg-white rounded-lg border border-gray-200 p-0.5">
              <button onClick={() => setRightPanel('details')} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md ${rightPanel === 'details' ? 'bg-primary-600 text-white' : 'text-gray-600'}`}>
                <Activity className="h-3 w-3" /> Détails
              </button>
              <button onClick={() => setRightPanel('alerts')} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md ${rightPanel === 'alerts' ? 'bg-primary-600 text-white' : 'text-gray-600'}`}>
                <Bell className="h-3 w-3" /> Alertes
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {rightPanel === 'details'
                ? (
                  <ProjectDetails
                    project={selectedDetail}
                    loading={detailLoading}
                    analysisCompare={analysisCompare}
                    analysisCompareLoading={analysisCompareLoading}
                    analysisCompareError={analysisCompareError}
                    onCompareAnalysis={handleCompareAnalysis}
                    onCreateLeadFromContact={handleCreateLeadFromContact}
                    onCreateLeadsFromProject={handleCreateLeadsFromProject}
                    createLeadsFromProjectLoading={createLeadsLoading}
                  />
                )
                : <AlertsPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
