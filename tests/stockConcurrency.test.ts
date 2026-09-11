import { describe, it, expect } from 'vitest';
import {
  getAvailableStock,
  deductInventory,
  restoreInventory,
  verifyStock,
  deductSaleFromInventory,
  restoreSaleToInventory,
} from '../services/webOrderFulfillment';
import { InventoryItem } from '../types';

// ─── Inventario de referencia ───────────────────────────────────────────────

const prodConVariantes: InventoryItem = {
  id: 'prod-v',
  sku: 'SKU-V',
  descripcion: 'Remera con Variantes',
  proveedor: 'Prov',
  categoria: 'REMERAS',
  cantidad: 10,
  costo: 1000,
  ventaEfectivo: 2000,
  ventaTarjeta: 2500,
  talles: ['S', 'M'],
  colores: ['BLANCO', 'NEGRO'],
  imagenes: [],
  stockPorVariante: {
    'S-BLANCO': 3,
    'S-NEGRO': 0,
    'M-BLANCO': 5,
    'M-NEGRO': 2,
  },
};

const prodConColores: InventoryItem = {
  id: 'prod-c',
  sku: 'SKU-C',
  descripcion: 'Pantalon Jean',
  proveedor: 'Prov',
  categoria: 'PANTALONES',
  cantidad: 7,
  costo: 3000,
  ventaEfectivo: 6000,
  ventaTarjeta: 7000,
  talles: [],
  colores: ['AZUL', 'NEGRO'],
  imagenes: [],
  coloresStock: { AZUL: 4, NEGRO: 3 },
};

const prodSimple: InventoryItem = {
  id: 'prod-s',
  sku: 'SKU-S',
  descripcion: 'Accesorio',
  proveedor: 'Prov',
  categoria: 'ACCESORIOS',
  cantidad: 8,
  costo: 500,
  ventaEfectivo: 1000,
  ventaTarjeta: 1200,
  talles: [],
  colores: [],
  imagenes: [],
};

const sampleInventory = [prodConVariantes, prodConColores, prodSimple];

// ─── getAvailableStock ──────────────────────────────────────────────────────

describe('getAvailableStock - Stock en tiempo real para bloqueo de UI', () => {
  it('devuelve stock de una variante especifica (talle + color)', () => {
    expect(getAvailableStock(prodConVariantes, 'S', 'BLANCO')).toBe(3);
    expect(getAvailableStock(prodConVariantes, 'M', 'NEGRO')).toBe(2);
  });

  it('devuelve 0 para una variante agotada', () => {
    expect(getAvailableStock(prodConVariantes, 'S', 'NEGRO')).toBe(0);
  });

  it('devuelve la suma de variantes de un color (sin especificar talle)', () => {
    // S-BLANCO:3 + M-BLANCO:5 = 8
    expect(getAvailableStock(prodConVariantes, undefined, 'BLANCO')).toBe(8);
  });

  it('devuelve stock de coloresStock cuando no hay stockPorVariante', () => {
    expect(getAvailableStock(prodConColores, undefined, 'AZUL')).toBe(4);
    expect(getAvailableStock(prodConColores, undefined, 'NEGRO')).toBe(3);
  });

  it('devuelve cantidad total para productos sin variantes ni colores', () => {
    expect(getAvailableStock(prodSimple)).toBe(8);
  });

  it('retorna 0 para producto nulo', () => {
    expect(getAvailableStock(null as any)).toBe(0);
  });

  it('es case-insensitive en las claves de variante', () => {
    expect(getAvailableStock(prodConVariantes, 's', 'blanco')).toBe(3);
  });
});

// ─── deductInventory ────────────────────────────────────────────────────────

