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
}));

vi.mock('../services/webOrderFulfillment', () => ({
  fulfillWebOrder: vi.fn().mockResolvedValue('SALE_123')
}));

vi.mock('../services/emailService', () => ({
  sendNotificationEmail: vi.fn(),
  sendSaleConfirmationEmail: vi.fn()
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
    fecha: '2026-06-01T10:00:00',
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

    const confirmBtn = screen.getByRole('button', { name: /Confirmar venta/i });
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
});
