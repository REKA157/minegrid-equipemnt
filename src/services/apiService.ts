import { supabaseClient } from '../utils/supabaseClient';
import {
  API_SERVICE_ACTION_COLUMNS,
  API_SERVICE_EQUIPMENT_COLUMNS,
  API_SERVICE_LEAD_COLUMNS,
} from '../constants/apiServiceQueryFields';

// Types pour les données
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface Action {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'call' | 'email' | 'meeting' | 'follow-up' | 'quote' | 'proposal';
  dueTime: string;
  status: 'pending' | 'in-progress' | 'completed';
  contact?: {
    name: string;
    company: string;
    phone?: string;
    email?: string;
  };
  value?: number;
  aiRecommendation?: string;
  estimatedDuration: number;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  title: string;
  stage: 'Prospection' | 'Qualification' | 'Proposition' | 'Négociation' | 'Conclu' | 'Perdu';
  priority: 'high' | 'medium' | 'low';
  value: number;
  probability: number;
  nextAction: string;
  assignedTo: string;
  lastContact: string;
  notes: string;
  contact: {
    name: string;
    company: string;
    phone?: string;
    email?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: string;
  price: number;
  daysInStock: number;
  photos: string[];
  boosted: boolean;
  description: string;
  status: 'available' | 'sold' | 'reserved';
  createdAt: string;
  updatedAt: string;
}

export interface Promotion {
  id: string;
  title: string;
  description: string;
  discount: number;
  startDate: string;
  endDate: string;
  equipmentIds: string[];
  status: 'active' | 'inactive' | 'expired';
  createdAt: string;
}

export interface ApiActionResult {
  success: boolean;
  /** true quand l'action n'a pas de backend câblé (à griser/desactiver côté UI). */
  notImplemented?: boolean;
  message: string;
  data?: unknown;
}

// Fonction utilitaire pour les appels d'action de dashboard.
//
// SÉCURITÉ / HONNÊTETÉ PRODUIT : ces actions (sync CRM, boost, relances, exports…)
// n'ont AUCUN backend câblé. L'ancienne implémentation renvoyait un succès simulé,
// ce qui trompait l'utilisateur (rien n'était réellement exécuté). On renvoie
// désormais un échec explicite « non disponible » : l'UI doit griser le bouton ou
// afficher un message honnête plutôt que prétendre que l'action a réussi.
export const apiCall = async (
  _method: string,
  _endpoint: string,
  _data?: unknown,
): Promise<ApiActionResult> => {
  return {
    success: false,
    notImplemented: true,
    message: "Cette action n'est pas encore disponible (fonctionnalité en cours d'intégration).",
  };
};

// Fonction pour afficher les notifications
export const showNotification = (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
  console.log(`📢 Notification [${type}]: ${message}`);
  
  // Créer un événement personnalisé pour les notifications
  const event = new CustomEvent('showNotification', {
    detail: { type, message }
  });
  window.dispatchEvent(event);
};

// Envoi de messages (SMS, Email, Team). Aucun fournisseur n'est câblé côté client :
// on ne simule plus un envoi réussi (l'utilisateur croyait relancer un client).
export const sendMessage = async (
  type: 'SMS' | 'EMAIL' | 'TEAM',
  _recipient: string,
  _content: string,
): Promise<ApiActionResult> => {
  return {
    success: false,
    notImplemented: true,
    message: `L'envoi ${type} n'est pas encore disponible.`,
  };
};

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.keys(row || {}).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape((row || {})[h])).join(','));
  return lines.join('\n');
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export honnête : CSV réel pour les données tabulaires. On ne renomme plus du JSON
// en « .excel » / « .pdf » (ce qui produisait un fichier illisible). Excel/PDF ne
// sont pas encore implémentés et le signalent explicitement.
export const exportData = async (
  data: unknown,
  filename: string,
  format: 'excel' | 'pdf' | 'csv',
): Promise<ApiActionResult> => {
  if (format === 'csv' && Array.isArray(data)) {
    triggerDownload(toCsv(data as Array<Record<string, unknown>>), `${filename}.csv`, 'text/csv;charset=utf-8;');
    return { success: true, message: 'Export CSV réussi' };
  }
  return {
    success: false,
    notImplemented: true,
    message: `L'export ${format.toUpperCase()} n'est pas encore disponible.`,
  };
};

