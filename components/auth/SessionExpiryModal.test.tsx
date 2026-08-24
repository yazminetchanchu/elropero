import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import SessionExpiryModal from './SessionExpiryModal';
import * as AuthContextModule from '../../contexts/AuthContext';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('SessionExpiryModal Component', () => {
  const mockReauthenticate = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (AuthContextModule.useAuth as any).mockReturnValue({
      user: { uid: 'user-123', email: 'test@example.com' },
      reauthenticate: mockReauthenticate,
    });
  });

  it('no renderiza nada si isOpen es false', () => {
    const { container } = render(
      <SessionExpiryModal isOpen={false} onClose={mockOnClose} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('no renderiza nada si no hay usuario autenticado', () => {
    (AuthContextModule.useAuth as any).mockReturnValue({
      user: null,
      reauthenticate: mockReauthenticate,
    });

    const { container } = render(
      <SessionExpiryModal isOpen={true} onClose={mockOnClose} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renderiza el modal con el campo de contraseña cuando está abierto', () => {
    render(<SessionExpiryModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Sesión Expirada')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('••••••••')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /confirmar contraseña/i })
    ).toBeInTheDocument();
  });

  it('ejecuta reauthenticate y maneja éxito cerrando el modal', async () => {
    mockReauthenticate.mockResolvedValueOnce(true);

    render(<SessionExpiryModal isOpen={true} onClose={mockOnClose} />);

    const passwordInput = screen.getByPlaceholderText('••••••••');
    fireEvent.change(passwordInput, { target: { value: 'mypassword123' } });

    const submitBtn = screen.getByRole('button', { name: /confirmar contraseña/i });
    fireEvent.click(submitBtn);

    expect(mockReauthenticate).toHaveBeenCalledWith('mypassword123');

    await waitFor(() => {
      expect(
        screen.getByText(/¡Verificado con éxito! Continuando.../i)
      ).toBeInTheDocument();
    });
  });

  it('muestra mensaje de error cuando la contraseña es incorrecta', async () => {
    mockReauthenticate.mockResolvedValueOnce(false);

    render(<SessionExpiryModal isOpen={true} onClose={mockOnClose} />);

    const passwordInput = screen.getByPlaceholderText('••••••••');
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });

    const submitBtn = screen.getByRole('button', { name: /confirmar contraseña/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('La contraseña ingresada es incorrecta.')
      ).toBeInTheDocument();
    });
  });

  it('muestra mensaje de error si ocurre una excepción de red', async () => {
    mockReauthenticate.mockRejectedValueOnce(new Error('Network error'));

    render(<SessionExpiryModal isOpen={true} onClose={mockOnClose} />);

    const passwordInput = screen.getByPlaceholderText('••••••••');
    fireEvent.change(passwordInput, { target: { value: 'pass123' } });

    const submitBtn = screen.getByRole('button', { name: /confirmar contraseña/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Error de conexión. Intente nuevamente.')
      ).toBeInTheDocument();
    });
  });
});
