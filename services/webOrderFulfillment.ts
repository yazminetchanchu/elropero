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

export function deductInventory(inventory: InventoryItem[], items: WebOrderItem[]): InventoryItem[] {
  return inventory.map((item) => {
    const soldLines = items.filter((oi) => !oi.isVirtualGiftCard && oi.productId === item.id);
    if (!soldLines.length) return item;

    let updated: InventoryItem = { ...item };
    for (const sold of soldLines) {
      if (updated.stockPorVariante && sold.talle && sold.color) {
        const varKey = `${sold.talle}-${sold.color}`;
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

export function restoreInventory(inventory: InventoryItem[], items: WebOrderItem[]): InventoryItem[] {
  return inventory.map((item) => {
    const soldLines = items.filter((oi) => !oi.isVirtualGiftCard && oi.productId === item.id);
    if (!soldLines.length) return item;

    let updated: InventoryItem = { ...item };
    for (const sold of soldLines) {
      if (updated.stockPorVariante && sold.talle && sold.color) {
        const varKey = `${sold.talle}-${sold.color}`;
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
 * Registra la venta en caja/historial y descuenta stock en el documento del showroom.
 */
export async function fulfillWebOrder(
  showroomId: string,
  orderId: string,
  order: WebOrderForFulfillment
): Promise<string> {
  const saleId = `sale_web_${orderId}`;
  const showroomRef = doc(db, 'showrooms', showroomId);
  const emailsToSend: any[] = [];
  const orderRef = doc(db, 'showrooms', showroomId, 'orders', orderId);
  const customerOrderRef = (order.customerId && order.customerId !== 'GUEST') 
    ? doc(db, 'showrooms', showroomId, 'customers', order.customerId, 'orders', orderId)
    : null;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(showroomRef);
    if (!snap.exists()) {
      throw new Error('No se encontró el showroom en la base de datos.');
    }

    const data = snap.data() as DatabaseState;
    const sales = data.sales || [];

    if (sales.some((s) => s.id === saleId)) {
      return;
    }

    const inventory = data.inventory || [];
    const sale = buildSaleFromWebOrder(order, orderId, inventory);

    const giftCards = data.giftCards || [];
    let nextGiftCards = [...giftCards];
    if (order.giftCardUsada) {
      nextGiftCards = giftCards.map((gc) => {
        if (gc.codigo.toUpperCase() === order.giftCardUsada!.codigo.toUpperCase()) {
          const nuevoSaldo = Math.max(0, gc.saldo - order.giftCardUsada!.montoUsado);
          return {
            ...gc,
            saldo: nuevoSaldo,
            estado: (nuevoSaldo <= 0 ? 'AGOTADA' : 'ACTIVA') as 'AGOTADA' | 'ACTIVA',
          };
        }
        return gc;
      });
    }

    emailsToSend.length = 0; // Limpiar emails por si la transacción se reintenta
    for (const item of order.items) {
      if (item.isVirtualGiftCard && item.giftCardData) {
        const giftCodigo = `GIFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const newGC: GiftCard = {
          id: `gift_${Date.now()}_${Math.random().toString(36).substring(2,5)}`,
          codigo: giftCodigo,
          destinatario: item.giftCardData.destinatario,
          montoInicial: item.precioUnitario,
          saldo: item.precioUnitario,
          estado: 'ACTIVA',
          fechaCreacion: new Date().toISOString()
        };
        nextGiftCards.push(newGC);
        emailsToSend.push({
          email: item.giftCardData.email,
          destinatario: item.giftCardData.destinatario,
          deParteDe: item.giftCardData.deParteDe,
          monto: item.precioUnitario,
          codigo: giftCodigo,
          mensaje: item.giftCardData.mensaje
        });
      }
    }

    transaction.update(showroomRef, {
      sales: [...sales, sale],
      giftCards: nextGiftCards,
      lastSync: Date.now(),
    });

    transaction.update(orderRef, {
      saleId,
      estado: 'Confirmado',
      fulfilledAt: new Date().toISOString(),
    });

    if (customerOrderRef) {
      transaction.set(customerOrderRef, {
        saleId,
        estado: 'Confirmado',
        fulfilledAt: new Date().toISOString(),
      }, { merge: true });
    }
  });

  // Los emails se envían solo si la transacción fue un éxito
  for (const email of emailsToSend) {
    await sendGiftCardEmail(email.email, email.destinatario, email.deParteDe, email.monto, email.codigo, email.mensaje);
  }

  return saleId;
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
    throw new Error(error.message || 'No se pudo reservar el stock. Es posible que algún producto se haya agotado.');
  }
}

export function isOrderExpired(order: { estado?: string; expiresAt?: string; fecha?: string }): boolean {
  if (!order) return false;
  const isPending = order.estado === 'Pendiente' || order.estado === 'PENDING_PAYMENT';
  if (!isPending) return false;

  const now = Date.now();
  if (order.expiresAt) {
    return new Date(order.expiresAt).getTime() < now;
  }
  if (order.fecha) {
    const fechaMs = new Date(order.fecha).getTime();
    if (!isNaN(fechaMs)) {
      return (now - fechaMs) > 15 * 60 * 1000;
    }
  }
  return false;
}

export async function releaseExpiredReservations(showroomId: string) {
  const ordersCol = collection(db, 'showrooms', showroomId, 'orders');
  const snap = await getDocs(ordersCol);
  
  const expiredDocs = snap.docs.filter(d => {
    const data = d.data();
    return isOrderExpired(data);
  });

  if (expiredDocs.length === 0) return;

  for (const d of expiredDocs) {
    const data = d.data();
    const showroomRef = doc(db, 'showrooms', showroomId);
    
    try {
      await runTransaction(db, async (transaction) => {
        const sr = await transaction.get(showroomRef);
        if (!sr.exists()) return;
        const srData = sr.data() as DatabaseState;
        
        // Devolver el stock
        const nextInventory = restoreInventory(srData.inventory || [], data.items || []);
        
        transaction.update(showroomRef, { inventory: nextInventory, lastSync: Date.now() });
        transaction.update(d.ref, { estado: 'Cancelado', cancelReason: 'expired' });
        
        // Update in customer profile if exists
        if (data.customerId && data.customerId !== 'GUEST') {
           const customerOrderRef = doc(db, 'showrooms', showroomId, 'customers', data.customerId, 'orders', d.id);
           transaction.set(customerOrderRef, { estado: 'Cancelado', cancelReason: 'expired' }, { merge: true });
        }
      });
      console.log(`Reserva ${d.id} expirada, stock liberado y pedido cancelado.`);
    } catch (e) {
      console.error(`Error liberando reserva ${d.id}:`, e);
    }
  }
}


