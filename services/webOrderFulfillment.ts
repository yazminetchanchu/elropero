import { doc, runTransaction, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { InventoryItem, Sale, SaleItem, GiftCard } from '../types';
import { DatabaseState } from './storage';
import { sendGiftCardEmail } from './emailService';

export interface WebOrderItem {
  productId: string;
  descripcion: string;
  sku: string;
  cantidad: number;
  precioUnitario: number;
  talle?: string;
  color?: string;
  payMethod?: string;
  isVirtualGiftCard?: boolean;
  giftCardData?: {
    destinatario: string;
    email: string;
    deParteDe: string;
    mensaje: string;
  };
}

export interface WebOrderForFulfillment {
  fecha: string;
  items: WebOrderItem[];
  total: number;
  metodoPago?: string;
  costoEnvio?: number;
  giftCardUsada?: {
    codigo: string;
    montoUsado: number;
  };
  customerId?: string;
}

export function getAvailableStock(product: InventoryItem, talle?: string, color?: string): number {
  if (!product) return 0;
  
  if (product.stockPorVariante && (talle || color)) {
    if (talle && color) {
      const varKey = `${talle.trim()}-${color.trim()}`;
      const matchingKey = Object.keys(product.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase());
      return matchingKey !== undefined ? Math.max(0, product.stockPorVariante[matchingKey] ?? 0) : 0;
    }
    if (color && !talle) {
      const cleanColor = color.trim().toLowerCase();
      let sum = 0;
      let found = false;
      for (const [key, qty] of Object.entries(product.stockPorVariante)) {
        const parts = key.split('-');
        if (parts.length >= 2 && parts.slice(1).join('-').trim().toLowerCase() === cleanColor) {
          sum += Math.max(0, qty || 0);
          found = true;
        }
      }
      if (found) return sum;
    }
  }
  
  if (product.coloresStock && color) {
    const cleanColor = color.trim().toLowerCase();
    const matchingColorKey = Object.keys(product.coloresStock).find(k => k.toLowerCase() === cleanColor);
    return matchingColorKey !== undefined ? Math.max(0, product.coloresStock[matchingColorKey] ?? 0) : 0;
  }
  
  return Math.max(0, product.cantidad ?? 0);
}

export function deductInventory(inventory: InventoryItem[], items: (WebOrderItem | { productId?: string; id?: string; descripcion?: string; sku?: string; cantidad: number; talle?: string; color?: string; isVirtualGiftCard?: boolean })[]): InventoryItem[] {
  return inventory.map((item) => {
    const soldLines = items.filter((oi: any) => !oi.isVirtualGiftCard && ((oi.productId && oi.productId === item.id) || (oi.id && oi.id === item.id)));
    if (!soldLines.length) return item;

    let updated: InventoryItem = { ...item };
    for (const sold of soldLines) {
      if (updated.stockPorVariante && sold.talle && sold.color) {
        const varKey = `${sold.talle.trim()}-${sold.color.trim()}`;
        const matchingKey = Object.keys(updated.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
        const nextVariants = { ...updated.stockPorVariante };
        nextVariants[matchingKey] = Math.max(0, (nextVariants[matchingKey] || 0) - sold.cantidad);

        let nextColoresStock = updated.coloresStock ? { ...updated.coloresStock } : undefined;
        if (nextColoresStock && sold.color) {
          const colorKey = Object.keys(nextColoresStock).find(k => k.toLowerCase() === sold.color!.trim().toLowerCase()) || sold.color.trim().toUpperCase();
          if (nextColoresStock[colorKey] !== undefined) {
            nextColoresStock[colorKey] = Math.max(0, (nextColoresStock[colorKey] || 0) - sold.cantidad);
          }
        }

        updated = {
          ...updated,
          stockPorVariante: nextVariants,
          ...(nextColoresStock ? { coloresStock: nextColoresStock } : {}),
          cantidad: Math.max(0, updated.cantidad - sold.cantidad),
        };
      } else {
        const colorKey = sold.color?.trim().toUpperCase();
        if (colorKey && updated.coloresStock && updated.coloresStock[colorKey] !== undefined) {
          const nextStock = { ...updated.coloresStock };
          nextStock[colorKey] = Math.max(0, (nextStock[colorKey] || 0) - sold.cantidad);
          const totalQty = Object.values(nextStock).reduce((sum, q) => sum + q, 0);
          updated = { ...updated, coloresStock: nextStock, cantidad: totalQty };
        } else {
          updated = {
            ...updated,
            cantidad: Math.max(0, updated.cantidad - sold.cantidad),
          };
        }
      }
    }
    return updated;
  });
}

export function restoreInventory(inventory: InventoryItem[], items: (WebOrderItem | { productId?: string; id?: string; descripcion?: string; sku?: string; cantidad: number; talle?: string; color?: string; isVirtualGiftCard?: boolean })[]): InventoryItem[] {
  return inventory.map((item) => {
    const soldLines = items.filter((oi: any) => !oi.isVirtualGiftCard && ((oi.productId && oi.productId === item.id) || (oi.id && oi.id === item.id)));
    if (!soldLines.length) return item;

    let updated: InventoryItem = { ...item };
    for (const sold of soldLines) {
      if (updated.stockPorVariante && sold.talle && sold.color) {
        const varKey = `${sold.talle.trim()}-${sold.color.trim()}`;
        const matchingKey = Object.keys(updated.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
        const nextVariants = { ...updated.stockPorVariante };
        nextVariants[matchingKey] = (nextVariants[matchingKey] || 0) + sold.cantidad;

        let nextColoresStock = updated.coloresStock ? { ...updated.coloresStock } : undefined;
        if (nextColoresStock && sold.color) {
          const colorKey = Object.keys(nextColoresStock).find(k => k.toLowerCase() === sold.color!.trim().toLowerCase()) || sold.color.trim().toUpperCase();
          if (nextColoresStock[colorKey] !== undefined) {
            nextColoresStock[colorKey] = (nextColoresStock[colorKey] || 0) + sold.cantidad;
          }
        }

        updated = {
          ...updated,
          stockPorVariante: nextVariants,
          ...(nextColoresStock ? { coloresStock: nextColoresStock } : {}),
          cantidad: updated.cantidad + sold.cantidad,
        };
      } else {
        const colorKey = sold.color?.trim().toUpperCase();
        if (colorKey && updated.coloresStock && updated.coloresStock[colorKey] !== undefined) {
          const nextStock = { ...updated.coloresStock };
          nextStock[colorKey] = (nextStock[colorKey] || 0) + sold.cantidad;
          const totalQty = Object.values(nextStock).reduce((sum, q) => sum + q, 0);
          updated = { ...updated, coloresStock: nextStock, cantidad: totalQty };
        } else {
          updated = {
            ...updated,
            cantidad: updated.cantidad + sold.cantidad,
          };
        }
      }
    }
    return updated;
  });
}

export function deductSaleFromInventory(inventory: InventoryItem[], sale: Sale | Omit<Sale, 'id'>): InventoryItem[] {
  let updatedInv = [...inventory];
  if (sale.tipo === 'cambio') {
    if (sale.itemsDevueltos && sale.itemsDevueltos.length > 0) {
      updatedInv = restoreInventory(updatedInv, sale.itemsDevueltos.map(si => ({
        productId: si.id,
        descripcion: si.descripcion,
        sku: si.sku,
        cantidad: si.cantidad,
        talle: si.talle,
        color: si.color
      })));
    }
    if (sale.itemsNuevos && sale.itemsNuevos.length > 0) {
      updatedInv = deductInventory(updatedInv, sale.itemsNuevos.map(si => ({
        productId: si.id,
        descripcion: si.descripcion,
        sku: si.sku,
        cantidad: si.cantidad,
        talle: si.talle,
        color: si.color
      })));
    }
  } else if (sale.items && sale.items.length > 0) {
    updatedInv = deductInventory(updatedInv, sale.items.map(si => ({
      productId: si.id,
      descripcion: si.descripcion,
      sku: si.sku,
      cantidad: si.cantidad,
      talle: si.talle,
      color: si.color
    })));
  }
  return updatedInv;
}

export function restoreSaleToInventory(inventory: InventoryItem[], sale: Sale): InventoryItem[] {
  let updatedInv = [...inventory];
  if (sale.tipo === 'cambio') {
    if (sale.itemsNuevos && sale.itemsNuevos.length > 0) {
      updatedInv = restoreInventory(updatedInv, sale.itemsNuevos.map(si => ({
        productId: si.id,
        descripcion: si.descripcion,
        sku: si.sku,
        cantidad: si.cantidad,
        talle: si.talle,
        color: si.color
      })));
    }
    if (sale.itemsDevueltos && sale.itemsDevueltos.length > 0) {
      updatedInv = deductInventory(updatedInv, sale.itemsDevueltos.map(si => ({
        productId: si.id,
        descripcion: si.descripcion,
        sku: si.sku,
        cantidad: si.cantidad,
        talle: si.talle,
        color: si.color
      })));
    }
  } else if (sale.items && sale.items.length > 0) {
    updatedInv = restoreInventory(updatedInv, sale.items.map(si => ({
      productId: si.id,
      descripcion: si.descripcion,
      sku: si.sku,
      cantidad: si.cantidad,
      talle: si.talle,
      color: si.color
    })));
  }
  return updatedInv;
}

export function verifyStock(inventory: InventoryItem[], items: WebOrderItem[]): void {
  for (const item of items) {
    if (item.isVirtualGiftCard) continue;

    const inv = inventory.find(i => i.id === item.productId);
    if (!inv) throw new Error(`El producto ${item.descripcion} ya no existe en el catálogo.`);
    
    if (inv.stockPorVariante && item.talle && item.color) {
      const varKey = `${item.talle}-${item.color}`;
      const matchingKey = Object.keys(inv.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase());
      if (matchingKey) {
        if ((inv.stockPorVariante[matchingKey] || 0) < item.cantidad) {
          throw new Error(`No hay stock suficiente para ${item.descripcion} (Talle: ${item.talle}, Color: ${item.color}). Alguien más pudo haberlo comprado recientemente.`);
        }
      } else {
        if (inv.cantidad < item.cantidad) {
          throw new Error(`No hay stock suficiente para ${item.descripcion} (Talle: ${item.talle}, Color: ${item.color}).`);
        }
      }
    } else {
      const colorKey = item.color?.trim().toUpperCase();
      if (colorKey && inv.coloresStock && inv.coloresStock[colorKey] !== undefined) {
        if ((inv.coloresStock[colorKey] || 0) < item.cantidad) {
          throw new Error(`No hay stock suficiente para ${item.descripcion} (Color: ${item.color}). Alguien más pudo haberlo comprado recientemente.`);
        }
      } else {
        if (inv.cantidad < item.cantidad) {
          throw new Error(`No hay stock suficiente para ${item.descripcion}. Alguien más pudo haberlo comprado.`);
        }
      }
    }
  }
}

export function buildSaleFromWebOrder(
  order: WebOrderForFulfillment,
  orderId: string,
  inventory: InventoryItem[]
): Sale {
  const saleItems: SaleItem[] = order.items.map((oi) => {
    const inv = inventory.find((i) => i.id === oi.productId);
    const variant =
      [oi.talle && `T:${oi.talle}`, oi.color && `C:${oi.color}`].filter(Boolean).join(' ') || '';
    const descripcion = variant ? `${oi.descripcion} (${variant})` : oi.descripcion;

    return {
      id: oi.productId,
      sku: oi.sku || inv?.sku || '---',
      descripcion,
      cantidad: oi.cantidad,
      costo: inv?.costo ?? 0,
      precioEfectivo: oi.precioUnitario,
      precioTarjeta: oi.precioUnitario,
      descuento: 0,
      talle: oi.talle,
      color: oi.color,
    };
  });

  const isTarjeta = order.items.some((oi) => oi.payMethod === 'tarjeta');
  
  const sale: any = {
    id: `sale_web_${orderId}`,
    fecha: order.fecha,
    tipo: 'venta',
    items: saleItems,
    total: order.total,
    pago: isTarjeta ? { efectivo: 0, tarjeta: 100 } : { efectivo: 100, tarjeta: 0 },
  };

  if (order.giftCardUsada !== undefined) {
    sale.giftCardUsada = order.giftCardUsada;
  }

  return sale as Sale;
}

/**
 * Registra la venta en caja/historial y descuenta stock en el backend mediante Cloud Function seguras (Firebase Admin SDK).
 */
export async function fulfillWebOrder(
  showroomId: string,
  orderId: string,
  order: WebOrderForFulfillment
): Promise<string> {
  const fulfillFn = httpsCallable<
    { showroomId: string; orderId: string; order: WebOrderForFulfillment },
    { success: boolean; saleId: string }
  >(functions, 'fulfillWebOrderServer');

  try {
    const result = await fulfillFn({ showroomId, orderId, order });
    return result.data.saleId;
  } catch (error: any) {
    console.error('Error al ejecutar fulfillWebOrderServer:', error);
    throw new Error(error.message || 'Error al procesar el fulfillment de la orden.');
  }
}

export async function reserveWebOrderStock(
  showroomId: string,
  orderId: string,
  orderData: any
): Promise<void> {
  const reserveFn = httpsCallable(functions, 'reserveWebOrder');
  try {
    const result = await reserveFn({ showroomId, orderId, orderData });
    console.log('Reserva confirmada en el servidor:', result.data);
  } catch (error: any) {
    console.error('Error al reservar stock mediante Cloud Function:', error);
    const msg = error?.message || '';
    const isNetworkOrInternal =
      error?.code === 'internal' ||
      error?.code === 'unavailable' ||
      error?.code === 'functions/internal' ||
      error?.code === 'functions/unavailable' ||
      msg.toLowerCase().includes('internal') ||
      msg.toLowerCase().includes('cors') ||
      msg.toLowerCase().includes('failed to fetch') ||
      msg.toLowerCase().includes('network');

    if (isNetworkOrInternal) {
      throw new Error('Hubo un problema de conexión con el servidor al verificar el stock. Por favor, intentá nuevamente.');
    }

    throw new Error(msg || 'No se pudo reservar el stock. Es posible que algún producto se haya agotado.');
  }
}

export function isOrderExpired(order: { estado?: string; expiresAt?: string; fecha?: string }): boolean {
  if (!order) return false;
  const isPending = order.estado === 'Pendiente' || order.estado === 'PENDING_PAYMENT' || order.estado === 'pending_transfer';
  if (!isPending) return false;

  const now = Date.now();
  if (order.expiresAt) {
    return new Date(order.expiresAt).getTime() < now;
  }
  if (order.fecha) {
    const fechaMs = new Date(order.fecha).getTime();
    if (!isNaN(fechaMs)) {
      const durationLimitMs = order.estado === 'pending_transfer' ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
      return (now - fechaMs) > durationLimitMs;
    }
  }
  return false;
}

export async function releaseExpiredReservations(showroomId: string): Promise<void> {
  try {
    const releaseFn = httpsCallable<{ showroomId: string }, { releasedCount: number; success: boolean }>(
      functions,
      'releaseExpiredReservationsServer'
    );
    const result = await releaseFn({ showroomId });
    if (result.data?.releasedCount && result.data.releasedCount > 0) {
      console.log(`[releaseExpiredReservations] Se liberaron ${result.data.releasedCount} reservas expiradas en el servidor.`);
    }
  } catch (e: any) {
    console.warn('[releaseExpiredReservations] Aviso al verificar reservas expiradas:', e?.message || e);
  }
}

export async function cancelWebOrderReservation(showroomId: string, orderId: string): Promise<void> {
  try {
    const cancelFn = httpsCallable<{ showroomId: string; orderId: string }, { success: boolean }>(
      functions,
      'cancelWebOrderReservationServer'
    );
    await cancelFn({ showroomId, orderId });
    console.log(`[cancelWebOrderReservation] Reserva ${orderId} cancelada en el servidor.`);
  } catch (e: any) {
    console.warn('[cancelWebOrderReservation] Error al cancelar reserva de orden:', e?.message || e);
  }
}



