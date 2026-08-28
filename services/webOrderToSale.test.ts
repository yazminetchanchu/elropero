import { describe, it, expect } from 'vitest';
import { buildSaleItemsFromOrder, getOrderSaleId, isOrderEligibleForExchange, isGiftCardOrder, parseSafeDate } from './webOrderToSale';
import { CustomerOrder } from '../contexts/AuthContext';
import { InventoryItem } from '../types';

describe('webOrderToSale Service', () => {
  const mockInventory: InventoryItem[] = [
    {
      id: 'prod_1',
      sku: 'SKU-001',
      descripcion: 'Remera Algodón',
      proveedor: 'Prov A',
      categoria: 'REMERAS',
      cantidad: 10,
      costo: 1000,
      ventaEfectivo: 2000,
      ventaTarjeta: 2500,
      talles: ['M'],
      colores: ['NEGRO'],
      imagenes: [],
    },
  ];

  const mockOrder: CustomerOrder = {
    id: 'ord_100',
    fecha: new Date().toISOString(),
    total: 4000,
    subtotal: 4000,
    costoEnvio: 0,
    tipoEnvio: 'envio',
    metodoPago: 'transferencia',
    estado: 'Entregado',
    items: [
      {
        productId: 'prod_1',
        sku: 'SKU-001',
        descripcion: 'Remera Algodón',
        cantidad: 2,
        precioUnitario: 2000,
        talle: 'M',
        color: 'NEGRO',
      },
    ],
    comprador: {
      nombre: 'Ana Perez',
      email: 'ana@example.com',
    },
  };

  describe('buildSaleItemsFromOrder', () => {
    it('correctly maps order items to SaleItem structure with historical order prices', () => {
      const saleItems = buildSaleItemsFromOrder(mockOrder, mockInventory);
      expect(saleItems).toHaveLength(1);
      expect(saleItems[0]).toEqual({
        id: 'prod_1',
        sku: 'SKU-001',
        descripcion: 'Remera Algodón (T:M C:NEGRO)',
        cantidad: 2,
        costo: 1000,
        precioEfectivo: 2000,
        precioTarjeta: 2000,
        descuento: 0,
        talle: 'M',
        color: 'NEGRO',
      });
    });

    it('uses immutable historical priceUnitario even if inventory prices differ', () => {
      const inventoryWithHigherPrices: InventoryItem[] = [
        {
          ...mockInventory[0],
          ventaEfectivo: 5000,
          ventaTarjeta: 6500,
        },
      ];
      const saleItems = buildSaleItemsFromOrder(mockOrder, inventoryWithHigherPrices);
      expect(saleItems[0].precioEfectivo).toBe(2000);
      expect(saleItems[0].precioTarjeta).toBe(2000);
    });

    it('uses fallback values if inventory item is not found and sets both prices to precioUnitario', () => {
      const orderUnknown: CustomerOrder = {
        ...mockOrder,
        items: [
          {
            productId: 'unknown_999',
            sku: '',
            descripcion: 'Producto Desconocido',
            cantidad: 1,
            precioUnitario: 1000,
          },
        ],
      };
      const saleItems = buildSaleItemsFromOrder(orderUnknown, mockInventory);
      expect(saleItems[0].sku).toBe('---');
      expect(saleItems[0].costo).toBe(0);
      expect(saleItems[0].precioEfectivo).toBe(1000);
      expect(saleItems[0].precioTarjeta).toBe(1000);
      expect(saleItems[0].descripcion).toBe('Producto Desconocido');
    });

    it('supports direct array of order items as argument', () => {
      const saleItems = buildSaleItemsFromOrder(mockOrder.items);
      expect(saleItems).toHaveLength(1);
      expect(saleItems[0].precioEfectivo).toBe(2000);
      expect(saleItems[0].precioTarjeta).toBe(2000);
    });
  });

  describe('getOrderSaleId', () => {
    it('returns saleId if present on order', () => {
      const orderWithSale: CustomerOrder = { ...mockOrder, saleId: 'custom_sale_123' };
      expect(getOrderSaleId(orderWithSale)).toBe('custom_sale_123');
    });

    it('generates fallback sale_web_{id} if saleId is missing', () => {
      expect(getOrderSaleId(mockOrder)).toBe('sale_web_ord_100');
    });
  });

  describe('isGiftCardOrder', () => {
    it('returns true if any item has isVirtualGiftCard, GIFT-CARD sku, or giftCardData', () => {
      const gcOrder: CustomerOrder = {
        ...mockOrder,
        items: [
          {
            productId: 'virtual_gift_card_123',
            sku: 'GIFT-CARD',
            descripcion: 'Gift Card para Juan',
            cantidad: 1,
            precioUnitario: 50000,
            isVirtualGiftCard: true,
          } as any,
        ],
      };
      expect(isGiftCardOrder(gcOrder)).toBe(true);
    });

    it('returns false for normal physical product orders', () => {
      expect(isGiftCardOrder(mockOrder)).toBe(false);
    });
  });

  describe('isOrderEligibleForExchange', () => {
    it('returns true for recently delivered or confirmed orders within 15 days', () => {
      expect(isOrderEligibleForExchange(mockOrder)).toBe(true);

      const confirmedOrder: CustomerOrder = { ...mockOrder, estado: 'Confirmado' };
      expect(isOrderEligibleForExchange(confirmedOrder)).toBe(true);
    });

    it('returns false for gift card orders regardless of status', () => {
      const gcOrder: CustomerOrder = {
        ...mockOrder,
        estado: 'Entregado',
        items: [
          {
            productId: 'virtual_gift_card_123',
            sku: 'GIFT-CARD',
            descripcion: 'Gift Card para Juan',
            cantidad: 1,
            precioUnitario: 50000,
            isVirtualGiftCard: true,
          } as any,
        ],
      };
      expect(isOrderEligibleForExchange(gcOrder)).toBe(false);
    });

    it('returns false if order is not registered in caja (not confirmed or delivered and no saleId)', () => {
      const pendingOrder: CustomerOrder = { ...mockOrder, estado: 'Pendiente' };
      expect(isOrderEligibleForExchange(pendingOrder)).toBe(false);
    });

    it('returns false if order is already marked as exchanged', () => {
      const exchangedOrder: CustomerOrder = { ...mockOrder, isExchanged: true };
      expect(isOrderEligibleForExchange(exchangedOrder)).toBe(false);
    });

    it('returns false if order is older than 15 days', () => {
      const twentyDaysAgo = new Date(Date.now() - 20 * 86400000).toISOString();
      const oldOrder: CustomerOrder = { ...mockOrder, fecha: twentyDaysAgo };
      expect(isOrderEligibleForExchange(oldOrder)).toBe(false);
    });

    it('returns true for orders created today in DD/MM/YYYY format', () => {
      const today = new Date();
      const d = String(today.getDate()).padStart(2, '0');
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const y = today.getFullYear();
      const localFecha = `${d}/${m}/${y}`;
      const todayOrder: CustomerOrder = { ...mockOrder, fecha: localFecha };
      expect(isOrderEligibleForExchange(todayOrder)).toBe(true);
    });

    it('returns true for orders created today in DD/MM/YYYY, HH:mm format', () => {
      const today = new Date();
      const d = String(today.getDate()).padStart(2, '0');
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const y = today.getFullYear();
      const localFecha = `${d}/${m}/${y}, 15:30`;
      const todayOrder: CustomerOrder = { ...mockOrder, fecha: localFecha };
      expect(isOrderEligibleForExchange(todayOrder)).toBe(true);
    });

    it('returns false for orders created 20 days ago in DD/MM/YYYY format', () => {
      const oldDate = new Date(Date.now() - 20 * 86400000);
      const d = String(oldDate.getDate()).padStart(2, '0');
      const m = String(oldDate.getMonth() + 1).padStart(2, '0');
      const y = oldDate.getFullYear();
      const oldFecha = `${d}/${m}/${y}`;
      const oldOrder: CustomerOrder = { ...mockOrder, fecha: oldFecha };
      expect(isOrderEligibleForExchange(oldOrder)).toBe(false);
    });

    it('supports Firestore Timestamp objects in order.fecha', () => {
      const todayOrder: CustomerOrder = {
        ...mockOrder,
        fecha: { toDate: () => new Date() } as any,
      };
      expect(isOrderEligibleForExchange(todayOrder)).toBe(true);
    });

    it('returns false when fecha is completely invalid', () => {
      const invalidOrder: CustomerOrder = { ...mockOrder, fecha: 'fecha-invalida' };
      expect(isOrderEligibleForExchange(invalidOrder)).toBe(false);
    });
  });

  describe('parseSafeDate', () => {
    it('returns null for null, undefined, or empty values', () => {
      expect(parseSafeDate(null)).toBeNull();
      expect(parseSafeDate(undefined)).toBeNull();
      expect(parseSafeDate('')).toBeNull();
    });

    it('returns valid Date instances as is and null for Invalid Date', () => {
      const validDate = new Date('2026-08-28T12:00:00.000Z');
      expect(parseSafeDate(validDate)).toBe(validDate);
      expect(parseSafeDate(new Date('invalid'))).toBeNull();
    });

    it('supports Firestore Timestamp objects with toDate()', () => {
      const target = new Date('2026-08-28T10:00:00.000Z');
      const ts = { toDate: () => target };
      expect(parseSafeDate(ts)).toBe(target);
    });

    it('supports epoch numbers in milliseconds', () => {
      const epoch = 1724889600000;
      const parsed = parseSafeDate(epoch);
      expect(parsed?.getTime()).toBe(epoch);
    });

    it('supports ISO 8601 strings', () => {
      const iso = '2026-08-28T14:30:00.000Z';
      const parsed = parseSafeDate(iso);
      expect(parsed?.toISOString()).toBe(iso);
    });

    it('correctly parses DD/MM/YYYY without swapping day and month', () => {
      // 05/08/2026 debe ser 5 de agosto, NO 8 de mayo
      const parsed = parseSafeDate('05/08/2026');
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(7); // 0-indexed: 7 es agosto
      expect(parsed?.getDate()).toBe(5);

      const parsed28 = parseSafeDate('28/08/2026');
      expect(parsed28?.getDate()).toBe(28);
      expect(parsed28?.getMonth()).toBe(7);
      expect(parsed28?.getFullYear()).toBe(2026);
    });

    it('supports DD/MM/YYYY with time and seconds', () => {
      const parsed = parseSafeDate('28/08/2026, 17:30:45');
      expect(parsed?.getDate()).toBe(28);
      expect(parsed?.getMonth()).toBe(7);
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getHours()).toBe(17);
      expect(parsed?.getMinutes()).toBe(30);
      expect(parsed?.getSeconds()).toBe(45);
    });

    it('returns null for non-date strings', () => {
      expect(parseSafeDate('no-es-una-fecha')).toBeNull();
    });
  });
});

