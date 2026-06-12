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

// Fonction utilitaire pour les appels API
export const apiCall = async (method: string, endpoint: string, data?: any): Promise<any> => {
  try {
    console.log(`🔄 API Call: ${method} ${endpoint}`, data);
    
    // Client-only stubs : les endpoints listés retournent un succès simulé (pas de requête HTTP réelle).
    // À remplacer par fetch vers votre backend lorsque les routes seront disponibles.
    switch (endpoint) {
      case '/api/actions/start':
        return { success: true, message: 'Action démarrée' };
      case '/api/actions/complete':
        return { success: true, message: 'Action terminée' };
      case '/api/actions/reschedule':
        return { success: true, message: 'Action reprogrammée' };
      case '/api/actions/create':
        return { success: true, message: 'Action créée' };
      case '/api/actions/auto-followup':
        return { success: true, message: 'Relances automatiques programmées' };
      case '/api/actions/schedule':
        return { success: true, message: 'Actions planifiées' };
      case '/api/actions/ai-report':
        return { success: true, data: { report: 'Rapport IA généré' } };
      case '/api/actions/sync-crm':
        return { success: true, message: 'CRM synchronisé' };
      case '/api/actions/optimize-schedule':
        return { success: true, message: 'Planning optimisé' };
      case '/api/equipment/boost':
        return { success: true, message: 'Équipement boosté' };
      case '/api/equipment/add-photo':
        return { success: true, message: 'Photo ajoutée' };
      case '/api/equipment/create-offer':
        return { success: true, message: 'Offre flash créée' };
      case '/api/equipment/send-promotion':
        return { success: true, message: 'Promotion envoyée' };
      case '/api/equipment/analyze':
        return { success: true, message: 'Analyse effectuée' };
      case '/api/equipment/optimize-pricing':
        return { success: true, message: 'Prix optimisé' };
      case '/api/pipeline/add-lead':
        return { success: true, message: 'Lead ajouté' };
      case '/api/pipeline/export':
        return { success: true, message: 'Pipeline exporté' };
      case '/api/pipeline/followup':
        return { success: true, message: 'Suivi envoyé' };
      case '/api/pipeline/meeting':
        return { success: true, message: 'Rendez-vous programmé' };
      case '/api/pipeline/report':
        return { success: true, message: 'Rapport généré' };
      case '/api/pipeline/relance':
        return { success: true, message: 'Relance automatique activée' };
      case '/api/pipeline/analyse':
        return { success: true, message: 'Analyse de performance effectuée' };
      case '/api/pipeline/optimisation':
        return { success: true, message: 'Optimisation IA appliquée' };
      default:
        return { success: true, message: 'Action effectuée avec succès' };
    }
  } catch (error) {
    console.error('❌ Erreur API:', error);
    throw error;
  }
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

// Fonction pour envoyer des messages (SMS, Email, etc.)
export const sendMessage = async (type: 'SMS' | 'EMAIL' | 'TEAM', recipient: string, content: string) => {
  try {
    console.log(`📤 Envoi ${type} à ${recipient}: ${content}`);
    
    // Simulation de l'envoi
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return { success: true, message: `${type} envoyé avec succès` };
  } catch (error) {
    console.error('❌ Erreur envoi message:', error);
    throw error;
  }
};

// Fonction pour exporter des données
export const exportData = async (data: any, filename: string, format: 'excel' | 'pdf' | 'csv') => {
  try {
    console.log(`📊 Export ${format}: ${filename}`, data);
    
    // Simulation de l'export
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Créer un lien de téléchargement simulé
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return { success: true, message: `Export ${format} réussi` };
  } catch (error) {
    console.error('❌ Erreur export:', error);
    throw error;
  }
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