// Interfaces internes utilisees par src/utils/api.ts.
// Extraites pour reduire la taille du module principal.

export interface RegisterData {
  email: string;
  password: string;
  accountType: 'client' | 'seller';
  firstName: string;
  lastName: string;
  phone: string;
  company?: string;
  website?: string;
  address?: string;
  businessType?: string;
  licenseNumber?: string;
}

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  address: string;
  profile_picture?: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  language: string;
  currency: string;
  timezone: string;
  date_format: string;
  dark_mode: boolean;
  animations: boolean;
  font_size: string;
  high_contrast: boolean;
  email_notifications: {
    views: boolean;
    messages: boolean;
    offers: boolean;
    expired: boolean;
    newsletter: boolean;
  };
  notification_frequency: 'immediate' | 'daily' | 'weekly';
  notification_hours: {
    start: string;
    end: string;
  };
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'view' | 'message' | 'offer' | 'system' | 'premium';
  title: string;
  content: string;
  is_read: boolean;
  related_id?: string;
  created_at: string;
}

export interface PremiumService {
  id: string;
  user_id: string;
  service_type: 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'expired' | 'cancelled';
  start_date: string;
  end_date: string;
  features: string[];
  price: number;
  created_at: string;
}

export interface ServiceHistory {
  id: string;
  user_id: string;
  service_type: string;
  action: 'requested' | 'completed' | 'cancelled';
  description: string;
  created_at: string;
}

export interface MachineData {
  name: string;
  brand: string;
  model: string;
  category: string;
  year: number;
  price: string;
  condition: 'new' | 'used';
  description: string;
  specifications: {
    weight: string;
    dimensions: {
      length: string;
      width: string;
      height: string;
    };
    power: {
      value: string;
      unit: 'kW' | 'CV';
    };
    operatingCapacity: string;
    workingWeight?: string;
  };
  sellerId: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  machine_id?: string;
  subject: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
  receiver_name?: string;
}

export interface Offer {
  id: string;
  machine_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  buyer_name?: string;
  machine_name?: string;
}

export interface MachineView {
  id: string;
  machine_id: string;
  viewer_id?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface DashboardStats {
  totalViews: number;
  totalMessages: number;
  totalOffers: number;
  weeklyViews: number;
  monthlyViews: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
}

export interface SalesPerformanceData {
  score: number;
  target: number;
  rank: number;
  totalVendors: number;
  sales: number;
  salesTarget: number;
  growth: number;
  growthTarget: number;
  prospects: number;
  activeProspects: number;
  responseTime: number;
  responseTarget: number;
  activityLevel: string;
  activityRecommendation: string;
  recommendations: Array<{
    type: string;
    action: string;
    impact: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  trends: {
    sales: 'up' | 'down' | 'stable';
    growth: 'up' | 'down' | 'stable';
    prospects: 'up' | 'down' | 'stable';
    responseTime: 'up' | 'down' | 'stable';
  };
  metrics: {
    sales: { value: number; target: number; trend: 'up' | 'down' | 'stable' };
    growth: { value: number; target: number; trend: 'up' | 'down' | 'stable' };
    prospects: { value: number; target: number; trend: 'up' | 'down' | 'stable' };
    responseTime: { value: number; target: number; trend: 'up' | 'down' | 'stable' };
  };
  /** Score ventilé : catalogue + pipeline + couverture annonces (aligné widgets convergents) */
  convergent?: {
    engagementScore: number;
    pipelineScore: number;
    stockCoverageScore: number;
    pipelineOpen: number;
    pipelineWon: number;
    pipelineTotal: number;
    monitorLinkedLeads: number;
    staleOpenLeads: number;
  };
}
