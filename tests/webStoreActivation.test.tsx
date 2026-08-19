import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import WebManager from '../components/WebManager';
import { ModalProvider } from '../contexts/ModalContext';
import { WebSettings, InventoryItem } from '../types';

describe('Gestión y Activación de Tienda Web (WebManager)', () => {
  const mockWebSettings: WebSettings = {
    storeName: 'EL ROPERO',
    storeHidden: false,
    categoriesOrder: ['REMERAS'],
    contactWhatsapp: '5492346685836',
  };

  const mockInventory: InventoryItem[] = [
    {
      id: 'item1',
      sku: 'SKU-001',
      descripcion: 'Vestido Seda',
      proveedor: 'Prov 1',
      cantidad: 5,
      costo: 1000,
      ventaEfectivo: 2000,
      ventaTarjeta: 2400,
      categoria: 'REMERAS',
      talles: ['S'],
      colores: ['NEGRO'],
      imagenes: [],
      visible: true
    }
  ];

  it('muestra el estado de la tienda en el header y permite alternar entre Activa y Pausada con guardado inmediato', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
    const onUpdateInventory = vi.fn();

    render(
      <ModalProvider>
        <WebManager
          inventory={mockInventory}
          webSettings={mockWebSettings}
          selectedCategory=""
          onUpdateInventory={onUpdateInventory}
          onUpdateSettings={onUpdateSettings}
        />
      </ModalProvider>
    );

    // Header debe mostrar "Tienda Activa"
    const headerToggleBtn = screen.getByTitle('Click para Pausar la Tienda Web');
    expect(headerToggleBtn).toBeInTheDocument();
    expect(screen.getByText('Tienda Activa')).toBeInTheDocument();

    // Al hacer click en el botón de estado, debe invocar onUpdateSettings con storeHidden: true
    fireEvent.click(headerToggleBtn);

    await waitFor(() => {
      expect(onUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          storeHidden: true
        })
      );
    });
  });

  it('muestra el estado y botón de Activar Tienda cuando la tienda está pausada', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
    const onUpdateInventory = vi.fn();

    render(
      <ModalProvider>
        <WebManager
          inventory={mockInventory}
          webSettings={{ ...mockWebSettings, storeHidden: true }}
          selectedCategory=""
          onUpdateInventory={onUpdateInventory}
          onUpdateSettings={onUpdateSettings}
        />
      </ModalProvider>
    );

    // Debe mostrar "Tienda Pausada" y botón para Activar
    const headerToggleBtn = screen.getByTitle('Click para Activar la Tienda Web');
    expect(headerToggleBtn).toBeInTheDocument();
    expect(screen.getByText('Tienda Pausada')).toBeInTheDocument();

    fireEvent.click(headerToggleBtn);

    await waitFor(() => {
      expect(onUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          storeHidden: false
        })
      );
    });
  });

  it('permite alternar el estado y guardar desde la pestaña Configuración', async () => {
    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);
    const onUpdateInventory = vi.fn();

    render(
      <ModalProvider>
        <WebManager
          inventory={mockInventory}
          webSettings={mockWebSettings}
          selectedCategory=""
          onUpdateInventory={onUpdateInventory}
          onUpdateSettings={onUpdateSettings}
        />
      </ModalProvider>
    );

    // Ir a pestaña Configuración
    const settingsTabBtn = screen.getByRole('button', { name: /Configuración/i });
    fireEvent.click(settingsTabBtn);

    // Buscar botón Pausar Tienda
    const pausarBtn = screen.getByRole('button', { name: /Pausar Tienda/i });
    expect(pausarBtn).toBeInTheDocument();

    fireEvent.click(pausarBtn);

    await waitFor(() => {
      expect(onUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          storeHidden: true
        })
      );
    });
  });
});
