import { INVENTORY_LIST_COLUMNS } from '../../constants/enterpriseApiQueryFields';
import type { InventoryItem } from './types';
import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

// WIDGET "STOCK PIECES DETACHEES"
export const getInventoryStatus = async () => {
  const data = await supabaseCall<InventoryItem[]>(
    () =>
      supabase.from('inventory').select(INVENTORY_LIST_COLUMNS).order('category', { ascending: true }),
    { label: 'getInventoryStatus', fallback: [] },
  );

  return data.map((item) => {
    const stock = item.current_stock;
    const minStock = item.minimum_stock;
    const unitPrice = typeof item.unit_price === 'number' ? item.unit_price : Number(item.unit_price) || 0;
    return {
      id: item.id,
      title: item.category || 'Article',
      category: item.category,
      stock,
      minStock,
      min: minStock,
      // Le widget « Stock pièces détachées » charte un NIVEAU DE STOCK (quantité),
      // pas une valeur monétaire. La valorisation (prix × quantité) est fournie à
      // part dans `stockValue` pour qui en a besoin.
      value: Math.max(stock, 0),
      stockValue: unitPrice * Math.max(stock, 0),
      unit_price: unitPrice,
      supplier: item.supplier,
      needs_restock: stock < minStock,
      last_restock_date: (item as { last_restock_date?: string | null }).last_restock_date ?? null,
    };
  });
};

export const updateInventoryStock = async (id: string, newStock: number) => {
  return supabaseCall(
    () =>
      supabase
        .from('inventory')
        .update({ current_stock: newStock, last_restock_date: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    { label: 'updateInventoryStock', toastOnError: true },
  );
};

export const createStockOrder = async (order: {
  inventory_id: string;
  quantity: number;
  unit_price: number;
  supplier: string;
  expected_delivery_date: string;
}) => {
  const total_price = order.quantity * order.unit_price;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('stock_orders')
        .insert([{ ...order, total_price, created_by: userData.user.id, status: 'En attente' }])
        .select()
        .single(),
    { label: 'createStockOrder', toastOnError: true, toastMessage: 'Impossible de créer la commande de stock' },
  );
};

// NOTIFICATIONS ET ALERTES
export const getStockAlerts = async () => {
  return supabaseCall(
    () => supabase.from('inventory').select(INVENTORY_LIST_COLUMNS).lt('current_stock', 'minimum_stock'),
    { label: 'getStockAlerts', fallback: [] },
  );
};
