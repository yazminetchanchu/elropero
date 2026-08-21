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

/**
 * 2. Gestión de Órdenes: Crear, dar de alta y pagar etiquetas de envíos a domicilio o a sucursal.
 */
export async function generarEnvioManual(orderId: string, orderData: any): Promise<{ success: boolean; trackingNumber?: string; error?: string }> {
  try {
    const fn = httpsCallable(functions, 'generarEnvioManual');
    const response: any = await fn({ orderId, orderData });
    return (response.data || { success: false, error: 'Respuesta vacía del servidor' }) as { success: boolean; trackingNumber?: string; error?: string };
  } catch (error: any) {
    console.error('Error al llamar a la Cloud Function generarEnvioManual:', error);
    return { success: false, error: error.message || 'Error al generar envío con Correo Argentino' };
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
    console.error('Error al obtener etiqueta PDF vía Cloud Function:', error);
    throw new Error(error.message || 'Error al obtener la etiqueta PDF');
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
