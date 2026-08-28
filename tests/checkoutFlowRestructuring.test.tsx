import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckoutFlow from '../components/auth/CheckoutFlow';
import { ModalProvider } from '../contexts/ModalContext';

// Mocks
const mockUser = { uid: 'user_123', email: 'test@usuario.com' };
const mockCustomerProfile = {
  nombre: 'María López',
  email: 'test@usuario.com',
  telefono: '1122334455',
  direcciones: [
    {
      id: 'addr_1',
      calle: 'Av. Corrientes',
      numero: '1234',
      pisoDepto: '2B',
      localidad: 'CABA',
      provincia: 'CABA',
      codigoPostal: '1043',
      indicaciones: 'Timbre 2B',
      esPrincipal: true
    },
    {
      id: 'addr_2',
      calle: 'Calle Falsa',
      numero: '123',
      pisoDepto: '',
      localidad: 'La Plata',
      provincia: 'BUENOS AIRES',
      codigoPostal: '1900',
      indicaciones: '',
      esPrincipal: false
    }
  ]
};

let currentAuthUser: any = null;
let currentCustomerProfile: any = null;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: currentAuthUser,
    customerProfile: currentCustomerProfile,
    signUpWithEmail: vi.fn(),
    updateProfile: vi.fn(),
    refreshOrders: vi.fn()
  })
}));

vi.mock('../services/firebase', () => ({
  db: {},
  auth: {},
  functions: {}
}));

vi.mock('../services/webOrderFulfillment', async (importOriginal) => ({
  ...(await importOriginal() as any),
  fulfillWebOrder: vi.fn(),
  reserveWebOrderStock: vi.fn().mockResolvedValue(undefined),
  cancelWebOrderReservation: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/ualaApi', () => ({
  createUalaPayment: vi.fn().mockResolvedValue({ paymentId: 'p_1', paymentUrl: 'https://uala.test' }),
  setUalaEnvironment: vi.fn(),
  getUalaEnvironment: vi.fn().mockReturnValue('production')
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ data: { costoEnvio: 1500 } }))
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn().mockReturnValue({ id: 'ord_123' }),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'mail_123' })
}));

