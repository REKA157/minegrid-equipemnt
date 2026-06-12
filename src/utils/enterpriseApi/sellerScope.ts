import supabase from '../supabaseClient';

/**
 * IDs des annonces machines appartenant au vendeur connecté.
 * Cherche dans sellerid, seller_id, user_id et owner_id en une seule requête.
 */
export async function getMachineIdsForSellerUser(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('machines')
    .select('id')
    .or(`sellerid.eq.${userId},seller_id.eq.${userId},user_id.eq.${userId},owner_id.eq.${userId}`);

  if (error) {
    const columns = ['sellerid', 'seller_id', 'user_id', 'owner_id'] as const;
    for (const col of columns) {
      const res = await supabase.from('machines').select('id').eq(col, userId);
      if (res.error) continue;
      const ids = (res.data || []).map((m: { id: string }) => m.id).filter(Boolean);
      if (ids.length) return ids;
    }
    return [];
  }

  return (data || []).map((m: { id: string }) => m.id).filter(Boolean);
}

export async function getCurrentSellerUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
