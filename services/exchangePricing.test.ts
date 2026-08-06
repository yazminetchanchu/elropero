import { describe, it, expect } from 'vitest';
import { transferLineTotal, sumTransferLines, DESCUENTO_BASE_TRANSFERENCIA } from './exchangePricing';
import { SaleItem } from '../types';

describe('exchangePricing service', () => {
  it('transferLineTotal: sin descuento extra', () => {
    const total = transferLineTotal({
      precioEfectivo: 100,
      precioTarjeta: 120,
      cantidad: 2,
      descuento: 20 // Mismo que el base
    });
    // Extra discount = max(0, 20 - 20) = 0
    // Price = 100 * 1 = 100. Total = 100 * 2 = 200.
    expect(total).toBe(200);
  });

  it('transferLineTotal: con descuento extra', () => {
    const total = transferLineTotal({
      precioEfectivo: 100,
      precioTarjeta: 120,
      cantidad: 2,
      descuento: 30 // 10% extra por encima del base
    });
    // Extra discount = max(0, 30 - 20) = 10
    // Price = 100 * 0.9 = 90. Total = 90 * 2 = 180.
    expect(total).toBe(180);
  });

  it('sumTransferLines: suma varios items', () => {
    const items: SaleItem[] = [
      { id: '1', sku: 'A', descripcion: 'A', costo: 50, precioEfectivo: 100, precioTarjeta: 120, cantidad: 1, descuento: 20 },
      { id: '2', sku: 'B', descripcion: 'B', costo: 40, precioEfectivo: 200, precioTarjeta: 240, cantidad: 2, descuento: 30 },
    ];
    // item 1: 100
    // item 2: 200 * 0.9 = 180. Total = 180 * 2 = 360
    // Sum = 100 + 360 = 460
    const sum = sumTransferLines(items);
    expect(sum).toBe(460);
  });
});
