import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fulfillWebCambio, WebCambioPayload } from './webCambioFulfillment';
import { DatabaseState, InventoryItem, Sale, SaleItem } from '../types';

const mockRunTransaction = vi.fn();
const mockDoc = vi.fn((_db, ...pathSegments) => pathSegments.join('/'));

vi.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => mockDoc(...args),
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_fns, _name) => async (data: any) => {
    const { showroomId, payload } = data;
    const saleId = `sale_cambio_web_${Date.now()}`;
    let giftCodigo: string | null = null;

    await mockRunTransaction({}, async (transaction: any) => {
      const snap = await transaction.get(mockDoc({}, 'showrooms', showroomId));
      if (!snap.exists()) throw new Error('Showroom no encontrado.');
      const srData = snap.data() || {};
      const sales = srData.sales || [];
      const inventory = srData.inventory || [];
      const giftCards = srData.giftCards || [];

      const ventaOriginal = sales.find((s: any) => s.id === payload.ventaOriginalId);
      if (!ventaOriginal) {
        throw new Error('No se encontró la venta original en caja.');
      }

      const diasTranscurridos = Math.floor((Date.now() - new Date(ventaOriginal.fecha).getTime()) / (1000 * 60 * 60 * 24));
      if (diasTranscurridos > 15) {
        throw new Error('Ya han pasado 15 días desde la compra.');
      }

      const itemsOriginales = ventaOriginal.items ?? [];
      for (const devuelto of payload.itemsDevueltos) {
        const enOriginal = itemsOriginales.find((i: any) => i.id === devuelto.id);
        if (!enOriginal) {
          throw new Error(`La prenda "${devuelto.descripcion}" no pertenece a la venta original.`);
        }
        if (devuelto.cantidad > enOriginal.cantidad) {
          throw new Error(`La cantidad devuelta de "${devuelto.descripcion}" no puede superar la comprada (${enOriginal.cantidad}).`);
        }
        const yaDevueltaEn = sales
          .filter((s: any) => s.tipo === 'cambio' && s.ventaOriginalId === payload.ventaOriginalId)
          .reduce((sum: number, s: any) => {
            const prev = (s.itemsDevueltos ?? []).find((i: any) => i.id === devuelto.id);
            return sum + (prev?.cantidad ?? 0);
          }, 0);
        const disponible = enOriginal.cantidad - yaDevueltaEn;
        if (devuelto.cantidad > disponible) {
          throw new Error(`"${devuelto.descripcion}": solo podés devolver ${disponible} unidad(es).`);
        }
      }

      for (const itemNuevo of (payload.itemsNuevos || [])) {
        const invItem = inventory.find((i: any) => i.id === itemNuevo.id);
        if (!invItem) throw new Error(`Producto no encontrado en stock: ${itemNuevo.descripcion}`);
        if (invItem.stockPorVariante && itemNuevo.talle && itemNuevo.color) {
          const varKey = `${itemNuevo.talle}-${itemNuevo.color}`;
          if ((invItem.stockPorVariante[varKey] || 0) < itemNuevo.cantidad) {
            throw new Error(`Stock insuficiente para variante ${varKey} de ${itemNuevo.descripcion}`);
          }
        }
      }

      let giftGenerada: any;
      if (payload.diferencia < 0) {
        const montoGift = Math.abs(payload.diferencia);
        giftCodigo = `GIFT-AUTOTEST`;

        let medioPagoOrigen: 'efectivo' | 'tarjeta' | 'mixto' = 'efectivo';
        if (ventaOriginal?.pago) {
          if (ventaOriginal.pago.tarjeta === 100) medioPagoOrigen = 'tarjeta';
          else if (ventaOriginal.pago.efectivo === 100) medioPagoOrigen = 'efectivo';
          else medioPagoOrigen = 'mixto';
        } else if (ventaOriginal?.metodoPago) {
          const mp = String(ventaOriginal.metodoPago).toLowerCase();
          if (mp.includes('tarjeta') || mp.includes('uala') || mp.includes('crédito') || mp.includes('debito')) {
            medioPagoOrigen = 'tarjeta';
          } else {
            medioPagoOrigen = 'efectivo';
          }
        }

        giftGenerada = {
          id: `gift_${Date.now()}`,
          codigo: giftCodigo,
          destinatario: payload.giftDestinatario || 'Cambio web',
          montoInicial: montoGift,
          saldo: montoGift,
          estado: 'ACTIVA',
          fechaCreacion: new Date().toISOString(),
          medioPagoOrigen,
          ventaOrigenId: payload.ventaOriginalId,
        };
      }

      const pagoDefaultOrig = ventaOriginal?.pago || (ventaOriginal?.metodoPago?.toLowerCase().includes('tarjeta') ? { efectivo: 0, tarjeta: 100 } : { efectivo: 100, tarjeta: 0 });

      const newSale: any = {
        id: saleId,
        fecha: new Date().toISOString(),
        tipo: 'cambio',
        ventaOriginalId: payload.ventaOriginalId,
        itemsDevueltos: payload.itemsDevueltos,
        itemsNuevos: payload.itemsNuevos || [],
        total: Math.max(0, payload.diferencia),
        diferencia: payload.diferencia,
        pago: payload.diferencia <= 0 ? pagoDefaultOrig : (payload.pago || { efectivo: 100, tarjeta: 0 }),
        pagoDevolucion: pagoDefaultOrig,
        giftDestinatario: payload.giftDestinatario || 'Cambio web',
        costoEnvio: payload.costoEnvio ?? 0,
        costoEnvioDevolucion: payload.costoEnvioDevolucion ?? 0,
        costoEnvioNuevo: payload.costoEnvioNuevo ?? 0,
        tipoEnvioDevolucion: payload.tipoEnvioDevolucion,
        tipoEnvioNuevo: payload.tipoEnvioNuevo,
        codigoPostalCliente: payload.codigoPostalCliente,
      };

      let nextInventory = [...inventory];
      for (const dev of payload.itemsDevueltos) {
        const invIdx = nextInventory.findIndex((i: any) => i.id === dev.id);
        if (invIdx >= 0) {
          const it = { ...nextInventory[invIdx] };
          it.cantidad += dev.cantidad;
          if (it.stockPorVariante && dev.talle && dev.color) {
            const k = `${dev.talle}-${dev.color}`;
            it.stockPorVariante = { ...it.stockPorVariante, [k]: (it.stockPorVariante[k] || 0) + dev.cantidad };
          }
          nextInventory[invIdx] = it;
        }
      }
      for (const neu of (payload.itemsNuevos || [])) {
        const invIdx = nextInventory.findIndex((i: any) => i.id === neu.id);
        if (invIdx >= 0) {
          const it = { ...nextInventory[invIdx] };
          it.cantidad -= neu.cantidad;
          if (it.stockPorVariante && neu.talle && neu.color) {
            const k = `${neu.talle}-${neu.color}`;
            it.stockPorVariante = { ...it.stockPorVariante, [k]: (it.stockPorVariante[k] || 0) - neu.cantidad };
          }
          nextInventory[invIdx] = it;
        }
      }

      const nextGiftCards = giftGenerada ? [...giftCards, giftGenerada] : giftCards;
      transaction.update(mockDoc({}, 'showrooms', showroomId), {
        inventory: nextInventory,
        sales: [...sales, newSale],
        giftCards: nextGiftCards,
        lastSync: Date.now(),
      });
    });

    return { data: { saleId, giftCodigo } };
  }),
}));

