import { describe, it, expect } from 'vitest';
import { recalculateOrderPricing } from '../functions/src/orders';

describe('Seguridad contra Manipulación de Precios (Price Tampering)', () => {
  const sampleShowroomData = {
    inventory: [
      {
        id: 'prod-vestido',
        sku: 'VES-01',
        descripcion: 'Vestido de Fiesta Elegante',
        categoria: 'VESTIDOS',
        cantidad: 5,
        costo: 30000,
        ventaEfectivo: 70000,
        ventaTarjeta: 87500,
        descuentoWeb: 10,
      },
      {
        id: 'prod-remera',
        sku: 'REM-02',
        descripcion: 'Remera Básica Algodón',
        categoria: 'REMERAS',
        cantidad: 10,
        costo: 5000,
        ventaEfectivo: 15000,
        ventaTarjeta: 18750,
      },
    ],
    webSettings: {
      discountBySection: {
        'REMERAS': 25, // Descuento de categoría mayor al del producto
      },
    },
    giftCards: [
      {
        codigo: 'GC-VIP-50K',
        saldo: 50000,
        estado: 'ACTIVA',
      },
      {
        codigo: 'GC-EXPIRED',
        saldo: 30000,
        estado: 'AGOTADA',
      },
    ],
  };

  it('sobrescribe precios unitarios manipulados por el cliente con los valores oficiales del inventario', () => {
    // Un atacante intenta comprar el vestido (precio real $87.500) por solo $100
    const tamperedOrderData = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [
        {
          productId: 'prod-vestido',
          cantidad: 1,
          precioUnitario: 100, // ⚠️ Manipulado por el atacante
        },
      ],
      total: 100, // ⚠️ Manipulado por el atacante
      costoEnvio: 0,
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(sampleShowroomData, tamperedOrderData);

    // El precio de tarjeta es 87500 con 10% de descuento web = 78750
    const expectedUnitPrice = Math.round(87500 * (1 - 0.10));
    expect(result.items[0].precioUnitario).toBe(expectedUnitPrice);
    expect(result.total).toBe(expectedUnitPrice);
    expect(result.total).not.toBe(100);
  });

  it('aplica correctamente el descuento de categoría cuando supera el descuento por prenda', () => {
    // La remera no tiene descuentoWeb propio, pero la sección REMERAS tiene 25% OFF
    const orderData = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [
        {
          productId: 'prod-remera',
          cantidad: 2,
        },
      ],
      costoEnvio: 0,
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(sampleShowroomData, orderData);

    // Precio tarjeta = 18750, con 25% de descuento = 14063 por unidad
    const expectedUnitPrice = Math.round(18750 * (1 - 0.25));
    expect(result.items[0].precioUnitario).toBe(expectedUnitPrice);
    expect(result.total).toBe(expectedUnitPrice * 2);
  });

  it('calcula correctamente el precio para pago por transferencia con descuento base', () => {
    // Transferencia toma ventaEfectivo
    const orderData = {
      metodoPago: 'Transferencia',
      items: [
        {
          productId: 'prod-vestido',
          cantidad: 1,
        },
      ],
      costoEnvio: 0,
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(sampleShowroomData, orderData);

    // Venta efectivo = 70000. Descuento web = 10% (menor que el base de transferencia 20%), extraDesc = 0
    expect(result.items[0].precioUnitario).toBe(70000);
    expect(result.total).toBe(70000);
  });

  it('recalcula el total sumando costo de envío legítimo y anulando costo de envío en retiros', () => {
    // Intento de envío a domicilio con costo alterado a $0 o negativo
    const orderWithShipping = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [{ productId: 'prod-remera', cantidad: 1 }],
      tipoEnvio: 'envio',
      costoEnvio: 5500,
      total: 10, // ⚠️ Total falso
    };

    const resShipping = recalculateOrderPricing(sampleShowroomData, orderWithShipping);
    const unitPrice = Math.round(18750 * (1 - 0.25));
    expect(resShipping.costoEnvio).toBe(5500);
    expect(resShipping.total).toBe(unitPrice + 5500);

    // Si es retiro, el costo de envío siempre se fuerza a $0
    const orderPickup = {
      ...orderWithShipping,
      tipoEnvio: 'retiro',
      costoEnvio: 9999, // ⚠️ No aplicable para retiro
    };
    const resPickup = recalculateOrderPricing(sampleShowroomData, orderPickup);
    expect(resPickup.costoEnvio).toBe(0);
    expect(resPickup.total).toBe(unitPrice);
  });

  it('valida Gift Cards aplicadas contra el saldo real y no permite deducciones fraudulentas', () => {
    const orderData = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [{ productId: 'prod-vestido', cantidad: 1 }],
      costoEnvio: 0,
      tipoEnvio: 'retiro',
      giftCardUsada: {
        codigo: 'GC-VIP-50K',
        montoUsado: 999999, // ⚠️ Intento de descontar más de lo que tiene la tarjeta
      },
    };

    const result = recalculateOrderPricing(sampleShowroomData, orderData);
    const itemPrice = Math.round(87500 * (1 - 0.10)); // 78750
    // Saldo disponible en GC-VIP-50K es 50000
    expect(result.giftCardUsada?.montoUsado).toBe(50000);
    expect(result.total).toBe(itemPrice - 50000);
  });

  it('ignora Gift Cards inactivas o agotadas', () => {
    const orderData = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [{ productId: 'prod-remera', cantidad: 1 }],
      costoEnvio: 0,
      tipoEnvio: 'retiro',
      giftCardUsada: {
        codigo: 'GC-EXPIRED', // ⚠️ Estado AGOTADA
        montoUsado: 10000,
      },
    };

    const result = recalculateOrderPricing(sampleShowroomData, orderData);
    const expectedUnitPrice = Math.round(18750 * (1 - 0.25));
    expect(result.giftCardUsada).toBeUndefined();
    expect(result.total).toBe(expectedUnitPrice);
  });

  it('maneja Virtual Gift Cards forzando el monto mínimo de $5.000', () => {
    const orderData = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [
        {
          isVirtualGiftCard: true,
          precioUnitario: 50, // ⚠️ Monto por debajo del mínimo permitido
          cantidad: 1,
        },
      ],
      costoEnvio: 0,
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(sampleShowroomData, orderData);
    // El mínimo es 5000, con recargo de tarjeta (5000 / 0.8 = 6250)
    expect(result.items[0].precioUnitario).toBe(Math.round(5000 / 0.8));
    expect(result.total).toBe(Math.round(5000 / 0.8));
  });
});
