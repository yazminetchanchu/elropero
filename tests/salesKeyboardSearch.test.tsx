import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Sales from '../components/Sales';
import React from 'react';
import { InventoryItem } from '../types';

vi.mock('lucide-react', () => ({
  Search: () => <span>Search</span>,
  ShoppingCart: () => <span>ShoppingCart</span>,
  Trash2: () => <span>Trash2</span>,
  Plus: () => <span>Plus</span>,
  Minus: () => <span>Minus</span>,
  Percent: () => <span>Percent</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  CheckCircle2: () => <span>CheckCircle2</span>,
  Receipt: () => <span>Receipt</span>,
  CreditCard: () => <span>CreditCard</span>,
  Banknote: () => <span>Banknote</span>,
  Gift: () => <span>Gift</span>,
  RefreshCcw: () => <span>RefreshCcw</span>,
}));

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
    imagenes: [],
  },
];

describe('Sales - Atajos de Teclado del Buscador', () => {
  it('enfoca el buscador al presionar "/" cuando el foco no esta en un campo de texto', () => {
    render(
      <Sales
        inventory={mockInventory}
        onAddSale={vi.fn()}
        onDeleteSale={vi.fn()}
        recentSales={[]}
        giftCards={[]}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);

    // El input no debe estar enfocado por defecto
    expect(document.activeElement).not.toBe(searchInput);

    // Presionar '/' debe enfocar el buscador
    fireEvent.keyDown(window, { key: '/', code: 'Slash' });

    expect(document.activeElement).toBe(searchInput);
  });

  it('enfoca el buscador al presionar Ctrl+F', () => {
    render(
      <Sales
        inventory={mockInventory}
        onAddSale={vi.fn()}
        onDeleteSale={vi.fn()}
        recentSales={[]}
        giftCards={[]}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    expect(document.activeElement).toBe(searchInput);
  });

  it('limpia el buscador al presionar Escape', () => {
    render(
      <Sales
        inventory={mockInventory}
        onAddSale={vi.fn()}
        onDeleteSale={vi.fn()}
        recentSales={[]}
        giftCards={[]}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);

    // Escribir algo en el buscador
    fireEvent.change(searchInput, { target: { value: 'Remera' } });
    expect(screen.getByText('Remera Negra')).toBeInTheDocument();

    // Presionar Escape: debe limpiar el texto
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(searchInput).toHaveValue('');
  });
});
