import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ModalProvider } from '../contexts/ModalContext';
import StorefrontPage from '../components/StorefrontPage';
import BuyGiftCardModal from '../components/BuyGiftCardModal';
import { reserveWebOrderStock } from '../services/webOrderFulfillment';
import { createUalaPayment } from '../services/ualaApi';
import { WebSettings } from '../types';

// Mock AuthContext variable
let mockAuthUser: any = null;
const mockCustomerProfile = { nombre: 'Juan Pérez' };

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    customerProfile: mockAuthUser ? mockCustomerProfile : null,
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

vi.mock('../services/webOrderFulfillment', async (importOriginal) => ({
  ...(await importOriginal() as any),
  releaseExpiredReservations: vi.fn(),
  fulfillWebOrder: vi.fn(),
  reserveWebOrderStock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/ualaApi', () => ({
  createUalaPayment: vi.fn().mockResolvedValue({
    paymentUrl: 'https://checkout.uala.com/123',
    paymentId: 'p123'
  })
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ id: 'mock-order-gc-123' })),
  onSnapshot: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(() => ({})),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  query: vi.fn(),
  where: vi.fn()
}));

const mockWebSettings: WebSettings = {
  storeName: 'EL ROPERO',
  contactWhatsapp: '5492346685836',
  bankTitular: 'DANISA GUZMAN',
  bankCbu: '0000003100037658598052',
  bankAlias: 'Danisa.guz.03',
  bankName: 'Banco Provincia',
};

