"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseExpiredReservationsCron = exports.reserveWebOrder = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// db will be initialized inside the functions to prevent app/no-app error during module loading.
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
        // 1. Verificar stock y deducir temporalmente
        const nextInventory = [...inventory];
        const items = orderData.items;
        for (const oi of items) {
            if (oi.isVirtualGiftCard)
                continue;
            const idx = nextInventory.findIndex(i => i.id === oi.productId);
            if (idx === -1) {
                throw new functions.https.HttpsError('failed-precondition', `El producto ${oi.descripcion} no existe en el inventario.`);
            }
            const item = Object.assign({}, nextInventory[idx]);
            const reqQty = oi.cantidad || 1;
            // Descontar por variante si tiene
            if (item.stockPorVariante && oi.talle && oi.color) {
                const varKey = `${oi.talle}-${oi.color}`;
                const matchKey = Object.keys(item.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
                const currentQty = item.stockPorVariante[matchKey] || 0;
                if (currentQty < reqQty) {
                    throw new functions.https.HttpsError('failed-precondition', `No hay suficiente stock de ${oi.descripcion} (Variante: ${matchKey}). Disponible: ${currentQty}, Requerido: ${reqQty}`);
                }
                item.stockPorVariante = Object.assign({}, item.stockPorVariante);
                item.stockPorVariante[matchKey] -= reqQty;
                if (item.coloresStock && oi.color) {
                    const cKey = Object.keys(item.coloresStock).find(k => k.toLowerCase() === oi.color.trim().toLowerCase()) || oi.color.trim().toUpperCase();
                    if (item.coloresStock[cKey] !== undefined) {
                        item.coloresStock = Object.assign({}, item.coloresStock);
                        item.coloresStock[cKey] -= reqQty;
                    }
                }
                item.cantidad -= reqQty;
            }
            else {
                // Descontar color genérico
                const colorKey = (_a = oi.color) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase();
                if (colorKey && item.coloresStock && item.coloresStock[colorKey] !== undefined) {
                    if (item.coloresStock[colorKey] < reqQty) {
                        throw new functions.https.HttpsError('failed-precondition', `No hay suficiente stock de ${oi.descripcion} en color ${colorKey}. Disponible: ${item.coloresStock[colorKey]}, Requerido: ${reqQty}`);
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
        // 2. Establecer expiración a 15 minutos y estado PENDING_PAYMENT
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const finalOrderData = Object.assign(Object.assign({}, orderData), { estado: 'PENDING_PAYMENT', expiresAt });
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
exports.releaseExpiredReservationsCron = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    const db = admin.firestore();
    const showroomId = process.env.SHOWROOM_ID || 'ROPERO';
    const showroomRef = db.collection('showrooms').doc(showroomId);
    const ordersCol = showroomRef.collection('orders');
    const nowStr = new Date().toISOString();
    // Buscar órdenes expiradas en estado PENDING_PAYMENT
    // Nota: Requiere índice en Firestore para (estado, expiresAt)
    const expiredOrders = await ordersCol
        .where('estado', '==', 'PENDING_PAYMENT')
        .where('expiresAt', '<', nowStr)
        .get();
    if (expiredOrders.empty) {
        console.log('[Cron] No hay reservas expiradas.');
        return null;
    }
    console.log(`[Cron] Encontradas ${expiredOrders.size} reservas expiradas. Procesando...`);
    // Devolvemos el stock orden por orden usando transacciones
    for (const docSnap of expiredOrders.docs) {
        const data = docSnap.data();
        try {
            await db.runTransaction(async (transaction) => {
                var _a;
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
                // Marcar como Cancelado
                transaction.update(showroomRef, { inventory: nextInventory, lastSync: Date.now() });
                transaction.update(docSnap.ref, { estado: 'Cancelado', cancelReason: 'expired' });
                if (data.customerId && data.customerId !== 'GUEST') {
                    const customerOrderRef = showroomRef.collection('customers').doc(data.customerId).collection('orders').doc(docSnap.id);
                    transaction.set(customerOrderRef, { estado: 'Cancelado', cancelReason: 'expired' }, { merge: true });
                }
            });
            console.log(`[Cron] Reserva ${docSnap.id} cancelada. Stock devuelto.`);
        }
        catch (e) {
            console.error(`[Cron] Error al cancelar reserva ${docSnap.id}:`, e);
        }
    }
    return null;
});
//# sourceMappingURL=orders.js.map