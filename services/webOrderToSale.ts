import { CustomerOrder } from '../contexts/AuthContext';
import { InventoryItem, SaleItem } from '../types';

/** Convierte ítems de un pedido web a SaleItem para cambios (misma base que Caja). */
export function buildSaleItemsFromOrder(
  order: CustomerOrder,
  inventory: InventoryItem[]
): SaleItem[] {
  return order.items.map((item) => {
    const inv = inventory.find((i) => i.id === item.productId);
    const precioEfectivo = inv?.ventaEfectivo ?? item.precioUnitario;
    const precioTarjeta = inv?.ventaTarjeta ?? Math.round(precioEfectivo * 1.27);
    const variant = [item.talle && `T:${item.talle}`, item.color && `C:${item.color}`]
      .filter(Boolean)
      .join(' ');

    return {
      id: item.productId,
      sku: item.sku || inv?.sku || '---',
      descripcion: variant ? `${item.descripcion} (${variant})` : item.descripcion,
      cantidad: item.cantidad,
      costo: inv?.costo ?? 0,
      precioEfectivo,
      precioTarjeta,
      descuento: 0,
    };
  });
}

export function getOrderSaleId(order: CustomerOrder): string | null {
  if (order.saleId) return order.saleId;
  return `sale_web_${order.id}`;
}

export function isOrderEligibleForExchange(order: CustomerOrder): boolean {
  const registradoEnCaja =
    !!order.saleId || order.estado === 'Confirmado' || order.estado === 'Entregado';
  if (!registradoEnCaja) return false;
  if (order.isExchanged) return false;
  const days = Math.floor((Date.now() - new Date(order.fecha).getTime()) / 86400000);
  return days <= 15;
}