describe('BuyGiftCardModal & Storefront Gift Card Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser = null;
    localStorage.clear();
  });

  describe('Restricción sin autenticación', () => {
    it('no permite abrir el formulario de Gift Card si el usuario no está registrado', async () => {
      mockAuthUser = null;
      render(
        <BrowserRouter>
          <ModalProvider>
            <StorefrontPage inventoryProp={[]} settingsProp={{ storeName: 'Test Store' }} />
          </ModalProvider>
        </BrowserRouter>
      );

      const giftCardBtn = screen.getByTitle('Regalar Gift Card');
      fireEvent.click(giftCardBtn);

      expect(await screen.findByText(/COMPRAR GIFT CARD|MI CUENTA/i)).toBeInTheDocument();
      expect(screen.queryByText('Monto del Regalo')).not.toBeInTheDocument();
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

  describe('Flujo de Configuración y Compra con Usuario Autenticado', () => {
    beforeEach(() => {
      mockAuthUser = { uid: 'usr-123', email: 'juan@test.com', displayName: 'Juan Pérez' };
    });

    it('permite abrir el modal y muestra montos predeterminados con nombre pre-cargado', async () => {
      render(
        <ModalProvider>
          <BuyGiftCardModal
            isOpen={true}
            onClose={() => {}}
            onSuccess={() => {}}
            webSettings={mockWebSettings}
          />
        </ModalProvider>
      );

      expect(screen.getByText('Monto del Regalo')).toBeInTheDocument();
      expect(screen.getByText('$80.000')).toBeInTheDocument();
      expect(screen.getByText('$100.000')).toBeInTheDocument();
      expect(screen.getByText('$150.000')).toBeInTheDocument();
      expect(screen.getByText('$180.000')).toBeInTheDocument();

      const deParteDeInput = screen.getByPlaceholderText('Tu Nombre (De parte de...)') as HTMLInputElement;
      expect(deParteDeInput.value).toBe('Juan Pérez');
    });

    it('valida el monto mínimo de $5.000 y muestra alerta en montos inferiores', async () => {
      render(
        <ModalProvider>
          <BuyGiftCardModal
            isOpen={true}
            onClose={() => {}}
            onSuccess={() => {}}
            webSettings={mockWebSettings}
          />
        </ModalProvider>
      );

      const customInput = screen.getByPlaceholderText('Otro monto...');
      fireEvent.change(customInput, { target: { value: '3000' } });

      const destinatarioInput = screen.getByPlaceholderText('Nombre y Apellido de quien recibe');
      fireEvent.change(destinatarioInput, { target: { value: 'María López' } });

      const emailInput = screen.getByPlaceholderText('Email de quien recibe');
      fireEvent.change(emailInput, { target: { value: 'maria@example.com' } });

      const continueBtn = screen.getByRole('button', { name: /Continuar al Pago/i });
      fireEvent.click(continueBtn);

      expect(await screen.findByText('El monto mínimo para la Gift Card es de $5.000')).toBeInTheDocument();
      expect(screen.queryByText('Elegí cómo querés abonar')).not.toBeInTheDocument();
    });

    it('valida que los campos de destinatario y email sean obligatorios', async () => {
      render(
        <ModalProvider>
          <BuyGiftCardModal
            isOpen={true}
            onClose={() => {}}
            onSuccess={() => {}}
            webSettings={mockWebSettings}
          />
        </ModalProvider>
      );

      const continueBtn = screen.getByRole('button', { name: /Continuar al Pago/i });
      fireEvent.click(continueBtn);

      expect(
        await screen.findByText(/Por favor completá los datos principales \(Destinatario, Email y Tu Nombre\)/i)
      ).toBeInTheDocument();
    });

    it('avanza al paso de pago y calcula precios para transferencia y tarjeta correctamente', async () => {
      render(
        <ModalProvider>
          <BuyGiftCardModal
            isOpen={true}
            onClose={() => {}}
            onSuccess={() => {}}
            webSettings={mockWebSettings}
          />
        </ModalProvider>
      );

      // Elegir monto $100.000
      const btn100k = screen.getByRole('button', { name: '$100.000' });
      fireEvent.click(btn100k);

      // Completar campos
      const destinatarioInput = screen.getByPlaceholderText('Nombre y Apellido de quien recibe');
      fireEvent.change(destinatarioInput, { target: { value: 'Lucía Gómez' } });

      const emailInput = screen.getByPlaceholderText('Email de quien recibe');
      fireEvent.change(emailInput, { target: { value: 'lucia@example.com' } });

      const continueBtn = screen.getByRole('button', { name: /Continuar al Pago/i });
      fireEvent.click(continueBtn);

      // Paso de pago
      expect(await screen.findByText('Valor de la Gift Card')).toBeInTheDocument();
      expect(screen.getByText('Lucía Gómez')).toBeInTheDocument();

      // Precio transferencia (efectivo): $100.000
      expect(screen.getAllByText('$100.000').length).toBeGreaterThan(0);

      // Precio tarjeta: con recargo del 20% invertido ($100.000 / 0.8 = $125.000)
      expect(screen.getByText('$125.000')).toBeInTheDocument();
    });

    it('completa el pago por transferencia reservando la orden y mostrando datos bancarios y WhatsApp', async () => {
      render(
        <ModalProvider>
          <BuyGiftCardModal
            isOpen={true}
            onClose={() => {}}
            onSuccess={() => {}}
            webSettings={mockWebSettings}
          />
        </ModalProvider>
      );

      // Completar formulario con monto base $80.000
      fireEvent.change(screen.getByPlaceholderText('Nombre y Apellido de quien recibe'), {
        target: { value: 'Carlos Silva' },
      });
      fireEvent.change(screen.getByPlaceholderText('Email de quien recibe'), {
        target: { value: 'carlos@example.com' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Continuar al Pago/i }));

      // Confirmar transferencia bancaria
      const confirmBtn = await screen.findByRole('button', {
        name: /Confirmar y Ver Datos Bancarios/i,
      });
      fireEvent.click(confirmBtn);

      // Debe llamar a reserveWebOrderStock
      await waitFor(() => {
        expect(reserveWebOrderStock).toHaveBeenCalledWith(
          expect.any(String),
          'mock-order-gc-123',
          expect.objectContaining({
            customerId: 'usr-123',
            metodoPago: 'Transferencia',
            total: 80000,
            items: expect.arrayContaining([
              expect.objectContaining({
                isVirtualGiftCard: true,
                precioUnitario: 80000,
                giftCardData: expect.objectContaining({
                  destinatario: 'CARLOS SILVA',
                  email: 'carlos@example.com',
                }),
              }),
            ]),
          })
        );
      });

      // Pantalla de éxito
      expect(await screen.findByText('¡Pedido Registrado con Éxito!')).toBeInTheDocument();
      expect(screen.getByText(/Tenés 24 horas para transferir/i)).toBeInTheDocument();
      expect(screen.getByText('0000003100037658598052')).toBeInTheDocument();
      expect(screen.getByText('Danisa.guz.03')).toBeInTheDocument();
      expect(screen.getByText('DANISA GUZMAN')).toBeInTheDocument();

      // Botón de WhatsApp presente
      expect(screen.getByText(/Enviar Comprobante por WhatsApp/i)).toBeInTheDocument();
    });

    it('completa el pago por tarjeta invocando Ualá Bis con el precio de lista recalculado', async () => {
      render(
        <ModalProvider>
          <BuyGiftCardModal
            isOpen={true}
            onClose={() => {}}
            onSuccess={() => {}}
            webSettings={mockWebSettings}
          />
        </ModalProvider>
      );

      fireEvent.change(screen.getByPlaceholderText('Nombre y Apellido de quien recibe'), {
        target: { value: 'Valeria Ramos' },
      });
      fireEvent.change(screen.getByPlaceholderText('Email de quien recibe'), {
        target: { value: 'valeria@example.com' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Continuar al Pago/i }));

      // Seleccionar opción Tarjeta (Ualá Bis)
      const tarjetaOption = await screen.findByText(/Tarjetas de Crédito \/ Débito/i);
      fireEvent.click(tarjetaOption.closest('button')!);

      // Click en pagar con tarjeta
      const payBtn = screen.getByRole('button', { name: /Pagar con Tarjeta/i });
      fireEvent.click(payBtn);

      await waitFor(() => {
        expect(createUalaPayment).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'mock-order-gc-123',
            total: 100000, // $80.000 / 0.8 = $100.000
          }),
          expect.stringContaining('pago=ok'),
          expect.stringContaining('pago=error')
        );
      });

      expect(await screen.findByText('¡Redirigiendo al Pago!')).toBeInTheDocument();
    });
  });
});
