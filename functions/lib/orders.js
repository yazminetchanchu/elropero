"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fulfillWebOrderServer = exports.fulfillWebCambioServer = exports.cancelWebOrderReservationServer = exports.releaseExpiredReservationsServer = exports.releaseExpiredReservationsCron = exports.reserveWebOrder = void 0;
exports.recalculateOrderPricing = recalculateOrderPricing;
exports.executeReleaseExpiredReservations = executeReleaseExpiredReservations;
exports.extractProductModelKeyServer = extractProductModelKeyServer;
exports.calcExchangeLineTotalServer = calcExchangeLineTotalServer;
exports.calculateExchangeBreakdownServer = calculateExchangeBreakdownServer;
exports.executeFulfillWebCambio = executeFulfillWebCambio;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
// db will be initialized inside the functions to prevent app/no-app error during module loading.
const DESCUENTO_BASE_TRANSFERENCIA = 20;
/**
 * Recalcula y valida los precios unitarios, descuentos y total de una orden
 * contrastando directamente contra el catálogo oficial e inventario en Firestore.
 */
function recalculateOrderPricing(showroomData, orderData) {
    const inventory = showroomData.inventory || [];
    const webSettings = showroomData.webSettings || showroomData.settings || {};
    const giftCards = showroomData.giftCards || [];
    const isTransfer = orderData.metodoPago === 'Transferencia' ||
        orderData.paymentMethod === 'transferencia' ||
        orderData.estado === 'pending_transfer' ||
        (orderData.pago && orderData.pago.efectivo === 100);
    const rawItems = Array.isArray(orderData.items) ? orderData.items : [];
    let calculatedSubtotal = 0;
    const verifiedItems = rawItems.map((oi) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const qty = Math.max(1, Number(oi.cantidad || 1));
        if (oi.isVirtualGiftCard) {
            const baseMonto = Math.max(5000, Number(oi.precioUnitario || oi.monto || 5000));
            const unitPrice = isTransfer
                ? baseMonto
                : Math.round(baseMonto / (1 - DESCUENTO_BASE_TRANSFERENCIA / 100));
            calculatedSubtotal += unitPrice * qty;
            return Object.assign(Object.assign({}, oi), { cantidad: qty, precioUnitario: unitPrice, precioEfectivo: baseMonto, precioTarjeta: Math.round(baseMonto / (1 - DESCUENTO_BASE_TRANSFERENCIA / 100)), costo: 0 });
        }
        const invItem = inventory.find((i) => i.id === (oi.productId || oi.id));
        if (!invItem) {
            throw new functions.https.HttpsError('not-found', `El producto "${oi.descripcion || oi.productId}" no existe en el catálogo.`);
        }
        const basePrice = isTransfer
            ? Number((_b = (_a = invItem.ventaEfectivo) !== null && _a !== void 0 ? _a : invItem.precioEfectivo) !== null && _b !== void 0 ? _b : 0)
            : Number((_e = (_d = (_c = invItem.ventaTarjeta) !== null && _c !== void 0 ? _c : invItem.precioTarjeta) !== null && _d !== void 0 ? _d : invItem.ventaEfectivo) !== null && _e !== void 0 ? _e : 0);
        const itemDisc = Number(invItem.descuentoWeb || 0);
        const sectionDisc = Number(((_f = webSettings.discountBySection) === null || _f === void 0 ? void 0 : _f[invItem.categoria]) || 0);
        const disc = Math.max(itemDisc, sectionDisc);
        let calculatedUnitPrice;
        if (isTransfer) {
            const extraDesc = Math.max(0, disc - DESCUENTO_BASE_TRANSFERENCIA);
            calculatedUnitPrice = Math.round(basePrice * (1 - extraDesc / 100));
        }
        else {
            calculatedUnitPrice = disc > 0 ? Math.round(basePrice * (1 - disc / 100)) : basePrice;
        }
        calculatedSubtotal += calculatedUnitPrice * qty;
        return Object.assign(Object.assign({}, oi), { productId: invItem.id, sku: invItem.sku || oi.sku || '---', descripcion: invItem.descripcion, costo: (_g = invItem.costo) !== null && _g !== void 0 ? _g : 0, cantidad: qty, precioUnitario: calculatedUnitPrice, precioEfectivo: isTransfer ? calculatedUnitPrice : Number((_h = invItem.ventaEfectivo) !== null && _h !== void 0 ? _h : calculatedUnitPrice), precioTarjeta: !isTransfer ? calculatedUnitPrice : Number((_j = invItem.ventaTarjeta) !== null && _j !== void 0 ? _j : calculatedUnitPrice), descuento: disc });
    });
    const tipoEnvio = String(orderData.tipoEnvio || '').toLowerCase();
    let costoEnvio = 0;
    if (tipoEnvio !== 'retiro' && tipoEnvio !== 'recoleta' && tipoEnvio !== 'local' && tipoEnvio !== 'showroom') {
        costoEnvio = Math.max(0, Number(orderData.costoEnvio || 0));
    }
    let montoGiftCardUsado = 0;
    let verifiedGiftCardUsada = undefined;
    if (orderData.giftCardUsada && orderData.giftCardUsada.codigo) {
        const code = String(orderData.giftCardUsada.codigo).trim().toUpperCase();
        const gc = giftCards.find((g) => (g.codigo || '').trim().toUpperCase() === code);
        if (gc && gc.estado === 'ACTIVA' && gc.saldo > 0) {
            const maxAvailable = Math.min(Number(gc.saldo || 0), calculatedSubtotal + costoEnvio);
            montoGiftCardUsado = Math.min(Number(orderData.giftCardUsada.montoUsado || maxAvailable), maxAvailable);
            verifiedGiftCardUsada = {
                codigo: code,
                montoUsado: montoGiftCardUsado,
            };
        }
    }
    const calculatedTotal = Math.max(0, Math.round(calculatedSubtotal + costoEnvio - montoGiftCardUsado));
    return {
        items: verifiedItems,
        subtotal: calculatedSubtotal,
        costoEnvio,
        montoGiftCardUsado,
        giftCardUsada: verifiedGiftCardUsada,
        total: calculatedTotal,
    };
}
// 1. reserveWebOrder (Callable)
// El frontend (carrito) no bloquea nada. Solo lee. 
// Al "Continuar al pago", llama a esta función para reservar.
exports.reserveWebOrder = functions.https.onCall(async (data, context) => {
    const db = admin.firestore();
    const { showroomId, orderId, orderData } = data;
    if (!showroomId || !orderId || !orderData || !orderData.items) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: showroomId, orderId or items.');
    }
    const showroomRef = db.collection('showrooms').doc(showroomId);
    const orderRef = showroomRef.collection('orders').doc(orderId);
    // Ejecutamos la reserva de forma atómica en el servidor
    await db.runTransaction(async (transaction) => {
        var _a;
        const srSnap = await transaction.get(showroomRef);
        if (!srSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Showroom no encontrado');
        }
        const srData = srSnap.data() || {};
        const inventory = srData.inventory || [];
        // Recalcular y validar precios contra catálogo oficial en el servidor (Anti-Price Tampering)
        const pricing = recalculateOrderPricing(srData, orderData);
        const sanitizedOrderData = Object.assign(Object.assign(Object.assign({}, orderData), { items: pricing.items, costoEnvio: pricing.costoEnvio, total: pricing.total }), (pricing.giftCardUsada !== undefined ? { giftCardUsada: pricing.giftCardUsada } : {}));
        // ── Idempotencia: si la orden ya fue reservada, actualizar con precios verificados sin duplicar descuento de stock ──
        const existingOrderSnap = await transaction.get(orderRef);
        if (existingOrderSnap.exists) {
            const existingData = existingOrderSnap.data() || {};
            if (existingData.estado === 'PENDING_PAYMENT' || existingData.estado === 'pending_transfer' || existingData.estado === 'Confirmado') {
                console.log(`[reserveWebOrder] Orden ${orderId} ya está en estado '${existingData.estado}'. Actualizando datos con precios verificados.`);
                const mergedData = Object.assign(Object.assign(Object.assign({}, existingData), sanitizedOrderData), { estado: sanitizedOrderData.estado || existingData.estado, expiresAt: sanitizedOrderData.expiresAt || existingData.expiresAt });
                transaction.set(orderRef, mergedData, { merge: true });
                if (sanitizedOrderData.customerId && sanitizedOrderData.customerId !== 'GUEST') {
                    const customerOrderRef = showroomRef.collection('customers').doc(sanitizedOrderData.customerId).collection('orders').doc(orderId);
                    transaction.set(customerOrderRef, mergedData, { merge: true });
                }
                return; // Stock ya fue descontado previamente
            }
        }
        // 1. Verificar stock y deducir temporalmente
        const nextInventory = [...inventory];
        const items = sanitizedOrderData.items;
        for (const oi of items) {
            if (oi.isVirtualGiftCard)
                continue;
            const idx = nextInventory.findIndex(i => i.id === oi.productId);
            if (idx === -1) {
                throw new functions.https.HttpsError('not-found', `El producto ${oi.descripcion} ya no existe en el catálogo.`);
            }
            const item = Object.assign({}, nextInventory[idx]);
            const reqQty = oi.cantidad || 1;
            // Descuento específico por variante
            if (item.stockPorVariante && oi.talle && oi.color) {
                const varKey = `${oi.talle}-${oi.color}`;
                const matchKey = Object.keys(item.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
                const currentVarStock = item.stockPorVariante[matchKey] || 0;
                if (currentVarStock < reqQty) {
                    throw new functions.https.HttpsError('failed-precondition', `No hay suficiente stock para la variante ${oi.talle} / ${oi.color} de ${item.descripcion}. Disponible: ${currentVarStock}, Requerido: ${reqQty}`);
                }
                item.stockPorVariante = Object.assign({}, item.stockPorVariante);
                item.stockPorVariante[matchKey] -= reqQty;
                if (item.coloresStock && oi.color) {
                    const cKey = Object.keys(item.coloresStock).find(k => k.toLowerCase() === oi.color.trim().toLowerCase()) || oi.color.trim().toUpperCase();
                    item.coloresStock = Object.assign({}, item.coloresStock);
                    item.coloresStock[cKey] = (item.coloresStock[cKey] || 0) - reqQty;
                }
                item.cantidad -= reqQty;
            }
            else {
                // Descuento por color o general
                const colorKey = (_a = oi.color) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase();
                if (colorKey && item.coloresStock && item.coloresStock[colorKey] !== undefined) {
                    if (item.coloresStock[colorKey] < reqQty) {
                        throw new functions.https.HttpsError('failed-precondition', `No hay suficiente stock para el color ${oi.color} de ${item.descripcion}. Disponible: ${item.coloresStock[colorKey]}, Requerido: ${reqQty}`);
                    }
                    item.coloresStock = Object.assign({}, item.coloresStock);
                    item.coloresStock[colorKey] -= reqQty;
                    item.cantidad -= reqQty;
                }
                else {
                    // Descuento global
                    if (item.cantidad < reqQty) {
                        throw new functions.https.HttpsError('failed-precondition', `No hay suficiente stock general de ${oi.descripcion}. Disponible: ${item.cantidad}, Requerido: ${reqQty}`);
                    }
                    item.cantidad -= reqQty;
                }
            }
            nextInventory[idx] = item;
        }
        // 2. Establecer expiración y estado
        // Transferencia: 24 horas (pending_transfer). Tarjeta/Ualá Bis: 15 minutos (PENDING_PAYMENT).
        const isTransfer = sanitizedOrderData.metodoPago === 'Transferencia' || sanitizedOrderData.paymentMethod === 'transferencia' || sanitizedOrderData.estado === 'pending_transfer';
        const targetEstado = isTransfer ? 'pending_transfer' : (sanitizedOrderData.estado || 'PENDING_PAYMENT');
        const expirationDurationMs = isTransfer ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
        const expiresAt = new Date(Date.now() + expirationDurationMs).toISOString();
        const finalOrderData = Object.assign(Object.assign({}, sanitizedOrderData), { estado: targetEstado, expiresAt });
        // 3. Escribir actualizaciones
        transaction.update(showroomRef, { inventory: nextInventory, lastSync: Date.now() });
        transaction.set(orderRef, finalOrderData);
        if (sanitizedOrderData.customerId && sanitizedOrderData.customerId !== 'GUEST') {
            const customerOrderRef = showroomRef.collection('customers').doc(sanitizedOrderData.customerId).collection('orders').doc(orderId);
            transaction.set(customerOrderRef, finalOrderData);
        }
    });
    return { success: true, message: 'Stock reservado con éxito.' };
});
// ── Core: Liberación de reservas vencidas (compartida entre Cron y Callable) ──
async function executeReleaseExpiredReservations(db, showroomId) {
    const showroomRef = db.collection('showrooms').doc(showroomId);
    const ordersCol = showroomRef.collection('orders');
    const now = Date.now();
    // Buscar órdenes en estado PENDING_PAYMENT, pending_transfer o Pendiente
    const allOrdersSnap = await ordersCol.get();
    const expiredDocs = allOrdersSnap.docs.filter(docSnap => {
        const data = docSnap.data();
        const isPending = data.estado === 'PENDING_PAYMENT' || data.estado === 'pending_transfer' || data.estado === 'Pendiente';
        if (!isPending)
            return false;
        if (data.expiresAt) {
            return new Date(data.expiresAt).getTime() < now;
        }
        if (data.fecha) {
            const fechaMs = new Date(data.fecha).getTime();
            if (!isNaN(fechaMs)) {
                const durationLimitMs = data.estado === 'pending_transfer' ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
                return (now - fechaMs) > durationLimitMs;
            }
        }
        return false;
    });
    if (expiredDocs.length === 0) {
        console.log(`[ReleaseExpired] No hay reservas expiradas para el showroom ${showroomId}.`);
        return { releasedCount: 0, success: true };
    }
    console.log(`[ReleaseExpired] Encontradas ${expiredDocs.length} reservas expiradas en ${showroomId}. Procesando...`);
    let releasedCount = 0;
    // Devolvemos el stock orden por orden usando transacciones
    for (const docSnap of expiredDocs) {
        const data = docSnap.data();
        try {
            await db.runTransaction(async (transaction) => {
                var _a;
                const freshDoc = await transaction.get(docSnap.ref);
                if (!freshDoc.exists)
                    return;
                const freshData = freshDoc.data() || {};
                const isStillPending = freshData.estado === 'PENDING_PAYMENT' || freshData.estado === 'pending_transfer' || freshData.estado === 'Pendiente';
                if (!isStillPending)
                    return;
                const srSnap = await transaction.get(showroomRef);
                if (!srSnap.exists)
                    return;
                const srData = srSnap.data() || {};
                const inventory = srData.inventory || [];
                const nextInventory = [...inventory];
                const items = data.items || [];
                for (const oi of items) {
                    if (oi.isVirtualGiftCard)
                        continue;
                    const idx = nextInventory.findIndex(i => i.id === oi.productId);
                    if (idx === -1)
                        continue;
                    const item = Object.assign({}, nextInventory[idx]);
                    const returnQty = oi.cantidad || 1;
                    if (item.stockPorVariante && oi.talle && oi.color) {
                        const varKey = `${oi.talle}-${oi.color}`;
                        const matchKey = Object.keys(item.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
                        item.stockPorVariante = Object.assign({}, item.stockPorVariante);
                        item.stockPorVariante[matchKey] = (item.stockPorVariante[matchKey] || 0) + returnQty;
                        if (item.coloresStock && oi.color) {
                            const cKey = Object.keys(item.coloresStock).find(k => k.toLowerCase() === oi.color.trim().toLowerCase()) || oi.color.trim().toUpperCase();
                            item.coloresStock = Object.assign({}, item.coloresStock);
                            item.coloresStock[cKey] = (item.coloresStock[cKey] || 0) + returnQty;
                        }
                        item.cantidad += returnQty;
                    }
                    else {
                        const colorKey = (_a = oi.color) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase();
                        if (colorKey && item.coloresStock && item.coloresStock[colorKey] !== undefined) {
                            item.coloresStock = Object.assign({}, item.coloresStock);
                            item.coloresStock[colorKey] = (item.coloresStock[colorKey] || 0) + returnQty;
                        }
                        item.cantidad += returnQty;
                    }
                    nextInventory[idx] = item;
                }
                // Marcar como Cancelado y devolver stock restaurado al showroom
                transaction.update(showroomRef, { inventory: nextInventory, lastSync: Date.now() });
                transaction.update(docSnap.ref, { estado: 'Cancelado', cancelReason: 'expired' });
                if (data.customerId && data.customerId !== 'GUEST') {
                    const customerOrderRef = showroomRef.collection('customers').doc(data.customerId).collection('orders').doc(docSnap.id);
                    transaction.set(customerOrderRef, { estado: 'Cancelado', cancelReason: 'expired' }, { merge: true });
                }
            });
            releasedCount++;
            console.log(`[ReleaseExpired] Reserva ${docSnap.id} cancelada y stock restaurado.`);
        }
        catch (e) {
            console.error(`[ReleaseExpired] Error al cancelar reserva ${docSnap.id}:`, e);
        }
    }
    return { releasedCount, success: true };
}
// 2. releaseExpiredReservationsCron (PubSub Cron)
// Ejecuta cada 5 minutos para buscar órdenes expiradas y devolver el stock.
exports.releaseExpiredReservationsCron = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    const db = admin.firestore();
    const showroomId = process.env.SHOWROOM_ID || 'ROPERO';
    await executeReleaseExpiredReservations(db, showroomId);
    return null;
});
// 2b. releaseExpiredReservationsServer (Callable HTTPS)
// Endpoint seguro bajo demanda para clientes frontend (evita violaciones de reglas de seguridad de Firestore)
exports.releaseExpiredReservationsServer = functions.https.onCall(async (data, context) => {
    const db = admin.firestore();
    const showroomId = (data === null || data === void 0 ? void 0 : data.showroomId) || process.env.SHOWROOM_ID || 'ROPERO';
    const result = await executeReleaseExpiredReservations(db, showroomId);
    return result;
});
// 2c. cancelWebOrderReservationServer (Callable HTTPS)
// Cancela una reserva activa específica inmediatamente y restituye el stock al inventario
exports.cancelWebOrderReservationServer = functions.https.onCall(async (data, context) => {
    const db = admin.firestore();
    const { showroomId, orderId } = data || {};
    if (!showroomId || !orderId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing showroomId or orderId');
    }
    const showroomRef = db.collection('showrooms').doc(showroomId);
    const orderRef = showroomRef.collection('orders').doc(orderId);
    await db.runTransaction(async (transaction) => {
        var _a;
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists)
            return;
        const orderData = orderSnap.data() || {};
        const isPending = orderData.estado === 'PENDING_PAYMENT' || orderData.estado === 'pending_transfer' || orderData.estado === 'Pendiente';
        if (!isPending)
            return;
        const srSnap = await transaction.get(showroomRef);
        if (!srSnap.exists)
            return;
        const srData = srSnap.data() || {};
        const inventory = srData.inventory || [];
        const nextInventory = [...inventory];
        const items = orderData.items || [];
        for (const oi of items) {
            if (oi.isVirtualGiftCard)
                continue;
            const idx = nextInventory.findIndex(i => i.id === oi.productId);
            if (idx === -1)
                continue;
            const item = Object.assign({}, nextInventory[idx]);
            const returnQty = oi.cantidad || 1;
            if (item.stockPorVariante && oi.talle && oi.color) {
                const varKey = `${oi.talle}-${oi.color}`;
                const matchKey = Object.keys(item.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
                item.stockPorVariante = Object.assign({}, item.stockPorVariante);
                item.stockPorVariante[matchKey] = (item.stockPorVariante[matchKey] || 0) + returnQty;
                if (item.coloresStock && oi.color) {
                    const cKey = Object.keys(item.coloresStock).find(k => k.toLowerCase() === oi.color.trim().toLowerCase()) || oi.color.trim().toUpperCase();
                    item.coloresStock = Object.assign({}, item.coloresStock);
                    item.coloresStock[cKey] = (item.coloresStock[cKey] || 0) + returnQty;
                }
                item.cantidad += returnQty;
            }
            else {
                const colorKey = (_a = oi.color) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase();
                if (colorKey && item.coloresStock && item.coloresStock[colorKey] !== undefined) {
                    item.coloresStock = Object.assign({}, item.coloresStock);
                    item.coloresStock[colorKey] = (item.coloresStock[colorKey] || 0) + returnQty;
                }
                item.cantidad += returnQty;
            }
            nextInventory[idx] = item;
        }
        transaction.update(showroomRef, { inventory: nextInventory, lastSync: Date.now() });
        transaction.update(orderRef, { estado: 'Cancelado', cancelReason: 'user_cancelled', updatedAt: new Date().toISOString() });
        if (orderData.customerId && orderData.customerId !== 'GUEST') {
            const customerOrderRef = showroomRef.collection('customers').doc(orderData.customerId).collection('orders').doc(orderId);
            transaction.set(customerOrderRef, { estado: 'Cancelado', cancelReason: 'user_cancelled', updatedAt: new Date().toISOString() }, { merge: true });
        }
    });
    return { success: true, message: 'Reserva cancelada y stock restituido exitosamente.' };
});
// ── Helper: parse variant from description (replicates frontend cartToSale.ts) ──
function parseVariantFromDescripcion(descripcion) {
    var _a, _b;
    const colorMatch = descripcion.match(/\(.*?C:([^\s)]+)/i);
    const talleMatch = descripcion.match(/\(.*?T:([^\s)]+)/i);
    return {
        color: (_a = colorMatch === null || colorMatch === void 0 ? void 0 : colorMatch[1]) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase(),
        talle: (_b = talleMatch === null || talleMatch === void 0 ? void 0 : talleMatch[1]) === null || _b === void 0 ? void 0 : _b.trim(),
    };
}
// ── Helper: adjust a single inventory line's stock ──
function adjustStockLine(item, productId, qty, color, talle, direction) {
    if (item.id !== productId)
        return item;
    const sign = direction === 'add' ? 1 : -1;
    let updated = Object.assign({}, item);
    if (updated.stockPorVariante && talle && color) {
        const varKey = `${talle}-${color}`;
        const matchKey = Object.keys(updated.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
        const nextVariants = Object.assign({}, updated.stockPorVariante);
        const oldVarVal = nextVariants[matchKey] || 0;
        nextVariants[matchKey] = Math.max(0, oldVarVal + sign * qty);
        let nextColoresStock = updated.coloresStock ? Object.assign({}, updated.coloresStock) : undefined;
        if (nextColoresStock && color) {
            const colorKey = Object.keys(nextColoresStock).find(k => k.toLowerCase() === color.trim().toLowerCase()) || color.trim().toUpperCase();
            if (nextColoresStock[colorKey] !== undefined) {
                nextColoresStock[colorKey] = Math.max(0, (nextColoresStock[colorKey] || 0) + sign * qty);
            }
        }
        const diff = nextVariants[matchKey] - oldVarVal;
        return Object.assign(Object.assign(Object.assign(Object.assign({}, updated), { stockPorVariante: nextVariants }), (nextColoresStock ? { coloresStock: nextColoresStock } : {})), { cantidad: Math.max(0, updated.cantidad + diff) });
    }
    else {
        const colorKey = color === null || color === void 0 ? void 0 : color.trim().toUpperCase();
        if (colorKey && updated.coloresStock && updated.coloresStock[colorKey] !== undefined) {
            const nextStock = Object.assign({}, updated.coloresStock);
            const oldVal = nextStock[colorKey] || 0;
            nextStock[colorKey] = Math.max(0, oldVal + sign * qty);
            const diff = nextStock[colorKey] - oldVal;
            return Object.assign(Object.assign({}, updated), { coloresStock: nextStock, cantidad: Math.max(0, updated.cantidad + diff) });
        }
    }
    return Object.assign(Object.assign({}, item), { cantidad: Math.max(0, item.cantidad + sign * qty) });
}
function extractProductModelKeyServer(item) {
    if (item.productId && item.productId.trim()) {
        return item.productId.trim().toLowerCase();
    }
    if (item.id && item.id.trim() && !item.id.startsWith('item_') && !item.id.startsWith('cart_')) {
        return item.id.trim().toLowerCase();
    }
    const desc = (item.descripcion || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
    return desc || (item.id || '').toLowerCase().trim();
}
function calcExchangeLineTotalServer(item, isTransferencia) {
    var _a, _b, _c, _d, _e, _f, _g;
    const cant = (_a = item.cantidad) !== null && _a !== void 0 ? _a : 1;
    const desc = item.descuento || 0;
    const precioEf = (_d = (_c = (_b = item.precioEfectivo) !== null && _b !== void 0 ? _b : item.precioUnitario) !== null && _c !== void 0 ? _c : item.precio) !== null && _d !== void 0 ? _d : 0;
    const precioTar = (_g = (_f = (_e = item.precioTarjeta) !== null && _e !== void 0 ? _e : item.precioUnitario) !== null && _f !== void 0 ? _f : item.precio) !== null && _g !== void 0 ? _g : 0;
    if (isTransferencia) {
        const descuentoExtra = Math.max(0, desc - DESCUENTO_BASE_TRANSFERENCIA);
        return Math.round(precioEf * (1 - descuentoExtra / 100) * cant);
    }
    else {
        return Math.round(precioTar * (1 - desc / 100) * cant);
    }
}
/**
 * Calcula oficialmente la diferencia de un cambio web en el servidor,
 * contrastando las prendas devueltas contra la venta original y las prendas nuevas
 * contra el inventario y catálogo oficial.
 */
function calculateExchangeBreakdownServer(options) {
    var _a, _b, _c, _d, _e, _f, _g;
    const { ventaOriginal, itemsDevueltos, itemsNuevos, inventory, webSettings, payload } = options;
    let medioPagoOrigen = 'efectivo';
    if (ventaOriginal === null || ventaOriginal === void 0 ? void 0 : ventaOriginal.pago) {
        if (ventaOriginal.pago.tarjeta === 100)
            medioPagoOrigen = 'tarjeta';
        else if (ventaOriginal.pago.efectivo === 100)
            medioPagoOrigen = 'efectivo';
        else
            medioPagoOrigen = 'mixto';
    }
    else if (ventaOriginal === null || ventaOriginal === void 0 ? void 0 : ventaOriginal.metodoPago) {
        const mp = String(ventaOriginal.metodoPago).toLowerCase();
        if (mp.includes('transferencia') || mp.includes('efectivo')) {
            medioPagoOrigen = 'efectivo';
        }
        else if (mp.includes('tarjeta') || mp.includes('crédito') || mp.includes('debito') || mp.includes('ualá') || mp.includes('uala')) {
            medioPagoOrigen = 'tarjeta';
        }
    }
    const isTransferenciaDev = medioPagoOrigen === 'efectivo';
    const isTransferenciaNuevo = ((_a = payload === null || payload === void 0 ? void 0 : payload.pago) === null || _a === void 0 ? void 0 : _a.efectivo) === 100 || isTransferenciaDev;
    const returnedUnits = [];
    const itemsOriginales = ventaOriginal.items || [];
    for (const dev of itemsDevueltos || []) {
        const qty = Math.max(1, Number(dev.cantidad || 1));
        const modelKey = extractProductModelKeyServer(dev);
        // Buscar el ítem en la venta original para obtener el precio real abonado
        const originalMatch = itemsOriginales.find((orig) => {
            const origId = orig.productId || orig.id;
            const devId = dev.productId || dev.id;
            if (origId && devId && origId === devId)
                return true;
            return extractProductModelKeyServer(orig) === modelKey;
        }) || dev;
        const unitPaid = calcExchangeLineTotalServer(Object.assign(Object.assign({}, originalMatch), { cantidad: 1 }), isTransferenciaDev);
        for (let i = 0; i < qty; i++) {
            returnedUnits.push({
                descripcion: dev.descripcion || originalMatch.descripcion || 'Prenda devuelta',
                modelKey,
                paidAmount: unitPaid,
                matched: false,
            });
        }
    }
    const newUnits = [];
    for (const neu of itemsNuevos || []) {
        const qty = Math.max(1, Number(neu.cantidad || 1));
        const modelKey = extractProductModelKeyServer(neu);
        const invItem = inventory.find((i) => i.id === (neu.id || neu.productId));
        let unitPrice;
        if (invItem) {
            const basePrice = isTransferenciaNuevo
                ? Number((_c = (_b = invItem.ventaEfectivo) !== null && _b !== void 0 ? _b : invItem.precioEfectivo) !== null && _c !== void 0 ? _c : 0)
                : Number((_f = (_e = (_d = invItem.ventaTarjeta) !== null && _d !== void 0 ? _d : invItem.precioTarjeta) !== null && _e !== void 0 ? _e : invItem.ventaEfectivo) !== null && _f !== void 0 ? _f : 0);
            const itemDisc = Number(invItem.descuentoWeb || 0);
            const secDisc = Number(((_g = webSettings.discountBySection) === null || _g === void 0 ? void 0 : _g[invItem.categoria]) || 0);
            const disc = Math.max(itemDisc, secDisc);
            if (isTransferenciaNuevo) {
                const extraDesc = Math.max(0, disc - DESCUENTO_BASE_TRANSFERENCIA);
                unitPrice = Math.round(basePrice * (1 - extraDesc / 100));
            }
            else {
                unitPrice = disc > 0 ? Math.round(basePrice * (1 - disc / 100)) : basePrice;
            }
        }
        else {
            // Fallback si no está en inventario
            unitPrice = calcExchangeLineTotalServer(Object.assign(Object.assign({}, neu), { cantidad: 1 }), isTransferenciaNuevo);
        }
        for (let i = 0; i < qty; i++) {
            newUnits.push({
                descripcion: neu.descripcion || (invItem === null || invItem === void 0 ? void 0 : invItem.descripcion) || 'Prenda nueva',
                modelKey,
                currentPrice: unitPrice,
                matched: false,
            });
        }
    }
    // 3. Matching 1:1 por modelo (Ley de Defensa del Consumidor: cambio de talle/color del mismo modelo = $0)
    let matchedPairsCount = 0;
    for (const newUnit of newUnits) {
        const matchIdx = returnedUnits.findIndex((ret) => !ret.matched && ret.modelKey === newUnit.modelKey);
        if (matchIdx !== -1) {
            returnedUnits[matchIdx].matched = true;
            newUnit.matched = true;
            matchedPairsCount++;
        }
    }
    // 4. Calcular totales de prendas sobrantes
    const totalReturnedUnmatchedCredit = returnedUnits
        .filter((u) => !u.matched)
        .reduce((sum, u) => sum + u.paidAmount, 0);
    const totalNewUnmatchedCost = newUnits
        .filter((u) => !u.matched)
        .reduce((sum, u) => sum + u.currentPrice, 0);
    const diferenciaSinEnvio = totalNewUnmatchedCost - totalReturnedUnmatchedCredit;
    // 5. Validar costos de envío (si es retiro/recoleta/local es $0)
    const tipoEnvioNuevo = String((payload === null || payload === void 0 ? void 0 : payload.tipoEnvioNuevo) || '').toLowerCase();
    const tipoEnvioDev = String((payload === null || payload === void 0 ? void 0 : payload.tipoEnvioDevolucion) || '').toLowerCase();
    let costoEnvioNuevo = 0;
    if (tipoEnvioNuevo === 'envio') {
        costoEnvioNuevo = Math.max(0, Number((payload === null || payload === void 0 ? void 0 : payload.costoEnvioNuevo) || 0));
    }
    let costoEnvioDev = 0;
    if (tipoEnvioDev === 'envio') {
        costoEnvioDev = Math.max(0, Number((payload === null || payload === void 0 ? void 0 : payload.costoEnvioDevolucion) || 0));
    }
    const costoEnvioTotal = costoEnvioNuevo + costoEnvioDev;
    const diferenciaTotal = Math.round(diferenciaSinEnvio + costoEnvioTotal);
    return {
        matchedPairsCount,
        totalNewUnmatchedCost,
        totalReturnedUnmatchedCredit,
        diferenciaSinEnvio,
        costoEnvioTotal,
        diferenciaTotal,
        montoGiftCard: diferenciaTotal < 0 ? Math.abs(diferenciaTotal) : 0,
        montoAPagar: diferenciaTotal > 0 ? diferenciaTotal : 0,
    };
}
// 3. fulfillWebCambioServer (Callable) y executeFulfillWebCambio (Core compartido con Webhook)
// Procesa un cambio web de forma atómica en el backend, evitando restricciones
// de security rules que impiden que usuarios no-admin modifiquen sales y giftCards.
async function executeFulfillWebCambio(db, showroomId, payload) {
    try {
        const { ventaOriginalId, itemsDevueltos, itemsNuevos, diferencia, giftDestinatario, originalOrderId, customerId, } = payload;
        if (!itemsDevueltos || !itemsDevueltos.length) {
            throw new functions.https.HttpsError('invalid-argument', 'Debés seleccionar al menos una prenda a devolver.');
        }
        const showroomRef = db.collection('showrooms').doc(showroomId);
        const saleId = `sale_cambio_web_${Date.now()}`;
        let giftCodigo;
        await db.runTransaction(async (transaction) => {
            var _a, _b, _c;
            // ─────────────────────────────────────────────────────────────────
            // 1. TODAS LAS LECTURAS (READS) AL INICIO DE LA TRANSACCIÓN
            // ─────────────────────────────────────────────────────────────────
            const snap = await transaction.get(showroomRef);
            if (!snap.exists) {
                throw new functions.https.HttpsError('not-found', 'Showroom no encontrado.');
            }
            let originalOrderData = null;
            let rootOrderRef = null;
            let custOrderRef = null;
            let customerDocRef = null;
            let customerDocSnap = null;
            if (originalOrderId) {
                rootOrderRef = showroomRef.collection('orders').doc(originalOrderId);
                let orderSnap = await transaction.get(rootOrderRef);
                // Fallback: si no está en la colección raíz de orders, buscar en la subcolección del cliente
                if (!orderSnap.exists && customerId && customerId !== 'GUEST') {
                    const custDocRef = showroomRef.collection('customers').doc(customerId).collection('orders').doc(originalOrderId);
                    const custSnap = await transaction.get(custDocRef);
                    if (custSnap.exists) {
                        orderSnap = custSnap;
                    }
                }
                if (orderSnap.exists) {
                    originalOrderData = orderSnap.data() || {};
                    const targetCustId = customerId || originalOrderData.customerId;
                    if (targetCustId && targetCustId !== 'GUEST') {
                        custOrderRef = showroomRef.collection('customers').doc(targetCustId).collection('orders').doc(originalOrderId);
                    }
                }
            }
            const targetCustomerId = customerId || (originalOrderData === null || originalOrderData === void 0 ? void 0 : originalOrderData.customerId) || 'GUEST';
            if (targetCustomerId && targetCustomerId !== 'GUEST') {
                customerDocRef = showroomRef.collection('customers').doc(targetCustomerId);
                customerDocSnap = await transaction.get(customerDocRef);
            }
            // ─────────────────────────────────────────────────────────────────
            // 2. VALIDACIONES Y CÁLCULOS
            // ─────────────────────────────────────────────────────────────────
            const srData = snap.data() || {};
            const sales = srData.sales || [];
            const inventory = srData.inventory || [];
            const giftCards = srData.giftCards || [];
            // Validate original sale exists
            const ventaOriginal = sales.find((s) => s.id === ventaOriginalId);
            if (!ventaOriginal) {
                throw new functions.https.HttpsError('failed-precondition', 'No se encontró la venta original en caja. Confirmá el pedido desde el panel si aún está pendiente.');
            }
            // Validate 15-day window
            const diasTranscurridos = Math.floor((Date.now() - new Date(ventaOriginal.fecha).getTime()) / (1000 * 60 * 60 * 24));
            if (diasTranscurridos > 15) {
                throw new functions.https.HttpsError('failed-precondition', 'Ya han pasado 15 días desde la compra.');
            }
            // Validate returned items belong to original sale
            const itemsOriginales = (_a = ventaOriginal.items) !== null && _a !== void 0 ? _a : [];
            for (const devuelto of itemsDevueltos) {
                const matchItem = (candidate) => {
                    const candId = candidate.productId || candidate.id;
                    const devId = devuelto.productId || devuelto.id;
                    let isIdMatch = false;
                    if (devId && candId && devId === candId) {
                        isIdMatch = true;
                    }
                    if (!isIdMatch) {
                        const candDesc = (candidate.descripcion || '').toLowerCase().trim();
                        const devDesc = (devuelto.descripcion || '').toLowerCase().trim();
                        const baseCandDesc = candDesc.replace(/\(.*\)/, '').trim();
                        const baseDevDesc = devDesc.replace(/\(.*\)/, '').trim();
                        if (baseCandDesc !== baseDevDesc && candDesc !== devDesc) {
                            return false;
                        }
                    }
                    const devVariant = parseVariantFromDescripcion(devuelto.descripcion || '');
                    const devTalle = devuelto.talle || devVariant.talle;
                    const devColor = devuelto.color || devVariant.color;
                    const candVariant = parseVariantFromDescripcion(candidate.descripcion || '');
                    const candTalle = candidate.talle || candVariant.talle;
                    const candColor = candidate.color || candVariant.color;
                    const talleOk = (!devTalle && !candTalle) || (devTalle && candTalle && devTalle.toLowerCase() === candTalle.toLowerCase());
                    const colorOk = (!devColor && !candColor) || (devColor && candColor && devColor.toLowerCase() === candColor.toLowerCase());
                    return talleOk && colorOk;
                };
                const matchingOriginals = itemsOriginales.filter(matchItem);
                const totalOriginalQty = matchingOriginals.reduce((sum, i) => { var _a, _b, _c; return sum + ((_c = (_b = (_a = i.cantidad) !== null && _a !== void 0 ? _a : i.quantity) !== null && _b !== void 0 ? _b : i.cant) !== null && _c !== void 0 ? _c : 0); }, 0);
                if (totalOriginalQty === 0) {
                    throw new functions.https.HttpsError('failed-precondition', `La prenda "${devuelto.descripcion}" no se encontró en la venta original o su cantidad es 0.`);
                }
                const yaDevueltaEn = sales
                    .filter((s) => s.tipo === 'cambio' && s.ventaOriginalId === ventaOriginalId)
                    .reduce((sum, s) => {
                    var _a;
                    const matches = ((_a = s.itemsDevueltos) !== null && _a !== void 0 ? _a : []).filter(matchItem);
                    return sum + matches.reduce((acc, m) => { var _a, _b, _c; return acc + ((_c = (_b = (_a = m.cantidad) !== null && _a !== void 0 ? _a : m.quantity) !== null && _b !== void 0 ? _b : m.cant) !== null && _c !== void 0 ? _c : 0); }, 0);
                }, 0);
                const disponible = totalOriginalQty - yaDevueltaEn;
                if (devuelto.cantidad > disponible) {
                    throw new functions.https.HttpsError('failed-precondition', `"${devuelto.descripcion}": solo podés devolver ${disponible} unidad(es).`);
                }
            }
            // Validate stock for new items
            const safeItemsNuevos = itemsNuevos || [];
            for (const itemNuevo of safeItemsNuevos) {
                const invItem = inventory.find((i) => i.id === itemNuevo.id);
                if (!invItem) {
                    throw new functions.https.HttpsError('failed-precondition', `Producto no encontrado en stock: ${itemNuevo.descripcion}`);
                }
                const { color, talle } = parseVariantFromDescripcion(itemNuevo.descripcion);
                if (invItem.stockPorVariante && talle && color) {
                    const varKey = `${talle}-${color}`;
                    const matchKey = Object.keys(invItem.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase());
                    if (matchKey) {
                        if ((invItem.stockPorVariante[matchKey] || 0) < itemNuevo.cantidad) {
                            throw new functions.https.HttpsError('failed-precondition', `Stock insuficiente para variante ${matchKey} de ${itemNuevo.descripcion}`);
                        }
                    }
                    else {
                        if (invItem.cantidad < itemNuevo.cantidad) {
                            throw new functions.https.HttpsError('failed-precondition', `Stock insuficiente para ${itemNuevo.descripcion}`);
                        }
                    }
                }
                else {
                    const colorKey = color === null || color === void 0 ? void 0 : color.trim().toUpperCase();
                    if (colorKey && invItem.coloresStock && invItem.coloresStock[colorKey] !== undefined) {
                        if ((invItem.coloresStock[colorKey] || 0) < itemNuevo.cantidad) {
                            throw new functions.https.HttpsError('failed-precondition', `Stock insuficiente para el color ${colorKey} de ${itemNuevo.descripcion}`);
                        }
                    }
                    else {
                        if (invItem.cantidad < itemNuevo.cantidad) {
                            throw new functions.https.HttpsError('failed-precondition', `Stock insuficiente para ${itemNuevo.descripcion}`);
                        }
                    }
                }
            }
            // ─────────────────────────────────────────────────────────────────
            // 3. AUDITORÍA Y RECÁLCULO OFICIAL DEL CAMBIO (ANTI GIFT CARD FRAUD)
            // ─────────────────────────────────────────────────────────────────
            const breakdown = calculateExchangeBreakdownServer({
                ventaOriginal,
                itemsDevueltos,
                itemsNuevos: safeItemsNuevos,
                inventory,
                webSettings: srData.webSettings || srData.settings || {},
                payload,
            });
            const clientDiferencia = Number(diferencia !== null && diferencia !== void 0 ? diferencia : 0);
            if (Math.abs(clientDiferencia - breakdown.diferenciaTotal) > 1.0) {
                functions.logger.warn(`[SECURITY ALERT] Discrepancia en diferencia de cambio web detectada. ` +
                    `Cliente envió: $${clientDiferencia}, Backend/Catálogo calculó: $${breakdown.diferenciaTotal}. Se aplicará el cálculo oficial.`);
            }
            // La diferencia oficial calculada por el backend reemplaza totalmente la del cliente
            const verifiedDiferencia = breakdown.diferenciaTotal;
            let medioPagoOrigen = 'efectivo';
            if (ventaOriginal === null || ventaOriginal === void 0 ? void 0 : ventaOriginal.pago) {
                if (ventaOriginal.pago.tarjeta === 100)
                    medioPagoOrigen = 'tarjeta';
                else if (ventaOriginal.pago.efectivo === 100)
                    medioPagoOrigen = 'efectivo';
                else
                    medioPagoOrigen = 'mixto';
            }
            else if (ventaOriginal === null || ventaOriginal === void 0 ? void 0 : ventaOriginal.metodoPago) {
                const mp = String(ventaOriginal.metodoPago).toLowerCase();
                if (mp.includes('transferencia') || mp.includes('efectivo')) {
                    medioPagoOrigen = 'efectivo';
                }
                else if (mp.includes('tarjeta') || mp.includes('crédito') || mp.includes('debito')) {
                    medioPagoOrigen = 'tarjeta';
                }
            }
            // Generate gift card SOLO si la diferencia oficial verificada es < 0
            let giftGenerada = null;
            if (breakdown.montoGiftCard > 0) {
                const montoGift = breakdown.montoGiftCard;
                const FRIENDLY_GIFT_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
                const existingCodes = new Set((giftCards || []).map((g) => (g.codigo || '').trim().toUpperCase()));
                let code = '';
                let attempts = 0;
                do {
                    let p1 = '';
                    let p2 = '';
                    for (let i = 0; i < 4; i++) {
                        p1 += FRIENDLY_GIFT_CHARS[Math.floor(Math.random() * FRIENDLY_GIFT_CHARS.length)];
                        p2 += FRIENDLY_GIFT_CHARS[Math.floor(Math.random() * FRIENDLY_GIFT_CHARS.length)];
                    }
                    code = `GC-${p1}-${p2}`;
                    attempts++;
                } while (existingCodes.has(code) && attempts < 200);
                giftCodigo = code;
                giftGenerada = {
                    id: `gift_${Date.now()}`,
                    codigo: giftCodigo,
                    destinatario: (giftDestinatario === null || giftDestinatario === void 0 ? void 0 : giftDestinatario.trim()) || payload.customerNombre || (originalOrderData === null || originalOrderData === void 0 ? void 0 : originalOrderData.customerNombre) || 'Cliente',
                    montoInicial: montoGift,
                    saldo: montoGift,
                    estado: 'ACTIVA',
                    fechaCreacion: new Date().toISOString(),
                    email: payload.customerEmail || (originalOrderData === null || originalOrderData === void 0 ? void 0 : originalOrderData.customerEmail) || null,
                    customerId: (targetCustomerId && targetCustomerId !== 'GUEST') ? targetCustomerId : null,
                    medioPagoOrigen,
                    ventaOrigenId: ventaOriginalId,
                };
            }
            // Validar si el cambio requiere pago adicional con tarjeta pero no proviene de webhook autorizado
            const isCardPayment = ((_b = payload === null || payload === void 0 ? void 0 : payload.pago) === null || _b === void 0 ? void 0 : _b.tarjeta) === 100 || (payload === null || payload === void 0 ? void 0 : payload.paymentMethod) === 'tarjeta';
            const isCalledFromWebhook = (payload === null || payload === void 0 ? void 0 : payload.fromWebhook) === true || (payload === null || payload === void 0 ? void 0 : payload.isWebhookFulfillment) === true;
            if (breakdown.montoAPagar > 0 && isCardPayment && !isCalledFromWebhook) {
                throw new functions.https.HttpsError('failed-precondition', `El cambio requiere abonar una diferencia de $${breakdown.montoAPagar.toLocaleString('es-AR')} con tarjeta a través de la pasarela de pagos.`);
            }
            // Default payment from original sale if diferencia <= 0
            const pagoDefaultOrig = (ventaOriginal === null || ventaOriginal === void 0 ? void 0 : ventaOriginal.pago) || (medioPagoOrigen === 'tarjeta' ? { efectivo: 0, tarjeta: 100 } : { efectivo: 100, tarjeta: 0 });
            // Build the sale record
            const newSale = Object.assign(Object.assign({ id: saleId, fecha: new Date().toISOString(), tipo: 'cambio', ventaOriginalId,
                itemsDevueltos, itemsNuevos: safeItemsNuevos, items: [], total: Math.max(0, verifiedDiferencia), diferencia: verifiedDiferencia, pago: verifiedDiferencia <= 0 ? pagoDefaultOrig : (payload.pago || { efectivo: 100, tarjeta: 0 }), pagoDevolucion: pagoDefaultOrig, giftDestinatario: (giftDestinatario === null || giftDestinatario === void 0 ? void 0 : giftDestinatario.trim()) || 'Cambio web' }, ((giftGenerada === null || giftGenerada === void 0 ? void 0 : giftGenerada.id) ? { giftGeneradaId: giftGenerada.id } : {})), { costoEnvio: breakdown.costoEnvioTotal, costoEnvioDevolucion: payload.costoEnvioDevolucion || 0, costoEnvioNuevo: payload.costoEnvioNuevo || 0, tipoEnvioDevolucion: payload.tipoEnvioDevolucion || null, tipoEnvioNuevo: payload.tipoEnvioNuevo || null, codigoPostalCliente: payload.codigoPostalCliente || null });
            // Apply inventory changes
            let nextInventory = [...inventory];
            for (const dev of itemsDevueltos) {
                const parsed = parseVariantFromDescripcion(dev.descripcion);
                const color = dev.color || parsed.color;
                const talle = dev.talle || parsed.talle;
                nextInventory = nextInventory.map((inv) => adjustStockLine(inv, dev.id, dev.cantidad, color, talle, 'add'));
            }
            for (const neu of safeItemsNuevos) {
                const parsed = parseVariantFromDescripcion(neu.descripcion);
                const color = neu.color || parsed.color;
                const talle = neu.talle || parsed.talle;
                nextInventory = nextInventory.map((inv) => adjustStockLine(inv, neu.id, neu.cantidad, color, talle, 'subtract'));
            }
            const nextGiftCards = giftGenerada ? [...giftCards, giftGenerada] : giftCards;
            // Remove undefined values and replace with null (Firestore doesn't accept undefined)
            const sanitize = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
            // Preparar actualización de orden original si existe
            let updatedOriginalOrderPayload = null;
            if (originalOrderData) {
                let allExchanged = true;
                const matchOrderItem = (item, dev) => {
                    const candId = item.productId || item.id;
                    const devId = dev.productId || dev.id;
                    const candSku = item.sku;
                    const devSku = dev.sku;
                    const devVariant = parseVariantFromDescripcion(dev.descripcion || '');
                    const devTalle = (dev.talle || devVariant.talle || '').toLowerCase().trim();
                    const devColor = (dev.color || devVariant.color || '').toLowerCase().trim();
                    const candVariant = parseVariantFromDescripcion(item.descripcion || '');
                    const candTalle = (item.talle || candVariant.talle || '').toLowerCase().trim();
                    const candColor = (item.color || candVariant.color || '').toLowerCase().trim();
                    const talleOk = (!devTalle && !candTalle) || (devTalle === candTalle);
                    const colorOk = (!devColor && !candColor) || (devColor === candColor);
                    if ((candId && devId && candId === devId) || (candSku && devSku && candSku !== '---' && candSku === devSku)) {
                        if (talleOk && colorOk)
                            return true;
                        if (!devTalle && !candTalle && !devColor && !candColor)
                            return true;
                    }
                    const candDesc = (item.descripcion || '').toLowerCase().replace(/\(.*\)/, '').trim();
                    const devDesc = (dev.descripcion || '').toLowerCase().replace(/\(.*\)/, '').trim();
                    if (candDesc && devDesc && candDesc === devDesc && talleOk && colorOk) {
                        return true;
                    }
                    return false;
                };
                const nextItems = (originalOrderData.items || []).map((item) => {
                    const dev = itemsDevueltos.find((d) => matchOrderItem(item, d));
                    if (dev) {
                        item.cantidadDevuelta = (item.cantidadDevuelta || 0) + dev.cantidad;
                    }
                    if ((item.cantidadDevuelta || 0) < item.cantidad) {
                        allExchanged = false;
                    }
                    return item;
                });
                updatedOriginalOrderPayload = sanitize({
                    items: nextItems,
                    isExchanged: allExchanged,
                    estado: allExchanged ? 'Completado' : 'parcialmente_cambiado'
                });
            }
            // Preparar nueva orden de cambio si se eligieron prendas nuevas
            let newCambioOrderPayload = null;
            let cambioOrderId = null;
            if (safeItemsNuevos.length > 0) {
                cambioOrderId = `order_cambio_${Date.now()}`;
                const targetCustomerEmail = payload.customerEmail || (originalOrderData === null || originalOrderData === void 0 ? void 0 : originalOrderData.customerEmail) || '';
                const targetCustomerNombre = payload.customerNombre || (originalOrderData === null || originalOrderData === void 0 ? void 0 : originalOrderData.customerNombre) || (giftDestinatario === null || giftDestinatario === void 0 ? void 0 : giftDestinatario.trim()) || 'Cliente';
                const targetCustomerTelefono = payload.customerTelefono || (originalOrderData === null || originalOrderData === void 0 ? void 0 : originalOrderData.customerTelefono) || '';
                newCambioOrderPayload = sanitize(Object.assign(Object.assign({ id: cambioOrderId, customerId: targetCustomerId, customerEmail: targetCustomerEmail, customerNombre: targetCustomerNombre, customerTelefono: targetCustomerTelefono, fecha: new Date().toISOString(), tipoPedido: 'cambio_web', ordenOrigenId: originalOrderId || ventaOriginalId || null, saleId: saleId, items: safeItemsNuevos.map((item) => {
                        const parsed = parseVariantFromDescripcion(item.descripcion || '');
                        return {
                            sku: item.sku || '---',
                            cantidad: item.cantidad,
                            precioUnitario: item.precioEfectivo || item.precioTarjeta || item.precio || 0,
                            talle: item.talle || parsed.talle || '',
                            color: item.color || parsed.color || '',
                        };
                    }), itemsDevueltos: itemsDevueltos.map((item) => {
                        const parsed = parseVariantFromDescripcion(item.descripcion || '');
                        return {
                            productId: item.id || item.productId,
                            descripcion: item.descripcion,
                            sku: item.sku || '---',
                            cantidad: item.cantidad,
                            talle: item.talle || parsed.talle || '',
                            color: item.color || parsed.color || '',
                        };
                    }), itemsNuevos: safeItemsNuevos, total: Math.max(0, diferencia) || 0, tipoEnvio: payload.tipoEnvioNuevo === 'recoleta' ? 'retiro' : payload.tipoEnvioNuevo === 'local' ? 'retiro' : ((originalOrderData === null || originalOrderData === void 0 ? void 0 : originalOrderData.tipoEnvio) || 'retiro') }, ((originalOrderData === null || originalOrderData === void 0 ? void 0 : originalOrderData.direccionEnvio) ? { direccionEnvio: originalOrderData.direccionEnvio } : {})), { costoEnvio: payload.costoEnvioNuevo || payload.costoEnvio || 0, metodoPago: diferencia > 0 ? (((_c = payload.pago) === null || _c === void 0 ? void 0 : _c.tarjeta) === 100 ? 'Tarjeta / Ualá Bis' : 'Transferencia') : 'Cambio Directo', estado: 'Confirmado', giftCardGenerada: giftCodigo || null, isExchanged: false }));
            }
            // ─────────────────────────────────────────────────────────────────
            // 3. TODAS LAS ESCRITURAS (WRITES) AL FINAL DE LA TRANSACCIÓN
            // ─────────────────────────────────────────────────────────────────
            transaction.update(showroomRef, sanitize({
                inventory: nextInventory,
                sales: [...sales, newSale],
                giftCards: nextGiftCards,
                lastSync: Date.now(),
            }));
            if (giftGenerada && customerDocRef && giftCodigo) {
                if (customerDocSnap && customerDocSnap.exists) {
                    const custData = customerDocSnap.data() || {};
                    const existingGifts = custData.giftCards || [];
                    if (!existingGifts.includes(giftCodigo)) {
                        transaction.update(customerDocRef, sanitize({
                            giftCards: [...existingGifts, giftCodigo],
                            lastUpdate: new Date().toISOString(),
                        }));
                    }
                }
                else {
                    transaction.set(customerDocRef, sanitize({
                        uid: targetCustomerId,
                        email: payload.customerEmail || (originalOrderData === null || originalOrderData === void 0 ? void 0 : originalOrderData.customerEmail) || '',
                        giftCards: [giftCodigo],
                        createdAt: new Date().toISOString(),
                    }), { merge: true });
                }
            }
            if (updatedOriginalOrderPayload && rootOrderRef) {
                transaction.set(rootOrderRef, updatedOriginalOrderPayload, { merge: true });
                if (custOrderRef) {
                    transaction.set(custOrderRef, updatedOriginalOrderPayload, { merge: true });
                }
            }
            if (newCambioOrderPayload && cambioOrderId) {
                const newOrderRef = showroomRef.collection('orders').doc(cambioOrderId);
                transaction.set(newOrderRef, newCambioOrderPayload);
                if (targetCustomerId && targetCustomerId !== 'GUEST') {
                    const custNewOrderRef = showroomRef.collection('customers').doc(targetCustomerId).collection('orders').doc(cambioOrderId);
                    transaction.set(custNewOrderRef, newCambioOrderPayload);
                }
            }
        });
        return { saleId, giftCodigo: giftCodigo || null };
    }
    catch (error) {
        functions.logger.error("Error en executeFulfillWebCambio:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error.message || 'Error interno al procesar el cambio web.');
    }
}
exports.fulfillWebCambioServer = functions.https.onCall(async (data, context) => {
    const db = admin.firestore();
    const { showroomId, payload } = data || {};
    if (!showroomId || !payload) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: showroomId or payload.');
    }
    return await executeFulfillWebCambio(db, showroomId, payload);
});
// 4. fulfillWebOrderServer (Callable)
// Procesa el fulfillment manual de una orden web de forma atómica en el backend
// usando Firebase Admin SDK. Solo administradores autorizados pueden llamarla manualmente.
exports.fulfillWebOrderServer = functions.https.onCall(async (data, context) => {
    var _a;
    try {
        const db = admin.firestore();
        const { showroomId, orderId, order, orderData } = data || {};
        const payload = order || orderData;
        // ── Control de Acceso: Solo administradores autorizados pueden invocar fulfillWebOrderServer ──
        const ADMIN_EMAILS = ['elropero.informacion@gmail.com', 'yazminetchanchu@gmail.com'];
        const token = (_a = context === null || context === void 0 ? void 0 : context.auth) === null || _a === void 0 ? void 0 : _a.token;
        const isCallerAdmin = (context === null || context === void 0 ? void 0 : context.auth) && ((token === null || token === void 0 ? void 0 : token.admin) === true ||
            (token === null || token === void 0 ? void 0 : token.role) === 'manager' ||
            ((token === null || token === void 0 ? void 0 : token.email) && ADMIN_EMAILS.includes(token.email.toLowerCase())));
        if (!isCallerAdmin) {
            throw new functions.https.HttpsError('permission-denied', 'Acceso denegado: solo los administradores pueden confirmar pedidos manualmente. Las compras web se confirman automáticamente por Webhook de pasarela.');
        }
        if (!showroomId || !orderId || !payload || !Array.isArray(payload.items)) {
            throw new functions.https.HttpsError('invalid-argument', 'Faltan campos requeridos: showroomId, orderId o items del pedido.');
        }
        const saleId = `sale_web_${orderId}`;
        const showroomRef = db.collection('showrooms').doc(showroomId);
        const orderRef = showroomRef.collection('orders').doc(orderId);
        const customerId = payload.customerId;
        const customerOrderRef = (customerId && customerId !== 'GUEST')
            ? showroomRef.collection('customers').doc(customerId).collection('orders').doc(orderId)
            : null;
        const emailsToSend = [];
        await db.runTransaction(async (transaction) => {
            var _a;
            // 1. Lecturas
            const snap = await transaction.get(showroomRef);
            if (!snap.exists) {
                throw new functions.https.HttpsError('not-found', 'Showroom no encontrado en la base de datos.');
            }
            const orderSnap = await transaction.get(orderRef);
            const existingOrder = orderSnap.exists ? (orderSnap.data() || {}) : null;
            const srData = snap.data() || {};
            const sales = srData.sales || [];
            const inventory = srData.inventory || [];
            const giftCards = srData.giftCards || [];
            // Idempotencia: si la venta ya existe o la orden ya fue procesada
            if (sales.some((s) => s.id === saleId)) {
                console.log(`[fulfillWebOrderServer] Venta ${saleId} ya existe en el showroom. Omitiendo duplicación.`);
                return;
            }
            // 2. Construir la Venta con precios verificados contra catálogo
            const pricing = (existingOrder === null || existingOrder === void 0 ? void 0 : existingOrder.total) !== undefined && ((_a = existingOrder === null || existingOrder === void 0 ? void 0 : existingOrder.items) === null || _a === void 0 ? void 0 : _a.length)
                ? { items: existingOrder.items, total: existingOrder.total, giftCardUsada: existingOrder.giftCardUsada }
                : recalculateOrderPricing(srData, payload);
            const isTarjeta = payload.items.some((oi) => oi.payMethod === 'tarjeta') ||
                (payload.metodoPago && (payload.metodoPago.toLowerCase().includes('tarjeta') || payload.metodoPago.toLowerCase().includes('ualá') || payload.metodoPago.toLowerCase().includes('uala')));
            const saleItems = pricing.items.map((oi) => {
                var _a, _b, _c, _d, _e;
                const inv = inventory.find((i) => i.id === (oi.productId || oi.id));
                const variant = [oi.talle && `T:${oi.talle}`, oi.color && `C:${oi.color}`].filter(Boolean).join(' ') || '';
                const descripcion = variant ? `${oi.descripcion} (${variant})` : oi.descripcion;
                return {
                    id: oi.productId || oi.id,
                    sku: oi.sku || (inv === null || inv === void 0 ? void 0 : inv.sku) || '---',
                    descripcion,
                    cantidad: oi.cantidad || 1,
                    costo: (_a = inv === null || inv === void 0 ? void 0 : inv.costo) !== null && _a !== void 0 ? _a : 0,
                    precioEfectivo: (_c = (_b = oi.precioEfectivo) !== null && _b !== void 0 ? _b : oi.precioUnitario) !== null && _c !== void 0 ? _c : 0,
                    precioTarjeta: (_e = (_d = oi.precioTarjeta) !== null && _d !== void 0 ? _d : oi.precioUnitario) !== null && _e !== void 0 ? _e : 0,
                    descuento: oi.descuento || 0,
                    talle: oi.talle,
                    color: oi.color,
                };
            });
            const saleRecord = {
                id: saleId,
                fecha: payload.fecha || new Date().toISOString(),
                tipo: 'venta',
                items: saleItems,
                total: pricing.total,
                pago: isTarjeta ? { efectivo: 0, tarjeta: 100 } : { efectivo: 100, tarjeta: 0 },
            };
            if (pricing.giftCardUsada !== undefined) {
                saleRecord.giftCardUsada = pricing.giftCardUsada;
            }
            // 3. Procesar Gift Card usada si aplica
            let nextGiftCards = [...giftCards];
            if (payload.giftCardUsada && payload.giftCardUsada.codigo) {
                const usedCode = String(payload.giftCardUsada.codigo).toUpperCase().trim();
                nextGiftCards = nextGiftCards.map((gc) => {
                    if (gc.codigo && gc.codigo.toUpperCase().trim() === usedCode) {
                        const montoUsado = Number(payload.giftCardUsada.montoUsado) || 0;
                        const nuevoSaldo = Math.max(0, (gc.saldo || 0) - montoUsado);
                        return Object.assign(Object.assign({}, gc), { saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'AGOTADA' : 'ACTIVA' });
                    }
                    return gc;
                });
            }
            // 4. Crear Gift Cards virtuales compradas si aplica
            emailsToSend.length = 0;
            for (const item of payload.items) {
                if (item.isVirtualGiftCard && item.giftCardData) {
                    const giftCodigo = `GIFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                    const newGC = {
                        id: `gift_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                        codigo: giftCodigo,
                        destinatario: item.giftCardData.destinatario,
                        montoInicial: item.precioUnitario,
                        saldo: item.precioUnitario,
                        estado: 'ACTIVA',
                        fechaCreacion: new Date().toISOString(),
                    };
                    nextGiftCards.push(newGC);
                    emailsToSend.push({
                        email: item.giftCardData.email,
                        destinatario: item.giftCardData.destinatario,
                        deParteDe: item.giftCardData.deParteDe,
                        monto: item.precioUnitario,
                        codigo: giftCodigo,
                        mensaje: item.giftCardData.mensaje || '',
                    });
                }
            }
            // 5. Deducción de inventario (evitar doble deducción si ya estaba reservado)
            const isAlreadyReserved = existingOrder && (existingOrder.estado === 'PENDING_PAYMENT' || existingOrder.estado === 'pending_transfer' || existingOrder.estado === 'Pendiente');
            let confirmedInventory = [...inventory];
            if (!isAlreadyReserved) {
                const nonGiftItems = payload.items.filter((oi) => !oi.isVirtualGiftCard);
                for (const sold of nonGiftItems) {
                    const prodId = sold.productId || sold.id;
                    const qty = sold.cantidad || 1;
                    const parsed = parseVariantFromDescripcion(sold.descripcion || '');
                    const color = sold.color || parsed.color;
                    const talle = sold.talle || parsed.talle;
                    confirmedInventory = confirmedInventory.map((inv) => adjustStockLine(inv, prodId, qty, color, talle, 'subtract'));
                }
            }
            // Helper sanitize para evitar undefined en Firestore
            const sanitize = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
            // 6. Escrituras atómicas
            transaction.update(showroomRef, sanitize({
                sales: [...sales, saleRecord],
                giftCards: nextGiftCards,
                inventory: confirmedInventory,
                lastSync: Date.now(),
            }));
            const orderUpdatePayload = sanitize({
                saleId,
                estado: 'Confirmado',
                fulfilledAt: new Date().toISOString(),
            });
            transaction.set(orderRef, orderUpdatePayload, { merge: true });
            if (customerOrderRef) {
                transaction.set(customerOrderRef, orderUpdatePayload, { merge: true });
            }
        });
        // 7. Encolar emails de Gift Cards generadas si las hubiera
        for (const em of emailsToSend) {
            try {
                await db.collection('mail').add({
                    to: em.email.trim().toLowerCase(),
                    message: {
                        subject: `¡Tenés una Gift Card de regalo de ${em.deParteDe}!`,
                        text: `¡Hola ${em.destinatario}!\n\n${em.deParteDe} te envió una Gift Card de El Ropero Showroom por un valor de $${em.monto.toLocaleString('es-AR')}.\n\nTu código es: ${em.codigo}\n\nMensaje: ${em.mensaje}\n\nPodés usarla en nuestra tienda online: https://elropero.ar o presencialmente en nuestro showroom.\n\nEl Ropero Showroom`,
                        html: `
              <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; color: #1a1a1a;">
                <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
                  <h1 style="margin: 0; font-size: 24px; letter-spacing: 6px; text-transform: uppercase; color: #ffffff;">EL ROPERO</h1>
                </div>
                <div style="padding: 32px 24px;">
                  <h2 style="font-size: 20px; color: #111111;">¡Tenés un regalo de ${em.deParteDe}!</h2>
                  <p>Hola <strong>${em.destinatario}</strong>, te enviaron una Gift Card para usar en nuestra tienda.</p>
                  ${em.mensaje ? `<p style="font-style: italic; background-color: #f8f9fa; padding: 12px; border-radius: 8px;">"${em.mensaje}"</p>` : ''}
                  <div style="background-color: #111; color: #fff; padding: 24px; border-radius: 12px; text-align: center; margin: 20px 0;">
                    <div style="font-size: 32px; font-weight: 700; margin-bottom: 12px;">$${em.monto.toLocaleString('es-AR')}</div>
                    <div style="font-size: 18px; font-family: monospace; letter-spacing: 2px;">${em.codigo}</div>
                  </div>
                  <p style="text-align: center; font-size: 14px; color: #666;">Ingresá el código en el checkout de nuestra tienda online.</p>
                </div>
              </div>
            `,
                    },
                });
            }
            catch (mailErr) {
                console.error('[fulfillWebOrderServer] Error encolando correo de Gift Card:', mailErr);
            }
        }
        return { success: true, saleId };
    }
    catch (error) {
        functions.logger.error("Error en fulfillWebOrderServer:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error.message || 'Error interno al procesar el fulfillment de la orden.');
    }
});
//# sourceMappingURL=orders.js.map