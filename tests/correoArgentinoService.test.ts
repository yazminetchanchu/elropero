import { describe, it, expect } from 'vitest';
import {
  getItemWeightGrams,
  calculateCartWeightKg,
  calculateCartWeightGrams,
  calculateCartDimensions,
  CATEGORY_WEIGHTS_GRAMS,
} from '../utils/shippingHelpers';
import { InventoryItem } from '../types';

describe('Calculos de Envio y Logistica (shippingHelpers)', () => {
  const baseItem: InventoryItem = {
    id: 'p1',
    sku: 'SKU1',
    descripcion: 'Remera de Algodón',
    proveedor: 'Prov A',
    cantidad: 10,
    costo: 1000,
    ventaEfectivo: 2000,
    ventaTarjeta: 2200,
    categoria: 'Remeras Manga Corta',
    talles: ['S'],
    colores: ['Blanco'],
    imagenes: [],
  };

  describe('getItemWeightGrams', () => {
    it('retorna el peso explicito en gramos si el producto tiene pesoKg', () => {
      const itemWithWeight: InventoryItem = { ...baseItem, pesoKg: 1.2 };
      expect(getItemWeightGrams(itemWithWeight)).toBe(1200);
    });

    it('determina el peso por categoria normalizada (Musculosas)', () => {
      const item: InventoryItem = { ...baseItem, categoria: 'Musculosas y Tops' };
      expect(getItemWeightGrams(item)).toBe(CATEGORY_WEIGHTS_GRAMS['musculosas']);
    });

    it('determina el peso por categoria (Jeans)', () => {
      const item: InventoryItem = { ...baseItem, categoria: 'Jeans y Denim' };
      expect(getItemWeightGrams(item)).toBe(CATEGORY_WEIGHTS_GRAMS['jeans']);
    });

    it('retorna peso por defecto (400g) para categorias no registradas', () => {
      const item: InventoryItem = { ...baseItem, categoria: 'Accesorios Raros' };
      expect(getItemWeightGrams(item)).toBe(400);
    });
  });

  describe('calculateCartWeightKg y calculateCartWeightGrams', () => {
    it('calcula el peso total del carrito en kg y en gramos', () => {
      const cart = [
        { product: { ...baseItem, categoria: 'musculosas' }, quantity: 2 }, // 150g * 2 = 300g
        { product: { ...baseItem, categoria: 'jeans' }, quantity: 1 },      // 800g * 1 = 800g
      ]; // Total = 1100g = 1.1kg

      expect(calculateCartWeightGrams(cart)).toBe(1100);
      expect(calculateCartWeightKg(cart)).toBe(1.1);
    });

    it('garantiza un peso minimo de 1000g / 1kg para carritos vacios o sin peso', () => {
      expect(calculateCartWeightGrams([])).toBe(1000);
      expect(calculateCartWeightKg([])).toBe(1);
    });
  });

  describe('calculateCartDimensions', () => {
    it('devuelve dimensiones estandar (20x25x5 cm) para pedidos livianos o pocos items pesados', () => {
      const cart = [
        { product: { ...baseItem, categoria: 'musculosas' }, quantity: 2 },
        { product: { ...baseItem, categoria: 'jeans' }, quantity: 2 }, // pesados (>300g) = 2 items
      ];

      const dims = calculateCartDimensions(cart);
      expect(dims).toEqual({ width: 20, length: 25, height: 5 });
    });

    it('devuelve dimensiones mas grandes (30x35x10 cm) cuando hay mas de 3 prendas pesadas (>300g)', () => {
      const cart = [
        { product: { ...baseItem, categoria: 'buzos_sweaters_tejidos' }, quantity: 4 }, // 750g * 4 > 3 pesados
      ];

      const dims = calculateCartDimensions(cart);
      expect(dims).toEqual({ width: 30, length: 35, height: 10 });
    });
  });
});