describe('CheckoutFlow - Reestructuración de Pago, Gift Card y Datos', () => {
  const mockCart = [
    {
      product: {
        id: 'p1',
        sku: 'SKU1',
        descripcion: 'Remera Negra',
        proveedor: 'Prov',
        categoria: 'REMERAS',
        cantidad: 5,
        costo: 1000,
        ventaEfectivo: 2000,
        ventaTarjeta: 2500,
        talles: ['M'],
        colores: ['NEGRO']
      },
      quantity: 1,
      payMethod: 'transferencia' as const,
      selectedTalle: 'M',
      selectedColor: 'NEGRO'
    }
  ];

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    cart: mockCart,
    cartTotal: 2000,
    webSettings: { storeName: 'El Ropero' },
    onSuccess: vi.fn(),
    getDiscount: () => 0,
    getDiscountedPrice: (price: number) => price,
    initialPaymentMethod: 'transferencia' as const,
    initialAppliedGiftCard: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthUser = null;
    currentCustomerProfile = null;
  });

  it('si NO hay sesión iniciada, comienza en el paso de Datos del Comprador (identification)', () => {
    currentAuthUser = null;
    currentCustomerProfile = null;

    render(
      <ModalProvider>
        <CheckoutFlow {...defaultProps} />
      </ModalProvider>
    );

    expect(screen.getByText('Datos del Comprador')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('EJ. SOFÍA PÉREZ')).toBeInTheDocument();
  });

  it('si SÍ hay sesión iniciada, omite Datos del Comprador e inicia en Método de Entrega (delivery) con sugerencia de direcciones guardadas', () => {
    currentAuthUser = mockUser;
    currentCustomerProfile = mockCustomerProfile;

    render(
      <ModalProvider>
        <CheckoutFlow {...defaultProps} />
      </ModalProvider>
    );

    // Debe mostrar Método de Entrega
    expect(screen.getByText('Método de Entrega')).toBeInTheDocument();
    expect(screen.queryByText('Datos del Comprador')).not.toBeInTheDocument();

    // Al seleccionar envío a domicilio, debe sugerir sus direcciones guardadas
    const optionEnvio = screen.getByText('Envío a Domicilio');
    fireEvent.click(optionEnvio);

    expect(screen.getByText('Tus Direcciones Guardadas')).toBeInTheDocument();
    expect(screen.getByText('Av. Corrientes 1234 (P/D: 2B)')).toBeInTheDocument();
    expect(screen.getByText('Calle Falsa 123')).toBeInTheDocument();
  });

  it('en el paso de confirmación (review), el medio de pago y gift card son de solo lectura y no permiten cambiar método en checkout', async () => {
    currentAuthUser = mockUser;
    currentCustomerProfile = mockCustomerProfile;

    const propsWithGift = {
      ...defaultProps,
      initialAppliedGiftCard: {
        codigo: 'GIFT-1000',
        monto: 1000,
        saldo: 1000,
        estado: 'ACTIVA' as const,
        destinatario: 'Juan'
      }
    };

    render(
      <ModalProvider>
        <CheckoutFlow {...propsWithGift} />
      </ModalProvider>
    );

    // Seleccionar Retiro en Showroom (no requiere cotizar envío)
    fireEvent.click(screen.getByText('Retiro en Showroom'));

    // Avanzar a confirmación
    const btnSiguiente = screen.getByText('Continuar');
    fireEvent.click(btnSiguiente);

    await waitFor(() => {
      expect(screen.getByText('Confirmación de Pedido')).toBeInTheDocument();
    });

    // Muestra medio de pago seleccionado en carrito
    expect(screen.getByText('Medio de Pago Seleccionado')).toBeInTheDocument();
    expect(screen.getByText('Transferencia Bancaria')).toBeInTheDocument();

    // Muestra la Gift Card aplicada en carrito en modo solo lectura
    expect(screen.getByText('GIFT-1000')).toBeInTheDocument();

    // No debe haber campo de texto ni botón para ingresar otra gift card
    expect(screen.queryByPlaceholderText(/CÓDIGO DE GIFT CARD/i)).not.toBeInTheDocument();
  });

  it('deshabilita el botón de continuar mientras se calcula el costo de envío', async () => {
    currentAuthUser = mockUser;
    currentCustomerProfile = mockCustomerProfile;

    let resolveShipping: (val: any) => void = () => {};
    const shippingPromise = new Promise((resolve) => {
      resolveShipping = resolve;
    });

    const { httpsCallable } = await import('firebase/functions');
    vi.mocked(httpsCallable).mockReturnValue((() => shippingPromise) as any);

    render(
      <ModalProvider>
        <CheckoutFlow {...defaultProps} />
      </ModalProvider>
    );

    // Seleccionar Envío a Domicilio
    fireEvent.click(screen.getByText('Envío a Domicilio'));

    // Debe inhabilitar el botón y mostrar el estado de carga
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /cargando costo de envío/i });
      expect(btn).toBeDisabled();
    });

    // Resolver la cotización
    resolveShipping({ data: { costoEnvio: 3500 } });

    // Una vez resuelto, se habilita el botón con texto "Continuar"
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /continuar/i });
      expect(btn).not.toBeDisabled();
    });
  });

  it('mantiene la pantalla de ¡Pedido Registrado! y el botón de pago Ualá sin regresar al paso de envío al actualizarse el perfil/carrito', async () => {
    currentAuthUser = mockUser;
    currentCustomerProfile = mockCustomerProfile;

    const { rerender } = render(
      <ModalProvider>
        <CheckoutFlow {...defaultProps} initialPaymentMethod="tarjeta" />
      </ModalProvider>
    );

    // Seleccionar Retiro en Showroom
    fireEvent.click(screen.getByText('Retiro en Showroom'));

    // Ir a Confirmación
    fireEvent.click(screen.getByText('Continuar'));

    await waitFor(() => {
      expect(screen.getByText('Confirmación de Pedido')).toBeInTheDocument();
    });

    // Finalizar Pedido
    const btnFinalizar = screen.getByText(/Finalizar y Enviar Pedido/i);
    fireEvent.click(btnFinalizar);

    // Debe mostrar la pantalla de Éxito
    await waitFor(() => {
      expect(screen.getByText('¡Pedido Registrado!')).toBeInTheDocument();
      expect(screen.getByText('Pagar con Ualá Bis')).toBeInTheDocument();
    });

    // Simular que customerProfile/cart se actualizó a vacío en segundo plano
    rerender(
      <ModalProvider>
        <CheckoutFlow {...defaultProps} initialPaymentMethod="tarjeta" cart={[]} />
      </ModalProvider>
    );

    // DEBE PERMANECER en la pantalla de ¡Pedido Registrado! y no cambiar a "0 prendas"
    expect(screen.getByText('¡Pedido Registrado!')).toBeInTheDocument();
    expect(screen.getByText('Pagar con Ualá Bis')).toBeInTheDocument();
    expect(screen.queryByText(/0 prendas/i)).not.toBeInTheDocument();
  });

  it('muestra el banner visual con temporizador de reserva de stock de 15 minutos en checkout activo', async () => {
    currentAuthUser = mockUser;
    currentCustomerProfile = mockCustomerProfile;

    render(
      <ModalProvider>
        <CheckoutFlow {...defaultProps} />
      </ModalProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Reserva de stock activa/i)).toBeInTheDocument();
    });
    expect(screen.getByText('15:00')).toBeInTheDocument();
  });

  it('reserva el stock inmediatamente en el segundo exacto en que se ingresa al checkout', async () => {
    const { reserveWebOrderStock } = await import('../services/webOrderFulfillment');

    render(
      <ModalProvider>
        <CheckoutFlow {...defaultProps} />
      </ModalProvider>
    );

    await waitFor(() => {
      expect(reserveWebOrderStock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          estado: 'PENDING_PAYMENT',
          items: expect.arrayContaining([
            expect.objectContaining({
              productId: 'p1',
              cantidad: 1,
              talle: 'M',
              color: 'NEGRO'
            })
          ])
        })
      );
    });
  });

  it('libera la reserva de stock si el usuario cierra el checkout antes de finalizar la compra', async () => {
    const { cancelWebOrderReservation } = await import('../services/webOrderFulfillment');
    const mockOnClose = vi.fn();

    render(
      <ModalProvider>
        <CheckoutFlow {...defaultProps} onClose={mockOnClose} />
      </ModalProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Reserva de stock activa/i)).toBeInTheDocument();
    });

    // Hacer clic en el botón X de cerrar
    const btnCerrar = screen.getByRole('button', { name: '' }); // X icon button
    fireEvent.click(btnCerrar);

    await waitFor(() => {
      expect(cancelWebOrderReservation).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('hereda Transferencia del carrito como solo lectura y envía paymentMethod: TRANSFER y estado: pending_transfer para reserva de 24h', async () => {
    const { reserveWebOrderStock } = await import('../services/webOrderFulfillment');
    currentAuthUser = mockUser;
    currentCustomerProfile = mockCustomerProfile;

    render(
      <ModalProvider>
        <CheckoutFlow {...defaultProps} initialPaymentMethod="transferencia" />
      </ModalProvider>
    );

    // Seleccionar Retiro en Showroom
    fireEvent.click(screen.getByText('Retiro en Showroom'));

    // Ir a Confirmación
    fireEvent.click(screen.getByText('Continuar'));

    await waitFor(() => {
      expect(screen.getByText('Confirmación de Pedido')).toBeInTheDocument();
    });

    // El medio de pago es heredado de solo lectura (no hay botón interactivo para cambiarlo)
    expect(screen.getByText('Transferencia Bancaria')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tarjeta de Crédito \/ Débito/i })).not.toBeInTheDocument();

    // Finalizar Pedido
    const btnFinalizar = screen.getByText(/Finalizar y Enviar Pedido/i);
    fireEvent.click(btnFinalizar);

    // Debe mostrar la pantalla de Éxito de Transferencia
    await waitFor(() => {
      expect(screen.getByText(/¡Pedido Registrado con Éxito!/i)).toBeInTheDocument();
      expect(screen.getByText(/Tenés 24 horas para realizar la transferencia/i)).toBeInTheDocument();
    });

    // Verificar que la llamada a reserveWebOrderStock contiene paymentMethod: TRANSFER y pending_transfer
    expect(reserveWebOrderStock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        paymentMethod: 'TRANSFER',
        metodoPago: 'Transferencia',
        estado: 'pending_transfer'
      })
    );
  });
});
