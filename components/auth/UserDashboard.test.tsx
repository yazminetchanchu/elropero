import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserDashboard from './UserDashboard';
import { CustomerOrder, CustomerProfile } from '../../contexts/AuthContext';
import { InventoryItem, GiftCard } from '../../types';

// Mocks
let mockProfile: CustomerProfile;
let mockOrders: CustomerOrder[];
const mockLogout = vi.fn();
const mockUpdateProfile = vi.fn();
const mockRemoveFromWishlist = vi.fn();
const mockAddToCart = vi.fn();
const mockRequestExchange = vi.fn();
const mockOnClose = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    customerProfile: mockProfile,
    orders: mockOrders,
    logout: mockLogout,
    updateProfile: mockUpdateProfile,
    removeFromWishlist: mockRemoveFromWishlist,
  }),
}));

const mockShowAlert = vi.fn();
const mockShowConfirm = vi.fn().mockResolvedValue(true);

vi.mock('../../contexts/ModalContext', () => ({
  useModal: () => ({
    showAlert: mockShowAlert,
    showConfirm: mockShowConfirm,
  }),
}));

const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: (...args: any[]) => mockGetDocs(...args),
}));

vi.mock('../../services/firebase', () => ({
  db: {},
}));

describe('UserDashboard Full Suite', () => {
  const sampleInventory: InventoryItem[] = [
    {
      id: 'prod-fav-1',
      sku: 'REM-FAV',
      descripcion: 'Remera Favorita',
      proveedor: 'Prov A',
      categoria: 'Remeras',
      cantidad: 5,
      costo: 1000,
      ventaEfectivo: 2500,
      ventaTarjeta: 3000,
      talles: ['M'],
      colores: ['Negro'],
      imagenes: ['https://example.com/remera.jpg'],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockProfile = {
      uid: 'usr-1',
      email: 'sofia@example.com',
      nombre: 'SOFIA MARTINEZ',
      telefono: '1144556677',
      giftCards: ['GC-PROMO-100'],
      wishlist: ['prod-fav-1'],
      direcciones: [
        {
          id: 'addr-1',
          calle: 'Av. Corrientes',
          numero: '1234',
          pisoDepto: '4A',
          localidad: 'Balvanera',
          provincia: 'CABA',
          codigoPostal: '1043',
          esPrincipal: true,
        },
      ],
    };

    mockOrders = [
      {
        id: 'ord-101',
        fecha: new Date().toISOString(),
        total: 5000,
        subtotal: 5000,
        estado: 'Confirmado',
        metodoPago: 'Efectivo',
        tipoEnvio: 'envio',
        costoEnvio: 500,
        trackingNumber: 'TN-998877',
        items: [
          {
            productId: 'prod-fav-1',
            sku: 'REM-FAV',
            descripcion: 'Remera Favorita',
            cantidad: 2,
            precioUnitario: 2500,
            talle: 'M',
            color: 'Negro',
          },
        ],
      } as CustomerOrder,
    ];

    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'gc-1',
          data: () => ({
            id: 'gc-1',
            codigo: 'GC-PROMO-100',
            saldo: 15000,
            montoInicial: 20000,
            estado: 'ACTIVA',
            active: true,
            destinatario: 'SOFIA',
            email: 'sofia@example.com',
            fechaCreacion: new Date().toISOString(),
          }),
        },
      ],
    });
  });

  const renderDashboard = () => {
    return render(
      <UserDashboard
        isOpen={true}
        onClose={mockOnClose}
        inventory={sampleInventory}
        onAddToCart={mockAddToCart}
        onRequestExchange={mockRequestExchange}
      />
    );
  };

  it('renderiza correctamente el Drawer con el email y pestañas', () => {
    renderDashboard();

    expect(screen.getByText('Mi Cuenta')).toBeInTheDocument();
    expect(screen.getByText('sofia@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Compras/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gift Cards/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Envío/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Favoritos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mis Datos/i })).toBeInTheDocument();
  });

  it('pestaña Compras: muestra orden con tracking number y link a Mi Correo', () => {
    renderDashboard();

    expect(screen.getAllByText('Remera Favorita').length).toBeGreaterThan(0);
    expect(screen.getByText(/Seguimiento: TN-998877/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir a Mi Correo/i })).toHaveAttribute(
      'href',
      'https://micorreo.correoargentino.com.ar/'
    );
  });

  it('pestaña Envío (Direcciones): permite abrir formulario y agregar nueva dirección', async () => {
    mockUpdateProfile.mockResolvedValue(undefined);

    renderDashboard();

    // Click en Envío
    fireEvent.click(screen.getByRole('button', { name: /Envío/i }));

    // Ver dirección existente
    expect(screen.getByText(/Av\. Corrientes 1234/i)).toBeInTheDocument();
    expect(screen.getByText('Principal')).toBeInTheDocument();

    // Click en "+ Nueva dirección"
    fireEvent.click(screen.getByText(/Nueva dirección/i));

    expect(screen.getByText('Nueva Dirección de Envío')).toBeInTheDocument();

    // Completar formulario
    fireEvent.change(screen.getByPlaceholderText('AV. RIVADAVIA'), { target: { value: 'Belgrano' } });
    fireEvent.change(screen.getByPlaceholderText('1234'), { target: { value: '456' } });
    fireEvent.change(screen.getByPlaceholderText('1406'), { target: { value: '1000' } });
    fireEvent.change(screen.getByPlaceholderText('RECOLETA / CABA'), { target: { value: 'San Nicolás' } });
    fireEvent.change(screen.getByPlaceholderText('BUENOS AIRES'), { target: { value: 'CABA' } });

    // Enviar formulario
    fireEvent.click(screen.getByRole('button', { name: /Guardar Dirección/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        direcciones: expect.arrayContaining([
          expect.objectContaining({
            calle: 'BELGRANO',
            numero: '456',
            codigoPostal: '1000',
            localidad: 'SAN NICOLÁS',
            provincia: 'CABA',
          }),
        ]),
      });
    });
  });

  it('pestaña Favoritos: permite añadir al carrito y remover de la wishlist', () => {
    renderDashboard();

    // Click en Favoritos
    fireEvent.click(screen.getByRole('button', { name: /Favoritos/i }));

    expect(screen.getByText('Remera Favorita')).toBeInTheDocument();
    expect(screen.getByText('$2.500')).toBeInTheDocument();

    // Añadir al carrito
    fireEvent.click(screen.getByRole('button', { name: /Añadir al Carrito/i }));
    expect(mockAddToCart).toHaveBeenCalledWith(sampleInventory[0], 'M', 'Negro');
    expect(screen.getByText('Agregado al carrito')).toBeInTheDocument();

    // Remover de favoritos (botón con ícono de papelera)
    const trashIcon = document.querySelector('.lucide-trash2, .lucide-trash-2')!;
    const removeBtn = trashIcon.closest('button')!;
    fireEvent.click(removeBtn);
    expect(mockRemoveFromWishlist).toHaveBeenCalledWith('prod-fav-1');
  });

  it('pestaña Mis Datos: permite actualizar nombre y teléfono, y cerrar sesión', async () => {
    mockUpdateProfile.mockResolvedValue(undefined);

    renderDashboard();

    // Click en Mis Datos
    fireEvent.click(screen.getByRole('button', { name: /Mis Datos/i }));

    const nameInput = screen.getByPlaceholderText('COMPLETA TU NOMBRE');
    const phoneInput = screen.getByPlaceholderText('EJ. 11 1234 5678');

    expect((nameInput as HTMLInputElement).value).toBe('SOFIA MARTINEZ');
    expect((phoneInput as HTMLInputElement).value).toBe('1144556677');

    fireEvent.change(nameInput, { target: { value: 'Sofía Agustina Martínez' } });
    fireEvent.change(phoneInput, { target: { value: '1199887766' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        nombre: 'SOFÍA AGUSTINA MARTÍNEZ',
        telefono: '1199887766',
      });
    });

    // Cerrar sesión
    fireEvent.click(screen.getByRole('button', { name: /Cerrar Sesión/i }));
    expect(mockLogout).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });
});
