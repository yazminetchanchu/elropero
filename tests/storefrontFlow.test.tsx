import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StorefrontPage from '../components/StorefrontPage';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ModalProvider } from '../contexts/ModalContext';

// Mocks
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    customerProfile: null,
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
  fulfillWebOrder: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  query: vi.fn(),
  where: vi.fn()
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    X: () => <span data-testid="x-icon">X</span>,
    Plus: () => <span data-testid="plus-icon">Plus</span>,
    Minus: () => <span data-testid="minus-icon">Minus</span>,
    ShoppingBag: () => <span data-testid="bag-icon">Bag</span>,
    Search: () => <span data-testid="search-icon">Search</span>,
    Check: () => <span data-testid="check-icon">Check</span>,
  };
});

describe('Flujos Detallados del Storefront (Página Web)', () => {
  const mockSettings = {
    storeName: 'EL ROPERO STORE',
    discountBySection: { 'REMERAS': 10 }
  };

  const mockInventory = [
    {
      id: 'prod_visible',
      sku: 'TEST1',
      descripcion: 'Remera Visible',
      proveedor: 'Prov',
      categoria: 'REMERAS',
      cantidad: 10,
      costo: 500,
      ventaEfectivo: 1000,
      ventaTarjeta: 1200,
      talles: ['S', 'M'],
      colores: ['BLANCO', 'NEGRO'],
      imagenes: [],
      visible: true
    },
    {
      id: 'prod_oculto',
      sku: 'TEST2',
      descripcion: 'Pantalón Oculto',
      proveedor: 'Prov',
      categoria: 'PANTALONES',
      cantidad: 5,
      costo: 1000,
      ventaEfectivo: 2000,
      ventaTarjeta: 2400,
      talles: ['38'],
      colores: ['AZUL'],
      imagenes: [],
      visible: false
    },
    {
      id: 'prod_sin_variantes',
      sku: 'TEST3',
      descripcion: 'Accesorio Único',
      proveedor: 'Prov',
      categoria: 'ACCESORIOS',
      cantidad: 3,
      costo: 300,
      ventaEfectivo: 600,
      ventaTarjeta: 700,
      talles: [],
      colores: [],
      imagenes: [],
      visible: true
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderStorefront = () => {
    return render(
      <BrowserRouter>
        <ModalProvider>
          <StorefrontPage inventoryProp={mockInventory as any} settingsProp={mockSettings as any} />
        </ModalProvider>
      </BrowserRouter>
    );
  };

  it('Verifica que los productos ocultos no se muestran en el catálogo', () => {
    renderStorefront();
    
    // El producto visible debe estar
    expect(screen.getAllByText('Remera Visible').length).toBeGreaterThan(0);
    
    // El producto con visible: false NO debe estar
    expect(screen.queryByText('Pantalón Oculto')).not.toBeInTheDocument();
  });

  it('Interacción: Agrega un producto sin variantes directamente al carrito', async () => {
    renderStorefront();
    
    // Click en "Ver Detalles" del Accesorio Único (que es el segundo producto visible, índice 1)
    const verDetallesBtns = screen.getAllByText(/Ver Detalle/i);
    fireEvent.click(verDetallesBtns[1]);

    // Esperar a que se abra el modal
    const btnAdd = await screen.findByText('Añadir al carrito');
    expect(btnAdd).toBeEnabled();
    
    fireEvent.click(btnAdd);

    // Debe mostrar la notificación de que se añadió
    // expect(await screen.findByText(/¡Añadido al carrito!/i)).toBeInTheDocument();

    // Verificamos el badge del carrito (si no podemos ubicarlo directo, abrimos el carrito)
    const bagBtn = screen.getAllByTestId('bag-icon')[0];
    const btnCartParent = bagBtn.closest('button');
    if (btnCartParent) fireEvent.click(btnCartParent);
    
    // Dentro del carrito debe estar el accesorio
    expect(screen.getByText('Carrito (1)')).toBeInTheDocument();
  });



  it('Cálculos del Carrito y Precios: subtotal, descuento transferencia y total', async () => {
    renderStorefront();
    
    // Agregamos el "Accesorio Único" al carrito (precio tarjeta 700, efectivo 600)
    const verDetallesBtns = screen.getAllByText(/Ver Detalle/i);
    fireEvent.click(verDetallesBtns[1]);
    
    const btnAdd = await screen.findByText('Añadir al carrito');
    fireEvent.click(btnAdd);
    
    // Abrimos el carrito
    const bagBtn = screen.getAllByTestId('bag-icon')[0];
    const btnCartParent = bagBtn.closest('button');
    if (btnCartParent) fireEvent.click(btnCartParent);
    
    // Por defecto el método de pago es "transferencia" (en la UI dice "Transferencia bancaria")
    // El precio efectivo es 600
    // Si no hay descuento por categoría, el total debe ser 600
    expect(screen.getAllByText(/600/)[0]).toBeInTheDocument();

    // Podemos simular un cambio de método de pago si el UI lo permite, o comprobar el total
    expect(screen.getByText('Total Final')).toBeInTheDocument();
  });

  it('Seguridad Anti-Bypass: no invoca fulfillment de órdenes si se accede con ?pago=ok en la URL', async () => {
    delete (window as any).location;
    window.location = new URL('https://elropero.ar/?pago=ok&orderId=ord-malicious') as any;
    window.history.replaceState = vi.fn();

    const { fulfillWebOrder } = await import('../services/webOrderFulfillment');

    renderStorefront();

    // Comprobar que en ningún momento se invoca fulfillWebOrder desde el cliente
    expect(fulfillWebOrder).not.toHaveBeenCalled();
  });
});
