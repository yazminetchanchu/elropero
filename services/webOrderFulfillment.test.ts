import { describe, it, expect } from 'vitest';
import { deductInventory, restoreInventory, verifyStock, WebOrderItem } from './webOrderFulfillment';
import { InventoryItem } from '../types';

describe('webOrderFulfillment stock tests', () => {
  const mockInventory: InventoryItem[] = [
    {
      id: 'prod-1',
      sku: 'P1',
      descripcion: 'Remera',
      proveedor: 'Prov 1',
      cantidad: 10,
      costo: 100,
      categoria: 'REMERAS',
      ventaEfectivo: 200,
      ventaTarjeta: 250,
      talles: ['S', 'M'],
      colores: ['ROJO', 'AZUL'],
      imagenes: [],
      stockPorVariante: {
        'S-ROJO': 2,
        'M-AZUL': 5,
      },
      coloresStock: {
        'ROJO': 2,
        'AZUL': 5
      }
    },
    {
      id: 'prod-2',
      sku: 'P2',
      descripcion: 'Pantalon',
      proveedor: 'Prov 1',
      cantidad: 8,
      costo: 200,
      categoria: 'PANTALONES',
      ventaEfectivo: 400,
      ventaTarjeta: 450,
      imagenes: [],
      coloresStock: {
        'NEGRO': 8
      }
    },
    {
      id: 'prod-3',
      sku: 'P3',
      descripcion: 'Gorra',
      proveedor: 'Prov 1',
      cantidad: 15,
      costo: 50,
      categoria: 'ACCESORIOS',
      ventaEfectivo: 100,
      ventaTarjeta: 120,
      imagenes: [],
    }
  ];

  it('deductInventory: descuenta correctamente stock de variante y general', () => {
    const items: WebOrderItem[] = [
      { productId: 'prod-1', descripcion: 'Remera', sku: 'P1', cantidad: 2, precioUnitario: 200, talle: 'M', color: 'AZUL' }
    ];
    
    const newInv = deductInventory(mockInventory, items);
    
    const updatedProd1 = newInv.find(i => i.id === 'prod-1')!;
    expect(updatedProd1.cantidad).toBe(8); // 10 - 2
    expect(updatedProd1.stockPorVariante!['M-AZUL']).toBe(3); // 5 - 2
    expect(updatedProd1.coloresStock!['AZUL']).toBe(3); // 5 - 2
  });

  it('restoreInventory: restaura correctamente stock de variante y general', () => {
    const items: WebOrderItem[] = [
      { productId: 'prod-1', descripcion: 'Remera', sku: 'P1', cantidad: 2, precioUnitario: 200, talle: 'M', color: 'AZUL' }
    ];
    
    const newInv = deductInventory(mockInventory, items);
    const restoredInv = restoreInventory(newInv, items);
    
    const restoredProd1 = restoredInv.find(i => i.id === 'prod-1')!;
    expect(restoredProd1.cantidad).toBe(10);
    expect(restoredProd1.stockPorVariante!['M-AZUL']).toBe(5);
    expect(restoredProd1.coloresStock!['AZUL']).toBe(5);
  });

  it('verifyStock: lanza error si no hay stock suficiente (variante)', () => {
    const items: WebOrderItem[] = [
      { productId: 'prod-1', descripcion: 'Remera', sku: 'P1', cantidad: 10, precioUnitario: 200, talle: 'S', color: 'ROJO' }
    ];
    
    expect(() => verifyStock(mockInventory, items)).toThrowError(/No hay stock suficiente para/);
  });

  it('verifyStock: pasa si hay stock suficiente', () => {
    const items: WebOrderItem[] = [
      { productId: 'prod-1', descripcion: 'Remera', sku: 'P1', cantidad: 1, precioUnitario: 200, talle: 'S', color: 'ROJO' }
    ];
    
    expect(() => verifyStock(mockInventory, items)).not.toThrow();
  });

  it('deductInventory: maneja productos sin variantes', () => {
    const items: WebOrderItem[] = [
      { productId: 'prod-3', descripcion: 'Gorra', sku: 'P3', cantidad: 5, precioUnitario: 100 }
    ];
    
    const newInv = deductInventory(mockInventory, items);
    
    const updatedProd3 = newInv.find(i => i.id === 'prod-3')!;
    expect(updatedProd3.cantidad).toBe(10);
  });
});
