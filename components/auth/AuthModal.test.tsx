import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthModal from './AuthModal';

const mockLoginWithEmail = vi.fn();
const mockSignUpWithEmail = vi.fn();
const mockLoginWithGoogle = vi.fn();
const mockResetPassword = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    loginWithEmail: mockLoginWithEmail,
    signUpWithEmail: mockSignUpWithEmail,
    loginWithGoogle: mockLoginWithGoogle,
    resetPassword: mockResetPassword,
  }),
}));

vi.mock('../../services/emailService', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(true),
}));

describe('AuthModal Component', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(<AuthModal isOpen={false} onClose={mockOnClose} />);
    expect(screen.queryByText(/MI CUENTA/i)).not.toBeInTheDocument();
  });

  it('renders login tab by default when open', () => {
    render(<AuthModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText('MI CUENTA')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('EJEMPLO@CORREO.COM')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('switches between Login, Register, and Forgot Password tabs', () => {
    render(<AuthModal isOpen={true} onClose={mockOnClose} />);

    // Switch to Register tab
    const registerTab = screen.getByRole('button', { name: 'Registrarse' });
    fireEvent.click(registerTab);
    expect(screen.getByPlaceholderText('EJ. SOFÍA PÉREZ')).toBeInTheDocument();

    // Switch back to Login tab
    const loginTab = screen.getByRole('button', { name: 'Ingresar' });
    fireEvent.click(loginTab);

    // Switch to Forgot Password from Login tab
    const forgotLink = screen.getByRole('button', { name: '¿La olvidaste?' });
    fireEvent.click(forgotLink);
    expect(screen.getByText(/Recuperar Contraseña/i)).toBeInTheDocument();
  });

  it('submits login form successfully', async () => {
    mockLoginWithEmail.mockResolvedValueOnce(undefined);

    const { container } = render(<AuthModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.change(screen.getByPlaceholderText('EJEMPLO@CORREO.COM'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });

    const submitBtn = container.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLoginWithEmail).toHaveBeenCalledWith('user@test.com', 'password123');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('displays error message when login fails', async () => {
    mockLoginWithEmail.mockRejectedValueOnce(new Error('Contraseña incorrecta'));

    const { container } = render(<AuthModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.change(screen.getByPlaceholderText('EJEMPLO@CORREO.COM'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrongpass' } });

    const submitBtn = container.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Contraseña incorrecta')).toBeInTheDocument();
    });
  });
});
