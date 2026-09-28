import { CLIENT_ORDER_COLUMNS } from '../../constants/proClientQueryFields';
import type { ClientOrder } from './types';
import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import { logger } from '../logger';
import { getProClientProfile } from './profile';

// =====================================================
// FONCTIONS API COMMANDES
// =====================================================

// Récupérer toutes les commandes d'un client
export async function getClientOrders(): Promise<ClientOrder[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté');

    console.log('🔄 Récupération des commandes Pro pour l\'utilisateur:', user.id);

    // Récupérer le profil Pro pour obtenir le client_id
    const proProfile = await getProClientProfile();
    if (!proProfile) {
      // Pas de profil Pro : on ne fabrique RIEN.
      //
      // Ce bloc inserait auparavant des commandes de demonstration DANS LA BASE DE
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

    // Récupérer les commandes du client
    const { data, error } = await supabase
      .from('client_orders')
      .select(CLIENT_ORDER_COLUMNS)
      .eq('client_id', proProfile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    console.log('✅ Commandes Pro récupérées:', data?.length || 0);
        return data || [];
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des commandes Pro:', error);
    return [];
  }
}

// Créer une nouvelle commande
export async function createClientOrder(order: Partial<ClientOrder>): Promise<ClientOrder | null> {
  try {
    return await supabaseCall<ClientOrder>(
      () => supabase.from('client_orders').insert(order).select().single(),
      { label: 'createClientOrder' },
    );
  } catch (error) {
    logger.error('[createClientOrder]', error);
    return null;
  }
}
