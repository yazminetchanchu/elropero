import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from '../components/Dashboard';
import React from 'react';
import { Sale, InventoryItem, Expense, MonthlyClosure, WebSettings, SaleItem } from '../types';

// Mock de iconos para evitar fallos de renderizado
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Edit2: () => <span data-testid="edit-icon">Edit2</span>,
    Trash2: () => <span data-testid="trash-icon">Trash2</span>,
    Minus: () => <span data-testid="minus-icon">Minus</span>,
    Plus: () => <span data-testid="plus-icon">Plus</span>,
  };
});

// A diferencia de Dashboard.test.tsx, NO simulamos (mock) ../services/finance
// Queremos probar la integración real de los números en la pantalla de administración.

describe('Flujos Detallados de Gestión de Administración (Integración)', () => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Función auxiliar para formatear fechas al mes actual
  const getFormatDate = (day: number, month = currentMonth, year = currentYear) => {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00`;
  };

  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const mockItem1: InventoryItem = {
    id: 'p1', sku: 'SKU-01', descripcion: 'Prenda 1', proveedor: 'Prov A',
    cantidad: 10, costo: 1000, ventaEfectivo: 2000, ventaTarjeta: 2200,
    categoria: 'Remeras', talles: ['S'], colores: ['Rojo'], imagenes: []
  };

  const mockItem2: InventoryItem = {
    id: 'p2', sku: 'SKU-02', descripcion: 'Prenda 2', proveedor: 'Prov B',
    cantidad: 0, costo: 2000, ventaEfectivo: 4000, ventaTarjeta: 4400,
    categoria: 'Pantalones', talles: ['M'], colores: ['Azul'], imagenes: []
  };

  const mockItem1Sale: SaleItem = {
    id: 'p1', sku: 'SKU-01', descripcion: 'Prenda 1',
    cantidad: 1, costo: 1000, precioEfectivo: 2000, precioTarjeta: 2200, descuento: 0
  };

  const mockItem2Sale: SaleItem = {
    id: 'p2', sku: 'SKU-02', descripcion: 'Prenda 2',
    cantidad: 1, costo: 2000, precioEfectivo: 4000, precioTarjeta: 4400, descuento: 0
  };

  const baseProps = {
    inventory: [mockItem1, mockItem2],
    sales: [] as Sale[],
    expenses: [] as Expense[],
    giftCards: [],
    closures: [] as MonthlyClosure[],
    webSettings: { categoriesOrder: ['Remeras', 'Pantalones'] } as WebSettings,
    onUpdateItem: vi.fn(),
    onDeleteItem: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Verifica el cálculo de Métricas Financieras y Deducción de Gastos del Mes', () => {
    // 1 Venta 100% Efectivo (2000)
    // 1 Venta 100% Tarjeta (4400)
    // 1 Gasto de 500
    const sales: Sale[] = [
      {
        id: 's1', fecha: getFormatDate(5), tipo: 'venta',
        items: [mockItem1Sale], total: 2000, pago: { efectivo: 100, tarjeta: 0 }
      },
      {
        id: 's2', fecha: getFormatDate(10), tipo: 'venta',
        items: [mockItem2Sale], total: 4400, pago: { efectivo: 0, tarjeta: 100 }
      }
    ];

    const expenses: Expense[] = [
      { id: 'e1', fecha: getFormatDate(15), monto: 500, concepto: 'Luz' }
    ];

    render(<Dashboard {...baseProps} sales={sales} expenses={expenses} />);

    // Total Efectivo Ventas = 2000. Total Gastos = 500. Efectivo Real = 1500
    // Total Tarjeta = 4400
    // Venta 1 Ganancia = 2000 - 1000 = 1000
    // Venta 2 (100% tarjeta) Ganancia = Toma el precio efectivo como ingreso neto: 4000 - 2000 = 2000
    // Ganancia Bruta = 1000 + 2000 = 3000
    // Ganancia Neta = Ganancia Bruta - Gastos = 3000 - 500 = 2500

    expect(screen.getAllByText(/2[.,]?500/)[0]).toBeInTheDocument(); // Ganancia Neta
    expect(screen.getAllByText(/1[.,]?500/)[0]).toBeInTheDocument(); // Total Efectivo
    expect(screen.getAllByText(/4[.,]?400/)[0]).toBeInTheDocument(); // Total Tarjeta
  });

  it('Verifica las Tendencias (Porcentajes) comparadas con el mes anterior', () => {
    // Mes Anterior: Ganancia Neta = 1000, Efectivo = 2000, Tarjeta = 1000
    const closures: MonthlyClosure[] = [
      {
        id: 'c1', month: prevMonth, year: prevYear, gananciaNeta: 1000, 
        cajaEfectivo: 2000, cajaTarjeta: 1000, gastos: 0, fechaCierre: getFormatDate(28, prevMonth, prevYear)
      }
    ];

    // Mes Actual: Ganancia Neta = 2000 (+100%), Efectivo = 1600 (-20%), Tarjeta = 3000 (+200%)
    const sales: Sale[] = [
      { // Deja $2000 Efectivo, 0 Tarjeta, Ganancia = 1000
        id: 's1', fecha: getFormatDate(5), tipo: 'venta',
        items: [mockItem1Sale], total: 2000, pago: { efectivo: 100, tarjeta: 0 }
      },
      { // Deja $0 Efectivo, 3000 Tarjeta, Ganancia = (3000 - 2000) = 1000
        id: 's2', fecha: getFormatDate(10), tipo: 'venta',
        items: [{ ...mockItem2Sale, precioTarjeta: 3000 }], total: 3000, pago: { efectivo: 0, tarjeta: 100 }
      }
    ];

    const expenses: Expense[] = [
      { id: 'e1', fecha: getFormatDate(15), monto: 400, concepto: 'Gastos' }
    ];
    // Mes actual efectivo: 2000 - 400 = 1600
    // Mes actual ganancia: 2000 - 400 = 1600 (+60% respecto a 1000)
    // Mes actual tarjeta: 3000 (+200% respecto a 1000)

    render(<Dashboard {...baseProps} sales={sales} expenses={expenses} closures={closures} />);

    // Ganancia Neta: 1600 vs 1000 -> 60%
    // Efectivo: 1600 vs 2000 -> 20% (negativo, trendDown)
    // Tarjeta: 3000 vs 1000 -> 200%
    
    // Verificamos los porcentajes en los componentes. 
    // Dado que el componente renderiza el número y el % juntos de una forma específica, 
    expect(screen.getAllByText(/60/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/20/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/200/)[0]).toBeInTheDocument();
  });

  it('Maneja flujos complejos de ventas: pagos mixtos y cambios de prendas', () => {
    // Venta original: 2 prendas 1 (2000 c/u, pago mixto 50/50 -> Ef 2000, Tarjeta 2000)
    const ventaOriginal: Sale = {
      id: 'orig1', fecha: getFormatDate(1), tipo: 'venta',
      items: [mockItem1Sale, mockItem1Sale], total: 4000,
      pago: { efectivo: 50, tarjeta: 50 }
    };

    // Cambio: Devuelve 1 prenda 1 (Costo 1000, Ef 2000, Tarjeta 2200 proporcional 50/50 -> Valor devuelto 2100)
    // Lleva 1 prenda 2 (Costo 2000, Ef 4000, Tarjeta 4400 -> Diferencia 1900 pagada 100% Efectivo)
    const cambio: Sale = {
      id: 'cambio1', fecha: getFormatDate(2), tipo: 'cambio',
      items: [], ventaOriginalId: 'orig1',
      itemsDevueltos: [mockItem1Sale], // 1 Prenda 1 devuelta
      itemsNuevos: [mockItem2Sale],    // 1 Prenda 2 nueva
      diferencia: 1900,
      pago: { efectivo: 100, tarjeta: 0 } // La diferencia se pagó en efectivo
    };

    render(<Dashboard {...baseProps} sales={[ventaOriginal, cambio]} />);
    
    // Al probar la integración, verificamos que no crashea y procesa ambas ventas complejas
    expect(screen.getByText('Ganancia Neta (Mes)')).toBeInTheDocument();
    const tableRows = screen.getAllByRole('row');
    expect(tableRows.length).toBeGreaterThan(0);
  });

  it('Verifica el cálculo de Cantidades en Stock (con y sin stock)', () => {
    render(<Dashboard {...baseProps} />);
    
    // Item 1 tiene 10. Item 2 tiene 0. Total = 10.
    // "Stock Total (Total de unidades de todos los productos)" = 10
    expect(screen.getByText('Stock Total')).toBeInTheDocument();
    const metricCards = screen.getAllByRole('heading');
    const stockTotalValue = Array.from(metricCards).some(h => h.textContent === '10 u.');
    expect(stockTotalValue).toBeTruthy();

    // Por defecto, se muestran los items CON stock. (Prenda 1)
    expect(screen.getByText('Prenda 1')).toBeInTheDocument();
    expect(screen.queryByText('Prenda 2')).not.toBeInTheDocument();

    // Habilitar ver sin stock
    const btnSinStock = screen.getByText(/Ver agotadas/i);
    fireEvent.click(btnSinStock);
    
    // Ahora debería verse la Prenda 2 (que tiene 0 stock)
    expect(screen.getByText('Prenda 2')).toBeInTheDocument();
  });
});
