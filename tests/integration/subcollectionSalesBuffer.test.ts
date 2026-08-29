import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryItem, Sale } from '../../types';

let mockShowroomDoc: any = {};
let mockSubcollectionSales: Record<string, any> = {};

const createMockTransaction = () => {
  const showroomId = database.getShowroomID();
  const showroomPath = `showrooms/${showroomId}`;
  const salesPrefix = `showrooms/${showroomId}/sales/`;

  return {
    get: vi.fn(async (ref: any) => {
      const path = typeof ref === 'string' ? ref : ref.path;
      if (path === showroomPath) {
        return {
          exists: () => true,
          data: () => JSON.parse(JSON.stringify(mockShowroomDoc))
        };
      }
      if (path.startsWith(salesPrefix)) {
        const saleId = path.substring(salesPrefix.length);
        const data = mockSubcollectionSales[saleId];
        return {
          exists: () => !!data,
          data: () => (data ? JSON.parse(JSON.stringify(data)) : null)
        };
      }
      return { exists: () => false, data: () => null };
    }),
    set: vi.fn((ref: any, data: any) => {
      const path = typeof ref === 'string' ? ref : ref.path;
      if (path.startsWith(salesPrefix)) {
        const saleId = path.substring(salesPrefix.length);
        mockSubcollectionSales[saleId] = JSON.parse(JSON.stringify(data));
      }
    }),
    update: vi.fn((ref: any, payload: any) => {
      const path = typeof ref === 'string' ? ref : ref.path;
      if (path === showroomPath) {
        mockShowroomDoc = { ...mockShowroomDoc, ...payload };
      }
    }),
    delete: vi.fn((ref: any) => {
      const path = typeof ref === 'string' ? ref : ref.path;
      if (path.startsWith(salesPrefix)) {
        const saleId = path.substring(salesPrefix.length);
        delete mockSubcollectionSales[saleId];
      }
    })
  };
};

vi.mock('../../services/firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: any, ...segments: string[]) => {
    return { path: segments.join('/') };
  }),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(async (_db: any, callback: any) => {
    const tx = createMockTransaction();
    return await callback(tx);
  }),
  arrayUnion: vi.fn((item: any) => ({ _type: 'arrayUnion', item })),
  collection: vi.fn((_db: any, ...segments: string[]) => ({ path: segments.join('/') })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn()
}));

import { database } from '../../services/storage';

