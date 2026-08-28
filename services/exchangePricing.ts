import { SaleItem } from '../types';

/** Descuento base ya incluido en precio transferencia vs tarjeta (misma regla que Caja). */
export const DESCUENTO_BASE_TRANSFERENCIA = 20;

/**
 * Caracteres legibles para códigos de Gift Card amigables para el usuario.
 * Excluye 0, O, 1, I para evitar ambigüedades.
 */
export const FRIENDLY_GIFT_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Genera un código de Gift Card amigable (ej: GC-9X7K-4M2P) asegurando unicidad.
 */
export function generateFriendlyGiftCardCode(existingCodes: string[] = []): string {
  const existingSet = new Set(existingCodes.map((c) => (c || '').trim().toUpperCase()));
  let code = '';
  let attempts = 0;
  do {
    let p1 = '';
    let p2 = '';
    for (let i = 0; i < 4; i++) {
      p1 += FRIENDLY_GIFT_CHARS[Math.floor(Math.random() * FRIENDLY_GIFT_CHARS.length)];
      p2 += FRIENDLY_GIFT_CHARS[Math.floor(Math.random() * FRIENDLY_GIFT_CHARS.length)];
    }
    code = `GC-${p1}-${p2}`;
    attempts++;
  } while (existingSet.has(code) && attempts < 200);

  return code;
}

/**
 * Normaliza la clave de modelo de un ítem para agrupar variantes de talle/color del mismo producto.
 */
