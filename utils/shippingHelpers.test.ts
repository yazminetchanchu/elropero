import { describe, it, expect } from 'vitest';
import {
  getItemWeightGrams,
  calculateCartWeightKg,
  calculateCartWeightGrams,
  calculateCartDimensions,
  calculateSaleItemsWeightGrams,
  calculateSaleItemsDimensions,
} from './shippingHelpers';
import { InventoryItem } from '../types';

describe('shippingHelpers - Cálculo de Pesos y Dimensiones', () => {
  const sampleItemBase: InventoryItem = {
    id: 'item-1',
    sku: 'S1001',
    descripcion: 'Remera Algodón',
    proveedor: 'SKY',
    cantidad: 10,
    costo: 1000,
    categoria: 'REMERAS',
    talles: ['S', 'M'],
    colores: ['Negro'],
    imagenes: [],
    ventaEfectivo: 2000,
    ventaTarjeta: 3000,
  };

  describe('getItemWeightGrams', () => {
    it('prioriza el peso explicito pesoKg si esta definido en el producto', () => {
      const itemWithCustomWeight: InventoryItem = {
        ...sampleItemBase,
        pesoKg: 1.25, // 1250g
      };
      expect(getItemWeightGrams(itemWithCustomWeight)).toBe(1250);
    });

    it('infiere el peso según la categoría conocida (ej. Jeans -> 800g)', () => {
      const jeanItem: InventoryItem = { ...sampleItemBase, categoria: 'Jeans de Dama' };
      expect(getItemWeightGrams(jeanItem)).toBe(800);
    });

    it('infiere el peso para abrigos y camperas (1500g)', () => {
      const abrigoItem: InventoryItem = { ...sampleItemBase, categoria: 'Abrigos y camperas' };
      expect(getItemWeightGrams(abrigoItem)).toBe(1500);
    });

    it('retorna el peso por defecto (400g) si la categoría no coincide con ninguna regla', () => {
      const unknownCatItem: InventoryItem = { ...sampleItemBase, categoria: 'Accesorios Varios' };
      expect(getItemWeightGrams(unknownCatItem)).toBe(400);
    });
  });

  describe('calculateCartWeightKg y calculateCartWeightGrams', () => {
    it('retorna mínimo 1kg / 1000g para carritos vacíos para cotización segura', () => {
      expect(calculateCartWeightKg([])).toBe(1);
      expect(calculateCartWeightGrams([])).toBe(1000);
    });

    it('calcula el peso acumulado del carrito según la cantidad de prendas', () => {
      const remera: InventoryItem = { ...sampleItemBase, categoria: 'Musculosas' }; // 150g
      const jean: InventoryItem = { ...sampleItemBase, categoria: 'Jeans' }; // 800g

      const cart = [
        { product: remera, quantity: 2 }, // 300g
        { product: jean, quantity: 1 },   // 800g
      ];

      expect(calculateCartWeightGrams(cart)).toBe(1100);
      expect(calculateCartWeightKg(cart)).toBe(1.1);
    });
  });

  describe('calculateCartDimensions', () => {
    it('retorna dimensiones estándar (20x25x5 cm) si hay 3 o menos prendas pesadas (>300g)', () => {
      const jean: InventoryItem = { ...sampleItemBase, categoria: 'Jeans' }; // 800g > 300g
      const cart = [{ product: jean, quantity: 2 }];

      const dims = calculateCartDimensions(cart);
      expect(dims).toEqual({ width: 20, length: 25, height: 5 });
    });

    it('retorna paquete grande (30x35x10 cm) si hay más de 3 prendas pesadas (>300g)', () => {
      const jean: InventoryItem = { ...sampleItemBase, categoria: 'Jeans' }; // 800g > 300g
      const cart = [{ product: jean, quantity: 4 }];

      const dims = calculateCartDimensions(cart);
      expect(dims).toEqual({ width: 30, length: 35, height: 10 });
    });
  });

  describe('calculateSaleItemsWeightGrams y calculateSaleItemsDimensions', () => {
    it('calcula peso en gramos para lista de SaleItem (prendas devueltas)', () => {
      const saleItems = [
        { descripcion: 'Jean Azul Talle 40', cantidad: 1 }, // 800g
        { descripcion: 'Musculosa Blanca', cantidad: 2 },  // 150g * 2 = 300g
      ];

      expect(calculateSaleItemsWeightGrams(saleItems)).toBe(1100);
    });

    it('calcula dimensiones para lista de SaleItem devueltos', () => {
      const saleItemsHeavy = [
        { descripcion: 'Jean Azul Talle 40', cantidad: 4 } // 4 items > 300g
      ];

      expect(calculateSaleItemsDimensions(saleItemsHeavy)).toEqual({ width: 30, length: 35, height: 10 });
    });
  });
});

