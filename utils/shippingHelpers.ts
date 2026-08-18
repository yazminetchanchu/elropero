import { InventoryItem } from '../types';

export const CATEGORY_WEIGHTS_GRAMS: Record<string, number> = {
  'musculosas': 150,
  'remeras_manga_corta_blusas': 220,
  'remeras_manga_larga_camisas_vestidos': 300,
  'shorts_polleras_bikinis': 400,
  'saquitos_cardigans': 450,
  'pantalones': 600,
  'buzos_sweaters_tejidos': 750,
  'jeans': 800,
  'abrigos_camperas_tapados': 1500,
};

const DEFAULT_WEIGHT_GRAMS = 400; // Default if category doesn't match

/**
 * Normalizes a category string to match the keys in CATEGORY_WEIGHTS_GRAMS
 */
const normalizeCategoryString = (category: string): string => {
  if (!category) return '';
  const lower = category.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents

  // Attempt to match known keywords
  if (lower.includes('musculosa')) return 'musculosas';
  if (lower.includes('abrigo') || lower.includes('campera') || lower.includes('tapado')) return 'abrigos_camperas_tapados';
  if (lower.includes('jean')) return 'jeans';
  if (lower.includes('buzo') || lower.includes('sweater') || lower.includes('tejido')) return 'buzos_sweaters_tejidos';
  if (lower.includes('pantalon') || lower.includes('pantalones')) return 'pantalones';
  if (lower.includes('saco') || lower.includes('saquito') || lower.includes('cardigan')) return 'saquitos_cardigans';
  if (lower.includes('short') || lower.includes('pollera') || lower.includes('bikini')) return 'shorts_polleras_bikinis';
  if (lower.includes('manga larga') || lower.includes('camisa') || lower.includes('vestido')) return 'remeras_manga_larga_camisas_vestidos';
  if (lower.includes('remera') || lower.includes('manga corta') || lower.includes('blusa')) return 'remeras_manga_corta_blusas';

  return lower; // fallback to exact match attempt later
};

/**
 * Gets the weight of an item based on its category or description
 */
export const getItemWeightGrams = (item: { categoria?: string; pesoKg?: number; descripcion?: string }): number => {
  if (item.pesoKg && item.pesoKg > 0) {
    return item.pesoKg * 1000;
  }
  
  const normalizedCat = normalizeCategoryString(item.categoria || item.descripcion || '');
  return CATEGORY_WEIGHTS_GRAMS[normalizedCat] || DEFAULT_WEIGHT_GRAMS;
};

/**
 * Calculates the total weight of the cart in kilograms.
 */
export const calculateCartWeightKg = (cart: { product: InventoryItem; quantity: number }[]): number => {
  let totalGrams = 0;
  for (const cartItem of cart) {
    const weightPerUnit = getItemWeightGrams(cartItem.product);
    totalGrams += weightPerUnit * cartItem.quantity;
  }
  
  // Correo Argentino might require minimum 1kg, but let's just return actual kg
  const totalKg = totalGrams / 1000;
  return totalKg > 0 ? totalKg : 1; // Minimum 1kg for safe quoting if cart is empty but being calculated
};

/**
 * Calculates the total weight of the cart in grams.
 */
export const calculateCartWeightGrams = (cart: { product: InventoryItem; quantity: number }[]): number => {
  let totalGrams = 0;
  for (const cartItem of cart) {
    const weightPerUnit = getItemWeightGrams(cartItem.product);
    totalGrams += weightPerUnit * cartItem.quantity;
  }
  
  return totalGrams > 0 ? totalGrams : 1000; // Minimum 1000g for safe quoting
};

/**
 * Calculates the dimensions of the cart based on the number of heavy items.
 * Default standard package: 20x25x5 cm (width x length x height)
 * If quantity of products with weight > 300g is > 3, then 30x35x10 cm.
 */
export const calculateCartDimensions = (cart: { product: InventoryItem; quantity: number }[]) => {
  let heavyItemsCount = 0;

  for (const cartItem of cart) {
    const weightPerUnit = getItemWeightGrams(cartItem.product);
    if (weightPerUnit > 300) {
      heavyItemsCount += cartItem.quantity;
    }
  }

  if (heavyItemsCount > 3) {
    return { width: 30, length: 35, height: 10 };
  } else {
    return { width: 20, length: 25, height: 5 };
  }
};

/**
 * Calculates total weight in grams for a list of sale items (e.g. returned items in exchange).
 */
export const calculateSaleItemsWeightGrams = (items: { descripcion: string; cantidad: number; pesoKg?: number }[]): number => {
  let totalGrams = 0;
  for (const item of items) {
    const weightPerUnit = getItemWeightGrams(item);
    totalGrams += weightPerUnit * item.cantidad;
  }
  return totalGrams > 0 ? totalGrams : 1000;
};

/**
 * Calculates dimensions for a list of sale items (e.g. returned items in exchange).
 */
export const calculateSaleItemsDimensions = (items: { descripcion: string; cantidad: number; pesoKg?: number }[]) => {
  let heavyItemsCount = 0;
  for (const item of items) {
    const weightPerUnit = getItemWeightGrams(item);
    if (weightPerUnit > 300) {
      heavyItemsCount += item.cantidad;
    }
  }

  if (heavyItemsCount > 3) {
    return { width: 30, length: 35, height: 10 };
  } else {
    return { width: 20, length: 25, height: 5 };
  }
};

