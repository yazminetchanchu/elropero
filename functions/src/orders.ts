import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// db will be initialized inside the functions to prevent app/no-app error during module loading.
// 1. reserveWebOrder (Callable)
// El frontend (carrito) no bloquea nada. Solo lee. 
// Al "Continuar al pago", llama a esta función para reservar.
export const reserveWebOrder = functions.https.onCall(async (data, context) => {
  const db = admin.firestore();
  const { showroomId, orderId, orderData } = data;

  if (!showroomId || !orderId || !orderData || !orderData.items) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: showroomId, orderId or items.');
  }

  const showroomRef = db.collection('showrooms').doc(showroomId);
  const orderRef = showroomRef.collection('orders').doc(orderId);

  // Ejecutamos la reserva de forma atómica en el servidor
  await db.runTransaction(async (transaction) => {
    const srSnap = await transaction.get(showroomRef);
    if (!srSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Showroom no encontrado');
    }

    const srData = srSnap.data() || {};
    const inventory = srData.inventory || [];

    // 1. Verificar stock y deducir temporalmente
    const nextInventory = [...inventory];
    const items = orderData.items;

    for (const oi of items) {
      if (oi.isVirtualGiftCard) continue;

      const idx = nextInventory.findIndex(i => i.id === oi.productId);
      if (idx === -1) {
        throw new functions.https.HttpsError('failed-precondition', `El producto ${oi.descripcion} no existe en el inventario.`);
      }

      const item = { ...nextInventory[idx] };
      const reqQty = oi.cantidad || 1;

      // Descontar por variante si tiene
      if (item.stockPorVariante && oi.talle && oi.color) {
        const varKey = `${oi.talle}-${oi.color}`;
        const matchKey = Object.keys(item.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
        
        const currentQty = item.stockPorVariante[matchKey] || 0;
        if (currentQty < reqQty) {
          throw new functions.https.HttpsError('failed-precondition', `No hay suficiente stock de ${oi.descripcion} (Variante: ${matchKey}). Disponible: ${currentQty}, Requerido: ${reqQty}`);
        }
        item.stockPorVariante = { ...item.stockPorVariante };
        item.stockPorVariante[matchKey] -= reqQty;

        if (item.coloresStock && oi.color) {
          const cKey = Object.keys(item.coloresStock).find(k => k.toLowerCase() === oi.color.trim().toLowerCase()) || oi.color.trim().toUpperCase();
          if (item.coloresStock[cKey] !== undefined) {
            item.coloresStock = { ...item.coloresStock };
            item.coloresStock[cKey] -= reqQty;
          }
        }
        item.cantidad -= reqQty;
      } else {
        // Descontar color genérico
        const colorKey = oi.color?.trim().toUpperCase();
        if (colorKey && item.coloresStock && item.coloresStock[colorKey] !== undefined) {
          if (item.coloresStock[colorKey] < reqQty) {
            throw new functions.https.HttpsError('failed-precondition', `No hay suficiente stock de ${oi.descripcion} en color ${colorKey}. Disponible: ${item.coloresStock[colorKey]}, Requerido: ${reqQty}`);
          }
          item.coloresStock = { ...item.coloresStock };
          item.coloresStock[colorKey] -= reqQty;
          item.cantidad -= reqQty;
        } else {
          // Descuento global
          if (item.cantidad < reqQty) {
            throw new functions.https.HttpsError('failed-precondition', `No hay suficiente stock general de ${oi.descripcion}. Disponible: ${item.cantidad}, Requerido: ${reqQty}`);
          }
          item.cantidad -= reqQty;
        }
      }

      nextInventory[idx] = item;
    }

    // 2. Establecer expiración a 15 minutos y estado PENDING_PAYMENT
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const finalOrderData = {
      ...orderData,
      estado: 'PENDING_PAYMENT',
      expiresAt
    };

    // 3. Escribir actualizaciones
    transaction.update(showroomRef, { inventory: nextInventory, lastSync: Date.now() });
    transaction.set(orderRef, finalOrderData);

    if (orderData.customerId && orderData.customerId !== 'GUEST') {
      const customerOrderRef = showroomRef.collection('customers').doc(orderData.customerId).collection('orders').doc(orderId);
      transaction.set(customerOrderRef, finalOrderData);
    }
  });

  return { success: true, message: 'Stock reservado con éxito.' };
});

