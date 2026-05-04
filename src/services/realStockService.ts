import { supabaseClient } from '../utils/supabaseClient';
import { PROMOTIONS_COLUMNS, STOCK_INSIGHTS_COLUMNS } from '../constants/pipelineQueryFields';

// Types pour les équipements réels
export interface RealEquipment {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  photos: string[];
  seller_id: string;
  status: 'available' | 'sold' | 'reserved';
  days_in_stock: number;
  views_count: number;
  clicks_count: number;
  contacts_count: number;
  visibility_score: number;
  created_at: string;
  updated_at: string;
}

// Types pour les promotions réelles
export interface RealPromotion {
  id: string;
  title: string;
  description: string;
  discount_percentage: number;
  start_date: string;
  end_date: string;
  equipment_ids: string[];
  status: 'active' | 'inactive' | 'expired';
  seller_id: string;
  created_at: string;
}

// Types pour les insights de stock
export interface StockInsight {
  id: string;
  equipment_id: string;
  insight_type: 'performance' | 'optimization' | 'alert';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  action_required: boolean;
  action_description?: string;
  data: any;
  created_at: string;
}

// Service pour le stock réel
export class RealStockService {
  private static isMissingTableError(error: unknown): boolean {
    const e = error as { code?: string; message?: string } | null;
    const msg = (e?.message || '').toLowerCase();
    return e?.code === 'PGRST205' || msg.includes("could not find the table 'public.");
  }

  // ===== ÉQUIPEMENTS =====
  
  /**
   * Récupérer tous les équipements du vendeur
   */
  static async getSellerEquipments(): Promise<RealEquipment[]> {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const { data, error } = await supabaseClient
        .from('machines')
        .select(`
          id,
          name,
          category,
          price,
          description,
          photos,
          sellerid,
          status,
          created_at,
          updated_at
        `)
        .eq('sellerid', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculer les métriques pour chaque équipement
      const equipmentsWithMetrics = await Promise.all(
        (data || []).map(async (machine) => {
          const metrics = await this.calculateEquipmentMetrics(machine.id);
          return {
            ...machine,
            days_in_stock: metrics.daysInStock,
            views_count: metrics.viewsCount,
            clicks_count: metrics.clicksCount,
            contacts_count: metrics.contactsCount,
            visibility_score: metrics.visibilityScore
          };
        })
      );

      return equipmentsWithMetrics;
    } catch (error) {
      if (!this.isMissingTableError(error)) {
        console.error('Erreur récupération équipements:', error);
      }
      return [];
    }
  }

