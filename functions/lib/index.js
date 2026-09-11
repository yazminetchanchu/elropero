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
exports.verifyAdmin2FACode = exports.sendAdmin2FACode = exports.requestWelcomeEmail = exports.sendCustomWelcomeEmail = exports.requestPasswordReset = exports.sendCustomPasswordResetEmail = exports.processEmailQueue = exports.createUalaCheckout = exports.ualaWebhook = exports.fulfillWebOrderServer = exports.fulfillWebCambioServer = exports.cancelWebOrder = exports.cancelWebOrderReservationServer = exports.releaseExpiredReservationsServer = exports.releaseExpiredReservationsCron = exports.obtenerTracking = exports.generarEnvioManual = exports.obtenerEtiquetaPdf = exports.importarEnvioMiCorreo = exports.obtenerSucursales = exports.cotizarEnvio = void 0;
exports.enqueueBackendTransferReservation = enqueueBackendTransferReservation;
const functionsV1 = __importStar(require("firebase-functions/v1"));
const functions = __importStar(require("firebase-functions")); // v2 functions
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const nodemailer = __importStar(require("nodemailer"));
const crypto = __importStar(require("crypto"));
// Importar y exportar los endpoints de MiCorreo
var micorreo_1 = require("./micorreo");
Object.defineProperty(exports, "cotizarEnvio", { enumerable: true, get: function () { return micorreo_1.cotizarEnvio; } });
Object.defineProperty(exports, "obtenerSucursales", { enumerable: true, get: function () { return micorreo_1.obtenerSucursales; } });
Object.defineProperty(exports, "importarEnvioMiCorreo", { enumerable: true, get: function () { return micorreo_1.importarEnvioMiCorreo; } });
Object.defineProperty(exports, "obtenerEtiquetaPdf", { enumerable: true, get: function () { return micorreo_1.obtenerEtiquetaPdf; } });
Object.defineProperty(exports, "generarEnvioManual", { enumerable: true, get: function () { return micorreo_1.generarEnvioManual; } });
Object.defineProperty(exports, "obtenerTracking", { enumerable: true, get: function () { return micorreo_1.obtenerTracking; } });
const micorreo_2 = require("./micorreo");
// Importar y exportar funciones de reservas y ordenes web
var orders_1 = require("./orders");
Object.defineProperty(exports, "releaseExpiredReservationsCron", { enumerable: true, get: function () { return orders_1.releaseExpiredReservationsCron; } });
Object.defineProperty(exports, "releaseExpiredReservationsServer", { enumerable: true, get: function () { return orders_1.releaseExpiredReservationsServer; } });
Object.defineProperty(exports, "cancelWebOrderReservationServer", { enumerable: true, get: function () { return orders_1.cancelWebOrderReservationServer; } });
Object.defineProperty(exports, "cancelWebOrder", { enumerable: true, get: function () { return orders_1.cancelWebOrder; } });
Object.defineProperty(exports, "fulfillWebCambioServer", { enumerable: true, get: function () { return orders_1.fulfillWebCambioServer; } });
Object.defineProperty(exports, "fulfillWebOrderServer", { enumerable: true, get: function () { return orders_1.fulfillWebOrderServer; } });
const orders_2 = require("./orders");
if (!admin.apps.length) {
    admin.initializeApp();
}
let _db = null;
const db = new Proxy({}, {
    get: (target, prop) => {
        if (!_db)
            _db = admin.firestore();
        const val = _db[prop];
        return typeof val === 'function' ? val.bind(_db) : val;
    }
});
// Assume Ualá Webhook sends data as a POST request
// Payload usually contains { id: "payment_id", status: "APPROVED", external_reference: "orderId" }
// Or might be nested. We parse it safely and verify signatures.
exports.ualaWebhook = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const data = request.data;
    // request.auth is unused; suppress lint warning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // const _ = request.auth;
    if (((_a = request.raw) === null || _a === void 0 ? void 0 : _a.method) !== 'POST') {
        throw new https_1.HttpsError('unauthenticated', 'Method Not Allowed');
    }
    // Validación de secreto y firma HMAC SHA-256 si está configurado en variables de entorno
    const webhookSecret = process.env.UALA_WEBHOOK_SECRET;
    if (webhookSecret) {
        const receivedSecret = (((_b = request.raw) === null || _b === void 0 ? void 0 : _b.headers['x-webhook-secret']) || ((_c = request.raw) === null || _c === void 0 ? void 0 : _c.headers['authorization']) || '').toString();
        const receivedSig = (((_d = request.raw) === null || _d === void 0 ? void 0 : _d.headers['x-uala-signature']) || ((_e = request.raw) === null || _e === void 0 ? void 0 : _e.headers['x-signature']) || '').toString();
        let isValid = false;
        // 1. Coincidencia directa de secreto en encabezado
        if (receivedSecret === webhookSecret || receivedSecret === `Bearer ${webhookSecret}`) {
            isValid = true;
        }
        // 2. Verificación de firma HMAC SHA-256
        if (!isValid && receivedSig) {
            try {
                const rawBody = typeof ((_f = request.raw) === null || _f === void 0 ? void 0 : _f.rawBody) === 'string'
                    ? (_g = request.raw) === null || _g === void 0 ? void 0 : _g.rawBody
                    : (((_h = request.raw) === null || _h === void 0 ? void 0 : _h.rawBody) ? (_j = request.raw) === null || _j === void 0 ? void 0 : _j.rawBody.toString('utf8') : JSON.stringify(data || {}));
                const calculatedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
                const bufReceived = Buffer.from(receivedSig.toLowerCase(), 'utf8');
                const bufCalculated = Buffer.from(calculatedSig.toLowerCase(), 'utf8');
                if (bufReceived.length === bufCalculated.length && crypto.timingSafeEqual(bufReceived, bufCalculated)) {
                    isValid = true;
                }
            }
            catch (sigErr) {
                console.error("Error validating Uala signature HMAC:", sigErr);
            }
        }
        if (!isValid) {
            console.warn("Unauthorized webhook call with invalid signature or secret");
            throw new https_1.HttpsError('unauthenticated', "Unauthorized");
        }
    }
    try {
        const body = data || {};
        console.log("Ualá Webhook received:", JSON.stringify(body));
        const payload = body.data || body.payment || body.checkout || body;
        const status = (payload.status || payload.payment_status || payload.state || body.status || '').toString().toUpperCase();
        const externalReference = (payload.external_reference || payload.order_id || payload.orderId || body.external_reference || body.order_id || '').toString();
        const webhookAmount = Number(payload.amount || payload.total_amount || payload.amount_total || body.amount || 0);
        if (!externalReference || typeof externalReference !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(externalReference)) {
            console.warn("No valid external_reference provided in webhook:", externalReference);
            return { status: "OK - Invalid or missing external reference" };
        }
        // Buscar la orden en cualquier showroom usando Collection Group Query.
        const ordersQuery = await db.collectionGroup('orders')
            .where('orderId', '==', externalReference)
            .get();
        if (ordersQuery.empty) {
            // 1. Verificar si externalReference corresponde a un cambio web pendiente (pending_cambios)
            const targetShowroomId = process.env.SHOWROOM_ID || 'ROPERO';
            const cambioRef = db.collection('showrooms').doc(targetShowroomId).collection('pending_cambios').doc(externalReference);
            const cambioSnap = await cambioRef.get();
            if (cambioSnap.exists) {
                const cambioData = cambioSnap.data() || {};
                if (cambioData.estado === 'Confirmado') {
                    console.log(`[ualaWebhook] Cambio ${externalReference} ya está confirmado.`);
                    return { status: 'OK - Already processed' };
                }
                if (status !== 'APPROVED' && status !== 'SUCCESS' && status !== 'PAID') {
                    if (['REJECTED', 'CANCELLED', 'FAILED', 'EXPIRED', 'REFUNDED'].includes(status)) {
                        await cambioRef.update({ estado: 'Cancelado', paymentStatus: status });
                        console.log(`[ualaWebhook] Cambio ${externalReference} cancelado por estado de pago: ${status}`);
                    }
                    return { status: 'OK - Cambio not approved' };
                }
                // Pago aprobado: procesar fulfillment atómico en backend
                try {
                    const cambioPayload = Object.assign(Object.assign({}, (cambioData.payload || {})), { fromWebhook: true, isWebhookFulfillment: true });
                    const cambioResult = await (0, orders_2.executeFulfillWebCambio)(db, targetShowroomId, cambioPayload);
                    await cambioRef.update({
                        estado: 'Confirmado',
                        saleId: cambioResult.saleId,
                        fulfilledAt: new Date().toISOString()
                    });
                    if (cambioResult.giftCodigo) {
                        const targetEmail = cambioData.customerEmail || ((_k = cambioData.payload) === null || _k === void 0 ? void 0 : _k.customerEmail);
                        if (targetEmail) {
                            const destinatario = ((_l = cambioData.payload) === null || _l === void 0 ? void 0 : _l.giftDestinatario) || cambioData.customerNombre || 'Cliente';
                            const montoGift = Math.abs(((_m = cambioData.payload) === null || _m === void 0 ? void 0 : _m.diferencia) || 0);
                            try {
                                // @ts-ignore
                                await enqueueBackendGiftCardDelivery({
                                    email: targetEmail,
                                    destinatario,
                                    deParteDe: 'El Ropero Showroom',
                                    monto: montoGift,
                                    codigo: cambioResult.giftCodigo,
                                    mensaje: 'Crédito a favor generado por cambio de prendas.'
                                });
                            }
                            catch (mailErr) {
                                console.error('[ualaWebhook] Error encolando correo de Gift Card por cambio:', mailErr);
                            }
                        }
                    }
                    console.log(`[ualaWebhook] Cambio ${externalReference} procesado exitosamente por webhook.`);
                    return { status: 'OK' };
                }
                catch (cambioErr) {
                    console.error(`[ualaWebhook] Error procesando cambio ${externalReference}:`, cambioErr);
                    throw new https_1.HttpsError('internal', 'Error processing exchange');
                }
            }
            console.warn(`[ualaWebhook] No se encontró ninguna orden ni cambio con orderId: ${externalReference}`);
            return { status: 'OK - Order not found' };
        }
        // Identificar la orden raíz del showroom por path (4 segmentos: showrooms/{showroomId}/orders/{orderId})
        let mainOrderDoc = ordersQuery.docs.find(doc => {
            const segments = doc.ref.path.split('/');
            return segments.length === 4 && segments[0] === 'showrooms' && segments[2] === 'orders';
        });
        if (!mainOrderDoc && !ordersQuery.empty) {
            mainOrderDoc = ordersQuery.docs[0];
        }
        if (!mainOrderDoc) {
            console.warn(`[ualaWebhook] No se pudo resolver la orden para orderId: ${externalReference}`);
            return { status: 'OK - Order not resolved' };
        }
        const orderDoc = mainOrderDoc;
        const showroomId = ((_o = mainOrderDoc.ref.parent.parent) === null || _o === void 0 ? void 0 : _o.id) || orderDoc.data().showroomId || process.env.SHOWROOM_ID || 'ROPERO';
        const showroomRef = db.collection('showrooms').doc(showroomId);
        const orderRef = mainOrderDoc.ref;
        if (status !== 'APPROVED' && status !== 'SUCCESS' && status !== 'PAID') {
            console.log(`Payment not approved (Status: ${status}) for order ${externalReference}`);
            if (['REJECTED', 'CANCELLED', 'FAILED', 'EXPIRED', 'REFUNDED'].includes(status)) {
                try {
                    await db.runTransaction(async (transaction) => {
                        var _a, _b;
                        const orderSnap = await transaction.get(orderRef);
                        if (!orderSnap.exists)
                            return;
                        const orderData = orderSnap.data() || {};
                        if (orderData.estado === 'Cancelado') {
                            return; // Ya cancelada previamente
                        }
                        const showroomSnap = await transaction.get(showroomRef);
                        let nextInventory = showroomSnap.exists ? [...(((_a = showroomSnap.data()) === null || _a === void 0 ? void 0 : _a.inventory) || [])] : [];
                        const items = orderData.items || [];
                        // Devolver stock si la orden estaba en estado de reserva (PENDING_PAYMENT o Pendiente)
                        if (orderData.estado === 'PENDING_PAYMENT' || orderData.estado === 'Pendiente') {
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
                                    const colorKey = (_b = oi.color) === null || _b === void 0 ? void 0 : _b.trim().toUpperCase();
                                    if (colorKey && item.coloresStock && item.coloresStock[colorKey] !== undefined) {
                                        item.coloresStock = Object.assign({}, item.coloresStock);
                                        item.coloresStock[colorKey] = (item.coloresStock[colorKey] || 0) + returnQty;
                                    }
                                    item.cantidad += returnQty;
                                }
                                nextInventory[idx] = item;
                            }
                            if (showroomSnap.exists) {
                                transaction.update(showroomRef, { inventory: nextInventory, lastSync: Date.now() });
                            }
                        }
                        transaction.update(orderRef, { estado: 'Cancelado', paymentStatus: status });
                        if (orderData.customerId && orderData.customerId !== 'GUEST') {
                            const customerOrderRef = db.doc(`showrooms/${showroomId}/customers/${orderData.customerId}/orders/${mainOrderDoc.id}`);
                            transaction.set(customerOrderRef, { estado: 'Cancelado', paymentStatus: status, updatedAt: new Date().toISOString() }, { merge: true });
                        }
                    });
                    const latestOrderSnap = await orderRef.get();
                    if (latestOrderSnap.exists) {
                        // @ts-ignore
                        await enqueueBackendOrderCancelled(Object.assign(Object.assign({}, latestOrderSnap.data()), { id: externalReference }));
                    }
                }
                catch (err) {
                    console.error("Error updating cancelled order on webhook:", err);
                }
            }
            return { status: "OK - Not approved" };
        }
        const result = await db.runTransaction(async (transaction) => {
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) {
                throw new Error(`Order ${externalReference} does not exist`);
            }
            const orderData = orderSnap.data() || {};
            if (orderData.estado === 'PAID' || orderData.estado === 'Confirmado' || orderData.estado === 'Enviado' || orderData.estado === 'Entregado') {
                console.log(`Order ${externalReference} is already confirmed (PAID).`);
                return null; // Already processed
            }
            // Verificación estricta de coherencia y montos anti-fraude
            const orderTotal = Number(orderData.total || 0);
            if (isNaN(orderTotal) || orderTotal <= 0) {
                throw new Error(`Invalid order total (${orderTotal}) for order ${externalReference}`);
            }
            if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
                throw new Error(`Order ${externalReference} has no valid items`);
            }
            if (webhookAmount > 0 && Math.abs(webhookAmount - orderTotal) > 1.0) {
                console.warn(`[SECURITY ALERT] Amount mismatch for order ${externalReference}: Webhook reports $${webhookAmount}, Order requires $${orderTotal}`);
                throw new Error(`Payment amount ($${webhookAmount}) does not match order total ($${orderTotal})`);
            }
            // Proceed to confirm the order and create the sale
            const showroomSnap = await transaction.get(showroomRef);
            if (!showroomSnap.exists) {
                throw new Error('Showroom does not exist');
            }
            const showroomData = showroomSnap.data() || {};
            const inventory = showroomData.inventory || [];
            const sales = showroomData.sales || [];
            const giftCards = showroomData.giftCards || [];
            const saleId = `sale_web_${externalReference}`;
            // Check if sale already exists
            if (sales.some((s) => s.id === saleId)) {
                console.log(`Sale ${saleId} already exists in showroom.`);
                return null;
            }
            // Build sale object
            const items = orderData.items || [];
            const saleItems = items.map((oi) => {
                var _a;
                const inv = inventory.find((i) => i.id === oi.productId);
                const variant = [oi.talle && `T:${oi.talle}`, oi.color && `C:${oi.color}`].filter(Boolean).join(' ') || '';
                const descripcion = variant ? `${oi.descripcion} (${variant})` : oi.descripcion;
                return {
                    id: oi.productId,
                    sku: oi.sku || (inv === null || inv === void 0 ? void 0 : inv.sku) || '---',
                    descripcion,
                    cantidad: oi.cantidad,
                    costo: (_a = inv === null || inv === void 0 ? void 0 : inv.costo) !== null && _a !== void 0 ? _a : 0,
                    precioEfectivo: oi.precioUnitario,
                    precioTarjeta: oi.precioUnitario,
                    descuento: 0,
                    talle: oi.talle,
                    color: oi.color,
                };
            });
            const isTarjeta = items.some((oi) => oi.payMethod === 'tarjeta');
            const sale = {
                id: saleId,
                fecha: orderData.fecha || new Date().toISOString(),
                tipo: 'venta',
                items: saleItems,
                total: orderData.total || 0,
                pago: isTarjeta ? { efectivo: 0, tarjeta: 100 } : { efectivo: 100, tarjeta: 0 },
            };
            if (orderData.giftCardUsada) {
                sale.giftCardUsada = orderData.giftCardUsada;
            }
            // Update gift cards if one was used
            let nextGiftCards = [...giftCards];
            if (orderData.giftCardUsada) {
                nextGiftCards = giftCards.map((gc) => {
                    if (gc.codigo.toUpperCase() === orderData.giftCardUsada.codigo.toUpperCase()) {
                        const nuevoSaldo = Math.max(0, gc.saldo - orderData.giftCardUsada.montoUsado);
                        return Object.assign(Object.assign({}, gc), { saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'AGOTADA' : 'ACTIVA' });
                    }
                    return gc;
                });
            }
            // Generate new gift cards if purchased
            const emailsToSend = [];
            for (const item of items) {
                if (item.isVirtualGiftCard && item.giftCardData) {
                    const giftCodigo = `GIFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                    const newGC = {
                        id: `gift_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
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
            // We do not re-deduct stock here if we assume `reserveWebOrderStock` already did it permanently while the status was 'PENDING_PAYMENT'.
            // If the reservation expired and the status is 'Cancelado', the stock was restored. We need to deduct it again.
            let nextInventory = [...inventory];
            if (orderData.estado === 'Cancelado') {
                console.log(`Order ${externalReference} was cancelled. Re-deducting stock...`);
                nextInventory = nextInventory.map((item) => {
                    var _a;
                    const soldLines = items.filter((oi) => oi.productId === item.id);
                    if (!soldLines.length)
                        return item;
                    let updated = Object.assign({}, item);
                    for (const sold of soldLines) {
                        if (updated.stockPorVariante && sold.talle && sold.color) {
                            const varKey = `${sold.talle}-${sold.color}`;
                            const matchingKey = Object.keys(updated.stockPorVariante).find(k => k.toLowerCase() === varKey.toLowerCase()) || varKey;
                            const nextVariants = Object.assign({}, updated.stockPorVariante);
                            nextVariants[matchingKey] = Math.max(0, (nextVariants[matchingKey] || 0) - sold.cantidad);
                            let nextColoresStock = updated.coloresStock ? Object.assign({}, updated.coloresStock) : undefined;
                            if (nextColoresStock && sold.color) {
                                const colorKey = Object.keys(nextColoresStock).find(k => k.toLowerCase() === sold.color.trim().toLowerCase()) || sold.color.trim().toUpperCase();
                                if (nextColoresStock[colorKey] !== undefined) {
                                    nextColoresStock[colorKey] = Math.max(0, (nextColoresStock[colorKey] || 0) - sold.cantidad);
                                }
                            }
                            updated = Object.assign(Object.assign(Object.assign(Object.assign({}, updated), { stockPorVariante: nextVariants }), (nextColoresStock ? { coloresStock: nextColoresStock } : {})), { cantidad: Math.max(0, updated.cantidad - sold.cantidad) });
                        }
                        else {
                            const colorKey = (_a = sold.color) === null || _a === void 0 ? void 0 : _a.trim().toUpperCase();
                            if (colorKey && updated.coloresStock && updated.coloresStock[colorKey] !== undefined) {
                                const nextStock = Object.assign({}, updated.coloresStock);
                                nextStock[colorKey] = Math.max(0, (nextStock[colorKey] || 0) - sold.cantidad);
                                const totalQty = Object.values(nextStock).reduce((sum, q) => sum + q, 0);
                                updated = Object.assign(Object.assign({}, updated), { coloresStock: nextStock, cantidad: totalQty });
                            }
                            else {
                                updated = Object.assign(Object.assign({}, updated), { cantidad: Math.max(0, updated.cantidad - sold.cantidad) });
                            }
                        }
                    }
                    return updated;
                });
            }
            // Update showroom
            transaction.update(showroomRef, {
                sales: [...sales, sale],
                giftCards: nextGiftCards,
                inventory: nextInventory,
                lastSync: Date.now(),
            });
            // Update order
            transaction.update(orderRef, {
                saleId,
                estado: 'PAID', // El pago se aprueba: La orden pasa a PAID y la reserva se confirma definitivamente
                paymentStatus: 'PAID',
                paymentMethod: 'UALA',
                updatedAt: new Date().toISOString(),
                fulfilledAt: new Date().toISOString(),
                paymentDetails: {
                    transactionId: (body === null || body === void 0 ? void 0 : body.uuid) || (body === null || body === void 0 ? void 0 : body.id) || payload.uuid || payload.id || null,
                    amount: (body === null || body === void 0 ? void 0 : body.amount) || webhookAmount || orderData.total,
                    paidAt: new Date().toISOString()
                }
            });
            // Also update customer profile if registered
            if (orderData.customerId && orderData.customerId !== 'GUEST') {
                const customerOrderRef = db.doc(`showrooms/${showroomId}/customers/${orderData.customerId}/orders/${mainOrderDoc.id}`);
                // Using set with merge to avoid failing if it doesn't exist
                transaction.set(customerOrderRef, {
                    saleId,
                    estado: 'PAID',
                    paymentStatus: 'PAID',
                    paymentMethod: 'UALA',
                    updatedAt: new Date().toISOString(),
                    fulfilledAt: new Date().toISOString()
                }, { merge: true });
            }
            return { orderData, sale, emailsToSend };
        });
        if (result && result.orderData && result.sale) {
            try {
                // @ts-ignore
                await enqueueBackendSaleConfirmation(result.orderData, result.sale);
            }
            catch (eEmail) {
                console.error("Error sending confirmation email inside ualaWebhook:", eEmail);
            }
            if (result.emailsToSend && result.emailsToSend.length > 0) {
                for (const gcEmail of result.emailsToSend) {
                    try {
                        // @ts-ignore
                        await enqueueBackendGiftCardDelivery(gcEmail);
                    }
                    catch (e) {
                        console.error("Error sending gift card email:", e);
                    }
                }
            }
            // Generar etiqueta de MiCorreo si corresponde
            if (result.orderData.tipoEnvio === 'envio' || result.orderData.tipoEnvio === 'envio_sucursal') {
                try {
                    const importResult = await (0, micorreo_2.importarEnvioMiCorreo)(externalReference, result.orderData);
                    if (importResult && importResult.success && importResult.trackingNumber) {
                        await orderRef.update({
                            trackingNumber: importResult.trackingNumber,
                            estadoEnvio: 'CONFIRMADO'
                        });
                        console.log(`Guardado trackingNumber ${importResult.trackingNumber} en orden ${externalReference}`);
                    }
                }
                catch (importErr) {
                    console.error("Error al disparar la importacion a MiCorreo en webhook:", importErr);
                }
            }
        }
        console.log(`Successfully processed webhook for order ${externalReference}`);
        return { status: "OK" };
    }
    catch (error) {
        console.error("Webhook processing error:", error);
        throw new https_1.HttpsError('internal', "Internal Server Error");
    }
});
/**
 * Endpoint HTTP seguro para generar cobros con Ualá Bis desde el backend.
 * Oculta completamente UALA_CLIENT_ID y UALA_CLIENT_SECRET del navegador del cliente.
 */
