import { Sale, InventoryItem, SaleItem } from '../types';

export const getItemSnapshot = (item: any) => {
  const costo = typeof item.costo === 'number' ? item.costo : Number(item.costoUnidad) || 0;

  const precioTarjeta =
    typeof item.precioTarjeta === 'number'
      ? item.precioTarjeta
      : typeof item.ventaTarjeta === 'number'
        ? item.ventaTarjeta
        : typeof item.precio === 'number'
          ? item.precio
          : Number(item.precioTarjeta) || Number(item.ventaTarjeta) || Number(item.precio) || 0;

  const precioEfectivo =
    typeof item.precioEfectivo === 'number'
      ? item.precioEfectivo
      : typeof item.ventaEfectivo === 'number'
        ? item.ventaEfectivo
        : Number(item.precioEfectivo) || Number(item.ventaEfectivo) || precioTarjeta;

  const descuento = typeof item.descuento === 'number' ? item.descuento : Number(item.descuento) || 0;

  return { costo, precioEfectivo, precioTarjeta, descuento };
};

export const computeSaleBreakdown = (sale: Sale, sales: Sale[]) => {
  if (sale.tipo === 'gift') {
    const ef = sale.pago?.efectivo ? sale.total * (sale.pago.efectivo / 100) : 0;
    const ta = sale.pago?.tarjeta ? sale.total * (sale.pago.tarjeta / 100) : 0;
    return {
      efectivo: ef,
      tarjeta: ta,
      totalCobrado: sale.total,
      costoTotal: 0,
      ganancia: sale.total
    };
  }

  if (sale.tipo === 'cambio') {
    const diferencia = sale.diferencia ?? sale.total ?? 0;
    const cobrado = Math.max(0, diferencia);
    const pctE = sale.pago?.efectivo ?? 100;
    const pctT = sale.pago?.tarjeta ?? 0;

    const findOriginalSale = sales.find(s => s.id === sale.ventaOriginalId);
    const origPctE = findOriginalSale?.pago?.efectivo ?? 100;
    const origPctT = findOriginalSale?.pago?.tarjeta ?? 0;

    const gananciaDevueltos = (sale.itemsDevueltos ?? []).reduce((sum, raw: any) => {
      const { costo, precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);      
      const cant = raw.cantidad ?? 0;
      const desc = descuento || 0;
      const pT = precioTarjeta * (1 - desc / 100);
      const pE = precioEfectivo * (1 - Math.max(0, desc - 20) / 100);
      const totLinea = (pE * (origPctE / 100) + pT * (origPctT / 100)) * cant;
      return sum + (totLinea - costo * cant);
    }, 0);

    const gananciaNuevos = (sale.itemsNuevos ?? []).reduce((sum, raw: any) => {
      const { costo, precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);
      const cant = raw.cantidad ?? 0;
      const desc = descuento || 0;
      const pT = precioTarjeta * (1 - desc / 100);
      const pE = precioEfectivo * (1 - Math.max(0, desc - 20) / 100);
      const totLinea = (pE * (pctE / 100) + pT * (pctT / 100)) * cant;
      return sum + (totLinea - costo * cant);
    }, 0);

    const gananciaGiftManual = diferencia < 0 ? Math.abs(diferencia) : 0;
    const gananciaFinal = (-gananciaDevueltos) + gananciaNuevos + gananciaGiftManual;

    const costoNuevos = (sale.itemsNuevos ?? []).reduce((sum, i) => sum + (i.costo ?? 0) * (i.cantidad ?? 1), 0);
    const costoDevueltos = (sale.itemsDevueltos ?? []).reduce((sum, i) => sum + (i.costo ?? 0) * (i.cantidad ?? 1), 0);
    const costoNeto = costoNuevos - costoDevueltos;

    return {
      efectivo: cobrado * (pctE / 100),
      tarjeta:  cobrado * (pctT / 100),
      totalCobrado: cobrado,
      costoTotal: costoNeto,
      ganancia: gananciaFinal
    };
  }

  let efectivo = 0;
  let tarjeta = 0;
  let costoTotal = 0;
  let totalLineaEfectivo = 0;

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
    totalLineaEfectivo += pE * cant;
    costoTotal += costo * cant;
  });

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
  const ingresoParaGanancia = es100Tarjeta ? Math.max(0, totalLineaEfectivo - gift) : totalCobrado;
  const ganancia = ingresoParaGanancia - costoTotal;

  return {
    efectivo,
    tarjeta,
    totalCobrado,
    costoTotal,
    ganancia
  };
};

export const calcTrend = (actual: number, anterior: number) => {
  if (anterior === 0) return actual > 0 ? { value: 100, isPositive: true } : { value: 0, isPositive: true };
  const cambio = ((actual - anterior) / Math.abs(anterior)) * 100;
  return { value: Math.abs(cambio), isPositive: cambio >= 0 };
};

export const isMonth = (dateStr: string, month: number, year: number) => {
  if (!dateStr) return false;
  
  let d: Date;
  
  // Priorizar formato DD/MM/YYYY si hay barras
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
  return (d.getMonth() + 1) === month && d.getFullYear() === year;
};
