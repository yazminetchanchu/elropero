import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GiftCards from './GiftCard';
import { GiftCard } from '../types';

describe('GiftCards Component', () => {
  const mockGiftCards: GiftCard[] = [
    {
      id: 'gc_1',
      codigo: 'GC-1001',
      montoInicial: 10000,
      saldo: 10000,
      destinatario: 'Camila Gomez',
      fechaEmision: new Date().toISOString(),
      estado: 'ACTIVA',
      email: 'camila@test.com',
      mensaje: '¡Feliz Cumpleaños!',
    },
    {
      id: 'gc_2',
      codigo: 'GC-1002',
      montoInicial: 5000,
      saldo: 0,
      destinatario: 'Lucas Rivas',
      fechaEmision: new Date().toISOString(),
      estado: 'AGOTADA',
    },
  ];

  const mockOnAdd = vi.fn();
  const mockOnUpdate = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders GiftCard list with state badges and balance information', () => {
    render(
      <GiftCards
        giftCards={mockGiftCards}
        onAddGiftCard={mockOnAdd}
        onUpdateGiftCard={mockOnUpdate}
        onCancelGiftCard={mockOnCancel}
      />
    );

    expect(screen.getByText('Camila Gomez')).toBeInTheDocument();
    expect(screen.getByText('GC-1001')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();

    expect(screen.getByText('Lucas Rivas')).toBeInTheDocument();
    expect(screen.getByText('GC-1002')).toBeInTheDocument();
    expect(screen.getByText('Agotada')).toBeInTheDocument();
  });

  it('filters GiftCards based on search input', () => {
    render(
      <GiftCards
        giftCards={mockGiftCards}
        onAddGiftCard={mockOnAdd}
        onUpdateGiftCard={mockOnUpdate}
        onCancelGiftCard={mockOnCancel}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Buscar gift card por nombre o código\.\.\./i);
    fireEvent.change(searchInput, { target: { value: 'Lucas' } });

    expect(screen.queryByText('Camila Gomez')).not.toBeInTheDocument();
    expect(screen.getByText('Lucas Rivas')).toBeInTheDocument();
  });

  it('allows creating a new gift card with custom fields', () => {
    const { container } = render(
      <GiftCards
        giftCards={mockGiftCards}
        onAddGiftCard={mockOnAdd}
        onUpdateGiftCard={mockOnUpdate}
        onCancelGiftCard={mockOnCancel}
      />
    );

    // Fill form
    const destinatarioInput = screen.getByPlaceholderText('Nombre del destinatario');
    fireEvent.change(destinatarioInput, { target: { value: 'Sofia Rossi' } });

    const montoInput = screen.getByPlaceholderText('0');
    fireEvent.change(montoInput, { target: { value: '15000' } });

    const submitBtn = container.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    expect(mockOnAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        destinatario: 'Sofia Rossi',
        montoInicial: 15000,
      })
    );
  });
});
