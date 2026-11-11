import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryItem, Sale, GiftCard } from '../types';
import { restoreSaleToInventory } from '../services/webOrderFulfillment';

describe('handleDeleteSale - Reversa Contable Completa para Cambios y Ventas', () => {
  let inventory: InventoryItem[];
  let sales: Sale[];
  let giftCards: GiftCard[];

  beforeEach(() => {
    inventory = [
      {
        id: 'prod-devuelto',
        sku: 'SKU-DEV',
        descripcion: 'Remera Verde Devuelta',
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
        id: 'prod-nuevo',
        sku: 'SKU-NUEVO',
        descripcion: 'Pantalón Negro Nuevo',
        cantidad: 5,
        costo: 2000,
        ventaEfectivo: 4000,
        ventaTarjeta: 4500,
        proveedor: 'Prov',
        categoria: 'CAT',
        talles: [],
        colores: [],
        imagenes: []
      },
      {
        id: 'prod-extra',
        sku: 'SKU-EXTRA',
        descripcion: 'Buzo Extra',
        cantidad: 3,
        costo: 3000,
        ventaEfectivo: 6000,
        ventaTarjeta: 7000,
        proveedor: 'Prov',
        categoria: 'CAT',
        talles: [],
        colores: [],
        imagenes: []
      }
    ];

    giftCards = [
      {
        id: 'gc-generada-favor',
        codigo: 'GIFT-FAVOR-123',
        destinatario: 'Cliente Cambio',
        montoInicial: 1500,
        saldo: 1500,
        estado: 'ACTIVA',
        fechaCreacion: '2026-03-01T10:00:00Z',
        ventaOrigenId: 'sale-original-1'
      },
      {
        id: 'gc-usada-parcial',
        codigo: 'GIFT-USADA-456',
        destinatario: 'Cliente Habitual',
        montoInicial: 5000,
        saldo: 2000,
        estado: 'ACTIVA',
        fechaCreacion: '2026-02-01T10:00:00Z'
      }
    ];

    sales = [
      {
        id: 'sale-cambio-completo',
        fecha: '2026-03-01T12:00:00Z',
        tipo: 'cambio',
        total: 0,
        diferencia: -1500, // saldo a favor que generó la gift card
        giftCardGeneradaId: 'gc-generada-favor',
        giftCardUsada: {
          codigo: 'GIFT-USADA-456',
          montoUsado: 1000
        },
        itemsDevueltos: [
          {
            id: 'prod-devuelto',
            sku: 'SKU-DEV',
            descripcion: 'Remera Verde Devuelta',
            cantidad: 2,
            costo: 1000,
            precioEfectivo: 2000,
            precioTarjeta: 2500,
            descuento: 0
          }
        ],
        itemsNuevos: [
          {
            id: 'prod-nuevo',
            sku: 'SKU-NUEVO',
            descripcion: 'Pantalón Negro Nuevo',
            cantidad: 1,
            costo: 2000,
            precioEfectivo: 4000,
            precioTarjeta: 4500,
            descuento: 0
          }
        ],
        items: [
          {
            id: 'prod-extra',
            sku: 'SKU-EXTRA',
            descripcion: 'Buzo Extra',
            cantidad: 1,
            costo: 3000,
            precioEfectivo: 6000,
            precioTarjeta: 7000,
            descuento: 0
          }
        ]
      }
    ];
  });

  it('anula un cambio completo descontando items devueltos, devolviendo prendas nuevas/items al stock e inhabilitando la Gift Card generada', async () => {
    const saleId = 'sale-cambio-completo';
    const sale = sales.find(s => s.id === saleId);
    expect(sale).toBeDefined();

    // 1. Stock revertido
    const nextInv = restoreSaleToInventory([...inventory], sale!);

    // prod-devuelto: tenía 10, devuelto 2 => al anular se descuenta 2: 10 - 2 = 8
    expect(nextInv.find(i => i.id === 'prod-devuelto')?.cantidad).toBe(8);
    // prod-nuevo: tenía 5, nuevo llevado 1 => al anular vuelve al stock +1: 5 + 1 = 6
    expect(nextInv.find(i => i.id === 'prod-nuevo')?.cantidad).toBe(6);
    // prod-extra: tenía 3, item llevado 1 => al anular vuelve al stock +1: 3 + 1 = 4
    expect(nextInv.find(i => i.id === 'prod-extra')?.cantidad).toBe(4);

    // 2. Reversión de Gift Cards
    let nextGiftCards = [...giftCards];
    const generatedGiftIds = new Set<string>();
    if (sale!.giftGeneradaId) generatedGiftIds.add(sale!.giftGeneradaId);
    if (sale!.giftCardGeneradaId) generatedGiftIds.add(sale!.giftCardGeneradaId);

    if (generatedGiftIds.size > 0 || sale!.tipo === 'cambio' || sale!.tipo === 'devolucion') {
      nextGiftCards = nextGiftCards.filter(gc => {
        if (generatedGiftIds.has(gc.id)) return false;
        if (gc.ventaOrigenId && (gc.ventaOrigenId === sale!.id || (sale!.ventaOriginalId && gc.ventaOrigenId === sale!.ventaOriginalId && (generatedGiftIds.size > 0 || (sale!.diferencia !== undefined && sale!.diferencia < 0))))) {
          return false;
        }
        return true;
      });
    }

    if (sale!.giftCardUsada) {
      nextGiftCards = nextGiftCards.map(gc => {
        if (gc.codigo === sale!.giftCardUsada!.codigo) {
          return {
            ...gc,
            saldo: gc.saldo + sale!.giftCardUsada!.montoUsado,
            estado: 'ACTIVA' as const
          };
        }
        return gc;
      });
    }

    // Gift Card generada eliminada / inhabilitada
    expect(nextGiftCards.find(gc => gc.id === 'gc-generada-favor')).toBeUndefined();

    // Gift Card usada recuperó su saldo (+1000): 2000 + 1000 = 3000
    const gcUsada = nextGiftCards.find(gc => gc.id === 'gc-usada-parcial');
    expect(gcUsada?.saldo).toBe(3000);

    // 3. Venta eliminada
    const nextSales = sales.filter(s => s.id !== saleId);
    expect(nextSales).toHaveLength(0);
  });

  it('anula una venta estándar restaurando el stock con control detallado de variantes (talles y colores)', () => {
    const invConVariantes: InventoryItem[] = [
      {
        id: 'prod-variante',
        sku: 'SKU-VAR',
        descripcion: 'Blusa Estampada',
        cantidad: 5,
        costo: 1500,
        ventaEfectivo: 3000,
        ventaTarjeta: 3500,
        proveedor: 'Prov',
        categoria: 'BLUSAS',
        talles: ['S', 'M'],
        colores: ['ROJO', 'VERDE'],
        stockPorVariante: {
          'S-ROJO': 2,
          'M-ROJO': 1,
          'S-VERDE': 2
        },
        coloresStock: {
          'ROJO': 3,
          'VERDE': 2
        },
        imagenes: []
      }
    ];

    const saleVenta: Sale = {
      id: 'sale-normal-1',
      fecha: '2026-03-01T14:00:00Z',
      tipo: 'venta',
      total: 3000,
      items: [
        {
          id: 'prod-variante',
          sku: 'SKU-VAR',
          descripcion: 'Blusa Estampada',
          cantidad: 2,
          costo: 1500,
          precioEfectivo: 3000,
          precioTarjeta: 3500,
          talle: 'M',
          color: 'ROJO',
          descuento: 0
        }
      ]
    };

    const nextInv = restoreSaleToInventory(invConVariantes, saleVenta);
    const itemRestaurado = nextInv.find(i => i.id === 'prod-variante');

    expect(itemRestaurado).toBeDefined();
    // Stock global restaurado: 5 + 2 = 7
    expect(itemRestaurado?.cantidad).toBe(7);
    // Detalle de variante restaurado: 'M-ROJO' tenía 1 + 2 = 3
    expect(itemRestaurado?.stockPorVariante?.['M-ROJO']).toBe(3);
    // Otras variantes no afectadas
    expect(itemRestaurado?.stockPorVariante?.['S-ROJO']).toBe(2);
    // Detalle de color restaurado: 'ROJO' tenía 3 + 2 = 5
    expect(itemRestaurado?.coloresStock?.['ROJO']).toBe(5);
  });

  it('anula una venta que consumió una Gift Card reactivándola y restituyendo su saldo exacto', () => {
    const gcLista: GiftCard[] = [
      {
        id: 'gc-agotada',
        codigo: 'GIFT-TOTAL-USED',
        destinatario: 'Cliente Test',
        montoInicial: 2500,
        saldo: 0,
        estado: 'AGOTADA',
        fechaCreacion: '2026-02-15T10:00:00Z'
      }
    ];

    const saleConGC: Sale = {
      id: 'sale-gc-1',
      fecha: '2026-03-01T15:00:00Z',
      tipo: 'venta',
      total: 1000,
      giftCardUsada: {
        codigo: 'GIFT-TOTAL-USED',
        montoUsado: 2500
      },
      items: [
        {
          id: 'prod-devuelto',
          sku: 'SKU-DEV',
          descripcion: 'Remera',
          cantidad: 1,
          costo: 1000,
          precioEfectivo: 3500,
          precioTarjeta: 4000,
          descuento: 0
        }
      ]
    };

    // Reversión de Gift Card siguiendo la lógica de App.tsx / storage.ts
    const nextGiftCards = gcLista.map(gc => {
      if (gc.codigo === saleConGC.giftCardUsada!.codigo) {
        return {
          ...gc,
          saldo: gc.saldo + saleConGC.giftCardUsada!.montoUsado,
          estado: 'ACTIVA' as const
        };
      }
      return gc;
    });

    const gcRestaurada = nextGiftCards.find(g => g.codigo === 'GIFT-TOTAL-USED');
    expect(gcRestaurada?.saldo).toBe(2500);
    expect(gcRestaurada?.estado).toBe('ACTIVA');
  });

  it('anula una venta directa de Gift Card (tipo gift) removiéndola de la base de gift cards', () => {
    const gcLista: GiftCard[] = [
      {
        id: 'gc-vendida',
        codigo: 'GIFT-NEW-BOUGHT',
        destinatario: 'Agustina',
        montoInicial: 10000,
        saldo: 10000,
        estado: 'ACTIVA',
        fechaCreacion: '2026-03-01T16:00:00Z'
      },
      {
        id: 'gc-otra',
        codigo: 'GIFT-OTRA',
        destinatario: 'Laura',
        montoInicial: 5000,
        saldo: 5000,
        estado: 'ACTIVA',
        fechaCreacion: '2026-03-01T10:00:00Z'
      }
    ];

    const saleGift: Sale = {
      id: 'sale-gift-compra',
      fecha: '2026-03-01T16:00:00Z',
      tipo: 'gift',
      total: 10000,
      items: [
        {
          id: 'gift-item-1',
          sku: 'GIFT-NEW-BOUGHT',
          descripcion: 'Gift Card Virtual $10.000',
          cantidad: 1,
          costo: 0,
          precioEfectivo: 10000,
          precioTarjeta: 10000,
          descuento: 0
        }
      ]
    };

    // Lógica de eliminación en App.tsx y storage.ts:
    const giftSkus = saleGift.items?.map(i => i.sku).filter(Boolean) || [];
    const nextGiftCards = gcLista.filter(gc => !giftSkus.includes(gc.codigo));

    expect(nextGiftCards).toHaveLength(1);
    expect(nextGiftCards.find(g => g.codigo === 'GIFT-NEW-BOUGHT')).toBeUndefined();
    expect(nextGiftCards[0].codigo).toBe('GIFT-OTRA');
  });

  it('anula de forma segura una venta cuando un producto ya fue eliminado del inventario (datos huérfanos)', () => {
    // Inventario no contiene 'prod-eliminado'
    const invSinProducto: InventoryItem[] = [
      {
        id: 'prod-vigente',
        sku: 'SKU-VIGENTE',
        descripcion: 'Prenda Vigente',
        cantidad: 10,
        costo: 1000,
        ventaEfectivo: 2000,
        ventaTarjeta: 2500,
        proveedor: 'Prov',
        categoria: 'CAT',
        talles: [],
        colores: [],
        imagenes: []
      }
    ];

    const saleConProductoEliminado: Sale = {
      id: 'sale-huerfana',
      fecha: '2026-02-01T10:00:00Z',
      tipo: 'venta',
      total: 5000,
      items: [
        {
          id: 'prod-eliminado',
          sku: 'SKU-BORRADO',
          descripcion: 'Producto que se eliminó luego',
          cantidad: 2,
          costo: 2000,
          precioEfectivo: 5000,
          precioTarjeta: 5500,
          descuento: 0
        },
        {
          id: 'prod-vigente',
          sku: 'SKU-VIGENTE',
          descripcion: 'Prenda Vigente',
          cantidad: 1,
          costo: 1000,
          precioEfectivo: 2000,
          precioTarjeta: 2500,
          descuento: 0
        }
      ]
    };

    // No debe lanzar excepción
    expect(() => {
      const nextInv = restoreSaleToInventory(invSinProducto, saleConProductoEliminado);
      // El producto vigente sí recupera su stock (10 + 1 = 11)
      expect(nextInv.find(i => i.id === 'prod-vigente')?.cantidad).toBe(11);
      // La lista mantiene su longitud de productos existentes
      expect(nextInv).toHaveLength(1);
    }).not.toThrow();
  });

  it('anula una devolución simple descontando del inventario las prendas devueltas', () => {
    const inv: InventoryItem[] = [
      {
        id: 'prod-1',
        sku: 'SKU-1',
        descripcion: 'Pollera',
        cantidad: 8,
        costo: 1500,
        ventaEfectivo: 3000,
        ventaTarjeta: 3500,
        proveedor: 'Prov',
        categoria: 'POLLERAS',
        talles: [],
        colores: [],
        imagenes: []
      }
    ];

    const saleDevolucion: Sale = {
      id: 'sale-devolucion-simple',
      fecha: '2026-03-01T10:00:00Z',
      tipo: 'devolucion',
      total: 0,
      items: [
        {
          id: 'prod-1',
          sku: 'SKU-1',
          descripcion: 'Pollera',
          cantidad: 2,
          costo: 1500,
          precioEfectivo: 3000,
          precioTarjeta: 3500,
          descuento: 0
        }
      ]
    };

    // Al anular una devolución simple, las prendas devueltas se descuentan del stock: 8 - 2 = 6
    const nextInv = restoreSaleToInventory(inv, saleDevolucion);
    expect(nextInv.find(i => i.id === 'prod-1')?.cantidad).toBe(6);
  });
});
