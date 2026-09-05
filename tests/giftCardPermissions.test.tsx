import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserDashboard from '../components/auth/UserDashboard';
import { CustomerProfile } from '../contexts/AuthContext';

const mockGetDocs = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    customerProfile: {
      uid: 'usr-cliente',
      email: 'cliente@example.com',
      nombre: 'CLIENTE',
      direcciones: [],
      wishlist: [],
      giftCards: ['GC-PROMO-100'],
    } as CustomerProfile,
    orders: [],
    logout: vi.fn(),
    updateProfile: vi.fn(),
    removeFromWishlist: vi.fn(),
  }),
}));

vi.mock('../contexts/ModalContext', () => ({
  useModal: () => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: (...args: any[]) => mockGetDocs(...args),
}));

vi.mock('../services/firebase', () => ({
  db: {},
}));

describe('Gift Card permissions / customer dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocs.mockRejectedValue({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    });
  });

  it('no muestra la sección de Gift Cards ni consulta Firestore al abrir Mi Cuenta', () => {
    render(
      <UserDashboard
        isOpen={true}
        onClose={() => {}}
        inventory={[]}
        onAddToCart={() => {}}
        onRequestExchange={() => {}}
      />
    );

    expect(screen.getByText('Mi Cuenta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gift Cards/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cargando tus Gift Cards/i)).not.toBeInTheDocument();
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
