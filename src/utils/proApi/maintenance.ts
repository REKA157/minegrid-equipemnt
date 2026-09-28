import { EQUIPMENT_DIAGNOSTICS_COLUMNS, MAINTENANCE_INTERVENTION_SELECT } from '../../constants/proClientQueryFields';
import type { EquipmentDiagnostic, MaintenanceIntervention } from './types';
import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import { logger } from '../logger';
import { getProClientProfile } from './profile';

// =====================================================
// FONCTIONS API MAINTENANCE
// =====================================================

// Récupérer toutes les interventions de maintenance
export async function getMaintenanceInterventions(): Promise<MaintenanceIntervention[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Utilisateur non connecté');

    console.log('🔄 Récupération des interventions de maintenance Pro pour l\'utilisateur:', user.id);

    // Récupérer le profil Pro pour obtenir le client_id
    const proProfile = await getProClientProfile();
    if (!proProfile) {
      // Pas de profil Pro : on ne fabrique RIEN.
      //
      // Ce bloc inserait auparavant des interventions de maintenance de demonstration DANS LA BASE DE
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

    // Récupérer les interventions du client
    const { data, error } = await supabase
      .from('maintenance_interventions')
      .select(MAINTENANCE_INTERVENTION_SELECT)
      .eq('client_id', proProfile.id)
      .order('scheduled_date', { ascending: true });

    if (error) throw error;
    
    console.log('✅ Interventions Pro récupérées:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des interventions Pro:', error);
    return [];
  }
}

// Créer une nouvelle intervention
export async function createMaintenanceIntervention(
  intervention: Partial<MaintenanceIntervention>
): Promise<MaintenanceIntervention | null> {
  try {
    return await supabaseCall<MaintenanceIntervention>(
      () => supabase.from('maintenance_interventions').insert(intervention).select().single(),
      { label: 'createMaintenanceIntervention' },
    );
  } catch (error) {
    logger.error('[createMaintenanceIntervention]', error);
    return null;
  }
}

// =====================================================
// FONCTIONS API DIAGNOSTICS
// =====================================================

// Récupérer les diagnostics d'un équipement
export async function getEquipmentDiagnostics(equipmentId: string): Promise<EquipmentDiagnostic[]> {
  return supabaseCall<EquipmentDiagnostic[]>(
    () =>
      supabase
        .from('equipment_diagnostics')
        .select(EQUIPMENT_DIAGNOSTICS_COLUMNS)
        .eq('equipment_id', equipmentId)
        .order('diagnostic_date', { ascending: false }),
    { label: 'getEquipmentDiagnostics', fallback: [] },
  );
}

// Ajouter un nouveau diagnostic
export async function addEquipmentDiagnostic(
  diagnostic: Partial<EquipmentDiagnostic>
): Promise<EquipmentDiagnostic | null> {
  try {
    return await supabaseCall<EquipmentDiagnostic>(
      () => supabase.from('equipment_diagnostics').insert(diagnostic).select().single(),
      { label: 'addEquipmentDiagnostic' },
    );
  } catch (error) {
    logger.error('[addEquipmentDiagnostic]', error);
    return null;
  }
}
