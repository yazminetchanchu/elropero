import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSaleFromWebOrder,
  reserveWebOrderStock,
  fulfillWebOrder,
  releaseExpiredReservations,
  isOrderExpired,
  WebOrderForFulfillment,
} from '../services/webOrderFulfillment';
import { InventoryItem, GiftCard } from '../types';
import { isOrderEligibleForExchange } from '../services/webOrderToSale';
import { CustomerOrder } from '../contexts/AuthContext';

// Mock Firebase Firestore functions used by webOrderFulfillment
const mockRunTransaction = vi.fn();
const mockUpdateDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockDoc = vi.fn((_db, ...pathSegments) => pathSegments.join('/'));
const mockCollection = vi.fn((_db, ...pathSegments) => pathSegments.join('/'));
const mockQuery = vi.fn((col, ...rules) => ({ col, rules }));
const mockWhere = vi.fn((field, op, val) => ({ field, op, val }));

vi.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => (mockDoc as any)(...args),
  collection: (...args: any[]) => (mockCollection as any)(...args),
  query: (...args: any[]) => (mockQuery as any)(...args),
  where: (...args: any[]) => (mockWhere as any)(...args),
  runTransaction: (...args: any[]) => (mockRunTransaction as any)(...args),
  updateDoc: (...args: any[]) => (mockUpdateDoc as any)(...args),
  getDocs: (...args: any[]) => (mockGetDocs as any)(...args),
}));

export const mockHttpsCallableFn = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockHttpsCallableFn,
}));

// Mock firebase db import
vi.mock('../services/firebase', () => ({
  db: {},
  functions: {},
}));

// Mock email service
const mockSendGiftCardEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/emailService', () => ({
  sendGiftCardEmail: (...args: any[]) => mockSendGiftCardEmail(...args),
}));

