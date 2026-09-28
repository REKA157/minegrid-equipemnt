// Interfaces partagees par les fonctions API Pro.
// Regroupees ici pour permettre aux consommateurs d'importer uniquement les
// types (compilable sans pulling tout le module proApi).

export interface ProClient {
  id: string;
  user_id: string;
  company_name: string;
  siret?: string;
  address?: string;
  phone?: string;
  contact_person?: string;
  email?: string;
  subscription_type: 'pro' | 'premium' | 'enterprise';
  subscription_status: 'active' | 'inactive' | 'suspended';
  subscription_start: string;
  subscription_end?: string;
  max_users: number;
  created_at: string;
  updated_at: string;
}

export interface ClientEquipment {
  id: string;
  client_id: string;
  serial_number: string;
  qr_code: string;
  equipment_type: string;
  brand?: string;
  model?: string;
  year?: number;
  location?: string;
  status: 'active' | 'maintenance' | 'inactive' | 'sold';
  purchase_date?: string;
  warranty_end?: string;
  last_maintenance?: string;
  next_maintenance?: string;
  total_hours: number;
  fuel_consumption?: number;
  description?: string;
  notes?: string;
  price?: number;
  images?: string[];
  created_at: string;
  updated_at: string;
}

export interface ClientOrder {
  id: string;
  client_id: string;
  order_number: string;
  order_type: 'purchase' | 'rental' | 'maintenance' | 'import';
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  total_amount?: number;
  currency: string;
  order_date: string;
  // Colonnes nullables en base : le formulaire envoie null quand le champ est vide
  expected_delivery?: string | null;
  actual_delivery?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TechnicalDocument {
  id: string;
  client_id: string;
  equipment_id?: string;
  document_type: 'manual' | 'certificate' | 'warranty' | 'invoice' | 'maintenance_report';
  title: string;
  file_path: string;
  file_size?: number;
  mime_type?: string;
  is_public: boolean;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceIntervention {
  id: string;
  client_id: string;
  // null pour une intervention générale non rattachée à un équipement
  equipment_id: string | null;
  intervention_type: 'preventive' | 'corrective' | 'emergency' | 'inspection';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  description?: string;
  scheduled_date: string;
  actual_date?: string;
  duration_hours?: number;
  technician_name?: string;
  cost?: number;
  parts_used?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EquipmentDiagnostic {
  id: string;
  equipment_id: string;
  diagnostic_date: string;
  diagnostic_type?: string;
  status?: 'good' | 'warning' | 'critical' | 'failed';
  readings?: any;
  recommendations?: string;
  next_diagnostic_date?: string;
  created_at: string;
}

export interface ClientUser {
  id: string;
  client_id: string;
  user_id: string;
  role: 'admin' | 'manager' | 'technician' | 'viewer';
  permissions: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientNotification {
  id: string;
  client_id: string;
  user_id: string;
  type: 'maintenance_due' | 'order_update' | 'diagnostic_alert' | 'warranty_expiry';
  title: string;
  message: string;
  is_read: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  related_entity_type?: string;
  related_entity_id?: string;
  created_at: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  role: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  expires_at: string;
  accepted_at?: string;
  accepted_by?: string;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  notifications: {
    email: boolean;
    push: boolean;
    maintenance: boolean;
    orders: boolean;
    security: boolean;
  };
  security: {
    twoFactor: boolean;
    sessionTimeout: number;
    passwordExpiry: number;
    loginAttempts: number;
  };
  created_at: string;
  updated_at: string;
}
