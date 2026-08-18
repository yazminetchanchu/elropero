import { SaleItem } from '../types';

/** Descuento base ya incluido en precio transferencia vs tarjeta (misma regla que Caja). */
export const DESCUENTO_BASE_TRANSFERENCIA = 20;

export function calcExchangeLineTotal(
  item: {
    precioEfectivo: number;
    precioTarjeta: number;
    cantidad?: number;
    descuento?: number;
  },
  isTransferencia: boolean
): number {
  const cant = item.cantidad ?? 0;
  const desc = item.descuento || 0;
  if (isTransferencia) {
    const descuentoExtra = Math.max(0, desc - DESCUENTO_BASE_TRANSFERENCIA);
    return item.precioEfectivo * (1 - descuentoExtra / 100) * cant;
  } else {
    return item.precioTarjeta * (1 - desc / 100) * cant;
  }
}

export function sumExchangeLines(items: SaleItem[], isTransferencia: boolean): number {
  return items.reduce((sum, item) => sum + calcExchangeLineTotal(item, isTransferencia), 0);
}

export function transferLineTotal(item: {
  precioEfectivo: number;
  precioTarjeta: number;
  cantidad: number;
  descuento?: number;
}): number {
  return calcExchangeLineTotal(item, true);
}

export function sumTransferLines(items: SaleItem[]): number {
  return sumExchangeLines(items, true);
}

