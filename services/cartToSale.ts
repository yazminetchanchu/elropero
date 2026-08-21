import { InventoryItem, SaleItem } from '../types';

export interface StorefrontCartLine {
  product: InventoryItem;
  quantity: number;
  selectedTalle?: string;
  selectedColor?: string;
}

export function cartLinesToSaleItems(
  lines: StorefrontCartLine[],
  getDiscount: (item: InventoryItem) => number
): SaleItem[] {
  return lines.map((c) => {
    const disc = getDiscount(c.product);
    const variant =
      [c.selectedTalle && `T:${c.selectedTalle}`, c.selectedColor && `C:${c.selectedColor}`]
        .filter(Boolean)
        .join(' ') || '';

    return {
      id: c.product.id,
      sku: c.product.sku,
      descripcion: variant ? `${c.product.descripcion} (${variant})` : c.product.descripcion,
      cantidad: c.quantity,
      costo: c.product.costo,
      precioEfectivo: c.product.ventaEfectivo,
      precioTarjeta: c.product.ventaTarjeta,
      descuento: disc,
      talle: c.selectedTalle,
      color: c.selectedColor,
    };
  });
}

/** Extrae color del texto de variante en descripción (T: / C:). */
export function parseVariantFromDescripcion(descripcion: string): {
  color?: string;
  talle?: string;
} {
  const colorMatch = descripcion.match(/\(.*?C:([^\s)]+)/i);
  const talleMatch = descripcion.match(/\(.*?T:([^\s)]+)/i);
  return {
    color: colorMatch?.[1]?.trim().toUpperCase(),
    talle: talleMatch?.[1]?.trim(),
  };
}
