import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WebOrdersManager from './WebOrdersManager';
import React from 'react';
import { sendSaleConfirmationEmail } from '../services/emailService';

// Mock dependencies
vi.mock('../services/firebase', () => ({
  db: {}
}));

vi.mock('../services/storage', () => ({
  database: {
    getShowroomID: vi.fn(() => 'TEST_SHOWROOM')
  }
}));

const mockGetDocs = vi.fn();
const mockUpdateDoc = vi.fn();
const mockRunTransaction = vi.fn(async (_db, fn) => fn({
  get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ inventory: [] }) }),
  update: vi.fn(),
  set: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  writeBatch: () => ({
    update: vi.fn(),
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  }),
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
}));

vi.mock('../services/webOrderFulfillment', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    fulfillWebOrder: vi.fn().mockResolvedValue('SALE_123'),
    releaseExpiredReservations: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../services/emailService', () => ({
  sendNotificationEmail: vi.fn(),
  sendSaleConfirmationEmail: vi.fn(),
  sendOrderCancelledEmail: vi.fn()
}));

// Mock icons
vi.mock('lucide-react', () => ({
  Search: () => <span>Search</span>,
  ShoppingBag: () => <span>ShoppingBag</span>,
  Eye: () => <span>Eye</span>,
  X: () => <span>X</span>,
  MessageSquare: () => <span>MessageSquare</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  Clock: () => <span>Clock</span>,
  Truck: () => <span>Truck</span>,
  Loader2: () => <span>Loader2</span>,
  Receipt: () => <span>Receipt</span>,
  Package: () => <span>Package</span>,
  Download: () => <span>Download</span>,
  Activity: () => <span>Activity</span>,
  ExternalLink: () => <span>ExternalLink</span>
}));

