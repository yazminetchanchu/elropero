import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StorefrontPage from './StorefrontPage';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { getDoc } from 'firebase/firestore';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    customerProfile: null,
    syncCart: vi.fn(),
    addToWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
    refreshOrders: vi.fn()
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
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  query: vi.fn(),
  where: vi.fn()
}));

describe('StorefrontPage', () => {
  it('renderiza correctamente el storefront y permite interactuar con productos', () => {
    const mockInventory = [
      {
        id: '1',
        sku: 'TEST1',
        descripcion: 'Remera Blanca',
        proveedor: 'Prov',
        categoria: 'REMERAS',
        cantidad: 10,
        costo: 500,
        ventaEfectivo: 1000,
        ventaTarjeta: 1200,
        talles: ['S', 'M'],
        colores: ['BLANCO'],
        imagenes: [],
        visible: true
      }
    ];

    const mockSettings = {
      storeName: 'EL ROPERO STORE'
    };

    render(
      <BrowserRouter>
        <StorefrontPage inventoryProp={mockInventory} settingsProp={mockSettings as any} />
      </BrowserRouter>
    );

    // Debe mostrar el nombre de la tienda
    expect(screen.getByText('EL ROPERO STORE')).toBeInTheDocument();

    // Debe mostrar el producto
    expect(screen.getAllByText('Remera Blanca').length).toBeGreaterThan(0);
  });

  it('deshabilita talles sin stock y habilita colores según el talle elegido', () => {
    const mockInventory = [
      {
        id: '1',
        sku: 'TEST1',
        descripcion: 'Remera Variantes',
        proveedor: 'Prov',
        categoria: 'REMERAS',
        cantidad: 10,
        costo: 500,
        ventaEfectivo: 1000,
        ventaTarjeta: 1200,
        talles: ['S', 'M', 'L'],
        colores: ['BLANCO', 'NEGRO'],
        stockPorVariante: {
          'S-BLANCO': 5,
          'S-NEGRO': 0,
          'M-BLANCO': 0,
          'M-NEGRO': 3,
          'L-BLANCO': 0,
          'L-NEGRO': 0
        },
        imagenes: [],
        visible: true
      }
    ];

    const mockSettings = { storeName: 'EL ROPERO STORE' };

    render(
      <BrowserRouter>
        <StorefrontPage inventoryProp={mockInventory as any} settingsProp={mockSettings as any} />
      </BrowserRouter>
    );

    // Abrir modal de detalle
    fireEvent.click(screen.getByText('Ver Detalle'));

    // S tiene stock (S-BLANCO:5) → habilitado
    // M tiene stock (M-NEGRO:3) → habilitado
    // L no tiene stock en ninguna variante (L-BLANCO:0, L-NEGRO:0) → debe quedar deshabilitado
    const btnS = screen.getByRole('button', { name: /^S$/i });
    const btnM = screen.getByRole('button', { name: /^M$/i });
    const btnL = screen.getByRole('button', { name: /^L$/i });

    expect(btnS).not.toBeDisabled();
    expect(btnM).not.toBeDisabled();
    expect(btnL).toBeDisabled(); // ← Correcto: L agotado en todas las variantes

    // Al estar seleccionado 'S' por defecto:
    // S-BLANCO tiene stock 5 (BLANCO habilitado), S-NEGRO tiene stock 0 (NEGRO deshabilitado)
    const btnBlanco = screen.getByRole('button', { name: 'BLANCO' });
    const btnNegro = screen.getByRole('button', { name: 'NEGRO' });

    expect(btnBlanco).not.toBeDisabled();
    expect(btnNegro).toBeDisabled();

    // Seleccionar talle 'M'
    fireEvent.click(btnM);

    // Ahora para 'M': M-BLANCO (0 stock) deshabilitado, M-NEGRO (3 stock) habilitado
    expect(btnBlanco).toBeDisabled();
    expect(btnNegro).not.toBeDisabled();
  });

  it('activa el modo compacto en el header al hacer scroll hacia abajo', () => {
    const mockInventory = [];
    const mockSettings = { storeName: 'EL ROPERO' };

    const { container } = render(
      <BrowserRouter>
        <StorefrontPage inventoryProp={mockInventory as any} settingsProp={mockSettings as any} />
      </BrowserRouter>
    );

    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
    expect(header?.className).toContain('sticky');

    // Simular scroll hacia abajo
    window.scrollY = 50;
    fireEvent.scroll(window);

    // Verificar que el título se achique suavemente
    const title = screen.getByText('EL ROPERO');
    expect(title.className).toContain('text-[11px]');
  });

  it('abre el drawer de filtrado estetico estilo Zhoue y permite seleccionar talles y colores', () => {
    const mockInventory = [
      {
        id: '1',
        sku: 'TEST1',
        descripcion: 'Vestido Negro',
        proveedor: 'ZhoueProv',
        categoria: 'VESTIDOS',
        cantidad: 5,
        costo: 1000,
        ventaEfectivo: 2500,
        ventaTarjeta: 3000,
        talles: ['S', 'M'],
        colores: ['NEGRO'],
        imagenes: [],
        visible: true
      }
    ];

    const mockSettings = { storeName: 'EL ROPERO STORE' };

    render(
      <BrowserRouter>
        <StorefrontPage inventoryProp={mockInventory as any} settingsProp={mockSettings as any} />
      </BrowserRouter>
    );

    // Click en el botón de Filtrar estilo Zhoue
    const btnFiltrar = screen.getByRole('button', { name: /Filtrar/i });
    expect(btnFiltrar).toBeInTheDocument();
    fireEvent.click(btnFiltrar);

    // Debe mostrar el título del drawer "Filtros y Orden"
    expect(screen.getByText('Filtros y Orden')).toBeInTheDocument();

    // Seleccionar talle 'S' dentro del drawer
    const talleButtons = screen.getAllByRole('button', { name: 'S' });
    fireEvent.click(talleButtons[0]);

    // Presionar "Ver 1 Producto"
    fireEvent.click(screen.getByText(/Ver 1 Producto/i));

    // Verificar que aparece la pill/chip activa del filtro "Talle:"
    expect(screen.getByText('Talle:')).toBeInTheDocument();
  });

  it('muestra la pantalla de tienda pausada con comunicación clara y oculta el catálogo cuando storeHidden es true', () => {
    const mockInventory = [
      {
        id: '1',
        sku: 'TEST1',
        descripcion: 'Remera Oculta',
        proveedor: 'Prov',
        categoria: 'REMERAS',
        cantidad: 10,
        costo: 500,
        ventaEfectivo: 1000,
        ventaTarjeta: 1200,
        talles: ['S'],
        colores: ['NEGRO'],
        imagenes: [],
        visible: true
      }
    ];

    const mockSettings = {
      storeName: 'EL ROPERO PAUSADO',
      storeHidden: true,
      storePausedMessage: 'Pausado por mantenimiento de inventario. Volvemos a las 18 hs.',
      contactWhatsapp: '5492346685836'
    };

    render(
      <BrowserRouter>
        <StorefrontPage inventoryProp={mockInventory as any} settingsProp={mockSettings as any} />
      </BrowserRouter>
    );

    // Debe mostrar la cabecera de la tienda pausada y el mensaje personalizado
    expect(screen.getByText('TIENDA EN MANTENIMIENTO')).toBeInTheDocument();
    expect(screen.getByText('Pausado por mantenimiento de inventario. Volvemos a las 18 hs.')).toBeInTheDocument();
    expect(screen.getByText('CONSULTAR POR WHATSAPP')).toBeInTheDocument();

    // El catálogo de productos NO debe estar presente
    expect(screen.queryByText('Remera Oculta')).not.toBeInTheDocument();
  });

  it('limpia localStorage y no muestra el modal de pago pendiente cuando la orden no existe en base de datos', async () => {
    const mockInventory = [];
    const mockSettings = { storeName: 'EL ROPERO STORE' };

    (getDoc as any).mockResolvedValueOnce({ exists: () => false });
    localStorage.setItem('ropero_last_pending_order', JSON.stringify({ orderId: 'FHEQVU' }));

    await act(async () => {
      render(
        <BrowserRouter>
          <StorefrontPage inventoryProp={mockInventory as any} settingsProp={mockSettings as any} />
        </BrowserRouter>
      );
    });

    // No debe mostrar el modal de Pago no completado
    expect(screen.queryByText('Pago no completado')).not.toBeInTheDocument();
    // Debe haber eliminado ropero_last_pending_order de localStorage
    expect(localStorage.getItem('ropero_last_pending_order')).toBeNull();
  });
});



