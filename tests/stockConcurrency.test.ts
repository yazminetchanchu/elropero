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
        { productId: 'prod-v', descripcion: 'Remera', sku: 'SKU-V', cantidad: 3, talle: 'S', color: 'BLANCO' },
      ])
    ).not.toThrow();
  });

  it('lanza error si la variante esta agotada en el momento del cobro', () => {
    expect(() =>
      verifyStock(sampleInventory, [
        { productId: 'prod-v', descripcion: 'Remera Negra S', sku: 'SKU-V', cantidad: 1, talle: 'S', color: 'NEGRO' },
      ])
    ).toThrow(/No hay stock suficiente/);
  });

  it('lanza error si el producto fue eliminado del catalogo', () => {
    expect(() =>
      verifyStock(sampleInventory, [
        { productId: 'prod-borrado', descripcion: 'Producto Inexistente', sku: 'XXX', cantidad: 1 },
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
          isVirtualGiftCard: true,
        },
      ])
    ).not.toThrow();
  });

  it('lanza error si se excede el stock de coloresStock', () => {
    expect(() =>
      verifyStock(sampleInventory, [
        { productId: 'prod-c', descripcion: 'Pantalon Jean Azul', sku: 'SKU-C', cantidad: 5, color: 'AZUL' },
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
});
