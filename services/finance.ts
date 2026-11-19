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
  // El costo de adquisición/reposición siempre debe ser positivo o cero; nunca negativo
  const costo = Math.max(0, parseNumber(costoRaw));

  const precioTarjeta = Math.max(0, parseNumber(
    typeof item.precioTarjeta === 'number'
      ? item.precioTarjeta
      : typeof item.ventaTarjeta === 'number'
        ? item.ventaTarjeta
        : typeof item.precio === 'number'
          ? item.precio
          : item.precioTarjeta ?? item.ventaTarjeta ?? item.precio
  ));

  const precioEfectivo = Math.max(0, parseNumber(
    typeof item.precioEfectivo === 'number'
      ? item.precioEfectivo
      : typeof item.ventaEfectivo === 'number'
        ? item.ventaEfectivo
        : item.precioEfectivo ?? item.ventaEfectivo
  ));

  const descuento = Math.max(0, parseNumber(item.descuento));
  return { costo, precioEfectivo, precioTarjeta, descuento };
};

export interface SaleBreakdown {
  efectivo: number;
  tarjeta: number;
  totalCobrado: number;
  costoTotal: number;
  ganancia: number;
  precioVentaBruto: number;
  costoMercaderia: number;
  comisionMedioPago: number;
  ingresoNeto: number;
  gananciaNeta: number;
  deltaCosto?: number;
  diferenciaCobrada?: number;
}

/**
 * Compute financial breakdown of a sale (cash, card, total, cost, net gain).
 * Handles normal sales, gift cards, and exchanges (cambio).
 *
 * Variables Base:
 * - precioVentaBruto: Total efectivamente cobrado según medio de pago.
 * - costoMercaderia: Costo de adquisición/reposición (siempre >= 0).
 * - comisionMedioPago: Retención o recargo financiero descontado por pasarela/tarjeta.
 * - ingresoNeto = precioVentaBruto - comisionMedioPago
 * - gananciaNeta = ingresoNeto - costoMercaderia
 *
 * Cambios:
 * - gananciaCambio = (diferenciaCobrada - comisionMedioPago) - deltaCosto
 * - deltaCosto = costo(Prenda B) - costo(Prenda A)
 */
