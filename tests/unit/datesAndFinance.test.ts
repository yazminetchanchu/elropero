import { describe, it, expect } from 'vitest';
import { parseSafeDate } from '../../services/webOrderToSale';
import { computeSaleBreakdown } from '../../services/finance';
import { Sale, SaleItem } from '../../types';

describe('Suite 1: Unit Tests - Fechas y Lógica Financiera (datesAndFinance.test.ts)', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. parseSafeDate: Variantes locales, ISO, Timestamps y casos borde (día < 12)
  // ──────────────────────────────────────────────────────────────────────────
  describe('parseSafeDate', () => {
    it('parsea correctamente fechas locales argentinas DD/MM/YYYY con día < 12 sin confundir con meses', () => {
      // Caso crítico: día < 12 ("05/08/2026" debe ser 5 de Agosto, NO 8 de Mayo)
      const parsedAug5 = parseSafeDate('05/08/2026');
      expect(parsedAug5).not.toBeNull();
      expect(parsedAug5!.getFullYear()).toBe(2026);
      expect(parsedAug5!.getMonth()).toBe(7); // 0-indexed: 7 = Agosto
      expect(parsedAug5!.getDate()).toBe(5);

      // "02/11/2026" debe ser 2 de Noviembre, NO 11 de Febrero
      const parsedNov2 = parseSafeDate('02/11/2026');
      expect(parsedNov2).not.toBeNull();
      expect(parsedNov2!.getFullYear()).toBe(2026);
      expect(parsedNov2!.getMonth()).toBe(10); // 10 = Noviembre
      expect(parsedNov2!.getDate()).toBe(2);

      // "09/03/2026" debe ser 9 de Marzo, NO 3 de Septiembre
      const parsedMar9 = parseSafeDate('09/03/2026');
      expect(parsedMar9).not.toBeNull();
      expect(parsedMar9!.getFullYear()).toBe(2026);
      expect(parsedMar9!.getMonth()).toBe(2); // 2 = Marzo
      expect(parsedMar9!.getDate()).toBe(9);
    });

    it('parsea correctamente fechas locales con día > 12 (sin ambigüedad)', () => {
      const parsedDec25 = parseSafeDate('25/12/2025');
      expect(parsedDec25).not.toBeNull();
      expect(parsedDec25!.getFullYear()).toBe(2025);
      expect(parsedDec25!.getMonth()).toBe(11); // 11 = Diciembre
      expect(parsedDec25!.getDate()).toBe(25);

      const parsedApr18 = parseSafeDate('18/04/2026');
      expect(parsedApr18).not.toBeNull();
      expect(parsedApr18!.getFullYear()).toBe(2026);
      expect(parsedApr18!.getMonth()).toBe(3); // 3 = Abril
      expect(parsedApr18!.getDate()).toBe(18);
    });

    it('parsea fechas locales con formato de hora "DD/MM/YYYY, HH:mm" y "DD/MM/YYYY HH:mm:ss"', () => {
      const withTime1 = parseSafeDate('05/08/2026, 14:35');
      expect(withTime1).not.toBeNull();
      expect(withTime1!.getDate()).toBe(5);
      expect(withTime1!.getMonth()).toBe(7);
      expect(withTime1!.getFullYear()).toBe(2026);
      expect(withTime1!.getHours()).toBe(14);
      expect(withTime1!.getMinutes()).toBe(35);

      const withTime2 = parseSafeDate('12/09/2026 09:15:42');
      expect(withTime2).not.toBeNull();
      expect(withTime2!.getDate()).toBe(12);
      expect(withTime2!.getMonth()).toBe(8); // 8 = Septiembre
      expect(withTime2!.getHours()).toBe(9);
      expect(withTime2!.getMinutes()).toBe(15);
      expect(withTime2!.getSeconds()).toBe(42);
    });

    it('parsea fechas con dígitos simples D/M/YYYY', () => {
      const singleDigit = parseSafeDate('3/4/2026');
      expect(singleDigit).not.toBeNull();
      expect(singleDigit!.getDate()).toBe(3);
      expect(singleDigit!.getMonth()).toBe(3); // Abril
      expect(singleDigit!.getFullYear()).toBe(2026);
    });

    it('parsea strings ISO estándar (YYYY-MM-DD y formato completo UTC)', () => {
      const isoSimple = parseSafeDate('2026-08-05');
      expect(isoSimple).not.toBeNull();
      expect(isoSimple!.getUTCFullYear()).toBe(2026);
      expect(isoSimple!.getUTCMonth()).toBe(7);
      expect(isoSimple!.getUTCDate()).toBe(5);

      const isoFull = parseSafeDate('2026-08-05T14:30:00.000Z');
      expect(isoFull).not.toBeNull();
      expect(isoFull!.getTime()).toBe(new Date('2026-08-05T14:30:00.000Z').getTime());
    });

    it('soporta objetos Timestamp de Firestore con método .toDate()', () => {
      const expected = new Date(2026, 5, 20, 10, 0, 0);
      const firestoreTimestamp = {
        toDate: () => expected
      };

      const result = parseSafeDate(firestoreTimestamp);
      expect(result).toEqual(expected);
    });

    it('soporta timestamps numéricos en milisegundos (Epoch)', () => {
      const epochMs = 1775134800000;
      const parsed = parseSafeDate(epochMs);
      expect(parsed).not.toBeNull();
      expect(parsed!.getTime()).toBe(epochMs);
    });

    it('soporta instancias directas de Date válidas e invalidadas', () => {
      const validDate = new Date(2026, 2, 15);
      expect(parseSafeDate(validDate)).toBe(validDate);

      const invalidDate = new Date('fecha_invalida');
      expect(parseSafeDate(invalidDate)).toBeNull();
    });

    it('retorna null ante entradas vacías, nulas o formatos corruptos', () => {
      expect(parseSafeDate(null)).toBeNull();
      expect(parseSafeDate(undefined)).toBeNull();
      expect(parseSafeDate('')).toBeNull();
      expect(parseSafeDate('texto_aleatorio')).toBeNull();
      expect(parseSafeDate({})).toBeNull();
      expect(parseSafeDate(NaN)).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. computeSaleBreakdown: Ventas y cambios con Gift Cards totales y parciales
  // ──────────────────────────────────────────────────────────────────────────
  describe('computeSaleBreakdown', () => {
    const item1: SaleItem = {
      id: 'prod-1',
      sku: 'SKU-P1',
      descripcion: 'Remera Algodón',
      cantidad: 1,
      costo: 5000,
      precioEfectivo: 10000,
      precioTarjeta: 10000,
      descuento: 0
    };

    const item2: SaleItem = {
      id: 'prod-2',
      sku: 'SKU-P2',
      descripcion: 'Vestido Lino',
      cantidad: 1,
      costo: 12000,
      precioEfectivo: 25000,
      precioTarjeta: 25000,
      descuento: 0
    };

    const baseSalesHistory: Sale[] = [
      {
        id: 'orig-sale-1',
        fecha: '2026-08-01T10:00:00Z',
        tipo: 'venta',
        items: [item1],
        total: 10000,
        pago: { efectivo: 100, tarjeta: 0 }
      }
    ];

    describe('Ventas Regulares', () => {
      it('calcula venta con Gift Card total (100% cubierto): efectivo 0, tarjeta 0, cobrado 0', () => {
        const sale: Sale = {
          id: 's-gc-total',
          fecha: '2026-08-20T10:00:00Z',
          tipo: 'venta',
          items: [item1], // Precio 10.000, Costo 5.000
          total: 10000,
          pago: { efectivo: 100, tarjeta: 0 },
          giftCardUsada: { codigo: 'GC-10K', montoUsado: 10000 }
        };

        const result = computeSaleBreakdown(sale, []);
        expect(result.efectivo).toBe(0);
        expect(result.tarjeta).toBe(0);
        expect(result.totalCobrado).toBe(0);
        expect(result.costoTotal).toBe(5000);
        expect(result.ganancia).toBe(-5000); // 0 cobrado - 5000 costo
      });

      it('calcula venta con Gift Card parcial (pago 100% Efectivo)', () => {
        const sale: Sale = {
          id: 's-gc-part-efectivo',
          fecha: '2026-08-20T10:00:00Z',
          tipo: 'venta',
          items: [item2], // Precio 25.000, Costo 12.000
          total: 25000,
          pago: { efectivo: 100, tarjeta: 0 },
          giftCardUsada: { codigo: 'GC-10K', montoUsado: 10000 }
        };

        // Total 25.000 - 10.000 GC = 15.000 cobrado en efectivo
        const result = computeSaleBreakdown(sale, []);
        expect(result.efectivo).toBe(15000);
        expect(result.tarjeta).toBe(0);
        expect(result.totalCobrado).toBe(15000);
        expect(result.costoTotal).toBe(12000);
        expect(result.ganancia).toBe(3000); // 15000 - 12000
      });

      it('calcula venta con Gift Card parcial (pago 100% Tarjeta)', () => {
        const sale: Sale = {
          id: 's-gc-part-tarjeta',
          fecha: '2026-08-20T10:00:00Z',
          tipo: 'venta',
          items: [item2], // Precio 25.000, Costo 12.000
          total: 25000,
          pago: { efectivo: 0, tarjeta: 100 },
          giftCardUsada: { codigo: 'GC-10K', montoUsado: 10000 }
        };

        const result = computeSaleBreakdown(sale, []);
        expect(result.efectivo).toBe(0);
        expect(result.tarjeta).toBe(15000);
        expect(result.totalCobrado).toBe(15000);
        expect(result.costoTotal).toBe(12000);
        expect(result.ganancia).toBe(3000);
      });

      it('prorratea proporcionalmente el descuento de la Gift Card en ventas con pago mixto (efectivo y tarjeta)', () => {
        const sale: Sale = {
          id: 's-gc-mixto',
          fecha: '2026-08-20T10:00:00Z',
          tipo: 'venta',
          items: [item1, item1], // Total $20.000 (10.000 cada uno)
          total: 20000,
          pago: { efectivo: 60, tarjeta: 40 }, // 12.000 efec, 8.000 tarj antes de GC
          giftCardUsada: { codigo: 'GC-5K', montoUsado: 5000 }
        };

        // GC = 5.000 se descuenta 60% (3.000) a efectivo y 40% (2.000) a tarjeta
        // Efectivo restante: 12.000 - 3.000 = 9.000
        // Tarjeta restante: 8.000 - 2.000 = 6.000
        // Total Cobrado: 15.000
        const result = computeSaleBreakdown(sale, []);
        expect(result.efectivo).toBe(9000);
        expect(result.tarjeta).toBe(6000);
        expect(result.totalCobrado).toBe(15000);
        expect(result.costoTotal).toBe(10000); // 5000 * 2
        expect(result.ganancia).toBe(5000); // 15000 - 10000
      });

      it('soporta giftCardUsada definida como número directo', () => {
        const sale: Sale = {
          id: 's-gc-direct-num',
          fecha: '2026-08-20T10:00:00Z',
          tipo: 'venta',
          items: [item1], // 10.000
          total: 10000,
          pago: { efectivo: 100, tarjeta: 0 },
          giftCardUsada: 4000 as any
        };

        const result = computeSaleBreakdown(sale, []);
        expect(result.efectivo).toBe(6000);
        expect(result.tarjeta).toBe(0);
        expect(result.totalCobrado).toBe(6000);
      });
    });

    describe('Venta de Gift Card (tipo: "gift")', () => {
      it('calcula la venta de una Gift Card sin costo de inventario y 100% de ganancia', () => {
        const giftSale: Sale = {
          id: 's-gift-card-purchase',
          fecha: '2026-08-20T10:00:00Z',
          tipo: 'gift',
          total: 30000,
          pago: { efectivo: 70, tarjeta: 30 }
        };

        const result = computeSaleBreakdown(giftSale, []);
        expect(result.efectivo).toBe(21000); // 70% de 30.000
        expect(result.tarjeta).toBe(9000);  // 30% de 30.000
        expect(result.totalCobrado).toBe(30000);
        expect(result.costoTotal).toBe(0);
        expect(result.ganancia).toBe(30000);
      });
    });

    describe('Cambios ("cambio") con Gift Cards', () => {
      it('cambio con Gift Card que cubre el 100% de la diferencia: no suma en efectivo ni tarjeta', () => {
        // Devuelve item1 ($10.000), lleva item2 ($25.000). Diferencia a pagar: $15.000
        const cambioSale: Sale = {
          id: 'cambio-gc-total',
          fecha: '2026-08-21T10:00:00Z',
          tipo: 'cambio',
          items: [],
          itemsDevueltos: [item1],
          itemsNuevos: [item2],
          ventaOriginalId: 'orig-sale-1',
          diferencia: 15000,
          total: 15000,
          pago: { efectivo: 100, tarjeta: 0 },
          giftCardUsada: { codigo: 'GC-15K', montoUsado: 15000 }
        };

        const result = computeSaleBreakdown(cambioSale, baseSalesHistory);
        expect(result.efectivo).toBe(0);
        expect(result.tarjeta).toBe(0);
        expect(result.totalCobrado).toBe(0);
      });

      it('cambio con Gift Card parcial: distribuye solo el remanente real cobrado', () => {
        // Diferencia $15.000 - Gift Card $5.000 = Remanente $10.000
        // Pago 60% Efectivo / 40% Tarjeta -> $6.000 efec, $4.000 tarj
        const cambioSale: Sale = {
          id: 'cambio-gc-parcial',
          fecha: '2026-08-21T10:00:00Z',
          tipo: 'cambio',
          items: [],
          itemsDevueltos: [item1],
          itemsNuevos: [item2],
          ventaOriginalId: 'orig-sale-1',
          diferencia: 15000,
          total: 15000,
          pago: { efectivo: 60, tarjeta: 40 },
          giftCardUsada: { codigo: 'GC-5K', montoUsado: 5000 }
        };

        const result = computeSaleBreakdown(cambioSale, baseSalesHistory);
        expect(result.efectivo).toBe(6000);
        expect(result.tarjeta).toBe(4000);
        expect(result.totalCobrado).toBe(10000);
      });

      it('cambio a favor del cliente (diferencia negativa) no genera cobros indebidos', () => {
        // Devuelve item2 ($25.000), lleva item1 ($10.000). Diferencia: -$15.000
        const cambioAFavorCliente: Sale = {
          id: 'cambio-negativo',
          fecha: '2026-08-21T10:00:00Z',
          tipo: 'cambio',
          items: [],
          itemsDevueltos: [item2],
          itemsNuevos: [item1],
          ventaOriginalId: 'orig-sale-1',
          diferencia: -15000,
          total: -15000,
          pago: { efectivo: 100, tarjeta: 0 }
        };

        const result = computeSaleBreakdown(cambioAFavorCliente, baseSalesHistory);
        expect(result.efectivo).toBe(0);
        expect(result.tarjeta).toBe(0);
        expect(result.totalCobrado).toBe(0);
      });
    });
  });
});