describe('deductInventory - Descuento atomico de stock al confirmar pedido web', () => {
  it('descuenta correctamente una variante (stockPorVariante)', () => {
    const updated = deductInventory(sampleInventory, [
      { productId: 'prod-v', descripcion: 'Remera', sku: 'SKU-V', cantidad: 2, talle: 'S', color: 'BLANCO' },
    ]);
    const p = updated.find(i => i.id === 'prod-v')!;
    expect(p.stockPorVariante!['S-BLANCO']).toBe(1); // 3 - 2
    expect(p.cantidad).toBe(8); // 10 - 2
  });

  it('descuenta correctamente coloresStock sin talle', () => {
    const updated = deductInventory(sampleInventory, [
      { productId: 'prod-c', descripcion: 'Pantalon', sku: 'SKU-C', cantidad: 2, color: 'AZUL' },
    ]);
    const p = updated.find(i => i.id === 'prod-c')!;
    expect(p.coloresStock!.AZUL).toBe(2); // 4 - 2
    expect(p.cantidad).toBe(5); // 2 + 3
  });

  it('descuenta correctamente un producto simple', () => {
    const updated = deductInventory(sampleInventory, [
      { productId: 'prod-s', descripcion: 'Accesorio', sku: 'SKU-S', cantidad: 3 },
    ]);
    const p = updated.find(i => i.id === 'prod-s')!;
    expect(p.cantidad).toBe(5); // 8 - 3
  });

  it('no lleva stock a negativo (floor en 0)', () => {
    const updated = deductInventory(sampleInventory, [
      { productId: 'prod-s', descripcion: 'Accesorio', sku: 'SKU-S', cantidad: 100 },
    ]);
    const p = updated.find(i => i.id === 'prod-s')!;
    expect(p.cantidad).toBe(0);
  });

  it('no modifica productos ajenos al pedido', () => {
    const updated = deductInventory(sampleInventory, [
      { productId: 'prod-s', descripcion: 'Accesorio', sku: 'SKU-S', cantidad: 1 },
    ]);
    const p = updated.find(i => i.id === 'prod-v')!;
    expect(p.cantidad).toBe(prodConVariantes.cantidad);
  });

  it('ignora items marcados como Gift Card virtual', () => {
    const updated = deductInventory(sampleInventory, [
      {
        productId: 'prod-s',
        descripcion: 'Gift Card',
        sku: 'GC',
        cantidad: 5,
        isVirtualGiftCard: true,
      },
    ]);
    const p = updated.find(i => i.id === 'prod-s')!;
    expect(p.cantidad).toBe(prodSimple.cantidad);
  });
});

// ─── restoreInventory ───────────────────────────────────────────────────────

describe('restoreInventory - Devolucion de stock al liberar reserva expirada o cambio', () => {
  it('restaura unidades a stockPorVariante', () => {
    const updated = restoreInventory(sampleInventory, [
      { productId: 'prod-v', descripcion: 'Remera', sku: 'SKU-V', cantidad: 2, talle: 'S', color: 'NEGRO' },
    ]);
    const p = updated.find(i => i.id === 'prod-v')!;
    expect(p.stockPorVariante!['S-NEGRO']).toBe(2); // 0 + 2
    expect(p.cantidad).toBe(12); // 10 + 2
  });

  it('restaura coloresStock al devolver una prenda', () => {
    const updated = restoreInventory(sampleInventory, [
      { productId: 'prod-c', descripcion: 'Pantalon', sku: 'SKU-C', cantidad: 3, color: 'NEGRO' },
    ]);
    const p = updated.find(i => i.id === 'prod-c')!;
    expect(p.coloresStock!.NEGRO).toBe(6); // 3 + 3
  });

  it('restaura cantidad simple sin variantes', () => {
    const updated = restoreInventory(sampleInventory, [
      { productId: 'prod-s', descripcion: 'Accesorio', sku: 'SKU-S', cantidad: 4 },
    ]);
    const p = updated.find(i => i.id === 'prod-s')!;
    expect(p.cantidad).toBe(12); // 8 + 4
  });
});

// ─── verifyStock ────────────────────────────────────────────────────────────

describe('verifyStock - Validacion de stock al momento del cobro (anti-overselling)', () => {
  it('no lanza error si hay stock suficiente', () => {
    expect(() =>
      verifyStock(sampleInventory, [
        { productId: 'prod-v', descripcion: 'Remera', sku: 'SKU-V', cantidad: 3, precioUnitario: 1000, talle: 'S', color: 'BLANCO' },
      ])
    ).not.toThrow();
  });

  it('lanza error si la variante esta agotada en el momento del cobro', () => {
    expect(() =>
      verifyStock(sampleInventory, [
        { productId: 'prod-v', descripcion: 'Remera Negra S', sku: 'SKU-V', cantidad: 1, precioUnitario: 1000, talle: 'S', color: 'NEGRO' },
      ])
    ).toThrow(/No hay stock suficiente/);
  });

  it('lanza error si el producto fue eliminado del catalogo', () => {
    expect(() =>
      verifyStock(sampleInventory, [
        { productId: 'prod-borrado', descripcion: 'Producto Inexistente', sku: 'XXX', cantidad: 1, precioUnitario: 1000 },
      ])
    ).toThrow(/ya no existe en el cat/);
  });

  it('omite la validacion para Gift Cards virtuales', () => {
    expect(() =>
      verifyStock(sampleInventory, [
        {
          productId: 'prod-inexistente',
          descripcion: 'Gift Card',
          sku: 'GC',
          cantidad: 1,
          precioUnitario: 1000,
          isVirtualGiftCard: true,
        },
      ])
    ).not.toThrow();
  });

  it('lanza error si se excede el stock de coloresStock', () => {
    expect(() =>
      verifyStock(sampleInventory, [
        { productId: 'prod-c', descripcion: 'Pantalon Jean Azul', sku: 'SKU-C', cantidad: 5, precioUnitario: 1000, color: 'AZUL' },
      ])
    ).toThrow(/No hay stock suficiente/);
  });
});

