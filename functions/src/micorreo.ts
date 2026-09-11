import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { getMiCorreoToken, fetchMiCorreoRates, fetchMiCorreoAgencies, fetchMiCorreoImport, fetchMiCorreoLabel, fetchMiCorreoTracking } from './micorreoHelpers';

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



export const cotizarEnvio = functions.https.onCall(async (data, context) => {
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
    const token = await getMiCorreoToken(url, username, password);

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
        height: dimensiones?.height || 5,
        width: dimensiones?.width || 20,
        length: dimensiones?.length || 25
      }
    };

    const ratesData: any = await fetchMiCorreoRates(url, token, ratesPayload);
    
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

  } catch (error: any) {
    console.error('Error general en cotizarEnvio:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Error al comunicarse con Correo Argentino');
  }
});

export const obtenerSucursales = functions.https.onCall(async (data, context) => {
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
    const token = await getMiCorreoToken(url, username, password);

    // 2. Obtener sucursales
    const agenciesData: any = await fetchMiCorreoAgencies(url, token, customerId, provinceCode);
    
    let validAgencies = [];
    if (Array.isArray(agenciesData)) {
      validAgencies = agenciesData.filter((agency: any) => agency?.services?.pickupAvailability === true);
    }

    return { sucursales: validAgencies };

  } catch (error: any) {
    console.error('Error general en obtenerSucursales:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Error al comunicarse con Correo Argentino para sucursales');
  }
});

export async function importarEnvioMiCorreo(orderId: string, orderData: any): Promise<{ success: boolean; trackingNumber?: string; error?: string }> {
  if (orderData.tipoEnvio !== 'envio' && orderData.tipoEnvio !== 'envio_sucursal') {
    return { success: false, error: `El tipo de envío "${orderData.tipoEnvio || 'no especificado'}" no corresponde a un envío por correo.` };
  }

  const { url, username, password, customerId, defaultWeight } = getMiCorreoCredentials();

  if (!customerId) {
    return { success: false, error: 'Cliente ID de MiCorreo no configurado en variables de entorno.' };
  }

  try {
    // 1. Obtener Token
    const token = await getMiCorreoToken(url, username, password);

    const deliveryType = orderData.tipoEnvio === 'envio_sucursal' ? 'S' : 'D';

    // Mapeo completo de provincias a códigos de Correo Argentino (ISO / MiCorreo)
    const provinciasMap: Record<string, string> = {
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
    const provName = (
      orderData.direccionEnvio?.provincia ||
      orderData.sucursalCorreoArgentino?.location?.state_name ||
      ''
    ).toLowerCase().trim();
    if (provName && provinciasMap[provName]) {
      provinceCode = provinciasMap[provName];
    }

    // Calcular peso estimado si no hay
    const totalItems = orderData.items?.reduce((sum: number, item: any) => sum + (item.cantidad || 1), 0) || 1;
    const weight = Math.max(defaultWeight, totalItems * 300); // 300g por prenda promedio
    
    // Limpiar string para ID de orden en correo (evitar prefijos raros si la API de correo es restrictiva)
    const cleanOrderId = orderId.replace(/^sale_web_/, '').replace(/^sale_/, '');

    const payload: any = {
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
      payload.shipping.agency = orderData.agencyId || orderData.sucursalCorreoArgentino?.agency_id || 'E0000';
      payload.shipping.address = {
        streetName: orderData.sucursalCorreoArgentino?.location?.street_name || orderData.direccionEnvio?.calle || "NA",
        streetNumber: orderData.sucursalCorreoArgentino?.location?.street_number || orderData.direccionEnvio?.numero || "1",
        floor: orderData.direccionEnvio?.pisoDepto ? orderData.direccionEnvio.pisoDepto.substring(0, 3) : null,
        apartment: null,
        city: orderData.sucursalCorreoArgentino?.location?.city_name || orderData.direccionEnvio?.localidad || "NA",
        provinceCode: provinceCode,
        postalCode: orderData.sucursalCorreoArgentino?.location?.zip_code || orderData.direccionEnvio?.codigoPostal || "0000"
      };
    } else {
      payload.shipping.address = {
        streetName: orderData.direccionEnvio?.calle || "NA",
        streetNumber: orderData.direccionEnvio?.numero || "1",
        floor: orderData.direccionEnvio?.pisoDepto ? orderData.direccionEnvio.pisoDepto.substring(0, 3) : null,
        apartment: null,
        city: orderData.direccionEnvio?.localidad || "NA",
        provinceCode: provinceCode,
        postalCode: orderData.direccionEnvio?.codigoPostal || "0000"
      };
    }

    const { importData, duplicate } = await fetchMiCorreoImport(url, token, payload, cleanOrderId);
    if (duplicate) {
      return { success: true, trackingNumber: cleanOrderId };
    }

    console.log(`Envío importado exitosamente a MiCorreo para orden ${cleanOrderId}. CreatedAt:`, importData.createdAt, 'Full Data:', JSON.stringify(importData));

    const trackingNumber = importData.tracking_number || importData.trackingNumber || importData.trackingCode || cleanOrderId;

    return { 
      success: true, 
      trackingNumber
    };

  } catch (error: any) {
    console.error('Error general al importar en MiCorreo:', error);
    return { success: false, error: error.message || 'Error general al importar envío' };
  }
}

export const obtenerEtiquetaPdf = functions.https.onCall(async (data, context) => {
  const { orderId } = data;

  if (!orderId) {
    throw new functions.https.HttpsError('invalid-argument', 'El orderId es requerido.');
  }

  const { url, username, password } = getMiCorreoCredentials();

  try {
    const token = await getMiCorreoToken(url, username, password);

    // Limpiar string para ID de orden en correo
    const cleanOrderId = orderId.replace(/^sale_web_/, '').replace(/^sale_/, '');

    const { labelBase64 } = await fetchMiCorreoLabel(url, token, cleanOrderId);

    return { labelBase64 };
  } catch (error: any) {
    console.error('Error general al obtener etiqueta PDF:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Error al obtener la etiqueta');
  }
});

export const generarEnvioManual = functions.https.onCall(async (data, context) => {
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
  } catch (error) {
    console.error('Error en generarEnvioManual:', error);
    throw new functions.https.HttpsError('internal', 'Error interno al generar envío');
  }
});

export const obtenerTracking = functions.https.onCall(async (data, context) => {
  const { trackingNumber } = data;

  if (!trackingNumber) {
    throw new functions.https.HttpsError('invalid-argument', 'El número de seguimiento (trackingNumber) es requerido.');
  }

  const { url, username, password, customerId } = getMiCorreoCredentials();

  if (!customerId) {
    throw new functions.https.HttpsError('failed-precondition', 'Cliente ID de MiCorreo no configurado en variables de entorno.');
  }

  try {
    const token = await getMiCorreoToken(url, username, password);

    const trackingData: any = await fetchMiCorreoTracking(url, token, customerId, trackingNumber);
    return { success: true, tracking: trackingData };

  } catch (error: any) {
    console.error('Error general en obtenerTracking:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Error al comunicarse con Correo Argentino para tracking');
  }
});
