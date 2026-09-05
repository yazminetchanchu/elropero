import { describe, it, expect } from 'vitest';
import { mergeEntities } from '../utils/mergeEntities';
import { Sale, GiftCard, InventoryItem, Expense } from '../types';

describe('mergeEntities - Resolución de Conflictos de Concurrencia', () => {
  it('conserva ventas remotas (web) y ventas locales cargadas simultáneamente', () => {
    const remoteWebSale: Sale = {
      id: 'sale-web-999',
      fecha: '2026-08-25T18:00:00.000Z',
      items: [{ id: 'prod-1', sku: 'SKU-1', descripcion: 'Remera Web', cantidad: 1, costo: 1000, precioEfectivo: 2000, precioTarjeta: 2500, descuento: 0 }],
      total: 2500,
      tipo: 'venta',
    };

    const existingSale: Sale = {
      id: 'sale-old-100',
      fecha: '2026-08-25T10:00:00.000Z',
      items: [{ id: 'prod-2', sku: 'SKU-2', descripcion: 'Pantalon', cantidad: 1, costo: 2000, precioEfectivo: 4000, precioTarjeta: 5000, descuento: 0 }],
      total: 4000,
      tipo: 'venta',
    };

    const newLocalSale: Sale = {
      id: 'sale-local-200',
      fecha: '2026-08-25T18:01:00.000Z',
      items: [{ id: 'prod-3', sku: 'SKU-3', descripcion: 'Camisa Local', cantidad: 1, costo: 1500, precioEfectivo: 3000, precioTarjeta: 3500, descuento: 0 }],
      total: 3000,
      tipo: 'venta',
    };

    // Servidor recibió la venta web
    const serverSales: Sale[] = [existingSale, remoteWebSale];

    // Local cargó la venta física sobre su estado previo (que aún no tenía la venta web)
    const localSales: Sale[] = [existingSale, newLocalSale];

    const merged = mergeEntities(localSales, serverSales);

    expect(merged).toHaveLength(3);
    expect(merged.map(s => s.id)).toEqual(expect.arrayContaining(['sale-old-100', 'sale-web-999', 'sale-local-200']));
  });

  it('actualiza una entidad si fue modificada localmente (mismo ID)', () => {
    const itemServer: InventoryItem = {
      id: 'prod-1',
      sku: 'SKU-1',
      descripcion: 'Remera',
      proveedor: 'Prov',
      cantidad: 5,
      costo: 1000,
      ventaEfectivo: 2000,
      ventaTarjeta: 2500,
      categoria: 'REMERAS',
      talles: [],
      colores: [],
      imagenes: [],
    };

    const itemLocalModificado: InventoryItem = {
      ...itemServer,
      cantidad: 4, // localmente se vendió 1
    };

    const merged = mergeEntities([itemLocalModificado], [itemServer]);

    expect(merged).toHaveLength(1);
    expect(merged[0].cantidad).toBe(4);
  });

  it('preserva Gift Cards remotas y locales concurrentes', () => {
    const serverGifts: GiftCard[] = [
      {
        id: 'gc-web-1',
        codigo: 'GIFT-WEB',
        destinatario: 'Cliente Web',
        montoInicial: 5000,
        saldo: 5000,
        estado: 'ACTIVA',
        fechaCreacion: '2026-08-25T18:00:00.000Z',
      },
    ];

    const localGifts: GiftCard[] = [
      {
        id: 'gc-local-2',
        codigo: 'GIFT-LOCAL',
        destinatario: 'Cliente Showroom',
        montoInicial: 3000,
        saldo: 3000,
        estado: 'ACTIVA',
        fechaCreacion: '2026-08-25T18:01:00.000Z',
      },
    ];

    const merged = mergeEntities(localGifts, serverGifts);
    expect(merged).toHaveLength(2);
    expect(merged.find(g => g.id === 'gc-web-1')).toBeDefined();
    expect(merged.find(g => g.id === 'gc-local-2')).toBeDefined();
  });

  it('maneja listas indefinidas o vacías sin errores', () => {
    const sampleExpense: Expense = {
      id: 'exp-1',
      fecha: '2026-08-25',
      monto: 1500,
      concepto: 'Insumos',
    };

    expect(mergeEntities(undefined as any, [sampleExpense])).toEqual([sampleExpense]);
    expect(mergeEntities([sampleExpense], undefined as any)).toEqual([sampleExpense]);
    expect(mergeEntities([], [])).toEqual([]);
  });

  describe('Bug #5 - Prevención de resurrección de eliminados y preservación de config web', () => {
    it('no resucita ítems eliminados localmente con isDeleted o deleted', () => {
      const serverItems: any[] = [
        { id: 'prod-1', descripcion: 'Vestido Negro', cantidad: 5 },
        { id: 'prod-2', descripcion: 'Pantalón Jean', cantidad: 3 }
      ];

      const localItems: any[] = [
        { id: 'prod-1', isDeleted: true, updatedAt: '2026-08-31T10:00:00Z' }
      ];

      const merged = mergeEntities(localItems, serverItems);
      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('prod-2');
    });

    it('ignora ítems eliminados en servidor marcados con deleted o deletedAt', () => {
      const serverItems: any[] = [
        { id: 'prod-1', descripcion: 'Remera Azul', deleted: true },
        { id: 'prod-2', descripcion: 'Remera Roja', deletedAt: '2026-08-31T09:00:00Z' },
        { id: 'prod-3', descripcion: 'Remera Blanca', cantidad: 4 }
      ];

      const localItems: any[] = [];

      const merged = mergeEntities(localItems, serverItems);
      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('prod-3');
    });

    it('resuelve conflictos respetando timestamps y preserva webDiscount', () => {
      const serverItem: any = {
        id: 'prod-1',
        descripcion: 'Blusa Seda',
        cantidad: 10,
        webDiscount: 15,
        updatedAt: '2026-08-31T08:00:00Z'
      };

      const localItem: any = {
        id: 'prod-1',
        descripcion: 'Blusa Seda Actualizada',
        cantidad: 8,
        updatedAt: '2026-08-31T10:00:00Z' // Más reciente
      };

      const merged = mergeEntities([localItem], [serverItem]);
      expect(merged).toHaveLength(1);
      expect(merged[0].descripcion).toBe('Blusa Seda Actualizada');
      expect(merged[0].cantidad).toBe(8);
      expect(merged[0].webDiscount).toBe(15); // Preserva webDiscount
    });
  });
});

