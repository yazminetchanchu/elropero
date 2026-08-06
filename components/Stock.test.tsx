import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Stock from './Stock';
import React from 'react';
import { WebSettings } from '../types';

vi.mock('lucide-react', () => ({
  Tag: () => <span>Tag</span>,
  Sparkles: () => <span>Sparkles</span>,
  PackagePlus: () => <span>PackagePlus</span>,
  CheckCircle2: () => <span>CheckCircle2</span>
}));

describe('Componente Stock: Carga de Mercadería', () => {
  const mockWebSettings: WebSettings = {
    categoriesOrder: ['Remeras', 'Pantalones']
  };

  it('renderiza correctamente el formulario', () => {
    render(<Stock onAddItem={vi.fn()} inventory={[]} webSettings={mockWebSettings} />);
    expect(screen.getByText(/Carga de Mercadería/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/BIKINI, VESTIDO, ETC./i)).toBeInTheDocument();
  });

  it('calcula precios sugeridos al ingresar costo', async () => {
    render(<Stock onAddItem={vi.fn()} inventory={[]} webSettings={mockWebSettings} />);
    const costoInput = screen.getByPlaceholderText('0');
    
    fireEvent.change(costoInput, { target: { value: '1000' } });
    
    // Debería setear los precios calculados en los inputs de precios finales
    // Efectivo: Math.ceil((1000 * 1.68) / 1000) * 1000 = 2000
    // Tarjeta: Math.ceil((2000 * 1.27) / 1000) * 1000 = 3000
    
    // Los inputs de precios finales no tienen placeholder predecible y tienen el valor pre-seteado. 
    // Podemos buscar sus valores en el documento o agarrar los inputs por clases/estructura.
    const inputs = screen.getAllByRole('textbox'); 
    // descripcion, proveedor son textboxes. precios finales también
    // mejor buscamos por display value
    expect(screen.getByDisplayValue('2000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3000')).toBeInTheDocument();
  });

  it('genera SKU automáticamente cuando se ingresa proveedor y envía formulario', async () => {
    const mockOnAddItem = vi.fn();
    render(<Stock onAddItem={mockOnAddItem} inventory={[]} webSettings={mockWebSettings} />);
    
    const descInput = screen.getByPlaceholderText(/BIKINI/i);
    const provInput = screen.getByPlaceholderText(/SKY/i);
    const catSelect = screen.getByRole('combobox');
    const costoInput = screen.getByPlaceholderText('0');

    fireEvent.change(descInput, { target: { value: 'Remera Negra' } });
    fireEvent.change(provInput, { target: { value: 'SKY' } });
    fireEvent.change(catSelect, { target: { value: 'REMERAS' } });
    fireEvent.change(costoInput, { target: { value: '1000' } });

    // El boton Confirmar debe estar habilitado
    const submitBtn = screen.getByRole('button', { name: /Confirmar/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnAddItem).toHaveBeenCalledTimes(1);
    });

    const calledWith = mockOnAddItem.mock.calls[0][0];
    expect(calledWith.descripcion).toBe('REMERA NEGRA');
    expect(calledWith.proveedor).toBe('SKY');
    expect(calledWith.categoria).toBe('REMERAS');
    expect(calledWith.costo).toBe(1000);
    expect(calledWith.ventaEfectivo).toBe(2000);
    expect(calledWith.ventaTarjeta).toBe(3000);
    expect(calledWith.sku).toMatch(/^S\d{4}$/); // Inicial de SKY = S + 4 números aleatorios
  });
});
