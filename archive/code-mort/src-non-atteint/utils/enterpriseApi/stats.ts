import { INVENTORY_LIST_COLUMNS } from '../../constants/enterpriseApiQueryFields';
import supabase from '../supabaseClient';

// 🔧 STATISTIQUES GLOBALES
export const getMechanicStats = async () => {
  try {
    // Interventions du jour
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: todayInterventions } = await supabase
      .from('interventions')
      .select('status')
      .gte('scheduled_date', today.toISOString());

    // Réparations en cours
    const { data: activeRepairs } = await supabase
      .from('repairs')
      .select('status, estimated_cost')
      .not('status', 'eq', 'Terminé');

    // Stock critique
    const { data: criticalStock } = await supabase
      .from('inventory')
      .select(INVENTORY_LIST_COLUMNS)
      .lt('current_stock', 'minimum_stock');

    // Techniciens disponibles
    const { data: availableTechnicians } = await supabase
      .from('technicians')
      .select('availability_status')
      .eq('availability_status', 'Disponible');

    return {
      todayInterventions: todayInterventions?.length || 0,
      completedToday: todayInterventions?.filter((i: any) => i.status === 'Terminé').length || 0,
      activeRepairs: activeRepairs?.length || 0,
      totalRepairCost: activeRepairs?.reduce((sum: number, r: any) => sum + (r.estimated_cost || 0), 0) || 0,
      criticalStockItems: criticalStock?.length || 0,
      availableTechnicians: availableTechnicians?.length || 0
    };
  } catch (error) {
    console.error('Erreur lors du chargement des statistiques:', error);
    return {
      todayInterventions: 0,
      completedToday: 0,
      activeRepairs: 0,
      totalRepairCost: 0,
      criticalStockItems: 0,
      availableTechnicians: 0
    };
  }
};
