import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { CorreoArgentinoAgency, CorreoArgentinoTrackingResponseItem } from '../src/types/correoArgentinoTypes';

export interface CotizarEnvioParams {
  codigoPostalDestino: string;
  codigoPostalOrigen?: string;
  pesoGramos: number;
  dimensiones?: {
    height: number;
    width: number;
    length: number;
  };
  deliveredType?: 'D' | 'S'; // 'D' = Domicilio, 'S' = Sucursal
}

export interface CotizarEnvioResponse {
  costoEnvio: number;
  rates?: any;
}

/**
 * 1. Cotización: Calcular el costo del envío según el código postal de origen y destino, peso y dimensiones.
 */
export async function cotizarEnvio(params: CotizarEnvioParams): Promise<CotizarEnvioResponse> {
  try {
    const fn = httpsCallable(functions, 'cotizarEnvio');
    const response: any = await fn({
      codigoPostalDestino: params.codigoPostalDestino,
      codigoPostalOrigen: params.codigoPostalOrigen || '6620',
      pesoGramos: params.pesoGramos || 500,
      dimensiones: params.dimensiones || { height: 5, width: 20, length: 25 },
      deliveredType: params.deliveredType || 'D'
    });
    return response.data as CotizarEnvioResponse;
  } catch (error: any) {
    console.error('Error al cotizar envío con Correo Argentino:', error);
    throw new Error(error.message || 'Error al calcular la cotización con Correo Argentino.');
  }
}

/**
 * Obtener las sucursales de Correo Argentino disponibles para entrega en una provincia
 */
export async function obtenerSucursales(provinceCode: string): Promise<CorreoArgentinoAgency[]> {
  try {
    const fn = httpsCallable(functions, 'obtenerSucursales');
    const response: any = await fn({ provinceCode });
    return (response.data?.sucursales || []) as CorreoArgentinoAgency[];
  } catch (error: any) {
    console.error('Error al obtener sucursales de Correo Argentino:', error);
    throw new Error(error.message || 'Error al consultar sucursales de Correo Argentino.');
  }
}

import { db } from './firebase';
import { database } from './storage';
import { doc, updateDoc } from 'firebase/firestore';

const MI_CORREO_PROD_URL = 'https://api.correoargentino.com.ar/micorreo/v1';
const USERNAME = 'GDanisaAPI';
const PASSWORD = 'Inicial27+';
const CLIENTE_ID = '0001425237';
const DEFAULT_WEIGHT = 500;

