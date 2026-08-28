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

/** Extrae talle y color del texto de variante en descripción (T: / C:). */
export function parseVariantFromDescripcion(descripcion: string): {
  talle?: string;
  color?: string;
} {
  if (!descripcion) return {};

  // Extrae talle: busca 'T:' y captura hasta encontrar 'C:' o el cierre ')'
  const talleMatch = descripcion.match(/\(.*?T:([^)]*?)(?:\s+C:|\))/i);

  // Extrae color: busca 'C:' y captura hasta encontrar 'T:' o el cierre ')'
  const colorMatch = descripcion.match(/\(.*?C:([^)]*?)(?:\s+T:|\))/i);

  const talle = talleMatch && talleMatch[1].trim() ? talleMatch[1].trim().toUpperCase() : undefined;
  const color = colorMatch && colorMatch[1].trim() ? colorMatch[1].trim().toUpperCase() : undefined;

  return { talle, color };
}

