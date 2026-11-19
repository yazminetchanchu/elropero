import { describe, it, expect } from 'vitest';
import { computeSaleBreakdown, isMonth, calcTrend, calculatePricesFromCost, getItemSnapshot, recalculateSaleWithPaymentMethod } from './finance';
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

  it('Cambio: Prenda pagada con Tarjeta se intercambia por misma prenda seleccionando Efectivo (Diferencia = 0, Ganancia = 0)', () => {
    const prendaTarjeta: SaleItem = {
      id: 'p_tjta_12k',
      sku: 'SKU_12K',
      descripcion: 'Vestido Fiesta',
      cantidad: 1,
      costo: 4000,
      precioEfectivo: 9000,
      precioTarjeta: 12000,
      descuento: 0
    };

    const ventaOrigTarjeta: Sale = {
      id: 'orig_tarjeta',
      fecha: '2026-03-01T10:00:00',
      tipo: 'venta',
      items: [prendaTarjeta],
      total: 12000,
      pago: { efectivo: 0, tarjeta: 100 }
    };

    const saleCambio: Sale = {
      id: 'c_misma_prenda',
      fecha: '2026-04-12T10:00:00',
      tipo: 'cambio',
      items: [],
      total: 0,
      diferencia: 0,
      itemsDevueltos: [prendaTarjeta],
      itemsNuevos: [prendaTarjeta],
      ventaOriginalId: 'orig_tarjeta',
      pago: { efectivo: 100, tarjeta: 0 }
    };

    const { efectivo, tarjeta, totalCobrado, costoTotal, ganancia } = computeSaleBreakdown(saleCambio, [ventaOrigTarjeta]);
    expect(efectivo).toBe(0);
    expect(tarjeta).toBe(0);
    expect(totalCobrado).toBe(0);
    expect(costoTotal).toBe(0);
    expect(ganancia).toBe(0); // NO debe dar -3000
  });

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
    // Ganancia neutralizada en balance: diferencia (-1000) - deltaCosto (1000 - 1500 = -500) = -500
    expect(ganancia).toBe(-500);
  });

  it('Bug 9: Cambio con Gift Card 100% de la diferencia no genera saldo en efectivo ni tarjeta (caja cuadrada)', () => {
    const sale: Sale = {
      id: 'c_gc_full',
      fecha: '2026-04-12T10:00:00',
      tipo: 'cambio',
      items: [],
      total: 8000,
      diferencia: 8000,
      itemsDevueltos: [mockItem1],
      itemsNuevos: [mockItem2],
      ventaOriginalId: 'orig_1',
      pago: { efectivo: 100, tarjeta: 0 },
      giftCardUsada: { codigo: 'GC-8000', montoUsado: 8000 }
    };

    const { efectivo, tarjeta, totalCobrado } = computeSaleBreakdown(sale, salesHistory);
    expect(efectivo).toBe(0);
    expect(tarjeta).toBe(0);
    expect(totalCobrado).toBe(0);
  });

  it('Bug 9: Cambio con Gift Card parcial distribuye sólo el remanente real cobrado entre los medios de pago', () => {
    const sale: Sale = {
      id: 'c_gc_partial',
      fecha: '2026-04-12T10:00:00',
      tipo: 'cambio',
      items: [],
      total: 8000,
      diferencia: 8000,
      itemsDevueltos: [mockItem1],
      itemsNuevos: [mockItem2],
      ventaOriginalId: 'orig_1',
      pago: { efectivo: 60, tarjeta: 40 },
      giftCardUsada: { codigo: 'GC-3000', montoUsado: 3000 }
    };

    // Diferencia: 8000 - Gift Card: 3000 = 5000 a cobrar efectivamente
    // Efectivo 60% de 5000 = 3000
    // Tarjeta 40% de 5000 = 2000
    // Total cobrado = 5000
    const { efectivo, tarjeta, totalCobrado } = computeSaleBreakdown(sale, salesHistory);
    expect(efectivo).toBe(3000);
    expect(tarjeta).toBe(2000);
    expect(totalCobrado).toBe(5000);
  });

  it('Bug 9: Cambio con giftCardUsada en formato numérico directo', () => {
    const sale: Sale = {
      id: 'c_gc_num',
      fecha: '2026-04-12T10:00:00',
      tipo: 'cambio',
      items: [],
      total: 8000,
      diferencia: 8000,
      itemsDevueltos: [mockItem1],
      itemsNuevos: [mockItem2],
      ventaOriginalId: 'orig_1',
      pago: { efectivo: 100, tarjeta: 0 },
      giftCardUsada: 8000 as any
    };

    const { efectivo, tarjeta, totalCobrado } = computeSaleBreakdown(sale, salesHistory);
    expect(efectivo).toBe(0);
    expect(tarjeta).toBe(0);
    expect(totalCobrado).toBe(0);
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

  it('Venta 100% Tarjeta con Gift Card: computa ganancia sobre la prenda entregada y respeta caja física', () => {
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

    // Arqueo de caja física: solo lo cobrado por tarjeta
    // Tarjeta: 25000 - 10000 = 15000
    // Efectivo: 0
    // Total Cobrado: 15000
    // Costo Total: 10000
    // Ingreso neto imputado = Total bruto (25.000) - comision recargo tarjeta (5.000) = 20.000
    // Ganancia real = Ingreso neto (20.000) - Costo (10.000) = 10.000
    expect(efectivo).toBe(0);
    expect(tarjeta).toBe(15000);
    expect(totalCobrado).toBe(15000);
    expect(costoTotal).toBe(10000);
    expect(ganancia).toBe(10000);
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
    // total = 2100.
    // Ganancia real del showroom = Precio Efectivo (2000) - Costo (1000) = 1000 (el recargo de tarjeta amortiza pasarelas)
    const { efectivo, tarjeta, totalCobrado, ganancia } = computeSaleBreakdown(sale, []);

    expect(efectivo).toBe(1000);
    expect(tarjeta).toBe(1100);
    expect(totalCobrado).toBe(2100);
    expect(ganancia).toBe(1000);
  });

  describe('recalculateSaleWithPaymentMethod: actualización de total, diferencia y pago', () => {
    const inv: InventoryItem[] = [
      {
        id: 'p1', sku: 'SKU1', descripcion: 'Prenda 1', cantidad: 5, costo: 1000,
        proveedor: 'P', categoria: 'C',
        ventaEfectivo: 2000, ventaTarjeta: 2500,
        talles: [], colores: [], imagenes: []
      }
    ];

    it('recalcula una venta normal cambiando de Efectivo (100%) a Tarjeta (100%)', () => {
      const sale: Sale = {
        id: 's1',
        fecha: '2026-04-12T10:00:00',
        tipo: 'venta',
        items: [
          {
            id: 'p1', sku: 'SKU1', descripcion: 'Prenda 1', cantidad: 2, costo: 1000,
            precioEfectivo: 2000, precioTarjeta: 2500, descuento: 0
          }
        ],
        total: 4000,
        pago: { efectivo: 100, tarjeta: 0 }
      };

      const updated = recalculateSaleWithPaymentMethod(sale, { efectivo: 0, tarjeta: 100 }, inv);
      expect(updated.pago).toEqual({ efectivo: 0, tarjeta: 100 });
      expect(updated.total).toBe(5000); // 2500 * 2

      // Y computeSaleBreakdown debe dar 5000 en tarjeta y ganancia neta 2000 (4000 efectivo - 2000 costo)
      const breakdown = computeSaleBreakdown(updated, []);
      expect(breakdown.efectivo).toBe(0);
      expect(breakdown.tarjeta).toBe(5000);
      expect(breakdown.totalCobrado).toBe(5000);
      expect(breakdown.ganancia).toBe(2000);
    });

    it('recalcula una venta normal cambiando de Tarjeta (100%) a Efectivo (100%)', () => {
      const sale: Sale = {
        id: 's2',
        fecha: '2026-04-12T10:00:00',
        tipo: 'venta',
        items: [
          {
            id: 'p1', sku: 'SKU1', descripcion: 'Prenda 1', cantidad: 2, costo: 1000,
            precioEfectivo: 2000, precioTarjeta: 2500, descuento: 0
          }
        ],
        total: 5000,
        pago: { efectivo: 0, tarjeta: 100 }
      };

      const updated = recalculateSaleWithPaymentMethod(sale, { efectivo: 100, tarjeta: 0 }, inv);
      expect(updated.pago).toEqual({ efectivo: 100, tarjeta: 0 });
      expect(updated.total).toBe(4000); // 2000 * 2

      const breakdown = computeSaleBreakdown(updated, []);
      expect(breakdown.efectivo).toBe(4000);
      expect(breakdown.tarjeta).toBe(0);
      expect(breakdown.totalCobrado).toBe(4000);
      expect(breakdown.ganancia).toBe(2000); // 4000 - 2000
    });

    it('recalcula un cambio con diferencia a pagar cuando cambia el medio de pago', () => {
      const saleCambio: Sale = {
        id: 'sc1',
        fecha: '2026-04-12T10:00:00',
        tipo: 'cambio',
        items: [],
        itemsDevueltos: [
          {
            id: 'p_dev', sku: 'DEV', descripcion: 'Devuelta', cantidad: 1, costo: 2000,
            precioEfectivo: 5000, precioTarjeta: 6000, descuento: 0
          }
        ],
        itemsNuevos: [
          {
            id: 'p_new', sku: 'NEW', descripcion: 'Nueva', cantidad: 1, costo: 4000,
            precioEfectivo: 9000, precioTarjeta: 11250, descuento: 0 // ratio 11250 / 9000 = 1.25
          }
        ],
        // En efectivo la diferencia base es 9000 - 5000 = 4000
        diferencia: 4000,
        total: 4000,
        pago: { efectivo: 100, tarjeta: 0 }
      };

      // Si se cambia a Tarjeta 100%: 4000 * 1.25 = 5000
      const updated = recalculateSaleWithPaymentMethod(saleCambio, { efectivo: 0, tarjeta: 100 });
      expect(updated.pago).toEqual({ efectivo: 0, tarjeta: 100 });
      expect(updated.diferencia).toBe(5000);
      expect(updated.total).toBe(5000);

      const breakdown = computeSaleBreakdown(updated, []);
      expect(breakdown.efectivo).toBe(0);
      expect(breakdown.tarjeta).toBe(5000);
      expect(breakdown.totalCobrado).toBe(5000);
    });
  });

  describe('Refactorización Financiera de Negocio (Variables Base, Ganancia Neta y Cambios)', () => {
    it('Prueba Unitaria Oficial: precioVentaBruto $15.000, costo $7.000, comision $3.000 -> ingresoNeto $12.000, gananciaNeta $5.000', () => {
      const item: SaleItem = {
        id: 'p_unit',
        sku: 'SKU_UNIT',
        descripcion: 'Prenda Test',
        cantidad: 1,
        costo: 7000,
        precioEfectivo: 12000,
        precioTarjeta: 15000,
        descuento: 0
      };

      const sale: Sale = {
        id: 'sale_unit_test',
        fecha: '2026-04-12T10:00:00',
        tipo: 'venta',
        items: [item],
        total: 15000,
        pago: { efectivo: 0, tarjeta: 100 }, // 100% Tarjeta -> $15.000 bruto
        comisionMedioPago: 3000 // Comisión explícita de pasarela
      };

      const breakdown = computeSaleBreakdown(sale);

      expect(breakdown.precioVentaBruto).toBe(15000);
      expect(breakdown.costoMercaderia).toBe(7000);
      expect(breakdown.comisionMedioPago).toBe(3000);
      expect(breakdown.ingresoNeto).toBe(12000);
      expect(breakdown.gananciaNeta).toBe(5000);
      expect(breakdown.ganancia).toBe(5000);
      expect(breakdown.costoTotal).toBe(7000);
    });

    it('Regla de costo positivo: costoMercaderia y costoTotal nunca deben ser negativos', () => {
      const itemNegativo: any = {
        id: 'p_neg',
        sku: 'SKU_NEG',
        descripcion: 'Prenda Inválida',
        cantidad: 1,
        costo: -5000,
        precioEfectivo: 10000,
        precioTarjeta: 12000,
        descuento: 0
      };

      const snap = getItemSnapshot(itemNegativo);
      expect(snap.costo).toBe(0); // Forzado a >= 0

      const sale: Sale = {
        id: 'sale_neg_test',
        fecha: '2026-04-12T10:00:00',
        tipo: 'venta',
        items: [itemNegativo],
        total: 10000,
        pago: { efectivo: 100, tarjeta: 0 }
      };

      const breakdown = computeSaleBreakdown(sale);
      expect(breakdown.costoMercaderia).toBe(0);
      expect(breakdown.costoTotal).toBe(0);
      expect(breakdown.gananciaNeta).toBe(10000);
    });

    it('Cambio: Cliente abona diferencia de $1.500 como ajuste de precio entre prendas de igual costo', () => {
      // Prenda A (devuelta): Costo $7.000, Precio Efectivo $12.000
      const prendaA: SaleItem = {
        id: 'pA',
        sku: 'SKU_A',
        descripcion: 'Prenda A Devuelta',
        cantidad: 1,
        costo: 7000,
        precioEfectivo: 12000,
        precioTarjeta: 15000,
        descuento: 0
      };

      // Prenda B (llevada): Costo $7.000, Precio Efectivo $13.500
      const prendaB: SaleItem = {
        id: 'pB',
        sku: 'SKU_B',
        descripcion: 'Prenda B Nueva',
        cantidad: 1,
        costo: 7000,
        precioEfectivo: 13500,
        precioTarjeta: 17000,
        descuento: 0
      };

      // Diferencia cobrada = 13500 - 12000 = $1.500 en efectivo
      const saleCambio: Sale = {
        id: 'c_ajuste_1500',
        fecha: '2026-04-12T10:00:00',
        tipo: 'cambio',
        items: [],
        diferencia: 1500,
        total: 1500,
        itemsDevueltos: [prendaA],
        itemsNuevos: [prendaB],
        pago: { efectivo: 100, tarjeta: 0 }
      };

      const breakdown = computeSaleBreakdown(saleCambio);

      // deltaCosto = 7000 - 7000 = 0
      // gananciaCambio = (1500 - 0) - 0 = 1500 (ingreso por ajuste de precio)
      expect(breakdown.diferenciaCobrada).toBe(1500);
      expect(breakdown.deltaCosto).toBe(0);
      expect(breakdown.comisionMedioPago).toBe(0);
      expect(breakdown.ingresoNeto).toBe(1500);
      expect(breakdown.gananciaNeta).toBe(1500);
      expect(breakdown.ganancia).toBe(1500);
      expect(breakdown.costoTotal).toBe(0); // Variación neta de costo = 0
      expect(breakdown.costoMercaderia).toBe(7000); // Costo de prenda B >= 0
    });

    it('Cambio con variación de costo y comisión de tarjeta: ganancia = (diferencia - comision) - deltaCosto', () => {
      // Prenda A: Costo $7.000
      const prendaA: SaleItem = {
        id: 'pA',
        sku: 'SKU_A',
        descripcion: 'Prenda A',
        cantidad: 1,
        costo: 7000,
        precioEfectivo: 12000,
        precioTarjeta: 15000,
        descuento: 0
      };

      // Prenda B: Costo $8.500 (deltaCosto = 8500 - 7000 = 1500)
      const prendaB: SaleItem = {
        id: 'pB',
        sku: 'SKU_B',
        descripcion: 'Prenda B',
        cantidad: 1,
        costo: 8500,
        precioEfectivo: 15000,
        precioTarjeta: 18750,
        descuento: 0
      };

      // Diferencia base en efectivo: 15000 - 12000 = 3000
      // Pagado con tarjeta: $3.750 ($750 de comisión/recargo de tarjeta)
      const saleCambio: Sale = {
        id: 'c_tarjeta_delta',
        fecha: '2026-04-12T10:00:00',
        tipo: 'cambio',
        items: [],
        diferencia: 3750,
        total: 3750,
        itemsDevueltos: [prendaA],
        itemsNuevos: [prendaB],
        pago: { efectivo: 0, tarjeta: 100 },
        comisionMedioPago: 750
      };

      const breakdown = computeSaleBreakdown(saleCambio);

      // diferenciaCobrada = 3750
      // comisionMedioPago = 750
      // ingresoNeto = 3750 - 750 = 3000
      // deltaCosto = 8500 - 7000 = 1500
      // gananciaCambio = 3000 - 1500 = 1500
      expect(breakdown.precioVentaBruto).toBe(3750);
      expect(breakdown.comisionMedioPago).toBe(750);
      expect(breakdown.ingresoNeto).toBe(3000);
      expect(breakdown.deltaCosto).toBe(1500);
      expect(breakdown.gananciaNeta).toBe(1500);
      expect(breakdown.ganancia).toBe(1500);
      expect(breakdown.costoTotal).toBe(1500);
    });

    it('Cambio con devolución de prenda de mayor costo: costoTotal nunca es negativo', () => {
      const prendaDevueltaCara: SaleItem = {
        id: 'p_cara',
        sku: 'CARA',
        descripcion: 'Campera Cuero',
        cantidad: 1,
        costo: 10000,
        precioEfectivo: 20000,
        precioTarjeta: 25000,
        descuento: 0
      };

      const prendaNuevaBarata: SaleItem = {
        id: 'p_barata',
        sku: 'BARATA',
        descripcion: 'Remera',
        cantidad: 1,
        costo: 3000,
        precioEfectivo: 8000,
        precioTarjeta: 10000,
        descuento: 0
      };

      // Diferencia negativa: -12.000 a favor del cliente
      const saleDevolucion: Sale = {
        id: 'c_mayor_costo',
        fecha: '2026-04-12T10:00:00',
        tipo: 'cambio',
        items: [],
        diferencia: -12000,
        total: 0,
        itemsDevueltos: [prendaDevueltaCara],
        itemsNuevos: [prendaNuevaBarata],
        pago: { efectivo: 100, tarjeta: 0 }
      };

      const breakdown = computeSaleBreakdown(saleDevolucion);

      // deltaCosto = 3000 - 10000 = -7000
      // costoTotal debe ser 0 (nunca negativo)
      // costoMercaderia de la prenda nueva llevada = 3000 >= 0
      expect(breakdown.costoTotal).toBeGreaterThanOrEqual(0);
      expect(breakdown.costoTotal).toBe(0);
      expect(breakdown.costoMercaderia).toBe(3000);
      expect(breakdown.deltaCosto).toBe(-7000);
      // gananciaNeta neutralizada: diferencia (-12.000) - deltaCosto (-7.000) = -5.000
      expect(breakdown.gananciaNeta).toBe(-5000);
    });
  });

  describe('Ciclo Completo: Venta 1 -> Devolución con Gift Card -> Canje posterior', () => {
    const prendaA: SaleItem = {
      id: 'prenda_a',
      sku: 'SKU_A',
      descripcion: 'Vestido Seda A',
      cantidad: 1,
      costo: 4000,
      precioEfectivo: 10000,
      precioTarjeta: 12500,
      descuento: 0
    };

    const prendaB: SaleItem = {
      id: 'prenda_b',
      sku: 'SKU_B',
      descripcion: 'Campera Cuero B',
      cantidad: 1,
      costo: 5000,
      precioEfectivo: 13000,
      precioTarjeta: 16000,
      descuento: 0
    };

    const prendaBMisma: SaleItem = {
      id: 'prenda_b_misma',
      sku: 'SKU_B_MISMA',
      descripcion: 'Vestido Seda B',
      cantidad: 1,
      costo: 4000,
      precioEfectivo: 10000,
      precioTarjeta: 12500,
      descuento: 0
    };

    it('Paso 1: Venta original de Prenda A', () => {
      const venta1: Sale = {
        id: 'venta_1',
        fecha: '2026-05-01T10:00:00',
        tipo: 'venta',
        items: [prendaA],
        total: 10000,
        pago: { efectivo: 100, tarjeta: 0 }
      };

      const b1 = computeSaleBreakdown(venta1);
      expect(b1.efectivo).toBe(10000);
      expect(b1.tarjeta).toBe(0);
      expect(b1.totalCobrado).toBe(10000); // Entra a caja física
      expect(b1.costoTotal).toBe(4000);
      expect(b1.ganancia).toBe(6000); // 10.000 - 4.000
    });

    it('Paso 2: Devolución de Prenda A generando Gift Card (saldoGiftCard = precioReconocidoA)', () => {
      // Clienta devuelve Prenda A, no lleva prendas nuevas (cart = []).
      // Diferencia: 0 - 10.000 = -10.000 a favor del cliente
      const devolucionGC: Sale = {
        id: 'devolucion_gc',
        fecha: '2026-05-05T10:00:00',
        tipo: 'cambio',
        items: [],
        itemsDevueltos: [prendaA],
        itemsNuevos: [],
        diferencia: -10000,
        total: 0,
        giftGeneradaId: 'gc_10000',
        pago: { efectivo: 100, tarjeta: 0 }
      };

      const b2 = computeSaleBreakdown(devolucionGC);

      // Caja física: No se devuelve plata física; la caja no se mueve
      expect(b2.efectivo).toBe(0);
      expect(b2.tarjeta).toBe(0);
      expect(b2.totalCobrado).toBe(0);

      // Stock: deltaCosto = 0 - 4000 = -4000 (se recupera costoA)
      expect(b2.deltaCosto).toBe(-4000);

      // Ajuste de ganancia: anula la ganancia de la Venta 1: ΔGanancia = -(precioReconocidoA - costoA) = -6000
      expect(b2.ganancia).toBe(-6000);
      expect(b2.gananciaNeta).toBe(-6000);
    });

    it('Paso 3A: Canje posterior con diferencia a pagar (precioB > saldoGiftCard)', () => {
      // Clienta lleva Prenda B ($13.000, costo $5.000) usando Gift Card de $10.000
      // Diferencia abonada en efectivo: $3.000
      const canjeParcial: Sale = {
        id: 'venta_canje_parcial',
        fecha: '2026-05-10T10:00:00',
        tipo: 'venta',
        items: [prendaB],
        total: 3000,
        pago: { efectivo: 100, tarjeta: 0 },
        giftCardUsada: { codigo: 'GC-10K', montoUsado: 10000 }
      };

      const b3 = computeSaleBreakdown(canjeParcial);

      // Cobro en caja: solo la diferencia física cobrada
      expect(b3.efectivo).toBe(3000);
      expect(b3.tarjeta).toBe(0);
      expect(b3.totalCobrado).toBe(3000);

      // Ingreso total imputado a la venta: montoUsadoGiftCard (10000) + diferenciaCobrada (3000) = 13000
      expect(b3.precioVentaBruto).toBe(13000);
      expect(b3.ingresoNeto).toBe(13000);

      // Stock / Costo: egresa Prenda B (costoB = 5000)
      expect(b3.costoMercaderia).toBe(5000);
      expect(b3.costoTotal).toBe(5000);

      // Ganancia de esta operación: Ganancia_2 = ingresoTotal - costoB = 13000 - 5000 = 8000
      expect(b3.ganancia).toBe(8000);
      expect(b3.gananciaNeta).toBe(8000);
    });

    it('Paso 3B: Canje posterior 100% cubierto con Gift Card (precioB <= saldoGiftCard)', () => {
      // Clienta lleva Prenda B ($10.000, costo $4.000) usando Gift Card de $10.000
      const canjeTotal: Sale = {
        id: 'venta_canje_total',
        fecha: '2026-05-10T10:00:00',
        tipo: 'venta',
        items: [prendaBMisma],
        total: 0,
        pago: { efectivo: 100, tarjeta: 0 },
        giftCardUsada: { codigo: 'GC-10K', montoUsado: 10000 }
      };

      const b3 = computeSaleBreakdown(canjeTotal);

      // Caja física: No entra dinero nuevo (totalCobrado = 0)
      expect(b3.efectivo).toBe(0);
      expect(b3.tarjeta).toBe(0);
      expect(b3.totalCobrado).toBe(0);

      // Ingreso total imputado: $10.000
      expect(b3.precioVentaBruto).toBe(10000);
      expect(b3.ingresoNeto).toBe(10000);

      // Costo de Prenda B: $4.000
      expect(b3.costoMercaderia).toBe(4000);
      expect(b3.costoTotal).toBe(4000);

      // Ganancia: 10000 - 4000 = 6000
      expect(b3.ganancia).toBe(6000);
      expect(b3.gananciaNeta).toBe(6000);
    });

    it('Consolidación del ciclo completo en el Balance General', () => {
      // Venta 1: 10.000 cobrado, 6.000 ganancia
      const v1: Sale = {
        id: 'v1', fecha: '2026-05-01', tipo: 'venta',
        items: [prendaA], total: 10000, pago: { efectivo: 100, tarjeta: 0 }
      };
      // Devolución: 0 cobrado, -6.000 ganancia
      const v2: Sale = {
        id: 'v2', fecha: '2026-05-02', tipo: 'cambio',
        items: [], itemsDevueltos: [prendaA], itemsNuevos: [],
        diferencia: -10000, total: 0, pago: { efectivo: 100, tarjeta: 0 }
      };
      // Canje con Prenda B ($13.000) usando Gift Card ($10.000) + $3.000 efectivo
      const v3: Sale = {
        id: 'v3', fecha: '2026-05-03', tipo: 'venta',
        items: [prendaB], total: 3000, pago: { efectivo: 100, tarjeta: 0 },
        giftCardUsada: { codigo: 'GC-10K', montoUsado: 10000 }
      };

      const b1 = computeSaleBreakdown(v1);
      const b2 = computeSaleBreakdown(v2);
      const b3 = computeSaleBreakdown(v3);

      const cajaTotal = b1.efectivo + b2.efectivo + b3.efectivo;
      const gananciaTotal = b1.ganancia + b2.ganancia + b3.ganancia;

      // Caja física total: 10.000 (v1) + 0 (v2) + 3.000 (v3) = 13.000
      expect(cajaTotal).toBe(13000);

      // Ganancia total del ciclo: 6.000 (v1) - 6.000 (v2) + 8.000 (v3) = 8.000
      // Lo cual equivale exactamente a: $13.000 recaudados - $5.000 costo Prenda B entregada = $8.000
      expect(gananciaTotal).toBe(8000);
    });
  });
});