export async function importarEnvioMiCorreoDirecto(orderId: string, orderData: any): Promise<{ success: boolean; trackingNumber?: string; error?: string }> {
  if (orderData.tipoEnvio !== 'envio' && orderData.tipoEnvio !== 'envio_sucursal') {
    return { success: false, error: `El pedido con tipo de envío "${orderData.tipoEnvio || 'no especificado'}" no es para envío por correo.` };
  }

  try {
    const authString = typeof btoa === 'function' ? btoa(`${USERNAME}:${PASSWORD}`) : Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
    const tokenResponse = await fetch(`${MI_CORREO_PROD_URL}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json'
      }
    });

    if (!tokenResponse.ok) {
      const errTxt = await tokenResponse.text();
      return { success: false, error: `Error de autenticación con MiCorreo API (${tokenResponse.status}): ${errTxt}` };
    }

    const tokenData: any = await tokenResponse.json();
    const token = tokenData.token;

    const deliveryType = orderData.tipoEnvio === 'envio_sucursal' ? 'S' : 'D';

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

    const totalItems = orderData.items?.reduce((sum: number, item: any) => sum + (item.cantidad || 1), 0) || 1;
    const weight = Math.max(DEFAULT_WEIGHT, totalItems * 300);
    const cleanOrderId = orderId.replace(/^sale_web_/, '').replace(/^sale_/, '');

    const payload: any = {
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
        phone: orderData.customerTelefono || "1100000000",
        cellPhone: orderData.customerTelefono || "1100000000",
        email: orderData.customerEmail || "cliente@example.com"
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
      if (importResponse.status === 400 && (errTxt.includes('importada con anterioridad') || errTxt.includes('anterioridad'))) {
        console.log(`La orden ${cleanOrderId} ya fue importada previamente en MiCorreo. Retornando trackingNumber.`);
        try {
          const showroomId = database.getShowroomID();
          if (showroomId) {
            const orderRef = doc(db, 'showrooms', showroomId, 'orders', orderId);
            await updateDoc(orderRef, {
              trackingNumber: cleanOrderId,
              estadoEnvio: 'CONFIRMADO'
            });
          }
        } catch (dbErr) {
          console.warn('No se pudo actualizar Firestore desde el cliente:', dbErr);
        }
        return { success: true, trackingNumber: cleanOrderId };
      }
      return { success: false, error: `Error al importar envío en MiCorreo (${importResponse.status}): ${errTxt}` };
    }

    const importData = await importResponse.json();
    const trackingNumber = importData.tracking_number || importData.trackingNumber || importData.trackingCode || cleanOrderId;

    // Actualizar en Firestore localmente si es posible
    try {
      const showroomId = database.getShowroomID();
      if (showroomId) {
        const orderRef = doc(db, 'showrooms', showroomId, 'orders', orderId);
        await updateDoc(orderRef, {
          trackingNumber: trackingNumber,
          estadoEnvio: 'CONFIRMADO'
        });
      }
    } catch (dbErr) {
      console.warn('No se pudo actualizar Firestore desde el cliente:', dbErr);
    }

    return { success: true, trackingNumber };
  } catch (error: any) {
    return { success: false, error: error.message || 'Error de conexión con MiCorreo API' };
  }
}

/**
 * 2. Gestión de Órdenes: Crear, dar de alta y pagar etiquetas de envíos a domicilio o a sucursal.
 */
export async function generarEnvioManual(orderId: string, orderData: any): Promise<{ success: boolean; trackingNumber?: string; error?: string }> {
  try {
    const fn = httpsCallable(functions, 'generarEnvioManual');
    const response: any = await fn({ orderId, orderData });
    if (response?.data?.success && response?.data?.trackingNumber) {
      return response.data;
    }
    if (response?.data && !response.data.success) {
      console.warn('Cloud Function devuelvo respuesta no exitosa, intentando envío directo a MiCorreo:', response.data.error);
      const directResult = await importarEnvioMiCorreoDirecto(orderId, orderData);
      if (directResult.success) {
        return directResult;
      }
      return { success: false, error: directResult.error || response.data.error };
    }
    return response.data;
  } catch (error: any) {
    console.warn('Error al llamar a la Cloud Function generarEnvioManual, ejecutando fallback directo:', error);
    return await importarEnvioMiCorreoDirecto(orderId, orderData);
  }
}

/**
 * Descargar la etiqueta oficial PDF en formato Base64 directamente desde la API de MiCorreo
 */
export async function obtenerEtiquetaPdfDirecto(orderId: string): Promise<string> {
  const authString = typeof btoa === 'function' ? btoa(`${USERNAME}:${PASSWORD}`) : Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  const tokenResponse = await fetch(`${MI_CORREO_PROD_URL}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/json'
    }
  });

  if (!tokenResponse.ok) {
    const errTxt = await tokenResponse.text();
    throw new Error(`Error de autenticación con MiCorreo API (${tokenResponse.status}): ${errTxt}`);
  }

  const tokenData: any = await tokenResponse.json();
  const token = tokenData.token;
  const cleanOrderId = orderId.replace(/^sale_web_/, '').replace(/^sale_/, '');

  const labelResponse = await fetch(`${MI_CORREO_PROD_URL}/orders/${cleanOrderId}/labels`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!labelResponse.ok) {
    const errTxt = await labelResponse.text();
    throw new Error(`La etiqueta de envío no se encuentra disponible por API en MiCorreo (${labelResponse.status}). Podés imprimirla ingresando al panel de Mi Correo.`);
  }

  const contentType = labelResponse.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    const blob = await labelResponse.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        const base64 = base64data.split(',')[1] || base64data;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    const text = await labelResponse.text();
    try {
      const labelData = JSON.parse(text);
      const base64 = labelData.pdf || labelData.file || labelData.base64 || labelData.label || labelData.pdfBase64 || labelData.content || (typeof labelData === 'string' ? labelData : text);
      return base64;
    } catch {
      return text;
    }
  }
}

/**
 * Descargar la etiqueta oficial PDF en formato Base64
 */
export async function obtenerEtiquetaPdf(orderId: string): Promise<string> {
  try {
    const fn = httpsCallable(functions, 'obtenerEtiquetaPdf');
    const response: any = await fn({ orderId });
    const labelBase64 = response.data?.labelBase64;
    if (!labelBase64) {
      throw new Error('No se recibió el contenido de la etiqueta PDF.');
    }
    return labelBase64;
  } catch (error: any) {
    console.warn('Error al obtener etiqueta PDF vía Cloud Function, ejecutando fallback directo:', error);
    return await obtenerEtiquetaPdfDirecto(orderId);
  }
}

/**
 * 3. Tracking: Consultar el estado y seguimiento logístico de los paquetes generados
 */
export async function obtenerTracking(trackingNumber: string): Promise<CorreoArgentinoTrackingResponseItem | null> {
  try {
    const fn = httpsCallable(functions, 'obtenerTracking');
    const response: any = await fn({ trackingNumber });
    if (response.data?.success && response.data?.tracking) {
      return response.data.tracking as CorreoArgentinoTrackingResponseItem;
    }
    return null;
  } catch (error: any) {
    console.error('Error al consultar tracking logístico:', error);
    throw new Error(error.message || 'Error al consultar el seguimiento del paquete.');
  }
}