exports.createUalaCheckout = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
    try {
        const body = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.data) || req.body || {};
        const order = body.order || {};
        const successUrl = body.successUrl || "https://elropero.ar";
        const failUrl = body.failUrl || "https://elropero.ar";
        // 1. Obtener credenciales del servidor (sin enviarlas jamás al cliente)
        let activeEnv = body.env === 'stage' ? 'stage' : 'production';
        let clientId = (_b = (activeEnv === 'stage' ? process.env.UALA_CLIENT_ID_STAGE : process.env.UALA_CLIENT_ID)) === null || _b === void 0 ? void 0 : _b.trim();
        let clientSecret = (_c = (activeEnv === 'stage' ? process.env.UALA_CLIENT_SECRET_STAGE : process.env.UALA_CLIENT_SECRET)) === null || _c === void 0 ? void 0 : _c.trim();
        let username = (_d = (activeEnv === 'stage' ? process.env.UALA_USERNAME_STAGE : process.env.UALA_USERNAME)) === null || _d === void 0 ? void 0 : _d.trim();
        if (activeEnv === 'stage' && (username === 'uapi_checkout_user' || !username || username.length < 3)) {
            console.warn('[createUalaCheckout] Credenciales STAGE genéricas o incompletas. Fallback a PRODUCCIÓN.');
            activeEnv = 'production';
            clientId = (_e = process.env.UALA_CLIENT_ID) === null || _e === void 0 ? void 0 : _e.trim();
            clientSecret = (_f = process.env.UALA_CLIENT_SECRET) === null || _f === void 0 ? void 0 : _f.trim();
            username = (_g = process.env.UALA_USERNAME) === null || _g === void 0 ? void 0 : _g.trim();
        }
        if (!clientId || !clientSecret || !username) {
            console.error(`Faltan credenciales de Ualá Bis en el servidor para entorno: ${activeEnv}`);
            res.status(500).json({ error: `Faltan credenciales del servidor de Ualá Bis (${activeEnv}).` });
            return;
        }
        let authUrl = activeEnv === 'stage'
            ? 'https://auth.stage.developers.ar.ua.la/v2/api/auth/token'
            : 'https://auth.developers.ar.ua.la/v2/api/auth/token';
        let checkoutUrl = activeEnv === 'stage'
            ? 'https://checkout.stage.developers.ar.ua.la/v2/api/checkout'
            : 'https://checkout.developers.ar.ua.la/v2/api/checkout';
        // 2. Obtener Token de Acceso desde Ualá Bis
        let authPayload = {
            user_name: username,
            username: username,
            client_id: clientId,
            client_secret_id: clientSecret,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        };
        console.log(`[createUalaCheckout] Solicitando token a Ualá (${activeEnv})...`);
        let authResp = await fetch(authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(authPayload)
        });
        if (!authResp.ok && activeEnv === 'stage') {
            const errTextStr = await authResp.text();
            console.warn(`[createUalaCheckout] STAGE devolvió error ${authResp.status} (${errTextStr}). Intentando con PRODUCCIÓN...`);
            activeEnv = 'production';
            clientId = (_h = process.env.UALA_CLIENT_ID) === null || _h === void 0 ? void 0 : _h.trim();
            clientSecret = (_j = process.env.UALA_CLIENT_SECRET) === null || _j === void 0 ? void 0 : _j.trim();
            username = (_k = process.env.UALA_USERNAME) === null || _k === void 0 ? void 0 : _k.trim();
            authUrl = 'https://auth.developers.ar.ua.la/v2/api/auth/token';
            checkoutUrl = 'https://checkout.developers.ar.ua.la/v2/api/checkout';
            authPayload = {
                user_name: username || '',
                username: username || '',
                client_id: clientId || '',
                client_secret_id: clientSecret || '',
                client_secret: clientSecret || '',
                grant_type: 'client_credentials',
            };
            authResp = await fetch(authUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(authPayload)
            });
        }
        if (!authResp.ok) {
            const errText = await authResp.text();
            console.error(`[createUalaCheckout] Error al obtener token Ualá (${authResp.status}):`, errText);
            res.status(authResp.status).json({ error: `Error de autenticación con Ualá Bis (${authResp.status}): ${errText}` });
            return;
        }
        const authData = await authResp.json();
        const accessToken = authData.access_token;
        if (!accessToken) {
            throw new Error('Ualá no devolvió un access_token válido en el servidor.');
        }
        // 3. Crear el Checkout Link en Ualá Bis con validación estricta anti price-tampering
        let verifiedTotal = Number(order.total);
        const orderId = String(order.id || '').trim();
        if (orderId) {
            const showroomId = process.env.SHOWROOM_ID || 'ROPERO';
            // 1. Buscar en orders del showroom o subcolecciones
            let orderDocSnap = await db.collection('showrooms').doc(showroomId).collection('orders').doc(orderId).get();
            if (!orderDocSnap.exists) {
                const qSnap = await db.collectionGroup('orders').where('orderId', '==', orderId).limit(1).get();
                if (!qSnap.empty) {
                    orderDocSnap = qSnap.docs[0];
                }
            }
            if (orderDocSnap.exists) {
                const orderData = orderDocSnap.data() || {};
                const dbTotal = Number(orderData.total);
                if (!isNaN(dbTotal) && dbTotal > 0) {
                    if (!isNaN(verifiedTotal) && Math.abs(verifiedTotal - dbTotal) > 1.0) {
                        console.warn(`[SECURITY ALERT] Price Tampering detectado para orden ${orderId}. Cliente envió: $${verifiedTotal}, Firestore/Catálogo requiere: $${dbTotal}. Se cobrará el monto verificado.`);
                    }
                    verifiedTotal = dbTotal;
                }
            }
            else {
                // 2. Verificar si corresponde a un cambio web pendiente (pending_cambios)
                const cambioSnap = await db.collection('showrooms').doc(showroomId).collection('pending_cambios').doc(orderId).get();
                if (cambioSnap.exists) {
                    const cambioData = cambioSnap.data() || {};
                    const cambioTotal = Number(cambioData.totalDiferencia || ((_l = cambioData.payload) === null || _l === void 0 ? void 0 : _l.diferencia));
                    if (!isNaN(cambioTotal) && cambioTotal > 0) {
                        if (!isNaN(verifiedTotal) && Math.abs(verifiedTotal - cambioTotal) > 1.0) {
                            console.warn(`[SECURITY ALERT] Price Tampering detectado para cambio ${orderId}. Cliente envió: $${verifiedTotal}, Requerido: $${cambioTotal}.`);
                        }
                        verifiedTotal = cambioTotal;
                    }
                }
            }
        }
        if (isNaN(verifiedTotal) || verifiedTotal < 25) {
            res.status(400).json({ error: `El monto mínimo para generar un cobro con Ualá Bis es de $25.00 ARS (Monto verificado: $${verifiedTotal || 0}).` });
            return;
        }
        const amountString = verifiedTotal.toFixed(2);
        const checkoutPayload = {
            amount: amountString,
            description: 'Compra en El Ropero',
            callback_success: successUrl,
            callback_fail: failUrl,
            notification_url: "https://us-central1-el-ropero-8989a.cloudfunctions.net/ualaWebhook"
        };
        if (orderId) {
            checkoutPayload.external_reference = orderId;
        }
        console.log(`[createUalaCheckout] Generando cobro por $${amountString} ARS en ${checkoutUrl}...`);
        const checkoutResp = await fetch(checkoutUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(checkoutPayload)
        });
        if (!checkoutResp.ok) {
            const errText = await checkoutResp.text();
            console.error(`[createUalaCheckout] Error al generar cobro Ualá (${checkoutResp.status}):`, errText);
            res.status(checkoutResp.status).json({ error: `Error al generar cobro en Ualá Bis (${checkoutResp.status}): ${errText}` });
            return;
        }
        const checkoutData = await checkoutResp.json();
        const paymentId = (checkoutData === null || checkoutData === void 0 ? void 0 : checkoutData.uuid) || (checkoutData === null || checkoutData === void 0 ? void 0 : checkoutData.id);
        const paymentUrl = ((_m = checkoutData === null || checkoutData === void 0 ? void 0 : checkoutData.links) === null || _m === void 0 ? void 0 : _m.checkoutLink) ||
            ((_o = checkoutData === null || checkoutData === void 0 ? void 0 : checkoutData.links) === null || _o === void 0 ? void 0 : _o.checkout_link) ||
            (checkoutData === null || checkoutData === void 0 ? void 0 : checkoutData.checkout_url) ||
            (checkoutData === null || checkoutData === void 0 ? void 0 : checkoutData.checkoutUrl) ||
            ((_p = checkoutData === null || checkoutData === void 0 ? void 0 : checkoutData.links) === null || _p === void 0 ? void 0 : _p.checkout) ||
            (checkoutData === null || checkoutData === void 0 ? void 0 : checkoutData.url);
        if (!paymentId || !paymentUrl) {
            console.error('[createUalaCheckout] Respuesta de Ualá sin enlace:', checkoutData);
            throw new Error('Ualá no devolvió el enlace de pago en el servidor.');
        }
        res.status(200).json({ paymentId: String(paymentId), paymentUrl: String(paymentUrl) });
    }
    catch (err) {
        console.error('[createUalaCheckout] Error interno:', err);
        res.status(500).json({ error: (err === null || err === void 0 ? void 0 : err.message) || 'Error interno al comunicarse con Ualá Bis desde Cloud Functions.' });
    }
});
/**
 * Obtiene o crea el transportador de Nodemailer en tiempo de ejecución.
 * Al crearlo dentro de la ejecución de la función, nos aseguramos de que
 * process.env.SMTP_EMAIL y process.env.SMTP_PASSWORD ya fueron cargados por
 * el entorno de Firebase Cloud Functions, evitando que auth.pass sea "" al
 * momento de iniciar el módulo (lo que causaba: Error: Missing credentials for "PLAIN").
 */
