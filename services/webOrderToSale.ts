import { CustomerOrder } from '../contexts/AuthContext';
import { InventoryItem, SaleItem } from '../types';

export type CustomerOrderItem = CustomerOrder['items'][number];

/**
 * Convierte ítems de un pedido web a SaleItem para cambios (misma base que Caja y Backend).
 * El precio devuelto/convertido es inmutable y se basa estrictamente en el precioUnitario transaccionado en la orden.
 */
export function buildSaleItemsFromOrder(
  orderOrItems: CustomerOrder | { items: CustomerOrderItem[] } | CustomerOrderItem[],
  inventory?: InventoryItem[]
): SaleItem[] {
  const items = Array.isArray(orderOrItems)
    ? orderOrItems
    : (orderOrItems?.items || []);

  return items.map((item: any) => {
    const inv = inventory?.find((i) => i.id === (item.productId || item.id));
    const precioCobrado = Number(item.precioUnitario ?? item.precioEfectivo ?? item.precioTarjeta ?? item.precio) || 0;
    const variant = [item.talle && `T:${item.talle}`, item.color && `C:${item.color}`]
      .filter(Boolean)
      .join(' ');

    const baseDesc = item.descripcion || item.nombre || item.nombreProducto || 'Prenda Web';
    const descripcion = variant && !baseDesc.includes(variant) ? `${baseDesc} (${variant})` : baseDesc;

    const saleItem: SaleItem = {
      id: item.productId || item.id,
      sku: item.sku || inv?.sku || '---',
      descripcion,
      cantidad: item.cantidad || 1,
      costo: Number(item.costo ?? inv?.costo) || 0,
      precioEfectivo: precioCobrado,
      precioTarjeta: precioCobrado,
      descuento: Number(item.descuento) || 0,
      talle: item.talle || '',
      color: item.color || '',
    };
    if (item.cantidadDevuelta) {
      (saleItem as any).cantidadDevuelta = item.cantidadDevuelta;
    }
    return saleItem;
  });
}

export function getOrderSaleId(order: CustomerOrder): string | null {
  if (order.saleId) return order.saleId;
  return `sale_web_${order.id}`;
}

export function isGiftCardOrder(order: CustomerOrder): boolean {
  return order.items.some(
    (item) =>
      (item as any).isVirtualGiftCard ||
      item.sku === 'GIFT-CARD' ||
      !!(item as any).giftCardData ||
      item.productId.startsWith('virtual_gift_card_')
  );
}

export function isOrderEligibleForExchange(order: CustomerOrder): boolean {
  if (isGiftCardOrder(order)) return false;

  const registradoEnCaja =
    !!order.saleId || order.estado === 'Confirmado' || order.estado === 'Entregado' || order.estado === 'parcialmente_cambiado';
  if (!registradoEnCaja) return false;
  if (order.isExchanged) return false;

  if (order.items && order.items.length > 0) {
    const hasRemainingItems = order.items.some(
      (item) => (item.cantidad - (item.cantidadDevuelta || 0)) > 0
    );
    if (!hasRemainingItems) return false;
  }

  const days = Math.floor((Date.now() - new Date(order.fecha).getTime()) / 86400000);
  return days <= 15;
}

