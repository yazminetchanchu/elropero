import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Expenses from './Expenses';
import React from 'react';
import { Expense } from '../types';

vi.mock('lucide-react', () => ({
  Edit2: () => <span>Edit2</span>,
  Trash2: () => <span>Trash2</span>,
  X: () => <span>X</span>,
  Loader2: () => <span>Loader2</span>,
}));

describe('Componente Expenses: Egresos de Caja', () => {
  const sampleExpenses: Expense[] = [
    {
      id: 'exp-1',
      concepto: 'PACKAGING Y BOLSAS',
      monto: 15000,
      fecha: '2026-08-01',
    },
    {
      id: 'exp-2',
      concepto: 'PUBLICIDAD META',
      monto: 30000,
      fecha: '2026-08-05',
    },
  ];

  it('renderiza la lista de egresos y el mensaje de estado si no hay egresos', () => {
    const { rerender } = render(
      <Expenses
        expenses={[]}
        onAddExpense={vi.fn()}
        onUpdateExpense={vi.fn()}
        onDeleteExpense={vi.fn()}
      />
    );

    expect(screen.getByText(/Egresos de Caja/i)).toBeInTheDocument();
    expect(screen.getByText(/Sin egresos registrados/i)).toBeInTheDocument();

    rerender(
      <Expenses
        expenses={sampleExpenses}
        onAddExpense={vi.fn()}
        onUpdateExpense={vi.fn()}
        onDeleteExpense={vi.fn()}
      />
    );

    expect(screen.getByText('PACKAGING Y BOLSAS')).toBeInTheDocument();
    expect(screen.getByText('-$ 15.000')).toBeInTheDocument();
    expect(screen.getByText('PUBLICIDAD META')).toBeInTheDocument();
    expect(screen.getByText('-$ 30.000')).toBeInTheDocument();
  });

  it('permite completar el formulario y registra un nuevo egreso', () => {
    const mockOnAddExpense = vi.fn();

    render(
      <Expenses
        expenses={[]}
        onAddExpense={mockOnAddExpense}
        onUpdateExpense={vi.fn()}
        onDeleteExpense={vi.fn()}
      />
    );

    const conceptoInput = screen.getByPlaceholderText(/EJ: ALQUILER, PACKAGING, PUBLICIDAD/i);
    // El input de monto está después de la etiqueta
    const montoInputs = screen.getAllByRole('textbox');
    const montoInput = montoInputs[montoInputs.length - 1];

    fireEvent.change(conceptoInput, { target: { value: 'MANTENIMIENTO SHOWROOM' } });
    fireEvent.change(montoInput, { target: { value: '12000' } });

    const submitBtn = screen.getByRole('button', { name: /Registrar Egreso/i });
    fireEvent.click(submitBtn);

    expect(mockOnAddExpense).toHaveBeenCalledTimes(1);
    expect(mockOnAddExpense).toHaveBeenCalledWith({
      fecha: expect.any(String),
      concepto: 'MANTENIMIENTO SHOWROOM',
      monto: 12000,
    });
  });

  it('permite abrir el modal de edición y guardar cambios', () => {
    const mockOnUpdateExpense = vi.fn();

    render(
      <Expenses
        expenses={sampleExpenses}
        onAddExpense={vi.fn()}
        onUpdateExpense={mockOnUpdateExpense}
        onDeleteExpense={vi.fn()}
      />
    );

    const editButtons = screen.getAllByTitle('Editar');
    fireEvent.click(editButtons[0]);

    // Modal debe mostrar título "Editar Egreso"
    expect(screen.getByText('Editar Egreso')).toBeInTheDocument();

    const editSubmitBtn = screen.getByRole('button', { name: /Guardar Cambios/i });
    fireEvent.click(editSubmitBtn);

    expect(mockOnUpdateExpense).toHaveBeenCalledTimes(1);
  });

  it('requiere confirmación previa en dos pasos antes de eliminar un egreso', () => {
    const mockOnDeleteExpense = vi.fn();

    render(
      <Expenses
        expenses={sampleExpenses}
        onAddExpense={vi.fn()}
        onUpdateExpense={vi.fn()}
        onDeleteExpense={mockOnDeleteExpense}
      />
    );

    const deleteButtons = screen.getAllByTitle('Eliminar');
    
    // Primer clic: cambia estado a confirmar "¿Borrar?"
    fireEvent.click(deleteButtons[0]);
    expect(mockOnDeleteExpense).not.toHaveBeenCalled();
    expect(screen.getByText('¿Borrar?')).toBeInTheDocument();

    // Segundo clic: efectúa la eliminación
    fireEvent.click(deleteButtons[0]);
    expect(mockOnDeleteExpense).toHaveBeenCalledWith('exp-2');
  });
});