function getMailTransport() {
    const senderEmail = process.env.SMTP_EMAIL || "elropero.informacion@gmail.com";
    const smtpPassword = process.env.SMTP_PASSWORD;
    if (!smtpPassword || smtpPassword.trim() === "" || smtpPassword === "TU_PASSWORD_DE_APLICACION_GMAIL") {
        throw new Error("SMTP_PASSWORD no está configurada o tiene el valor por defecto ('TU_PASSWORD_DE_APLICACION_GMAIL') en functions/.env. Para evitar el error 'Missing credentials for \"PLAIN\"', debes ingresar la Contraseña de Aplicación de 16 caracteres de Gmail en functions/.env o en las variables de entorno de Firebase.");
    }
    return {
        transport: nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: senderEmail,
                pass: smtpPassword,
            },
        }),
        senderEmail,
    };
}
/**
 * Trigger de Firestore que reemplaza a la extensión firestore-send-email.
 * Escucha la creación de documentos en la colección 'mail', envía el correo
 * usando Nodemailer y actualiza el estado en Firestore.
 */
exports.processEmailQueue = functionsV1.firestore
    .document("mail/{mailId}")
    .onCreate(async (snap, context) => {
    var _a, _b, _c;
    const data = snap.data() || {};
    const mailId = context.params.mailId;
    if (data.delivery && (data.delivery.state === "SUCCESS" || data.delivery.state === "PROCESSING")) {
        console.log(`[Email] Correo ${mailId} ya procesado.`);
        return;
    }
    await snap.ref.update({
        delivery: {
            state: "PROCESSING",
            startTime: admin.firestore.FieldValue.serverTimestamp(),
        },
    });
    try {
        const to = data.to;
        const subject = ((_a = data.message) === null || _a === void 0 ? void 0 : _a.subject) || "Notificación El Ropero Showroom";
        const text = ((_b = data.message) === null || _b === void 0 ? void 0 : _b.text) || "";
        const html = ((_c = data.message) === null || _c === void 0 ? void 0 : _c.html) || text.replace(/\n/g, "<br>");
        // Obtenemos el transport con las variables de entorno ya cargadas en tiempo de ejecución
        const { transport, senderEmail } = getMailTransport();
        const mailOptions = {
            from: `El Ropero Showroom <${senderEmail}>`,
            to: Array.isArray(to) ? to.join(", ") : to,
            subject,
            text,
            html,
        };
        const info = await transport.sendMail(mailOptions);
        console.log(`[Email] Correo ${mailId} enviado con éxito:`, info.messageId);
        await snap.ref.update({
            delivery: {
                state: "SUCCESS",
                endTime: admin.firestore.FieldValue.serverTimestamp(),
                info: {
                    messageId: info.messageId,
                    accepted: info.accepted || [],
                    rejected: info.rejected || [],
                },
            },
        });
    }
    catch (error) {
        console.error(`[Email] Error al enviar correo ${mailId}:`, error);
        await snap.ref.update({
            delivery: {
                state: "ERROR",
                endTime: admin.firestore.FieldValue.serverTimestamp(),
                error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
            },
        });
    }
});
async function enqueueBackendGiftCardDelivery(gcEmail) {
    const resetLink = `https://elropero.ar/`;
    const emailHtml = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
      <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
        <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
        <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
      </div>
      <div style="padding: 40px 32px; background-color: #ffffff;">
        <h2 style="font-size: 22px; font-weight: 600; color: #111111; margin: 0 0 16px 0; letter-spacing: 0.5px;">¡Tenés un regalo de ${gcEmail.deParteDe}!</h2>
        <p style="font-size: 15px; color: #555555; margin: 0 0 32px 0;">
          Hola <strong>${gcEmail.destinatario}</strong>, ${gcEmail.deParteDe} te envió una Gift Card para usar en nuestra tienda.
        </p>
        ${gcEmail.mensaje ? `
        <div style="background-color: #f8f9fa; border-left: 4px solid #8f8d85; padding: 16px 20px; margin-bottom: 32px; border-radius: 0 8px 8px 0; font-style: italic;">
          <p style="font-size: 15px; color: #4a4a4a; margin: 0;">"${gcEmail.mensaje}"</p>
        </div>` : ''}
        <div style="background: linear-gradient(135deg, #111111 0%, #2a2a2a 100%); border-radius: 16px; padding: 32px; position: relative; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.15); margin-bottom: 32px;">
          <div style="position: relative; z-index: 10;">
            <p style="font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #a3a3a3; font-weight: 600; margin: 0 0 8px 0;">Monto Disponible</p>
            <div style="font-size: 36px; font-weight: 700; color: #ffffff; margin-bottom: 24px; letter-spacing: -1px;">
              $${gcEmail.monto.toLocaleString('es-AR')}
            </div>
            <p style="font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #a3a3a3; font-weight: 600; margin: 0 0 8px 0;">Código de Canje</p>
            <div style="background-color: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 12px 20px; display: inline-block; font-size: 20px; font-family: monospace; font-weight: 700; color: #ffffff; letter-spacing: 2px;">
              ${gcEmail.codigo}
            </div>
          </div>
        </div>
        <p style="font-size: 14px; color: #555555; margin: 0 0 24px 0; line-height: 1.6; text-align: center;">
          Podés canjear tu Gift Card en nuestra tienda online agregando el código al momento de realizar la compra.
        </p>
        <div style="text-align: center; margin-top: 32px;">
          <a href="${resetLink}" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">Ir a la Tienda</a>
        </div>
      </div>
    </div>
  `;
    await db.collection("mail").add({
        to: [gcEmail.email],
        message: {
            subject: `¡Tenés una Gift Card de regalo de ${gcEmail.deParteDe}!`,
            html: emailHtml,
        },
    });
}
async function enqueueBackendSaleConfirmation(orderData, sale) {
    const storeEmail = "elropero.informacion@gmail.com";
    const recipients = [storeEmail];
    if (orderData.customerEmail && typeof orderData.customerEmail === "string") {
        const custEmail = orderData.customerEmail.trim().toLowerCase();
        if (custEmail && custEmail !== storeEmail) {
            recipients.push(custEmail);
        }
    }
    const cleanId = String(sale.id || "").replace(/^sale_web_/, "").replace(/^sale_/, "");
    const title = `🛍️ Compra Web Confirmada - ${orderData.customerNombre || "Cliente"}`;
    const dateObj = new Date(sale.fecha || Date.now());
    const fechaFormatted = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : String(sale.fecha || "");
    const horaFormatted = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + " hs"
        : "";
    const fechaHoraTexto = `${fechaFormatted}${horaFormatted ? ` - ${horaFormatted}` : ""}`;
    let comoPagoTexto = orderData.metodoPago || "Ualá Bis / Tarjeta";
    let itemsHtmlRows = "";
    const items = sale.items || [];
    items.forEach((item) => {
        var _a, _b, _c;
        const descripcion = item.descripcion || "Prenda";
        const precioUnit = (_c = (_b = (_a = item.precioUnitario) !== null && _a !== void 0 ? _a : item.precioEfectivo) !== null && _b !== void 0 ? _b : item.precioTarjeta) !== null && _c !== void 0 ? _c : 0;
        const subtotalItem = precioUnit * (item.cantidad || 1);
        const discText = item.descuento && item.descuento > 0 ? `<br><span style="color: #2e7d32; font-size: 11px; font-weight: 600;">✨ Desc. ${item.descuento}%</span>` : "";
        // Intentar extraer talle y color si en el webhook venían en la descripcion o propiedades
        let talleVal = item.talle || "Único";
        let colorVal = item.color || "Estándar";
        if (talleVal === "Único" || colorVal === "Estándar") {
            const parsed = (0, orders_2.parseVariantFromDescripcion)(descripcion);
            if (talleVal === "Único" && parsed.talle)
                talleVal = parsed.talle;
            if (colorVal === "Estándar" && parsed.color)
                colorVal = parsed.color;
        }
        itemsHtmlRows += `
      <tr style="border-bottom: 1px solid #f0f0f0;">
        <td style="padding: 14px 12px; color: #111111; font-weight: 600; font-size: 13px;">${descripcion}${discText}</td>
        <td style="padding: 14px 8px; text-align: center;"><span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; display: inline-block;">${talleVal}</span></td>
        <td style="padding: 14px 8px; text-align: center;"><span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; display: inline-block;">${colorVal}</span></td>
        <td style="padding: 14px 8px; text-align: center; color: #444444; font-weight: 600; font-size: 13px;">${item.cantidad || 1}</td>
        <td style="padding: 14px 12px; text-align: right; color: #111111; font-weight: 600; font-size: 13px;">$${subtotalItem.toLocaleString("es-AR")}</td>
      </tr>
    `;
    });
    const subtotalItems = items.reduce((acc, item) => {
        var _a, _b, _c;
        const p = (_c = (_b = (_a = item.precioUnitario) !== null && _a !== void 0 ? _a : item.precioEfectivo) !== null && _b !== void 0 ? _b : item.precioTarjeta) !== null && _c !== void 0 ? _c : 0;
        return acc + p * (item.cantidad || 1);
    }, 0);
    const htmlBody = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
      <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
        <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
        <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
      </div>
      <div style="padding: 40px 32px; background-color: #ffffff;">
        <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 24px 0; letter-spacing: 0.5px;">🛍️ Compra Confirmada</h2>
        <div style="background-color: #f8f9fa; border: 1px solid #eaeaea; border-radius: 12px; padding: 20px; margin-bottom: 28px; text-align: center;">
          <div style="font-size: 16px; color: #111111; font-weight: 700;">🖤 ¡Gracias por tu compra, ${orderData.customerNombre || "Cliente"}!</div>
          <div style="font-size: 13px; color: #555555; margin-top: 6px; font-weight: 500;">Tu pago fue acreditado y tu pedido confirmado con éxito.</div>
        </div>
        <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 32px;">
          <tr>
            <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
              <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #888888; font-weight: 600; margin-bottom: 6px;">ID Pedido</div>
              <div style="font-size: 15px; font-weight: 700; color: #111111;">#${cleanId}</div>
            </td>
            <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
              <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #888888; font-weight: 600; margin-bottom: 6px;">Hora / Fecha</div>
              <div style="font-size: 13px; font-weight: 600; color: #111111; line-height: 1.3;">${fechaHoraTexto}</div>
            </td>
            <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
              <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #888888; font-weight: 600; margin-bottom: 6px;">Cómo Pagó</div>
              <div style="font-size: 13px; font-weight: 600; color: #111111; line-height: 1.3;">${comoPagoTexto}</div>
            </td>
          </tr>
        </table>
        <h3 style="font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #111111; font-weight: 700; margin: 0 0 16px 0; border-bottom: 2px solid #111111; padding-bottom: 8px;">Detalle de Prendas Seleccionadas</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 32px;">
          <thead>
            <tr style="background-color: #f8f9fa; text-align: left; border-bottom: 2px solid #e0e0e0;">
              <th style="padding: 12px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666;">Prenda</th>
              <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Talle</th>
              <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Color</th>
              <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Cant.</th>
              <th style="padding: 12px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsHtmlRows}</tbody>
        </table>
        <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 24px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666666;">Subtotal de Productos:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #333333;">$${subtotalItems.toLocaleString("es-AR")}</td>
            </tr>
            ${orderData.costoEnvio && orderData.costoEnvio > 0 ? `<tr><td style="padding: 8px 0; color: #666666;">🚚 Costo de Envío:</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #333333;">+$${Number(orderData.costoEnvio).toLocaleString("es-AR")}</td></tr>` : ""}
            ${orderData.giftCardUsada ? `<tr><td style="padding: 8px 0; color: #d32f2f; font-weight: 500;">🎁 Gift Card (${orderData.giftCardUsada.codigo}):</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #d32f2f;">-$${Number(orderData.giftCardUsada.montoUsado).toLocaleString("es-AR")}</td></tr>` : ""}
          </table>
          <div style="margin-top: 16px; border-top: 2px solid #111111; padding-top: 16px; display: flex; justify-content: space-between; align-items: center;">
            <table style="width: 100%;"><tr><td style="font-size: 16px; font-weight: 700; color: #111111; letter-spacing: 0.5px;">TOTAL ABONADO:</td><td style="text-align: right;"><span style="background-color: #0a0a0a; color: #ffffff; padding: 10px 18px; border-radius: 8px; font-size: 18px; font-weight: 700; display: inline-block;">$${Number(sale.total || 0).toLocaleString("es-AR")}</span></td></tr></table>
          </div>
        </div>
      </div>
      <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
        <p style="font-size: 13px; color: #333333; font-weight: 600; margin: 0 0 6px 0;">EL ROPERO SHOWROOM</p>
        <p style="font-size: 11px; color: #777777; margin: 0 0 4px 0;">📍 San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web</p>
        <p style="font-size: 11px; color: #999999; margin: 8px 0 0 0; border-top: 1px solid #eeeeee; padding-top: 10px;">Notificación automática del sistema de ventas · Todos los derechos reservados</p>
      </div>
    </div>
  `;
    await db.collection("mail").add({
        to: recipients,
        message: {
            subject: title,
            html: htmlBody,
        },
    });
}
async function enqueueBackendOrderCancelled(orderData) {
    if (!(orderData === null || orderData === void 0 ? void 0 : orderData.customerEmail) || typeof orderData.customerEmail !== "string")
        return;
    const targetEmail = orderData.customerEmail.trim().toLowerCase();
    const nombre = orderData.customerNombre || "Cliente";
    const cleanId = String(orderData.id || "").replace(/^sale_web_/, "").replace(/^sale_/, "").replace(/^ORD-/, "");
    const title = `⚠️ Pedido Cancelado #${cleanId.substring(0, 8).toUpperCase()}`;
    let itemsHtmlRows = "";
    const items = orderData.items || [];
    items.forEach((item) => {
        const descripcion = item.descripcion || "Prenda";
        const talleVal = item.talle || "Único";
        const colorVal = item.color || "Estándar";
        const subtotalItem = (item.precioUnitario || 0) * (item.cantidad || 1);
        itemsHtmlRows += `
      <tr style="border-bottom: 1px solid #eaeaea;">
        <td style="padding: 14px 12px; color: #111111; font-weight: 600; font-size: 13px;">${descripcion}</td>
        <td style="padding: 14px 8px; text-align: center;"><span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; display: inline-block;">${talleVal}</span></td>
        <td style="padding: 14px 8px; text-align: center;"><span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; display: inline-block;">${colorVal}</span></td>
        <td style="padding: 14px 8px; text-align: center; color: #444444; font-weight: 600; font-size: 13px;">${item.cantidad || 1}</td>
        <td style="padding: 14px 12px; text-align: right; color: #111111; font-weight: 600; font-size: 13px;">$${subtotalItem.toLocaleString("es-AR")}</td>
      </tr>
    `;
    });
    const htmlBody = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
      <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
        <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
        <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
      </div>
      <div style="padding: 40px 32px; background-color: #ffffff;">
        <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 24px 0; letter-spacing: 0.5px;">${title}</h2>
        <div style="background-color: #fffbfb; border: 1px solid #f8d7da; border-radius: 12px; padding: 20px; margin-bottom: 28px; text-align: center;">
          <div style="font-size: 16px; color: #b71c1c; font-weight: 700;">⚠️ Estado de tu pedido #${cleanId.substring(0, 8).toUpperCase()}</div>
          <div style="font-size: 13px; color: #c62828; margin-top: 6px; font-weight: 500;">Tu pedido figura como cancelado o expiró el tiempo de reserva.</div>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 24px 0;">
          Hola <strong style="color: #111111;">${nombre}</strong>,<br><br>
          Te escribimos porque tu pedido ha sido cancelado en nuestro sistema. ¿Tuviste algún inconveniente con el pago o no llegaste a completar la compra? ¡No te preocupes! Tus prendas favoritas te están esperando en nuestra tienda:
        </p>
        ${items.length > 0 ? `
        <h3 style="font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #111111; font-weight: 700; margin: 0 0 16px 0; border-bottom: 2px solid #111111; padding-bottom: 8px;">Prendas que habías seleccionado</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 32px;">
          <thead>
            <tr style="background-color: #f8f9fa; text-align: left; border-bottom: 2px solid #e0e0e0;">
              <th style="padding: 12px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666;">Prenda</th>
              <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Talle</th>
              <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Color</th>
              <th style="padding: 12px 8px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: center;">Cant.</th>
              <th style="padding: 12px; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666666; text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsHtmlRows}</tbody>
        </table>
        ` : ""}
        <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 32px 24px; text-align: center; margin: 32px 0;">
          <p style="font-size: 14px; color: #333333; font-weight: 600; margin: 0 0 20px 0;">Podés volver a realizar tu compra ahora mismo con un solo clic antes de que se agote el stock:</p>
          <a href="https://elropero.ar" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">Volver a comprar</a>
        </div>
        <div style="border-left: 3px solid #8f8d85; padding-left: 16px; margin-top: 28px;">
          <p style="font-size: 12px; line-height: 1.5; color: #555555; margin: 0;">💬 <strong>¿Preferís coordinar el pago por WhatsApp o en el local?</strong> Escribinos o visitanos en nuestro showroom en <strong>San Martín 382, Chivilcoy, Buenos Aires</strong> para apartar tus prendas. ¡Te esperamos!</p>
        </div>
      </div>
      <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
        <p style="font-size: 12px; color: #666666; margin: 0 0 6px 0; font-weight: 600;">EL ROPERO SHOWROOM</p>
        <p style="font-size: 11px; color: #999999; margin: 0;">San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web</p>
      </div>
    </div>
  `;
    await db.collection("mail").add({
        to: targetEmail,
        message: {
            subject: title + " - El Ropero Showroom",
            html: htmlBody,
        },
    });
}
async function enqueueBackendTransferReservation(orderData, webSettings) {
    var _a, _b, _c, _d, _e;
    const storeEmail = "elropero.informacion@gmail.com";
    const recipients = [storeEmail];
    if (orderData.customerEmail && typeof orderData.customerEmail === "string") {
        const custEmail = orderData.customerEmail.trim().toLowerCase();
        if (custEmail && custEmail !== storeEmail) {
            recipients.push(custEmail);
        }
    }
    const rawId = String(orderData.orderId || orderData.id || "");
    const cleanId = rawId.replace(/^sale_web_/, "").replace(/^sale_/, "").replace(/^ord_/, "").slice(-8).toUpperCase();
    const title = `⏳ Reserva de Pedido #${cleanId} - Datos para Transferencia`;
    const titular = ((_a = webSettings === null || webSettings === void 0 ? void 0 : webSettings.bankTitular) === null || _a === void 0 ? void 0 : _a.trim()) || "Danisa Guzman";
    const rawBank = (_b = webSettings === null || webSettings === void 0 ? void 0 : webSettings.bankName) === null || _b === void 0 ? void 0 : _b.trim();
    const banco = (!rawBank || /santander/i.test(rawBank)) ? "Mercado Pago" : rawBank;
    const alias = ((_c = webSettings === null || webSettings === void 0 ? void 0 : webSettings.bankAlias) === null || _c === void 0 ? void 0 : _c.trim()) || ((_d = webSettings === null || webSettings === void 0 ? void 0 : webSettings.mercadoPagoAlias) === null || _d === void 0 ? void 0 : _d.trim()) || "Danisa.guz.03";
    const cbu = ((_e = webSettings === null || webSettings === void 0 ? void 0 : webSettings.bankCbu) === null || _e === void 0 ? void 0 : _e.trim()) || "0000003100037658598052";
    const whatsappNum = String((webSettings === null || webSettings === void 0 ? void 0 : webSettings.contactWhatsapp) || "5492346685836").replace(/[^0-9]/g, "");
    const items = orderData.items || [];
    let itemsHtmlRows = "";
    items.forEach((item) => {
        var _a, _b, _c;
        const descripcion = item.descripcion || "Prenda";
        let talleVal = item.talle || "Único";
        let colorVal = item.color || "Estándar";
        if (talleVal === "Único" || colorVal === "Estándar") {
            const parsed = (0, orders_2.parseVariantFromDescripcion)(descripcion);
            if (talleVal === "Único" && parsed.talle)
                talleVal = parsed.talle;
            if (colorVal === "Estándar" && parsed.color)
                colorVal = parsed.color;
        }
        const precioUnit = (_c = (_b = (_a = item.precioUnitario) !== null && _a !== void 0 ? _a : item.precioEfectivo) !== null && _b !== void 0 ? _b : item.precioTarjeta) !== null && _c !== void 0 ? _c : 0;
        const subtotalItem = precioUnit * (item.cantidad || 1);
        itemsHtmlRows += `
      <tr style="border-bottom: 1px solid #f0f0f0;">
        <td style="padding: 12px 10px; color: #111111; font-weight: 600; font-size: 13px;">${descripcion}</td>
        <td style="padding: 12px 6px; text-align: center;"><span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">${talleVal}</span></td>
        <td style="padding: 12px 6px; text-align: center;"><span style="background-color: #f1f3f5; color: #1a1a1a; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">${colorVal}</span></td>
        <td style="padding: 12px 6px; text-align: center; color: #444444; font-weight: 600; font-size: 13px;">${item.cantidad || 1}</td>
        <td style="padding: 12px 10px; text-align: right; color: #111111; font-weight: 600; font-size: 13px;">$${subtotalItem.toLocaleString("es-AR")}</td>
      </tr>
    `;
    });
    const subtotalItems = items.reduce((acc, item) => {
        var _a, _b, _c;
        const p = (_c = (_b = (_a = item.precioUnitario) !== null && _a !== void 0 ? _a : item.precioEfectivo) !== null && _b !== void 0 ? _b : item.precioTarjeta) !== null && _c !== void 0 ? _c : 0;
        return acc + p * (item.cantidad || 1);
    }, 0);
    const waText = encodeURIComponent(`¡Hola! Te adjunto el comprobante de transferencia para mi pedido #${cleanId} por un total de $${Number(orderData.total || 0).toLocaleString("es-AR")}.`);
    const waUrl = `https://wa.me/${whatsappNum}?text=${waText}`;
    const htmlBody = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
      <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
        <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
        <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
      </div>
      
      <div style="padding: 36px 28px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0; letter-spacing: 0.5px;">⏳ Reserva de Pedido</h2>
          <span style="background-color: #0a0a0a; color: #ffffff; padding: 5px 12px; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-radius: 4px;">#${cleanId}</span>
        </div>

        <p style="font-size: 14px; color: #444444; margin: 0 0 20px 0; line-height: 1.6;">
          Hola <strong>${orderData.customerNombre || "Cliente"}</strong>, recibimos tu pedido con opción de <strong>Transferencia Bancaria (-20% OFF)</strong>. Tus prendas se encuentran reservadas a tu nombre.
        </p>

        <!-- ALERTA DE 24 HORAS -->
        <div style="background-color: #fff9db; border: 1.5px solid #fcc419; border-radius: 10px; padding: 18px 20px; margin-bottom: 28px;">
          <div>
            <div style="font-size: 13px; font-weight: 700; color: #e67700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">
              ⏰ Plazo de Reserva: 24 Horas
            </div>
            <div style="font-size: 13px; color: #333333; line-height: 1.5; font-weight: 500;">
              Tenés un plazo de <strong>24 horas</strong> para realizar la transferencia y adjuntar tu comprobante. Pasado ese tiempo, la reserva de las prendas se cancela automáticamente y vuelven al stock disponible.
            </div>
          </div>
        </div>

        <!-- DATOS BANCARIOS -->
        <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 22px; margin-bottom: 28px;">
          <div style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #666666; font-weight: 700; margin-bottom: 14px; border-bottom: 1px solid #dee2e6; padding-bottom: 8px;">
            🏦 Datos para la Transferencia
          </div>
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #666666; width: 35%; font-weight: 500;">Titular:</td>
              <td style="padding: 6px 0; color: #111111; font-weight: 600; text-transform: uppercase;">${titular}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #666666; font-weight: 500;">Banco / Entidad:</td>
              <td style="padding: 6px 0; color: #111111; font-weight: 600; text-transform: uppercase;">${banco}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #666666; font-weight: 500;">Alias:</td>
              <td style="padding: 6px 0; color: #111111; font-weight: 700; font-family: monospace; font-size: 14px; background: #eef2ff; padding: 3px 8px; border-radius: 4px; display: inline-block;">${alias}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #666666; font-weight: 500;">CBU / CVU:</td>
              <td style="padding: 6px 0; color: #111111; font-weight: 700; font-family: monospace; font-size: 13px; word-break: break-all;">${cbu}</td>
            </tr>
            <tr style="border-top: 1px solid #dee2e6;">
              <td style="padding: 10px 0 4px 0; color: #111111; font-weight: 700; font-size: 14px;">Total a Transferir:</td>
              <td style="padding: 10px 0 4px 0; color: #0a0a0a; font-weight: 800; font-size: 18px;">$${Number(orderData.total || 0).toLocaleString("es-AR")}</td>
            </tr>
          </table>
        </div>

        <!-- DETALLE DE PRENDAS -->
        <div style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #666666; font-weight: 700; margin-bottom: 12px;">
          🛍️ Detalle del Pedido
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background-color: #f8f9fa; border-bottom: 2px solid #e9ecef;">
              <th style="padding: 10px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #666666; letter-spacing: 1px;">Prenda</th>
              <th style="padding: 10px 6px; text-align: center; font-size: 11px; text-transform: uppercase; color: #666666; letter-spacing: 1px;">Talle</th>
              <th style="padding: 10px 6px; text-align: center; font-size: 11px; text-transform: uppercase; color: #666666; letter-spacing: 1px;">Color</th>
              <th style="padding: 10px 6px; text-align: center; font-size: 11px; text-transform: uppercase; color: #666666; letter-spacing: 1px;">Cant.</th>
              <th style="padding: 10px 10px; text-align: right; font-size: 11px; text-transform: uppercase; color: #666666; letter-spacing: 1px;">Precio</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtmlRows}
          </tbody>
        </table>

        <!-- DESGLOSE DE TOTALES -->
        <div style="background-color: #fdfdfd; border: 1px solid #eeeeee; border-radius: 8px; padding: 16px; margin-bottom: 28px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #666666;">Subtotal Prendas:</td>
              <td style="padding: 4px 0; text-align: right; color: #111111; font-weight: 600;">$${subtotalItems.toLocaleString("es-AR")}</td>
            </tr>
            ${orderData.costoEnvio && Number(orderData.costoEnvio) > 0 ? `
            <tr>
              <td style="padding: 4px 0; color: #666666;">🚚 Envío:</td>
              <td style="padding: 4px 0; text-align: right; color: #111111; font-weight: 600;">+$${Number(orderData.costoEnvio).toLocaleString("es-AR")}</td>
            </tr>` : ""}
            ${orderData.giftCardUsada ? `
            <tr>
              <td style="padding: 4px 0; color: #2e7d32;">🎁 Gift Card (${orderData.giftCardUsada.codigo}):</td>
              <td style="padding: 4px 0; text-align: right; color: #2e7d32; font-weight: 600;">-$${Number(orderData.giftCardUsada.montoUsado || 0).toLocaleString("es-AR")}</td>
            </tr>` : ""}
            <tr style="border-top: 1.5px solid #0a0a0a;">
              <td style="padding: 10px 0 4px 0; font-size: 14px; font-weight: 700; color: #0a0a0a; text-transform: uppercase; letter-spacing: 1px;">Total Final a Transferir:</td>
              <td style="padding: 10px 0 4px 0; text-align: right; font-size: 18px; font-weight: 800; color: #0a0a0a;">$${Number(orderData.total || 0).toLocaleString("es-AR")}</td>
            </tr>
          </table>
        </div>

        <!-- BOTÓN WHATSAPP -->
        <div style="text-align: center; margin-top: 24px;">
          <a href="${waUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.25);">
            💬 Adjuntar Comprobante por WhatsApp
          </a>
          <p style="font-size: 12px; color: #888888; margin: 12px 0 0 0;">
            O comunicate directamente al +${whatsappNum}
          </p>
        </div>
      </div>

      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eeeeee; font-size: 12px; color: #888888;">
        El Ropero Showroom · Indumentaria & Estilo · Buenos Aires, Argentina
      </div>
    </div>
  `;
    await admin.firestore().collection("mail").add({
        to: recipients,
        message: {
            subject: title,
            html: htmlBody,
        },
    });
}
/**
 * Endpoint HTTP para recuperar contraseña generando el enlace desde el servidor (propio del sistema)
 * y enviando el correo con diseño de boutique luxury y botón personalizado.
 */
const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "https://elropero.ar",
    "https://www.elroperoshowroom.com.ar",
    "https://elropero.ar",
    "https://el-ropero-8989a.web.app",
    "https://el-ropero-8989a.firebaseapp.com"
];
function getSafeCorsOrigin(req) {
    const origin = req.headers.origin || "";
    if (!origin)
        return "*";
    if (ALLOWED_ORIGINS.includes(origin) ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.endsWith(".web.app") ||
        origin.endsWith(".firebaseapp.com")) {
        return origin;
    }
    return "https://elropero.ar";
}
exports.sendCustomPasswordResetEmail = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c;
    const safeOrigin = getSafeCorsOrigin(req);
    res.set("Access-Control-Allow-Origin", safeOrigin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
    try {
        const body = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.data) || req.body || {};
        const email = typeof body.email === "string" ? body.email.trim() : "";
        const continueUrl = body.continueUrl || "https://elropero.ar";
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({ error: "Email requerido y en formato válido." });
            return;
        }
        console.log(`[PasswordReset] Generando link propio del sistema para ${email}`);
        const actionCodeSettings = { url: continueUrl };
        const resetLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
        let targetUrl = resetLink;
        try {
            const urlObj = new URL(resetLink);
            const oobCode = urlObj.searchParams.get("oobCode");
            if (oobCode && continueUrl) {
                const baseUrl = continueUrl.replace(/\/$/, "");
                targetUrl = `${baseUrl}/reset-password?mode=resetPassword&oobCode=${oobCode}`;
            }
        }
        catch (e) {
            console.warn("[PasswordReset] No se pudo parsear oobCode, utilizando resetLink original:", e);
        }
        let userName = "Cliente";
        try {
            const userRecord = await admin.auth().getUserByEmail(email);
            if (userRecord.displayName)
                userName = userRecord.displayName;
            else {
                const activeShowroomId = process.env.SHOWROOM_ID || 'ROPERO';
                const custSnap = await db.collection("showrooms").doc(activeShowroomId).collection("customers").doc(userRecord.uid).get();
                if (custSnap.exists && ((_b = custSnap.data()) === null || _b === void 0 ? void 0 : _b.nombre))
                    userName = (_c = custSnap.data()) === null || _c === void 0 ? void 0 : _c.nombre;
            }
        }
        catch (e) {
            console.log("[PasswordReset] Usuario no encontrado por email para nombre, se usará 'Cliente'");
        }
        const title = "🔐 Recuperación de Contraseña";
        const htmlBody = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
        <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
          <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
          <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
        </div>
        <div style="padding: 40px 32px; background-color: #ffffff;">
          <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 16px 0; letter-spacing: 0.5px;">${title}</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 24px 0;">
            Hola <strong style="color: #111111;">${userName}</strong>,<br><br>
            Recibimos una solicitud para restablecer la contraseña de tu cuenta asociada a este correo electrónico (<span style="color: #111111; font-weight: 500;">${email}</span>) en <strong>El Ropero Showroom</strong>.
          </p>
          <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 32px 24px; text-align: center; margin: 32px 0;">
            <p style="font-size: 13px; color: #666666; margin: 0 0 20px 0;">
              Haz clic en el siguiente botón seguro para crear una nueva contraseña y recuperar tu acceso de inmediato:
            </p>
            <a href="${targetUrl}" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
              Restablecer mi contraseña
            </a>
            <p style="font-size: 11px; color: #888888; margin: 24px 0 0 0;">
              ¿El botón no responde? Copia y pega el siguiente enlace en tu navegador:<br>
              <span style="color: #4a4a4a; word-break: break-all; font-size: 11px;">${targetUrl}</span>
            </p>
          </div>
          <div style="border-left: 3px solid #e0e0e0; padding-left: 16px; margin-top: 28px;">
            <p style="font-size: 12px; line-height: 1.5; color: #777777; margin: 0;">
              🔒 <strong>Nota de Seguridad:</strong> Este enlace de recuperación se genera de forma única por nuestro sistema y expirará en 24 horas. Si no realizaste esta solicitud, puedes ignorar este mensaje; tu contraseña no será modificada.
            </p>
          </div>
        </div>
        <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
          <p style="font-size: 12px; color: #666666; margin: 0 0 6px 0; font-weight: 600;">EL ROPERO SHOWROOM</p>
          <p style="font-size: 11px; color: #999999; margin: 0;">San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web</p>
        </div>
      </div>
    `;
        await db.collection("mail").add({
            to: email,
            message: {
                subject: title + " - El Ropero Showroom",
                html: htmlBody,
            },
        });
        res.status(200).json({ success: true, message: "Correo de recuperación personalizado encolado con éxito." });
    }
    catch (error) {
        console.error("[PasswordReset] Error:", error);
        res.status(500).json({ error: (error === null || error === void 0 ? void 0 : error.message) || "Internal Server Error" });
    }
});
/**
 * Versión Callable (onCall) del reseteo personalizado para ser llamada vía Firebase SDK.
 */
