import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fulfillWebCambio, WebCambioPayload } from './webCambioFulfillment';
import { DatabaseState, InventoryItem, Sale, SaleItem } from '../types';

const mockRunTransaction = vi.fn();
const mockDoc = vi.fn((_db, ...pathSegments) => pathSegments.join('/'));

vi.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => mockDoc(...args),
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
}));

vi.mock('./firebase', () => ({
  db: {},
}));

describe('webCambioFulfillment Service - Gestión de Cambios Web', () => {
  const itemRemera: InventoryItem = {
    id: 'prod-remera',
    sku: 'SKU-REM',
    descripcion: 'REMERA NEGRA',
    proveedor: 'SKY',
    cantidad: 5,
    costo: 1000,
    ventaEfectivo: 2000,
    ventaTarjeta: 3000,
    categoria: 'REMERAS',
    talles: ['S', 'M'],
    colores: ['NEGRO'],
    imagenes: [],
    stockPorVariante: {
      'S-NEGRO': 3,
      'M-NEGRO': 2,
    },
  };

  const itemJean: InventoryItem = {
    id: 'prod-jean',
    sku: 'SKU-JEAN',
    descripcion: 'PANTALON JEAN AZUL',
    proveedor: 'SKY',
    cantidad: 2,
    costo: 3000,
    ventaEfectivo: 6000,
    ventaTarjeta: 7000,
    categoria: 'JEANS',
    talles: ['38'],
    colores: ['AZUL'],
    imagenes: [],
    stockPorVariante: {
      '38-AZUL': 2,
    },
  };

  const originalSale: Sale = {
    id: 'sale-orig-123',
    fecha: new Date(Date.now() - 2 * 86400000).toISOString(), // hace 2 días
    tipo: 'venta',
    items: [
      {
        id: 'prod-remera',
        sku: 'SKU-REM',
        descripcion: 'REMERA NEGRA (T:S C:NEGRO)',
        cantidad: 1,
        costo: 1000,
        precioEfectivo: 2000,
        precioTarjeta: 3000,
        descuento: 0,
        talle: 'S',
        color: 'NEGRO',
      },
    ],
    total: 2000,
    pago: { efectivo: 100, tarjeta: 0 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza un error si no se selecciona ninguna prenda a devolver', async () => {
    const payload: WebCambioPayload = {
      ventaOriginalId: 'sale-orig-123',
      itemsDevueltos: [],
      itemsNuevos: [],
      diferencia: 0,
    };

    await expect(fulfillWebCambio('ROPERO', payload)).rejects.toThrow(
      'Debés seleccionar al menos una prenda a devolver.'
    );
  });

  it('lanza un error si no se encuentra la venta original en caja', async () => {
    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [itemRemera],
            sales: [],
          }),
        }),
      };
      return await transactionCb(transaction);
    });

    const payload: WebCambioPayload = {
      ventaOriginalId: 'sale-inexistente',
      itemsDevueltos: [originalSale.items[0]],
      itemsNuevos: [],
      diferencia: 0,
    };

    await expect(fulfillWebCambio('ROPERO', payload)).rejects.toThrow(
      'No se encontró la venta original en caja.'
    );
  });

  it('lanza un error si han pasado más de 15 días desde la compra original', async () => {
    const saleAntigua: Sale = {
      ...originalSale,
      fecha: new Date(Date.now() - 20 * 86400000).toISOString(), // hace 20 días
    };

    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [itemRemera],
            sales: [saleAntigua],
          }),
        }),
      };
      return await transactionCb(transaction);
    });

    const payload: WebCambioPayload = {
      ventaOriginalId: saleAntigua.id,
      itemsDevueltos: [saleAntigua.items[0]],
      itemsNuevos: [],
      diferencia: 0,
    };

    await expect(fulfillWebCambio('ROPERO', payload)).rejects.toThrow(
      'Ya han pasado 15 días desde la compra.'
    );
  });

  it('procesa exitosamente un cambio devolviendo prenda y entregando una nueva', async () => {
    let updatedData: any = null;

    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [JSON.parse(JSON.stringify(itemRemera)), JSON.parse(JSON.stringify(itemJean))],
            sales: [originalSale],
            giftCards: [],
          }),
        }),
        update: vi.fn((_ref, data) => {
          updatedData = data;
        }),
      };
      return await transactionCb(transaction);
    });

    const newItem: SaleItem = {
      id: 'prod-jean',
      sku: 'SKU-JEAN',
      descripcion: 'PANTALON JEAN AZUL (T:38 C:AZUL)',
      cantidad: 1,
      costo: 3000,
      precioEfectivo: 6000,
      precioTarjeta: 7000,
      descuento: 0,
      talle: '38',
      color: 'AZUL',
    };

    const payload: WebCambioPayload = {
      ventaOriginalId: originalSale.id,
      itemsDevueltos: [originalSale.items[0]], // Remera devuelta
      itemsNuevos: [newItem],                 // Jean llevado
      diferencia: 4000,                       // 6000 - 2000
      customerNombre: 'Lucía Fernández',
    };

    const result = await fulfillWebCambio('ROPERO', payload);

    expect(result.saleId).toMatch(/^sale_cambio_web_/);
    expect(updatedData).not.toBeNull();

    // Verificamos actualización de inventario: Remera devuelta (+1 stock), Jean llevado (-1 stock)
    const remeraInv = updatedData.inventory.find((i: InventoryItem) => i.id === 'prod-remera');
    expect(remeraInv.stockPorVariante['S-NEGRO']).toBe(4); // 3 + 1
    expect(remeraInv.cantidad).toBe(6);                   // 5 + 1

    const jeanInv = updatedData.inventory.find((i: InventoryItem) => i.id === 'prod-jean');
    expect(jeanInv.stockPorVariante['38-AZUL']).toBe(1);  // 2 - 1
    expect(jeanInv.cantidad).toBe(1);                     // 2 - 1

    // Verificamos que se registró la venta tipo cambio en las ventas
    const cambioSale = updatedData.sales.find((s: Sale) => s.id === result.saleId);
    expect(cambioSale).toBeDefined();
    expect(cambioSale.tipo).toBe('cambio');
    expect(cambioSale.diferencia).toBe(4000);
  });

  it('genera una Gift Card automática si la diferencia es a favor del cliente (diferencia < 0)', async () => {
    let updatedData: any = null;

    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [JSON.parse(JSON.stringify(itemRemera)), JSON.parse(JSON.stringify(itemJean))],
            sales: [originalSale],
            giftCards: [],
          }),
        }),
        update: vi.fn((_ref, data) => {
          updatedData = data;
        }),
      };
      return await transactionCb(transaction);
    });

    const payload: WebCambioPayload = {
      ventaOriginalId: originalSale.id,
      itemsDevueltos: [originalSale.items[0]], // Devuelve prenda de $2000
      itemsNuevos: [],                         // No se lleva nada por el momento
      diferencia: -2000,                       // Saldo a favor $2000
      giftDestinatario: 'Lucía Fernández',
    };

    const result = await fulfillWebCambio('ROPERO', payload);

    expect(result.giftCodigo).toMatch(/^GIFT-/);
    expect(updatedData.giftCards).toHaveLength(1);
    expect(updatedData.giftCards[0].codigo).toBe(result.giftCodigo);
    expect(updatedData.giftCards[0].saldo).toBe(2000);
    expect(updatedData.giftCards[0].destinatario).toBe('Lucía Fernández');
  });
});
