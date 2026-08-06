"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarEnvioManual = exports.obtenerEtiquetaPdf = exports.obtenerSucursales = exports.cotizarEnvio = void 0;
exports.importarEnvioMiCorreo = importarEnvioMiCorreo;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const MI_CORREO_PROD_URL = 'https://api.correoargentino.com.ar/micorreo/v1';
const USERNAME = 'GDanisaAPI';
const PASSWORD = 'Inicial27+';
const CLIENTE_ID = '0001425237';
const DEFAULT_ORIGIN_CP = '6620'; // Chivilcoy
const DEFAULT_WEIGHT = 500; // gramos
exports.cotizarEnvio = functions.https.onCall(async (data, context) => {
    const { codigoPostalDestino, pesoGramos, codigoPostalOrigen, dimensiones, deliveredType } = data;
    if (!codigoPostalDestino) {
        throw new functions.https.HttpsError('invalid-argument', 'El código postal de destino es requerido.');
    }
    try {
        // 1. Obtener Token
        const authString = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
        const tokenResponse = await fetch(`${MI_CORREO_PROD_URL}/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            }
        });
        if (!tokenResponse.ok) {
            console.error('Error al obtener token de MiCorreo:', await tokenResponse.text());
            throw new functions.https.HttpsError('internal', 'Error de autenticación con Correo Argentino.');
        }
        const tokenData = await tokenResponse.json();
        const token = tokenData.token;
        // 2. Obtener cotización
        const cpOrigen = codigoPostalOrigen || DEFAULT_ORIGIN_CP;
        const pesoFinal = pesoGramos > 0 ? pesoGramos : DEFAULT_WEIGHT;
        const ratesPayload = {
            customerId: CLIENTE_ID,
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
        const ratesResponse = await fetch(`${MI_CORREO_PROD_URL}/rates`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(ratesPayload)
        });
        if (!ratesResponse.ok) {
            console.error('Error al cotizar con MiCorreo:', await ratesResponse.text());
            throw new functions.https.HttpsError('internal', 'Error al calcular tarifas con Correo Argentino.');
        }
        const ratesData = await ratesResponse.json();
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
        throw new functions.https.HttpsError('internal', 'Error al comunicarse con Correo Argentino', error);
    }
});
exports.obtenerSucursales = functions.https.onCall(async (data, context) => {
    const { provinceCode } = data;
    if (!provinceCode) {
        throw new functions.https.HttpsError('invalid-argument', 'El código de provincia (provinceCode) es requerido.');
    }
    try {
        // 1. Obtener Token
        const authString = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
        const tokenResponse = await fetch(`${MI_CORREO_PROD_URL}/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            }
        });
        if (!tokenResponse.ok) {
            console.error('Error al obtener token de MiCorreo (agencies):', await tokenResponse.text());
            throw new functions.https.HttpsError('internal', 'Error de autenticación con Correo Argentino.');
        }
        const tokenData = await tokenResponse.json();
        const token = tokenData.token;
        // 2. Obtener sucursales
        const agenciesUrl = new URL(`${MI_CORREO_PROD_URL}/agencies`);
        // Pass query params as x-www-form-urlencoded but MiCorreo PDF says "data-urlencode" via cURL.
        // Let's pass as query string.
        agenciesUrl.searchParams.append('customerId', CLIENTE_ID);
        agenciesUrl.searchParams.append('provinceCode', provinceCode);
        const agenciesResponse = await fetch(agenciesUrl.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!agenciesResponse.ok) {
            console.error('Error al obtener sucursales con MiCorreo:', await agenciesResponse.text());
            throw new functions.https.HttpsError('internal', 'Error al obtener sucursales de Correo Argentino.');
        }
        const agenciesData = await agenciesResponse.json();
        // Filter agencies that have packageReception or pickupAvailability depending on requirements.
        // The PDF says "pickupAvailability".
        let validAgencies = [];
        if (Array.isArray(agenciesData)) {
            validAgencies = agenciesData.filter((agency) => { var _a; return ((_a = agency === null || agency === void 0 ? void 0 : agency.services) === null || _a === void 0 ? void 0 : _a.pickupAvailability) === true; });
        }
        return { sucursales: validAgencies };
    }
    catch (error) {
        console.error('Error general en obtenerSucursales:', error);
        throw new functions.https.HttpsError('internal', 'Error al comunicarse con Correo Argentino para sucursales', error);
    }
});
async function importarEnvioMiCorreo(orderId, orderData) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    if (orderData.tipoEnvio !== 'envio' && orderData.tipoEnvio !== 'envio_sucursal') {
        return { success: false };
    }
    try {
        // 1. Obtener Token
        const authString = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
        const tokenResponse = await fetch(`${MI_CORREO_PROD_URL}/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            }
        });
        if (!tokenResponse.ok) {
            console.error('Error al obtener token de MiCorreo para importación:', await tokenResponse.text());
            return { success: false };
        }
        const tokenData = await tokenResponse.json();
        const token = tokenData.token;
        const deliveryType = orderData.tipoEnvio === 'envio_sucursal' ? 'S' : 'D';
        // Mapeo de provincias a códigos de Correo Argentino
        const provinciasMap = {
            'salta': 'A', 'buenos aires': 'B', 'capital federal': 'C', 'caba': 'C', 'ciudad autonoma de buenos aires': 'C',
            'san luis': 'D', 'entre rios': 'E', 'la rioja': 'F', 'santiago del estero': 'G',
            'chaco': 'H', 'san juan': 'J', 'catamarca': 'K', 'la pampa': 'L', 'mendoza': 'M',
            'misiones': 'N', 'formosa': 'P', 'neuquen': 'Q', 'rio negro': 'R', 'santa fe': 'S'
        };
        let provinceCode = 'B';
        const provName = ((_b = (_a = orderData.direccionEnvio) === null || _a === void 0 ? void 0 : _a.provincia) === null || _b === void 0 ? void 0 : _b.toLowerCase().trim()) || '';
        if (provName && provinciasMap[provName]) {
            provinceCode = provinciasMap[provName];
        }
        // Calcular peso estimado si no hay
        const totalItems = ((_c = orderData.items) === null || _c === void 0 ? void 0 : _c.reduce((sum, item) => sum + (item.cantidad || 1), 0)) || 1;
        const weight = Math.max(DEFAULT_WEIGHT, totalItems * 300); // 300g por prenda promedio
        // Limpiar string para ID de orden en correo (evitar prefijos raros si la API de correo es restrictiva)
        const cleanOrderId = orderId.replace(/^sale_web_/, '').replace(/^sale_/, '');
        const payload = {
            customerId: CLIENTE_ID,
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
            payload.shipping.agency = orderData.agencyId || 'E0000';
            payload.shipping.address = {
                streetName: ((_d = orderData.direccionEnvio) === null || _d === void 0 ? void 0 : _d.calle) || "NA",
                streetNumber: ((_e = orderData.direccionEnvio) === null || _e === void 0 ? void 0 : _e.numero) || "1",
                floor: ((_f = orderData.direccionEnvio) === null || _f === void 0 ? void 0 : _f.pisoDepto) ? orderData.direccionEnvio.pisoDepto.substring(0, 3) : null,
                apartment: null,
                city: ((_g = orderData.direccionEnvio) === null || _g === void 0 ? void 0 : _g.localidad) || "NA",
                provinceCode: provinceCode,
                postalCode: ((_h = orderData.direccionEnvio) === null || _h === void 0 ? void 0 : _h.codigoPostal) || "0000"
            };
        }
        else {
            payload.shipping.address = {
                streetName: ((_j = orderData.direccionEnvio) === null || _j === void 0 ? void 0 : _j.calle) || "NA",
                streetNumber: ((_k = orderData.direccionEnvio) === null || _k === void 0 ? void 0 : _k.numero) || "1",
                floor: ((_l = orderData.direccionEnvio) === null || _l === void 0 ? void 0 : _l.pisoDepto) ? orderData.direccionEnvio.pisoDepto.substring(0, 3) : null,
                apartment: null,
                city: ((_m = orderData.direccionEnvio) === null || _m === void 0 ? void 0 : _m.localidad) || "NA",
                provinceCode: provinceCode,
                postalCode: ((_o = orderData.direccionEnvio) === null || _o === void 0 ? void 0 : _o.codigoPostal) || "0000"
            };
        }
        const importResponse = await fetch(`${MI_CORREO_PROD_URL}/shipping/import`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!importResponse.ok) {
            const errTxt = await importResponse.text();
            console.error('Error al importar envío a MiCorreo:', errTxt);
            return { success: false };
        }
        const importData = await importResponse.json();
        console.log(`Envío importado exitosamente a MiCorreo para orden ${cleanOrderId}. CreatedAt:`, importData.createdAt, 'Full Data:', JSON.stringify(importData));
        // 4. Confirmar Envío
        // Según la documentación provista, se hace un POST a /orders/{orderId}/confirm
        // Asumimos que usa el extOrderId (cleanOrderId) o el ID que devuelve en importData.
        // Probaremos con el internal ID devuelto si existe, sino cleanOrderId.
        const miCorreoOrderId = importData.id || importData.orderId || cleanOrderId;
        const confirmResponse = await fetch(`${MI_CORREO_PROD_URL}/orders/${miCorreoOrderId}/confirm`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!confirmResponse.ok) {
            const confirmErr = await confirmResponse.text();
            console.error(`Error al confirmar envío en MiCorreo para orden ${miCorreoOrderId} (Status: ${confirmResponse.status}):`, confirmErr);
            return { success: false, error: `Importó bien pero falló confirmación. Status: ${confirmResponse.status}` };
        }
        const confirmData = await confirmResponse.json();
        console.log(`Envío confirmado en MiCorreo para orden ${cleanOrderId}. Tracking:`, confirmData.tracking_number || confirmData.trackingNumber);
        return {
            success: true,
            trackingNumber: confirmData.tracking_number || confirmData.trackingNumber || confirmData.trackingCode
        };
    }
    catch (error) {
        console.error('Error general al importar/confirmar en MiCorreo:', error);
        return { success: false };
    }
}
exports.obtenerEtiquetaPdf = functions.https.onCall(async (data, context) => {
    // Requires auth check depending on your security rules. We'll proceed if orderId is provided.
    const { orderId } = data;
    if (!orderId) {
        throw new functions.https.HttpsError('invalid-argument', 'El orderId es requerido.');
    }
    try {
        const authString = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
        const tokenResponse = await fetch(`${MI_CORREO_PROD_URL}/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            }
        });
        if (!tokenResponse.ok) {
            throw new functions.https.HttpsError('internal', 'Error de autenticación con Correo Argentino.');
        }
        const tokenData = await tokenResponse.json();
        const token = tokenData.token;
        // Limpiar string para ID de orden en correo
        const cleanOrderId = orderId.replace(/^sale_web_/, '').replace(/^sale_/, '');
        const labelResponse = await fetch(`${MI_CORREO_PROD_URL}/orders/${cleanOrderId}/labels`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!labelResponse.ok) {
            console.error('Error al obtener etiqueta de MiCorreo:', await labelResponse.text());
            throw new functions.https.HttpsError('internal', 'Error al obtener la etiqueta del correo.');
        }
        // MiCorreo devuelve el string en Base64 o la URL
        const labelData = await labelResponse.json();
        return { labelBase64: labelData.pdf || labelData.file || labelData.base64 || labelData.label || labelData };
    }
    catch (error) {
        console.error('Error general al obtener etiqueta PDF:', error);
        throw new functions.https.HttpsError('internal', 'Error al obtener la etiqueta', error);
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
            // We need to update the trackingNumber in the database.
            // Since we don't have showroomId directly, we do a collectionGroup query
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
//# sourceMappingURL=micorreo.js.map