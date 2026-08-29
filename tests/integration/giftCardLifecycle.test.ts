import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import {
  reserveWebOrder,
  cancelWebOrderReservationServer,
  executeReleaseExpiredReservations
} from '../../functions/src/orders';

describe('Suite 2: Integration Tests - Ciclo de Vida y Concurrencia de Gift Cards (giftCardLifecycle.test.ts)', () => {
  let mockShowroomData: any;
  let mockOrdersData: Record<string, any>;
  let mockGiftCardDocs: Record<string, any>;
  let mockDb: any;
  let transactionMutex: Promise<any>;

  beforeEach(() => {
    mockShowroomData = {
      inventory: [
        {
          id: 'prod-concurrente',
          sku: 'SKU-CONC',
          descripcion: 'Camisa Seda',
          categoria: 'CAMISAS',
          cantidad: 10,
          ventaEfectivo: 30000,
          ventaTarjeta: 35000,
          descuentoWeb: 0,
        },
      ],
      sales: [],
      giftCards: [
        {
          codigo: 'GC-CONCURRENT',
          saldo: 50000,
          reservedBalance: 0,
          estado: 'ACTIVA',
        },
      ],
    };

    mockOrdersData = {};
    mockGiftCardDocs = {
      'showrooms/ROPERO/giftCards/GC-CONCURRENT': {
        codigo: 'GC-CONCURRENT',
        balance: 50000,
        saldo: 50000,
        reservedBalance: 0,
        saldoReservado: 0,
        estado: 'ACTIVA',
      },
    };

    transactionMutex = Promise.resolve();

    // Mock transaccional que serializa las transacciones simulando el bloqueo de Firestore
    const createTransaction = () => ({
      get: vi.fn(async (ref: any) => {
        const path = typeof ref === 'string' ? ref : ref.path;
        if (path === 'showrooms/ROPERO') {
          return { exists: true, data: () => JSON.parse(JSON.stringify(mockShowroomData)) };
        }
        if (path.startsWith('showrooms/ROPERO/orders/')) {
          const ordId = path.split('/').pop()!;
          const data = mockOrdersData[ordId];
          return { exists: !!data, data: () => (data ? JSON.parse(JSON.stringify(data)) : null) };
        }
        if (path.startsWith('showrooms/ROPERO/giftCards/')) {
          const data = mockGiftCardDocs[path];
          return { exists: !!data, data: () => (data ? JSON.parse(JSON.stringify(data)) : null) };
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
    });

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
                data: () => val,
              })),
            }),
          }),
        }),
      }),
      doc: (path: string) => ({ path, id: path.split('/').pop() }),
      runTransaction: async (cb: any) => {
        // Encolar transacciones secuencialmente simulando el aislamiento serializable de Firestore
        const previous = transactionMutex;
        let resolveNext: () => void;
        transactionMutex = new Promise((resolve) => {
          resolveNext = resolve;
        });

        await previous;
        try {
          const tx = createTransaction();
          return await cb(tx);
        } finally {
          resolveNext!();
        }
      },
    };

    vi.spyOn(admin, 'firestore').mockReturnValue(mockDb as any);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Simulación de Concurrencia: Dos reservas simultáneas compitiendo por la misma Gift Card
  // ──────────────────────────────────────────────────────────────────────────
  describe('Concurrencia en Reservas de Gift Card', () => {
    it('evita el sobregiro (double-spend) cuando dos órdenes compiten simultáneamente por más saldo del disponible', async () => {
      // Gift Card tiene $50.000 disponibles
      // Orden 1 solicita $40.000
      // Orden 2 solicita $20.000
      // En total solicitan $60.000 > $50.000. Una debe ganar y la otra debe ser rechazada.
      const orderPayload1 = {
        showroomId: 'ROPERO',
        orderId: 'ord-concurrent-user-1',
        orderData: {
          metodoPago: 'Transferencia',
          paymentMethod: 'TRANSFER',
          estado: 'pending_transfer',
          items: [{ productId: 'prod-concurrente', cantidad: 2 }],
          giftCardCode: 'GC-CONCURRENT',
          giftCardAmount: 40000,
        },
      };

      const orderPayload2 = {
        showroomId: 'ROPERO',
        orderId: 'ord-concurrent-user-2',
        orderData: {
          metodoPago: 'Transferencia',
          paymentMethod: 'TRANSFER',
          estado: 'pending_transfer',
          items: [{ productId: 'prod-concurrente', cantidad: 1 }],
          giftCardCode: 'GC-CONCURRENT',
          giftCardAmount: 20000,
        },
      };

      // Disparar ambas reservas en simultáneo
      const [res1, res2] = await Promise.allSettled([
        (reserveWebOrder as any).run(orderPayload1, {} as any),
        (reserveWebOrder as any).run(orderPayload2, {} as any),
      ]);

      // Exactamente una debe haber tenido éxito y la otra debe haber sido rechazada
      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // La primera en ingresar reservó 40.000
      expect(res1.status).toBe('fulfilled');
      expect((res1 as PromiseFulfilledResult<any>).value.success).toBe(true);

      // La segunda falló con mensaje descriptivo de saldo insuficiente
      expect(res2.status).toBe('rejected');
      expect((res2 as PromiseRejectedResult).reason.message).toMatch(
        /Saldo insuficiente en la Gift Card\. Disponible: \$10000/
      );

      // El saldo reservado en la Gift Card queda exactamente en 40.000, sin sobregiro
      const gcDoc = mockGiftCardDocs['showrooms/ROPERO/giftCards/GC-CONCURRENT'];
      expect(gcDoc.reservedBalance).toBe(40000);
      expect(mockShowroomData.giftCards[0].reservedBalance).toBe(40000);
    });

    it('permite ambas reservas concurrentes si el saldo combinado no excede el disponible', async () => {
      // Orden A solicita $20.000 y Orden B solicita $25.000 (Total $45.000 <= $50.000)
      const orderA = {
        showroomId: 'ROPERO',
        orderId: 'ord-ok-a',
        orderData: {
          metodoPago: 'Transferencia',
          items: [{ productId: 'prod-concurrente', cantidad: 1 }],
          giftCardCode: 'GC-CONCURRENT',
          giftCardAmount: 20000,
        },
      };

      const orderB = {
        showroomId: 'ROPERO',
        orderId: 'ord-ok-b',
        orderData: {
          metodoPago: 'Transferencia',
          items: [{ productId: 'prod-concurrente', cantidad: 1 }],
          giftCardCode: 'GC-CONCURRENT',
          giftCardAmount: 25000,
        },
      };

      const [resA, resB] = await Promise.allSettled([
        (reserveWebOrder as any).run(orderA, {} as any),
        (reserveWebOrder as any).run(orderB, {} as any),
      ]);

      expect(resA.status).toBe('fulfilled');
      expect(resB.status).toBe('fulfilled');

      const gcDoc = mockGiftCardDocs['showrooms/ROPERO/giftCards/GC-CONCURRENT'];
      expect(gcDoc.reservedBalance).toBe(45000);
      expect(mockShowroomData.giftCards[0].reservedBalance).toBe(45000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Liberación Automática: Cancelación explícita y Expiración a las 24 hs
  // ──────────────────────────────────────────────────────────────────────────
  describe('Liberación de Saldo Reservado (Cancelación y Expiración 24hs)', () => {
    it('libera inmediatamente el saldo reservado al cancelar la orden manualmente', async () => {
      // Orden con $30.000 bloqueados
      mockOrdersData['ord-manual-cancel'] = {
        id: 'ord-manual-cancel',
        estado: 'pending_transfer',
        items: [{ productId: 'prod-concurrente', cantidad: 1 }],
        giftCardCode: 'GC-CONCURRENT',
        giftCardAmount: 30000,
      };
      mockGiftCardDocs['showrooms/ROPERO/giftCards/GC-CONCURRENT'].reservedBalance = 30000;
      mockShowroomData.giftCards[0].reservedBalance = 30000;

      // Cancelamos mediante el endpoint de servidor
      await (cancelWebOrderReservationServer as any).run(
        {
          showroomId: 'ROPERO',
          orderId: 'ord-manual-cancel',
        },
        {} as any
      );

      // Saldo reservado liberado a 0 y saldo base intacto
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GC-CONCURRENT'].reservedBalance).toBe(0);
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GC-CONCURRENT'].balance).toBe(50000);
      expect(mockShowroomData.giftCards[0].reservedBalance).toBe(0);
      expect(mockShowroomData.giftCards[0].saldo).toBe(50000);
      expect(mockOrdersData['ord-manual-cancel'].estado).toBe('Cancelado');
    });

    it('libera automáticamente el saldo reservado al expirar la orden a las 24 horas', async () => {
      const now = Date.now();
      const twentyFiveHoursAgo = new Date(now - 25 * 60 * 60 * 1000).toISOString();
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

      // Orden 1: Expirada (> 24 hs) con $35.000 reservados
      mockOrdersData['ord-expired-24h'] = {
        id: 'ord-expired-24h',
        estado: 'pending_transfer',
        fecha: twentyFiveHoursAgo,
        items: [{ productId: 'prod-concurrente', cantidad: 1 }],
        giftCardCode: 'GC-CONCURRENT',
        giftCardAmount: 35000,
      };

      // Orden 2: Reciente (solo 2 hs de antigüedad) con $10.000 reservados
      mockOrdersData['ord-recent-valid'] = {
        id: 'ord-recent-valid',
        estado: 'pending_transfer',
        fecha: twoHoursAgo,
        items: [{ productId: 'prod-concurrente', cantidad: 1 }],
        giftCardCode: 'GC-CONCURRENT',
        giftCardAmount: 10000,
      };

      // Total reservado = 35.000 + 10.000 = 45.000
      mockGiftCardDocs['showrooms/ROPERO/giftCards/GC-CONCURRENT'].reservedBalance = 45000;
      mockShowroomData.giftCards[0].reservedBalance = 45000;

      // Ejecutar cron / proceso de liberación de expiradas
      const result = await executeReleaseExpiredReservations(mockDb as any, 'ROPERO');

      // Solo 1 orden debe haber sido cancelada
      expect(result.releasedCount).toBe(1);

      // Orden expirada debe estar cancelada
      expect(mockOrdersData['ord-expired-24h'].estado).toBe('Cancelado');
      expect(mockOrdersData['ord-expired-24h'].cancelReason).toBe('expired');

      // Orden reciente debe seguir activa en pending_transfer
      expect(mockOrdersData['ord-recent-valid'].estado).toBe('pending_transfer');

      // Saldo reservado debe haber disminuido de 45.000 a 10.000 (liberando los 35.000 de la orden expirada)
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GC-CONCURRENT'].reservedBalance).toBe(10000);
      expect(mockShowroomData.giftCards[0].reservedBalance).toBe(10000);
    });

    it('respeta estrictamente la ventana de 24 horas: no expira órdenes con 23 horas', async () => {
      const now = Date.now();
      const twentyThreeHoursAgo = new Date(now - 23 * 60 * 60 * 1000).toISOString();

      mockOrdersData['ord-edge-23h'] = {
        id: 'ord-edge-23h',
        estado: 'pending_transfer',
        fecha: twentyThreeHoursAgo,
        items: [{ productId: 'prod-concurrente', cantidad: 1 }],
        giftCardCode: 'GC-CONCURRENT',
        giftCardAmount: 20000,
      };

      mockGiftCardDocs['showrooms/ROPERO/giftCards/GC-CONCURRENT'].reservedBalance = 20000;
      mockShowroomData.giftCards[0].reservedBalance = 20000;

      const result = await executeReleaseExpiredReservations(mockDb as any, 'ROPERO');

      // 0 liberadas
      expect(result.releasedCount).toBe(0);
      expect(mockOrdersData['ord-edge-23h'].estado).toBe('pending_transfer');
      expect(mockGiftCardDocs['showrooms/ROPERO/giftCards/GC-CONCURRENT'].reservedBalance).toBe(20000);
    });
  });
});