// 2. releaseExpiredReservationsCron (PubSub Cron)
// Ejecuta cada 5 minutos para buscar órdenes expiradas y devolver el stock.
export const releaseExpiredReservationsCron = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
  const db = admin.firestore();
  const showroomId = process.env.SHOWROOM_ID || 'ROPERO';
  const showroomRef = db.collection('showrooms').doc(showroomId);
  const ordersCol = showroomRef.collection('orders');
  
  const now = Date.now();
  
  // Buscar órdenes en estado PENDING_PAYMENT o Pendiente
  const allOrdersSnap = await ordersCol.get();
  const expiredDocs = allOrdersSnap.docs.filter(docSnap => {
    const data = docSnap.data();
    const isPending = data.estado === 'PENDING_PAYMENT' || data.estado === 'Pendiente';
    if (!isPending) return false;

    if (data.expiresAt) {
      return new Date(data.expiresAt).getTime() < now;
    }
    if (data.fecha) {
      const fechaMs = new Date(data.fecha).getTime();
      if (!isNaN(fechaMs)) {
        return (now - fechaMs) > 15 * 60 * 1000;
      }
    }
    return false;
  });

  if (expiredDocs.length === 0) {
    console.log('[Cron] No hay reservas expiradas.');
    return null;
  }

  console.log(`[Cron] Encontradas ${expiredDocs.length} reservas expiradas. Procesando...`);

  // Devolvemos el stock orden por orden usando transacciones
  for (const docSnap of expiredDocs) {

    const data = docSnap.data();
    
    try {
      await db.runTransaction(async (transaction) => {
        const srSnap = await transaction.get(showroomRef);
        if (!srSnap.exists) return;

        const srData = srSnap.data() || {};
        const inventory = srData.inventory || [];
        const nextInventory = [...inventory];
        const items = data.items || [];

        for (const oi of items) {
          if (oi.isVirtualGiftCard) continue;

          const idx = nextInventory.findIndex(i => i.id === oi.productId);
          if (idx === -1) continue;

          const item = { ...nextInventory[idx] };
          const returnQty = oi.cantidad || 1;

          if (item.stockPorVariante && oi.talle && oi.color) {
            const varKey = `${oi.talle}-${oi.color}`;
            const matchKey = Object.keys(item.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
            
            item.stockPorVariante = { ...item.stockPorVariante };
            item.stockPorVariante[matchKey] = (item.stockPorVariante[matchKey] || 0) + returnQty;

            if (item.coloresStock && oi.color) {
              const cKey = Object.keys(item.coloresStock).find(k => k.toLowerCase() === oi.color.trim().toLowerCase()) || oi.color.trim().toUpperCase();
              item.coloresStock = { ...item.coloresStock };
              item.coloresStock[cKey] = (item.coloresStock[cKey] || 0) + returnQty;
            }
            item.cantidad += returnQty;
          } else {
            const colorKey = oi.color?.trim().toUpperCase();
            if (colorKey && item.coloresStock && item.coloresStock[colorKey] !== undefined) {
              item.coloresStock = { ...item.coloresStock };
              item.coloresStock[colorKey] = (item.coloresStock[colorKey] || 0) + returnQty;
            }
            item.cantidad += returnQty;
          }

          nextInventory[idx] = item;
        }

        // Marcar como Cancelado
        transaction.update(showroomRef, { inventory: nextInventory, lastSync: Date.now() });
        transaction.update(docSnap.ref, { estado: 'Cancelado', cancelReason: 'expired' });

        if (data.customerId && data.customerId !== 'GUEST') {
           const customerOrderRef = showroomRef.collection('customers').doc(data.customerId).collection('orders').doc(docSnap.id);
           transaction.set(customerOrderRef, { estado: 'Cancelado', cancelReason: 'expired' }, { merge: true });
        }
      });
      console.log(`[Cron] Reserva ${docSnap.id} cancelada. Stock devuelto.`);
    } catch (e) {
      console.error(`[Cron] Error al cancelar reserva ${docSnap.id}:`, e);
    }
  }

  return null;
});

// ── Helper: parse variant from description (replicates frontend cartToSale.ts) ──
function parseVariantFromDescripcion(descripcion: string): { color?: string; talle?: string } {
  const colorMatch = descripcion.match(/\(.*?C:([^\s)]+)/i);
  const talleMatch = descripcion.match(/\(.*?T:([^\s)]+)/i);
  return {
    color: colorMatch?.[1]?.trim().toUpperCase(),
    talle: talleMatch?.[1]?.trim(),
  };
}