exports.requestPasswordReset = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const email = data === null || data === void 0 ? void 0 : data.email;
    const continueUrl = (data === null || data === void 0 ? void 0 : data.continueUrl) || "https://elropero.ar";
    if (!email || typeof email !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Email requerido.");
    }
    const actionCodeSettings = { url: continueUrl };
    const resetLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
    let targetUrl = resetLink;
    try {
        const urlObj = new URL(resetLink);
        const oobCode = urlObj.searchParams.get("oobCode");
        if (oobCode && continueUrl) {
            const baseUrl = continueUrl.replace(/\/$/, "");
            targetUrl = `${baseUrl}/reset-password?mode=resetPassword&oobCode=${oobCode}`;
        }
    }
    catch (e) {
        console.warn("[onCall PasswordReset] No se pudo parsear oobCode:", e);
    }
    let userName = "Cliente";
    try {
        const userRecord = await admin.auth().getUserByEmail(email);
        if (userRecord.displayName)
            userName = userRecord.displayName;
    }
    catch (e) { }
    const title = "🔐 Recuperación de Contraseña";
    const htmlBody = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
      <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
        <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
        <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
      </div>
      <div style="padding: 40px 32px; background-color: #ffffff;">
        <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 16px 0; letter-spacing: 0.5px;">${title}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 24px 0;">
          Hola <strong style="color: #111111;">${userName}</strong>,<br><br>
          Recibimos una solicitud para restablecer la contraseña de tu cuenta asociada a este correo electrónico (<span style="color: #111111; font-weight: 500;">${email}</span>) en <strong>El Ropero Showroom</strong>.
        </p>
        <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 32px 24px; text-align: center; margin: 32px 0;">
          <p style="font-size: 13px; color: #666666; margin: 0 0 20px 0;">
            Haz clic en el siguiente botón seguro para crear una nueva contraseña y recuperar tu acceso de inmediato:
          </p>
          <a href="${targetUrl}" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            Restablecer mi contraseña
          </a>
          <p style="font-size: 11px; color: #888888; margin: 24px 0 0 0;">
            ¿El botón no responde? Copia y pega el siguiente enlace en tu navegador:<br>
            <span style="color: #4a4a4a; word-break: break-all; font-size: 11px;">${targetUrl}</span>
          </p>
        </div>
        <div style="border-left: 3px solid #e0e0e0; padding-left: 16px; margin-top: 28px;">
          <p style="font-size: 12px; line-height: 1.5; color: #777777; margin: 0;">
            🔒 <strong>Nota de Seguridad:</strong> Este enlace de recuperación se genera de forma única por nuestro sistema y expirará en 24 horas. Si no realizaste esta solicitud, puedes ignorar este mensaje; tu contraseña no será modificada.
          </p>
        </div>
      </div>
      <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
        <p style="font-size: 12px; color: #666666; margin: 0 0 6px 0; font-weight: 600;">EL ROPERO SHOWROOM</p>
        <p style="font-size: 11px; color: #999999; margin: 0;">San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web</p>
      </div>
    </div>
  `;
    await db.collection("mail").add({
        to: email,
        message: {
            subject: title + " - El Ropero Showroom",
            html: htmlBody,
        },
    });
    return { success: true };
});
/**
 * Endpoint HTTP para enviar un correo de bienvenida con estética luxury y beneficios VIP
 * cuando se registra un usuario en el sistema.
 */
exports.sendCustomWelcomeEmail = functionsV1.https.onRequest(async (req, res) => {
    var _a;
    const safeOrigin = getSafeCorsOrigin(req);
    res.set("Access-Control-Allow-Origin", safeOrigin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
    try {
        const body = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.data) || req.body || {};
        const email = typeof body.email === "string" ? body.email.trim() : "";
        const userName = body.userName || body.nombre || "Cliente";
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({ error: "Email requerido y en formato válido." });
            return;
        }
        const title = "✨ ¡Te damos la bienvenida a El Ropero Showroom!";
        const textBody = `Hola ${userName},\n\n¡Bienvenido/a a la familia de El Ropero Showroom!\nYa podés disfrutar de promociones exclusivas, seguimiento de pedidos en tiempo real y guardar tus prendas favoritas en tu wishlist.\n\nVisitá nuestra tienda: https://elropero.ar\n\nShowroom: San Martín 382, Chivilcoy, Buenos Aires.\n¡Gracias por sumarte!`;
        const htmlBody = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
        <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
          <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
          <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
        </div>
        <div style="padding: 40px 32px; background-color: #ffffff;">
          <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 24px 0; letter-spacing: 0.5px;">✨ ¡Bienvenido/a a la familia!</h2>
          <div style="background-color: #f8f9fa; border: 1px solid #eaeaea; border-radius: 12px; padding: 20px; margin-bottom: 28px; text-align: center;">
            <div style="font-size: 16px; color: #111111; font-weight: 700;">🖤 ¡Nos alegra tenerte acá, ${userName}!</div>
            <div style="font-size: 13px; color: #555555; margin-top: 6px; font-weight: 500;">Tu cuenta ha sido creada y activada con éxito en El Ropero Showroom.</div>
          </div>
          <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 24px 0;">
            Te damos una cálida bienvenida a nuestro espacio de moda. Al registrarte, desbloqueás beneficios pensados exclusivamente para vos y una experiencia de compra diseñada para hacerte brillar:
          </p>
          <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 32px;">
            <tr>
              <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
                <div style="font-size: 20px; margin-bottom: 6px;">🏷️</div>
                <div style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #111111; font-weight: 700; margin-bottom: 6px;">Descuentos VIP</div>
                <div style="font-size: 12px; color: #666666; line-height: 1.4;">Acceso a promociones por pago en efectivo o transferencia.</div>
              </td>
              <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
                <div style="font-size: 20px; margin-bottom: 6px;">📦</div>
                <div style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #111111; font-weight: 700; margin-bottom: 6px;">Seguimiento en Vivo</div>
                <div style="font-size: 12px; color: #666666; line-height: 1.4;">Consultá el estado de tus compras y guardá tus direcciones fácilmente.</div>
              </td>
              <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
                <div style="font-size: 20px; margin-bottom: 6px;">💖</div>
                <div style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #111111; font-weight: 700; margin-bottom: 6px;">Tu Wishlist</div>
                <div style="font-size: 12px; color: #666666; line-height: 1.4;">Guardá tus prendas favoritas en tu lista de deseos personalizada.</div>
              </td>
            </tr>
          </table>
          <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 32px 24px; text-align: center; margin: 32px 0;">
            <p style="font-size: 14px; color: #333333; font-weight: 600; margin: 0 0 20px 0;">Descubrí las últimas tendencias que entraron al showroom hoy mismo:</p>
            <a href="https://elropero.ar" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">Explorar Colección</a>
          </div>
          <div style="border-left: 3px solid #8f8d85; padding-left: 16px; margin-top: 28px;">
            <p style="font-size: 12px; line-height: 1.5; color: #555555; margin: 0;">📍 <strong>¿Preferís probarte las prendas?</strong> Te invitamos a vivir la experiencia presencial en nuestro exclusivo showroom ubicado en <strong>San Martín 382, Chivilcoy, Buenos Aires</strong>. ¡Te esperamos!</p>
          </div>
        </div>
        <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
          <p style="font-size: 12px; color: #666666; margin: 0 0 6px 0; font-weight: 600;">EL ROPERO SHOWROOM</p>
          <p style="font-size: 11px; color: #999999; margin: 0;">San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web</p>
        </div>
      </div>
    `;
        await db.collection("mail").add({
            to: email,
            message: {
                subject: title,
                text: textBody,
                html: htmlBody,
            },
        });
        res.status(200).json({ success: true, message: "Correo de bienvenida encolado con éxito." });
    }
    catch (error) {
        console.error("[WelcomeEmail] Error:", error);
        res.status(500).json({ error: (error === null || error === void 0 ? void 0 : error.message) || "Internal Server Error" });
    }
});
/**
 * Versión Callable (onCall) del envío de correo de bienvenida.
 */
exports.requestWelcomeEmail = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const email = data === null || data === void 0 ? void 0 : data.email;
    const userName = (data === null || data === void 0 ? void 0 : data.userName) || (data === null || data === void 0 ? void 0 : data.nombre) || "Cliente";
    if (!email || typeof email !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Email requerido.");
    }
    const title = "✨ ¡Te damos la bienvenida a El Ropero Showroom!";
    const htmlBody = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); color: #1a1a1a;">
      <div style="background-color: #0a0a0a; padding: 32px 24px; text-align: center; border-bottom: 3px solid #8f8d85;">
        <p style="margin: 0; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; color: #a3a3a3; font-weight: 500;">Showroom de indumentaria</p>
        <h1 style="margin: 8px 0 0 0; font-size: 26px; letter-spacing: 8px; text-transform: uppercase; color: #ffffff; font-weight: 600;">EL ROPERO</h1>
      </div>
      <div style="padding: 40px 32px; background-color: #ffffff;">
        <h2 style="font-size: 20px; font-weight: 600; color: #111111; margin: 0 0 24px 0; letter-spacing: 0.5px;">✨ ¡Bienvenido/a a la familia!</h2>
        <div style="background-color: #f8f9fa; border: 1px solid #eaeaea; border-radius: 12px; padding: 20px; margin-bottom: 28px; text-align: center;">
          <div style="font-size: 16px; color: #111111; font-weight: 700;">🖤 ¡Nos alegra tenerte acá, ${userName}!</div>
          <div style="font-size: 13px; color: #555555; margin-top: 6px; font-weight: 500;">Tu cuenta ha sido creada y activada con éxito en El Ropero Showroom.</div>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 24px 0;">
          Te damos una cálida bienvenida a nuestro espacio de moda. Al registrarte, desbloqueás beneficios pensados exclusivamente para vos y una experiencia de compra diseñada para hacerte brillar:
        </p>
        <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 32px;">
          <tr>
            <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
              <div style="font-size: 20px; margin-bottom: 6px;">🏷️</div>
              <div style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #111111; font-weight: 700; margin-bottom: 6px;">Descuentos VIP</div>
              <div style="font-size: 12px; color: #666666; line-height: 1.4;">Acceso a promociones por pago en efectivo o transferencia.</div>
            </td>
            <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
              <div style="font-size: 20px; margin-bottom: 6px;">📦</div>
              <div style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #111111; font-weight: 700; margin-bottom: 6px;">Seguimiento en Vivo</div>
              <div style="font-size: 12px; color: #666666; line-height: 1.4;">Consultá el estado de tus compras y guardá tus direcciones fácilmente.</div>
            </td>
            <td style="background-color: #f8f9fa; border: 1px solid #eeeeee; border-radius: 10px; padding: 16px; width: 33%; vertical-align: top; text-align: center;">
              <div style="font-size: 20px; margin-bottom: 6px;">💖</div>
              <div style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #111111; font-weight: 700; margin-bottom: 6px;">Tu Wishlist</div>
              <div style="font-size: 12px; color: #666666; line-height: 1.4;">Guardá tus prendas favoritas en tu lista de deseos personalizada.</div>
            </td>
          </tr>
        </table>
        <div style="background-color: #f8f9fa; border: 1px solid #f1f3f5; border-radius: 12px; padding: 32px 24px; text-align: center; margin: 32px 0;">
          <p style="font-size: 14px; color: #333333; font-weight: 600; margin: 0 0 20px 0;">Descubrí las últimas tendencias que entraron al showroom hoy mismo:</p>
          <a href="https://elropero.ar" style="display: inline-block; background-color: #0a0a0a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; padding: 16px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">Explorar Colección</a>
        </div>
        <div style="border-left: 3px solid #8f8d85; padding-left: 16px; margin-top: 28px;">
          <p style="font-size: 12px; line-height: 1.5; color: #555555; margin: 0;">📍 <strong>¿Preferís probarte las prendas?</strong> Te invitamos a vivir la experiencia presencial en nuestro exclusivo showroom ubicado en <strong>San Martín 382, Chivilcoy, Buenos Aires</strong>. ¡Te esperamos!</p>
        </div>
      </div>
      <div style="background-color: #f8f9fa; border-top: 1px solid #eaeaea; padding: 24px 32px; text-align: center;">
        <p style="font-size: 12px; color: #666666; margin: 0 0 6px 0; font-weight: 600;">EL ROPERO SHOWROOM</p>
        <p style="font-size: 11px; color: #999999; margin: 0;">San Martín 382, Chivilcoy, Buenos Aires · Atención personalizada en nuestro showroom y página web</p>
      </div>
    </div>
  `;
    await db.collection("mail").add({
        to: email,
        message: {
            subject: title,
            html: htmlBody,
        },
    });
    return { success: true };
});
/**
 * Genera y envía un código OTP de 6 dígitos por email para autenticación de dos factores (2FA) en el panel de administración.
 */