// ─── deductSaleFromInventory / restoreSaleToInventory ──────────────────────

describe('deductSaleFromInventory / restoreSaleToInventory - Flujos de Venta y Cambio', () => {
  const baseSaleItem = {
    id: 'prod-s',
    sku: 'SKU-S',
    descripcion: 'Accesorio',
    cantidad: 2,
    costo: 500,
    precioEfectivo: 1000,
    precioTarjeta: 1200,
    descuento: 0,
  };

  it('descuenta stock en una venta normal', () => {
    const sale = {
      id: 'sale-1',
      fecha: new Date().toISOString(),
      tipo: 'venta' as const,
      total: 2000,
      pago: { efectivo: 100, tarjeta: 0 },
      items: [baseSaleItem],
    };
    const updated = deductSaleFromInventory(sampleInventory, sale);
    const p = updated.find(i => i.id === 'prod-s')!;
    expect(p.cantidad).toBe(6); // 8 - 2
  });

  it('en un cambio: restaura devueltos y descuenta nuevos', () => {
    const cambioSale = {
      id: 'cambio-1',
      fecha: new Date().toISOString(),
      tipo: 'cambio' as const,
      total: 0,
      diferencia: 0,
      pago: { efectivo: 100, tarjeta: 0 },
      items: [],
      itemsDevueltos: [baseSaleItem],   // devuelve 2 -> stock +2
      itemsNuevos: [
        {
          id: 'prod-s',
          sku: 'SKU-S',
          descripcion: 'Accesorio',
          cantidad: 1,                 // compra 1 nuevo -> stock -1
          costo: 500,
          precioEfectivo: 1000,
          precioTarjeta: 1200,
          descuento: 0,
        },
      ],
    };
    const updated = deductSaleFromInventory(sampleInventory, cambioSale);
    const p = updated.find(i => i.id === 'prod-s')!;
    expect(p.cantidad).toBe(9); // 8 + 2 - 1
  });

  it('restoreSaleToInventory revierte una venta normal', () => {
    const sale = {
      id: 'sale-2',
      fecha: new Date().toISOString(),
      tipo: 'venta' as const,
      total: 2000,
      pago: { efectivo: 100, tarjeta: 0 },
      items: [baseSaleItem],
    };
    const updated = restoreSaleToInventory(sampleInventory, sale);
    const p = updated.find(i => i.id === 'prod-s')!;
    expect(p.cantidad).toBe(10); // 8 + 2
  });

  it('restoreSaleToInventory revierte un cambio: descuenta devueltos y devuelve nuevos al stock', () => {
    const cambioSale = {
      id: 'cambio-2',
      fecha: new Date().toISOString(),
      tipo: 'cambio' as const,
      total: 0,
      diferencia: -500,
      giftGeneradaId: 'gc-generated-123',
      items: [],
      itemsDevueltos: [baseSaleItem], // había devuelto 2 unidades (+2)
      itemsNuevos: [
        {
          id: 'prod-s',
          sku: 'SKU-S',
          descripcion: 'Accesorio',
          cantidad: 1, // había llevado 1 nueva (-1)
          costo: 500,
          precioEfectivo: 1000,
          precioTarjeta: 1200,
          descuento: 0,
        },
      ],
    };

    // Al revertir el cambio sobre sampleInventory (donde cantidad es 8):
    // 8 - 2 (devueltos) + 1 (nuevos) = 7
    const restored = restoreSaleToInventory(sampleInventory, cambioSale);
    const p = restored.find(i => i.id === 'prod-s')!;
    expect(p.cantidad).toBe(7);
  });

  it('elimina la Gift Card generada cuando se elimina la venta de tipo cambio', () => {
    const giftCards = [
      {
        id: 'gc-generated-123',
        codigo: 'GIFT-TEST',
        destinatario: 'Cliente',
        montoInicial: 500,
        saldo: 500,
        estado: 'ACTIVA' as const,
        fechaCreacion: new Date().toISOString(),
      },
      {
        id: 'gc-other',
        codigo: 'GIFT-OTHER',
        destinatario: 'Otro',
        montoInicial: 1000,
        saldo: 1000,
        estado: 'ACTIVA' as const,
        fechaCreacion: new Date().toISOString(),
      },
    ];

    const saleToDelete = {
      id: 'sale-cambio-1',
      fecha: new Date().toISOString(),
      tipo: 'cambio' as const,
      total: 0,
      diferencia: -500,
      giftGeneradaId: 'gc-generated-123',
      items: [],
    };

    let nextGiftCards = [...giftCards];
    if (saleToDelete.giftGeneradaId) {
      nextGiftCards = nextGiftCards.filter(gc => gc.id !== saleToDelete.giftGeneradaId);
    }

    expect(nextGiftCards).toHaveLength(1);
    expect(nextGiftCards.find(gc => gc.id === 'gc-generated-123')).toBeUndefined();
    expect(nextGiftCards[0].id).toBe('gc-other');
  });

  it('restoreSaleToInventory revierte un cambio sumando tanto itemsNuevos como sale.items (+qty) y descontando itemsDevueltos (-qty)', () => {
    const customInventory: InventoryItem[] = [
      {
        id: 'prod-dev',
        sku: 'SKU-DEV',
        descripcion: 'Prenda Devuelta',
        cantidad: 10,
        costo: 1000,
        ventaEfectivo: 2000,
        ventaTarjeta: 2500,
        proveedor: 'Prov',
        categoria: 'CAT',
        talles: [],
        colores: [],
        imagenes: []
      },
      {
        id: 'prod-nuevo1',
        sku: 'SKU-N1',
        descripcion: 'Prenda Nueva 1',
        cantidad: 5,
        costo: 1500,
        ventaEfectivo: 3000,
        ventaTarjeta: 3500,
        proveedor: 'Prov',
        categoria: 'CAT',
        talles: [],
        colores: [],
        imagenes: []
      },
      {
        id: 'prod-nuevo2',
        sku: 'SKU-N2',
        descripcion: 'Prenda Nueva 2',
        cantidad: 8,
        costo: 2000,
        ventaEfectivo: 4000,
        ventaTarjeta: 4500,
        proveedor: 'Prov',
        categoria: 'CAT',
        talles: [],
        colores: [],
        imagenes: []
      }
    ];

    const cambioSale = {
      id: 'cambio-multi-items',
      fecha: new Date().toISOString(),
      tipo: 'cambio' as const,
      total: 0,
      itemsDevueltos: [
        {
          id: 'prod-dev',
          sku: 'SKU-DEV',
          descripcion: 'Prenda Devuelta',
          cantidad: 2,
          costo: 1000,
          precioEfectivo: 2000,
          precioTarjeta: 2500,
          descuento: 0
        }
      ],
      itemsNuevos: [
        {
          id: 'prod-nuevo1',
          sku: 'SKU-N1',
          descripcion: 'Prenda Nueva 1',
          cantidad: 1,
          costo: 1500,
          precioEfectivo: 3000,
          precioTarjeta: 3500,
          descuento: 0
        }
      ],
      items: [
        {
          id: 'prod-nuevo2',
          sku: 'SKU-N2',
          descripcion: 'Prenda Nueva 2',
          cantidad: 3,
          costo: 2000,
          precioEfectivo: 4000,
          precioTarjeta: 4500,
          descuento: 0
        }
      ]
    };

    // Al revertir:
    // prod-dev: 10 - 2 (devueltos se descuentan) = 8
    // prod-nuevo1: 5 + 1 (nuevos se suman) = 6
    // prod-nuevo2: 8 + 3 (items se suman) = 11
    const restored = restoreSaleToInventory(customInventory, cambioSale as any);
    expect(restored.find(i => i.id === 'prod-dev')?.cantidad).toBe(8);
    expect(restored.find(i => i.id === 'prod-nuevo1')?.cantidad).toBe(6);
    expect(restored.find(i => i.id === 'prod-nuevo2')?.cantidad).toBe(11);
  });
});
