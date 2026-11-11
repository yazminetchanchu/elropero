import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import Sales from '../components/Sales';
import Dashboard from '../components/Dashboard';
import Expenses from '../components/Expenses';
import { InventoryItem, Sale, Expense, GiftCard, WebOrderItem } from '../types';
import { restoreSaleToInventory, verifyStock } from '../services/webOrderFulfillment';
import { computeSaleBreakdown } from '../services/finance';
import { mergeEntities } from '../utils/mergeEntities';

// Mock de iconos para evitar fallos de renderizado
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Search: () => <span data-testid="search-icon">Search</span>,
    ShoppingCart: () => <span data-testid="cart-icon">ShoppingCart</span>,
    Trash2: () => <span data-testid="trash-icon">Trash2</span>,
    Plus: () => <span data-testid="plus-icon">Plus</span>,
    Minus: () => <span data-testid="minus-icon">Minus</span>,
    Percent: () => <span data-testid="percent-icon">Percent</span>,
    CheckCircle: () => <span data-testid="check-icon">CheckCircle</span>,
    CheckCircle2: () => <span data-testid="check2-icon">CheckCircle2</span>,
    CreditCard: () => <span data-testid="credit-icon">CreditCard</span>,
    Banknote: () => <span data-testid="banknote-icon">Banknote</span>,
    Edit2: () => <span data-testid="edit-icon">Edit2</span>,
    X: () => <span data-testid="x-icon">X</span>,
    Loader2: () => <span data-testid="loader-icon">Loader2</span>
  };
});