export function extractProductModelKey(item: {
  productId?: string;
  id?: string;
  descripcion?: string;
}): string {
  if (item.productId && item.productId.trim()) {
    return item.productId.trim().toLowerCase();
  }
  // Si id es el ID de inventario real (no prefijo temporal)
  if (item.id && item.id.trim() && !item.id.startsWith('item_') && !item.id.startsWith('cart_')) {
    return item.id.trim().toLowerCase();
  }
  const desc = (item.descripcion || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
  return desc || (item.id || '').toLowerCase().trim();
}

/**
 * Calcula el valor pagado neto para una línea de prendas devueltas.
 */
export function calcExchangeLineTotal(
  item: {
    precioEfectivo?: number;
    precioTarjeta?: number;
    precio?: number;
    cantidad?: number;
    descuento?: number;
  },
  isTransferencia: boolean
): number {
  const cant = item.cantidad ?? 1;
  const desc = item.descuento || 0;
  const precioEf = item.precioEfectivo ?? item.precio ?? 0;
  const precioTar = item.precioTarjeta ?? item.precio ?? 0;

  if (isTransferencia) {
    const descuentoExtra = Math.max(0, desc - DESCUENTO_BASE_TRANSFERENCIA);
    return precioEf * (1 - descuentoExtra / 100) * cant;
  } else {
    return precioTar * (1 - desc / 100) * cant;
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

export interface NewExchangeItemInput {
  id?: string;
  productId?: string;
  descripcion?: string;
  cantidad?: number;
  quantity?: number;
  precioEfectivo?: number;
  precioTarjeta?: number;
  precioUnitario?: number;
  unitPrice?: number;
  product?: any;
  descuento?: number;
}

export interface ExchangeBreakdownResult {
  matchedPairsCount: number;
  matchedPairs: Array<{
    returnedDesc: string;
    newDesc: string;
    modelKey: string;
  }>;
  unmatchedReturnedUnits: Array<{
    descripcion: string;
    modelKey: string;
    paidAmount: number;
  }>;
  unmatchedNewUnits: Array<{
    descripcion: string;
    modelKey: string;
    currentPrice: number;
  }>;
  totalNewUnmatchedCost: number;
  totalReturnedUnmatchedCredit: number;
  diferenciaSinEnvio: number;
  costoEnvioTotal: number;
  diferenciaTotal: number;
  montoGiftCard: number;
  montoAPagar: number;
}

/**
 * Motor de cálculo de cambios:
 * 1. Desglosa unidad por unidad tanto las prendas devueltas como las nuevas.
 * 2. Realiza matching 1:1 por modelo ($0 de diferencia para cambios de talle/color).
 * 3. Las unidades devueltas sobrantes se toman al valor neto pagado original.
 * 4. Las unidades nuevas sobrantes se toman a su precio actual vigente.
 * 5. Suma los costos de envío si corresponden.
 */
export function calculateExchangeBreakdown(options: {
  itemsDevueltos: SaleItem[];
  itemsNuevos: NewExchangeItemInput[];
  isTransferenciaDev: boolean;
  isTransferenciaNuevo?: boolean;
  costoEnvioTotal?: number;
  resolveNewUnitPrice?: (item: NewExchangeItemInput) => number;
}): ExchangeBreakdownResult {
  const {
    itemsDevueltos,
    itemsNuevos,
    isTransferenciaDev,
    isTransferenciaNuevo = isTransferenciaDev,
    costoEnvioTotal = 0,
    resolveNewUnitPrice,
  } = options;

  // 1. Expandir unidades devueltas
  interface ReturnedUnit {
    descripcion: string;
    modelKey: string;
    paidAmount: number;
    matched: boolean;
  }

  const returnedUnits: ReturnedUnit[] = [];
  for (const item of itemsDevueltos || []) {
    const qty = item.cantidad ?? 1;
    const unitPaid = calcExchangeLineTotal({ ...item, cantidad: 1 }, isTransferenciaDev);
    const modelKey = extractProductModelKey(item);
    for (let i = 0; i < qty; i++) {
      returnedUnits.push({
        descripcion: item.descripcion,
        modelKey,
        paidAmount: unitPaid,
        matched: false,
      });
    }
  }

  // 2. Expandir unidades nuevas
  interface NewUnit {
    descripcion: string;
    modelKey: string;
    currentPrice: number;
    matched: boolean;
  }

  const newUnits: NewUnit[] = [];
  for (const item of itemsNuevos || []) {
    const qty = item.cantidad ?? item.quantity ?? 1;
    let unitPrice = 0;
    if (resolveNewUnitPrice) {
      unitPrice = resolveNewUnitPrice(item);
    } else if (item.unitPrice !== undefined) {
      unitPrice = item.unitPrice;
    } else if (item.precioUnitario !== undefined) {
      unitPrice = item.precioUnitario;
    } else {
      unitPrice = calcExchangeLineTotal({ ...item, cantidad: 1 }, isTransferenciaNuevo);
    }

    const modelKey = extractProductModelKey(item);
    for (let i = 0; i < qty; i++) {
      newUnits.push({
        descripcion: item.descripcion || item.product?.descripcion || 'Prenda nueva',
        modelKey,
        currentPrice: unitPrice,
        matched: false,
      });
    }
  }

  // 3. Matching 1:1 por modelo
  const matchedPairs: Array<{ returnedDesc: string; newDesc: string; modelKey: string }> = [];

  for (const newUnit of newUnits) {
    const matchIndex = returnedUnits.findIndex((ret) => !ret.matched && ret.modelKey === newUnit.modelKey);
    if (matchIndex !== -1) {
      const retUnit = returnedUnits[matchIndex];
      retUnit.matched = true;
      newUnit.matched = true;
      matchedPairs.push({
        returnedDesc: retUnit.descripcion,
        newDesc: newUnit.descripcion,
        modelKey: retUnit.modelKey,
      });
    }
  }

  // 4. Calcular sobrantes
  const unmatchedReturnedUnits = returnedUnits.filter((u) => !u.matched);
  const unmatchedNewUnits = newUnits.filter((u) => !u.matched);

  const totalNewUnmatchedCost = unmatchedNewUnits.reduce((acc, u) => acc + u.currentPrice, 0);
  const totalReturnedUnmatchedCredit = unmatchedReturnedUnits.reduce((acc, u) => acc + u.paidAmount, 0);

  const diferenciaSinEnvio = totalNewUnmatchedCost - totalReturnedUnmatchedCredit;
  const diferenciaTotal = diferenciaSinEnvio + (costoEnvioTotal || 0);

  return {
    matchedPairsCount: matchedPairs.length,
    matchedPairs,
    unmatchedReturnedUnits,
    unmatchedNewUnits,
    totalNewUnmatchedCost,
    totalReturnedUnmatchedCredit,
    diferenciaSinEnvio,
    costoEnvioTotal,
    diferenciaTotal,
    montoGiftCard: diferenciaTotal < 0 ? Math.abs(diferenciaTotal) : 0,
    montoAPagar: diferenciaTotal > 0 ? diferenciaTotal : 0,
  };
}
