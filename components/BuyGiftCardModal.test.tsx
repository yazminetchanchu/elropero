import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: 'mock_order_123' })),
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

  it('completes bank transfer purchase without calling createUalaPayment and shows banking details', async () => {
    const mockWebSettings = {
      bankTitular: 'EL ROPERO SHOWROOM',
      bankAlias: 'elropero.alias.test',
      bankCbu: '0000001234567890123456',
      bankName: 'Banco Galicia',
      contactWhatsapp: '5491112345678',
      storeName: 'EL ROPERO'
    };

    render(
      <ModalProvider>
        <BuyGiftCardModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          webSettings={mockWebSettings}
        />
      </ModalProvider>
    );

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/Nombre y Apellido de quien recibe/i), {
      target: { value: 'Maria Lopez' }
    });
    fireEvent.change(screen.getByPlaceholderText(/Email de quien recibe/i), {
      target: { value: 'maria@example.com' }
    });
    fireEvent.change(screen.getByPlaceholderText(/Tu Nombre/i), {
      target: { value: 'Ana Perez' }
    });

    // Advance to payment step
    fireEvent.click(screen.getByRole('button', { name: /Continuar al Pago/i }));

    expect(await screen.findByText(/Transferencia \/ Dinero en cuenta/i)).toBeInTheDocument();

    // Confirm bank transfer
    const payBtn = screen.getByRole('button', { name: /Confirmar y Ver Datos Bancarios/i });
    fireEvent.click(payBtn);

    // Verify createUalaPayment is NOT called
    const { createUalaPayment } = await import('../services/ualaApi');
    const { reserveWebOrderStock } = await import('../services/webOrderFulfillment');
    
    await waitFor(() => {
      expect(reserveWebOrderStock).toHaveBeenCalled();
    });
    expect(createUalaPayment).not.toHaveBeenCalled();

    // Verify bank transfer data is displayed
    expect(await screen.findByText(/¡Pedido Registrado con Éxito!/i)).toBeInTheDocument();
    expect(screen.getByText('elropero.alias.test')).toBeInTheDocument();
    expect(screen.getByText('0000001234567890123456')).toBeInTheDocument();
    expect(screen.getByText('EL ROPERO SHOWROOM')).toBeInTheDocument();
    expect(screen.getByText('Banco Galicia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar Comprobante por WhatsApp/i })).toBeInTheDocument();
  });

  it('calls createUalaPayment when card payment method is selected', async () => {
    render(
      <ModalProvider>
        <BuyGiftCardModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      </ModalProvider>
    );

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/Nombre y Apellido de quien recibe/i), {
      target: { value: 'Maria Lopez' }
    });
    fireEvent.change(screen.getByPlaceholderText(/Email de quien recibe/i), {
      target: { value: 'maria@example.com' }
    });
    fireEvent.change(screen.getByPlaceholderText(/Tu Nombre/i), {
      target: { value: 'Ana Perez' }
    });

    // Advance to payment step
    fireEvent.click(screen.getByRole('button', { name: /Continuar al Pago/i }));

    // Select card payment
    const cardOption = await screen.findByText(/Tarjetas de Crédito \/ Débito/i);
    fireEvent.click(cardOption);

    // Click pay with card
    const payBtn = screen.getByRole('button', { name: /Pagar con Tarjeta/i });
    fireEvent.click(payBtn);

    const { createUalaPayment } = await import('../services/ualaApi');
    await waitFor(() => {
      expect(createUalaPayment).toHaveBeenCalled();
    });
  });
});
