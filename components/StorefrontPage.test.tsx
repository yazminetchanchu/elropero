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
});
