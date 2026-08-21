import { Sale, InventoryItem } from '../types';

/**
 * Calculate suggested prices based on cost using realistic markup percentages.
 * Prices are rounded up to the nearest thousand for consistency.
 */
export const calculatePricesFromCost = (cost: number) => {
  const ventaEfectivo = Math.ceil((cost * 1.68) / 1000) * 1000;
  const ventaTarjeta = Math.ceil((ventaEfectivo * 1.27) / 1000) * 1000;
  return { ventaEfectivo, ventaTarjeta };
};

/**
 * Helper to safely parse numeric values that may be strings with separators.
 */
const parseNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove any character that is not a digit, comma, dot or minus sign
    const cleaned = value.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

/**
 * Extract useful numeric fields from an inventory item.
 */
export const getItemSnapshot = (item: any) => {
  const costoRaw = item.costo ?? item.costoUnidad;
  const costo = parseNumber(costoRaw);

  const precioTarjeta = parseNumber(
    typeof item.precioTarjeta === 'number'
      ? item.precioTarjeta
      : typeof item.ventaTarjeta === 'number'
      ? item.ventaTarjeta
      : typeof item.precio === 'number'
      ? item.precio
      : item.precioTarjeta ?? item.ventaTarjeta ?? item.precio
  );

  const precioEfectivo = parseNumber(
    typeof item.precioEfectivo === 'number'
      ? item.precioEfectivo
      : typeof item.ventaEfectivo === 'number'
      ? item.ventaEfectivo
      : item.precioEfectivo ?? item.ventaEfectivo
  );

  const descuento = parseNumber(item.descuento);
  return { costo, precioEfectivo, precioTarjeta, descuento };
};

/**
 * Compute breakdown of a sale (cash, card, total, cost, gain).
 * Handles normal sales, gift cards, and exchanges (cambio).
 */
