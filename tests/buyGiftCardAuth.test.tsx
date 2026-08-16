import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ModalProvider } from '../contexts/ModalContext';
import StorefrontPage from '../components/StorefrontPage';
import BuyGiftCardModal from '../components/BuyGiftCardModal';

// Mock AuthContext variable
let mockAuthUser: any = null;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    customerProfile: mockAuthUser ? { nombre: 'Juan Pérez' } : null,
    syncCart: vi.fn(),
    addToWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
    refreshOrders: vi.fn(),
    assignGiftCard: vi.fn()
  })
}));

vi.mock('../services/firebase', () => ({
  db: {}
}));

vi.mock('../services/webOrderFulfillment', () => ({
  releaseExpiredReservations: vi.fn(),
  fulfillWebOrder: vi.fn(),
  reserveWebOrderStock: vi.fn()
}));

vi.mock('../services/ualaApi', () => ({
  createUalaPayment: vi.fn().mockResolvedValue({ paymentUrl: 'https://checkout.uala.com/123', paymentId: 'p123' })
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  query: vi.fn(),
  where: vi.fn()
}));

describe('Restricción de Compra de Gift Card sin Registro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser = null;
  });

  it('no permite abrir el formulario de Gift Card si el usuario no está registrado', async () => {
    mockAuthUser = null;
    render(
      <BrowserRouter>
        <ModalProvider>
          <StorefrontPage inventoryProp={[]} settingsProp={{ storeName: 'Test Store' }} />
        </ModalProvider>
      </BrowserRouter>
    );

    // Click en botón Regalar Gift Card
    const giftCardBtn = screen.getByTitle('Regalar Gift Card');
    fireEvent.click(giftCardBtn);

    // Debe abrir el modal de autenticación ("MI CUENTA") y NO el formulario de regalo
    expect(await screen.findByText('MI CUENTA')).toBeInTheDocument();
    expect(screen.queryByText('Monto del Regalo')).not.toBeInTheDocument();
  });

  it('permite abrir el modal de Gift Card si el usuario está autenticado', async () => {
    mockAuthUser = { uid: 'usr123', email: 'juan@test.com' };

    render(
      <BrowserRouter>
        <ModalProvider>
          <StorefrontPage inventoryProp={[]} settingsProp={{ storeName: 'Test Store' }} />
        </ModalProvider>
      </BrowserRouter>
    );

    const giftCardBtn = screen.getByTitle('Regalar Gift Card');
    fireEvent.click(giftCardBtn);

    // Debe mostrar el modal de compra con los montos preset
    expect(await screen.findByText('Monto del Regalo')).toBeInTheDocument();
    expect(screen.getByText('$80.000')).toBeInTheDocument();
  });

  it('muestra aviso de Registro Requerido en BuyGiftCardModal si user es nulo', () => {
    mockAuthUser = null;

    render(
      <ModalProvider>
        <BuyGiftCardModal isOpen={true} onClose={() => {}} onSuccess={() => {}} />
      </ModalProvider>
    );

    expect(screen.getByText('Registro Requerido')).toBeInTheDocument();
    expect(screen.getByText(/Para comprar una Gift Card es necesario estar registrado/i)).toBeInTheDocument();
    expect(screen.queryByText('Monto del Regalo')).not.toBeInTheDocument();
  });
});
