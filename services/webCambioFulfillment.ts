import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { GiftCard, InventoryItem, Sale, SaleItem } from '../types';
import { DatabaseState } from './storage';
import { parseVariantFromDescripcion } from './cartToSale';

export interface WebCambioPayload {
  ventaOriginalId: string;
  itemsDevueltos: SaleItem[];
  itemsNuevos: SaleItem[];
  diferencia: number;
  giftDestinatario?: string;
  customerNombre?: string;
  pago?: { efectivo: number; tarjeta: number };
  costoEnvio?: number;
  costoEnvioDevolucion?: number;
  costoEnvioNuevo?: number;
  tipoEnvioDevolucion?: 'S' | 'D' | 'local' | 'recoleta';
  tipoEnvioNuevo?: 'S' | 'D' | 'local' | 'recoleta';
  codigoPostalCliente?: string;
}

function adjustStockLine(
  item: InventoryItem,
  productId: string,
  qty: number,
  color: string | undefined,
  talle: string | undefined,
  direction: 'add' | 'subtract'
): InventoryItem {
  if (item.id !== productId) return item;

  const sign = direction === 'add' ? 1 : -1;
  let updated = { ...item };

  if (updated.stockPorVariante && talle && color) {
    const varKey = `${talle}-${color}`;
    const matchKey = Object.keys(updated.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
    const nextVariants = { ...updated.stockPorVariante };
    
    const oldVarVal = nextVariants[matchKey] || 0;
    nextVariants[matchKey] = Math.max(0, oldVarVal + sign * qty);
    
    // Also update coloresStock if it exists
    let nextColoresStock = updated.coloresStock ? { ...updated.coloresStock } : undefined;
    if (nextColoresStock && color) {
      const colorKey = Object.keys(nextColoresStock).find(k => k.toLowerCase() === color.trim().toLowerCase()) || color.trim().toUpperCase();
      if (nextColoresStock[colorKey] !== undefined) {
        nextColoresStock[colorKey] = Math.max(0, (nextColoresStock[colorKey] || 0) + sign * qty);
      }
    }

    const diff = nextVariants[matchKey] - oldVarVal;
    return {
      ...updated,
      stockPorVariante: nextVariants,
      ...(nextColoresStock ? { coloresStock: nextColoresStock } : {}),
      cantidad: Math.max(0, updated.cantidad + diff),
    };
  } else {
    const colorKey = color?.trim().toUpperCase();
    if (colorKey && updated.coloresStock && updated.coloresStock[colorKey] !== undefined) {
      const nextStock = { ...updated.coloresStock };
      const oldVal = nextStock[colorKey] || 0;
      nextStock[colorKey] = Math.max(0, oldVal + sign * qty);
      
      const diff = nextStock[colorKey] - oldVal;
      return { ...updated, coloresStock: nextStock, cantidad: Math.max(0, updated.cantidad + diff) };
    }
  }

  return {
    ...item,
    cantidad: Math.max(0, item.cantidad + sign * qty),
  };
}

function applyCambioInventory(
  inventory: InventoryItem[],
  itemsDevueltos: SaleItem[],
  itemsNuevos: SaleItem[]
): InventoryItem[] {
  let next = [...inventory];

  for (const dev of itemsDevueltos) {
    const parsed = parseVariantFromDescripcion(dev.descripcion);
    const color = dev.color || parsed.color;
    const talle = dev.talle || parsed.talle;
    next = next.map((inv) => adjustStockLine(inv, dev.id, dev.cantidad, color, talle, 'add'));
  }

  for (const neu of itemsNuevos) {
    const parsed = parseVariantFromDescripcion(neu.descripcion);
    const color = neu.color || parsed.color;
    const talle = neu.talle || parsed.talle;
    next = next.map((inv) => adjustStockLine(inv, neu.id, neu.cantidad, color, talle, 'subtract'));
  }

  return next;
}

/**
 * Registra un cambio web con la misma lógica que el panel de gestión (Caja).
 */
export async function fulfillWebCambio(
  showroomId: string,
  payload: WebCambioPayload
): Promise<{ saleId: string; giftCodigo?: string }> {
  const {
    ventaOriginalId,
    itemsDevueltos,
    itemsNuevos,
    diferencia,
    giftDestinatario,
  } = payload;

  if (!itemsDevueltos.length) {
    throw new Error('Debés seleccionar al menos una prenda a devolver.');
  }

  const showroomRef = doc(db, 'showrooms', showroomId);
  const saleId = `sale_cambio_web_${Date.now()}`;
  let giftCodigo: string | undefined;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(showroomRef);
    if (!snap.exists()) throw new Error('Showroom no encontrado.');

    const data = snap.data() as DatabaseState;
    const sales = data.sales || [];
    const inventory = data.inventory || [];
    const giftCards = data.giftCards || [];

    const ventaOriginal = sales.find((s) => s.id === ventaOriginalId);
    if (!ventaOriginal) {
      throw new Error('No se encontró la venta original en caja. Confirmá el pedido desde el panel si aún está pendiente.');
    }

    const diasTranscurridos = Math.floor(
      (Date.now() - new Date(ventaOriginal.fecha).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diasTranscurridos > 15) {
      throw new Error('Ya han pasado 15 días desde la compra.');
    }

    const itemsOriginales = ventaOriginal.items ?? [];
    for (const devuelto of itemsDevueltos) {
      const enOriginal = itemsOriginales.find((i) => i.id === devuelto.id);
      if (!enOriginal) {
        throw new Error(`La prenda "${devuelto.descripcion}" no pertenece a la venta original.`);
      }
      if (devuelto.cantidad > enOriginal.cantidad) {
        throw new Error(
          `La cantidad devuelta de "${devuelto.descripcion}" no puede superar la comprada (${enOriginal.cantidad}).`
        );
      }

      const yaDevueltaEn = sales
        .filter((s) => s.tipo === 'cambio' && s.ventaOriginalId === ventaOriginalId)
        .reduce((sum, s) => {
          const prev = (s.itemsDevueltos ?? []).find((i) => i.id === devuelto.id);
          return sum + (prev?.cantidad ?? 0);
        }, 0);

      const disponible = enOriginal.cantidad - yaDevueltaEn;
      if (devuelto.cantidad > disponible) {
        throw new Error(
          `"${devuelto.descripcion}": solo podés devolver ${disponible} unidad(es).`
        );
      }
    }

    for (const itemNuevo of itemsNuevos) {
      const invItem = inventory.find((i) => i.id === itemNuevo.id);
      if (!invItem) throw new Error(`Producto no encontrado en stock: ${itemNuevo.descripcion}`);
      
      const { color, talle } = parseVariantFromDescripcion(itemNuevo.descripcion);

      if (invItem.stockPorVariante && talle && color) {
        const varKey = `${talle}-${color}`;
        const matchKey = Object.keys(invItem.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase());
        if (matchKey) {
          if ((invItem.stockPorVariante[matchKey] || 0) < itemNuevo.cantidad) {
            throw new Error(`Stock insuficiente para variante ${matchKey} de ${itemNuevo.descripcion}`);
          }
        } else {
          if (invItem.cantidad < itemNuevo.cantidad) {
            throw new Error(`Stock insuficiente para ${itemNuevo.descripcion}`);
          }
        }
      } else {
        const colorKey = color?.trim().toUpperCase();
        if (colorKey && invItem.coloresStock && invItem.coloresStock[colorKey] !== undefined) {
          if ((invItem.coloresStock[colorKey] || 0) < itemNuevo.cantidad) {
            throw new Error(`Stock insuficiente para el color ${colorKey} de ${itemNuevo.descripcion}`);
          }
        } else {
          if (invItem.cantidad < itemNuevo.cantidad) {
            throw new Error(`Stock insuficiente para ${itemNuevo.descripcion}`);
          }
        }
      }
    }

    let giftGenerada: GiftCard | undefined;
    if (diferencia < 0) {
      const montoGift = Math.abs(diferencia);
      giftCodigo = `GIFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      giftGenerada = {
        id: `gift_${Date.now()}`,
        codigo: giftCodigo,
        destinatario: giftDestinatario?.trim() || 'Cambio web',
        montoInicial: montoGift,
        saldo: montoGift,
        estado: 'ACTIVA',
        fechaCreacion: new Date().toISOString(),
      };
    }

    const newSale: Sale = {
      id: saleId,
      fecha: new Date().toISOString(),
      tipo: 'cambio',
      ventaOriginalId,
      itemsDevueltos,
      itemsNuevos,
      items: [],
      total: Math.max(0, diferencia),
      diferencia,
      pago: payload.pago || { efectivo: 100, tarjeta: 0 },
      giftDestinatario: giftDestinatario?.trim() || 'Cambio web',
      ...(giftGenerada?.id ? { giftGeneradaId: giftGenerada.id } : {}),
      costoEnvio: payload.costoEnvio,
      costoEnvioDevolucion: payload.costoEnvioDevolucion,
      costoEnvioNuevo: payload.costoEnvioNuevo,
      tipoEnvioDevolucion: payload.tipoEnvioDevolucion,
      tipoEnvioNuevo: payload.tipoEnvioNuevo,
      codigoPostalCliente: payload.codigoPostalCliente,
    };

    const nextInventory = applyCambioInventory(inventory, itemsDevueltos, itemsNuevos);
    const nextGiftCards = giftGenerada ? [...giftCards, giftGenerada] : giftCards;

    const sanitizeForFirestore = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

    transaction.update(showroomRef, sanitizeForFirestore({
      inventory: nextInventory,
      sales: [...sales, newSale],
      giftCards: nextGiftCards,
      lastSync: Date.now(),
    }));
  });

  return { saleId, giftCodigo };
}
