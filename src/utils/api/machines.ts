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
  
  // N'envoyer QUE les colonnes réellement présentes dans la table `machines`.
  // Le formulaire porte des champs additionnels (ex: `type`) et une clé
  // camelCase `sellerId` qui n'existent pas comme colonnes → ils déclenchaient
  // des erreurs PGRST204 "Could not find the '<x>' column". On filtre donc sur
  // une liste blanche, et on remappe `sellerId` vers la vraie colonne `sellerid`
  // (indexée + utilisée par la RLS et les lectures), avec `seller_id` pour la
  // compat du reste du code.
  const md = machineData as unknown as Record<string, unknown>;
  const ALLOWED_COLUMNS = [
    'name', 'brand', 'model', 'category', 'year', 'price',
    'condition', 'description', 'specifications', 'total_hours',
  ];
  const row: Record<string, unknown> = {};
  for (const col of ALLOWED_COLUMNS) {
    if (md[col] !== undefined) row[col] = md[col];
  }
  row.sellerid = md.sellerId;
  row.seller_id = md.sellerId;
  row.images = uploadedImageURLs;

  const { data, error } = await supabase
    .from('machines')
    .insert([row]);

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