describe('WebOrdersManager', () => {
  const mockOrder = {
    id: 'order-1',
    customerId: 'cust-1',
    customerNombre: 'Juan Perez',
    customerEmail: 'juan@test.com',
    customerTelefono: '12345678',
    fecha: new Date().toISOString(),
    items: [
      { productId: 'p1', descripcion: 'Remera', sku: 'R1', cantidad: 1, precioUnitario: 100 }
    ],
    total: 100,
    tipoEnvio: 'retiro',
    estado: 'Pendiente'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'order-1', data: () => mockOrder }
      ]
    });
  });

  it('renderiza la lista de pedidos', async () => {
    render(<WebOrdersManager />);
    expect(screen.getByText(/Pedidos Web/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
    });
    
    expect(screen.getByText(/juan@test.com/i)).toBeInTheDocument();
  });

  it('permite filtrar pedidos por estado', async () => {
    render(<WebOrdersManager />);
    
    await waitFor(() => {
      expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
    });

    const confirmadosBtn = screen.getByRole('button', { name: /Confirmados/i });
    fireEvent.click(confirmadosBtn);

    // Como el pedido esta pendiente, ya no se debería ver en Confirmados
    expect(screen.queryByText(/Juan Perez/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No se encontraron pedidos web/i)).toBeInTheDocument();
  });

  it('abre los detalles del pedido y permite confirmar venta', async () => {
    // Mock window.confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Mock window.alert
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<WebOrdersManager onOrderFulfilled={vi.fn()} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
    });

    const eyeBtn = screen.getByTitle('Ver Detalles');
    fireEvent.click(eyeBtn);

    expect(screen.getByText(/Detalle del Pedido/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Confirmado' });
    fireEvent.click(confirmBtn);

    expect(confirmSpy).toHaveBeenCalled();
    
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Venta registrada correctamente'));
      expect(sendSaleConfirmationEmail).toHaveBeenCalled();
    });
  });

  it('envía el mail de confirmación inmediatamente al cambiar el estado a Confirmado', async () => {
    render(<WebOrdersManager />);
    
    await waitFor(() => {
      expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
    });

    const eyeBtn = screen.getByTitle('Ver Detalles');
    fireEvent.click(eyeBtn);

    const confirmadoBtn = screen.getByRole('button', { name: /^Confirmado$/i });
    fireEvent.click(confirmadoBtn);

    await waitFor(() => {
      expect(sendSaleConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'order-1',
          total: 100
        }),
        'Juan Perez',
        'juan@test.com',
        'web'
      );
    });
  });

  it('muestra el botón "Ir a Mi Correo" cuando la orden posee un número de seguimiento', async () => {
    const orderWithTracking = {
      ...mockOrder,
      id: 'order-tracking',
      tipoEnvio: 'envio',
      trackingNumber: 'TN-998877',
      direccionEnvio: {
        provincia: 'Buenos Aires',
        localidad: 'La Plata',
        calle: 'Calle 7',
        numero: '123',
        codigoPostal: '1900'
      }
    };

    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'order-tracking', data: () => orderWithTracking }
      ]
    });

    render(<WebOrdersManager />);

    await waitFor(() => {
      expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
    });

    const eyeBtn = screen.getByTitle('Ver Detalles');
    fireEvent.click(eyeBtn);

    const miCorreoLinks = screen.getAllByRole('link', { name: /Ir a Mi Correo/i });
    expect(miCorreoLinks.length).toBeGreaterThan(0);
    expect(miCorreoLinks[0]).toHaveAttribute('href', 'https://micorreo.correoargentino.com.ar/');
    expect(miCorreoLinks[0]).toHaveAttribute('target', '_blank');
  });

  it('muestra la etiqueta Pendiente y la incluye en el filtro "Pendientes" para órdenes en estado PENDING_PAYMENT', async () => {
    const pendingPaymentOrder = {
      ...mockOrder,
      id: 'order-pending-pay',
      customerNombre: 'Carlos Gomez',
      estado: 'PENDING_PAYMENT',
      fecha: new Date().toISOString()
    };

    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'order-pending-pay', data: () => pendingPaymentOrder }
      ]
    });

    render(<WebOrdersManager />);

    await waitFor(() => {
      expect(screen.getByText(/Carlos Gomez/i)).toBeInTheDocument();
      expect(screen.getByText(/^Pendiente$/i)).toBeInTheDocument();
    });

    // Filtrar por Pendientes
    const pendientesBtn = screen.getByRole('button', { name: /Pendientes/i });
    fireEvent.click(pendientesBtn);

    // Debe seguir mostrándose
    expect(screen.getByText(/Carlos Gomez/i)).toBeInTheDocument();
  });

  it('muestra la etiqueta Cancelado y la incluye en el filtro "Cancelados" para órdenes en estado CANCELLED / EXPIRED', async () => {
    const cancelledOrder = {
      ...mockOrder,
      id: 'order-cancelled-1',
      customerNombre: 'Lucia Fernandez',
      estado: 'CANCELLED'
    };

    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'order-cancelled-1', data: () => cancelledOrder }
      ]
    });

    render(<WebOrdersManager />);

    await waitFor(() => {
      expect(screen.getByText(/Lucia Fernandez/i)).toBeInTheDocument();
      expect(screen.getByText(/^Cancelado$/i)).toBeInTheDocument();
    });

    // Filtrar por Cancelados
    const canceladosBtn = screen.getByRole('button', { name: /Cancelados/i });
    fireEvent.click(canceladosBtn);

    // Debe seguir mostrándose
    expect(screen.getByText(/Lucia Fernandez/i)).toBeInTheDocument();
  });

  it('pide confirmación previa al cancelar un pedido y no ejecuta si el usuario cancela', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<WebOrdersManager />);

    await waitFor(() => {
      expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
    });

    const eyeBtn = screen.getByTitle('Ver Detalles');
    fireEvent.click(eyeBtn);

    const cancelarBtn = screen.getByRole('button', { name: /^Cancelado$/i });
    fireEvent.click(cancelarBtn);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('¿Estás seguro de que deseas cancelar el pedido'));
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('cancela el pedido, libera stock y muestra alerta si el usuario confirma', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<WebOrdersManager />);

    await waitFor(() => {
      expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
    });

    const eyeBtn = screen.getByTitle('Ver Detalles');
    fireEvent.click(eyeBtn);

    const cancelarBtn = screen.getByRole('button', { name: /^Cancelado$/i });
    fireEvent.click(cancelarBtn);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('¿Estás seguro de que deseas cancelar el pedido'));

    await waitFor(() => {
      expect(mockRunTransaction).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('El pedido ha sido cancelado y el stock fue liberado'));
    });
  });

  it('permite confirmar venta directamente desde el botón "Confirmar Pedido" en el pie del modal', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<WebOrdersManager onOrderFulfilled={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
    });

    const eyeBtn = screen.getByTitle('Ver Detalles');
    fireEvent.click(eyeBtn);

    const directConfirmBtn = screen.getByRole('button', { name: /Confirmar Pedido/i });
    expect(directConfirmBtn).toBeInTheDocument();
    fireEvent.click(directConfirmBtn);

    expect(confirmSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Venta registrada correctamente'));
      expect(screen.getByText(/Pedido Confirmado/i)).toBeInTheDocument();
    });
  });

  it('pide confirmación al intentar revertir un pedido confirmado a pendiente', async () => {
    const confirmedOrder = {
      ...mockOrder,
      id: 'order-confirmed-1',
      customerNombre: 'Marcos Soto',
      estado: 'Confirmado',
      saleId: 'SALE_EXISTING'
    };

    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'order-confirmed-1', data: () => confirmedOrder }
      ]
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<WebOrdersManager />);

    await waitFor(() => {
      expect(screen.getByText(/Marcos Soto/i)).toBeInTheDocument();
    });

    const eyeBtn = screen.getByTitle('Ver Detalles');
    fireEvent.click(eyeBtn);

    const pendienteBtn = screen.getByRole('button', { name: /^Pendiente$/i });
    fireEvent.click(pendienteBtn);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('¿Deseas volverlo a Pendiente?'));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});


