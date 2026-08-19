import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { SaleItem } from '../types';

export interface WebCambioPayload {
  ventaOriginalId: string;
  itemsDevueltos: SaleItem[];
  itemsNuevos: SaleItem[];
  diferencia: number;
  giftDestinatario?: string;
  customerNombre?: string;
  pago?: { efectivo: number; tarjeta: number };
  costoEnvio?: number;
  costoEnvioDevolucion?: number;
  costoEnvioNuevo?: number;
  tipoEnvioDevolucion?: 'S' | 'D' | 'local' | 'recoleta';
  tipoEnvioNuevo?: 'S' | 'D' | 'local' | 'recoleta';
  codigoPostalCliente?: string;
}

/**
 * Registra un cambio web delegando la transacción al backend (Cloud Function).
 * Esto evita el error de permisos donde usuarios no-admin no pueden modificar
 * los campos sales y giftCards del documento showroom.
 */
export async function fulfillWebCambio(
  showroomId: string,
  payload: WebCambioPayload
): Promise<{ saleId: string; giftCodigo?: string }> {
  if (!payload.itemsDevueltos?.length) {
    throw new Error('Debés seleccionar al menos una prenda a devolver.');
  }

  const fulfillFn = httpsCallable(functions, 'fulfillWebCambioServer');
  const result = await fulfillFn({ showroomId, payload });
  const data = result.data as { saleId: string; giftCodigo: string | null };

  return {
    saleId: data.saleId,
    giftCodigo: data.giftCodigo || undefined,
  };
}

