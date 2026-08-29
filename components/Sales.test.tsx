import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Sales from './Sales';
import { InventoryItem, WebSettings, Sale } from '../types';

// Mocks
vi.mock('lucide-react', () => ({
  Search: () => <span>Search</span>,
  ShoppingCart: () => <span>ShoppingCart</span>,
  Trash2: () => <span>Trash2</span>,
  Plus: () => <span>Plus</span>,
  Minus: () => <span>Minus</span>,
  Percent: () => <span>Percent</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  CheckCircle2: () => <span>CheckCircle2</span>,
  Receipt: () => <span>Receipt</span>,
  CreditCard: () => <span>CreditCard</span>,
  Banknote: () => <span>Banknote</span>,
  Gift: () => <span>Gift</span>,
  RefreshCcw: () => <span>RefreshCcw</span>
}));

describe('Componente Sales', () => {
  const mockInventory: InventoryItem[] = [
    {
      id: 'prod-1',
      sku: 'SKU1',
      descripcion: 'Remera Negra',
      proveedor: 'P1',
      categoria: 'REMERAS',
      cantidad: 10,
      costo: 1000,
      ventaEfectivo: 2000,
      ventaTarjeta: 2500,
      talles: [],
      colores: [],
      imagenes: []
    }
  ];

  const mockWebSettings: WebSettings = {};

  it('renderiza la vista de ventas', () => {
    render(<Sales inventory={mockInventory} onAddSale={vi.fn()} onDeleteSale={vi.fn()} recentSales={[]} giftCards={[]} />);
    expect(screen.getByText(/Caja/i)).toBeInTheDocument();
  });

  it('permite buscar productos y agregarlos al carrito', () => {
    render(<Sales inventory={mockInventory} onAddSale={vi.fn()} onDeleteSale={vi.fn()} recentSales={[]} giftCards={[]} />);
    
    // Buscar
    const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);
    fireEvent.change(searchInput, { target: { value: 'Remera' } });
    
    // Ver si aparece
    expect(screen.getByText('Remera Negra')).toBeInTheDocument();

    // El producto se agrega al carrito con onMouseDown en el div.
    // Busquemos el contenedor que tiene "Remera Negra" y hagamos click
    const productItem = screen.getByText('Remera Negra').closest('div');
    if (productItem) {
        fireEvent.mouseDown(productItem);
    }

    // Verificar si se agrego al carrito. El carrito muestra "TOTAL"
    // Buscamos un label de Cantidad en el carrito
    expect(screen.getByText(/Cant:/i)).toBeInTheDocument();
  });

  it('no muestra descuento en precio efectivo cuando el descuento es inferior o igual al 20%', () => {
    render(<Sales inventory={mockInventory} onAddSale={vi.fn()} onDeleteSale={vi.fn()} recentSales={[]} giftCards={[]} />);

    // Buscar y agregar al carrito
    const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);
    fireEvent.change(searchInput, { target: { value: 'Remera' } });
    const productItem = screen.getByText('Remera Negra').closest('div');
    if (productItem) {
      fireEvent.mouseDown(productItem);
    }

    // Aplicar descuento del 10%
    const descInput = screen.getByPlaceholderText('0');
    fireEvent.change(descInput, { target: { value: '10' } });

    // El precio en tarjeta ($2500) debe tener descuento (mostrar $2.250)
    expect(screen.getByText('$2.250')).toBeInTheDocument();

    // El precio en efectivo ($2000) NO debe estar tachado (clase line-through)
    const precioEfectivoSpan = screen.getByText('$2.000');
    expect(precioEfectivoSpan).not.toHaveClass('line-through');
  });

  it('valúa la prenda devuelta según el medio de pago de la venta original (Tarjeta vs Efectivo)', () => {
    const saleConTarjeta = {
      id: 'sale-tarjeta-1',
      fecha: new Date().toISOString(),
      tipo: 'venta' as const,
      total: 2500,
      pago: { efectivo: 0, tarjeta: 100 },
      items: [
        {
          id: 'prod-1',
          sku: 'SKU1',
          descripcion: 'Remera Negra',
          cantidad: 1,
          costo: 1000,
          precioEfectivo: 2000,
          precioTarjeta: 2500,
          descuento: 0,
        }
      ]
    };

    render(
      <Sales
        inventory={mockInventory}
        onAddSale={vi.fn()}
        onDeleteSale={vi.fn()}
        recentSales={[saleConTarjeta]}
        giftCards={[]}
      />
    );

    // Iniciar cambio
    const cambioBtn = screen.getByRole('button', { name: /cambio/i });
    fireEvent.click(cambioBtn);

    // Verificar que estamos en modo cambio (muestra prendas a devolver)
    expect(screen.getByText(/Prendas a devolver/i)).toBeInTheDocument();

    // Seleccionar prenda para devolver (hacer clic en el checkbox)
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // El valor devuelto debe ser $ 2.500 (precio tarjeta), NO $ 2.000 (efectivo)
    expect(screen.getByText(/Valor devuelto/i)).toBeInTheDocument();
    const matches = screen.getAllByText(/\$ 2\.500/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('busca prendas ignorando tildes y permitiendo múltiples palabras clave', () => {
    const customInventory: InventoryItem[] = [
      {
        id: 'prod-pantalon',
        sku: 'PANT101',
        descripcion: 'Pantalón Lino Blanco',
        proveedor: 'Zara',
        categoria: 'PANTALONES',
        cantidad: 5,
        costo: 5000,
        ventaEfectivo: 10000,
        ventaTarjeta: 12000,
        talles: ['M', 'L'],
        colores: ['Blanco'],
        imagenes: []
      }
    ];

    render(
      <Sales
        inventory={customInventory}
        onAddSale={vi.fn()}
        onDeleteSale={vi.fn()}
        recentSales={[]}
        giftCards={[]}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Buscar producto/i);

    // Búsqueda sin tilde ("pantalon blanco") debe encontrar "Pantalón Lino Blanco"
    fireEvent.change(searchInput, { target: { value: 'pantalon blanco' } });
    expect(screen.getByText(/Pantalón Lino Blanco/i)).toBeInTheDocument();
    expect(screen.getByText(/REF: PANT101/i)).toBeInTheDocument();

    // Búsqueda por proveedor + talle ("zara l")
    fireEvent.change(searchInput, { target: { value: 'zara l' } });
    expect(screen.getByText(/Pantalón Lino Blanco/i)).toBeInTheDocument();

    // Búsqueda sin coincidencias muestra mensaje
    fireEvent.change(searchInput, { target: { value: 'vestido inexistente' } });
    expect(screen.getByText(/No se encontraron prendas disponibles para "vestido inexistente"/i)).toBeInTheDocument();

    // Botón de limpiar búsqueda
    const clearBtn = screen.getByTitle('Limpiar búsqueda');
    fireEvent.click(clearBtn);
    expect(searchInput).toHaveValue('');
  });

  it('permite realizar un cambio devolviendo prenda y generando una Gift Card por el valor total devuelto', async () => {
    const onAddSaleMock = vi.fn();
    const saleOriginal = {
      id: 'sale-orig-123',
      fecha: new Date().toISOString(),
      tipo: 'venta' as const,
      total: 2000,
      pago: { efectivo: 100, tarjeta: 0 },
      items: [
        {
          id: 'prod-1',
          sku: 'SKU1',
          descripcion: 'Remera Negra',
          cantidad: 1,
          costo: 1000,
          precioEfectivo: 2000,
          precioTarjeta: 2500,
          descuento: 0,
        }
      ]
    };

    // Mock de confirmación para retorno completo
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <Sales
        inventory={mockInventory}
        onAddSale={onAddSaleMock}
        onDeleteSale={vi.fn()}
        recentSales={[saleOriginal]}
        giftCards={[]}
      />
    );

    // 1. Iniciar modo cambio desde la venta original
    const cambioBtn = screen.getByRole('button', { name: /cambio/i });
    fireEvent.click(cambioBtn);

    // 2. Seleccionar la prenda a devolver
    const devCheckbox = screen.getByRole('checkbox');
    fireEvent.click(devCheckbox);

    // Debe mostrar la sección de detalles de la Gift Card a generar
    expect(screen.getByText(/Se generará gift card/i)).toBeInTheDocument();

    // 3. Confirmar el cambio (sin agregar prendas nuevas -> genera Gift Card)
    const confirmBtn = screen.getByRole('button', { name: /confirmar cambio/i });
    await fireEvent.click(confirmBtn);

    expect(onAddSaleMock).toHaveBeenCalledTimes(1);
    const payload = onAddSaleMock.mock.calls[0][0];
    expect(payload.tipo).toBe('cambio');
    expect(payload.ventaOriginalId).toBe('sale-orig-123');
    expect(payload.itemsDevueltos).toHaveLength(1);
    expect(payload.itemsDevueltos[0].id).toBe('prod-1');
    expect(payload.itemsNuevos).toEqual([]);
    expect(payload.diferencia).toBe(-2000);
    expect(payload.giftGeneradaId).toBeDefined();

    confirmSpy.mockRestore();
  });

  it('renderiza el historial de ventas recientes correctamente con keys unicas aun si las ventas no tienen id previo', () => {
    const salesSinId = [
      {
        id: undefined as unknown as string,
        fecha: new Date().toISOString(),
        tipo: 'venta' as const,
        total: 2000,
        pago: { efectivo: 100, tarjeta: 0 },
        items: [
          {
            id: 'prod-1',
            sku: 'SKU1',
            descripcion: 'Remera Negra',
            cantidad: 1,
            costo: 1000,
            precioEfectivo: 2000,
            precioTarjeta: 2500,
            descuento: 0,
          }
        ]
      },
      {
        id: undefined as unknown as string,
        fecha: new Date().toISOString(),
        tipo: 'cambio' as const,
        total: 0,
        diferencia: -2000,
        itemsDevueltos: [
          {
            id: 'prod-1',
            sku: 'SKU1',
            descripcion: 'Remera Negra',
            cantidad: 1,
            costo: 1000,
            precioEfectivo: 2000,
            precioTarjeta: 2500,
            descuento: 0,
          }
        ],
        itemsNuevos: [],
        pago: { efectivo: 100, tarjeta: 0 },
        items: []
      }
    ];

    render(
      <Sales
        inventory={mockInventory}
        onAddSale={vi.fn()}
        onDeleteSale={vi.fn()}
        recentSales={salesSinId as unknown as Sale[]}
        giftCards={[]}
      />
    );

    expect(screen.getByText(/SKU1 - Remera Negra/i)).toBeInTheDocument();
    expect(screen.getByText(/↩ SKU1/i)).toBeInTheDocument();
  });

  it('si se compraron 5 prendas y se devolvió 1 en un cambio previo, solo permite devolver hasta 4', () => {
    const saleOriginal: Sale = {
      id: 'sale-5-shirts',
      fecha: new Date().toISOString(),
      tipo: 'venta',
      total: 10000,
      pago: { efectivo: 100, tarjeta: 0 },
      items: [
        {
          id: 'prod-1',
          sku: 'SKU1',
          descripcion: 'Remera Negra',
          cantidad: 5,
          costo: 1000,
          precioEfectivo: 2000,
          precioTarjeta: 2500,
          descuento: 0,
        }
      ]
    };

    const cambioPrevio: Sale = {
      id: 'cambio-prev-1',
      fecha: new Date().toISOString(),
      tipo: 'cambio',
      ventaOriginalId: 'sale-5-shirts',
      total: 0,
      diferencia: -2000,
      itemsDevueltos: [
        {
          id: 'prod-1',
          sku: 'SKU1',
          descripcion: 'Remera Negra',
          cantidad: 1,
          costo: 1000,
          precioEfectivo: 2000,
          precioTarjeta: 2500,
          descuento: 0,
        }
      ],
      itemsNuevos: [],
      pago: { efectivo: 100, tarjeta: 0 },
      items: []
    };

    render(
      <Sales
        inventory={mockInventory}
        onAddSale={vi.fn()}
        onDeleteSale={vi.fn()}
        recentSales={[saleOriginal, cambioPrevio]}
        giftCards={[]}
      />
    );

    // Iniciar cambio desde la venta original de 5 prendas
    const cambioBtns = screen.getAllByRole('button', { name: /cambio/i });
    fireEvent.click(cambioBtns[0]);

    // Debe mostrar que solo quedan 4 disponibles para devolver (no 5)
    expect(screen.getByText(/\/ 4 disp\./i)).toBeInTheDocument();

    // Seleccionar la prenda a devolver
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Verificar el input de cantidad disponible con max = 4
    const qtyInputs = screen.getAllByRole('spinbutton');
    const qtyInput = qtyInputs[0];
    expect(qtyInput).toHaveAttribute('max', '4');

    // Intentar ingresar 5 debe clampear a 4
    fireEvent.change(qtyInput, { target: { value: '5' } });
    expect(qtyInput).toHaveValue(4);
  });

  it('Bug 9: Permite realizar un cambio con diferencia abonada 100% con Gift Card sin exigir medios de pago tradicionales', async () => {
    const customInventory: InventoryItem[] = [
      {
        id: 'prod-1',
        sku: 'SKU1',
        descripcion: 'Remera Negra',
        proveedor: 'P1',
        categoria: 'REMERAS',
        cantidad: 10,
        costo: 1000,
        ventaEfectivo: 2000,
        ventaTarjeta: 2500,
        talles: [],
        colores: [],
        imagenes: []
      },
      {
        id: 'prod-2',
        sku: 'SKU2',
        descripcion: 'Pantalon Jean',
        proveedor: 'P1',
        categoria: 'PANTALONES',
        cantidad: 10,
        costo: 1500,
        ventaEfectivo: 3000,
        ventaTarjeta: 3000,
        talles: [],
        colores: [],
        imagenes: []
      }
    ];

    const saleOriginal: Sale = {
      id: 'sale-orig-bug9',
      fecha: new Date().toISOString(),
      tipo: 'venta',
      total: 2000,
      pago: { efectivo: 100, tarjeta: 0 },
      items: [
        {
          id: 'prod-1',
          sku: 'SKU1',
          descripcion: 'Remera Negra',
          cantidad: 1,
          costo: 1000,
          precioEfectivo: 2000,
          precioTarjeta: 2500,
          descuento: 0,
        }
      ]
    };

    const mockGiftCards = [
      {
        id: 'gc-test-1',
        codigo: 'GC-DIFF',
        saldo: 1000,
        estado: 'ACTIVA' as const,
        destinatario: 'Cliente Test'
      }
    ];

    const onAddSaleMock = vi.fn();

    render(
      <Sales
        inventory={customInventory}
        onAddSale={onAddSaleMock}
        onDeleteSale={vi.fn()}
        recentSales={[saleOriginal]}
        giftCards={mockGiftCards}
      />
    );

    // 1. Iniciar modo cambio desde la venta original
    const cambioBtn = screen.getByRole('button', { name: /cambio/i });
    fireEvent.click(cambioBtn);

    // 2. Devolver la prenda original ($2.000)
    const devCheckbox = screen.getByRole('checkbox');
    fireEvent.click(devCheckbox);

    // 3. Buscar y agregar nueva prenda al carrito ($3.000 -> diferencia $1.000)
    const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);
    fireEvent.change(searchInput, { target: { value: 'Jean' } });
    const jeanItem = screen.getByText('Pantalon Jean').closest('div');
    if (jeanItem) {
      fireEvent.mouseDown(jeanItem);
    }

    // Verificar diferencia a pagar ($1.000)
    expect(screen.getByText('A PAGAR')).toBeInTheDocument();

    // 4. Seleccionar la Gift Card de $1.000
    const gcSelect = screen.getByDisplayValue('Seleccionar Gift Card');
    fireEvent.change(gcSelect, { target: { value: 'GC-DIFF' } });

    // La UI debe mostrar que está cubierto 100% con Gift Card
    expect(screen.getByText(/✓ Cubierto 100% con Gift Card/i)).toBeInTheDocument();
    expect(screen.getByText(/Se usará de la gift card:/i)).toBeInTheDocument();

    // Modificar los inputs de pago a 0% para demostrar que NO exige sumar 100%
    const inputs = screen.getAllByRole('spinbutton');
    // inputs[0] es cantidad de item devuelto, inputs[1] es descuento o similar, busquemos el de efectivo
    const efInput = inputs.find(input => input.getAttribute('value') === '100');
    if (efInput) {
      fireEvent.change(efInput, { target: { value: '0' } });
    }

    // 5. Confirmar el cambio
    const confirmBtn = screen.getByRole('button', { name: /confirmar cambio/i });
    await fireEvent.click(confirmBtn);

    // Debe confirmarse exitosamente sin alertas de pago incompleto
    expect(onAddSaleMock).toHaveBeenCalledTimes(1);
    const salePayload = onAddSaleMock.mock.calls[0][0];
    expect(salePayload.tipo).toBe('cambio');
    expect(salePayload.diferencia).toBe(1000);
    expect(salePayload.giftCardUsada).toEqual({
      codigo: 'GC-DIFF',
      montoUsado: 1000
    });
  });

  describe('Bug 8: Protección de carrito ante fallas de red y prevención de doble clic', () => {
    it('evita la pérdida del carrito y muestra alerta clara si onAddSale falla al cobrar una venta', async () => {
      const onAddSaleMock = vi.fn().mockRejectedValue(new Error('Network disconnected'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(
        <Sales
          inventory={mockInventory}
          onAddSale={onAddSaleMock}
          onDeleteSale={vi.fn()}
          recentSales={[]}
          giftCards={[]}
        />
      );

      // 1. Agregar producto al carrito
      const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);
      fireEvent.change(searchInput, { target: { value: 'Remera' } });
      const productItem = screen.getByText('Remera Negra').closest('div');
      if (productItem) {
        fireEvent.mouseDown(productItem);
      }

      // El producto debe estar en el carrito
      expect(screen.getAllByText('Remera Negra').length).toBeGreaterThan(0);

      // 2. Intentar confirmar venta
      const confirmBtn = screen.getByRole('button', { name: /confirmar venta/i });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      // onAddSale fue llamado
      expect(onAddSaleMock).toHaveBeenCalledTimes(1);

      // 3. Como onAddSale falló, el producto NO debe desaparecer del carrito
      expect(screen.getAllByText('Remera Negra').length).toBeGreaterThan(0);

      // 4. El botón vuelve a estar habilitado con el texto normal para permitir reintento
      await waitFor(() => {
        expect(confirmBtn).not.toBeDisabled();
      });
      expect(confirmBtn).toHaveTextContent(/confirmar venta/i);

      alertSpy.mockRestore();
    });

    it('deshabilita el botón mientras se guarda la venta para evitar doble submit', async () => {
      let resolvePromise: (value?: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      const onAddSaleMock = vi.fn().mockReturnValue(delayedPromise);

      render(
        <Sales
          inventory={mockInventory}
          onAddSale={onAddSaleMock}
          onDeleteSale={vi.fn()}
          recentSales={[]}
          giftCards={[]}
        />
      );

      // Agregar producto al carrito
      const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);
      fireEvent.change(searchInput, { target: { value: 'Remera' } });
      const productItem = screen.getByText('Remera Negra').closest('div');
      if (productItem) {
        fireEvent.mouseDown(productItem);
      }

      const confirmBtn = screen.getByRole('button', { name: /confirmar venta/i });
      
      // Primer click
      fireEvent.click(confirmBtn);

      // Botón debe estar deshabilitado y mostrar estado de guardando
      expect(confirmBtn).toBeDisabled();
      expect(confirmBtn).toHaveTextContent(/guardando/i);

      // Intento de segundo click mientras guarda
      fireEvent.click(confirmBtn);

      // onAddSale solo se ejecutó una única vez
      expect(onAddSaleMock).toHaveBeenCalledTimes(1);

      // Resolvemos la promesa simulando éxito del backend
      await act(async () => {
        resolvePromise!();
      });

      // El carrito ahora sí se vació tras el éxito
      expect(screen.queryByTitle('Eliminar del carrito')).not.toBeInTheDocument();
      expect(confirmBtn).not.toBeDisabled();
    });

    it('mantiene el carrito y los datos en modo cambio si onAddSale falla', async () => {
      const onAddSaleMock = vi.fn().mockRejectedValue(new Error('Firestore connection timeout'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      const saleOriginal: Sale = {
        id: 'sale-orig-err',
        fecha: new Date().toISOString(),
        tipo: 'venta',
        total: 2000,
        pago: { efectivo: 100, tarjeta: 0 },
        items: [
          {
            id: 'prod-1',
            sku: 'SKU1',
            descripcion: 'Remera Negra',
            cantidad: 1,
            costo: 1000,
            precioEfectivo: 2000,
            precioTarjeta: 2500,
            descuento: 0,
          }
        ]
      };

      render(
        <Sales
          inventory={mockInventory}
          onAddSale={onAddSaleMock}
          onDeleteSale={vi.fn()}
          recentSales={[saleOriginal]}
          giftCards={[]}
        />
      );

      // Iniciar cambio
      const cambioBtn = screen.getByRole('button', { name: /cambio/i });
      fireEvent.click(cambioBtn);

      // Seleccionar item a devolver
      const devCheckbox = screen.getByRole('checkbox');
      fireEvent.click(devCheckbox);

      // Confirmar cambio devolviendo 100% como gift card
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const confirmBtn = screen.getByRole('button', { name: /confirmar cambio/i });
      await fireEvent.click(confirmBtn);

      expect(onAddSaleMock).toHaveBeenCalledTimes(1);

      // Tras el error, sigue en modo cambio y conserva la selección
      expect(screen.getByRole('button', { name: /confirmar cambio/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /confirmar cambio/i })).not.toBeDisabled();

      confirmSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });
});