export const computeSaleBreakdown = (sale: Sale, sales: Sale[]) => {
  // Gift Card sales – treat like a normal cash sale.
  if (sale.tipo === 'gift') {
    const total = sale.total ?? 0;
    const pctE = sale.pago?.efectivo ?? 100;
    const pctT = sale.pago?.tarjeta ?? 0;
    return {
      efectivo: total * (pctE / 100),
      tarjeta: total * (pctT / 100),
      totalCobrado: total,
      costoTotal: 0,
      ganancia: total,
    };
  }

  // Exchange (cambio) – calculate gain based on returned vs new items.
  if (sale.tipo === 'cambio') {
    const diferencia = sale.diferencia ?? sale.total ?? 0;
    const cobrado = Math.max(0, diferencia);
    const pctE = sale.pago?.efectivo ?? 100;
    const pctT = sale.pago?.tarjeta ?? 0;

    const findOriginalSale = sales.find((s) => s.id === sale.ventaOriginalId);
    const origPctE = findOriginalSale?.pago?.efectivo ?? 100;
    const origPctT = findOriginalSale?.pago?.tarjeta ?? 0;

    // Gain from returned items (negative impact).
    const gananciaDevueltos = (sale.itemsDevueltos ?? []).reduce((sum, raw: any) => {
      const { costo, precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);
      const cant = raw.cantidad ?? 0;
      const desc = descuento || 0;
      const pT = precioTarjeta * (1 - desc / 100);
      const pE = precioEfectivo * (1 - Math.max(0, desc - 20) / 100);
      const totLinea = (pE * (origPctE / 100) + pT * (origPctT / 100)) * cant;
      return sum + (totLinea - costo * cant);
    }, 0);

    // Gain from newly added items.
    const gananciaNuevos = (sale.itemsNuevos ?? []).reduce((sum, raw: any) => {
      const { costo, precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);
      const cant = raw.cantidad ?? 0;
      const desc = descuento || 0;
      const pT = precioTarjeta * (1 - desc / 100);
      const pE = precioEfectivo * (1 - Math.max(0, desc - 20) / 100);
      const totLinea = (pE * (pctE / 100) + pT * (pctT / 100)) * cant;
      return sum + (totLinea - costo * cant);
    }, 0);

    // When the store returns money (diferencia < 0) we need a special calculation.
    if (diferencia < 0) {
      const precioNuevos = (sale.itemsNuevos ?? []).reduce((sum, raw: any) => {
        const { precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);
        const cant = raw.cantidad ?? 0;
        const desc = descuento || 0;
        const pT = precioTarjeta * (1 - desc / 100);
        const pE = precioEfectivo * (1 - Math.max(0, desc - 20) / 100);
        return sum + (pE * (pctE / 100) + pT * (pctT / 100)) * cant;
      }, 0);
      const costoDevueltos = (sale.itemsDevueltos ?? []).reduce((sum, i) => sum + (i.costo ?? 0) * (i.cantidad ?? 1), 0);
      const gananciaFinal = precioNuevos - costoDevueltos;
      return {
        efectivo: cobrado * (pctE / 100),
        tarjeta: cobrado * (pctT / 100),
        totalCobrado: cobrado,
        costoTotal: precioNuevos - costoDevueltos,
        ganancia: gananciaFinal,
      };
    }

    const gananciaGiftManual = (sale.itemsDevueltos ?? []).reduce((sum, raw: any) => {
      const { precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);
      const cant = raw.cantidad ?? 0;
      const desc = descuento || 0;
      const pT = precioTarjeta * (1 - desc / 100);
      const pE = precioEfectivo * (1 - Math.max(0, desc - 20) / 100);
      const valor = (pE * (origPctE / 100) + pT * (origPctT / 100)) * cant;
      return sum + valor;
    }, 0);

      // Gain calculation for positive diferencia (store receives money).
      const gananciaFinal = -gananciaDevueltos + gananciaNuevos;
      const costoNuevos = (sale.itemsNuevos ?? []).reduce((sum, i) => sum + (i.costo ?? 0) * (i.cantidad ?? 1), 0);
      const costoDevueltos = (sale.itemsDevueltos ?? []).reduce((sum, i) => sum + (i.costo ?? 0) * (i.cantidad ?? 1), 0);
      const costoNeto = costoNuevos - costoDevueltos;

      return {
        efectivo: cobrado * (pctE / 100),
        tarjeta: cobrado * (pctT / 100),
        totalCobrado: cobrado,
        costoTotal: costoNeto,
        ganancia: gananciaFinal,
      };
  }

  // Regular sale logic.
  let efectivo = 0;
  let tarjeta = 0;
  let costoTotal = 0;

  const pctE = sale.pago?.efectivo ?? 100;
  const pctT = sale.pago?.tarjeta ?? 0;

  (sale.items ?? []).forEach((raw: any) => {
    const { costo, precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);
    const cant = raw.cantidad ?? 0;
    const desc = descuento || 0;
    const pT = precioTarjeta * (1 - desc / 100);
    const pE = precioEfectivo * (1 - Math.max(0, desc - 20) / 100);

    efectivo += pE * cant * (pctE / 100);
    tarjeta += pT * cant * (pctT / 100);
    costoTotal += costo * cant;
  });

  // Apply gift card usage if present.
  const gift = sale.giftCardUsada?.montoUsado ?? 0;
  if (gift > 0) {
    const totalAntes = efectivo + tarjeta;
    if (totalAntes > 0) {
      efectivo = Math.max(0, efectivo - gift * (efectivo / totalAntes));
      tarjeta = Math.max(0, tarjeta - gift * (tarjeta / totalAntes));
    }
  }

  const totalCobrado = efectivo + tarjeta;
  const es100Tarjeta = pctT === 100 && pctE === 0;
  const ingresoParaGanancia = es100Tarjeta ? Math.max(0, (efectivo + tarjeta) - gift) : totalCobrado;
  const ganancia = ingresoParaGanancia - costoTotal;

  return { efectivo, tarjeta, totalCobrado, costoTotal, ganancia };
};

/**
 * Calculate percentage trend between two values.
 */
export const calcTrend = (actual: number, anterior: number) => {
  if (anterior === 0) return actual > 0 ? { value: 100, isPositive: true } : { value: 0, isPositive: true };
  const cambio = ((actual - anterior) / Math.abs(anterior)) * 100;
  return { value: Math.abs(cambio), isPositive: cambio >= 0 };
};

/**
 * Check if a date string belongs to a specific month/year.
 */
export const isMonth = (dateStr: string, month: number, year: number) => {
  if (!dateStr) return false;

  let d: Date;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length >= 3) {
      const day = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const y = Number(parts[2]);
      d = new Date(y, m, day);
    } else {
      d = new Date(dateStr);
    }
  } else {
    d = new Date(dateStr);
  }

  if (isNaN(d.getTime())) return false;
  return d.getMonth() + 1 === month && d.getFullYear() === year;
};
