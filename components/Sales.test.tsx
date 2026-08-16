import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Sales from './Sales';
import React from 'react';
import { InventoryItem, WebSettings } from '../types';

// Mocks
vi.mock('lucide-react', () => ({
  Search: () => <span>Search</span>,
  ShoppingCart: () => <span>ShoppingCart</span>,
  Trash2: () => <span>Trash2</span>,
  Plus: () => <span>Plus</span>,
  Minus: () => <span>Minus</span>,
  Percent: () => <span>Percent</span>,
  CheckCircle2: () => <span>CheckCircle2</span>,
  Receipt: () => <span>Receipt</span>,
  CreditCard: () => <span>CreditCard</span>,
  Banknote: () => <span>Banknote</span>,
  Gift: () => <span>Gift</span>,
  RefreshCcw: () => <span>RefreshCcw</span>
}));

describe('Componente Sales', () => {
  const mockInventory: InventoryItem[] = [
    {
      id: 'prod-1',
      sku: 'SKU1',
      descripcion: 'Remera Negra',
      proveedor: 'P1',
      categoria: 'REMERAS',
      cantidad: 10,
      costo: 1000,
      ventaEfectivo: 2000,
      ventaTarjeta: 2500,
      talles: [],
      colores: [],
      imagenes: []
    }
  ];

  const mockWebSettings: WebSettings = {};

  it('renderiza la vista de ventas', () => {
    render(<Sales inventory={mockInventory} onAddSale={vi.fn()} onDeleteSale={vi.fn()} recentSales={[]} giftCards={[]} />);
    expect(screen.getByText(/Caja/i)).toBeInTheDocument();
  });

  it('permite buscar productos y agregarlos al carrito', () => {
    render(<Sales inventory={mockInventory} onAddSale={vi.fn()} onDeleteSale={vi.fn()} recentSales={[]} giftCards={[]} />);
    
    // Buscar
    const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);
    fireEvent.change(searchInput, { target: { value: 'Remera' } });
    
    // Ver si aparece
    expect(screen.getByText('Remera Negra')).toBeInTheDocument();

    // El producto se agrega al carrito con onMouseDown en el div.
    // Busquemos el contenedor que tiene "Remera Negra" y hagamos click
    const productItem = screen.getByText('Remera Negra').closest('div');
    if (productItem) {
        fireEvent.mouseDown(productItem);
    }

    // Verificar si se agrego al carrito. El carrito muestra "TOTAL"
    // Buscamos un label de Cantidad en el carrito
    expect(screen.getByText(/Cant:/i)).toBeInTheDocument();
  });

  it('no muestra descuento en precio efectivo cuando el descuento es inferior o igual al 20%', () => {
    render(<Sales inventory={mockInventory} onAddSale={vi.fn()} onDeleteSale={vi.fn()} recentSales={[]} giftCards={[]} />);

    // Buscar y agregar al carrito
    const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);
    fireEvent.change(searchInput, { target: { value: 'Remera' } });
    const productItem = screen.getByText('Remera Negra').closest('div');
    if (productItem) {
      fireEvent.mouseDown(productItem);
    }

    // Aplicar descuento del 10%
    const descInput = screen.getByPlaceholderText('0');
    fireEvent.change(descInput, { target: { value: '10' } });

    // El precio en tarjeta ($2500) debe tener descuento (mostrar $2.250)
    expect(screen.getByText('$2.250')).toBeInTheDocument();

    // El precio en efectivo ($2000) NO debe estar tachado (clase line-through)
    const precioEfectivoSpan = screen.getByText('$2.000');
    expect(precioEfectivoSpan).not.toHaveClass('line-through');
  });
});
