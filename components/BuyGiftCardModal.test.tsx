import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BuyGiftCardModal from './BuyGiftCardModal';
import { ModalProvider } from '../contexts/ModalContext';

let currentAuthUser: any = { uid: 'u1', email: 'test@user.com', displayName: 'Ana' };
let currentCustomerProfile: any = { nombre: 'Ana Perez' };

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: currentAuthUser,
    customerProfile: currentCustomerProfile,
  }),
}));

vi.mock('../services/firebase', () => ({
  db: {},
}));

vi.mock('../services/webOrderFulfillment', async (importOriginal) => ({
  ...(await importOriginal() as any),
  reserveWebOrderStock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../services/ualaApi', () => ({
  createUalaPayment: vi.fn().mockResolvedValue({ paymentId: 'p_1', paymentUrl: 'https://uala.test' }),
}));

describe('BuyGiftCardModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthUser = { uid: 'u1', email: 'test@user.com', displayName: 'Ana' };
    currentCustomerProfile = { nombre: 'Ana Perez' };
  });

  it('does not render when isOpen is false', () => {
    render(
      <ModalProvider>
        <BuyGiftCardModal
          isOpen={false}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      </ModalProvider>
    );

    expect(screen.queryByText(/Regalar Gift Card/i)).not.toBeInTheDocument();
  });

  it('renders modal with preset amounts and recipient form when open', () => {
    render(
      <ModalProvider>
        <BuyGiftCardModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      </ModalProvider>
    );

    expect(screen.getByText(/Regalar Gift Card/i)).toBeInTheDocument();
    expect(screen.getAllByText(/80\.000/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/100\.000/)[0]).toBeInTheDocument();

    const recipientInput = screen.getByPlaceholderText(/Nombre y Apellido de quien recibe/i);
    expect(recipientInput).toBeInTheDocument();
  });

  it('allows selecting preset amount or custom amount', () => {
    render(
      <ModalProvider>
        <BuyGiftCardModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      </ModalProvider>
    );

    const presetBtn = screen.getAllByText(/150\.000/)[0];
    fireEvent.click(presetBtn);

    const customInput = screen.getByPlaceholderText(/Otro monto\.\.\./i);
    fireEvent.change(customInput, { target: { value: '250000' } });
    expect(customInput).toHaveValue(250000);
  });
});
