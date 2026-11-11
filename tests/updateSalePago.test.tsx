import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import Sales from '../components/Sales';
import { recalculateSaleWithPaymentMethod, computeSaleBreakdown } from '../services/finance';
import { Sale, InventoryItem } from '../types';
import { ModalProvider } from '../contexts/ModalContext';

describe('Actualización de método de pago (Historial, Caja y Ganancia)', () => {
  const mockInventory: InventoryItem[] = [
    {
      id: 'prod-1',
      sku: 'SKU-VESTIDO',
      descripcion: 'Vestido Floral',
      proveedor: 'P1',
      categoria: 'VESTIDOS',
      cantidad: 10,
      costo: 5000,
      ventaEfectivo: 10000,
      ventaTarjeta: 12700,
      talles: [],
      colores: [],
      imagenes: []
    }
  ];

  it('recalculateSaleWithPaymentMethod recalcula total y breakdown para venta normal de Efectivo a Tarjeta', () => {
    const saleEfectivo: Sale = {
      id: 'sale-1',
      fecha: new Date().toISOString(),
      tipo: 'venta',
      items: [
        {
          id: 'prod-1',
          sku: 'SKU-VESTIDO',
          descripcion: 'Vestido Floral',
          cantidad: 1,
          costo: 5000,
          precioEfectivo: 10000,
          precioTarjeta: 12700,
          descuento: 0
        }
      ],
      total: 10000,
      pago: { efectivo: 100, tarjeta: 0 }
    };

    // Estado inicial en Efectivo
    const initialBreakdown = computeSaleBreakdown(saleEfectivo, []);
    expect(initialBreakdown.efectivo).toBe(10000);
    expect(initialBreakdown.tarjeta).toBe(0);
    expect(initialBreakdown.totalCobrado).toBe(10000);
    expect(initialBreakdown.ganancia).toBe(5000); // 10000 - 5000

    // Modificar a Tarjeta (T)
    const updatedSale = recalculateSaleWithPaymentMethod(saleEfectivo, { efectivo: 0, tarjeta: 100 }, mockInventory);
    expect(updatedSale.total).toBe(12700);
    expect(updatedSale.pago).toEqual({ efectivo: 0, tarjeta: 100 });

    // Verificar impacto en Caja y Ganancia
    const updatedBreakdown = computeSaleBreakdown(updatedSale, []);
    expect(updatedBreakdown.efectivo).toBe(0);
    expect(updatedBreakdown.tarjeta).toBe(12700);
    expect(updatedBreakdown.totalCobrado).toBe(12700);
    expect(updatedBreakdown.ganancia).toBe(5000); // Base precio efectivo (10000 - 5000)
  });

  it('recalculateSaleWithPaymentMethod recalcula de Tarjeta a Efectivo', () => {
    const saleTarjeta: Sale = {
      id: 'sale-2',
      fecha: new Date().toISOString(),
      tipo: 'venta',
      items: [
        {
          id: 'prod-1',
          sku: 'SKU-VESTIDO',
          descripcion: 'Vestido Floral',
          cantidad: 1,
          costo: 5000,
          precioEfectivo: 10000,
          precioTarjeta: 12700,
          descuento: 0
        }
      ],
      total: 12700,
      pago: { efectivo: 0, tarjeta: 100 }
    };

    // Modificar a Efectivo (E)
    const updatedSale = recalculateSaleWithPaymentMethod(saleTarjeta, { efectivo: 100, tarjeta: 0 }, mockInventory);
    expect(updatedSale.total).toBe(10000);
    expect(updatedSale.pago).toEqual({ efectivo: 100, tarjeta: 0 });

    const updatedBreakdown = computeSaleBreakdown(updatedSale, []);
    expect(updatedBreakdown.efectivo).toBe(10000);
    expect(updatedBreakdown.tarjeta).toBe(0);
    expect(updatedBreakdown.totalCobrado).toBe(10000);
    expect(updatedBreakdown.ganancia).toBe(5000); // 10000 - 5000
  });

  it('el selector en Sales (Historial) invoca onUpdateSalePago con el nuevo pago', () => {
    const onUpdateSalePagoMock = vi.fn();
    const sale: Sale = {
      id: 'sale-1',
      fecha: new Date().toISOString(),
      tipo: 'venta',
      items: [
        {
          id: 'prod-1',
          sku: 'SKU-VESTIDO',
          descripcion: 'Vestido Floral',
          cantidad: 1,
          costo: 5000,
          precioEfectivo: 10000,
          precioTarjeta: 12700,
          descuento: 0
        }
      ],
      total: 10000,
      pago: { efectivo: 100, tarjeta: 0 }
    };

    render(
      <ModalProvider>
        <Sales
          inventory={mockInventory}
          onAddSale={vi.fn()}
          onDeleteSale={vi.fn()}
          onUpdateSalePago={onUpdateSalePagoMock}
          recentSales={[sale]}
          giftCards={[]}
        />
      </ModalProvider>
    );

    // En historial aparece el valor inicial
    expect(screen.getByText(/\$ 10\.000/i)).toBeInTheDocument();
    expect(screen.getByText(/\(E\)/i)).toBeInTheDocument();

    // Seleccionar select de pago (el segundo combobox de la pantalla, o el que contiene 'E' y 'T')
    const selects = screen.getAllByRole('combobox');
    const paymentSelect = selects.find(s => s.querySelector('option[value="E"]') && s.querySelector('option[value="T"]'))!;
    expect(paymentSelect).toHaveValue('E');

    // Cambiar a Tarjeta (T)
    fireEvent.change(paymentSelect, { target: { value: 'T' } });

    expect(onUpdateSalePagoMock).toHaveBeenCalledWith('sale-1', { efectivo: 0, tarjeta: 100 });
  });

  it('al recibir recentSales actualizada, el historial muestra el nuevo total y el nuevo pago', () => {
    const saleUpdated: Sale = {
      id: 'sale-1',
      fecha: new Date().toISOString(),
      tipo: 'venta',
      items: [
        {
          id: 'prod-1',
          sku: 'SKU-VESTIDO',
          descripcion: 'Vestido Floral',
          cantidad: 1,
          costo: 5000,
          precioEfectivo: 10000,
          precioTarjeta: 12700,
          descuento: 0
        }
      ],
      total: 12700,
      pago: { efectivo: 0, tarjeta: 100 }
    };

    render(
      <ModalProvider>
        <Sales
          inventory={mockInventory}
          onAddSale={vi.fn()}
          onDeleteSale={vi.fn()}
          onUpdateSalePago={vi.fn()}
          recentSales={[saleUpdated]}
          giftCards={[]}
        />
      </ModalProvider>
    );

    // Ahora en historial aparece el nuevo total de tarjeta y (T)
    expect(screen.getByText(/\$ 12\.700/i)).toBeInTheDocument();
    expect(screen.getByText(/\(T\)/i)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    const paymentSelect = selects.find(s => s.querySelector('option[value="E"]') && s.querySelector('option[value="T"]'))!;
    expect(paymentSelect).toHaveValue('T');
  });
});
