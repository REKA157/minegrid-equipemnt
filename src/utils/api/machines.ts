import { MACHINE_LIST_COLUMNS, SELLER_MACHINES_MAX_ROWS } from '../../constants/machineQueryFields';
import type { User } from '@supabase/supabase-js';
import type { MachineData } from './types';
import supabase from '../supabaseClient';
import { getCurrentUser } from './auth';

// -------------------- MACHINES --------------------

/**
 * Nom de fichier sûr pour le bucket `machine-image` : on retire le chemin, les
 * accents et tout caractère hors [a-zA-Z0-9._-]. Exporté pour être testé.
 */
export function sanitizeImageFileName(name: string): string {
  const rawName = name.split('/').pop() || name;
  return rawName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Publie une annonce. C'est l'UNIQUE endroit qui téléverse les images.
 *
 * FE-02 : `SellEquipment` téléversait déjà chaque image AVANT d'appeler cette
 * fonction, qui les re-téléversait — soit 2 copies par image, la première
 * devenant orpheline dans le storage. L'upload (avec assainissement du nom) est
 * désormais centralisé ici et l'appelant ne fait plus rien.
 */
export async function publishMachine(machineData: MachineData, images: File[]) {
  const uploadedImagePaths: string[] = [];

  for (const file of images) {
    const fileName = `${Date.now()}_${sanitizeImageFileName(file.name)}`;
    const { error: uploadError } = await supabase
      .storage
      .from('machine-image')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      throw new Error("Échec du téléversement de l'image : " + uploadError.message);
    }

    uploadedImagePaths.push(fileName);
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
  row.images = uploadedImagePaths;

  const { data, error } = await supabase
    .from('machines')
    .insert([row]);

  if (error) throw error;

  return data;
}

export async function getSellerMachines() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Utilisateur non connecté');

  // Le vendeur peut être stocké dans l'une de ces colonnes selon l'origine de
  // l'annonce (publication, import n8n…). On essaie chacune et on garde la
  // PREMIÈRE qui renvoie réellement des lignes — sans s'arrêter sur une colonne
  // valide mais vide (sinon des annonces réelles restaient invisibles).
  const possibleColumns = ['sellerid', 'seller_id', 'user_id', 'owner_id'];
  let emptyOk: any[] | null = null;
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

    const rows = result.data || [];
    if (rows.length) return rows; // colonne qui porte vraiment ses annonces
    if (emptyOk === null) emptyOk = rows; // colonne valide mais vide -> repli honnête
  }

  if (emptyOk !== null) return emptyOk; // aucune colonne avec des lignes -> vide honnête
  if (lastError) throw lastError;
  return [];
}

// -------------------- STATISTIQUES --------------------

export async function recordMachineView(machineId: string) {
  // Reste `null` pour un visiteur non connecté : le type l'indique explicitement,
  // sinon la déclaration `= null` seule fait croire au compilateur que la valeur
  // ne peut jamais être un utilisateur.
  let user: User | null = null;
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
