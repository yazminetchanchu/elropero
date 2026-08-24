import { describe, it, expect, vi } from 'vitest';
import { cartLinesToSaleItems, parseVariantFromDescripcion, StorefrontCartLine } from './cartToSale';
import { InventoryItem } from '../types';

describe('cartToSale service', () => {
  const mockProduct: InventoryItem = {
    id: 'prod-1',
    sku: 'P1',
    descripcion: 'Remera',
    proveedor: 'Prov 1',
    cantidad: 10,
    costo: 100,
    categoria: 'REMERAS',
    talles: ['S', 'M', 'L'],
    colores: ['ROJO', 'AZUL', 'VERDE'],
    imagenes: [],
    ventaEfectivo: 200,
    ventaTarjeta: 250,
  };

  const mockProduct2: InventoryItem = {
    id: 'prod-2',
    sku: 'P2',
    descripcion: 'Pantalón Cargo',
    proveedor: 'Prov 2',
    cantidad: 5,
    costo: 500,
    categoria: 'PANTALONES',
    talles: ['38', '40'],
    colores: ['NEGRO'],
    imagenes: [],
    ventaEfectivo: 1000,
    ventaTarjeta: 1200,
  };

  describe('cartLinesToSaleItems', () => {
    it('convierte un item simple correctamente sin variantes ni descuento', () => {
      const lines: StorefrontCartLine[] = [
        { product: mockProduct, quantity: 2 }
      ];
      const getDiscount = vi.fn().mockReturnValue(0);

      const result = cartLinesToSaleItems(lines, getDiscount);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'prod-1',
        sku: 'P1',
        descripcion: 'Remera',
        cantidad: 2,
        costo: 100,
        precioEfectivo: 200,
        precioTarjeta: 250,
        descuento: 0,
        talle: undefined,
        color: undefined,
      });
      expect(getDiscount).toHaveBeenCalledWith(mockProduct);
    });

    it('incluye ambas variantes (talle y color) en la descripción y atributos', () => {
      const lines: StorefrontCartLine[] = [
        { product: mockProduct, quantity: 1, selectedTalle: 'M', selectedColor: 'AZUL' }
      ];
      const getDiscount = vi.fn().mockReturnValue(0);

      const result = cartLinesToSaleItems(lines, getDiscount);

      expect(result[0].descripcion).toBe('Remera (T:M C:AZUL)');
      expect(result[0].talle).toBe('M');
      expect(result[0].color).toBe('AZUL');
    });

    it('incluye solo talle si no se especificó color', () => {
      const lines: StorefrontCartLine[] = [
        { product: mockProduct, quantity: 1, selectedTalle: 'L' }
      ];
      const getDiscount = vi.fn().mockReturnValue(0);

      const result = cartLinesToSaleItems(lines, getDiscount);

      expect(result[0].descripcion).toBe('Remera (T:L)');
      expect(result[0].talle).toBe('L');
      expect(result[0].color).toBeUndefined();
    });

    it('incluye solo color si no se especificó talle', () => {
      const lines: StorefrontCartLine[] = [
        { product: mockProduct, quantity: 1, selectedColor: 'VERDE' }
      ];
      const getDiscount = vi.fn().mockReturnValue(0);

      const result = cartLinesToSaleItems(lines, getDiscount);

      expect(result[0].descripcion).toBe('Remera (C:VERDE)');
      expect(result[0].talle).toBeUndefined();
      expect(result[0].color).toBe('VERDE');
    });

    it('procesa múltiples líneas de carrito con diferentes productos y variantes', () => {
      const lines: StorefrontCartLine[] = [
        { product: mockProduct, quantity: 2, selectedTalle: 'S', selectedColor: 'ROJO' },
        { product: mockProduct2, quantity: 1, selectedTalle: '40', selectedColor: 'NEGRO' },
      ];
      const getDiscount = vi.fn((item) => (item.id === 'prod-1' ? 20 : 50));

      const result = cartLinesToSaleItems(lines, getDiscount);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'prod-1',
        sku: 'P1',
        descripcion: 'Remera (T:S C:ROJO)',
        cantidad: 2,
        costo: 100,
        precioEfectivo: 200,
        precioTarjeta: 250,
        descuento: 20,
        talle: 'S',
        color: 'ROJO',
      });
      expect(result[1]).toEqual({
        id: 'prod-2',
        sku: 'P2',
        descripcion: 'Pantalón Cargo (T:40 C:NEGRO)',
        cantidad: 1,
        costo: 500,
        precioEfectivo: 1000,
        precioTarjeta: 1200,
        descuento: 50,
        talle: '40',
        color: 'NEGRO',
      });
    });

    it('aplica correctamente funciones de descuento dinámicas', () => {
      const lines: StorefrontCartLine[] = [
        { product: mockProduct, quantity: 3 }
      ];
      const dynamicDiscount = vi.fn((item: InventoryItem) => {
        return 5 * lines[0].quantity;
      });

      const result = cartLinesToSaleItems(lines, dynamicDiscount);

      expect(result).toHaveLength(1);
      expect(result[0].descuento).toBe(15);
    });

    it('retorna array vacío si se pasa un carrito vacío', () => {
      const getDiscount = vi.fn().mockReturnValue(0);
      const result = cartLinesToSaleItems([], getDiscount);
      expect(result).toEqual([]);
    });
  });

  describe('parseVariantFromDescripcion', () => {
    it('extrae el color y talle correctamente en formato estándar', () => {
      const res1 = parseVariantFromDescripcion('Remera (T:M C:AZUL)');
      expect(res1.talle).toBe('M');
      expect(res1.color).toBe('AZUL');
    });

    it('extrae color y talle independientemente del orden de los tags', () => {
      const res = parseVariantFromDescripcion('Vestido Seda (C:ROJO T:XL)');
      expect(res.talle).toBe('XL');
      expect(res.color).toBe('ROJO');
    });

    it('extrae correctamente solo talle', () => {
      const res2 = parseVariantFromDescripcion('Pantalón (T:38)');
      expect(res2.talle).toBe('38');
      expect(res2.color).toBeUndefined();
    });

    it('extrae correctamente solo color en mayúsculas', () => {
      const res3 = parseVariantFromDescripcion('Zapatos (C:NEGRO)');
      expect(res3.talle).toBeUndefined();
      expect(res3.color).toBe('NEGRO');
    });

    it('soporta minúsculas en los tags y normaliza el color a mayúsculas', () => {
      const res = parseVariantFromDescripcion('Camisa Lino (t:s c:blanco)');
      expect(res.talle).toBe('s');
      expect(res.color).toBe('BLANCO');
    });

    it('retorna undefined para ambos campos si la descripción no contiene variantes', () => {
      const res4 = parseVariantFromDescripcion('Accesorio comun');
      expect(res4.talle).toBeUndefined();
      expect(res4.color).toBeUndefined();
    });

    it('maneja strings con texto complejo o paréntesis adicionales', () => {
      const res = parseVariantFromDescripcion('Top Deportivo (Edición Especial) (T:M C:NEGRO)');
      expect(res.talle).toBe('M');
      expect(res.color).toBe('NEGRO');
    });
  });
});
