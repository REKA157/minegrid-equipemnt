import { MACHINE_LIST_COLUMNS, SELLER_MACHINES_MAX_ROWS } from '../../constants/machineQueryFields';
import type { MachineData } from './types';
import supabase from '../supabaseClient';
import { getCurrentUser } from './auth';

// -------------------- MACHINES --------------------

export async function publishMachine(machineData: MachineData, images: File[]) {
  const uploadedImageURLs: string[] = [];

  for (const file of images) {
    const fileName = `${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase
      .storage
      .from('machine-image')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase
      .storage
      .from('machine-image')
      .getPublicUrl(fileName);

      uploadedImageURLs.push(fileName);

  }
  
  const { data, error } = await supabase
    .from('machines')
    .insert([{ ...machineData, images: uploadedImageURLs }]);

  if (error) throw error;

  return data;
}

export async function getSellerMachines() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Utilisateur non connecté');

  const possibleColumns = ['sellerid', 'seller_id', 'user_id', 'owner_id'];
  let data: any[] | null = null;
  let lastError: any = null;

  for (const column of possibleColumns) {
    const result = await supabase
      .from('machines')
      .select(MACHINE_LIST_COLUMNS)
      .eq(column, user.id)
      .limit(SELLER_MACHINES_MAX_ROWS);

    if (result.error) {
      lastError = result.error;
      continue;
    }

    data = result.data || [];
    break;
  }

  if (data === null && lastError) throw lastError;
  return data;
}

// -------------------- STATISTIQUES --------------------

export async function recordMachineView(machineId: string) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Visiteur non connecte: on continue sans viewer_id.
  }
  
  const viewData = {
    machine_id: machineId,
    viewer_id: user?.id || null,
    ip_address: 'client-ip', // En production, récupérer l'IP réelle
    user_agent: navigator.userAgent,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('machine_views')
    .insert([viewData]);

  // Certaines instances n'ont pas encore la table machine_views.
  // Dans ce cas (404/PGRST205/42P01), on ne bloque jamais l'UX.
  const isMissingMachineViewsTable =
    Boolean(error) &&
    (
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      (typeof error.message === 'string' && error.message.toLowerCase().includes('machine_views'))
    );

  if (error && !isMissingMachineViewsTable) {
    console.error('Erreur enregistrement vue:', error);
  }
}