// ── Helper: adjust a single inventory line's stock ──
function adjustStockLine(
  item: any,
  productId: string,
  qty: number,
  color: string | undefined,
  talle: string | undefined,
  direction: 'add' | 'subtract'
): any {
  if (item.id !== productId) return item;

  const sign = direction === 'add' ? 1 : -1;
  let updated = { ...item };

  if (updated.stockPorVariante && talle && color) {
    const varKey = `${talle}-${color}`;
    const matchKey = Object.keys(updated.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
    const nextVariants = { ...updated.stockPorVariante };

    const oldVarVal = nextVariants[matchKey] || 0;
    nextVariants[matchKey] = Math.max(0, oldVarVal + sign * qty);

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

// 3. fulfillWebCambioServer (Callable)
// Procesa un cambio web de forma atómica en el backend, evitando restricciones
// de security rules que impiden que usuarios no-admin modifiquen sales y giftCards.
export const fulfillWebCambioServer = functions.https.onCall(async (data, context) => {
  const db = admin.firestore();
  const { showroomId, payload } = data;

  if (!showroomId || !payload) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: showroomId or payload.');
  }

  const {
    ventaOriginalId,
    itemsDevueltos,
    itemsNuevos,
    diferencia,
    giftDestinatario,
  } = payload;

  if (!itemsDevueltos || !itemsDevueltos.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Debés seleccionar al menos una prenda a devolver.');
  }

  const showroomRef = db.collection('showrooms').doc(showroomId);
  const saleId = `sale_cambio_web_${Date.now()}`;
  let giftCodigo: string | undefined;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(showroomRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Showroom no encontrado.');
    }

    const srData = snap.data() || {};
    const sales = srData.sales || [];
    const inventory = srData.inventory || [];
    const giftCards = srData.giftCards || [];

    // Validate original sale exists
    const ventaOriginal = sales.find((s: any) => s.id === ventaOriginalId);
    if (!ventaOriginal) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No se encontró la venta original en caja. Confirmá el pedido desde el panel si aún está pendiente.'
      );
    }

    // Validate 15-day window
    const diasTranscurridos = Math.floor(
      (Date.now() - new Date(ventaOriginal.fecha).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diasTranscurridos > 15) {
      throw new functions.https.HttpsError('failed-precondition', 'Ya han pasado 15 días desde la compra.');
    }

    // Validate returned items belong to original sale
    const itemsOriginales = ventaOriginal.items ?? [];
    for (const devuelto of itemsDevueltos) {
      const enOriginal = itemsOriginales.find((i: any) => i.id === devuelto.id);
      if (!enOriginal) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `La prenda "${devuelto.descripcion}" no pertenece a la venta original.`
        );
      }
      if (devuelto.cantidad > enOriginal.cantidad) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `La cantidad devuelta de "${devuelto.descripcion}" no puede superar la comprada (${enOriginal.cantidad}).`
        );
      }

      const yaDevueltaEn = sales
        .filter((s: any) => s.tipo === 'cambio' && s.ventaOriginalId === ventaOriginalId)
        .reduce((sum: number, s: any) => {
          const prev = (s.itemsDevueltos ?? []).find((i: any) => i.id === devuelto.id);
          return sum + (prev?.cantidad ?? 0);
        }, 0);

      const disponible = enOriginal.cantidad - yaDevueltaEn;
      if (devuelto.cantidad > disponible) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `"${devuelto.descripcion}": solo podés devolver ${disponible} unidad(es).`
        );
      }
    }

    // Validate stock for new items
    const safeItemsNuevos = itemsNuevos || [];
    for (const itemNuevo of safeItemsNuevos) {
      const invItem = inventory.find((i: any) => i.id === itemNuevo.id);
      if (!invItem) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Producto no encontrado en stock: ${itemNuevo.descripcion}`
        );
      }

      const { color, talle } = parseVariantFromDescripcion(itemNuevo.descripcion);

      if (invItem.stockPorVariante && talle && color) {
        const varKey = `${talle}-${color}`;
        const matchKey = Object.keys(invItem.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase());
        if (matchKey) {
          if ((invItem.stockPorVariante[matchKey] || 0) < itemNuevo.cantidad) {
            throw new functions.https.HttpsError('failed-precondition', `Stock insuficiente para variante ${matchKey} de ${itemNuevo.descripcion}`);
          }
        } else {
          if (invItem.cantidad < itemNuevo.cantidad) {
            throw new functions.https.HttpsError('failed-precondition', `Stock insuficiente para ${itemNuevo.descripcion}`);
          }
        }
      } else {
        const colorKey = color?.trim().toUpperCase();
        if (colorKey && invItem.coloresStock && invItem.coloresStock[colorKey] !== undefined) {
          if ((invItem.coloresStock[colorKey] || 0) < itemNuevo.cantidad) {
            throw new functions.https.HttpsError('failed-precondition', `Stock insuficiente para el color ${colorKey} de ${itemNuevo.descripcion}`);
          }
        } else {
          if (invItem.cantidad < itemNuevo.cantidad) {
            throw new functions.https.HttpsError('failed-precondition', `Stock insuficiente para ${itemNuevo.descripcion}`);
          }
        }
      }
    }

    // Generate gift card if diferencia < 0
    let giftGenerada: any;
    let medioPagoOrigen: 'efectivo' | 'tarjeta' | 'mixto' = 'efectivo';
    if (ventaOriginal?.pago) {
      if (ventaOriginal.pago.tarjeta === 100) medioPagoOrigen = 'tarjeta';
      else if (ventaOriginal.pago.efectivo === 100) medioPagoOrigen = 'efectivo';
      else medioPagoOrigen = 'mixto';
    } else if (ventaOriginal?.metodoPago) {
      const mp = String(ventaOriginal.metodoPago).toLowerCase();
      if (mp.includes('tarjeta') || mp.includes('uala') || mp.includes('crédito') || mp.includes('debito')) {
        medioPagoOrigen = 'tarjeta';
      } else {
        medioPagoOrigen = 'efectivo';
      }
    }

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
        medioPagoOrigen,
        ventaOrigenId: ventaOriginalId,
      };
    }

    // Default payment from original sale if diferencia <= 0
    const pagoDefaultOrig = ventaOriginal?.pago || (medioPagoOrigen === 'tarjeta' ? { efectivo: 0, tarjeta: 100 } : { efectivo: 100, tarjeta: 0 });

    // Build the sale record
    const newSale: any = {
      id: saleId,
      fecha: new Date().toISOString(),
      tipo: 'cambio',
      ventaOriginalId,
      itemsDevueltos,
      itemsNuevos: safeItemsNuevos,
      items: [],
      total: Math.max(0, diferencia),
      diferencia,
      pago: diferencia <= 0 ? pagoDefaultOrig : (payload.pago || { efectivo: 100, tarjeta: 0 }),
      pagoDevolucion: pagoDefaultOrig,
      giftDestinatario: giftDestinatario?.trim() || 'Cambio web',
      ...(giftGenerada?.id ? { giftGeneradaId: giftGenerada.id } : {}),
      costoEnvio: payload.costoEnvio ?? 0,
      costoEnvioDevolucion: payload.costoEnvioDevolucion ?? 0,
      costoEnvioNuevo: payload.costoEnvioNuevo ?? 0,
      tipoEnvioDevolucion: payload.tipoEnvioDevolucion,
      tipoEnvioNuevo: payload.tipoEnvioNuevo,
      codigoPostalCliente: payload.codigoPostalCliente,
    };

    // Apply inventory changes
    let nextInventory = [...inventory];
    for (const dev of itemsDevueltos) {
      const parsed = parseVariantFromDescripcion(dev.descripcion);
      const color = dev.color || parsed.color;
      const talle = dev.talle || parsed.talle;
      nextInventory = nextInventory.map((inv: any) => adjustStockLine(inv, dev.id, dev.cantidad, color, talle, 'add'));
    }
    for (const neu of safeItemsNuevos) {
      const parsed = parseVariantFromDescripcion(neu.descripcion);
      const color = neu.color || parsed.color;
      const talle = neu.talle || parsed.talle;
      nextInventory = nextInventory.map((inv: any) => adjustStockLine(inv, neu.id, neu.cantidad, color, talle, 'subtract'));
    }

    const nextGiftCards = giftGenerada ? [...giftCards, giftGenerada] : giftCards;

    // Remove undefined values (Firestore doesn't accept them)
    const sanitize = (obj: any): any => JSON.parse(JSON.stringify(obj));

    transaction.update(showroomRef, sanitize({
      inventory: nextInventory,
      sales: [...sales, newSale],
      giftCards: nextGiftCards,
      lastSync: Date.now(),
    }));
  });

  return { saleId, giftCodigo: giftCodigo || null };
});