vi.mock('./firebase', () => ({
  db: {},
  functions: {},
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
    expect(cambioSale.pago).toEqual({ efectivo: 100, tarjeta: 0 });
  });

  it('guarda adecuadamente la estructura de pago recibida en el payload (ej. tarjeta)', async () => {
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
      itemsDevueltos: [originalSale.items[0]],
      itemsNuevos: [newItem],
      diferencia: 4000,
      pago: { efectivo: 0, tarjeta: 100 },
    };

    const result = await fulfillWebCambio('ROPERO', payload);
    const cambioSale = updatedData.sales.find((s: Sale) => s.id === result.saleId);
    expect(cambioSale.pago).toEqual({ efectivo: 0, tarjeta: 100 });
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
    expect(updatedData.giftCards[0].medioPagoOrigen).toBe('efectivo');
    expect(updatedData.giftCards[0].ventaOrigenId).toBe(originalSale.id);
  });

  it('registra correctamente la opción de logística Pick Up Recoleta en la venta de cambio', async () => {
    let updatedData: any = null;

    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [JSON.parse(JSON.stringify(itemRemera))],
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
      itemsDevueltos: [originalSale.items[0]],
      itemsNuevos: [],
      diferencia: -2000,
      costoEnvio: 0,
      tipoEnvioDevolucion: 'recoleta',
      tipoEnvioNuevo: 'recoleta',
    };

    const result = await fulfillWebCambio('ROPERO', payload);
    const cambioSale = updatedData.sales.find((s: Sale) => s.id === result.saleId);

    expect(cambioSale.tipoEnvioDevolucion).toBe('recoleta');
    expect(cambioSale.tipoEnvioNuevo).toBe('recoleta');
    expect(cambioSale.costoEnvio).toBe(0);
  });

  it('lanza un error si la prenda devuelta no pertenece a la venta original', async () => {
    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [itemRemera],
            sales: [originalSale],
          }),
        }),
      };
      return await transactionCb(transaction);
    });

    const itemAjeno: SaleItem = {
      id: 'prod-ajeno',
      sku: 'SKU-AJENO',
      descripcion: 'PRENDA DE OTRA COMPRA',
      cantidad: 1,
      costo: 500,
      precioEfectivo: 1000,
      precioTarjeta: 1500,
      descuento: 0,
    };

    const payload: WebCambioPayload = {
      ventaOriginalId: originalSale.id,
      itemsDevueltos: [itemAjeno],
      itemsNuevos: [],
      diferencia: 0,
    };

    await expect(fulfillWebCambio('ROPERO', payload)).rejects.toThrow(
      'no pertenece a la venta original'
    );
  });

  it('lanza un error si se intenta devolver una cantidad mayor a la disponible tras cambios previos', async () => {
    const cambioPrevio: Sale = {
      id: 'sale-cambio-previo',
      fecha: new Date().toISOString(),
      tipo: 'cambio',
      ventaOriginalId: originalSale.id,
      itemsDevueltos: [{ ...originalSale.items[0], cantidad: 1 }],
      itemsNuevos: [],
      items: [],
      total: 0,
      pago: { efectivo: 0, tarjeta: 0 },
    };

    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [itemRemera],
            sales: [originalSale, cambioPrevio],
          }),
        }),
      };
      return await transactionCb(transaction);
    });

    const payload: WebCambioPayload = {
      ventaOriginalId: originalSale.id,
      itemsDevueltos: [{ ...originalSale.items[0], cantidad: 1 }], // Ya devuelta en cambioPrevio
      itemsNuevos: [],
      diferencia: 0,
    };

    await expect(fulfillWebCambio('ROPERO', payload)).rejects.toThrow(
      'solo podés devolver 0 unidad(es)'
    );
  });

  it('lanza un error si no hay stock suficiente de la variante de prenda nueva seleccionada', async () => {
    const itemSinStock: InventoryItem = {
      ...itemJean,
      stockPorVariante: { '38-AZUL': 0 },
      cantidad: 0,
    };

    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [itemRemera, itemSinStock],
            sales: [originalSale],
          }),
        }),
      };
      return await transactionCb(transaction);
    });

    const newItem: SaleItem = {
      id: itemJean.id,
      sku: itemJean.sku,
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
      itemsDevueltos: [originalSale.items[0]],
      itemsNuevos: [newItem],
      diferencia: 4000,
    };

    await expect(fulfillWebCambio('ROPERO', payload)).rejects.toThrow(
      'Stock insuficiente para variante 38-AZUL'
    );
  });

  it('guarda correctamente el desglose de envíos (costoEnvioDevolucion, costoEnvioNuevo) y codigoPostalCliente', async () => {
    let updatedData: any = null;

    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [JSON.parse(JSON.stringify(itemRemera))],
            sales: [originalSale],
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
      itemsDevueltos: [originalSale.items[0]],
      itemsNuevos: [],
      diferencia: 0,
      costoEnvio: 9500,
      costoEnvioDevolucion: 4500,
      costoEnvioNuevo: 5000,
      tipoEnvioDevolucion: 'D',
      tipoEnvioNuevo: 'S',
      codigoPostalCliente: '1425',
    };

    const result = await fulfillWebCambio('ROPERO', payload);
    const cambioSale = updatedData.sales.find((s: Sale) => s.id === result.saleId);

    expect(cambioSale.costoEnvio).toBe(9500);
    expect(cambioSale.costoEnvioDevolucion).toBe(4500);
    expect(cambioSale.costoEnvioNuevo).toBe(5000);
    expect(cambioSale.tipoEnvioDevolucion).toBe('D');
    expect(cambioSale.tipoEnvioNuevo).toBe('S');
    expect(cambioSale.codigoPostalCliente).toBe('1425');
  });

  it('registra Gift Card bajo medio de pago original (tarjeta) y no asigna envio si no hay prendas en carrito', async () => {
    let updatedData: any = null;

    const saleTarjeta: Sale = {
      ...originalSale,
      id: 'sale-tarjeta-999',
      pago: { efectivo: 0, tarjeta: 100 },
    };

    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [JSON.parse(JSON.stringify(itemRemera))],
            sales: [saleTarjeta],
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
      ventaOriginalId: 'sale-tarjeta-999',
      itemsDevueltos: [saleTarjeta.items[0]],
      itemsNuevos: [],
      diferencia: -2000,
      giftDestinatario: 'Ana Gomez',
    };

    const result = await fulfillWebCambio('ROPERO', payload);
    expect(result.giftCodigo).toBeDefined();

    const createdGift = updatedData.giftCards.find((g: any) => g.codigo === result.giftCodigo);
    expect(createdGift).toBeDefined();
    expect(createdGift.destinatario).toBe('Ana Gomez');
    expect(createdGift.montoInicial).toBe(2000);
    expect(createdGift.medioPagoOrigen).toBe('tarjeta');

    const cambioSale = updatedData.sales.find((s: Sale) => s.id === result.saleId);
    expect(cambioSale.pago).toEqual({ efectivo: 0, tarjeta: 100 });
    expect(cambioSale.costoEnvio).toBe(0);
  });

  it('registra Gift Card bajo medio de pago original (efectivo) cuando la venta original fue en efectivo', async () => {
    let updatedData: any = null;

    const saleEfectivo: Sale = {
      ...originalSale,
      id: 'sale-efectivo-888',
      pago: { efectivo: 100, tarjeta: 0 },
    };

    mockRunTransaction.mockImplementation(async (_db, transactionCb) => {
      const transaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: (): DatabaseState => ({
            inventory: [JSON.parse(JSON.stringify(itemRemera))],
            sales: [saleEfectivo],
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
      ventaOriginalId: 'sale-efectivo-888',
      itemsDevueltos: [saleEfectivo.items[0]],
      itemsNuevos: [],
      diferencia: -2000,
      giftDestinatario: 'Carlos Rossi',
    };

    const result = await fulfillWebCambio('ROPERO', payload);
    const createdGift = updatedData.giftCards.find((g: any) => g.codigo === result.giftCodigo);
    expect(createdGift.medioPagoOrigen).toBe('efectivo');

    const cambioSale = updatedData.sales.find((s: Sale) => s.id === result.saleId);
    expect(cambioSale.pago).toEqual({ efectivo: 100, tarjeta: 0 });
  });
});


