import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

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

async function getMiCorreoToken(url: string, username: string, password: string): Promise<string> {
  if (!username || !password) {
    throw new Error('Faltan credenciales de MiCorreo (MICORREO_USERNAME o MICORREO_PASSWORD) en las variables de entorno del servidor.');
  }

  const authString = Buffer.from(`${username}:${password}`).toString('base64');
  const tokenResponse = await fetch(`${url}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/json'
    }
  });

  if (!tokenResponse.ok) {
    const errTxt = await tokenResponse.text();
    console.error('Error al obtener token de MiCorreo:', errTxt);
    throw new Error(`Error de autenticación con Correo Argentino (${tokenResponse.status}): ${errTxt}`);
  }

  const tokenData: any = await tokenResponse.json();
  const token = tokenData.token;
  if (!token) {
    throw new Error('La respuesta de autenticación de MiCorreo no contiene token.');
  }
  return token;
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

    const ratesResponse = await fetch(`${url}/rates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ratesPayload)
    });

    if (!ratesResponse.ok) {
      const errTxt = await ratesResponse.text();
      console.error('Error al cotizar con MiCorreo:', errTxt);
      throw new functions.https.HttpsError('internal', `Error al calcular tarifas con Correo Argentino: ${errTxt}`);
    }

    const ratesData: any = await ratesResponse.json();
    
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
    const agenciesUrl = new URL(`${url}/agencies`);
    agenciesUrl.searchParams.append('customerId', customerId);
    agenciesUrl.searchParams.append('provinceCode', provinceCode);

    const agenciesResponse = await fetch(agenciesUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!agenciesResponse.ok) {
      const errTxt = await agenciesResponse.text();
      console.error('Error al obtener sucursales con MiCorreo:', errTxt);
      throw new functions.https.HttpsError('internal', `Error al obtener sucursales de Correo Argentino: ${errTxt}`);
    }

    const agenciesData: any = await agenciesResponse.json();
    
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

    const importResponse = await fetch(`${url}/shipping/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!importResponse.ok) {
      const errTxt = await importResponse.text();
      if (importResponse.status === 400 && (errTxt.includes('importada con anterioridad') || errTxt.includes('anterioridad'))) {
        console.log(`La orden ${cleanOrderId} ya fue importada previamente en MiCorreo. Retornando cleanOrderId como trackingNumber.`);
        return { 
          success: true, 
          trackingNumber: cleanOrderId
        };
      }
      console.error('Error al importar envío a MiCorreo:', errTxt);
      return { success: false, error: `Error al importar envío en MiCorreo (${importResponse.status}): ${errTxt}` };
    }

    const importData = await importResponse.json();
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

    const labelResponse = await fetch(`${url}/orders/${cleanOrderId}/labels`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!labelResponse.ok) {
      const errTxt = await labelResponse.text();
      console.error('Error al obtener etiqueta de MiCorreo:', errTxt);
      throw new functions.https.HttpsError('not-found', 'La etiqueta de envío no se encuentra disponible por API. Podés imprimirla directamente ingresando al panel de Mi Correo Argentino.');
    }

    const contentType = labelResponse.headers.get('content-type') || '';
    let labelBase64 = '';

    if (contentType.includes('application/pdf')) {
      const arrayBuffer = await labelResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      labelBase64 = buffer.toString('base64');
    } else {
      const text = await labelResponse.text();
      try {
        const labelData = JSON.parse(text);
        labelBase64 = labelData.pdf || labelData.file || labelData.base64 || labelData.label || labelData.pdfBase64 || labelData.content || (typeof labelData === 'string' ? labelData : text);
      } catch {
        labelBase64 = text;
      }
    }

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

    const trackingUrl = new URL(`${url}/orders/tracking`);
    trackingUrl.searchParams.append('customerId', customerId);
    trackingUrl.searchParams.append('trackingNumber', trackingNumber);

    const trackingResp = await fetch(trackingUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!trackingResp.ok) {
      const errTxt = await trackingResp.text();
      console.error('Error al consultar tracking con MiCorreo:', errTxt);
      throw new functions.https.HttpsError('internal', `Error al consultar el seguimiento en Correo Argentino: ${errTxt}`);
    }

    const trackingData: any = await trackingResp.json();
    return { success: true, tracking: trackingData };

  } catch (error: any) {
    console.error('Error general en obtenerTracking:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Error al comunicarse con Correo Argentino para tracking');
  }
});
