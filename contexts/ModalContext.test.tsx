import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ModalProvider, useModal } from './ModalContext';

const TestComponent = () => {
  const { showAlert, showConfirm } = useModal();
  const [result, setResult] = React.useState<string>('');

  const handleAlert = async () => {
    await showAlert('Este es un mensaje de alerta', 'Atención', 'info');
    setResult('Alert cerrado');
  };

  const handleConfirm = async () => {
    const accepted = await showConfirm('¿Estás seguro de eliminar?', 'Confirmación', 'warning');
    setResult(accepted ? 'Confirmado' : 'Cancelado');
  };

  return (
    <div>
      <button onClick={handleAlert}>Abrir Alerta</button>
      <button onClick={handleConfirm}>Abrir Confirmación</button>
      <span data-testid="result">{result}</span>
    </div>
  );
};

describe('ModalContext & ModalProvider', () => {
  it('shows alert modal and resolves promise when accepted', async () => {
    render(
      <ModalProvider>
        <TestComponent />
      </ModalProvider>
    );

    fireEvent.click(screen.getByText('Abrir Alerta'));

    expect(await screen.findByText('Atención')).toBeInTheDocument();
    expect(screen.getByText('Este es un mensaje de alerta')).toBeInTheDocument();

    const acceptBtn = screen.getByRole('button', { name: 'Entendido' });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('Alert cerrado');
    });
  });

  it('shows confirm modal and resolves true on accept, false on cancel', async () => {
    render(
      <ModalProvider>
        <TestComponent />
      </ModalProvider>
    );

    // Test Cancel flow
    fireEvent.click(screen.getByText('Abrir Confirmación'));
    expect(await screen.findByText('Confirmación')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('Cancelado');
    });

    // Test Accept flow
    fireEvent.click(screen.getByText('Abrir Confirmación'));
    expect(await screen.findByText('Confirmación')).toBeInTheDocument();

    const acceptBtn = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('Confirmado');
    });
  });
});
