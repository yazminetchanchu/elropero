import { describe, it, expect } from 'vitest';
import { computeSaleBreakdown, isMonth, calcTrend, calculatePricesFromCost, getItemSnapshot } from './finance';
import { Sale, InventoryItem, SaleItem } from '../types';

describe('Lógica Financiera Avanzada (finance.ts)', () => {
  const mockItem1: SaleItem = {
    id: 'p1', sku: 'SKU1', descripcion: 'Prenda 1', cantidad: 1, costo: 1000, 
    precioEfectivo: 2000, precioTarjeta: 2200, descuento: 0
  };
  const mockItem2: SaleItem = {
    id: 'p2', sku: 'SKU2', descripcion: 'Prenda 2', cantidad: 1, costo: 1500, 
    precioEfectivo: 3000, precioTarjeta: 3300, descuento: 0
  };

  const salesHistory: Sale[] = [
    {
      id: 'orig_1',
      fecha: '2026-03-01T10:00:00',
      tipo: 'venta',
      items: [mockItem1],
      total: 2000,
      pago: { efectivo: 100, tarjeta: 0 }
    }
  ];

  it('Cambio: Diferencia a favor del local (Diferencia > 0)', () => {
    const sale: Sale = {
      id: 'c1',
      fecha: '2026-04-12T10:00:00',
      tipo: 'cambio',
      items: [],
      total: 1000,
      itemsDevueltos: [mockItem1],
      itemsNuevos: [mockItem2],
      ventaOriginalId: 'orig_1',
      diferencia: 1000,
      pago: { efectivo: 100, tarjeta: 0 }
    };

    const { efectivo, totalCobrado, ganancia } = computeSaleBreakdown(sale, salesHistory);
    expect(efectivo).toBe(1000);
    expect(totalCobrado).toBe(1000);
    expect(ganancia).toBe(500);
  });

  it('Cambio: Diferencia a favor del cliente (Diferencia < 0)', () => {
    const sale: Sale = {
      id: 'c2',
      fecha: '2026-04-12T10:00:00',
      tipo: 'cambio',
      items: [],
      total: -1000,
      itemsDevueltos: [mockItem2],
      itemsNuevos: [mockItem1],
      ventaOriginalId: 'orig_2',
      diferencia: -1000,
      pago: { efectivo: 100, tarjeta: 0 }
    };

    const { efectivo, totalCobrado, ganancia } = computeSaleBreakdown(sale, salesHistory);
    expect(efectivo).toBe(0);
    expect(totalCobrado).toBe(0);
    expect(ganancia).toBe(500);
  });

  it('IsMonth: Robustez ante formatos de fecha argentinos (DD/MM/YYYY)', () => {
    // Estas fechas solían fallar por ambigüedad Mes/Día en JSDOM
    expect(isMonth('12/04/2026', 4, 2026)).toBe(true);
    expect(isMonth('2026-04-12', 4, 2026)).toBe(true);
    expect(isMonth('01/01/2026', 1, 2026)).toBe(true);
    expect(isMonth('31/12/2025', 12, 2025)).toBe(true);
    expect(isMonth('', 4, 2026)).toBe(false);
  });

  it('Venta Mixta con Gift Card Parcial: debe prorratear el descuento de la tarjeta de regalo', () => {
    // Usamos ítems con precios iguales para simplificar la matemática del test y evitar ruidos de redondeo
    const simpleItem: SaleItem = {
      id: 'ps', sku: 'S', descripcion: 'S', cantidad: 1, costo: 1000, 
      precioEfectivo: 2000, precioTarjeta: 2000, descuento: 0
    };
    
    const sale: Sale = {
      id: 's_mix_gift',
      fecha: '2026-04-12T10:00:00',
      tipo: 'venta',
      items: [simpleItem, simpleItem], // Total 4000
      total: 4000,
      pago: { efectivo: 50, tarjeta: 50 }, // 2000 c/u antes de GC
      giftCardUsada: { codigo: 'G1', montoUsado: 1000 }
    };

    const { efectivo, tarjeta, totalCobrado } = computeSaleBreakdown(sale, []);
    
    // El descuento de $1000 se prorratea 50/50
    // Efectivo: 2000 - 500 = 1500
    // Tarjeta: 2000 - 500 = 1500
    // Total Cobrado: 3000
    expect(efectivo).toBe(1500);
    expect(tarjeta).toBe(1500);
    expect(totalCobrado).toBe(3000);
  });

  it('Venta 100% Tarjeta con Gift Card: no debe restar dos veces la Gift Card de la ganancia', () => {
    const item: SaleItem = {
      id: 'p_card',
      sku: 'SKU_CARD',
      descripcion: 'Prenda Tarjeta',
      cantidad: 1,
      costo: 10000,
      precioEfectivo: 20000,
      precioTarjeta: 25000,
      descuento: 0
    };

    const sale: Sale = {
      id: 's_card_gc',
      fecha: '2026-04-12T10:00:00',
      tipo: 'venta',
      items: [item],
      total: 25000,
      pago: { efectivo: 0, tarjeta: 100 },
      giftCardUsada: { codigo: 'GC10K', montoUsado: 10000 }
    };

    const { efectivo, tarjeta, totalCobrado, costoTotal, ganancia } = computeSaleBreakdown(sale, []);

    // Tarjeta: 25000 - 10000 = 15000
    // Efectivo: 0
    // Total Cobrado: 15000
    // Costo Total: 10000
    // Ganancia real: 15000 - 10000 = 5000 (no debe dar 5000 - 10000 = -5000)
    expect(efectivo).toBe(0);
    expect(tarjeta).toBe(15000);
    expect(totalCobrado).toBe(15000);
    expect(costoTotal).toBe(10000);
    expect(ganancia).toBe(5000);
  });

  it('calcTrend: calcula tendencia correctamente', () => {
    // de 100 a 150 -> +50%
    const t1 = calcTrend(150, 100);
    expect(t1.value).toBe(50);
    expect(t1.isPositive).toBe(true);

    // de 200 a 100 -> -50%
    const t2 = calcTrend(100, 200);
    expect(t2.value).toBe(50);
    expect(t2.isPositive).toBe(false);

    // de 0 a 100 -> +100%
    const t3 = calcTrend(100, 0);
    expect(t3.value).toBe(100);
    expect(t3.isPositive).toBe(true);
  });

  it('calculatePricesFromCost: calcula los precios con markup correctamente', () => {
    const cost = 1000;
    const { ventaEfectivo, ventaTarjeta } = calculatePricesFromCost(cost);
    // efectivo: ceil((1000 * 1.68) / 1000) * 1000 = 2000
    // tarjeta: ceil((2000 * 1.27) / 1000) * 1000 = 3000
    expect(ventaEfectivo).toBe(2000);
    expect(ventaTarjeta).toBe(3000);
  });

  it('getItemSnapshot: maneja correctamente números con comas, puntos y decimales', () => {
    const itemStrings = {
      costo: '1.200,50',
      precioEfectivo: '2.500,75',
      precioTarjeta: '3.000',
      descuento: '15,5'
    };
    
    const snapStr = getItemSnapshot(itemStrings);
    expect(snapStr.costo).toBe(1200.50);
    expect(snapStr.precioEfectivo).toBe(2500.75);
    expect(snapStr.precioTarjeta).toBe(3000);
    expect(snapStr.descuento).toBe(15.5);

    const itemNumbers = {
      costo: 1200.5,
      precioEfectivo: 2500.75,
      precioTarjeta: 3000,
      descuento: 15.5
    };
    const snapNum = getItemSnapshot(itemNumbers);
    expect(snapNum.costo).toBe(1200.5);
    expect(snapNum.precioEfectivo).toBe(2500.75);
    expect(snapNum.precioTarjeta).toBe(3000);
    expect(snapNum.descuento).toBe(15.5);
  });

  it('computeSaleBreakdown: aplica correctamente porcentajes de descuento en los totales', () => {
    const discountedItem: SaleItem = {
      id: 'p-disc', sku: 'D1', descripcion: 'D', cantidad: 2, costo: 500,
      precioEfectivo: 1000, precioTarjeta: 1200, descuento: 25 // 25% descuento
    };
    
    const sale: Sale = {
      id: 's_disc',
      fecha: '2026-04-12T10:00:00',
      tipo: 'venta',
      items: [discountedItem],
      total: 1900,
      pago: { efectivo: 100, tarjeta: 0 }
    };
    
    // precioEfectivo con 25% descuento: el sistema perdona hasta 20%, o sea que el descuento efectivo es (25 - 20) = 5%
    // 1000 * (1 - 0.05) = 950
    // x2 cantidad = 1900
    const { efectivo, totalCobrado, ganancia, costoTotal } = computeSaleBreakdown(sale, []);
    
    expect(efectivo).toBe(1900);
    expect(totalCobrado).toBe(1900);
    expect(costoTotal).toBe(1000); // 500 * 2
    expect(ganancia).toBe(900); // 1900 - 1000
  });

  it('computeSaleBreakdown: calcula ganancias correctamente con pagos porcentuales mixtos', () => {
    const sale: Sale = {
      id: 's_mix_pct',
      fecha: '2026-04-12T10:00:00',
      tipo: 'venta',
      items: [mockItem1],
      total: 2100, // No se usa directamente para el breakdown, se recalculan items
      pago: { efectivo: 50, tarjeta: 50 } // 50% efvo, 50% tjta
    };

    // pE = 2000, pT = 2200, cant = 1, costo = 1000
    // efectivo += 2000 * 1 * 0.5 = 1000
    // tarjeta += 2200 * 1 * 0.5 = 1100
    // total = 2100, ganancia = 2100 - 1000 = 1100
    const { efectivo, tarjeta, totalCobrado, ganancia } = computeSaleBreakdown(sale, []);
    
    expect(efectivo).toBe(1000);
    expect(tarjeta).toBe(1100);
    expect(totalCobrado).toBe(2100);
    expect(ganancia).toBe(1100);
  });
});
