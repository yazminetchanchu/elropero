import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import UserDashboard from './UserDashboard';
import { CustomerOrder } from '../../contexts/AuthContext';

// Mocks de context y hooks
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    customerProfile: {
      email: 'test@example.com',
      nombre: 'JUAN PEREZ',
      direcciones: [],
      wishlist: [],
    },
    orders: [
      {
        id: 'gc_order_1',
        fecha: new Date().toISOString(),
        estado: 'Pendiente',
        total: 50000,
        metodoPago: 'Ualá Bis',
        tipoEnvio: 'retiro',
        items: [
          {
            productId: 'virtual_gift_card_99',
            sku: 'GIFT-CARD',
            descripcion: 'Gift Card para Ana',
            cantidad: 1,
            precioUnitario: 50000,
            isVirtualGiftCard: true,
          },
        ],
      } as CustomerOrder,
      {
        id: 'normal_order_1',
        fecha: new Date().toISOString(),
        estado: 'Pendiente',
        total: 20000,
        metodoPago: 'Efectivo',
        tipoEnvio: 'retiro',
        items: [
          {
            productId: 'prod_1',
            sku: 'REM-01',
            descripcion: 'Remera Negra',
            cantidad: 1,
            precioUnitario: 20000,
          },
        ],
      } as CustomerOrder,
    ],
    logout: vi.fn(),
    updateProfile: vi.fn(),
    removeFromWishlist: vi.fn(),
  }),
}));

vi.mock('../../contexts/ModalContext', () => ({
  useModal: () => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
  }),
}));

describe('UserDashboard Gift Card logic', () => {
  it('envía las órdenes de Gift Card directamente a la pestaña Historial y oculta Solicitar Cambio', () => {
    render(
      <UserDashboard
        isOpen={true}
        onClose={() => {}}
        inventory={[]}
        onAddToCart={() => {}}
        onRequestExchange={() => {}}
      />
    );

    // En "Pedidos Actuales" debe estar únicamente el pedido normal, no la Gift Card
    expect(screen.getByText('Pedidos Actuales (1)')).toBeInTheDocument();
    expect(screen.getAllByText('Remera Negra').length).toBeGreaterThan(0);
    expect(screen.queryByText('Gift Card para Ana')).not.toBeInTheDocument();

    // Hacemos clic en la pestaña "Historial"
    const historialBtn = screen.getByRole('button', { name: /Historial \(1\)/i });
    fireEvent.click(historialBtn);

    // En "Historial" debe figurar la Gift Card
    expect(screen.getAllByText('Gift Card para Ana').length).toBeGreaterThan(0);

    // No debe existir el botón "Solicitar cambio" para la Gift Card
    expect(screen.queryByText('Solicitar cambio')).not.toBeInTheDocument();
  });
});