export const computeSaleBreakdown = (sale: Sale, sales?: Sale[]): SaleBreakdown => {
  // 1. Gift Card sales – treat like a cash sale without merchandise cost.
  if (sale.tipo === 'gift') {
    const precioVentaBruto = Math.round(sale.total ?? 0);
    const pctE = sale.pago?.efectivo ?? 100;
    const pctT = sale.pago?.tarjeta ?? 0;
    const efectivo = Math.round(precioVentaBruto * (pctE / 100));
    const tarjeta = Math.round(precioVentaBruto * (pctT / 100));
    const costoMercaderia = 0;
    const comisionMedioPago = Math.max(0, Number(sale.comisionMedioPago) || 0);
    const ingresoNeto = Math.max(0, precioVentaBruto - comisionMedioPago);
    const gananciaNeta = ingresoNeto - costoMercaderia;

    return {
      efectivo,
      tarjeta,
      totalCobrado: precioVentaBruto,
      costoTotal: 0,
      ganancia: gananciaNeta,
      precioVentaBruto,
      costoMercaderia,
      comisionMedioPago,
      ingresoNeto,
      gananciaNeta,
    };
  }

  // 2. Exchange (cambio) – Prenda A (Devuelta) por Prenda B (Nueva)
  if (sale.tipo === 'cambio') {
    const rawGift = (sale as any).giftCardUsada;
    const giftCardDiscount = typeof rawGift === 'number'
      ? rawGift
      : (rawGift?.montoUsado ?? 0);

    const diferenciaBruta = sale.diferencia ?? sale.total ?? 0;
    // Si la diferencia es a favor del local (> 0), se cobra la diferencia menos gift card
    const diferenciaCobrada = Math.max(0, (diferenciaBruta > 0 ? diferenciaBruta : 0) - giftCardDiscount);

    const pctE = sale.pago?.efectivo ?? 100;
    const pctT = sale.pago?.tarjeta ?? 0;
    const efectivo = Math.round(diferenciaCobrada * (pctE / 100));
    const tarjeta = Math.round(diferenciaCobrada * (pctT / 100));
    const totalCobrado = Math.round(efectivo + tarjeta);

    // Costo de adquisición/reposición de prendas involucradas (siempre >= 0)
    const costoDevueltos = (sale.itemsDevueltos ?? []).reduce((sum, item: any) => {
      const { costo } = getItemSnapshot(item);
      const cant = item.cantidad ?? 1;
      return sum + Math.max(0, costo) * cant;
    }, 0);

    const costoNuevos = (sale.itemsNuevos ?? []).reduce((sum, item: any) => {
      const { costo } = getItemSnapshot(item);
      const cant = item.cantidad ?? 1;
      return sum + Math.max(0, costo) * cant;
    }, 0);

    // Variación neta de costo para el balance de la operación:
    // deltaCosto = costo(Prenda B) - costo(Prenda A)
    const deltaCosto = costoNuevos - costoDevueltos;
    const costoMercaderia = Math.max(0, costoNuevos);

    // Comisión o recargo financiero del medio de pago
    let comisionMedioPago = 0;
    if (sale.comisionMedioPago !== undefined) {
      comisionMedioPago = Math.max(0, Number(sale.comisionMedioPago) || 0);
    } else if (tarjeta > 0) {
      // El recargo de tarjeta respecto a efectivo es aprox 25% (ratio 1.25)
      const tarjetaEquivEfectivo = Math.round(tarjeta / 1.25);
      comisionMedioPago = Math.max(0, tarjeta - tarjetaEquivEfectivo);
    }

    let gananciaCambio: number;
    let ingresoNeto: number;
    let precioVentaBruto: number;

    if (diferenciaBruta < 0) {
      // Saldo a favor del cliente / Devolución que genera Gift Card:
      // No se cobra dinero físico (caja = $0). Se anula la ganancia de la prenda devuelta en el balance:
      // ΔGanancia = diferenciaBruta - deltaCosto = -(precioReconocido - costoRecuperado)
      gananciaCambio = diferenciaBruta - deltaCosto;
      precioVentaBruto = diferenciaBruta;
      ingresoNeto = diferenciaBruta;
    } else {
      // Canje o cambio con diferencia a pagar (cubierta parcial o totalmente con Gift Card y/o caja):
      // ingresoTotal = montoUsadoGiftCard + diferenciaCobrada
      const montoUsadoGiftCard = Math.min(giftCardDiscount, diferenciaBruta);
      const ingresoTotal = montoUsadoGiftCard + diferenciaCobrada;
      precioVentaBruto = ingresoTotal;
      ingresoNeto = Math.max(0, ingresoTotal - comisionMedioPago);
      gananciaCambio = ingresoNeto - deltaCosto;
    }

    // Regla crítica: costoTotal nunca debe ser negativo.
    // Para reportes/caja se computa la variación positiva o el costo de reposición >= 0.
    const costoTotal = Math.max(0, deltaCosto);

    return {
      efectivo,
      tarjeta,
      totalCobrado,
      costoTotal,
      ganancia: Math.round(gananciaCambio),
      precioVentaBruto,
      costoMercaderia,
      comisionMedioPago,
      ingresoNeto,
      gananciaNeta: Math.round(gananciaCambio),
      deltaCosto: Math.round(deltaCosto),
      diferenciaCobrada,
    };
  }

  // 3. Regular sale logic (venta estándar)
  let efectivo = 0;
  let tarjeta = 0;
  let valorEfectivoTotal = 0;
  let costoMercaderiaAcum = 0;

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
    valorEfectivoTotal += pE * cant;
    costoMercaderiaAcum += Math.max(0, costo) * cant;
  });

  const totalBrutoItems = efectivo + tarjeta;

  // Aplicar uso de Gift Card si corresponde
  const rawGift = (sale as any).giftCardUsada;
  const gift = typeof rawGift === 'number'
    ? rawGift
    : (rawGift?.montoUsado ?? 0);

  const montoUsadoGiftCard = Math.min(gift, totalBrutoItems);

  if (gift > 0) {
    if (totalBrutoItems > 0) {
      efectivo = Math.max(0, efectivo - gift * (efectivo / totalBrutoItems));
      tarjeta = Math.max(0, tarjeta - gift * (tarjeta / totalBrutoItems));
    }
  }

  const diferenciaCobrada = Math.round(efectivo + tarjeta);
  const totalCobrado = diferenciaCobrada; // Arqueo de caja física
  const ingresoTotal = Math.round(montoUsadoGiftCard + diferenciaCobrada);
  const precioVentaBruto = ingresoTotal;

  // Comisión medio de pago: si no está explicitada en la venta,
  // es la retención/recargo financiero de tarjeta sobre el precio base en efectivo
  let comisionMedioPago = 0;
  if (sale.comisionMedioPago !== undefined) {
    comisionMedioPago = Math.max(0, Number(sale.comisionMedioPago) || 0);
  } else {
    comisionMedioPago = Math.max(0, Math.round(totalBrutoItems - valorEfectivoTotal));
  }

  // ingresoNeto = ingresoTotal - comisionMedioPago
  const ingresoNeto = Math.max(0, ingresoTotal - comisionMedioPago);
  const costoMercaderia = Math.max(0, Math.round(costoMercaderiaAcum));

  // gananciaNeta = ingresoNeto - costoMercaderia
  const gananciaNeta = Math.round(ingresoNeto - costoMercaderia);

  return {
    efectivo: Math.round(efectivo),
    tarjeta: Math.round(tarjeta),
    totalCobrado,
    costoTotal: costoMercaderia,
    ganancia: gananciaNeta,
    precioVentaBruto,
    costoMercaderia,
    comisionMedioPago,
    ingresoNeto,
    gananciaNeta,
    diferenciaCobrada,
  };
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

