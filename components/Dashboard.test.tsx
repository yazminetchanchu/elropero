import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Dashboard from './Dashboard';
import React from 'react';

// Mock de iconos
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Edit2: () => <span data-testid="edit-icon">Edit2</span>,
    Trash2: () => <span data-testid="trash-icon">Trash2</span>,
    Minus: () => <span data-testid="minus-icon">Minus</span>,
    Plus: () => <span data-testid="plus-icon">Plus</span>,
  };
});

// Mock de servicios financieros con retornos consistentes
vi.mock('../services/finance', () => ({
  computeSaleBreakdown: vi.fn(() => ({ efectivo: 100, tarjeta: 0, ganancia: 50, costoTotal: 50, totalCobrado: 100 })),
  isMonth: vi.fn(() => true),
  calcTrend: vi.fn(() => ({ value: 10, isPositive: true }))
}));

describe('Dashboard: Pruebas de Interfaz y Funcionalidad', () => {
  const mockInventory = [
    { id: '1', sku: 'SKU123', descripcion: 'Remera Blanca', proveedor: 'Prov A', costo: 1000, ventaEfectivo: 2000, ventaTarjeta: 2200, cantidad: 5 },
    { id: '2', sku: 'SKU456', descripcion: 'Jeans Azul', proveedor: 'Prov B', costo: 2000, ventaEfectivo: 4000, ventaTarjeta: 4400, cantidad: 3 }
  ];

  const mockProps = {
    inventory: mockInventory,
    sales: [],
    expenses: [],
    giftCards: [],
    closures: [],
    webSettings: { categoriesOrder: ['Remeras', 'Jeans'] },
    onUpdateItem: vi.fn(),
    onDeleteItem: vi.fn()
  };

  it('Renderizado de Inventario: debe mostrar todos los items cargados', () => {
    render(<Dashboard {...mockProps} />);
    expect(screen.getByText(/Remera Blanca/i)).toBeInTheDocument();
  });

  it('Búsqueda de Inventario: debe filtrar la lista según el término ingresado', () => {
    render(<Dashboard {...mockProps} />);
    const searchInput = screen.getByPlaceholderText(/BUSCAR.../i);
    fireEvent.change(searchInput, { target: { value: 'Jeans' } });
    expect(screen.getByText(/Jeans Azul/i)).toBeInTheDocument();
    expect(screen.queryByText(/Remera Blanca/i)).not.toBeInTheDocument();
  });

  it('Métricas Superiores: debe abrir el modal de análisis al hacer clic en Ganancia', () => {
    render(<Dashboard {...mockProps} />);
    const gananciaCard = screen.getByTestId('metric-ganancia');
    fireEvent.click(gananciaCard);
    expect(screen.getByText(/Análisis de Ganancias/i)).toBeInTheDocument();
  });

  it('Eliminación de Items: debe llamar a la función onDeleteItem al clicar en el botón de basura', () => {
    render(<Dashboard {...mockProps} />);
    
    // Buscamos el primer icono de basura y clicamos en su botón contenedor
    const trashIcon = screen.getAllByTestId('trash-icon')[0];
    const deleteBtn = trashIcon.closest('button');
    
    if (deleteBtn) {
      // PRIMER CLIC: Activa estado de confirmación (botón se pone rojo)
      fireEvent.click(deleteBtn);
      
      // SEGUNDO CLIC: Confirma la eliminación
      fireEvent.click(deleteBtn);
    }
    
    expect(mockProps.onDeleteItem).toHaveBeenCalled();
  });

  it('Actualización Rápida de Stock: debe restar y sumar unidades al clicar en los botones Minus/Plus', () => {
    render(<Dashboard {...mockProps} />);
    
    // El botón para restar stock (Minus) del primer ítem en tabla (Jeans Azul, id '2', cantidad original 3)
    const minusIcons = screen.getAllByTestId('minus-icon');
    const minusBtn = minusIcons[0].closest('button');
    if (minusBtn) {
      fireEvent.click(minusBtn);
      expect(mockProps.onUpdateItem).toHaveBeenCalledWith(expect.objectContaining({ id: '2', cantidad: 2 }));
    }

    // El botón para sumar stock (Plus) del primer ítem en tabla (Jeans Azul, id '2', cantidad original 3)
    const plusIcons = screen.getAllByTestId('plus-icon');
    const plusBtn = plusIcons[0].closest('button');
    if (plusBtn) {
      fireEvent.click(plusBtn);
      expect(mockProps.onUpdateItem).toHaveBeenCalledWith(expect.objectContaining({ id: '2', cantidad: 4 }));
    }
  });
});
