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
    
    expect(screen.getByDisplayValue('2000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3000')).toBeInTheDocument();
  });

  it('genera SKU automáticamente, oculta por defecto para tienda web y muestra ítem recién cargado', async () => {
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
    expect(calledWith.visible).toBe(false); // Oculto por defecto al ingresar stock
    expect(calledWith.sku).toMatch(/^S\d{4}$/); // SKU con inicial S + 4 dígitos

    // Verifica la aparición de la sección de recien cargados
    expect(screen.getByText('Recién cargados')).toBeInTheDocument();
    expect(screen.getByText('REMERA NEGRA')).toBeInTheDocument();
  });
});
