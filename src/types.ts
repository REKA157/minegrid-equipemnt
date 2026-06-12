export type Equipment = {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  [key: string]: any; // permet des champs flexibles si nécessaire
};

export type PremiumFeature = 'featured' | 'enhanced-media' | 'rich-description' | 'statistics' | 'notifications' | 'support';

export interface PremiumPlan {
  id: string;
  name: string;
  price: number;
  duration: number; // en jours
  features: PremiumFeature[];
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'card' | 'mobile-money' | 'bank-transfer' | 'wallet' | 'crypto';
  icon: string;
  currencies: Currency[];
}

export interface Machine {
  
  id: string;
  name: string;
  brand: string;
  category: string;
  type?: string; 
  model: string;
  year: number;
  price: number;
  condition: 'new' | 'used';
  description: string;
  specifications: {
    weight: number;
    dimensions: string;
    power: {
      value: number;
      unit: 'kW' | 'CV';
    };
    operatingCapacity: number;
    workingWeight: number;
  };
  images: string[];
  videos?: string[];
  view360?: string;
  isPremium?: boolean;
  seller: {
    id: string;
    name: string;
    rating: number;
    location: string;
    /** Présent quand chargé depuis la table `users` (fiche machine) */
    email?: string;
  };
  statistics?: {
    views: number;
    contacts: number;
    favorites: number;
  };
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  count: number;
  subcategories?: {
    id: string;
    name: string;
    count: number;
  }[];
}

export interface Brand {
  id: string;
  name: string;
  logo: string;
  categories: string[];
}

export type Currency = 
  | 'EUR' 
  | 'USD' 
  | 'MAD'  // Moroccan Dirham
  | 'XOF'  // West African CFA Franc
  | 'XAF'  // Central African CFA Franc
  | 'NGN'  // Nigerian Naira
  | 'ZAR'  // South African Rand
  | 'EGP'  // Egyptian Pound
  | 'KES'  // Kenyan Shilling
  | 'GHS'; // Ghanaian Cedi

// Types pour les fonctionnalités premium
export interface PremiumFeatures {
  isBoosted: boolean;
  isHighlighted: boolean;
  isCertified: boolean;
  isUrgent: boolean;
  boostExpiry?: string;
  highlightExpiry?: string;
  certificationDate?: string;
  certificationId?: string;
}

export interface MachineWithPremium extends Machine {
  premium?: PremiumFeatures;
}

export interface BoostOptions {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number; // en jours
  features: string[];
}

export interface CertificationRequest {
  id: string;
  machineId: string;
  userId: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  requestedDate: string;
  scheduledDate?: string;
  completedDate?: string;
  inspectorNotes?: string;
  certificateUrl?: string;
}

export interface FinancingSimulation {
  machinePrice: number;
  downPayment: number;
  loanAmount: number;
  duration: number; // en mois
  interestRate: number;
  monthlyPayment: number;
  totalCost: number;
  partner: string;
}

export interface FinancingPartner {
  id: string;
  name: string;
  logo: string;
  minAmount: number;
  maxAmount: number;
  minDuration: number;
  maxDuration: number;
  baseRate: number;
  description: string;
}