exports.sendAdmin2FACode = (0, https_1.onCall)(async (request) => {
    var _a;
    const data = request.data;
    const email = data === null || data === void 0 ? void 0 : data.email;
    const cleanEmail = String(email || "").trim().toLowerCase();
    // Guard: only admins or service account can run
    if (!request.auth || !(((_a = request.auth.token) === null || _a === void 0 ? void 0 : _a.admin) || request.auth.uid === 'service-account')) {
        throw new https_1.HttpsError('permission-denied', 'Only administrators can run this migration');
    }
    // Generar código numérico de 6 dígitos
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutos de validez
    // Guardar en colección oculta _admin_otp
    await db.collection("_admin_otp").doc(cleanEmail).set({
        code: otpCode,
        expiresAt,
        attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    // Enviar correo electrónico con el código OTP
    const htmlContent = `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px; color: #111111;">
      <div style="text-align: center; margin-bottom: 24px;">
        <p style="font-size: 10px; letter-spacing: 4px; text-transform: uppercase; color: #888888; margin: 0;">Acceso Administrativo Seguro</p>
        <h2 style="font-size: 20px; letter-spacing: 6px; text-transform: uppercase; margin: 8px 0 0 0; font-weight: 600;">EL ROPERO</h2>
      </div>

      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <p style="font-size: 12px; color: #666666; margin: 0 0 12px 0;">Tu código de verificación de 2 factores (2FA) es:</p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #000000; margin: 12px 0;">${otpCode}</div>
        <p style="font-size: 11px; color: #e53e3e; margin: 12px 0 0 0; font-weight: 500;">⏱️ Este código expira en 5 minutos.</p>
      </div>

      <p style="font-size: 12px; color: #666666; line-height: 1.5; margin: 0 0 16px 0;">
        Si no solicitaste este acceso al panel de administración, ignorá este mensaje y asegurate de cambiar tu contraseña inmediatamente.
      </p>

      <div style="border-top: 1px solid #eeeeee; padding-top: 16px; margin-top: 24px; text-align: center;">
        <p style="font-size: 10px; color: #aaaaaa; margin: 0;">EL ROPERO SHOWROOM · Sistema de Seguridad 2FA</p>
      </div>
    </div>
  `;
    await db.collection("mail").add({
        to: cleanEmail,
        message: {
            subject: "🔒 Código de Verificación 2FA - El Ropero Admin",
            html: htmlContent
        }
    });
    return { success: true, message: "Código 2FA enviado a tu email." };
});
/**
 * Valida el código OTP ingresado por el administrador.
 */
exports.verifyAdmin2FACode = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const email = data === null || data === void 0 ? void 0 : data.email;
    const code = data === null || data === void 0 ? void 0 : data.code;
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanCode = String(code || "").trim();
    if (!cleanEmail || !cleanCode) {
        throw new functions.https.HttpsError("invalid-argument", "Email y código son obligatorios.");
    }
    const docRef = db.collection("_admin_otp").doc(cleanEmail);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        throw new functions.https.HttpsError("not-found", "No hay un código 2FA activo. Por favor, solicitá uno nuevo.");
    }
    const otpData = docSnap.data() || {};
    if (Date.now() > (otpData.expiresAt || 0)) {
        await docRef.delete();
        throw new functions.https.HttpsError("deadline-exceeded", "El código 2FA ha expirado (límite 5 min). Solicitá un nuevo código.");
    }
    if ((otpData.attempts || 0) >= 3) {
        await docRef.delete();
        throw new functions.https.HttpsError("resource-exhausted", "Demasiados intentos fallidos. Por seguridad, solicitá un nuevo código.");
    }
    if (otpData.code !== cleanCode) {
        await docRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
        throw new functions.https.HttpsError("invalid-argument", "Código de verificación incorrecto. Verificá tu correo.");
    }
    // Código válido -> Eliminar documento de OTP usado
    await docRef.delete();
    return { success: true, verified: true, message: "Autenticación 2FA exitosa." };
});
//# sourceMappingURL=index.js.map