import { buildSaleItemsFromOrder, getOrderSaleId, isOrderEligibleForExchange, isGiftCardOrder } from './webOrderToSale';
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
    },
  ];

  const mockOrder: CustomerOrder = {
    id: 'ord_100',
    fecha: new Date().toISOString(),
    total: 4000,
    subtotal: 4000,
    costoEnvio: 0,
    tipoEntrega: 'envio',
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
    it('correctly maps order items to SaleItem structure with inventory prices', () => {
      const saleItems = buildSaleItemsFromOrder(mockOrder, mockInventory);
      expect(saleItems).toHaveLength(1);
      expect(saleItems[0]).toEqual({
        id: 'prod_1',
        sku: 'SKU-001',
        descripcion: 'Remera Algodón (T:M C:NEGRO)',
        cantidad: 2,
        costo: 1000,
        precioEfectivo: 2000,
        precioTarjeta: 2500,
        descuento: 0,
        talle: 'M',
        color: 'NEGRO',
      });
    });

    it('uses fallback values if inventory item is not found', () => {
      const orderUnknown: CustomerOrder = {
        ...mockOrder,
        items: [
          {
            productId: 'unknown_999',
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
      expect(saleItems[0].precioTarjeta).toBe(1270); // Math.round(1000 * 1.27)
      expect(saleItems[0].descripcion).toBe('Producto Desconocido');
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
  });
});