describe('Suite 3: Integration Tests - Buffer de Ventas en Subcolección (subcollectionSalesBuffer.test.ts)', () => {
  const initialStock = 1000;
  const sampleProduct: InventoryItem = {
    id: 'prod-buffer-1',
    sku: 'SKU-BUF-1',
    descripcion: 'Pantalón Cargo',
    categoria: 'PANTALONES',
    cantidad: initialStock,
    costo: 3000,
    ventaEfectivo: 6000,
    ventaTarjeta: 7000,
    proveedor: 'Fabrica Central',
    talles: [],
    colores: [],
    imagenes: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    mockShowroomDoc = {
      inventory: [{ ...sampleProduct }],
      sales: [],
      giftCards: [],
      expenses: [],
      closures: [],
      webSettings: { storeName: 'EL ROPERO' },
      lastSync: 1000
    };
    mockSubcollectionSales = {};
  });

  it('inserta 55 ventas y verifica que el documento raíz mantenga exactamente 50 mientras la subcolección almacena las 55', async () => {
    // 1. Insertar 55 ventas sucesivamente
    for (let i = 1; i <= 55; i++) {
      const sale: Sale = {
        id: `sale-${i}`,
        fecha: new Date(Date.now() + i * 1000).toISOString(),
        tipo: 'venta',
        items: [
          {
            id: 'prod-buffer-1',
            sku: 'SKU-BUF-1',
            descripcion: 'Pantalón Cargo',
            cantidad: 1,
            costo: 3000,
            precioEfectivo: 6000,
            precioTarjeta: 7000,
            descuento: 0
          }
        ],
        total: 6000,
        pago: { efectivo: 100, tarjeta: 0 }
      };

      await database.recordSale(sale);
    }

    // 2. Comprobar documento raíz: debe mantener estrictamente las últimas 50 ventas (evitando exceder 1MB)
    expect(mockShowroomDoc.sales).toBeDefined();
    expect(mockShowroomDoc.sales).toHaveLength(50);

    // Las primeras 5 ventas (sale-1 a sale-5) deben haber sido desplazadas del array raíz
    const rootSaleIds = mockShowroomDoc.sales.map((s: Sale) => s.id);
    expect(rootSaleIds).not.toContain('sale-1');
    expect(rootSaleIds).not.toContain('sale-2');
    expect(rootSaleIds).not.toContain('sale-3');
    expect(rootSaleIds).not.toContain('sale-4');
    expect(rootSaleIds).not.toContain('sale-5');

    // La posición 0 del buffer raíz debe ser la venta 6
    expect(rootSaleIds[0]).toBe('sale-6');
    // La última posición del buffer raíz debe ser la venta 55
    expect(rootSaleIds[49]).toBe('sale-55');

    // 3. Comprobar la subcolección individual de Firestore: debe conservar las 55 ventas sin pérdida
    const subcollectionKeys = Object.keys(mockSubcollectionSales);
    expect(subcollectionKeys).toHaveLength(55);
    for (let i = 1; i <= 55; i++) {
      expect(mockSubcollectionSales[`sale-${i}`]).toBeDefined();
      expect(mockSubcollectionSales[`sale-${i}`].id).toBe(`sale-${i}`);
    }

    // 4. Comprobar el stock descontado en el documento raíz (1000 - 55 = 945)
    const currentStock = mockShowroomDoc.inventory.find((p: any) => p.id === 'prod-buffer-1')?.cantidad;
    expect(currentStock).toBe(initialStock - 55);
  });

  it('anula (deleteSale) con éxito una venta histórica antigua que solo reside en la subcolección', async () => {
    // 1. Poblamos 55 ventas
    for (let i = 1; i <= 55; i++) {
      const sale: Sale = {
        id: `sale-${i}`,
        fecha: new Date(Date.now() + i * 1000).toISOString(),
        tipo: 'venta',
        items: [
          {
            id: 'prod-buffer-1',
            sku: 'SKU-BUF-1',
            descripcion: 'Pantalón Cargo',
            cantidad: 1,
            costo: 3000,
            precioEfectivo: 6000,
            precioTarjeta: 7000,
            descuento: 0
          }
        ],
        total: 6000,
        pago: { efectivo: 100, tarjeta: 0 }
      };
      await database.recordSale(sale);
    }

    // Confirmamos que sale-1 no está en el array del documento raíz
    expect(mockShowroomDoc.sales.find((s: Sale) => s.id === 'sale-1')).toBeUndefined();
    // Y que sí existe en la subcolección
    expect(mockSubcollectionSales['sale-1']).toBeDefined();

    const stockBeforeDelete = mockShowroomDoc.inventory.find((p: any) => p.id === 'prod-buffer-1')?.cantidad;
    expect(stockBeforeDelete).toBe(945);

    // 2. Ejecutar la anulación de la venta histórica 'sale-1'
    await database.deleteSale('sale-1');

    // 3. Verificaciones de la anulación histórica:
    // a) El ítem vendido en sale-1 debe ser reintegrado al stock del showroom (945 + 1 = 946)
    const stockAfterDelete = mockShowroomDoc.inventory.find((p: any) => p.id === 'prod-buffer-1')?.cantidad;
    expect(stockAfterDelete).toBe(946);

    // b) El documento individual de la subcolección debe haber sido eliminado
    expect(mockSubcollectionSales['sale-1']).toBeUndefined();
    expect(Object.keys(mockSubcollectionSales)).toHaveLength(54);

    // c) El buffer del documento raíz sigue con 50 ventas (no sufrió corrupción)
    expect(mockShowroomDoc.sales).toHaveLength(50);
  });

  it('anula una venta reciente presente tanto en el buffer del documento raíz como en la subcolección', async () => {
    // Insertamos 3 ventas
    for (let i = 1; i <= 3; i++) {
      await database.recordSale({
        id: `sale-recent-${i}`,
        fecha: new Date().toISOString(),
        tipo: 'venta',
        items: [
          {
            id: 'prod-buffer-1',
            sku: 'SKU-BUF-1',
            descripcion: 'Pantalón Cargo',
            cantidad: 2,
            costo: 3000,
            precioEfectivo: 6000,
            precioTarjeta: 7000,
            descuento: 0
          }
        ],
        total: 12000,
        pago: { efectivo: 100, tarjeta: 0 }
      });
    }

    // Stock: 1000 - 6 = 994
    expect(mockShowroomDoc.inventory.find((p: any) => p.id === 'prod-buffer-1')?.cantidad).toBe(994);
    expect(mockShowroomDoc.sales).toHaveLength(3);
    expect(mockSubcollectionSales['sale-recent-2']).toBeDefined();

    // Eliminar la venta reciente 'sale-recent-2'
    await database.deleteSale('sale-recent-2');

    // Debe restaurar 2 unidades: 994 + 2 = 996
    expect(mockShowroomDoc.inventory.find((p: any) => p.id === 'prod-buffer-1')?.cantidad).toBe(996);
    // Debe ser removida del buffer raíz (quedan 2 ventas)
    expect(mockShowroomDoc.sales).toHaveLength(2);
    expect(mockShowroomDoc.sales.find((s: Sale) => s.id === 'sale-recent-2')).toBeUndefined();
    // Y debe ser removida de la subcolección
    expect(mockSubcollectionSales['sale-recent-2']).toBeUndefined();
  });
});
