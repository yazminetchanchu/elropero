import { describe, it, expect } from 'vitest';
import { computeSaleBreakdown, isMonth, calcTrend } from './finance';
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
});