// Service API unifié
class ApiService {
  // ===== ACTIONS =====
  async getActions(): Promise<ApiResponse<Action[]>> {
    try {
      const { data, error } = await supabaseClient
        .from('actions')
        .select(API_SERVICE_ACTION_COLUMNS)
        .order('dueTime', { ascending: true });

      if (error) throw error;

      return {
        data: data || [],
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de la récupération des actions',
        success: false
      };
    }
  }

  async createAction(action: Omit<Action, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Action>> {
    try {
      const { data, error } = await supabaseClient
        .from('actions')
        .insert([action])
        .select()
        .single();

      if (error) throw error;

      return {
        data,
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de la création de l\'action',
        success: false
      };
    }
  }

  async updateAction(id: string, updates: Partial<Action>): Promise<ApiResponse<Action>> {
    try {
      const { data, error } = await supabaseClient
        .from('actions')
        .update({ ...updates, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return {
        data,
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de la mise à jour de l\'action',
        success: false
      };
    }
  }

  async deleteAction(id: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await supabaseClient
        .from('actions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return {
        data: true,
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: false,
        error: error instanceof Error ? error.message : 'Erreur lors de la suppression de l\'action',
        success: false
      };
    }
  }

  // ===== LEADS =====
  async getLeads(): Promise<ApiResponse<Lead[]>> {
    try {
      const { data, error } = await supabaseClient
        .from('leads')
        .select(API_SERVICE_LEAD_COLUMNS)
        .order('createdAt', { ascending: false });

      if (error) throw error;

      return {
        data: data || [],
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de la récupération des leads',
        success: false
      };
    }
  }

  async createLead(lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Lead>> {
    try {
      const { data, error } = await supabaseClient
        .from('leads')
        .insert([lead])
        .select()
        .single();

      if (error) throw error;

      return {
        data,
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de la création du lead',
        success: false
      };
    }
  }

  async updateLead(id: string, updates: Partial<Lead>): Promise<ApiResponse<Lead>> {
    try {
      const { data, error } = await supabaseClient
        .from('leads')
        .update({ ...updates, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return {
        data,
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de la mise à jour du lead',
        success: false
      };
    }
  }

  // ===== EQUIPMENTS =====
  async getEquipments(): Promise<ApiResponse<Equipment[]>> {
    try {
      const { data, error } = await supabaseClient
        .from('equipments')
        .select(API_SERVICE_EQUIPMENT_COLUMNS)
        .order('createdAt', { ascending: false });

      if (error) throw error;

      return {
        data: data || [],
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de la récupération des équipements',
        success: false
      };
    }
  }

  async updateEquipment(id: string, updates: Partial<Equipment>): Promise<ApiResponse<Equipment>> {
    try {
      const { data, error } = await supabaseClient
        .from('equipments')
        .update({ ...updates, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return {
        data,
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de la mise à jour de l\'équipement',
        success: false
      };
    }
  }

  // ===== PROMOTIONS =====
  async createPromotion(promotion: Omit<Promotion, 'id' | 'createdAt'>): Promise<ApiResponse<Promotion>> {
    try {
      const { data, error } = await supabaseClient
        .from('promotions')
        .insert([promotion])
        .select()
        .single();

      if (error) throw error;

      return {
        data,
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de la création de la promotion',
        success: false
      };
    }
  }

  // ===== UTILITAIRES =====
  async uploadImage(file: File, path: string): Promise<ApiResponse<string>> {
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const { data, error } = await supabaseClient.storage
        .from('images')
        .upload(`${path}/${fileName}`, file);

      if (error) throw error;

      const { data: urlData } = supabaseClient.storage
        .from('images')
        .getPublicUrl(`${path}/${fileName}`);

      return {
        data: urlData.publicUrl,
        error: null,
        success: true
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Erreur lors de l\'upload de l\'image',
        success: false
      };
    }
  }
}

export const apiService = new ApiService(); 