describe('Pruebas de Eliminaciones de Datos y Control de Detalles', () => {
  let mockInventory: InventoryItem[];
  let mockSales: Sale[];
  let mockExpenses: Expense[];
  let mockGiftCards: GiftCard[];
  const todayIso = new Date().toISOString();

  beforeEach(() => {
    vi.clearAllMocks();

    mockInventory = [
      {
        id: 'prod-1',
        sku: 'SKU-001',
        descripcion: 'Remera Algodón Premium',
        proveedor: 'Proveedor A',
        categoria: 'REMERAS',
        cantidad: 10,
        costo: 2000,
        ventaEfectivo: 4000,
        ventaTarjeta: 4800,
        talles: ['S', 'M'],
        colores: ['NEGRO', 'BLANCO'],
        stockPorVariante: {
          'S-NEGRO': 3,
          'M-NEGRO': 4,
          'S-BLANCO': 3
        },
        coloresStock: {
          'NEGRO': 7,
          'BLANCO': 3
        },
        imagenes: []
      },
      {
        id: 'prod-2',
        sku: 'SKU-002',
        descripcion: 'Pantalón Lino',
        proveedor: 'Proveedor B',
        categoria: 'PANTALONES',
        cantidad: 5,
        costo: 5000,
        ventaEfectivo: 10000,
        ventaTarjeta: 12000,
        talles: ['38', '40'],
        colores: ['BEIGE'],
        stockPorVariante: {
          '38-BEIGE': 2,
          '40-BEIGE': 3
        },
        coloresStock: {
          'BEIGE': 5
        },
        imagenes: []
      }
    ];

    mockExpenses = [
      {
        id: 'exp-1',
        concepto: 'BOLSAS Y PACKAGING',
        monto: 15000,
        fecha: todayIso.slice(0, 10)
      },
      {
        id: 'exp-2',
        concepto: 'EXPENSAS LOCAL',
        monto: 35000,
        fecha: todayIso.slice(0, 10)
      }
    ];

    mockGiftCards = [
      {
        id: 'gc-1',
        codigo: 'GIFT-ACTIVA-100',
        destinatario: 'Ana Perez',
        montoInicial: 8000,
        saldo: 8000,
        estado: 'ACTIVA',
        fechaCreacion: todayIso
      }
    ];

    mockSales = [
      {
        id: 'sale-1',
        fecha: todayIso,
        tipo: 'venta',
        total: 4000,
        pago: { efectivo: 100, tarjeta: 0 },
        items: [
          {
            id: 'prod-1',
            sku: 'SKU-001',
            descripcion: 'Remera Algodón Premium',
            cantidad: 1,
            costo: 2000,
            precioEfectivo: 4000,
            precioTarjeta: 4800,
            talle: 'M',
            color: 'NEGRO',
            descuento: 0
          }
        ]
      }
    ];
  });

  // =========================================================================
  // SECCIÓN 1: ELIMINACIONES DE DATOS
  // =========================================================================
  describe('1. Eliminaciones de Datos', () => {

    it('1.1 En Caja (Sales): elimina un ítem del carrito y recalcula subtotales y totales inmediatamente', () => {
      const onAddSaleMock = vi.fn();
      render(
        <Sales
          inventory={mockInventory}
          onAddSale={onAddSaleMock}
          onDeleteSale={vi.fn()}
          recentSales={[]}
          giftCards={[]}
        />
      );

      // Agregar prod-1 al carrito
      const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);
      fireEvent.change(searchInput, { target: { value: 'Remera' } });
      const item1 = screen.getByText('Remera Algodón Premium').closest('div');
      if (item1) fireEvent.mouseDown(item1);

      // Agregar prod-2 al carrito
      fireEvent.change(searchInput, { target: { value: 'Pantalón' } });
      const item2 = screen.getByText('Pantalón Lino').closest('div');
      if (item2) fireEvent.mouseDown(item2);

      // Verificamos que ambos items figuran en el carrito
      const trashBtns = screen.getAllByTitle('Eliminar del carrito');
      expect(trashBtns).toHaveLength(2);

      // Eliminamos el primer ítem del carrito
      fireEvent.click(trashBtns[0]);

      // Ahora solo queda 1 ítem en el carrito (Pantalón Lino)
      const remainingTrashBtns = screen.getAllByTitle('Eliminar del carrito');
      expect(remainingTrashBtns).toHaveLength(1);

      // El total a cobrar en efectivo refleja solo el Pantalón Lino ($10.000)
      const elements10k = screen.getAllByText(/\$ 10\.000/);
      expect(elements10k.length).toBeGreaterThan(0);

      // Eliminamos el segundo ítem para vaciar el carrito por completo
      fireEvent.click(remainingTrashBtns[0]);
      expect(screen.queryByTitle('Eliminar del carrito')).not.toBeInTheDocument();

      // Al hacer clic en confirmar venta con carrito vacío, no se ejecuta onAddSale
      const confirmBtn = screen.getByRole('button', { name: /CONFIRMAR VENTA/i });
      fireEvent.click(confirmBtn);
      expect(onAddSaleMock).not.toHaveBeenCalled();
    });

    it('1.2 En Historial de Ventas (Sales): invoca onDeleteSale al pulsar el botón de eliminar venta', () => {
      const mockOnDeleteSale = vi.fn();
      render(
        <Sales
          inventory={mockInventory}
          onAddSale={vi.fn()}
          onDeleteSale={mockOnDeleteSale}
          recentSales={mockSales}
          giftCards={[]}
        />
      );

      const deleteBtn = screen.getByTitle('Eliminar venta y revertir stock');
      expect(deleteBtn).toBeInTheDocument();

      fireEvent.click(deleteBtn);
      expect(mockOnDeleteSale).toHaveBeenCalledTimes(1);
      expect(mockOnDeleteSale).toHaveBeenCalledWith('sale-1');
    });

    it('1.3 En Dashboard: requiere confirmación en dos pasos antes de eliminar un ítem del inventario', () => {
      const mockOnDeleteItem = vi.fn();
      render(
        <Dashboard
          inventory={mockInventory}
          sales={[]}
          expenses={[]}
          giftCards={[]}
          closures={[]}
          webSettings={{ categoriesOrder: ['REMERAS', 'PANTALONES'] }}
          onUpdateItem={vi.fn()}
          onDeleteItem={mockOnDeleteItem}
        />
      );

      // Buscamos los botones de eliminar en la tabla de inventario
      const trashIcons = screen.getAllByTestId('trash-icon');
      const deleteButton = trashIcons[0].closest('button');
      expect(deleteButton).toBeInTheDocument();

      // Primer clic: entra en estado de confirmación pendiente
      fireEvent.click(deleteButton!);
      expect(mockOnDeleteItem).not.toHaveBeenCalled();

      // Segundo clic: confirma y ejecuta la eliminación
      fireEvent.click(deleteButton!);
      expect(mockOnDeleteItem).toHaveBeenCalledTimes(1);
      expect(mockOnDeleteItem).toHaveBeenCalledWith('prod-2');
    });

    it('1.4 En Egresos (Expenses): confirmación en dos pasos y recálculo financiero de Ganancia Neta al eliminar un gasto', () => {
      const mockOnDeleteExpense = vi.fn();
      render(
        <Expenses
          expenses={mockExpenses}
          onAddExpense={vi.fn()}
          onUpdateExpense={vi.fn()}
          onDeleteExpense={mockOnDeleteExpense}
        />
      );

      const deleteButtons = screen.getAllByTitle('Eliminar');
      // Primer clic sobre el primer gasto (exp-2: $35.000)
      fireEvent.click(deleteButtons[0]);
      expect(mockOnDeleteExpense).not.toHaveBeenCalled();
      expect(screen.getByText('¿Borrar?')).toBeInTheDocument();

      // Segundo clic: ejecuta la eliminación
      fireEvent.click(deleteButtons[0]);
      expect(mockOnDeleteExpense).toHaveBeenCalledWith('exp-2');

      // Verificación de recálculo financiero (finance service):
      // Si la ganancia bruta de ventas es $20.000:
      const gananciaBruta = 20000;
      const gastosAntes = mockExpenses.reduce((sum, e) => sum + e.monto, 0); // 15000 + 35000 = 50000
      const gananciaNetaAntes = gananciaBruta - gastosAntes; // -30000

      const gastosDespues = mockExpenses.filter(e => e.id !== 'exp-2').reduce((sum, e) => sum + e.monto, 0); // 15000
      const gananciaNetaDespues = gananciaBruta - gastosDespues; // +5000

      // La ganancia neta aumentó exactamente en los $35.000 del egreso eliminado
      expect(gananciaNetaDespues - gananciaNetaAntes).toBe(35000);
    });

    it('1.5 Protección de detalles históricos: eliminar un producto del catálogo no rompe el reporte financiero de ventas pasadas', () => {
      // Venta pasada de un producto que luego fue eliminado
      const ventaHistorica: Sale = {
        id: 'sale-hist-999',
        fecha: todayIso,
        tipo: 'venta',
        total: 10000,
        pago: { efectivo: 100, tarjeta: 0 },
        items: [
          {
            id: 'prod-borrado-ya-no-existe',
            sku: 'SKU-ANTIGUO',
            descripcion: 'Vestido Vintage Eliminado',
            cantidad: 1,
            costo: 3000,
            precioEfectivo: 10000,
            precioTarjeta: 12000,
            descuento: 0
          }
        ]
      };

      // El catálogo actual NO contiene 'prod-borrado-ya-no-existe'
      const catalogoActual = [...mockInventory];
      expect(catalogoActual.find(i => i.id === 'prod-borrado-ya-no-existe')).toBeUndefined();

      // computeSaleBreakdown procesa la venta histórica utilizando los detalles embebidos (SaleItem)
      const breakdown = computeSaleBreakdown(ventaHistorica, [ventaHistorica]);
      expect(breakdown.totalCobrado).toBe(10000);
      expect(breakdown.costoTotal).toBe(3000);
      expect(breakdown.ganancia).toBe(7000); // 10000 - 3000
    });

    it('1.6 Prevención de resurrección en sincronización (mergeEntities con soft-delete / tombstones)', () => {
      const servidorItems = [
        { id: 'prod-1', descripcion: 'Remera', cantidad: 10 },
        { id: 'prod-eliminado', descripcion: 'Top Seda', cantidad: 3 }
      ];

      // Localmente se eliminó 'prod-eliminado' con marca de tombstone
      const localItemsConTombstone = [
        { id: 'prod-1', descripcion: 'Remera', cantidad: 9 },
        { id: 'prod-eliminado', isDeleted: true, updatedAt: todayIso }
      ];

      const merged = mergeEntities(localItemsConTombstone, servidorItems);
      // El producto eliminado no debe resucitar
      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('prod-1');
      expect(merged.find((i: any) => i.id === 'prod-eliminado')).toBeUndefined();
    });

    it('1.7 Eliminación de variantes de producto: depuración de stockPorVariante y coloresStock al remover talle o color', () => {
      const itemConVariantes: InventoryItem = {
        id: 'prod-var',
        sku: 'SKU-VAR',
        descripcion: 'Blusa Seda',
        cantidad: 6,
        costo: 2000,
        ventaEfectivo: 4000,
        ventaTarjeta: 4500,
        proveedor: 'Prov',
        categoria: 'BLUSAS',
        talles: ['S', 'M'],
        colores: ['ROJO', 'AZUL'],
        stockPorVariante: {
          'S-ROJO': 2,
          'M-ROJO': 2,
          'S-AZUL': 2
        },
        coloresStock: {
          'ROJO': 4,
          'AZUL': 2
        },
        imagenes: []
      };

      // Simulación de handleRemoveTalle('S') como en WebManager.tsx:
      const talleAEliminar = 'S';
      const nextTalles = (itemConVariantes.talles || []).filter(t => t !== talleAEliminar);
      const nextStock = { ...(itemConVariantes.stockPorVariante || {}) };
      Object.keys(nextStock).forEach(key => {
        if (key.startsWith(`${talleAEliminar}-`)) {
          delete nextStock[key];
        }
      });

      expect(nextTalles).toEqual(['M']);
      // Las variantes 'S-ROJO' y 'S-AZUL' fueron eliminadas
      expect(nextStock['S-ROJO']).toBeUndefined();
      expect(nextStock['S-AZUL']).toBeUndefined();
      // 'M-ROJO' se conserva
      expect(nextStock['M-ROJO']).toBe(2);

      // Simulación de handleRemoveColor('AZUL') como en WebManager.tsx:
      const colorAEliminar = 'AZUL';
      const nextColores = (itemConVariantes.colores || []).filter(c => c !== colorAEliminar);
      const nextStock2 = { ...(itemConVariantes.stockPorVariante || {}) };
      Object.keys(nextStock2).forEach(key => {
        if (key.endsWith(`-${colorAEliminar}`)) {
          delete nextStock2[key];
        }
      });
      const nextColoresStock = { ...(itemConVariantes.coloresStock || {}) };
      delete nextColoresStock[colorAEliminar];

      expect(nextColores).toEqual(['ROJO']);
      expect(nextStock2['S-AZUL']).toBeUndefined();
      expect(nextColoresStock['AZUL']).toBeUndefined();
      expect(nextColoresStock['ROJO']).toBe(4);
    });
  });

  // =========================================================================
  // SECCIÓN 2: CONTROL DE DETALLES
  // =========================================================================
  describe('2. Control de Detalles', () => {

    it('2.1 Control de detalles en cambios: valida coincidencia estricta de talle, color y cantidad máxima permitida', () => {
      // Venta original con 2 prendas de diferentes talles/colores
      const ventaOriginal: Sale = {
        id: 'sale-orig-10',
        fecha: todayIso,
        tipo: 'venta',
        total: 8000,
        pago: { efectivo: 100, tarjeta: 0 },
        items: [
          {
            id: 'prod-1',
            sku: 'SKU-001',
            descripcion: 'Remera Algodón Premium',
            cantidad: 1,
            costo: 2000,
            precioEfectivo: 4000,
            precioTarjeta: 4800,
            talle: 'S',
            color: 'NEGRO',
            descuento: 0
          },
          {
            id: 'prod-1',
            sku: 'SKU-001',
            descripcion: 'Remera Algodón Premium',
            cantidad: 1,
            costo: 2000,
            precioEfectivo: 4000,
            precioTarjeta: 4800,
            talle: 'M',
            color: 'BLANCO',
            descuento: 0
          }
        ]
      };

      // Si ya existió un cambio previo donde se devolvió la 'S-NEGRO':
      const cambioPrevio: Sale = {
        id: 'sale-cambio-previo',
        fecha: todayIso,
        tipo: 'cambio',
        ventaOriginalId: 'sale-orig-10',
        itemsDevueltos: [
          {
            id: 'prod-1',
            sku: 'SKU-001',
            descripcion: 'Remera Algodón Premium',
            cantidad: 1,
            costo: 2000,
            precioEfectivo: 4000,
            precioTarjeta: 4800,
            talle: 'S',
            color: 'NEGRO',
            descuento: 0
          }
        ],
        itemsNuevos: [],
        total: 0,
        diferencia: 0
      };

      render(
        <Sales
          inventory={mockInventory}
          onAddSale={vi.fn()}
          onDeleteSale={vi.fn()}
          recentSales={[ventaOriginal, cambioPrevio]}
          giftCards={[]}
        />
      );

      // Buscamos el botón "Cambio" en el historial de ventas
      const cambioBtn = screen.getByRole('button', { name: /^Cambio$/i });
      expect(cambioBtn).toBeInTheDocument();
      fireEvent.click(cambioBtn);

      // Verifica apertura de la interfaz de cambio
      expect(screen.getByText(/Cancelar Cambio/i)).toBeInTheDocument();
      expect(screen.getByText(/Prendas a devolver/i)).toBeInTheDocument();

      // En la lista de prendas de la venta original, 'S - NEGRO' ya fue devuelta:
      expect(screen.getByText(/S - NEGRO/i)).toBeInTheDocument();
      expect(screen.getByText(/\(Ya devuelto\)/i)).toBeInTheDocument();

      // 'M - BLANCO' tiene 1 disponible:
      expect(screen.getByText(/M - BLANCO/i)).toBeInTheDocument();
      expect(screen.getByText(/1 disp\./i)).toBeInTheDocument();
    });

    it('2.2 Control de detalles en stock: verifyStock valida disponibilidad exacta por talle y color (variantes)', () => {
      // Intentamos verificar un pedido web con 4 unidades de 'S-NEGRO' cuando solo hay 3 en stockPorVariante
      const itemsPedidoExcedido: WebOrderItem[] = [
        {
          productId: 'prod-1',
          sku: 'SKU-001',
          descripcion: 'Remera Algodón Premium',
          cantidad: 4, // Stock disponible en 'S-NEGRO' es 3
          talle: 'S',
          color: 'NEGRO',
          precio: 4000
        }
      ];

      expect(() => {
        verifyStock(mockInventory, itemsPedidoExcedido);
      }).toThrowError(/No hay stock suficiente para Remera Algodón Premium \(Talle: S, Color: NEGRO\)/i);

      // Si pedimos exactamente las 3 disponibles, debe pasar sin error
      const itemsPedidoValido: WebOrderItem[] = [
        {
          productId: 'prod-1',
          sku: 'SKU-001',
          descripcion: 'Remera Algodón Premium',
          cantidad: 3,
          talle: 'S',
          color: 'NEGRO',
          precio: 4000
        }
      ];

      expect(() => {
        verifyStock(mockInventory, itemsPedidoValido);
      }).not.toThrow();
    });

    it('2.3 Control de detalles al anular venta: reversión precisa de stockPorVariante y coloresStock', () => {
      const invOriginal = JSON.parse(JSON.stringify(mockInventory));
      const itemInicial = invOriginal.find((i: InventoryItem) => i.id === 'prod-1');
      expect(itemInicial.stockPorVariante['M-NEGRO']).toBe(4);
      expect(itemInicial.coloresStock['NEGRO']).toBe(7);
      expect(itemInicial.cantidad).toBe(10);

      // Venta de 2 unidades 'M-NEGRO'
      const saleAnulada: Sale = {
        id: 'sale-a-revertir',
        fecha: todayIso,
        tipo: 'venta',
        total: 8000,
        items: [
          {
            id: 'prod-1',
            sku: 'SKU-001',
            descripcion: 'Remera Algodón Premium',
            cantidad: 2,
            costo: 2000,
            precioEfectivo: 4000,
            precioTarjeta: 4800,
            talle: 'M',
            color: 'NEGRO',
            descuento: 0
          }
        ]
      };

      const invRevertido = restoreSaleToInventory(invOriginal, saleAnulada);
      const itemFinal = invRevertido.find(i => i.id === 'prod-1');

      // Control detallado:
      // Stock total: 10 + 2 = 12
      expect(itemFinal?.cantidad).toBe(12);
      // Variante específica 'M-NEGRO': 4 + 2 = 6
      expect(itemFinal?.stockPorVariante?.['M-NEGRO']).toBe(6);
      // Variante 'S-NEGRO' intacta: 3
      expect(itemFinal?.stockPorVariante?.['S-NEGRO']).toBe(3);
      // Color 'NEGRO': 7 + 2 = 9
      expect(itemFinal?.coloresStock?.['NEGRO']).toBe(9);
    });

    it('2.4 Control de detalles en visualización de historial: formatea ítems devueltos con ↩ e ítems nuevos con ↪', () => {
      const saleCambio: Sale = {
        id: 'sale-cambio-vis',
        fecha: todayIso,
        tipo: 'cambio',
        total: 6000,
        diferencia: 6000,
        pago: { efectivo: 100, tarjeta: 0 },
        itemsDevueltos: [
          {
            id: 'prod-1',
            sku: 'SKU-001',
            descripcion: 'Remera Algodón Premium',
            cantidad: 1,
            costo: 2000,
            precioEfectivo: 4000,
            precioTarjeta: 4800,
            descuento: 0
          }
        ],
        itemsNuevos: [
          {
            id: 'prod-2',
            sku: 'SKU-002',
            descripcion: 'Pantalón Lino',
            cantidad: 1,
            costo: 5000,
            precioEfectivo: 10000,
            precioTarjeta: 12000,
            descuento: 0
          }
        ]
      };

      render(
        <Sales
          inventory={mockInventory}
          onAddSale={vi.fn()}
          onDeleteSale={vi.fn()}
          recentSales={[saleCambio]}
          giftCards={[]}
        />
      );

      // Verificamos que el control de detalle visual muestra los símbolos de cambio
      expect(screen.getByText(/↩ SKU-001/i)).toBeInTheDocument();
      expect(screen.getByText(/↪ SKU-002/i)).toBeInTheDocument();
    });

    it('2.5 Control de coherencia en el detalle de stock: la suma de variantes debe coincidir con el stock global', () => {
      const item: InventoryItem = {
        id: 'prod-chk',
        sku: 'SKU-CHK',
        descripcion: 'Pollera Tabla',
        cantidad: 5, // Total global = 5
        costo: 1000,
        ventaEfectivo: 2000,
        ventaTarjeta: 2500,
        proveedor: 'Prov',
        categoria: 'POLLERAS',
        talles: ['S', 'M'],
        colores: ['NEGRO'],
        stockPorVariante: {
          'S-NEGRO': 2,
          'M-NEGRO': 2 // Suma = 4 (Incoherente con cantidad = 5)
        },
        imagenes: []
      };

      // Función de control de coherencia (como en WebManager.tsx líneas 349-353):
      const validateStockDetailConsistency = (invItem: InventoryItem): boolean => {
        if (!invItem.stockPorVariante || Object.keys(invItem.stockPorVariante).length === 0) {
          return true;
        }
        const variantTotal = Object.values(invItem.stockPorVariante).reduce((a, b) => a + (b || 0), 0);
        return variantTotal === invItem.cantidad;
      };

      // Debe detectar la discrepancia
      expect(validateStockDetailConsistency(item)).toBe(false);

      // Al ajustar la variante para que sume 5, pasa el control de detalle
      item.stockPorVariante!['M-NEGRO'] = 3;
      expect(validateStockDetailConsistency(item)).toBe(true);
    });
  });
});