  /**
   * Calculer les métriques d'un équipement
   */
  static async calculateEquipmentMetrics(machineId: string): Promise<{
    daysInStock: number;
    viewsCount: number;
    clicksCount: number;
    contactsCount: number;
    visibilityScore: number;
  }> {
    try {
      // Calculer les jours en stock
      const { data: machine } = await supabaseClient
        .from('machines')
        .select('created_at')
        .eq('id', machineId)
        .single();

      const daysInStock = machine ? 
        Math.floor((Date.now() - new Date(machine.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;

      // Compter les vues
      const { count: viewsCount } = await supabaseClient
        .from('machine_views')
        .select('id', { count: 'exact', head: true })
        .eq('machine_id', machineId);

      // Compter les clics (simulé pour l'instant)
      const clicksCount = Math.floor((viewsCount || 0) * 0.15);

      // Compter les contacts (messages + offres)
      const { count: messagesCount } = await supabaseClient
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('machine_id', machineId);

      const { count: offersCount } = await supabaseClient
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .eq('machine_id', machineId);

      const contactsCount = (messagesCount || 0) + (offersCount || 0);

      // Calculer le score de visibilité
      const visibilityScore = Math.min(100, Math.max(0, 
        ((viewsCount || 0) * 0.4) + 
        ((clicksCount || 0) * 0.3) + 
        ((contactsCount || 0) * 0.3)
      ));

      return {
        daysInStock,
        viewsCount: viewsCount || 0,
        clicksCount,
        contactsCount,
        visibilityScore: Math.round(visibilityScore)
      };
    } catch (error) {
      if (!this.isMissingTableError(error)) {
        console.error('Erreur calcul métriques:', error);
      }
      return {
        daysInStock: 0,
        viewsCount: 0,
        clicksCount: 0,
        contactsCount: 0,
        visibilityScore: 0
      };
    }
  }

  /**
   * Mettre à jour un équipement
   */
  static async updateEquipment(equipmentId: string, updates: Partial<RealEquipment>): Promise<RealEquipment | null> {
    try {
      const { data, error } = await supabaseClient
        .from('machines')
        .update(updates)
        .eq('id', equipmentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur mise à jour équipement:', error);
      return null;
    }
  }

  // ===== PROMOTIONS =====

  /**
   * Récupérer les promotions du vendeur
   */
  static async getSellerPromotions(): Promise<RealPromotion[]> {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const { data, error } = await supabaseClient
        .from('promotions')
        .select(PROMOTIONS_COLUMNS)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      if (!this.isMissingTableError(error)) {
        console.error('Erreur récupération promotions:', error);
      }
      return [];
    }
  }

  /**
   * Créer une nouvelle promotion
   */
  static async createPromotion(promotionData: Partial<RealPromotion>): Promise<RealPromotion | null> {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const { data, error } = await supabaseClient
        .from('promotions')
        .insert([{ ...promotionData, seller_id: user.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur création promotion:', error);
      return null;
    }
  }

  // ===== INSIGHTS =====

  /**
   * Récupérer les insights de stock
   */
  static async getStockInsights(): Promise<StockInsight[]> {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const { data, error } = await supabaseClient
        .from('stock_insights')
        .select(STOCK_INSIGHTS_COLUMNS)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      if (!this.isMissingTableError(error)) {
        console.error('Erreur récupération insights:', error);
      }
      return [];
    }
  }

  /**
   * Générer des insights automatiques
   */
  static async generateAutomaticInsights(): Promise<number> {
    try {
      const equipments = await this.getSellerEquipments();
      let createdCount = 0;

      for (const equipment of equipments) {
        // Insight 1: Équipement en stock depuis longtemps
        if (equipment.days_in_stock > 90) {
          const insight = {
            equipment_id: equipment.id,
            insight_type: 'alert' as const,
            title: 'Équipement en stock depuis longtemps',
            description: `${equipment.name} est en stock depuis ${equipment.days_in_stock} jours`,
            priority: 'high' as const,
            action_required: true,
            action_description: 'Créer une offre flash ou réduire le prix',
            data: { daysInStock: equipment.days_in_stock, equipmentName: equipment.name }
          };

          const newInsight = await this.createStockInsight(insight);
          if (newInsight) createdCount++;
        }

        // Insight 2: Faible visibilité
        if (equipment.visibility_score < 50) {
          const insight = {
            equipment_id: equipment.id,
            insight_type: 'optimization' as const,
            title: 'Faible visibilité',
            description: `${equipment.name} a un score de visibilité de ${equipment.visibility_score}%`,
            priority: 'medium' as const,
            action_required: true,
            action_description: 'Ajouter plus de photos et optimiser la description',
            data: { visibilityScore: equipment.visibility_score, equipmentName: equipment.name }
          };

          const newInsight = await this.createStockInsight(insight);
          if (newInsight) createdCount++;
        }

        // Insight 3: Performance excellente
        if (equipment.visibility_score > 80 && equipment.contacts_count > 5) {
          const insight = {
            equipment_id: equipment.id,
            insight_type: 'performance' as const,
            title: 'Performance excellente',
            description: `${equipment.name} génère beaucoup d'intérêt`,
            priority: 'low' as const,
            action_required: false,
            data: { 
              visibilityScore: equipment.visibility_score, 
              contactsCount: equipment.contacts_count,
              equipmentName: equipment.name 
            }
          };

          const newInsight = await this.createStockInsight(insight);
          if (newInsight) createdCount++;
        }
      }

      return createdCount;
    } catch (error) {
      console.error('Erreur génération insights:', error);
      return 0;
    }
  }

  /**
   * Créer un insight
   */
  static async createStockInsight(insightData: Partial<StockInsight>): Promise<StockInsight | null> {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const { data, error } = await supabaseClient
        .from('stock_insights')
        .insert([{ ...insightData, seller_id: user.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur création insight:', error);
      return null;
    }
  }

  // ===== ACTIONS =====

  /**
   * Booster un équipement
   */
  static async boostEquipment(equipmentId: string): Promise<boolean> {
    try {
      // Marquer l'équipement comme boosté
      const { error } = await supabaseClient
        .from('machines')
        .update({ boosted: true, boosted_at: new Date().toISOString() })
        .eq('id', equipmentId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Erreur boost équipement:', error);
      return false;
    }
  }

  /**
   * Ajouter une photo à un équipement
   */
  static async addPhotoToEquipment(equipmentId: string, photoUrl: string): Promise<boolean> {
    try {
      // Récupérer les photos actuelles
      const { data: equipment } = await supabaseClient
        .from('machines')
        .select('photos')
        .eq('id', equipmentId)
        .single();

      const currentPhotos = equipment?.photos || [];
      const updatedPhotos = [...currentPhotos, photoUrl];

      // Mettre à jour les photos
      const { error } = await supabaseClient
        .from('machines')
        .update({ photos: updatedPhotos })
        .eq('id', equipmentId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Erreur ajout photo:', error);
      return false;
    }
  }

  /**
   * Créer une offre flash
   */
  static async createFlashOffer(equipmentId: string, discountPercentage: number): Promise<RealPromotion | null> {
    try {
      const promotionData = {
        title: 'Offre Flash',
        description: `Réduction de ${discountPercentage}% pour une durée limitée`,
        discount_percentage: discountPercentage,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 jours
        equipment_ids: [equipmentId],
        status: 'active' as const
      };

      return await this.createPromotion(promotionData);
    } catch (error) {
      console.error('Erreur création offre flash:', error);
      return null;
    }
  }

  /**
   * Analyser la performance d'un équipement
   */
  static async analyzeEquipmentPerformance(equipmentId: string): Promise<any> {
    try {
      const metrics = await this.calculateEquipmentMetrics(equipmentId);
      
      // Générer des recommandations basées sur les métriques
      const recommendations = [];
      
      if (metrics.visibilityScore < 50) {
        recommendations.push('Ajouter plus de photos pour améliorer la visibilité');
      }
      
      if (metrics.daysInStock > 60) {
        recommendations.push('Considérer une réduction de prix pour accélérer la vente');
      }
      
      if (metrics.contactsCount === 0) {
        recommendations.push('Améliorer la description et les mots-clés');
      }

      return {
        metrics,
        recommendations,
        score: metrics.visibilityScore,
        status: metrics.visibilityScore > 70 ? 'excellent' : 
                metrics.visibilityScore > 50 ? 'bon' : 'à améliorer'
      };
    } catch (error) {
      console.error('Erreur analyse performance:', error);
      return null;
    }
  }

  // ===== STATISTIQUES =====

  /**
   * Obtenir les statistiques de stock
   */
  static async getStockStats(): Promise<{
    totalEquipments: number;
    totalValue: number;
    avgDaysInStock: number;
    avgVisibilityScore: number;
    equipmentsByCategory: Record<string, number>;
    equipmentsByStatus: Record<string, number>;
  }> {
    try {
      const equipments = await this.getSellerEquipments();
      
      const totalValue = equipments.reduce((sum, eq) => sum + (eq.price || 0), 0);
      const avgDaysInStock = equipments.length > 0 ? 
        equipments.reduce((sum, eq) => sum + eq.days_in_stock, 0) / equipments.length : 0;
      const avgVisibilityScore = equipments.length > 0 ? 
        equipments.reduce((sum, eq) => sum + eq.visibility_score, 0) / equipments.length : 0;

      const equipmentsByCategory = equipments.reduce((acc, eq) => {
        acc[eq.category] = (acc[eq.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const equipmentsByStatus = equipments.reduce((acc, eq) => {
        acc[eq.status] = (acc[eq.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalEquipments: equipments.length,
        totalValue,
        avgDaysInStock: Math.round(avgDaysInStock),
        avgVisibilityScore: Math.round(avgVisibilityScore),
        equipmentsByCategory,
        equipmentsByStatus
      };
    } catch (error) {
      console.error('Erreur calcul statistiques:', error);
      return {
        totalEquipments: 0,
        totalValue: 0,
        avgDaysInStock: 0,
        avgVisibilityScore: 0,
        equipmentsByCategory: {},
        equipmentsByStatus: {}
      };
    }
  }
} 