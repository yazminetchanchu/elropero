import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StorefrontPage from './StorefrontPage';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

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

vi.mock('../services/webOrderFulfillment', () => ({
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

  it('permite siempre la selección de talle y habilita los colores según el talle elegido', () => {
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

    // Los tres talles (S, M, L) deben estar habilitados
    const btnS = screen.getByRole('button', { name: 'S' });
    const btnM = screen.getByRole('button', { name: 'M' });
    const btnL = screen.getByRole('button', { name: 'L' });

    expect(btnS).not.toBeDisabled();
    expect(btnM).not.toBeDisabled();
    expect(btnL).not.toBeDisabled();

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
});
