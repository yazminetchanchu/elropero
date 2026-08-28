import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import {
  recalculateOrderPricing,
  reserveWebOrder,
  fulfillWebOrderServer,
  cancelWebOrderReservationServer,
  executeReleaseExpiredReservations
} from '../functions/src/orders';

describe('Prevención de Doble Gasto de Gift Cards (Bug 6)', () => {
  describe('recalculateOrderPricing con Saldo Reservado', () => {
    const baseShowroom = {
      inventory: [
        {
          id: 'prod-1',
          sku: 'SKU-1',
          descripcion: 'Remera de Algodón',
          categoria: 'REMERAS',
          cantidad: 10,
          ventaEfectivo: 20000,
          ventaTarjeta: 25000,
          descuentoWeb: 0,
        },
      ],
      webSettings: {},
      giftCards: [
        {
          codigo: 'GIFT-50K',
          saldo: 50000,
          reservedBalance: 30000, // $30.000 ya bloqueados en otra orden pendiente
          estado: 'ACTIVA',
        },
        {
          codigo: 'GIFT-FULL-BLOCKED',
          saldo: 25000,
          reservedBalance: 25000, // 100% bloqueado
          estado: 'ACTIVA',
        },
      ],
    };

    it('limita el uso de la Gift Card al saldo disponible real (saldo - reservedBalance)', () => {
      const orderData = {
        metodoPago: 'Transferencia',
        items: [{ productId: 'prod-1', cantidad: 2, precioUnitario: 20000 }], // Subtotal: 40000
        costoEnvio: 0,
        giftCardUsada: {
          codigo: 'GIFT-50K',
          montoUsado: 40000, // Intenta usar 40000, pero disponible es 50000 - 30000 = 20000
        },
      };

      const pricing = recalculateOrderPricing(baseShowroom, orderData);

      // Solo puede usar los $20.000 disponibles
      expect(pricing.montoGiftCardUsado).toBe(20000);
      expect(pricing.giftCardUsada?.montoUsado).toBe(20000);
      expect(pricing.total).toBe(20000); // 40000 - 20000
    });

    it('ignora o asigna $0 si el saldo de la Gift Card está 100% reservado', () => {
      const orderData = {
        metodoPago: 'Transferencia',
        items: [{ productId: 'prod-1', cantidad: 1, precioUnitario: 20000 }],
        costoEnvio: 0,
        giftCardUsada: {
          codigo: 'GIFT-FULL-BLOCKED',
          montoUsado: 25000,
        },
      };

      const pricing = recalculateOrderPricing(baseShowroom, orderData);

      expect(pricing.montoGiftCardUsado).toBe(0);
      expect(pricing.giftCardUsada).toBeUndefined();
      expect(pricing.total).toBe(20000);
    });
  });

  describe('Flujo Atómico de Reserva, Fulfill y Cancelación con Firestore Mock', () => {
    let mockShowroomData: any;
    let mockOrdersData: Record<string, any>;
    let mockGiftCardDocs: Record<string, any>;
    let mockTransaction: any;
    let mockDb: any;

    beforeEach(() => {
      mockShowroomData = {
        inventory: [
          {
            id: 'prod-1',
            sku: 'SKU-1',
            descripcion: 'Vestido Negro',
            categoria: 'VESTIDOS',
            cantidad: 5,
            ventaEfectivo: 30000,
            ventaTarjeta: 37500,
            descuentoWeb: 0,
          }
        ],
        sales: [],
        giftCards: [
          {
            codigo: 'GIFT-ABC',
            saldo: 50000,
            reservedBalance: 0,
            estado: 'ACTIVA',
          }
        ]
      };

      mockOrdersData = {};
      mockGiftCardDocs = {
        'showrooms/ROPERO/giftCards/GIFT-ABC': {
          codigo: 'GIFT-ABC',
          balance: 50000,
          saldo: 50000,
          reservedBalance: 0,
          saldoReservado: 0,
          estado: 'ACTIVA'
        }
      };

      mockTransaction = {
        get: vi.fn(async (ref: any) => {
          const path = typeof ref === 'string' ? ref : ref.path;
          if (path === 'showrooms/ROPERO') {
            return { exists: true, data: () => JSON.parse(JSON.stringify(mockShowroomData)) };
          }
          if (path.startsWith('showrooms/ROPERO/orders/')) {
            const ordId = path.split('/').pop()!;
            const data = mockOrdersData[ordId];
            return { exists: !!data, data: () => data ? JSON.parse(JSON.stringify(data)) : null };
          }
          if (path.startsWith('showrooms/ROPERO/giftCards/')) {
            const data = mockGiftCardDocs[path];
            return { exists: !!data, data: () => data ? JSON.parse(JSON.stringify(data)) : null };
          }
          return { exists: false, data: () => null };
        }),
        update: vi.fn((ref: any, data: any) => {
          const path = typeof ref === 'string' ? ref : ref.path;
          if (path === 'showrooms/ROPERO') {
            mockShowroomData = { ...mockShowroomData, ...data };
          } else if (path.startsWith('showrooms/ROPERO/giftCards/')) {
            mockGiftCardDocs[path] = { ...(mockGiftCardDocs[path] || {}), ...data };
          } else if (path.startsWith('showrooms/ROPERO/orders/')) {
            const ordId = path.split('/').pop()!;
            mockOrdersData[ordId] = { ...(mockOrdersData[ordId] || {}), ...data };
          }
        }),
        set: vi.fn((ref: any, data: any, options?: any) => {
          const path = typeof ref === 'string' ? ref : ref.path;
          if (path.startsWith('showrooms/ROPERO/orders/')) {
            const ordId = path.split('/').pop()!;
            if (options?.merge && mockOrdersData[ordId]) {
              mockOrdersData[ordId] = { ...mockOrdersData[ordId], ...data };
            } else {
              mockOrdersData[ordId] = data;
            }
          }
        }),
      };

      mockDb = {
        collection: (col: string) => ({
          doc: (id: string) => ({
            path: `${col}/${id}`,
            id,
            collection: (subCol: string) => ({
              doc: (subId: string) => ({ path: `${col}/${id}/${subCol}/${subId}`, id: subId }),
              get: async () => ({
                docs: Object.entries(mockOrdersData).map(([docId, val]) => ({
                  id: docId,
                  ref: { path: `${col}/${id}/${subCol}/${docId}`, id: docId },
                  data: () => val
                }))
              })
            })
          })
        }),
        doc: (path: string) => ({ path, id: path.split('/').pop() }),
        runTransaction: async (cb: any) => cb(mockTransaction),
      };

      vi.spyOn(admin, 'firestore').mockReturnValue(mockDb as any);
    });

    it('bloquea exitosamente el saldo reservado en reserveWebOrder', async () => {
      const orderPayload = {
        showroomId: 'ROPERO',
        orderId: 'ord-test-1',
        orderData: {
          metodoPago: 'Transferencia',
          paymentMethod: 'TRANSFER',
          estado: 'pending_transfer',
          items: [{ productId: 'prod-1', cantidad: 1 }],
          giftCardCode: 'GIFT-ABC',
          giftCardAmount: 20000,
        }
      };

      const result = await (reserveWebOrder as any).run(orderPayload, {} as any);
      expect(result.success).toBe(true);

      // Verificamos que se bloqueó en el documento de la giftcard
      const gcDoc = mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'];
      expect(gcDoc.reservedBalance).toBe(20000);

      // Verificamos que se bloqueó en el array del showroom
      const gcArrayItem = mockShowroomData.giftCards.find((g: any) => g.codigo === 'GIFT-ABC');
      expect(gcArrayItem.reservedBalance).toBe(20000);
    });

    it('lanza failed-precondition si se intenta reservar más saldo del disponible', async () => {
      // Pre-bloqueamos 40.000 de 50.000
      mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].reservedBalance = 40000;
      mockShowroomData.giftCards[0].reservedBalance = 40000;

      const orderPayload = {
        showroomId: 'ROPERO',
        orderId: 'ord-test-overflow',
        orderData: {
          metodoPago: 'Transferencia',
          paymentMethod: 'TRANSFER',
          estado: 'pending_transfer',
          items: [{ productId: 'prod-1', cantidad: 1 }],
          giftCardCode: 'GIFT-ABC',
          giftCardAmount: 20000, // Disponible solo 10.000 (50000 - 40000)
        }
      };

      await expect(
        (reserveWebOrder as any).run(orderPayload, {} as any)
      ).rejects.toThrow(/Saldo insuficiente en la Gift Card\. Disponible: \$10000/);
    });

    it('lanza not-found si la Gift Card ingresada no existe', async () => {
      const orderPayload = {
        showroomId: 'ROPERO',
        orderId: 'ord-test-404',
        orderData: {
          metodoPago: 'Transferencia',
          items: [{ productId: 'prod-1', cantidad: 1 }],
          giftCardCode: 'GIFT-INEXISTENTE',
          giftCardAmount: 10000,
        }
      };

      await expect(
        (reserveWebOrder as any).run(orderPayload, {} as any)
      ).rejects.toThrow(/La Gift Card no existe\./);
    });

    it('es idempotente: no duplica el saldo reservado al llamar reserveWebOrder múltiples veces para la misma orden', async () => {
      const orderPayload = {
        showroomId: 'ROPERO',
        orderId: 'ord-idempotente',
        orderData: {
          metodoPago: 'Transferencia',
          paymentMethod: 'TRANSFER',
          estado: 'pending_transfer',
          items: [{ productId: 'prod-1', cantidad: 1 }],
          giftCardCode: 'GIFT-ABC',
          giftCardAmount: 15000,
        }
      };

      // Primera llamada: reserva 15000
      await (reserveWebOrder as any).run(orderPayload, {} as any);
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].reservedBalance).toBe(15000);
      expect(mockShowroomData.giftCards[0].reservedBalance).toBe(15000);

      // Segunda llamada con los mismos datos (reintento del frontend)
      await (reserveWebOrder as any).run(orderPayload, {} as any);
      // El saldo reservado debe seguir siendo 15000, NO 30000
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].reservedBalance).toBe(15000);
      expect(mockShowroomData.giftCards[0].reservedBalance).toBe(15000);
    });

    it('libera el saldo reservado al cancelar la orden en cancelWebOrderReservationServer', async () => {
      // Supongamos que la orden tenía reservados 20.000
      mockOrdersData['ord-to-cancel'] = {
        id: 'ord-to-cancel',
        estado: 'pending_transfer',
        items: [{ productId: 'prod-1', cantidad: 1 }],
        giftCardCode: 'GIFT-ABC',
        giftCardAmount: 20000,
      };
      mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].reservedBalance = 20000;
      mockShowroomData.giftCards[0].reservedBalance = 20000;

      await (cancelWebOrderReservationServer as any).run({
        showroomId: 'ROPERO',
        orderId: 'ord-to-cancel'
      }, {} as any);

      // El reservedBalance debe quedar en 0 y el saldo real intacto en 50000
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].reservedBalance).toBe(0);
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].balance).toBe(50000);
      expect(mockShowroomData.giftCards[0].reservedBalance).toBe(0);
      expect(mockShowroomData.giftCards[0].saldo).toBe(50000);
      expect(mockOrdersData['ord-to-cancel'].estado).toBe('Cancelado');
    });

    it('libera el saldo reservado de órdenes expiradas en executeReleaseExpiredReservations', async () => {
      // Orden expirada
      const pastTime = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
      mockOrdersData['ord-expired'] = {
        id: 'ord-expired',
        estado: 'pending_transfer',
        expiresAt: pastTime,
        fecha: pastTime,
        items: [{ productId: 'prod-1', cantidad: 1 }],
        giftCardCode: 'GIFT-ABC',
        giftCardAmount: 25000,
      };
      mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].reservedBalance = 25000;
      mockShowroomData.giftCards[0].reservedBalance = 25000;

      const result = await executeReleaseExpiredReservations(mockDb as any, 'ROPERO');
      expect(result.releasedCount).toBe(1);

      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].reservedBalance).toBe(0);
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].balance).toBe(50000);
      expect(mockShowroomData.giftCards[0].reservedBalance).toBe(0);
      expect(mockOrdersData['ord-expired'].estado).toBe('Cancelado');
      expect(mockOrdersData['ord-expired'].cancelReason).toBe('expired');
    });

    it('deduce definitivamente el saldo y libera el saldo reservado al confirmar en fulfillWebOrderServer', async () => {
      // Orden previamente reservada
      mockOrdersData['ord-confirmed'] = {
        id: 'ord-confirmed',
        estado: 'pending_transfer',
        items: [{ productId: 'prod-1', cantidad: 1, precioUnitario: 30000 }],
        total: 10000,
        giftCardCode: 'GIFT-ABC',
        giftCardAmount: 20000,
        giftCardUsada: {
          codigo: 'GIFT-ABC',
          montoUsado: 20000
        }
      };
      mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].reservedBalance = 20000;
      mockShowroomData.giftCards[0].reservedBalance = 20000;

      const adminContext = {
        auth: {
          token: { admin: true }
        }
      };

      const result = await (fulfillWebOrderServer as any).run({
        showroomId: 'ROPERO',
        orderId: 'ord-confirmed',
        order: mockOrdersData['ord-confirmed']
      }, adminContext);

      expect(result.success).toBe(true);

      // Saldo real debe bajar de 50.000 a 30.000, y el reservedBalance debe quedar en 0
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].balance).toBe(30000);
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GIFT-ABC'].reservedBalance).toBe(0);
      expect(mockShowroomData.giftCards[0].saldo).toBe(30000);
      expect(mockShowroomData.giftCards[0].reservedBalance).toBe(0);

      // Estado de orden confirmado
      expect(mockOrdersData['ord-confirmed'].estado).toBe('Confirmado');
    });
  });
});
