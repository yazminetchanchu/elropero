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
exports.getMiCorreoToken = getMiCorreoToken;
exports.fetchMiCorreoRates = fetchMiCorreoRates;
exports.fetchMiCorreoAgencies = fetchMiCorreoAgencies;
exports.fetchMiCorreoImport = fetchMiCorreoImport;
exports.fetchMiCorreoLabel = fetchMiCorreoLabel;
exports.fetchMiCorreoTracking = fetchMiCorreoTracking;
const functions = __importStar(require("firebase-functions/v1"));
/**
 * Obtain an authentication token from MiCorreo.
 */
async function getMiCorreoToken(url, username, password) {
    if (!username || !password) {
        throw new Error('Faltan credenciales de MiCorreo (MICORREO_USERNAME o MICORREO_PASSWORD) en las variables de entorno del servidor.');
    }
    const authString = Buffer.from(`${username}:${password}`).toString('base64');
    const tokenResponse = await fetch(`${url}/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${authString}`,
            'Content-Type': 'application/json',
        },
    });
    if (!tokenResponse.ok) {
        const errTxt = await tokenResponse.text();
        console.error('Error al obtener token de MiCorreo:', errTxt);
        throw new Error(`Error de autenticación con Correo Argentino (${tokenResponse.status}): ${errTxt}`);
    }
    const tokenData = await tokenResponse.json();
    const token = tokenData.token;
    if (!token) {
        throw new Error('La respuesta de autenticación de MiCorreo no contiene token.');
    }
    return token;
}
/** Fetch rates from MiCorreo */
async function fetchMiCorreoRates(url, token, payload) {
    const response = await fetch(`${url}/rates`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const errTxt = await response.text();
        console.error('Error al cotizar con MiCorreo:', errTxt);
        throw new functions.https.HttpsError('internal', `Error al calcular tarifas con Correo Argentino: ${errTxt}`);
    }
    return await response.json();
}
/** Fetch agencies (sucursales) */
async function fetchMiCorreoAgencies(url, token, customerId, provinceCode) {
    const agenciesUrl = new URL(`${url}/agencies`);
    agenciesUrl.searchParams.append('customerId', customerId);
    agenciesUrl.searchParams.append('provinceCode', provinceCode);
    const response = await fetch(agenciesUrl.toString(), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) {
        const errTxt = await response.text();
        console.error('Error al obtener sucursales con MiCorreo:', errTxt);
        throw new functions.https.HttpsError('internal', `Error al obtener sucursales de Correo Argentino: ${errTxt}`);
    }
    return await response.json();
}
async function fetchMiCorreoImport(url, token, payload, cleanOrderId) {
    const response = await fetch(`${url}/shipping/import`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const errTxt = await response.text();
        if (response.status === 400 && (errTxt.includes('importada con anterioridad') || errTxt.includes('anterioridad'))) {
            return { importData: null, duplicate: true };
        }
        console.error('Error al importar envío a MiCorreo:', errTxt);
        throw new functions.https.HttpsError('internal', `Error al importar envío en MiCorreo (${response.status}): ${errTxt}`);
    }
    const importData = await response.json();
    return { importData, duplicate: false };
}
/** Fetch label PDF (or Base64) */
async function fetchMiCorreoLabel(url, token, cleanOrderId) {
    const response = await fetch(`${url}/orders/${cleanOrderId}/labels`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) {
        const errTxt = await response.text();
        console.error('Error al obtener etiqueta de MiCorreo:', errTxt);
        throw new functions.https.HttpsError('not-found', 'La etiqueta de envío no se encuentra disponible por API. Podés imprimirla directamente ingresando al panel de Mi Correo Argentino.');
    }
    const contentType = response.headers.get('content-type') || '';
    let labelBase64 = '';
    if (contentType.includes('application/pdf')) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        labelBase64 = buffer.toString('base64');
    }
    else {
        const text = await response.text();
        try {
            const labelData = JSON.parse(text);
            labelBase64 = labelData.pdf || labelData.file || labelData.base64 || labelData.label || labelData.pdfBase64 || labelData.content || (typeof labelData === 'string' ? labelData : text);
        }
        catch (_a) {
            labelBase64 = text;
        }
    }
    return { labelBase64 };
}
/** Fetch tracking information */
async function fetchMiCorreoTracking(url, token, customerId, trackingNumber) {
    const trackingUrl = new URL(`${url}/orders/tracking`);
    trackingUrl.searchParams.append('customerId', customerId);
    trackingUrl.searchParams.append('trackingNumber', trackingNumber);
    const response = await fetch(trackingUrl.toString(), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) {
        const errTxt = await response.text();
        console.error('Error al consultar tracking con MiCorreo:', errTxt);
        throw new functions.https.HttpsError('internal', `Error al consultar el seguimiento en Correo Argentino: ${errTxt}`);
    }
    return await response.json();
}
//# sourceMappingURL=micorreoHelpers.js.map