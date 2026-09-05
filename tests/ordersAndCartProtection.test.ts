import { describe, it, expect, vi } from 'vitest';
import { computeSaleBreakdown } from '../utils/orders';

describe('Bug #9 - computeSaleBreakdown (utils/orders.ts)', () => {
  it('calcula venta normal sin saldos a favor ni descuento por medio de pago', () => {
    const breakdown = computeSaleBreakdown({
      items: [
        { price: 10000, quantity: 2 },
        { price: 5000, quantity: 1 }
      ]
    });

    expect(breakdown.grossTotal).toBe(25000);
    expect(breakdown.totalCredited).toBe(0);
    expect(breakdown.discountAmount).toBe(0);
    expect(breakdown.finalAmountToPay).toBe(25000);
    expect(breakdown.netRevenue).toBe(25000);
  });

  it('resta valor de nota de crédito / cambio entregado del monto a pagar', () => {
    const breakdown = computeSaleBreakdown({
      items: [
        { price: 20000, quantity: 1 }
      ],
      appliedCreditNoteValue: 8000
    });

    // 20000 bruto - 8000 nota de crédito = 12000 a pagar
    expect(breakdown.grossTotal).toBe(20000);
    expect(breakdown.totalCredited).toBe(8000);
    expect(breakdown.discountAmount).toBe(0);
    expect(breakdown.finalAmountToPay).toBe(12000);
    expect(breakdown.netRevenue).toBe(12000);
  });

  it('resta saldo de Gift Card y aplica descuento de medio de pago SOLO sobre el excedente', () => {
    const breakdown = computeSaleBreakdown({
      items: [
        { price: 30000, quantity: 1 }
      ],
      appliedGiftCardValue: 10000,
      paymentMethodDiscount: 10 // 10% de descuento en efectivo sobre la diferencia
    });

    // Bruto: 30000
    // Credited (GC): 10000
    // Net before discount: 20000
    // Descuento 10% sobre 20000 = 2000
    // Final a pagar: 18000
    expect(breakdown.grossTotal).toBe(30000);
    expect(breakdown.totalCredited).toBe(10000);
    expect(breakdown.discountAmount).toBe(2000);
    expect(breakdown.finalAmountToPay).toBe(18000);
    expect(breakdown.netRevenue).toBe(18000);
  });

  it('cuando el saldo acreditado supera el total bruto, no genera saldos negativos ni cobros indebidos', () => {
    const breakdown = computeSaleBreakdown({
      items: [
        { price: 15000, quantity: 1 }
      ],
      appliedCreditNoteValue: 10000,
      appliedGiftCardValue: 10000,
      paymentMethodDiscount: 20
    });

    // Bruto: 15000, Cubierto: 20000
    // A pagar: 0
    expect(breakdown.grossTotal).toBe(15000);
    expect(breakdown.totalCredited).toBe(20000);
    expect(breakdown.discountAmount).toBe(0);
    expect(breakdown.finalAmountToPay).toBe(0);
    expect(breakdown.netRevenue).toBe(0);
  });
});
