import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryItem, Sale } from '../types';

const mockUpdateDoc = vi.fn();
let mockDocState: any = {};

const mockTransaction = {
  get: vi.fn(async () => ({
    exists: () => true,
    data: () => mockDocState
  })),
  update: vi.fn((_ref, payload) => {
    mockDocState = { ...mockDocState, ...payload };
  }),
  set: vi.fn(),
  delete: vi.fn()
};

const mockRunTransaction = vi.fn(async (_db, fn) => fn(mockTransaction));
const mockArrayUnion = vi.fn((item) => ({ _type: 'arrayUnion', item }));

vi.mock('../services/firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'mock-doc-ref'),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
  arrayUnion: (...args: any[]) => mockArrayUnion(...args),
  collection: vi.fn(() => 'mock-collection-ref'),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn()
}));

import { database } from '../services/storage';

describe('Storage Service - Operaciones Granulares y Transaccionales (Bug 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    mockDocState = {
      inventory: [
        { id: 'prod-1', sku: 'SKU-1', descripcion: 'Remera Negra', cantidad: 10, costo: 1000, ventaEfectivo: 2000, ventaTarjeta: 2500 },
        { id: 'prod-2', sku: 'SKU-2', descripcion: 'Pantalón Jean', cantidad: 5, costo: 3000, ventaEfectivo: 6000, ventaTarjeta: 7000 }
      ],
      sales: [],
      expenses: [{ id: 'exp-1', monto: 500, concepto: 'Luz', fecha: '2026-08-25' }],
      giftCards: [],
      closures: [],
      webSettings: { storeName: 'EL ROPERO' },
      lastSync: 1000
    };
  });

  describe('addInventoryItem', () => {
    it('agrega un ítem usando arrayUnion sin modificar ni reenviar toda la base de datos', async () => {
      const newItem: InventoryItem = {
        id: 'prod-3',
        sku: 'SKU-3',
        descripcion: 'Vestido Verano',
        cantidad: 8,
        costo: 2000,
        ventaEfectivo: 4000,
        ventaTarjeta: 4500,
        proveedor: 'Prov C',
        categoria: 'VESTIDOS',
        talles: [],
        colores: [],
        imagenes: []
      };

      await database.addInventoryItem(newItem);

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockUpdateDoc.mock.calls[0];
      expect(callArgs[0]).toBe('mock-doc-ref');
      expect(callArgs[1].inventory).toEqual({ _type: 'arrayUnion', item: newItem });
      expect(callArgs[1].lastSync).toBeDefined();
    });
  });

  describe('updateInventoryItem', () => {
    it('modifica solo el producto correspondiente en el inventario fresco del servidor', async () => {
      const updatedItem: InventoryItem = {
        id: 'prod-1',
        sku: 'SKU-1',
        descripcion: 'Remera Negra Modificada',
        cantidad: 15,
        costo: 1200,
        ventaEfectivo: 2200,
        ventaTarjeta: 2700,
        proveedor: 'Prov',
        categoria: 'REMERAS',
        talles: [],
        colores: [],
        imagenes: []
      };

      await database.updateInventoryItem(updatedItem);

      expect(mockRunTransaction).toHaveBeenCalled();
      expect(mockTransaction.update).toHaveBeenCalled();
      const updatedPayload = mockTransaction.update.mock.calls[0][1];
      expect(updatedPayload.inventory).toHaveLength(2);
      expect(updatedPayload.inventory.find((i: any) => i.id === 'prod-1')?.descripcion).toBe('Remera Negra Modificada');
      expect(updatedPayload.inventory.find((i: any) => i.id === 'prod-2')?.cantidad).toBe(5); // Sin pisar
    });
  });

  describe('deleteInventoryItem', () => {
    it('elimina el producto del servidor previniendo que resucite con mergeEntities', async () => {
      await database.deleteInventoryItem('prod-1');

      expect(mockRunTransaction).toHaveBeenCalled();
      const updatedPayload = mockTransaction.update.mock.calls[0][1];
      expect(updatedPayload.inventory).toHaveLength(1);
      expect(updatedPayload.inventory[0].id).toBe('prod-2');
    });
  });

  describe('recordSale (Transaccional)', () => {
    it('descuenta stock sobre el inventario fresco del servidor y añade la venta sin tocar gastos ni settings', async () => {
      const newSale: Sale = {
        id: 'sale-1',
        fecha: '2026-08-29T10:00:00Z',
        tipo: 'venta',
        items: [
          { id: 'prod-1', sku: 'SKU-1', descripcion: 'Remera Negra', cantidad: 2, costo: 1000, precioEfectivo: 2000, precioTarjeta: 2500, descuento: 0 }
        ],
        total: 4000,
        pago: { efectivo: 100, tarjeta: 0 }
      };

      await database.recordSale(newSale);

      expect(mockRunTransaction).toHaveBeenCalled();
      const updatedPayload = mockTransaction.update.mock.calls[0][1];

      // Stock descontado sobre servidor: prod-1 tenía 10, ahora 8
      const prod1 = updatedPayload.inventory.find((i: any) => i.id === 'prod-1');
      expect(prod1.cantidad).toBe(8);

      // Venta persistida en subcolección individual y agregada al buffer
      expect(mockTransaction.set).toHaveBeenCalled();
      expect(updatedPayload.sales).toHaveLength(1);
      expect(updatedPayload.sales[0].id).toBe('sale-1');

      // Campos no afectados
      expect(updatedPayload.expenses).toBeUndefined();
      expect(updatedPayload.webSettings).toBeUndefined();
      expect(updatedPayload.closures).toBeUndefined();
    });

    it('recorta el buffer del showroom a las últimas 50 ventas para evitar el límite de 1MB', async () => {
      // Poblar el showroom con 55 ventas existentes
      mockDocState.sales = Array.from({ length: 55 }, (_, i) => ({
        id: `old-sale-${i}`,
        fecha: '2026-08-01T10:00:00Z',
        total: 100
      }));

      const newSale: Sale = {
        id: 'sale-56',
        fecha: '2026-08-29T10:00:00Z',
        total: 500,
        items: []
      };

      await database.recordSale(newSale);

      const updatedPayload = mockTransaction.update.mock.calls[0][1];
      expect(updatedPayload.sales).toHaveLength(50);
      expect(updatedPayload.sales[49].id).toBe('sale-56');
    });

    it('soporta cambios devolviendo prendas devueltas y descontando prendas nuevas', async () => {
      const cambioSale: Sale = {
        id: 'sale-cambio-1',
        fecha: '2026-08-29T10:00:00Z',
        tipo: 'cambio',
        itemsDevueltos: [
          { id: 'prod-2', sku: 'SKU-2', descripcion: 'Pantalón Jean', cantidad: 1, costo: 3000, precioEfectivo: 6000, precioTarjeta: 7000, descuento: 0 }
        ],
        itemsNuevos: [
          { id: 'prod-1', sku: 'SKU-1', descripcion: 'Remera Negra', cantidad: 1, costo: 1000, precioEfectivo: 2000, precioTarjeta: 2500, descuento: 0 }
        ],
        total: 0,
        diferencia: 0
      };

      await database.recordSale(cambioSale);

      const updatedPayload = mockTransaction.update.mock.calls[0][1];
      // prod-1 pasa de 10 a 9 (descuento nueva)
      expect(updatedPayload.inventory.find((i: any) => i.id === 'prod-1')?.cantidad).toBe(9);
      // prod-2 pasa de 5 a 6 (devolución al stock)
      expect(updatedPayload.inventory.find((i: any) => i.id === 'prod-2')?.cantidad).toBe(6);
    });
  });

  describe('deleteSale', () => {
    it('restaura el stock de los productos vendidos y remueve la venta estándar', async () => {
      mockDocState.sales = [
        {
          id: 'sale-to-delete',
          tipo: 'venta',
          items: [{ id: 'prod-1', sku: 'SKU-1', descripcion: 'Remera Negra', cantidad: 3, costo: 1000, precioEfectivo: 2000, precioTarjeta: 2500, descuento: 0 }],
          total: 6000
        }
      ];

      await database.deleteSale('sale-to-delete');

      const updatedPayload = mockTransaction.update.mock.calls[0][1];
      // Stock restaurado: prod-1 tenía 10, ahora 13
      expect(updatedPayload.inventory.find((i: any) => i.id === 'prod-1')?.cantidad).toBe(13);
      expect(updatedPayload.sales).toHaveLength(0);
      expect(mockTransaction.delete).toHaveBeenCalled();
    });

    it('revierte correctamente un cambio (descuenta devueltos, devuelve nuevos y elimina gift card generada)', async () => {
      mockDocState.inventory = [
        { id: 'prod-1', sku: 'SKU-1', descripcion: 'Remera Negra', cantidad: 10, costo: 1000, precioEfectivo: 2000, precioTarjeta: 2500 },
        { id: 'prod-2', sku: 'SKU-2', descripcion: 'Pantalón Azul', cantidad: 5, costo: 2000, precioEfectivo: 4000, precioTarjeta: 4500 }
      ];
      mockDocState.giftCards = [
        {
          id: 'gc-generated-999',
          codigo: 'GIFT-AUTO',
          destinatario: 'Cliente Cambio',
          montoInicial: 1000,
          saldo: 1000,
          estado: 'ACTIVA',
          fechaCreacion: '2026-01-01'
        },
        {
          id: 'gc-used-123',
          codigo: 'GIFT-USED',
          destinatario: 'Cliente Regular',
          montoInicial: 2000,
          saldo: 500,
          estado: 'ACTIVA',
          fechaCreacion: '2026-01-01'
        }
      ];
      mockDocState.sales = [
        {
          id: 'sale-cambio-delete',
          tipo: 'cambio',
          total: 0,
          diferencia: -1000,
          giftCardGeneradaId: 'gc-generated-999',
          giftCardUsada: {
            codigo: 'GIFT-USED',
            montoUsado: 1500
          },
          items: [],
          itemsDevueltos: [{ id: 'prod-1', sku: 'SKU-1', descripcion: 'Remera Negra', cantidad: 2, costo: 1000, precioEfectivo: 2000, precioTarjeta: 2500, descuento: 0 }],
          itemsNuevos: [{ id: 'prod-2', sku: 'SKU-2', descripcion: 'Pantalón Azul', cantidad: 1, costo: 2000, precioEfectivo: 4000, precioTarjeta: 4500, descuento: 0 }]
        }
      ];

      await database.deleteSale('sale-cambio-delete');

      const updatedPayload = mockTransaction.update.mock.calls[0][1];
      // prod-1 (devuelto en cambio anterior +2) ahora al revertir se le descuenta 2: 10 - 2 = 8
      expect(updatedPayload.inventory.find((i: any) => i.id === 'prod-1')?.cantidad).toBe(8);
      // prod-2 (nuevo entregado en cambio -1) ahora al revertir se le devuelve 1: 5 + 1 = 6
      expect(updatedPayload.inventory.find((i: any) => i.id === 'prod-2')?.cantidad).toBe(6);
      
      // La Gift Card generada por el cambio se eliminó
      expect(updatedPayload.giftCards.find((gc: any) => gc.id === 'gc-generated-999')).toBeUndefined();
      
      // La Gift Card usada recuperó su saldo (+1500 => 500 + 1500 = 2000)
      const usedGc = updatedPayload.giftCards.find((gc: any) => gc.codigo === 'GIFT-USED');
      expect(usedGc?.saldo).toBe(2000);
      expect(usedGc?.estado).toBe('ACTIVA');

      expect(updatedPayload.sales).toHaveLength(0);
      expect(mockTransaction.delete).toHaveBeenCalled();
    });
  });

  describe('Control de conectividad offline (Bug 8)', () => {
    it('rechaza las operaciones si no hay conexión a internet para evitar inconsistencias', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

      await expect(database.addInventoryItem({ id: 'p' } as any)).rejects.toThrow('Offline');
      await expect(database.updateInventoryItem({ id: 'p' } as any)).rejects.toThrow('Offline');
      await expect(database.deleteInventoryItem('p')).rejects.toThrow('Offline');
      await expect(database.recordSale({ id: 's' } as any)).rejects.toThrow('Offline');
      await expect(database.deleteSale('s')).rejects.toThrow('Offline');
      await expect(database.addExpense({ id: 'e' } as any)).rejects.toThrow('Offline');
    });
  });
});
