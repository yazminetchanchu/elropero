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
});
