import { CLIENT_NOTIFICATION_COLUMNS } from '../../constants/proClientQueryFields';
import type { ClientNotification } from './types';
import supabase from '../supabaseClient';
import { getProClientProfile } from './profile';

// =====================================================
// FONCTIONS API NOTIFICATIONS
// =====================================================

// Récupérer les notifications du client
export async function getClientNotifications(): Promise<ClientNotification[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté');

    console.log('🔄 Récupération des notifications Pro pour l\'utilisateur:', user.id);

    // Récupérer le profil Pro pour obtenir le client_id
    const proProfile = await getProClientProfile();
    if (!proProfile) {
      // Pas de profil Pro : on ne fabrique RIEN.
      //
      // Ce bloc inserait auparavant des notifications de demonstration DANS LA BASE DE
      // PRODUCTION. Deux defauts, pas un :
      //
      //  1. les lignes etaient ecrites avec `client_id: proProfile?.id || user.id`,
      //     alors qu'on se trouve dans la branche `if (!proProfile)` : `proProfile`
      //     y vaut forcement null, donc `client_id` valait TOUJOURS `user.id`,
      //     l'identifiant du compte. Or la lecture, plus bas, filtre sur
      //     `proProfile.id`, l'identifiant de la fiche pro. Les lignes inserees
      //     n'etaient donc jamais relues : l'utilisateur les voyait une fois (le
      //     retour de l'insertion), puis plus jamais. Il restait des lignes
      //     orphelines en base a chaque visite.
      //  2. c'est une donnee inventee presentee comme reelle, ce que la regle du
      //     projet interdit explicitement.
      //
      // Un ecran vide qui dit la verite vaut mieux qu'un ecran rempli qui ment.
      return [];
    }

    // Récupérer les notifications du client
    const { data, error } = await supabase
      .from('client_notifications')
      .select(CLIENT_NOTIFICATION_COLUMNS)
      .eq('client_id', proProfile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    console.log('✅ Notifications Pro récupérées:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des notifications Pro:', error);
    return [];
  }
}

// Marquer une notification comme lue
export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('client_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur lors du marquage de la notification:', error);
    return false;
  }
}

// Créer une notification pour un client
export async function createClientNotification(
  notification: Partial<ClientNotification>
): Promise<ClientNotification | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté');

    // Récupérer le profil Pro pour obtenir le client_id
    const proProfile = await getProClientProfile();
    if (!proProfile) {
      console.error('Aucun profil Pro trouvé');
      return null;
    }

    // Préparer la notification avec les valeurs par défaut
    const newNotification: Partial<ClientNotification> = {
      client_id: proProfile.id,
      user_id: user.id,
      is_read: false,
      priority: 'normal',
      ...notification
    };

    const { data, error } = await supabase
      .from('client_notifications')
      .insert([newNotification])
      .select()
      .single();

    if (error) throw error;
    
    console.log('✅ Notification créée:', data);
    return data;
  } catch (error) {
    console.error('❌ Erreur lors de la création de la notification:', error);
    return null;
  }
}

// Créer une notification de maintenance
export async function createMaintenanceNotification(
  equipmentId: string,
  equipmentName: string,
  maintenanceDate: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
): Promise<ClientNotification | null> {
  return createClientNotification({
    type: 'maintenance_due',
    title: `Maintenance préventive - ${equipmentName}`,
    message: `La maintenance préventive de l'équipement ${equipmentName} est programmée pour le ${maintenanceDate}. Veuillez planifier l'intervention.`,
    priority,
    related_entity_type: 'equipment',
    related_entity_id: equipmentId
  });
}

// Créer une notification de commande
export async function createOrderNotification(
  orderId: string,
  orderNumber: string,
  status: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
): Promise<ClientNotification | null> {
  return createClientNotification({
    type: 'order_update',
    title: `Commande ${orderNumber} - ${status}`,
    message: `Votre commande ${orderNumber} a été mise à jour avec le statut: ${status}.`,
    priority,
    related_entity_type: 'order',
    related_entity_id: orderId
  });
}

// Créer une notification d'alerte diagnostic
export async function createDiagnosticAlertNotification(
  equipmentId: string,
  equipmentName: string,
  alertMessage: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'high'
): Promise<ClientNotification | null> {
  return createClientNotification({
    type: 'diagnostic_alert',
    title: `Alerte diagnostic - ${equipmentName}`,
    message: `Le diagnostic automatique a détecté: ${alertMessage}`,
    priority,
    related_entity_type: 'equipment',
    related_entity_id: equipmentId
  });
}

// Créer une notification d'expiration de garantie
export async function createWarrantyExpiryNotification(
  equipmentId: string,
  equipmentName: string,
  expiryDate: string,
  daysUntilExpiry: number,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
): Promise<ClientNotification | null> {
  const urgencyText = daysUntilExpiry <= 7 ? 'URGENT' : daysUntilExpiry <= 30 ? 'PROCHE' : 'INFORMATION';
  
  return createClientNotification({
    type: 'warranty_expiry',
    title: `Garantie ${urgencyText} - ${equipmentName}`,
    message: `La garantie de l'équipement ${equipmentName} expire le ${expiryDate} (dans ${daysUntilExpiry} jours).`,
    priority: daysUntilExpiry <= 7 ? 'urgent' : daysUntilExpiry <= 30 ? 'high' : priority,
    related_entity_type: 'equipment',
    related_entity_id: equipmentId
  });
}

// Supprimer une notification
export async function deleteClientNotification(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('client_notifications')
      .delete()
      .eq('id', notificationId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur lors de la suppression de la notification:', error);
    return false;
  }
}

// Supprimer toutes les notifications lues
export async function deleteReadNotifications(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('client_notifications')
      .delete()
      .eq('is_read', true);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur lors de la suppression des notifications lues:', error);
    return false;
  }
}
