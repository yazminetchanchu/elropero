import { describe, it, expect } from 'vitest';
import { calculateExchangeBreakdownServer } from '../functions/src/orders';

describe('Seguridad contra Fraude en Gift Cards y Cambios Web (Gift Card Fraud)', () => {
  const sampleInventory = [
    {
      id: 'prod-vestido',
      sku: 'VES-01',
      descripcion: 'Vestido de Fiesta Elegante',
      categoria: 'VESTIDOS',
      cantidad: 5,
      costo: 15000,
      ventaEfectivo: 30000,
      ventaTarjeta: 37500,
    },
    {
      id: 'prod-campera',
      sku: 'CAM-01',
      descripcion: 'Campera de Cuero Premium',
      categoria: 'CAMPERAS',
      cantidad: 3,
      costo: 35000,
      ventaEfectivo: 70000,
      ventaTarjeta: 87500,
    },
  ];

  const sampleWebSettings = {
    discountBySection: {},
  };

  it('anula montos inflados por el cliente y limita la Gift Card al valor neto pagado en la compra original', () => {
    // Venta original de un vestido pagado con transferencia ($30.000)
    const ventaOriginal = {
      id: 'sale_orig_123',
      fecha: new Date().toISOString(),
      metodoPago: 'Transferencia',
      pago: { efectivo: 100, tarjeta: 0 },
      items: [
        {
          productId: 'prod-vestido',
          id: 'prod-vestido',
          descripcion: 'Vestido de Fiesta Elegante (T:S C:NEGRO)',
          cantidad: 1,
          precioEfectivo: 30000,
          precioTarjeta: 37500,
          descuento: 0,
        },
      ],
      total: 30000,
    };

    // Atacante devuelve el vestido y no pide nada a cambio, pero envía diferencia = -250.000 para llevarse una Gift Card gigante
    const payload = {
      ventaOriginalId: 'sale_orig_123',
      itemsDevueltos: [
        {
          id: 'prod-vestido',
          productId: 'prod-vestido',
          descripcion: 'Vestido de Fiesta Elegante (T:S C:NEGRO)',
          cantidad: 1,
          talle: 'S',
          color: 'NEGRO',
        },
      ],
      itemsNuevos: [],
      diferencia: -250000, // ⚠️ Monto fraudulento claimed
      tipoEnvioDevolucion: 'local',
      tipoEnvioNuevo: 'local',
    };

    const breakdown = calculateExchangeBreakdownServer({
      ventaOriginal,
      itemsDevueltos: payload.itemsDevueltos,
      itemsNuevos: payload.itemsNuevos,
      inventory: sampleInventory,
      webSettings: sampleWebSettings,
      payload,
    });

    // La Gift Card debe ser exactamente por el valor pagado ($30.000), ignorando los $250.000
    expect(breakdown.diferenciaTotal).toBe(-30000);
    expect(breakdown.montoGiftCard).toBe(30000);
    expect(breakdown.montoGiftCard).not.toBe(250000);
    expect(breakdown.montoAPagar).toBe(0);
  });

  it('aplica equivalencia 1:1 por modelo (Ley del Consumidor): cambio de talle tiene diferencia $0 aunque el precio de lista haya aumentado', () => {
    // Venta original de vestido comprado hace 5 días a $25.000
    const ventaOriginal = {
      id: 'sale_orig_old_price',
      fecha: new Date().toISOString(),
      metodoPago: 'Tarjeta / Ualá Bis',
      pago: { efectivo: 0, tarjeta: 100 },
      items: [
        {
          productId: 'prod-vestido',
          id: 'prod-vestido',
          descripcion: 'Vestido de Fiesta Elegante (T:S C:NEGRO)',
          cantidad: 1,
          precioTarjeta: 25000,
          descuento: 0,
        },
      ],
      total: 25000,
    };

    // Hoy el vestido en catálogo cuesta $37.500 con tarjeta, pero el cliente cambia T:S por T:M
    const payload = {
      ventaOriginalId: 'sale_orig_old_price',
      itemsDevueltos: [
        {
          id: 'prod-vestido',
          productId: 'prod-vestido',
          descripcion: 'Vestido de Fiesta Elegante (T:S C:NEGRO)',
          cantidad: 1,
          talle: 'S',
          color: 'NEGRO',
        },
      ],
      itemsNuevos: [
        {
          id: 'prod-vestido',
          productId: 'prod-vestido',
          descripcion: 'Vestido de Fiesta Elegante (T:M C:NEGRO)',
          cantidad: 1,
          talle: 'M',
          color: 'NEGRO',
        },
      ],
      tipoEnvioDevolucion: 'local',
      tipoEnvioNuevo: 'local',
    };

    const breakdown = calculateExchangeBreakdownServer({
      ventaOriginal,
      itemsDevueltos: payload.itemsDevueltos,
      itemsNuevos: payload.itemsNuevos,
      inventory: sampleInventory,
      webSettings: sampleWebSettings,
      payload,
    });

    // Mismo modelo: 1 matched pair, diferencia $0, ni se cobra ni se genera gift card
    expect(breakdown.matchedPairsCount).toBe(1);
    expect(breakdown.diferenciaTotal).toBe(0);
    expect(breakdown.montoGiftCard).toBe(0);
    expect(breakdown.montoAPagar).toBe(0);
  });

  it('detecta intento de cambio por prenda más costosa alegando saldo a favor, forzando monto a pagar', () => {
    // Venta original del vestido ($30.000 efectivo)
    const ventaOriginal = {
      id: 'sale_vestido',
      fecha: new Date().toISOString(),
      metodoPago: 'Transferencia',
      pago: { efectivo: 100, tarjeta: 0 },
      items: [
        {
          productId: 'prod-vestido',
          id: 'prod-vestido',
          descripcion: 'Vestido de Fiesta Elegante (T:S C:NEGRO)',
          cantidad: 1,
          precioEfectivo: 30000,
        },
      ],
      total: 30000,
    };

    // Devuelve vestido ($30.000) y toma campera ($70.000 efectivo). Diferencia real: +$40.000 a pagar.
    // El atacante altera el payload y envía diferencia: -50000 para que le regalen una Gift Card
    const payload = {
      ventaOriginalId: 'sale_vestido',
      itemsDevueltos: [
        {
          id: 'prod-vestido',
          productId: 'prod-vestido',
          descripcion: 'Vestido de Fiesta Elegante (T:S C:NEGRO)',
          cantidad: 1,
        },
      ],
      itemsNuevos: [
        {
          id: 'prod-campera',
          productId: 'prod-campera',
          descripcion: 'Campera de Cuero Premium (T:L C:MARRON)',
          cantidad: 1,
        },
      ],
      diferencia: -50000, // ⚠️ Fraude pretendido
      pago: { efectivo: 100, tarjeta: 0 },
      tipoEnvioDevolucion: 'local',
      tipoEnvioNuevo: 'local',
    };

    const breakdown = calculateExchangeBreakdownServer({
      ventaOriginal,
      itemsDevueltos: payload.itemsDevueltos,
      itemsNuevos: payload.itemsNuevos,
      inventory: sampleInventory,
      webSettings: sampleWebSettings,
      payload,
    });

    // Debe resultar en $40.000 a pagar y CERO Gift Card
    expect(breakdown.diferenciaTotal).toBe(40000);
    expect(breakdown.montoAPagar).toBe(40000);
    expect(breakdown.montoGiftCard).toBe(0);
  });

  it('anula costos de flete ilegítimos cuando el retiro o devolución es presencial en local', () => {
    const ventaOriginal = {
      id: 'sale_test',
      fecha: new Date().toISOString(),
      metodoPago: 'Transferencia',
      pago: { efectivo: 100, tarjeta: 0 },
      items: [{ productId: 'prod-vestido', cantidad: 1, precioEfectivo: 30000 }],
      total: 30000,
    };

    const payload = {
      ventaOriginalId: 'sale_test',
      itemsDevueltos: [{ id: 'prod-vestido', cantidad: 1 }],
      itemsNuevos: [],
      tipoEnvioDevolucion: 'local',
      costoEnvioDevolucion: 9999, // ⚠️ No corresponde
      tipoEnvioNuevo: 'retiro',
      costoEnvioNuevo: 8888, // ⚠️ No corresponde
    };

    const breakdown = calculateExchangeBreakdownServer({
      ventaOriginal,
      itemsDevueltos: payload.itemsDevueltos,
      itemsNuevos: payload.itemsNuevos,
      inventory: sampleInventory,
      webSettings: sampleWebSettings,
      payload,
    });

    expect(breakdown.costoEnvioTotal).toBe(0);
    expect(breakdown.montoGiftCard).toBe(30000);
  });
});
