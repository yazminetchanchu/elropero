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
exports.obtenerTracking = exports.generarEnvioManual = exports.obtenerEtiquetaPdf = exports.obtenerSucursales = exports.cotizarEnvio = void 0;
exports.importarEnvioMiCorreo = importarEnvioMiCorreo;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const micorreoHelpers_1 = require("./micorreoHelpers");
function getMiCorreoCredentials() {
    const url = (process.env.MICORREO_URL || 'https://api.correoargentino.com.ar/micorreo/v1').replace(/\/+$/, '');
    const username = (process.env.MICORREO_USERNAME || '').trim();
    const password = (process.env.MICORREO_PASSWORD || '').trim();
    const customerId = (process.env.MICORREO_CLIENTE_ID || process.env.MICORREO_CUSTOMER_ID || '').trim();
    const defaultOriginCp = (process.env.MICORREO_ORIGIN_CP || '6620').trim();
    const defaultWeight = 500;
    return {
        url,
        username,
        password,
        customerId,
        defaultOriginCp,
        defaultWeight,
    };
}
exports.cotizarEnvio = functions.https.onCall(async (data, context) => {
    const { codigoPostalDestino, pesoGramos, codigoPostalOrigen, dimensiones, deliveredType } = data;
    if (!codigoPostalDestino) {
        throw new functions.https.HttpsError('invalid-argument', 'El código postal de destino es requerido.');
    }
    const { url, username, password, customerId, defaultOriginCp, defaultWeight } = getMiCorreoCredentials();
    if (!customerId) {
        throw new functions.https.HttpsError('failed-precondition', 'Cliente ID de MiCorreo no configurado en variables de entorno.');
    }
    try {
        // 1. Obtener Token
        const token = await (0, micorreoHelpers_1.getMiCorreoToken)(url, username, password);
        // 2. Obtener cotización
        const cpOrigen = codigoPostalOrigen || defaultOriginCp;
        const pesoFinal = pesoGramos > 0 ? pesoGramos : defaultWeight;
        const ratesPayload = {
            customerId: customerId,
            postalCodeOrigin: cpOrigen,
            postalCodeDestination: codigoPostalDestino,
            deliveredType: deliveredType === 'S' ? 'S' : 'D',
            dimensions: {
                weight: pesoFinal,
                height: (dimensiones === null || dimensiones === void 0 ? void 0 : dimensiones.height) || 5,
                width: (dimensiones === null || dimensiones === void 0 ? void 0 : dimensiones.width) || 20,
                length: (dimensiones === null || dimensiones === void 0 ? void 0 : dimensiones.length) || 25
            }
        };
        const ratesData = await (0, micorreoHelpers_1.fetchMiCorreoRates)(url, token, ratesPayload);
        let precio = 0;
        const tarifas = ratesData.rates || [];
        if (Array.isArray(tarifas) && tarifas.length > 0) {
            // Tomamos el primer servicio disponible
            precio = tarifas[0].tarifa || tarifas[0].precio || tarifas[0].monto || tarifas[0].amount || tarifas[0].price || 0;
        }
        if (precio === 0) {
            console.error("No se pudo obtener una tarifa válida de Correo Argentino:", ratesData);
            throw new functions.https.HttpsError('not-found', 'No se pudo obtener el costo de envío para este destino.');
        }
        return { costoEnvio: precio, rates: ratesData };
    }
    catch (error) {
        console.error('Error general en cotizarEnvio:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error.message || 'Error al comunicarse con Correo Argentino');
    }
});
exports.obtenerSucursales = functions.https.onCall(async (data, context) => {
    const { provinceCode } = data;
    if (!provinceCode) {
        throw new functions.https.HttpsError('invalid-argument', 'El código de provincia (provinceCode) es requerido.');
    }
    const { url, username, password, customerId } = getMiCorreoCredentials();
    if (!customerId) {
        throw new functions.https.HttpsError('failed-precondition', 'Cliente ID de MiCorreo no configurado en variables de entorno.');
    }
    try {
        // 1. Obtener Token
        const token = await (0, micorreoHelpers_1.getMiCorreoToken)(url, username, password);
        // 2. Obtener sucursales
        const agenciesData = await (0, micorreoHelpers_1.fetchMiCorreoAgencies)(url, token, customerId, provinceCode);
        let validAgencies = [];
        if (Array.isArray(agenciesData)) {
            validAgencies = agenciesData.filter((agency) => { var _a; return ((_a = agency === null || agency === void 0 ? void 0 : agency.services) === null || _a === void 0 ? void 0 : _a.pickupAvailability) === true; });
        }
        return { sucursales: validAgencies };
    }
    catch (error) {
        console.error('Error general en obtenerSucursales:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error.message || 'Error al comunicarse con Correo Argentino para sucursales');
    }
});
async function importarEnvioMiCorreo(orderId, orderData) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
    if (orderData.tipoEnvio !== 'envio' && orderData.tipoEnvio !== 'envio_sucursal') {
        return { success: false, error: `El tipo de envío "${orderData.tipoEnvio || 'no especificado'}" no corresponde a un envío por correo.` };
    }
    const { url, username, password, customerId, defaultWeight } = getMiCorreoCredentials();
    if (!customerId) {
        return { success: false, error: 'Cliente ID de MiCorreo no configurado en variables de entorno.' };
    }
    try {
        // 1. Obtener Token
        const token = await (0, micorreoHelpers_1.getMiCorreoToken)(url, username, password);
        const deliveryType = orderData.tipoEnvio === 'envio_sucursal' ? 'S' : 'D';
        // Mapeo completo de provincias a códigos de Correo Argentino (ISO / MiCorreo)
        const provinciasMap = {
            'salta': 'A',
            'buenos aires': 'B',
            'capital federal': 'C', 'caba': 'C', 'ciudad autonoma de buenos aires': 'C', 'ciudad autónoma de buenos aires': 'C',
            'san luis': 'D',
            'entre rios': 'E', 'entre ríos': 'E',
            'la rioja': 'F',
            'santiago del estero': 'G',
            'chaco': 'H',
            'san juan': 'J',
            'catamarca': 'K',
            'la pampa': 'L',
            'mendoza': 'M',
            'misiones': 'N',
            'formosa': 'P',
            'neuquen': 'Q', 'neuquén': 'Q',
            'rio negro': 'R', 'río negro': 'R',
            'santa fe': 'S',
            'tucuman': 'T', 'tucumán': 'T',
            'chubut': 'U',
            'tierra del fuego': 'V', 'tierra del fuego, antartida e islas del atlantico sur': 'V', 'tierra del fuego, antártida e islas del atlántico sur': 'V',
            'corrientes': 'W',
            'cordoba': 'X', 'córdoba': 'X',
            'jujuy': 'Y',
            'santa cruz': 'Z'
        };
        let provinceCode = 'B';
        const provName = (((_a = orderData.direccionEnvio) === null || _a === void 0 ? void 0 : _a.provincia) ||
            ((_c = (_b = orderData.sucursalCorreoArgentino) === null || _b === void 0 ? void 0 : _b.location) === null || _c === void 0 ? void 0 : _c.state_name) ||
            '').toLowerCase().trim();
        if (provName && provinciasMap[provName]) {
            provinceCode = provinciasMap[provName];
        }
        // Calcular peso estimado si no hay
        const totalItems = ((_d = orderData.items) === null || _d === void 0 ? void 0 : _d.reduce((sum, item) => sum + (item.cantidad || 1), 0)) || 1;
        const weight = Math.max(defaultWeight, totalItems * 300); // 300g por prenda promedio
        // Limpiar string para ID de orden en correo (evitar prefijos raros si la API de correo es restrictiva)
        const cleanOrderId = orderId.replace(/^sale_web_/, '').replace(/^sale_/, '');
        const payload = {
            customerId: customerId,
            extOrderId: cleanOrderId,
            orderNumber: cleanOrderId,
            sender: {
                name: "El Ropero Showroom",
                phone: "1100000000",
                cellPhone: "1100000000",
                email: "elropero.informacion@gmail.com",
                originAddress: {
                    streetName: "San Martin",
                    streetNumber: "382",
                    floor: null,
                    apartment: null,
                    city: "Chivilcoy",
                    provinceCode: "B",
                    postalCode: "6620"
                }
            },
            recipient: {
                name: orderData.customerNombre || "Cliente",
                phone: orderData.customerTelefono || "",
                cellPhone: orderData.customerTelefono || "",
                email: orderData.customerEmail || ""
            },
            shipping: {
                deliveryType,
                productType: "CP",
                weight: weight,
                declaredValue: orderData.total || 1000,
                height: 10,
                length: 30,
                width: 20
            }
        };
        if (deliveryType === 'S') {
            payload.shipping.agency = orderData.agencyId || ((_e = orderData.sucursalCorreoArgentino) === null || _e === void 0 ? void 0 : _e.agency_id) || 'E0000';
            payload.shipping.address = {
                streetName: ((_g = (_f = orderData.sucursalCorreoArgentino) === null || _f === void 0 ? void 0 : _f.location) === null || _g === void 0 ? void 0 : _g.street_name) || ((_h = orderData.direccionEnvio) === null || _h === void 0 ? void 0 : _h.calle) || "NA",
                streetNumber: ((_k = (_j = orderData.sucursalCorreoArgentino) === null || _j === void 0 ? void 0 : _j.location) === null || _k === void 0 ? void 0 : _k.street_number) || ((_l = orderData.direccionEnvio) === null || _l === void 0 ? void 0 : _l.numero) || "1",
                floor: ((_m = orderData.direccionEnvio) === null || _m === void 0 ? void 0 : _m.pisoDepto) ? orderData.direccionEnvio.pisoDepto.substring(0, 3) : null,
                apartment: null,
                city: ((_p = (_o = orderData.sucursalCorreoArgentino) === null || _o === void 0 ? void 0 : _o.location) === null || _p === void 0 ? void 0 : _p.city_name) || ((_q = orderData.direccionEnvio) === null || _q === void 0 ? void 0 : _q.localidad) || "NA",
                provinceCode: provinceCode,
                postalCode: ((_s = (_r = orderData.sucursalCorreoArgentino) === null || _r === void 0 ? void 0 : _r.location) === null || _s === void 0 ? void 0 : _s.zip_code) || ((_t = orderData.direccionEnvio) === null || _t === void 0 ? void 0 : _t.codigoPostal) || "0000"
            };
        }
        else {
            payload.shipping.address = {
                streetName: ((_u = orderData.direccionEnvio) === null || _u === void 0 ? void 0 : _u.calle) || "NA",
                streetNumber: ((_v = orderData.direccionEnvio) === null || _v === void 0 ? void 0 : _v.numero) || "1",
                floor: ((_w = orderData.direccionEnvio) === null || _w === void 0 ? void 0 : _w.pisoDepto) ? orderData.direccionEnvio.pisoDepto.substring(0, 3) : null,
                apartment: null,
                city: ((_x = orderData.direccionEnvio) === null || _x === void 0 ? void 0 : _x.localidad) || "NA",
                provinceCode: provinceCode,
                postalCode: ((_y = orderData.direccionEnvio) === null || _y === void 0 ? void 0 : _y.codigoPostal) || "0000"
            };
        }
        const { importData, duplicate } = await (0, micorreoHelpers_1.fetchMiCorreoImport)(url, token, payload, cleanOrderId);
        if (duplicate) {
            return { success: true, trackingNumber: cleanOrderId };
        }
        console.log(`Envío importado exitosamente a MiCorreo para orden ${cleanOrderId}. CreatedAt:`, importData.createdAt, 'Full Data:', JSON.stringify(importData));
        const trackingNumber = importData.tracking_number || importData.trackingNumber || importData.trackingCode || cleanOrderId;
        return {
            success: true,
            trackingNumber
        };
    }
    catch (error) {
        console.error('Error general al importar en MiCorreo:', error);
        return { success: false, error: error.message || 'Error general al importar envío' };
    }
}
exports.obtenerEtiquetaPdf = functions.https.onCall(async (data, context) => {
    const { orderId } = data;
    if (!orderId) {
        throw new functions.https.HttpsError('invalid-argument', 'El orderId es requerido.');
    }
    const { url, username, password } = getMiCorreoCredentials();
    try {
        const token = await (0, micorreoHelpers_1.getMiCorreoToken)(url, username, password);
        // Limpiar string para ID de orden en correo
        const cleanOrderId = orderId.replace(/^sale_web_/, '').replace(/^sale_/, '');
        const { labelBase64 } = await (0, micorreoHelpers_1.fetchMiCorreoLabel)(url, token, cleanOrderId);
        return { labelBase64 };
    }
    catch (error) {
        console.error('Error general al obtener etiqueta PDF:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error.message || 'Error al obtener la etiqueta');
    }
});
exports.generarEnvioManual = functions.https.onCall(async (data, context) => {
    const { orderId, orderData } = data;
    if (!orderId || !orderData) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan datos de la orden');
    }
    try {
        const result = await importarEnvioMiCorreo(orderId, orderData);
        if (result.success && result.trackingNumber) {
            const db = admin.firestore();
            const ordersQuery = await db.collectionGroup('orders')
                .where('id', '==', orderId)
                .limit(1)
                .get();
            if (!ordersQuery.empty) {
                await ordersQuery.docs[0].ref.update({
                    trackingNumber: result.trackingNumber,
                    estadoEnvio: 'CONFIRMADO'
                });
            }
            return { success: true, trackingNumber: result.trackingNumber };
        }
        return { success: false, error: result.error || 'Fallo en la comunicación con MiCorreo' };
    }
    catch (error) {
        console.error('Error en generarEnvioManual:', error);
        throw new functions.https.HttpsError('internal', 'Error interno al generar envío');
    }
});
exports.obtenerTracking = functions.https.onCall(async (data, context) => {
    const { trackingNumber } = data;
    if (!trackingNumber) {
        throw new functions.https.HttpsError('invalid-argument', 'El número de seguimiento (trackingNumber) es requerido.');
    }
    const { url, username, password, customerId } = getMiCorreoCredentials();
    if (!customerId) {
        throw new functions.https.HttpsError('failed-precondition', 'Cliente ID de MiCorreo no configurado en variables de entorno.');
    }
    try {
        const token = await (0, micorreoHelpers_1.getMiCorreoToken)(url, username, password);
        const trackingData = await (0, micorreoHelpers_1.fetchMiCorreoTracking)(url, token, customerId, trackingNumber);
        return { success: true, tracking: trackingData };
    }
    catch (error) {
        console.error('Error general en obtenerTracking:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error.message || 'Error al comunicarse con Correo Argentino para tracking');
    }
});
//# sourceMappingURL=micorreo.js.map