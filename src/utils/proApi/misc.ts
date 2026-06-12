import supabase from '../supabaseClient';
import { getClientEquipment } from './equipment';
import { getUserMachines } from './machines';
import { getMaintenanceInterventions } from './maintenance';
import { getClientNotifications } from './notifications';
import { getClientOrders } from './orders';
import { getProClientProfile } from './profile';

// =====================================================
// FONCTIONS UTILITAIRES
// =====================================================

// Générer un QR code pour un équipement
export function generateQRCode(serialNumber: string): string {
  return `MINE-${serialNumber}-${Date.now()}`;
}

// Vérifier si l'utilisateur a un abonnement Pro actif
export async function hasActiveProSubscription(): Promise<boolean> {
  try {
    const profile = await getProClientProfile();
    return profile?.subscription_status === 'active';
  } catch (error) {
    return false;
  }
}

// Récupérer les statistiques du portail
export async function getPortalStats() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté');

    console.log('🔄 Calcul des statistiques Pro pour l\'utilisateur:', user.id);

    const [equipment, userMachines, orders, interventions, notifications] = await Promise.all([
      getClientEquipment(),
      getUserMachines(),
      getClientOrders(),
      getMaintenanceInterventions(),
      getClientNotifications()
    ]);

    // Calculer des statistiques avancées avec données réelles
    const totalEquipment = equipment.length + userMachines.length;
    const activeEquipment = equipment.filter(e => e.status === 'active').length + userMachines.length;
    const maintenanceEquipment = equipment.filter(e => e.status === 'maintenance').length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    const confirmedOrders = orders.filter(o => o.status === 'confirmed').length;
    const upcomingInterventions = interventions.filter(i => 
      i.status === 'scheduled' && new Date(i.scheduled_date) > new Date()
    ).length;
    const inProgressInterventions = interventions.filter(i => i.status === 'in_progress').length;
    const unreadNotifications = notifications.filter(n => !n.is_read).length;
    const urgentNotifications = notifications.filter(n => n.priority === 'urgent' && !n.is_read).length;

    // Calculer le taux d'utilisation des équipements
    const totalHours = equipment.reduce((sum, e) => sum + e.total_hours, 0);
    const averageHours = totalEquipment > 0 ? Math.round(totalHours / totalEquipment) : 0;

    // Calculer le montant total des commandes
    const totalOrderAmount = orders
      .filter(o => o.total_amount)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    // Calculer le coût total des interventions
    const totalInterventionCost = interventions
      .filter(i => i.cost)
      .reduce((sum, i) => sum + (i.cost || 0), 0);

    // Calculer les équipements ajoutés ce mois
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const createdAtMs = (v: unknown) => {
      if (v == null) return NaN;
      if (typeof v === 'string' || typeof v === 'number') return new Date(v).getTime();
      if (v instanceof Date) return v.getTime();
      return NaN;
    };
    const equipmentThisMonth = equipment.filter(
      (e) => createdAtMs(e.created_at) >= monthStart.getTime(),
    ).length;
    const machinesThisMonth = userMachines.filter(
      (m) => createdAtMs(m.created_at) >= monthStart.getTime(),
    ).length;
    const totalThisMonth = equipmentThisMonth + machinesThisMonth;

    const stats = {
      totalEquipment,
      activeEquipment,
      maintenanceEquipment,
      pendingOrders,
      confirmedOrders,
      upcomingInterventions,
      inProgressInterventions,
      unreadNotifications,
      urgentNotifications,
      averageHours,
      totalOrderAmount,
      totalInterventionCost,
      equipmentUtilizationRate: totalEquipment > 0 ? Math.round((activeEquipment / totalEquipment) * 100) : 0,
      equipmentThisMonth: totalThisMonth,
      userMachines: userMachines.length,
      proEquipment: equipment.length
    };

    console.log('✅ Statistiques Pro calculées avec données réelles:', stats);
    return stats;
  } catch (error) {
    console.error('❌ Erreur lors du calcul des statistiques Pro:', error);
    return {
      totalEquipment: 0,
      activeEquipment: 0,
      maintenanceEquipment: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      upcomingInterventions: 0,
      inProgressInterventions: 0,
      unreadNotifications: 0,
      urgentNotifications: 0,
      averageHours: 0,
      totalOrderAmount: 0,
      totalInterventionCost: 0,
      equipmentUtilizationRate: 0,
      equipmentThisMonth: 0,
      userMachines: 0,
      proEquipment: 0
    };
  }
}
