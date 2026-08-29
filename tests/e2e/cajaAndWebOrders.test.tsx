import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Sales from '../../components/Sales';
import WebOrdersManager from '../../components/WebOrdersManager';
import { InventoryItem, WebOrder } from '../../types';

// ─── Mocks para Servicios y Firebase ──────────────────────────────────────────

vi.mock('../../services/firebase', () => ({
  db: {}
}));

vi.mock('../../services/storage', () => ({
  database: {
    getShowroomID: vi.fn(() => 'TEST_SHOWROOM')
  }
}));

const mockGetDocs = vi.fn();
const mockRunTransaction = vi.fn(async (_db: any, fn: any) => fn({
  get: vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ inventory: [{ id: 'prod-p1', cantidad: 10 }] })
  }),
  update: vi.fn(),
  set: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-col'),
  doc: vi.fn(() => 'mock-doc'),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  updateDoc: vi.fn(),
  writeBatch: () => ({
    update: vi.fn(),
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined)
  }),
  runTransaction: (...args: any[]) => mockRunTransaction(...args)
}));

const mockFulfillWebOrder = vi.fn().mockResolvedValue('SALE_CONFIRMED_999');

vi.mock('../../services/webOrderFulfillment', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    fulfillWebOrder: (...args: any[]) => mockFulfillWebOrder(...args),
    releaseExpiredReservations: vi.fn().mockResolvedValue(undefined),
    restoreInventory: vi.fn((inv: any) => inv)
  };
});

vi.mock('../../services/emailService', () => ({
  sendNotificationEmail: vi.fn(),
  sendSaleConfirmationEmail: vi.fn(),
  sendOrderCancelledEmail: vi.fn()
}));

// Mock de Lucide icons para renderizado liviano
vi.mock('lucide-react', () => ({
  Trash2: () => <span data-testid="icon-trash" />,
  CreditCard: () => <span data-testid="icon-card" />,
  Banknote: () => <span data-testid="icon-banknote" />,
  CheckCircle: () => <span data-testid="icon-check" />,
  Search: () => <span data-testid="icon-search" />,
  X: () => <span data-testid="icon-x" />,
  ShoppingBag: () => <span data-testid="icon-bag" />,
  Eye: () => <span data-testid="icon-eye" />,
  MessageSquare: () => <span data-testid="icon-msg" />,
  Clock: () => <span data-testid="icon-clock" />,
  Truck: () => <span data-testid="icon-truck" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Receipt: () => <span data-testid="icon-receipt" />,
  Package: () => <span data-testid="icon-package" />,
  Download: () => <span data-testid="icon-download" />,
  Activity: () => <span data-testid="icon-activity" />,
  ExternalLink: () => <span data-testid="icon-ext" />
}));

let mockShowAlert = vi.fn().mockResolvedValue(undefined);
let mockShowConfirm = vi.fn().mockResolvedValue(true);

vi.mock('../../contexts/ModalContext', () => ({
  useModal: () => ({
    showAlert: (...args: any[]) => mockShowAlert(...args),
    showConfirm: (...args: any[]) => mockShowConfirm(...args),
  }),
  ModalProvider: ({ children }: any) => children
}));