describe('webOrderFulfillment Service - Stock, Confirmaciones y Gift Cards', () => {
  const sampleInventory: InventoryItem[] = [
    {
      id: 'prod-1',
      sku: 'SKU-001',
      descripcion: 'Remera Negra',
      proveedor: 'Prov A',
      cantidad: 5,
      costo: 1000,
      ventaEfectivo: 2000,
      ventaTarjeta: 2200,
      categoria: 'Remeras',
      talles: ['S', 'M'],
      colores: ['Negro'],
      imagenes: [],
      stockPorVariante: {
        'S-Negro': 3,
        'M-Negro': 2,
      },
    },
    {
      id: 'prod-2',
      sku: 'SKU-002',
      descripcion: 'Pantalón Jean',
      proveedor: 'Prov B',
      cantidad: 2,
      costo: 3000,
      ventaEfectivo: 6000,
      ventaTarjeta: 6600,
      categoria: 'Pantalones',
      talles: ['38'],
      colores: ['Azul'],
      imagenes: [],
      coloresStock: {
        'AZUL': 2,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildSaleFromWebOrder', () => {
    it('construye la estructura de Sale con metodos de pago, items y giftcard', () => {
      const webOrder: WebOrderForFulfillment = {
        fecha: '2026-07-28T12:00:00.000Z',
        items: [
          {
            productId: 'prod-1',
            descripcion: 'Remera Negra',
            sku: 'SKU-001',
            cantidad: 2,
            precioUnitario: 2000,
            talle: 'S',
            color: 'Negro',
            payMethod: 'tarjeta',
          },
        ],
        total: 4000,
        giftCardUsada: {
          codigo: 'GIFT-100',
          montoUsado: 500,
        },
      };

      const sale = buildSaleFromWebOrder(webOrder, 'order-123', sampleInventory);

      expect(sale.id).toBe('sale_web_order-123');
      expect(sale.total).toBe(4000);
      expect(sale.pago.tarjeta).toBe(100);
      expect(sale.pago.efectivo).toBe(0);
      expect(sale.items).toHaveLength(1);
      expect(sale.items[0].descripcion).toContain('Remera Negra (T:S C:Negro)');
      expect(sale.giftCardUsada).toEqual({ codigo: 'GIFT-100', montoUsado: 500 });
    });
  });

  describe('reserveWebOrderStock', () => {
    it('llama a la Cloud Function reserveWebOrder con los parametros correctos', async () => {
      mockHttpsCallableFn.mockResolvedValueOnce({ data: { success: true } });

      const orderData = {
        items: [
          {
            productId: 'prod-1',
            descripcion: 'Remera Negra',
            sku: 'SKU-001',
            cantidad: 1,
            precioUnitario: 2000,
            talle: 'S',
            color: 'Negro',
          },
        ],
        total: 2000,
        customerId: 'CUST-1',
      };

      await reserveWebOrderStock('ROPERO', 'ord-10', orderData);

      expect(mockHttpsCallableFn).toHaveBeenCalledWith({
        showroomId: 'ROPERO',
        orderId: 'ord-10',
        orderData,
      });
    });

    it('lanza un error claro si no hay suficiente stock disponible para una variante (simulado desde CF)', async () => {
      mockHttpsCallableFn.mockRejectedValueOnce(new Error('No hay stock suficiente'));

      const excessiveOrderData = {
        items: [
          {
            productId: 'prod-1',
            descripcion: 'Remera Negra',
            sku: 'SKU-001',
            cantidad: 10,
            precioUnitario: 2000,
            talle: 'S',
            color: 'Negro',
          },
        ],
        total: 20000,
      };

      await expect(reserveWebOrderStock('ROPERO', 'ord-99', excessiveOrderData)).rejects.toThrow(
        /No hay stock suficiente/
      );
    });

    it('lanza un error claro si el producto no existe en el catalogo (simulado desde CF)', async () => {
      mockHttpsCallableFn.mockRejectedValueOnce(new Error('ya no existe en el catálogo'));

      const invalidOrderData = {
        items: [
          {
            productId: 'prod-invalido',
            descripcion: 'Producto Inexistente',
            cantidad: 1,
            precioUnitario: 500,
          },
        ],
        total: 500,
      };

      await expect(reserveWebOrderStock('ROPERO', 'ord-invalido', invalidOrderData)).rejects.toThrow(
        /ya no existe en el catálogo/
      );
    });
  });

  describe('fulfillWebOrder', () => {
    it('invoca la Cloud Function fulfillWebOrderServer con los parámetros correctos y retorna el saleId', async () => {
      mockHttpsCallableFn.mockResolvedValueOnce({
        data: {
          success: true,
          saleId: 'sale_web_ord-555',
        },
      });

      const webOrder: WebOrderForFulfillment = {
        fecha: '2026-07-28T12:00:00.000Z',
        items: [
          {
            productId: 'prod-gift',
            descripcion: 'Gift Card Virtual',
            sku: 'GIFT-VIRTUAL',
            cantidad: 1,
            precioUnitario: 5000,
            isVirtualGiftCard: true,
            giftCardData: {
              destinatario: 'Ana',
              email: 'ana@example.com',
              deParteDe: 'Carlos',
              mensaje: '¡Feliz Cumpleaños!',
            },
          },
        ],
        total: 4500,
        giftCardUsada: {
          codigo: 'GIFT-100',
          montoUsado: 500,
        },
        customerId: 'CUST-2',
      };

      const saleId = await fulfillWebOrder('ROPERO', 'ord-555', webOrder);

      expect(mockHttpsCallableFn).toHaveBeenCalledWith({
        showroomId: 'ROPERO',
        orderId: 'ord-555',
        order: webOrder,
      });
      expect(saleId).toBe('sale_web_ord-555');
    });

    it('lanza un error descriptivo si la Cloud Function falla', async () => {
      mockHttpsCallableFn.mockRejectedValueOnce(new Error('Showroom no encontrado en la base de datos.'));

      const webOrder: WebOrderForFulfillment = {
        fecha: '2026-07-28',
        items: [],
        total: 1000,
      };

      await expect(fulfillWebOrder('ROPERO', 'ord-err', webOrder)).rejects.toThrow(
        'Showroom no encontrado en la base de datos.'
      );
    });
  });

  describe('releaseExpiredReservations', () => {
    it('invoca la Cloud Function releaseExpiredReservationsServer con el showroomId especificado', async () => {
      mockHttpsCallableFn.mockResolvedValueOnce({
        data: {
          success: true,
          releasedCount: 2,
        },
      });

      await releaseExpiredReservations('ROPERO');

      expect(mockHttpsCallableFn).toHaveBeenCalledWith({
        showroomId: 'ROPERO',
      });
    });

    it('maneja errores gracefully sin lanzar excepciones no controladas al cliente', async () => {
      mockHttpsCallableFn.mockRejectedValueOnce(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(releaseExpiredReservations('ROPERO')).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[releaseExpiredReservations] Aviso al verificar reservas expiradas:',
        'Network error'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('isOrderExpired', () => {
    it('retorna true para órdenes PENDING_PAYMENT o Pendiente con expiresAt en el pasado', () => {
      const pastExpiresAt = new Date(Date.now() - 1000).toISOString();
      expect(isOrderExpired({ estado: 'PENDING_PAYMENT', expiresAt: pastExpiresAt })).toBe(true);
      expect(isOrderExpired({ estado: 'Pendiente', expiresAt: pastExpiresAt })).toBe(true);
    });

    it('retorna true para órdenes sin expiresAt con fecha creada hace más de 15 minutos', () => {
      const pastFecha = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      expect(isOrderExpired({ estado: 'PENDING_PAYMENT', fecha: pastFecha })).toBe(true);
    });

    it('retorna false para órdenes vigentes dentro de los 15 minutos o en otros estados', () => {
      const recentExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      expect(isOrderExpired({ estado: 'PENDING_PAYMENT', expiresAt: recentExpiresAt })).toBe(false);
      expect(isOrderExpired({ estado: 'Confirmado', expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(false);
    });
  });

  describe('Elegibilidad de cambios (Plazo de 15 días)', () => {
    const baseOrder: CustomerOrder = {
      id: 'ORD-15',
      customerId: 'user-1',
      items: [],
      total: 5000,
      subtotal: 5000,
      descuentoGlobal: 0,
      metodoPago: 'Efectivo',
      tipoEnvio: 'retiro',
      estado: 'Entregado',
      fecha: new Date().toISOString(),
    };

    it('permite cambios si la compra fue realizada hace 15 días o menos', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
      const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();

      expect(isOrderEligibleForExchange({ ...baseOrder, fecha: tenDaysAgo })).toBe(true);
      expect(isOrderEligibleForExchange({ ...baseOrder, fecha: fifteenDaysAgo })).toBe(true);
    });

    it('rechaza cambios si la compra fue realizada hace más de 15 días', () => {
      const sixteenDaysAgo = new Date(Date.now() - 16 * 86400000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

      expect(isOrderEligibleForExchange({ ...baseOrder, fecha: sixteenDaysAgo })).toBe(false);
      expect(isOrderEligibleForExchange({ ...baseOrder, fecha: thirtyDaysAgo })).toBe(false);
    });
  });
});
