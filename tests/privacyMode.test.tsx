import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { PrivacyProvider, usePrivacy } from '../contexts/PrivacyContext';
import Dashboard from '../components/Dashboard';
import Sales from '../components/Sales';
import Expenses from '../components/Expenses';
import Layout from '../components/Layout';
import { BrowserRouter } from 'react-router-dom';

// Mock de servicios de finanzas
vi.mock('../services/finance', () => ({
  computeSaleBreakdown: vi.fn(() => ({
    efectivo: 1000,
    tarjeta: 500,
    ganancia: 400,
    costoTotal: 1100,
    totalCobrado: 1500,
  })),
  isMonth: vi.fn(() => true),
  calcTrend: vi.fn(() => ({ value: 15.5, isPositive: true })),
  calculatePricesFromCost: vi.fn(() => ({ efectivo: 2000, tarjeta: 2400 }))
}));

// Mock simple de WebOrderToSale para Sales
vi.mock('../services/webOrderToSale', () => ({
  parseSafeDate: vi.fn((d) => new Date(d || '2026-11-10T12:00:00Z'))
}));

describe('Modo Privacidad: Ocultar datos de ganancia, caja, etc.', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const mockInventory = [
    {
      id: 'item-1',
      sku: 'REM-001',
      descripcion: 'Remera Negra Oversize',
      proveedor: 'Proveedor Central',
      costo: 3500,
      ventaEfectivo: 7000,
      ventaTarjeta: 8400,
      cantidad: 10,
    }
  ];

  const mockSales = [
    {
      id: 'sale-1',
      fecha: '2026-11-10T10:00:00Z',
      items: [
        { id: 'item-1', sku: 'REM-001', descripcion: 'Remera Negra', cantidad: 1, precio: 7000, costo: 3500 }
      ],
      total: 7000,
      tipo: 'venta' as const,
      pago: { efectivo: 100, tarjeta: 0 }
    }
  ];

  const mockExpenses = [
    { id: 'exp-1', concepto: 'Bolsas y Packaging', monto: 12000, fecha: '2026-11-05' }
  ];

  it('Dashboard muestra valores normales inicialmente y los enmascara al activar el modo privacidad', () => {
    render(
      <PrivacyProvider>
        <Dashboard
          inventory={mockInventory}
          sales={mockSales as any}
          expenses={mockExpenses}
          giftCards={[]}
          closures={[]}
          webSettings={{ categoriesOrder: [] }}
          onUpdateItem={vi.fn()}
          onDeleteItem={vi.fn()}
        />
      </PrivacyProvider>
    );

    // Inicialmente los números son visibles
    const toggleBtn = screen.getByTestId('toggle-privacy-btn');
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.getByText(/Ocultar Ganancia \/ Caja/i)).toBeInTheDocument();

    // El costo unitario de la prenda aparece en la tabla
    expect(screen.getByText(/\$ 3\.500/)).toBeInTheDocument();

    // Al hacer click en el botón de privacidad
    fireEvent.click(toggleBtn);

    // El botón cambia de texto y estado
    expect(screen.getByText(/Datos Ocultos \(Privacidad\)/i)).toBeInTheDocument();

    // Las métricas de ganancia y caja se ocultan como ••••••
    const maskedElements = screen.getAllByText(/\$ ••••••|••••••/);
    expect(maskedElements.length).toBeGreaterThanOrEqual(3);

    // En la tabla de inventario, el costo se oculta como ••••••
    expect(screen.queryByText(/\$ 3\.500/)).not.toBeInTheDocument();

    // Persiste en localStorage
    expect(localStorage.getItem('el_ropero_hide_financials')).toBe('true');

    // Al volver a hacer click, los valores se muestran nuevamente
    fireEvent.click(toggleBtn);
    expect(screen.getByText(/\$ 3\.500/)).toBeInTheDocument();
    expect(localStorage.getItem('el_ropero_hide_financials')).toBe('false');
  });

  it('Sales (Caja) oculta totales y formas de pago cuando el modo privacidad está activado', () => {
    render(
      <PrivacyProvider>
        <Sales
          inventory={mockInventory}
          recentSales={mockSales as any}
          onAddSale={vi.fn()}
          onDeleteSale={vi.fn()}
          giftCards={[]}
        />
      </PrivacyProvider>
    );

    // Botón de privacidad en la cabecera de Caja
    const salesPrivacyBtn = screen.getByTestId('sales-toggle-privacy-btn');
    expect(salesPrivacyBtn).toBeInTheDocument();
    expect(screen.getByText('Ocultar Cifras')).toBeInTheDocument();

    // El total de la venta en el historial es visible
    expect(screen.getByText(/\$ 7\.000/)).toBeInTheDocument();

    // Activamos privacidad en Caja
    fireEvent.click(salesPrivacyBtn);

    expect(screen.getByText('Cifras Ocultas')).toBeInTheDocument();
    // El monto del historial ahora se oculta
    expect(screen.queryByText(/\$ 7\.000/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/\$ ••••••/).length).toBeGreaterThanOrEqual(1);
  });

  it('Expenses (Egresos) oculta los montos de salida cuando la privacidad está activa', () => {
    render(
      <PrivacyProvider>
        <Expenses
          expenses={mockExpenses}
          onAddExpense={vi.fn()}
          onUpdateExpense={vi.fn()}
          onDeleteExpense={vi.fn()}
        />
      </PrivacyProvider>
    );

    // Inicialmente visible
    expect(screen.getByText(/-\$ 12\.000/)).toBeInTheDocument();

    // Clic en el botón de privacidad de Expenses
    const expensesPrivacyBtn = screen.getByTestId('expenses-toggle-privacy-btn');
    fireEvent.click(expensesPrivacyBtn);

    // Monto oculto
    expect(screen.queryByText(/-\$ 12\.000/)).not.toBeInTheDocument();
    expect(screen.getByText(/-\$ ••••••/)).toBeInTheDocument();
  });

  it('Layout incluye botón de privacidad en la barra lateral que sincroniza el estado', () => {
    render(
      <BrowserRouter>
        <PrivacyProvider>
          <Layout
            currentSection="admin"
            setSection={vi.fn()}
            onLogout={vi.fn()}
            webSettings={{ storeName: 'El Ropero' }}
            selectedCategory=""
            setSelectedCategory={vi.fn()}
          >
            <div>Contenido Principal</div>
          </Layout>
        </PrivacyProvider>
      </BrowserRouter>
    );

    const sidebarToggle = screen.getByTestId('sidebar-privacy-toggle');
    expect(sidebarToggle).toBeInTheDocument();
    expect(screen.getByText('Ocultar Cifras')).toBeInTheDocument();

    fireEvent.click(sidebarToggle);
    expect(screen.getByText('Mostrar Cifras')).toBeInTheDocument();
    expect(localStorage.getItem('el_ropero_hide_financials')).toBe('true');
  });
});

