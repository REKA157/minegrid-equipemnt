export interface MonitorProject {
  id: string;
  title: string;
  type: string | null;
  phase: string | null;
  country: string | null;
  region: string | null;
  lat: number | null;
  lon: number | null;
  budget_usd: number | null;
  start_date: string | null;
  end_date: string | null;
  source: string | null;
  source_url: string | null;
  fingerprint: string;
  confidence: number | null;
  updated_at: string | null;
}

export interface ProjectDocument {
  id: string;
  title: string | null;
  url: string | null;
  doc_type: string | null;
  created_at: string;
}

export interface ProjectEntity {
  id: string;
  name: string | null;
  role: string | null;
  created_at: string;
}

export interface EquipmentNeed {
  id: string;
  category: string | null;
  qty_min: number | null;
  qty_max: number | null;
  confidence: number | null;
  rationale: string | null;
  created_at: string;
  /** Aligné sur `categories.ts` : nom de secteur pour `#machines?machine=…` (identique au menu Machines). */
  marketplace_category_name?: string | null;
  /** Sous-type catalogue (`sub.id`, ex. `pelle-chenilles`). */
  marketplace_subcategory_id?: string | null;
  /** Libellé catalogue affiché à la place du slug monitor. */
  marketplace_label?: string | null;
}

export interface ProjectContact {
  id: string;
  /** Rattachement projet monitor (flux interne, ex. fallback Kanban) */
  project_id?: string;
  organization: string | null;
  person_name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  confidence: number | null;
  rationale: string | null;
  created_at: string;
}

export interface MonitorProjectDetail extends MonitorProject {
  documents: ProjectDocument[];
  entities: ProjectEntity[];
  contacts: ProjectContact[];
  equipment_needs: EquipmentNeed[];
}

export interface ProjectListResponse {
  items: MonitorProject[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProjectFilters {
  country?: string;
  type?: string;
  phase?: string;
  source_kind?: 'public' | 'mdb';
  search?: string;
}

export type ProjectType = 'mine' | 'road' | 'port' | 'rail' | 'dam' | 'industrial_zone' | 'energy' | 'btp' | 'infrastructure';
export type ProjectPhase = 'study' | 'financing' | 'tender' | 'construction' | 'ops';

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  mine: 'Mine',
  road: 'Route',
  port: 'Port',
  rail: 'Rail',
  dam: 'Barrage',
  industrial_zone: 'Zone industrielle',
  energy: 'Énergie',
  btp: 'BTP',
  infrastructure: 'Infrastructure',
};

export const PROJECT_PHASE_LABELS: Record<string, string> = {
  study: 'Étude',
  financing: 'Financement',
  tender: 'Appel d\'offres',
  construction: 'Construction',
  ops: 'Opérationnel',
};

// ---------- Data Sources ----------

export interface DataSource {
  id: string;
  name: string;
  connector_type: string;
  url: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  last_run_at: string | null;
  stats: Record<string, unknown>;
  created_at: string;
}

export const CONNECTOR_LABELS: Record<string, string> = {
  wb_data360: 'World Bank Data360',
  ppi: 'PPI Database',
  ocds_feed: 'OCDS Feed',
  mascus: 'Mascus (Piloterr)',
  leboncoin: 'Leboncoin (Piloterr)',
  public_portals: "Portails publics d'appels d'offres",
  mdb_procurement: 'Banques de developpement (MDB)',
};

export const PROJECT_TYPE_COLORS: Record<string, string> = {
  mine: '#f59e0b',
  road: '#3b82f6',
  port: '#06b6d4',
  rail: '#8b5cf6',
  dam: '#0ea5e9',
  industrial_zone: '#f97316',
  energy: '#22c55e',
  btp: '#f97316',
  infrastructure: '#6b7280',
};
