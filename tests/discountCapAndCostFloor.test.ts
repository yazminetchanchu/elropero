import { describe, it, expect } from 'vitest';
import { recalculateOrderPricing } from '../functions/src/orders';

describe('Bug #5 - Control de Acumulación de Descuentos y Protección de Costo Mayorista', () => {
  const showroomData = {
    inventory: [
      {
        id: 'prod-campera',
        sku: 'CMP-01',
        descripcion: 'Campera de Cuero Premium',
        categoria: 'CAMPERAS',
        cantidad: 5,
        costo: 35000, // Costo mayorista $35.000
        ventaEfectivo: 40000,
        ventaTarjeta: 50000,
        descuentoWeb: 30, // 30% OFF por prenda
      },
      {
        // prod-pantalon: costo < precio con 40% descuento → solo límita la sección
        id: 'prod-pantalon',
        sku: 'PNT-02',
        descripcion: 'Pantalón Lino',
        categoria: 'PANTALONES',
        cantidad: 10,
        costo: 10000, // $10.000 < $18.000 (40% de $30.000) → el tope actúa pero no el piso de costo
        ventaEfectivo: 24000,
        ventaTarjeta: 30000,
        descuentoWeb: 0,
      },
      {
        // prod-buzo-costo-alto: costo > precio con 40% descuento → protección de costo actúa
        id: 'prod-buzo-costo-alto',
        sku: 'BUZ-03',
        descripcion: 'Buzo Algodón Premium',
        categoria: 'BUZOS',
        cantidad: 10,
        costo: 20000, // $20.000 > $18.000 (40% de $30.000) → precio queda en $20.000
        ventaEfectivo: 24000,
        ventaTarjeta: 30000,
        descuentoWeb: 0,
      },
      {
        id: 'prod-remera-promo',
        sku: 'REM-99',
        descripcion: 'Remera Promo Extrema',
        categoria: 'REMERAS',
        cantidad: 10,
        costo: 8000, // Costo mayorista $8.000
        ventaEfectivo: 10000,
        ventaTarjeta: 12500,
        descuentoWeb: 80, // Intento de 80% OFF en prenda → tope en 40%
      }
    ],
    webSettings: {
      maxDiscountPercentage: 40, // Tope global configurado en 40%
      discountBySection: {
        'PANTALONES': 50, // 50% OFF en la sección, pero el tope global es 40%
        'BUZOS': 50,      // 50% OFF en la sección, pero el tope global es 40%
        'REMERAS': 70,    // 70% OFF en sección → tope en 40%
      },
    },
    giftCards: [],
  };

  it('respeta el tope global maxDiscountPercentage limitando descuentos de sección excesivos', () => {
    // Pantalón: sección tiene 50% OFF, pero el tope global es 40%.
    // Costo $10.000 < precio con tope ($18.000), así que la protección de costo no actúa aquí.
    const orderData = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [{ productId: 'prod-pantalon', cantidad: 1 }],
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(showroomData, orderData);

    // Precio tarjeta = $30.000, con 40% de tope = $18.000 (no 50% = $15.000)
    const expectedPrice = Math.round(30000 * (1 - 0.40));
    expect(result.items[0].precioUnitario).toBe(expectedPrice);  // $18.000
    expect(result.items[0].descuento).toBe(40);
    expect(result.total).toBe(expectedPrice);
  });

  it('protege el costo mayorista cuando el descuento calculado dejaría el precio por debajo del costo', () => {
    // Buzo: Costo mayorista = $20.000. Precio Tarjeta = $30.000.
    // Sección BUZOS tiene 50%, tope global 40% → precio = 30.000 * 0.60 = $18.000
    // Pero $18.000 < costo $20.000 → protección fija el precio en $20.000.
    const orderData = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [{ productId: 'prod-buzo-costo-alto', cantidad: 1 }],
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(showroomData, orderData);

    expect(result.items[0].precioUnitario).toBe(20000); // Topado en el costo
    expect(result.total).toBe(20000);
    expect(result.items[0].precioUnitario).toBeGreaterThanOrEqual(20000);
  });

  it('protege el costo mayorista en pagos por transferencia con descuentos acumulados', () => {
    // Campera: Costo = $35.000. Venta Efectivo = $40.000. Descuento Web = 30%.
    // Tope global = 40% → disc = min(40, max(30, 0)) = 30%
    // Para transferencia: extraDesc = max(0, 30 - 20) = 10%.
    // Precio = 40.000 * (1 - 0.10) = $36.000 > costo $35.000 → permitido, no hay protección.
    const orderData = {
      metodoPago: 'Transferencia',
      items: [{ productId: 'prod-campera', cantidad: 1 }],
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(showroomData, orderData);
    expect(result.items[0].precioUnitario).toBe(36000);
    expect(result.total).toBe(36000);
    expect(result.items[0].precioUnitario).toBeGreaterThanOrEqual(35000);
  });

  it('evita ventas por debajo del costo cuando el descuento en transferencia reduciría el precio bajo el costo', () => {
    // Remera Promo: Costo = $8.000. Venta Efectivo = $10.000.
    // descuentoWeb = 80%, sección REMERAS = 70%, tope global 40% → disc = 40%
    // Transferencia: extraDesc = max(0, 40 - 20) = 20%
    // Precio = 10.000 * (1 - 0.20) = $8.000 = costo → precio exactamente en el piso.
    const orderData = {
      metodoPago: 'Transferencia',
      items: [{ productId: 'prod-remera-promo', cantidad: 1 }],
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(showroomData, orderData);
    expect(result.items[0].precioUnitario).toBe(8000);
    expect(result.total).toBe(8000);
  });

  it('utiliza 50% como tope global predeterminado si no está configurado en webSettings', () => {
    // Sin maxDiscountPercentage, el tope por defecto es 50%.
    // Remera Promo: Venta Tarjeta = $12.500. Sección REMERAS = 70% → tope 50% → precio = 12.500 * 0.50 = $6.250.
    // Pero costo = $8.000 > $6.250 → protección fija precio en $8.000.
    const dataWithoutCustomCap = {
      ...showroomData,
      webSettings: {
        discountBySection: {
          'REMERAS': 70,
        }
      }
    };

    const orderData = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [{ productId: 'prod-remera-promo', cantidad: 1 }],
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(dataWithoutCustomCap, orderData);
    // Precio = max(8000, round(12500 * 0.50)) = max(8000, 6250) = 8000
    expect(result.items[0].precioUnitario).toBe(8000);
    expect(result.total).toBe(8000);
  });

  it('no limita el precio si el descuento es menor que el tope global', () => {
    // Campera con descuento propio 30% < tope 40% → no se toca, aplica 30%.
    // Tarjeta: 50.000 * (1 - 0.30) = $35.000. Costo = $35.000 → precio justo en el piso.
    const orderData = {
      metodoPago: 'Tarjeta / Ualá Bis',
      items: [{ productId: 'prod-campera', cantidad: 1 }],
      tipoEnvio: 'retiro',
    };

    const result = recalculateOrderPricing(showroomData, orderData);
    const expectedPrice = Math.round(50000 * (1 - 0.30)); // $35.000
    expect(result.items[0].descuento).toBe(30); // Descuento real aplicado = 30% (no tocado por tope)
    expect(result.items[0].precioUnitario).toBe(expectedPrice); // $35.000
    expect(result.items[0].precioUnitario).toBeGreaterThanOrEqual(35000); // No por debajo del costo
  });
});