describe('Suite 4: E2E / UI Component Tests - Caja y Gestión de Pedidos Web (cajaAndWebOrders.test.tsx)', () => {
  const sampleInventory: InventoryItem[] = [
    {
      id: 'prod-p1',
      sku: 'PANT-01',
      descripcion: 'Pantalón Lino Premium',
      categoria: 'PANTALONES',
      cantidad: 10,
      costo: 3000,
      ventaEfectivo: 6000,
      ventaTarjeta: 7000,
      talles: [],
      colores: [],
      imagenes: []
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockShowAlert = vi.fn().mockResolvedValue(undefined);
    mockShowConfirm = vi.fn().mockResolvedValue(true);
  });

  const renderWithModal = (ui: React.ReactElement) => {
    return render(ui);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. UI en Sales.tsx: Resiliencia ante fallos de red y vaciado tras éxito
  // ──────────────────────────────────────────────────────────────────────────
  describe('Sales.tsx (Caja)', () => {
    it('mantiene el carrito intacto y muestra alerta de error si falla la red al registrar la venta', async () => {
      const onAddSaleMock = vi.fn().mockRejectedValueOnce(new Error('Network connection failed'));

      renderWithModal(
        <Sales
          inventory={sampleInventory}
          recentSales={[]}
          onAddSale={onAddSaleMock}
          onDeleteSale={vi.fn()}
        />
      );

      // 1. Buscar el producto por SKU y agregarlo al carrito
      const searchInput = screen.getByPlaceholderText(/Buscar producto por SKU o nombre.../i);
      fireEvent.focus(searchInput);
      fireEvent.change(searchInput, { target: { value: 'PANT-01' } });

      // Esperar a que aparezca en la lista de resultados del autocompletado
      const productOption = await screen.findByText(/Pantalón Lino Premium/i);
      expect(productOption).toBeInTheDocument();

      // Click / mousedown para agregarlo al carrito
      fireEvent.mouseDown(productOption);

      // Verificar que el ítem aparece en el carrito de compras
      expect(screen.getAllByText(/Pantalón Lino Premium/i).length).toBeGreaterThanOrEqual(1);

      // 2. Intentar confirmar la venta
      const confirmButton = screen.getByRole('button', { name: /CONFIRMAR VENTA/i });
      fireEvent.click(confirmButton);

      // 3. Verificar que onAddSale fue llamado pero falló
      await waitFor(() => {
        expect(onAddSaleMock).toHaveBeenCalledTimes(1);
      });

      // 4. Verificar feedback al usuario vía showAlert
      expect(mockShowAlert).toHaveBeenCalledWith(
        'No se pudo registrar la venta. Verificá la conexión e intentá de nuevo. El carrito se mantuvo intacto.',
        'Error al guardar',
        'error'
      );

      // 5. Verificar que el carrito NO fue vaciado y sigue conteniendo el producto
      expect(screen.getAllByText(/Pantalón Lino Premium/i).length).toBeGreaterThanOrEqual(1);
    });

    it('vacía el carrito completamente cuando la venta se registra con éxito', async () => {
      const onAddSaleMock = vi.fn().mockResolvedValueOnce(undefined);

      renderWithModal(
        <Sales
          inventory={sampleInventory}
          recentSales={[]}
          onAddSale={onAddSaleMock}
          onDeleteSale={vi.fn()}
        />
      );

      // 1. Agregar el producto al carrito
      const searchInput = screen.getByPlaceholderText(/Buscar producto por SKU o nombre.../i);
      fireEvent.focus(searchInput);
      fireEvent.change(searchInput, { target: { value: 'PANT-01' } });

      const productOption = await screen.findByText(/Pantalón Lino Premium/i);
      fireEvent.mouseDown(productOption);

      // Verificar que está en el carrito
      expect(screen.getAllByText(/Pantalón Lino Premium/i).length).toBeGreaterThanOrEqual(1);

      // 2. Confirmar venta con éxito
      const confirmButton = screen.getByRole('button', { name: /CONFIRMAR VENTA/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(onAddSaleMock).toHaveBeenCalledTimes(1);
      });

      // 3. El carrito debe estar vacío: mensaje "No hay productos en el carrito" presente
      await waitFor(() => {
        expect(screen.getByText(/No hay productos en el carrito/i)).toBeInTheDocument();
      });
      expect(mockShowAlert).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. UI en WebOrdersManager.tsx: Diálogo previo al cancelar, botón directo de confirmar venta y alertas
  // ──────────────────────────────────────────────────────────────────────────
  describe('WebOrdersManager.tsx (Gestión de Pedidos Web)', () => {
    const mockOrder: WebOrder = {
      id: 'ord-web-12345678',
      customerId: 'cust-lucia',
      customerNombre: 'Lucía Fernández',
      customerEmail: 'lucia@test.com',
      customerTelefono: '1144556677',
      fecha: new Date().toISOString(),
      items: [
        { productId: 'prod-p1', descripcion: 'Pantalón Lino Premium', sku: 'PANT-01', cantidad: 1, precioUnitario: 7000 }
      ],
      total: 7000,
      tipoEnvio: 'retiro',
      estado: 'pending_transfer'
    };

    beforeEach(() => {
      mockGetDocs.mockResolvedValue({
        docs: [
          { id: mockOrder.id, data: () => mockOrder }
        ]
      });
    });

    it('requiere confirmación preventiva antes de cancelar; si el usuario cancela el diálogo, no altera el pedido', async () => {
      // El usuario rechaza la confirmación en el diálogo
      mockShowConfirm.mockResolvedValueOnce(false);

      renderWithModal(<WebOrdersManager />);

      await waitFor(() => {
        expect(screen.getByText(/Lucía Fernández/i)).toBeInTheDocument();
      });

      // Abrir modal de detalles haciendo clic en el botón de ver detalles
      const eyeBtn = screen.getByTitle('Ver Detalles');
      fireEvent.click(eyeBtn);

      expect(screen.getByText(/Detalle del Pedido/i)).toBeInTheDocument();

      // Hacer clic en la opción "Cancelado" del selector de estados
      const cancelStatusBtn = screen.getByRole('button', { name: /^Cancelado$/i });
      fireEvent.click(cancelStatusBtn);

      // Verificar que se presentó el diálogo preventivo
      await waitFor(() => {
        expect(mockShowConfirm).toHaveBeenCalledWith(
          expect.stringContaining('¿Estás seguro de que deseas cancelar el pedido #ord-web-'),
          'Cancelar Pedido',
          'error'
        );
      });

      // Dado que el usuario rechazó el diálogo (false):
      // No debe haberse ejecutado runTransaction para cancelar
      expect(mockRunTransaction).not.toHaveBeenCalled();
      // No debe haberse disparado la alerta de cancelación
      expect(mockShowAlert).not.toHaveBeenCalled();
    });

    it('ejecuta la cancelación y muestra alerta de feedback si el usuario confirma el diálogo preventivo', async () => {
      // El usuario acepta la cancelación
      mockShowConfirm.mockResolvedValueOnce(true);

      renderWithModal(<WebOrdersManager />);

      await waitFor(() => {
        expect(screen.getByText(/Lucía Fernández/i)).toBeInTheDocument();
      });

      // Abrir modal de detalles
      const eyeBtn = screen.getByTitle('Ver Detalles');
      fireEvent.click(eyeBtn);

      // Clic en Cancelado
      const cancelStatusBtn = screen.getByRole('button', { name: /^Cancelado$/i });
      fireEvent.click(cancelStatusBtn);

      await waitFor(() => {
        expect(mockRunTransaction).toHaveBeenCalled();
      });

      // Alerta de feedback mostrada
      expect(mockShowAlert).toHaveBeenCalledWith(
        'El pedido ha sido cancelado y el stock fue liberado.',
        'Pedido Cancelado',
        'info'
      );
    });

    it('posee un botón directo "Confirmar Pedido" en el modal de detalle que registra la venta y muestra feedback', async () => {
      mockShowConfirm.mockResolvedValueOnce(true); // Acepta la confirmación de venta

      renderWithModal(<WebOrdersManager onOrderFulfilled={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/Lucía Fernández/i)).toBeInTheDocument();
      });

      // Abrir modal de detalles
      const eyeBtn = screen.getByTitle('Ver Detalles');
      fireEvent.click(eyeBtn);

      // Buscar el botón directo "Confirmar Pedido" del modal
      const directConfirmBtn = screen.getByRole('button', { name: /Confirmar Pedido/i });
      expect(directConfirmBtn).toBeInTheDocument();

      // Clic en Confirmar Pedido
      fireEvent.click(directConfirmBtn);

      // Debe consultar confirmación
      await waitFor(() => {
        expect(mockShowConfirm).toHaveBeenCalledWith(
          expect.stringContaining('¿Confirmar venta del pedido #ord-web-'),
          'Confirmar Venta y Stock',
          'info'
        );
      });

      // Debe llamar al servicio de fulfillWebOrder
      await waitFor(() => {
        expect(mockFulfillWebOrder).toHaveBeenCalledWith(
          'TEST_SHOWROOM',
          'ord-web-12345678',
          expect.objectContaining({
            total: 7000
          })
        );
      });

      // Debe mostrar la alerta de feedback exitoso
      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          expect.stringContaining('Venta registrada correctamente (SALE_CONFIRMED_999)'),
          'Venta Confirmada',
          'success'
        );
      });

      // Debe actualizarse la UI mostrando el badge de "Pedido Confirmado"
      expect(screen.getByText(/Pedido Confirmado \(#SALE_CON\)/i)).toBeInTheDocument();
    });
  });
});
