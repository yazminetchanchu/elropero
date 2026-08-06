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
    talles: ['S', 'M'],
    colores: ['ROJO', 'AZUL'],
    imagenes: [],
    ventaEfectivo: 200,
    ventaTarjeta: 250,
  };

  it('cartLinesToSaleItems: converte un item simple correctamente sin variantes', () => {
    const lines: StorefrontCartLine[] = [
      { product: mockProduct, quantity: 2 }
    ];
    const getDiscount = vi.fn().mockReturnValue(10);

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
      descuento: 10,
    });
  });

  it('cartLinesToSaleItems: incluye la variante en la descripcion', () => {
    const lines: StorefrontCartLine[] = [
      { product: mockProduct, quantity: 1, selectedTalle: 'M', selectedColor: 'AZUL' }
    ];
    const getDiscount = vi.fn().mockReturnValue(0);

    const result = cartLinesToSaleItems(lines, getDiscount);

    expect(result[0].descripcion).toBe('Remera (T:M C:AZUL)');
  });

  it('parseVariantFromDescripcion: extrae el color y talle correctamente', () => {
    const res1 = parseVariantFromDescripcion('Remera (T:M C:AZUL)');
    expect(res1.talle).toBe('M');
    expect(res1.color).toBe('AZUL');

    const res2 = parseVariantFromDescripcion('Pantalón (T:38)');
    expect(res2.talle).toBe('38');
    expect(res2.color).toBeUndefined();

    const res3 = parseVariantFromDescripcion('Zapatos (C:NEGRO)');
    expect(res3.talle).toBeUndefined();
    expect(res3.color).toBe('NEGRO');

    const res4 = parseVariantFromDescripcion('Accesorio comun');
    expect(res4.talle).toBeUndefined();
    expect(res4.color).toBeUndefined();
  });
  it('cartLinesToSaleItems: aplica correctamente funciones de porcentaje/descuento dinámicas', () => {
    const lines: StorefrontCartLine[] = [
      { product: mockProduct, quantity: 3 }
    ];
    // Por ejemplo, calcular un porcentaje basado en la cantidad
    const dynamicDiscount = vi.fn().mockImplementation((item: InventoryItem) => {
      // 5% de descuento por cada unidad
      return 5 * lines[0].quantity;
    });

    const result = cartLinesToSaleItems(lines, dynamicDiscount);

    expect(result).toHaveLength(1);
    expect(result[0].descuento).toBe(15);
  });
});
