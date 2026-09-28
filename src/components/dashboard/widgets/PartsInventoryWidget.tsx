/**
 * Widget « parts-inventory », sorti de WidgetRenderer.tsx.
 *
 * WidgetRenderer declarait l'etat de TOUS les widgets a la fois : 84 `useState`
 * et 38 `useEffect`, dont 36 ouverts par `if (widget.id !== ...) return`.
 * Afficher un seul widget allouait donc les 84 etats et declenchait les 38
 * effets. Ici, le widget possede son etat et ne coute rien aux autres.
 *
 * Le JSX est repris A L'IDENTIQUE (decoupe par programme, pas retape) :
 * aucun changement d'affichage n'est attendu.
 */

import React, { useState, useEffect } from 'react';
import { createStockOrder, getInventoryStatus } from '../../../utils/enterpriseApi/inventory';
import { toast } from '../../../utils/toast';
import { mapInventoryForChart } from '../widgetRendererMappers';
import ChartWidget from './ChartWidget';
import { ShoppingCart } from 'lucide-react';
import type { Widget } from '../../../constants/dashboardTypes';

interface Props {
  widget: Widget;
  widgetSize: 'small' | 'medium' | 'large' | undefined;
}

export default function PartsInventoryWidget({ widget, widgetSize }: Props) {
  const [liveInventory, setLiveInventory] = useState<ReturnType<typeof mapInventoryForChart> | null>(null);
  const [liveInventoryLoading, setLiveInventoryLoading] = useState(false);
  const [orderingPartId, setOrderingPartId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLiveInventoryLoading(true);
      try {
        const rows = await getInventoryStatus();
        if (!cancelled) setLiveInventory(mapInventoryForChart(rows));
      } catch (e) {
        console.error('PartsInventoryWidget getInventoryStatus', e);
        if (!cancelled) setLiveInventory([]);
      } finally {
        if (!cancelled) setLiveInventoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rafraichissement declenche ailleurs dans l'application : ce widget s'y
  // abonne lui-meme, au lieu d'une branche de plus dans le `refresh` geant.
  useEffect(() => {
    const refresh = () => {
      getInventoryStatus()
        .then((rows) => setLiveInventory(mapInventoryForChart(rows)))
        .catch(() => {});
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, []);

  const inventoryData = liveInventory ?? [];
  const lowStockItems = inventoryData.filter(
    (i: any) => typeof i?.stock === 'number' && typeof i?.minStock === 'number' && i.stock < i.minStock,
  );
  const handleQuickReorder = async (item: any) => {
    if (!item?.id || orderingPartId) return;
    const missing = Math.max((item.minStock ?? 0) - (item.stock ?? 0), 1);
    const reorderQty = Math.max(missing * 2, 1); // commande min 2x le manque
    setOrderingPartId(String(item.id));
    try {
      await createStockOrder({
        inventory_id: String(item.id),
        quantity: reorderQty,
        unit_price: Number(item.unit_price ?? 0),
        supplier: item.supplier || 'À définir',
        expected_delivery_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      });
      window.dispatchEvent(new CustomEvent('pipeline:refresh'));
    } catch {
      /* toast géré par supabaseCall */
    } finally {
      setOrderingPartId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {lowStockItems.length > 0 && !liveInventoryLoading && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 p-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-xs font-semibold text-red-800">
              {lowStockItems.length} référence{lowStockItems.length > 1 ? 's' : ''} sous seuil
            </div>
            <span className="text-xs text-red-600">Réappro recommandé</span>
          </div>
          <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
            {lowStockItems.slice(0, 4).map((item: any) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-xs"
              >
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-gray-800">{item.title || item.category}</span>
                  <span className="ml-1 text-red-600">
                    {item.stock}/{item.minStock}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleQuickReorder(item)}
                  disabled={orderingPartId === String(item.id)}
                  className="flex items-center gap-1 rounded bg-orange-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-orange-700 disabled:bg-gray-300"
                  title={`Commander ${Math.max((item.minStock ?? 0) - (item.stock ?? 0), 1) * 2} unités auprès de ${item.supplier || 'fournisseur'}`}
                >
                  <ShoppingCart className="h-3 w-3" />
                  {orderingPartId === String(item.id) ? '…' : 'Commander'}
                </button>
              </div>
            ))}
            {lowStockItems.length > 4 && (
              <div className="text-center text-xs text-red-600">
                +{lowStockItems.length - 4} autre{lowStockItems.length - 4 > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}
      {liveInventoryLoading ? (
        <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
          Chargement du stock…
        </div>
      ) : inventoryData.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
          <div>Aucune pièce en stock</div>
          <div className="text-xs text-gray-400 mt-1">
            Ajoutez des références dans le module Inventaire
          </div>
        </div>
      ) : (
        <ChartWidget
          widget={widget}
          data={inventoryData as any[]}
          widgetSize={widgetSize as any}
        />
      )}
    </div>
  );
}