/**
 * Recalcula los totales de una venta al cambiar la forma de pago (Efectivo vs Tarjeta),
 * actualizando su 'total', 'diferencia' (en cambios) y 'pago'.
 */
export const recalculateSaleWithPaymentMethod = (
  sale: Sale,
  newPago: { efectivo: number; tarjeta: number },
  inventory?: InventoryItem[]
): Sale => {
  const pctE = newPago.efectivo ?? 100;
  const pctT = newPago.tarjeta ?? 0;

  // 1. Venta de Gift Card (monto fijo nominal)
  if (sale.tipo === 'gift') {
    return {
      ...sale,
      pago: newPago
    };
  }

  // 2. Cambio de prendas
  if (sale.tipo === 'cambio') {
    const rawGift = (sale as any).giftCardUsada;
    const giftMonto = typeof rawGift === 'number' ? rawGift : (rawGift?.montoUsado ?? 0);

    const totalDevuelto = (sale.itemsDevueltos ?? []).reduce((sum, item) => {
      const { precioEfectivo, descuento } = getItemSnapshot(item);
      let pE = precioEfectivo;
      if (!pE && inventory) {
        const inv = inventory.find(i => i.id === item.id || i.sku === item.sku);
        if (inv) pE = inv.ventaEfectivo;
      }
      const cant = item.cantidad ?? 1;
      const desc = descuento || 0;
      const descExtra = Math.max(0, desc - 20);
      const pEFinal = (pE || 0) * (1 - descExtra / 100);
      return sum + pEFinal * cant;
    }, 0);

    const totalNuevo = (sale.itemsNuevos ?? []).reduce((sum, item) => {
      const { precioEfectivo, descuento } = getItemSnapshot(item);
      let pE = precioEfectivo;
      if (!pE && inventory) {
        const inv = inventory.find(i => i.id === item.id || i.sku === item.sku);
        if (inv) pE = inv.ventaEfectivo;
      }
      const cant = item.cantidad ?? 1;
      const desc = descuento || 0;
      const descExtra = Math.max(0, desc - 20);
      const pEFinal = (pE || 0) * (1 - descExtra / 100);
      return sum + pEFinal * cant;
    }, 0);

    const diferenciaBaseEfectivo = Math.round(totalNuevo - totalDevuelto);

    if (diferenciaBaseEfectivo <= 0) {
      return {
        ...sale,
        pago: newPago,
        diferencia: diferenciaBaseEfectivo,
        total: 0
      };
    }

    let sumTarjeta = 0;
    let sumEfectivo = 0;
    for (const item of (sale.itemsNuevos ?? [])) {
      const { precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(item);
      let pE = precioEfectivo;
      let pT = precioTarjeta;
      if (inventory && (!pE || !pT)) {
        const inv = inventory.find(i => i.id === item.id || i.sku === item.sku);
        if (inv) {
          if (!pE) pE = inv.ventaEfectivo;
          if (!pT) pT = inv.ventaTarjeta;
        }
      }
      if (!pT && pE) pT = Math.ceil((pE * 1.27) / 1000) * 1000;
      if (!pE && pT) pE = Math.round(pT / 1.27);

      const cant = item.cantidad ?? 1;
      const desc = descuento || 0;
      const descExtra = Math.max(0, desc - 20);
      const pEFinal = (pE || 0) * (1 - descExtra / 100);
      const pTFinal = (pT || 0) * (1 - desc / 100);
      sumEfectivo += pEFinal * cant;
      sumTarjeta += pTFinal * cant;
    }
    const ratioEfectivoATarjeta = sumEfectivo > 0 ? (sumTarjeta / sumEfectivo) : 1.25;

    const cubiertoGift = Math.min(giftMonto, diferenciaBaseEfectivo);
    const remanente = Math.max(0, diferenciaBaseEfectivo - cubiertoGift);

    const remanenteEscalado = remanente > 0
      ? Math.round(
        remanente * (pctE / 100) +
        remanente * (pctT / 100) * ratioEfectivoATarjeta
      )
      : 0;

    const nuevaDiferencia = Math.round(cubiertoGift + remanenteEscalado);
    const nuevoTotal = Math.round(Math.max(0, nuevaDiferencia - giftMonto));

    return {
      ...sale,
      pago: newPago,
      diferencia: nuevaDiferencia,
      total: nuevoTotal
    };
  }

  // 3. Venta normal (con ítems)
  if ((sale.items ?? []).length > 0) {
    let sumEfectivo = 0;
    let sumTarjeta = 0;

    for (const item of sale.items) {
      const { precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(item);
      let pE = precioEfectivo;
      let pT = precioTarjeta;

      if (inventory && (!pE || !pT)) {
        const invItem = inventory.find(i => i.id === item.id || i.sku === item.sku);
        if (invItem) {
          if (!pE) pE = invItem.ventaEfectivo;
          if (!pT) pT = invItem.ventaTarjeta;
        }
      }

      if (!pT && pE) pT = Math.ceil((pE * 1.27) / 1000) * 1000;
      if (!pE && pT) pE = Math.round(pT / 1.27);

      const cant = item.cantidad ?? 1;
      const desc = descuento || 0;
      const pTFinal = (pT || 0) * (1 - desc / 100);
      const descExtra = Math.max(0, desc - 20);
      const pEFinal = (pE || 0) * (1 - descExtra / 100);

      sumTarjeta += pTFinal * cant * (pctT / 100);
      sumEfectivo += pEFinal * cant * (pctE / 100);
    }

    const rawGift = (sale as any).giftCardUsada;
    const giftMonto = typeof rawGift === 'number' ? rawGift : (rawGift?.montoUsado ?? 0);
    const nuevoTotal = Math.round(Math.max(0, (sumEfectivo + sumTarjeta) - giftMonto));

    return {
      ...sale,
      pago: newPago,
      total: nuevoTotal
    };
  }

  // 4. Fallback para ventas sin lista de ítems detallada
  return {
    ...sale,
    pago: newPago
  };
};
