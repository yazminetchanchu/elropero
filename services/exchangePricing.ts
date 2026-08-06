import { SaleItem } from '../types';

/** Descuento base ya incluido en precio transferencia vs tarjeta (misma regla que Caja). */
export const DESCUENTO_BASE_TRANSFERENCIA = 20;

export function transferLineTotal(item: {
  precioEfectivo: number;
  precioTarjeta: number;
  cantidad: number;
  descuento?: number;
}): number {
  const cant = item.cantidad ?? 0;
  const desc = item.descuento || 0;
  const descuentoExtra = Math.max(0, desc - DESCUENTO_BASE_TRANSFERENCIA);
  const precio = item.precioEfectivo * (1 - descuentoExtra / 100);
  return precio * cant;
}

export function sumTransferLines(items: SaleItem[]): number {
  return items.reduce((sum, item) => sum + transferLineTotal(item), 0);
}
