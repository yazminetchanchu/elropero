import React from 'react';
import { InventoryItem, Sale, GiftCard, SaleItem } from '../types';
import { Trash2, CreditCard, Banknote, CheckCircle } from 'lucide-react';
import { useModal } from '../contexts/ModalContext';


// =======================
// REGLAS DE NEGOCIO
// =======================

// El precio real es TARJETA.
// El efectivo tiene descuento del 20%
const DESCUENTO_EFECTIVO = 0; //

interface CartItem {
  id: string;
  descripcion: string;
  cantidad: number;
  costo: number;
  precioTarjeta: number;
  precioEfectivo: number;
  descuento: number; // descuento manual %
  talle?: string;            // variante seleccionada
  color?: string;            // variante seleccionada
  productTalles: string[];   // opciones disponibles del producto
  productColores: string[];  // opciones disponibles del producto
  stockPorVariante?: Record<string, number>; // snapshot para cálculos offline
}

interface SalesProps {
  inventory: InventoryItem[];
  giftCards?: GiftCard[];
  onAddSale: (sale: Omit<Sale, 'id'>) => void;
  recentSales: Sale[];
  onDeleteSale: (id: string) => void;
  onUpdateSalePago?: (saleId: string, pago: { efectivo: number; tarjeta: number }) => void;
  isSyncing?: boolean;
}

const Sales: React.FC<SalesProps> = ({
  inventory,
  giftCards = [],
  onAddSale,
  recentSales,
  onDeleteSale,
  onUpdateSalePago,
  isSyncing = false,
}) => {
  const { showAlert, showConfirm } = useModal();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [showResults, setShowResults] = React.useState(false);
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [addedToast, setAddedToast] = React.useState<string | null>(null);

  const [pagoEfectivo, setPagoEfectivo] = React.useState(100);
  const [pagoTarjeta, setPagoTarjeta] = React.useState(0);
  const [searchSale, setSearchSale] = React.useState('');

  const [modoCambio, setModoCambio] = React.useState(false);
  const [itemsDevueltos, setItemsDevueltos] = React.useState<SaleItem[]>([]);
  const [ventaOriginal, setVentaOriginal] = React.useState<Sale | null>(null);

  // =======================
  // GIFT CARD
  // =======================
  const [giftCardSeleccionada, setGiftCardSeleccionada] =
    React.useState<GiftCard | null>(null);

  // Destinatario para gift card generada automáticamente en cambio
  const [giftDestinatario, setGiftDestinatario] = React.useState('');
  const [giftEmail, setGiftEmail] = React.useState('');
  const [giftMensaje, setGiftMensaje] = React.useState('');
  const [giftDeParteDe, setGiftDeParteDe] = React.useState('');

  // Modal de aviso 15 días
  const [mostrarModalAntiguo, setMostrarModalAntiguo] = React.useState(false);
  const [ventaSeleccionadaPendiente, setVentaSeleccionadaPendiente] = React.useState<Sale | null>(null);

  // Filtro de fecha en historial
  const now = new Date();
  const [filtroMes, setFiltroMes] = React.useState(now.getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = React.useState(now.getFullYear());

  // Estado temporal para cantidades en el selector de devueltos
  const [cantDevueltasInput, setCantDevueltasInput] = React.useState<Record<string, number>>({});
  
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F o '/' para enfocar el buscador de prendas
      if ((e.ctrlKey && e.key === 'f') || (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Esc para limpiar el buscador
      if (e.key === 'Escape') {
        setSearchTerm('');
        setShowResults(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // =======================
  // BUSCADOR
  // =======================
  // (filteredProducts se declara más abajo, después de getStockDisponible)

  const findProduct = (key: string) => {
    return inventory.find(p => p.id === key || p.sku === key);
  };

  const getStockDisponible = (prod: InventoryItem) => {
    // Para el buscador: usa cantidad total del producto
    const inCart = cart
      .filter(ci => ci.id === prod.id)
      .reduce((sum, ci) => sum + ci.cantidad, 0);
    return prod.cantidad - inCart;
  };

  // Stock máximo para un item del carrito considerando su variante seleccionada
  const getMaxQtyForCartItem = (item: CartItem): number => {
    if (item.stockPorVariante && item.talle && item.color) {
      const key = `${item.talle}-${item.color}`;
      return item.stockPorVariante[key] ?? 0;
    }
    const prod = findProduct(item.id);
    return prod?.cantidad || 0;
  };

  const filteredProducts = React.useMemo(() => {
    if (!searchTerm.trim()) return [];
    
    const query = searchTerm.toLowerCase();

    // Acceso directo al inventario invertido
    return [...inventory]
      .reverse() 
      .filter(p => {
        const disponible = getStockDisponible(p);
        if (disponible <= 0) return false;

        return (
          (p.sku?.toLowerCase() || "").includes(query) ||
          (p.descripcion?.toLowerCase() || "").includes(query) ||
          (p.proveedor?.toLowerCase() || "").includes(query)
        );
      })
      .slice(0, 25);
  }, [inventory, searchTerm, cart]);

  const addToCart = (product: InventoryItem) => {
    const hasVariants = (product.talles?.length ?? 0) > 0 || (product.colores?.length ?? 0) > 0;

    if (!hasVariants) {
      // Sin variantes: comportamiento original (merge por producto)
      const disponible = getStockDisponible(product);
      if (disponible <= 0) return;
      const cant = Math.min(quantity, disponible);
      const precioTarjeta = product.ventaTarjeta;
      const precioEfectivo = product.ventaEfectivo;
      const index = cart.findIndex(i => i.id === product.id);

      if (index !== -1) {
        const copy = [...cart];
        const stockActual = getStockDisponible(product);
        const nuevaCantidad = Math.min(copy[index].cantidad + cant, stockActual + copy[index].cantidad);
        copy[index].cantidad = nuevaCantidad;
        setCart(copy);
      } else {
        setCart([...cart, {
          id: product.id,
          descripcion: product.descripcion,
          cantidad: cant,
          costo: product.costo,
          precioTarjeta,
          precioEfectivo,
          descuento: 0,
          productTalles: [],
          productColores: [],
        }]);
      }
    } else {
      // Con variantes: nueva fila independiente (talle/color se elige en el carrito)
      if (product.cantidad <= 0) {
        showAlert('Sin stock disponible', 'Agotado', 'warning');
        return;
      }
      setCart(prev => [...prev, {
        id: product.id,
        descripcion: product.descripcion,
        cantidad: 1,
        costo: product.costo,
        precioTarjeta: product.ventaTarjeta,
        precioEfectivo: product.ventaEfectivo,
        descuento: 0,
        talle: undefined,
        color: undefined,
        productTalles: product.talles || [],
        productColores: product.colores || [],
        stockPorVariante: product.stockPorVariante,
      }]);
    }

    setSearchTerm('');
    setQuantity(1);
    setShowResults(false);

    setAddedToast(product.descripcion);
    setTimeout(() => setAddedToast(null), 2500);
  };

  const removeFromCart = (idx: number) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  const updateCartItemDiscount = (idx: number, descuento: number) => {
    const clean = Number.isFinite(descuento)
      ? Math.max(0, Math.min(100, descuento))
      : 0;
    setCart(prev => prev.map((it, i) => (i === idx ? { ...it, descuento: clean } : it)));
  };

  const updateCartItemQty = (idx: number, cantidad: number) => {
    const item = cart[idx];
    if (!item) return;

    const stockTotal = getMaxQtyForCartItem(item);

    // Clamp entre 1 y el stock de la variante (o total si sin variantes)
    const cantidadFinal = Math.min(Math.max(1, Math.floor(cantidad)), stockTotal || 1);

    setCart(prev =>
      prev.map((it, i) => (i === idx ? { ...it, cantidad: cantidadFinal } : it))
    );
  };

  const updateCartItemTalle = (idx: number, talle: string | undefined) => {
    setCart(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const newKey = talle && it.color ? `${talle}-${it.color}` : undefined;
      const newVarStock = newKey && it.stockPorVariante ? (it.stockPorVariante[newKey] ?? 0) : null;
      const newCantidad = newVarStock !== null ? Math.max(1, Math.min(it.cantidad, newVarStock)) : it.cantidad;
      return { ...it, talle, cantidad: newCantidad };
    }));
  };

  const updateCartItemColor = (idx: number, color: string | undefined) => {
    setCart(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const newKey = it.talle && color ? `${it.talle}-${color}` : undefined;
      const newVarStock = newKey && it.stockPorVariante ? (it.stockPorVariante[newKey] ?? 0) : null;
      const newCantidad = newVarStock !== null ? Math.max(1, Math.min(it.cantidad, newVarStock)) : it.cantidad;
      return { ...it, color, cantidad: newCantidad };
    }));
  };

  // Valor temporal del input de cantidad (string) para no clampear mientras el usuario tipea
  const [rawQtyInput, setRawQtyInput] = React.useState<Record<number, string>>({});

  // =======================
  // TOTALES (LÓGICA CORREGIDA)
  // =======================
  const totals = cart.reduce(
    (acc, item) => {
      const cant = item.cantidad;
      const desc = item.descuento || 0;

      // Tarjeta: se aplica el descuento manual completo
      const precioTarjetaFinal = item.precioTarjeta * (1 - desc / 100);

      // Efectivo: ya tiene un descuento implícito de ~20% vs tarjeta.
      // El descuento manual solo aplica el excedente sobre ese 20%.
      const DESCUENTO_BASE_EFECTIVO = 20; // el efectivo ya es ~20% más barato
      const descuentoExtraEfectivo = Math.max(0, desc - DESCUENTO_BASE_EFECTIVO);
      const precioEfectivoFinal = item.precioEfectivo * (1 - descuentoExtraEfectivo / 100);

      const subTarjeta = precioTarjetaFinal * cant * (pagoTarjeta / 100);
      const subEfectivo = precioEfectivoFinal * cant * (pagoEfectivo / 100);

      acc.tarjeta += subTarjeta;
      acc.efectivo += subEfectivo;
      acc.total += subTarjeta + subEfectivo;

      return acc;
    },
    { efectivo: 0, tarjeta: 0, total: 0 }
  );

  const totalBruto = totals.total;

  // Calcular automáticamente cuánto usar de la gift card
  // Si el saldo es menor o igual al total, usar todo el saldo
  // Si el saldo es mayor, usar solo lo necesario para igualar el total
  const montoGiftUsar = React.useMemo(() => {
    if (!giftCardSeleccionada || modoCambio) return 0;
    
    if (totalBruto <= 0) return 0;
    
    // Usar el mínimo entre el saldo disponible y el total de la venta
    return Math.min(giftCardSeleccionada.saldo, totalBruto);
  }, [giftCardSeleccionada, totalBruto, modoCambio]);

  // Total normal de la venta (después de aplicar gift card)
  const totalVentaNormal = Math.max(0, totalBruto - montoGiftUsar);

  // =======================
  // CAMBIO: totales y diferencia
  // =======================
  // 1️⃣ VALOR DEVUELTO (Calculado estrictamente según el medio de pago de la venta original)
  const totalDevuelto = React.useMemo(() => {
    if (!modoCambio || !ventaOriginal) return 0;

    const pagoOriginalCalc = ventaOriginal.pago || { efectivo: 100, tarjeta: 0 };
    const efePerc = pagoOriginalCalc.efectivo ?? 100;
    const tarPerc = pagoOriginalCalc.tarjeta ?? 0;

    return itemsDevueltos.reduce((sum, item) => {
      const cant = item.cantidad ?? 0;
      const desc = item.descuento || 0;

      // Usamos la lógica de pesaje según cómo se pagó en la venta original
      const pT = item.precioTarjeta * (1 - desc / 100);
      const descuentoExtraEfectivo = Math.max(0, desc - 20);
      const pE = item.precioEfectivo * (1 - descuentoExtraEfectivo / 100);

      const valPesado = pE * (efePerc / 100) + pT * (tarPerc / 100);
      return sum + valPesado * cant;
    }, 0);
  }, [modoCambio, itemsDevueltos, ventaOriginal]);

  const totalNuevo = modoCambio
    ? cart.reduce((sum, item) => {
        const desc = item.descuento || 0;
        const pT = item.precioTarjeta * (1 - desc / 100);
        const descuentoExtraEfectivo = Math.max(0, desc - 20);
        const pE = item.precioEfectivo * (1 - descuentoExtraEfectivo / 100);

        const valPesado = pE * (pagoEfectivo / 100) + pT * (pagoTarjeta / 100);
        return sum + valPesado * item.cantidad;
      }, 0)
    : totalVentaNormal;

  let diferenciaCambio = 0;
  if (modoCambio) {
    diferenciaCambio = totalNuevo - totalDevuelto;
  }
  

  const diferenciaAbs = Math.abs(diferenciaCambio);

  // Label del medio de pago usado para el valor devuelto
const pagoOriginal = ventaOriginal?.pago;

const devolucionLabel = pagoOriginal
  ? pagoOriginal.efectivo === 100
    ? 'E'
    : pagoOriginal.tarjeta === 100
    ? 'T'
    : `E ${pagoOriginal.efectivo}% / T ${pagoOriginal.tarjeta}%`
  : '';

  const etiquetaDiferencia =
    diferenciaCambio > 0 ? 'A PAGAR' : diferenciaCambio < 0 ? 'A FAVOR (GIFT)' : 'SIN DIFERENCIA';

  const totalFinal = modoCambio ? Math.max(0, diferenciaCambio) : totalVentaNormal;

  // =======================
  // CONFIRMAR
  // =======================
  const confirmSale = async () => {
    // =======================
    // CAMBIO
    // =======================
    if (modoCambio) {
      if (!ventaOriginal) {
        showAlert('No hay venta original asociada al cambio', 'Atención', 'warning');
        return;
      }

      const diasTranscurridos = Math.floor(
        (Date.now() - new Date(ventaOriginal.fecha).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diasTranscurridos > 15) {
        showAlert('Ya han pasado 15 días desde la compra.', 'Plazo Vencido', 'warning');
        return;
      }

      if (itemsDevueltos.length === 0) {
        showAlert('No hay prendas devueltas', 'Atención', 'warning');
        return;
      }

      const esRetornoCompletoGift = cart.length === 0;

      if (esRetornoCompletoGift) {
        const confirmarGift = await showConfirm(
          `No agregaste prendas nuevas.\n` +
          `¿Querés generar una Gift Card por el 100% del valor devuelto ($ ${totalDevuelto.toLocaleString()})?\n` +
          `Esto devolverá el stock de las prendas seleccionadas al local.`,
          'Generar Gift Card',
          'info'
        );
        if (!confirmarGift) return;
      }

      // Validar talle/color obligatorio en prendas nuevas del cambio
      for (const item of cart) {
        if (item.productTalles.length > 0 && !item.talle) {
          showAlert(`Seleccioná el talle de: ${item.descripcion}`, 'Talle Requerido', 'warning');
          return;
        }
        if (item.productColores.length > 0 && !item.color) {
          showAlert(`Seleccioná el color de: ${item.descripcion}`, 'Color Requerido', 'warning');
          return;
        }
      }

      if (diferenciaCambio > 0 && pagoEfectivo + pagoTarjeta !== 100) {
        showAlert('El pago del cambio debe sumar 100%', 'Pago Incompleto', 'warning');
        return;
      }

      // Generar ID para gift card si la diferencia es negativa
      // La gift card se creará en App.tsx cuando se procese la venta
      let giftGeneradaId: string | undefined;
      if (diferenciaCambio < 0) {
        giftGeneradaId = `gc_${Date.now()}`;
      }

      const itemsNuevos: SaleItem[] = cart.map(i => {
        const prod = inventory.find(p => p.id === i.id);
        return {
          id: i.id,
          sku: prod?.sku || '---',
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          costo: i.costo,
          precioEfectivo: i.precioEfectivo,
          precioTarjeta: i.precioTarjeta,
          descuento: i.descuento,
          talle: i.talle,
          color: i.color,
        };
      });

      // Preparar datos de la venta
      // Destinatario de gift card auto: usar el ingresado o 'Cambio automático'
      const destinatarioGift = giftDestinatario.trim() || 'Cambio automático';

      const saleData: Omit<Sale, 'id'> = {
        fecha: new Date().toISOString(),
        tipo: 'cambio',
        ventaOriginalId: ventaOriginal.id,
        itemsDevueltos,
        itemsNuevos,
        pago: { efectivo: pagoEfectivo, tarjeta: pagoTarjeta },
        total: Math.max(0, diferenciaCambio),
        diferencia: diferenciaCambio,
        items: [], // Los cambios no usan items, usan itemsDevueltos e itemsNuevos
        giftGeneradaId, // Pasar el ID para que App.tsx cree la gift card
        giftDestinatario: destinatarioGift,
        giftEmail: giftEmail.trim(),
        giftMensaje: giftMensaje.trim(),
        giftDeParteDe: giftDeParteDe.trim()
      };

      if (giftCardSeleccionada && montoGiftUsar > 0) {
        saleData.giftCardUsada = {
          codigo: giftCardSeleccionada.codigo,
          montoUsado: montoGiftUsar
        };
      }

      onAddSale(saleData);

      // reset
      setCart([]);
      setItemsDevueltos([]);
      setCantDevueltasInput({});
      setVentaOriginal(null);
      setPagoEfectivo(100);
      setPagoTarjeta(0);
      setGiftCardSeleccionada(null);
      setGiftDestinatario('');
      setGiftEmail('');
      setGiftMensaje('');
      setGiftDeParteDe('');
      setModoCambio(false);
      return;
    }

    // =======================
    // VENTA NORMAL
    // =======================
    if (cart.length === 0) return;

    // Validar talle/color obligatorio en prendas con variantes
    for (const item of cart) {
      if (item.productTalles.length > 0 && !item.talle) {
        showAlert(`Seleccioná el talle de: ${item.descripcion}`, 'Talle Requerido', 'warning');
        return;
      }
      if (item.productColores.length > 0 && !item.color) {
        showAlert(`Seleccioná el color de: ${item.descripcion}`, 'Color Requerido', 'warning');
        return;
      }
    }

    if (pagoEfectivo + pagoTarjeta !== 100) {
      showAlert('El pago debe sumar 100%', 'Pago Incompleto', 'warning');
      return;
    }

    // El monto de gift card ya está calculado automáticamente, no necesita validación adicional

    const saleItems: SaleItem[] = cart.map(i => {
      const prod = inventory.find(p => p.id === i.id);
      return {
        id: i.id,
        sku: prod?.sku || '---',
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        costo: i.costo,
        precioEfectivo: i.precioEfectivo,
        precioTarjeta: i.precioTarjeta,
        descuento: i.descuento,
        talle: i.talle,
        color: i.color,
      };
    });

    const saleData: Omit<Sale, 'id'> = {
      fecha: new Date().toISOString(),
      tipo: 'venta',
      items: saleItems,
      total: totalFinal,
      pago: {
        efectivo: pagoEfectivo,
        tarjeta: pagoTarjeta
      }
    };

    // Si se seleccionó una gift card y hay monto a usar, agregarla a la venta
    if (giftCardSeleccionada && montoGiftUsar > 0) {
      saleData.giftCardUsada = {
        codigo: giftCardSeleccionada.codigo,
        montoUsado: montoGiftUsar
      };
    }

    onAddSale(saleData);
    
    // Resetear gift card después de la venta
    setGiftCardSeleccionada(null);

    setCart([]);
    setPagoEfectivo(100);
    setPagoTarjeta(0);
  };

  // =======================
  // UI
  // =======================
  return (
    <div className="space-y-6 text-left">
      <header className="border-b border-stone-200/60 pb-3 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl italic font-normal text-stone-900">Caja</h2>
          <p className="text-[9px] uppercase tracking-[0.18em] text-stone-400 font-light mt-0.5">Registro de ventas y cambios</p>
        </div>
        {modoCambio && (
          <button
            onClick={() => {
              setModoCambio(false);
              setVentaOriginal(null);
              setItemsDevueltos([]);
            }}
            className="text-[9px] uppercase tracking-[0.15em] font-medium text-rose-700 bg-rose-50 border border-rose-200/70 px-3 py-1.5 rounded-xl hover:bg-rose-100/70 transition-all"
          >
            ✕ Cancelar Cambio
          </button>
        )}
      </header>

      {/* SELECCIÓN DE PRENDAS A DEVOLVER */}
{modoCambio && ventaOriginal && (
  <div className="border border-stone-200/60 bg-white rounded-2xl p-4 space-y-3 shadow-2xs">
    <h4 className="text-[10px] uppercase font-semibold tracking-[0.18em] text-stone-500">
      Prendas a devolver
    </h4>

    {(ventaOriginal.items ?? []).map(item => {
      const seleccionada = itemsDevueltos.find(i => i.id === item.id);
      const cantSeleccionada = cantDevueltasInput[item.id] ?? (seleccionada?.cantidad ?? 0);

      return (
        <div
          key={item.id}
          className={`flex items-center gap-3 p-3 border rounded-xl transition-colors ${
            seleccionada
              ? 'bg-stone-100/70 border-stone-300'
              : 'border-stone-200/60 hover:bg-stone-50'
          }`}
        >
          {/* Checkbox */}
          <input
            type="checkbox"
            id={`dev-${item.id}`}
            checked={!!seleccionada}
            onChange={() => {
              setItemsDevueltos(prev => {
                if (prev.some(i => i.id === item.id)) {
                  setCantDevueltasInput(p => { const n = {...p}; delete n[item.id]; return n; });
                  return prev.filter(i => i.id !== item.id);
                }
                const cant = cantDevueltasInput[item.id] ?? 1;
                return [...prev, { ...item, cantidad: Math.min(cant, item.cantidad) }];
              });
            }}
            className="accent-stone-900 w-4 h-4 rounded shrink-0 cursor-pointer"
          />
          {/* Info prenda */}
          <label htmlFor={`dev-${item.id}`} className="flex-1 cursor-pointer text-xs text-stone-800">
            <span className="font-mono text-xs text-stone-400 mr-2">{item.sku}</span>
            {item.descripcion}
          </label>
          {/* Cantidad editable */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-stone-400">x</span>
            <input
              type="number"
              min={1}
              max={item.cantidad}
              value={cantSeleccionada || ''}
              disabled={!seleccionada}
              onChange={e => {
                const val = Math.min(Math.max(1, parseInt(e.target.value) || 1), item.cantidad);
                setCantDevueltasInput(p => ({ ...p, [item.id]: val }));
                setItemsDevueltos(prev =>
                  prev.map(i => i.id === item.id ? { ...i, cantidad: val } : i)
                );
              }}
              className="w-14 border border-stone-200/80 rounded-lg px-2 py-1 text-xs text-center text-stone-900 focus:outline-none focus:border-stone-400 disabled:opacity-30"
            />
            <span className="text-[10px] text-stone-400">/ {item.cantidad}</span>
          </div>
        </div>
      );
    })}
  </div>
)}

      {modoCambio && (
        <div className="border border-stone-200/60 bg-white rounded-2xl p-5 space-y-3 shadow-2xs">
          <div className="flex justify-between text-xs">
            <span className="text-stone-500 font-light uppercase tracking-wider text-[10px]">Valor devuelto</span>
            <span className="flex items-center gap-2 text-stone-900 font-medium">
              $ {totalDevuelto.toLocaleString()}
              {devolucionLabel && (
                <span className="text-[9px] uppercase text-stone-400 font-mono">
                  ({devolucionLabel})
                </span>
              )}
            </span>
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-stone-500 font-light uppercase tracking-wider text-[10px]">Valor nuevo</span>
            <span className="text-stone-900 font-medium">$ {totalNuevo.toLocaleString()}</span>
          </div>

          <div className="border-t border-stone-100 pt-3 flex justify-between font-medium">
            <span className="text-stone-900 text-xs tracking-wider uppercase font-semibold">{etiquetaDiferencia}</span>
            <span className="text-stone-900 font-serif text-lg">${diferenciaAbs.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* PANEL BUSCADOR + CARRITO */}
      <div className="border border-stone-200/60 bg-white rounded-2xl grid md:grid-cols-2 gap-0 shadow-2xs overflow-hidden relative">
        {addedToast && (
          <div className="absolute top-3 right-3 z-[110] bg-black text-white text-[10px] tracking-[1.5px] uppercase font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200">
            <CheckCircle size={12} className="text-emerald-400" />
            <span className="truncate max-w-[200px]">{addedToast}</span>
          </div>
        )}
        {/* BUSCADOR */}
        <div className="border-b md:border-b-0 md:border-r border-stone-100 relative">
          <div className="relative">
            <input
              ref={searchInputRef}
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setShowResults(true);
              }}
              onBlur={() => {
                setTimeout(() => setShowResults(false), 200);
              }}
              onFocus={() => {
                if (filteredProducts.length > 0) {
                  setShowResults(true);
                }
              }}
              placeholder="Buscar producto por SKU o nombre..."
              className="w-full p-4 text-xs outline-none text-stone-800 placeholder:text-stone-400 focus:bg-stone-50/50 transition-colors uppercase font-medium"
            />

            {showResults && filteredProducts.length > 0 && (
              <div className="absolute z-[100] bg-white border border-stone-200/80 rounded-xl w-full left-0 top-full shadow-lg max-h-60 overflow-y-auto mt-1">
                {filteredProducts.map(p => (
                  <div
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addToCart(p);
                    }}
                    className="p-3.5 hover:bg-stone-50 cursor-pointer border-b border-stone-100 last:border-b-0 text-xs transition-colors"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-stone-900 truncate">{p.descripcion}</div>
                        <div className="flex items-center gap-3 mt-1 text-stone-400">
                          <span className="text-[9px] font-mono">REF: {p.sku}</span>
                          <span className="text-[9px] font-mono">{p.proveedor}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[11px] font-mono font-medium text-stone-900">${p.ventaEfectivo.toLocaleString()}</span>
                        <span className="text-[8px] tracking-[0.15em] uppercase font-medium text-stone-400">
                          {getStockDisponible(p)} DISPONIBLES
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CARRITO */}
        <div className="max-h-[360px] overflow-y-auto visible-scrollbar">
          {cart.length === 0 && (
            <div className="p-8 text-center text-stone-400 text-xs tracking-wider uppercase font-light">
              No hay productos en el carrito
            </div>
          )}

          {cart.map((item, idx) => {
            const product = findProduct(item.id);
            const stockTotal = getMaxQtyForCartItem(item);

            return (
              <div
                key={idx}
                className="p-3.5 border-b border-stone-100 last:border-b-0 hover:bg-stone-50/50 transition-colors"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium text-stone-900 text-xs truncate">
                      {item.descripcion}
                    </span>

                    {/* PRECIOS POR PRENDA */}
                    {(() => {
                      const desc = item.descuento || 0;
                      const descExtraEfectivo = Math.max(0, desc - 20);
                      const pEfe = Math.round(item.precioEfectivo * (1 - descExtraEfectivo / 100));
                      const pTar = Math.round(item.precioTarjeta * (1 - desc / 100));
                      const tieneDescuentoEfectivo = descExtraEfectivo > 0;
                      const tieneDescuentoTarjeta = desc > 0;
                      return (
                        <div className="flex gap-3 mt-1">
                          <span className="flex items-center gap-1 text-[10px] text-stone-500 font-mono">
                            <span className="uppercase font-semibold text-[9px]">E:</span>
                            <span className={tieneDescuentoEfectivo ? 'line-through opacity-40 text-[9px]' : ''}>
                              ${item.precioEfectivo.toLocaleString()}
                            </span>
                            {tieneDescuentoEfectivo && (
                              <span className="font-semibold text-emerald-800">${pEfe.toLocaleString()}</span>
                            )}
                          </span>
                          <span className="text-stone-300">·</span>
                          <span className="flex items-center gap-1 text-[10px] text-stone-500 font-mono">
                            <span className="uppercase font-semibold text-[9px]">T:</span>
                            <span className={tieneDescuentoTarjeta ? 'line-through opacity-40 text-[9px]' : ''}>
                              ${item.precioTarjeta.toLocaleString()}
                            </span>
                            {tieneDescuentoTarjeta && (
                              <span className="font-semibold text-emerald-800">${pTar.toLocaleString()}</span>
                            )}
                          </span>
                        </div>
                      );
                    })()}

                    {/* VARIANTES: TALLE Y COLOR */}
                    {(item.productTalles.length > 0 || item.productColores.length > 0) && (
                      <div className="flex gap-2 mt-2 flex-wrap items-center">
                        {item.productTalles.length > 0 && (
                          <div className="flex items-center gap-1">
                            <label className="text-[9px] uppercase font-semibold text-stone-500">Talle</label>
                            <select
                              value={item.talle || ''}
                              onChange={e => updateCartItemTalle(idx, e.target.value || undefined)}
                              className={`text-[10px] border rounded-lg px-2 py-0.5 focus:outline-none bg-white cursor-pointer ${
                                !item.talle
                                  ? 'border-amber-300 text-amber-800 bg-amber-50/50'
                                  : 'border-stone-200/80 text-stone-800'
                              }`}
                            >
                              <option value="">— Talle —</option>
                              {item.productTalles.map(t => {
                                const key = item.color ? `${t}-${item.color}` : undefined;
                                const vs = key && item.stockPorVariante ? (item.stockPorVariante[key] ?? 0) : null;
                                return (
                                  <option key={t} value={t} disabled={vs !== null && vs <= 0}>
                                    {t}{vs !== null && vs <= 0 ? ' ✕' : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        )}
                        {item.productColores.length > 0 && (
                          <div className="flex items-center gap-1">
                            <label className="text-[9px] uppercase font-semibold text-stone-500">Color</label>
                            <select
                              value={item.color || ''}
                              onChange={e => updateCartItemColor(idx, e.target.value || undefined)}
                              className={`text-[10px] border rounded-lg px-2 py-0.5 focus:outline-none bg-white cursor-pointer ${
                                !item.color
                                  ? 'border-amber-300 text-amber-800 bg-amber-50/50'
                                  : 'border-stone-200/80 text-stone-800'
                              }`}
                            >
                              <option value="">— Color —</option>
                              {item.productColores.map(c => {
                                const key = item.talle ? `${item.talle}-${c}` : undefined;
                                const vs = key && item.stockPorVariante ? (item.stockPorVariante[key] ?? 0) : null;
                                return (
                                  <option key={c} value={c} disabled={vs !== null && vs <= 0}>
                                    {c}{vs !== null && vs <= 0 ? ' ✕' : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        )}
                        {item.talle && item.color && item.stockPorVariante && (
                          <span className="text-[9px] text-stone-400">
                            Stock: {item.stockPorVariante[`${item.talle}-${item.color}`] ?? 0} u.
                          </span>
                        )}
                        {((item.productTalles.length > 0 && !item.talle) || (item.productColores.length > 0 && !item.color)) && (
                          <span className="text-[9px] font-medium text-amber-700">⚠ Requerido</span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-4 mt-2 items-center">
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] uppercase text-stone-400 font-medium">
                          Cant:
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateCartItemQty(idx, item.cantidad - 1)}
                            disabled={item.cantidad <= 1}
                            className="w-5 h-5 flex items-center justify-center border border-stone-200/80 rounded-md text-xs text-stone-700 hover:bg-stone-100 disabled:opacity-30 transition-colors"
                          >−</button>
                          <input
                            type="number"
                            value={rawQtyInput[idx] ?? String(item.cantidad)}
                            onChange={e => {
                              const raw = e.target.value;
                              setRawQtyInput(prev => ({ ...prev, [idx]: raw }));
                              const num = parseInt(raw, 10);
                              if (!isNaN(num) && num >= 1) {
                                updateCartItemQty(idx, num);
                              }
                            }}
                            onBlur={e => {
                              const num = parseInt(e.target.value, 10);
                              const final = isNaN(num) ? 1 : num;
                              updateCartItemQty(idx, final);
                              setRawQtyInput(prev => {
                                const next = { ...prev };
                                delete next[idx];
                                return next;
                              });
                            }}
                            onFocus={e => e.target.select()}
                            className="w-12 border border-stone-200/80 rounded-lg px-2 py-0.5 text-xs text-center text-stone-900 focus:outline-none focus:border-stone-400 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => updateCartItemQty(idx, item.cantidad + 1)}
                            disabled={item.cantidad >= stockTotal}
                            className="w-5 h-5 flex items-center justify-center border border-stone-200/80 rounded-md text-xs text-stone-700 hover:bg-stone-100 disabled:opacity-30 transition-colors"
                          >+</button>
                        </div>
                        <span className="text-[9px] text-stone-400 font-mono">
                          ({stockTotal})
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[9px] uppercase text-stone-400 font-medium">
                          Desc:
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={item.descuento || 0}
                          onChange={e =>
                            updateCartItemDiscount(idx, parseFloat(e.target.value) || 0)
                          }
                          className="w-14 border border-stone-200/80 rounded-lg px-2 py-0.5 text-xs text-stone-900 focus:outline-none focus:border-stone-400 font-mono"
                          placeholder="0"
                        />
                        <span className="text-[9px] text-stone-400">%</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => removeFromCart(idx)}
                    className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                    title="Eliminar del carrito"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FORMAS DE PAGO */}
      <div className="border border-stone-200/60 bg-white rounded-2xl p-6 space-y-4 shadow-2xs">
        <h3 className="font-serif text-lg italic text-stone-900">Forma de pago</h3>

        {/* EFECTIVO */}
        <div className="flex justify-between items-center border-b border-stone-100 pb-3">
          <div className="flex items-center gap-3">
            <Banknote size={16} strokeWidth={1.5} className="text-stone-700" />

            <button
              type="button"
              onClick={() => {
                setPagoEfectivo(100);
                setPagoTarjeta(0);
              }}
              className="uppercase text-[10px] font-semibold text-stone-800 hover:text-stone-900 tracking-[0.15em] transition-colors underline"
            >
              Efectivo
            </button>

            <input
              type="number"
              value={pagoEfectivo}
              onChange={e => {
                const v = Math.max(0, Math.min(100, Number(e.target.value)));
                setPagoEfectivo(v);
                setPagoTarjeta(100 - v);
              }}
              className="border border-stone-200/80 rounded-xl w-16 p-1.5 text-center font-mono font-semibold text-xs text-stone-900 focus:outline-none focus:border-stone-400 shadow-2xs"
            />

            <span className="text-xs text-stone-400">%</span>
          </div>

          <div className="font-serif text-xl italic text-stone-900">
            $ {totals.efectivo.toLocaleString()}
          </div>
        </div>

        {/* TARJETA */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <CreditCard size={16} strokeWidth={1.5} className="text-stone-700" />

            <button
              type="button"
              onClick={() => {
                setPagoEfectivo(0);
                setPagoTarjeta(100);
              }}
              className="uppercase text-[10px] font-semibold text-stone-800 hover:text-stone-900 tracking-[0.15em] transition-colors underline"
            >
              Tarjeta
            </button>

            <input
              type="number"
              value={pagoTarjeta}
              onChange={e => {
                const v = Math.max(0, Math.min(100, Number(e.target.value)));
                setPagoTarjeta(v);
                setPagoEfectivo(100 - v);
              }}
              className="border border-stone-200/80 rounded-xl w-16 p-1.5 text-center font-mono font-semibold text-xs text-stone-900 focus:outline-none focus:border-stone-400 shadow-2xs"
            />

            <span className="text-xs text-stone-400">%</span>
          </div>

          <div className="font-serif text-xl italic text-stone-900">
            $ {totals.tarjeta.toLocaleString()}
          </div>
        </div>
      </div>

      {/* GIFT CARD */}
{giftCards.length > 0 && (
  <div className="border border-stone-200/60 bg-white rounded-2xl p-6 space-y-4 shadow-2xs">
    <h3 className="font-serif text-lg italic text-stone-900">Gift Card</h3>

    <select
      value={giftCardSeleccionada?.codigo || ''}
      onChange={e => {
        const gc = giftCards.find(g => g.codigo === e.target.value) || null;
        setGiftCardSeleccionada(gc);
      }}
      className="w-full border border-stone-200/80 rounded-xl p-3 text-stone-800 text-xs focus:outline-none focus:border-stone-400 shadow-2xs bg-white cursor-pointer"
    >
      <option value="">Seleccionar Gift Card</option>
      {giftCards
        .filter(gc => gc.estado === 'ACTIVA' && gc.saldo > 0)
        .map(gc => (
          <option key={gc.id} value={gc.codigo}>
            {gc.codigo} — {gc.destinatario} (Saldo: ${gc.saldo.toLocaleString()})
          </option>
        ))}
    </select>

    {giftCardSeleccionada && !modoCambio && (
      <div className="space-y-2 border border-stone-200/60 bg-stone-50/60 rounded-xl p-4">
        <div className="flex justify-between items-center text-xs">
          <span className="text-stone-600 font-medium">Saldo disponible:</span>
          <span className="font-serif text-base italic text-stone-900">$ {giftCardSeleccionada.saldo.toLocaleString()}</span>
        </div>
        
        <div className="flex justify-between items-center text-xs">
          <span className="text-stone-600 font-medium">Total de la venta:</span>
          <span className="font-serif text-base italic text-stone-900">$ {totals.total.toLocaleString()}</span>
        </div>
        
        <div className="border-t border-stone-200/50 pt-3 mt-3">
          <div className="flex justify-between items-center">
            <span className="text-stone-900 font-semibold uppercase text-[10px] tracking-wider">Se usará de la gift card:</span>
            <span className="font-serif text-lg italic text-stone-900 font-semibold">$ {montoGiftUsar.toLocaleString()}</span>
          </div>
          
          {giftCardSeleccionada.saldo > totals.total && (
            <div className="flex justify-between items-center mt-2 text-[10px] text-stone-400">
              <span>Saldo restante en la gift card:</span>
              <span className="font-mono font-medium">$ {(giftCardSeleccionada.saldo - montoGiftUsar).toLocaleString()}</span>
            </div>
          )}
          
          {giftCardSeleccionada.saldo <= totals.total && montoGiftUsar > 0 && (
            <div className="mt-2 text-[10px] text-amber-700 font-medium">
              ⚠️ Se usará el 100% del saldo de la gift card
            </div>
          )}
        </div>
      </div>
    )}
  </div>
)}

      {/* TOTAL */}
      <div className="bg-stone-900 text-white rounded-2xl p-6 flex justify-between items-center shadow-xs">
        <div>
          <span className="text-[9px] uppercase tracking-[0.2em] font-light text-stone-300">Total a cobrar</span>
          <div className="text-3xl font-serif italic font-normal text-white">
            $ {totalFinal.toLocaleString()}
          </div>
        </div>
      </div>

      {/* CAMPO DESTINATARIO GIFT AUTO (cuando diferencia negativa en cambio) */}
      {modoCambio && diferenciaCambio < 0 && (
        <div className="border border-amber-200/80 bg-amber-50/70 rounded-2xl p-5 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-800">
            🎁 Se generará gift card — Detalles del regalo
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={giftDestinatario}
              onChange={e => setGiftDestinatario(e.target.value)}
              placeholder="Nombre del destinatario (Ej: María)"
              className="w-full border-b border-amber-300 bg-transparent py-1.5 focus:outline-none text-xs text-stone-900 placeholder:text-amber-700/50"
            />
            <input
              value={giftDeParteDe}
              onChange={e => setGiftDeParteDe(e.target.value)}
              placeholder="De parte de (Opcional)"
              className="w-full border-b border-amber-300 bg-transparent py-1.5 focus:outline-none text-xs text-stone-900 placeholder:text-amber-700/50"
            />
            <input
              value={giftEmail}
              onChange={e => setGiftEmail(e.target.value)}
              type="email"
              placeholder="Email del destinatario (Opcional)"
              className="w-full border-b border-amber-300 bg-transparent py-1.5 focus:outline-none text-xs text-stone-900 placeholder:text-amber-700/50"
            />
            <input
              value={giftMensaje}
              onChange={e => setGiftMensaje(e.target.value)}
              placeholder="Mensaje (Opcional)"
              className="w-full border-b border-amber-300 bg-transparent py-1.5 focus:outline-none text-xs text-stone-900 placeholder:text-amber-700/50"
            />
          </div>
        </div>
      )}

      {/* CONFIRMAR */}
      <button
        onClick={confirmSale}
        disabled={isSyncing}
        className="w-full bg-stone-900 hover:bg-black text-white py-4 rounded-xl text-xs font-medium tracking-[0.2em] uppercase transition-all duration-200 ease-out shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSyncing
          ? '⏳ GUARDANDO...'
          : modoCambio ? 'CONFIRMAR CAMBIO' : 'CONFIRMAR VENTA'
        }
      </button>

      {/* BUSCADOR + FILTRO DE FECHA EN HISTORIAL */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <input
          value={searchSale}
          onChange={e => setSearchSale(e.target.value)}
          placeholder="Buscar por código, fecha o monto…"
          className="flex-1 min-w-[180px] border border-stone-200/80 rounded-xl p-3 text-xs text-stone-900 outline-none focus:border-stone-400 focus:bg-stone-50/50 shadow-2xs hover:border-stone-300 transition-all duration-200"
        />
        <select
          value={filtroMes}
          onChange={e => setFiltroMes(Number(e.target.value))}
          className="border border-[#D4C4B0] p-3 text-sm text-black outline-none bg-white focus:bg-[#FAF8F5]"
        >
          {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <input
          type="number"
          value={filtroAnio}
          onChange={e => setFiltroAnio(Number(e.target.value))}
          className="w-24 border border-[#D4C4B0] p-3 text-sm text-black outline-none focus:bg-[#FAF8F5]"
        />
      </div>

      {/* LISTADO DE VENTAS */}
      <div className="pt-8 space-y-3">
        {recentSales
          .slice()
          .reverse()
          .filter(s => {
            // Filtro de fecha
            const d = new Date(s.fecha);
            if (d.getMonth() + 1 !== filtroMes || d.getFullYear() !== filtroAnio) return false;

            if (!searchSale.trim()) return true;
            const q = searchSale.toLowerCase();
            const codigos = (s.items ?? []).map(i => i.sku).join(' ').toLowerCase();
            const fecha = d.toLocaleString('es-AR').toLowerCase();
            const total = String(s.total).toLowerCase();
            const codigosCambio = [
              ...(s.itemsNuevos ?? []),
              ...(s.itemsDevueltos ?? [])
            ].map(i => i.sku).join(' ').toLowerCase();
            return codigos.includes(q) || codigosCambio.includes(q) || fecha.includes(q) || total.includes(q);
          })
          .slice(0, 20)
          .map(s => {
            const pagoLabel = s.pago
  ? s.pago.efectivo === 100
    ? 'E'
    : s.pago.tarjeta === 100
    ? 'T'
    : `E ${s.pago.efectivo}% / T ${s.pago.tarjeta}%`
  : '';

  return (
            <div
              key={s.id}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-center border border-[#C9B8A8]/50 rounded-lg
                         p-3.5 text-sm hover:bg-[#C9B8A8]/5 transition-colors bg-white/80 backdrop-blur-sm shadow-sm"
            >
              <div className="font-mono text-xs text-[#1A1A1A]/70 truncate text-left">
              {s.tipo === 'cambio'
                ? [
                    ...(s.itemsDevueltos ?? []).map(i => `↩ ${i.sku}`),
                    ...(s.itemsNuevos    ?? []).map(i => `↪ ${i.sku}`)
                  ].join('  ')
                : (s.items ?? []).map(i => `${i.sku} - ${i.descripcion}`).join(' + ')
              }
              </div>

              <div className="text-xs text-[#1A1A1A] text-left sm:text-center">
                {new Date(s.fecha).toLocaleString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>

              <div className="flex justify-start sm:justify-end items-center gap-3 flex-wrap">
                <span className="font-medium text-[#1A1A1A]">
  $ {s.total.toLocaleString()}
  {pagoLabel && (
    <span className="ml-2 text-[10px] uppercase text-[#1A1A1A]/60">
      ({pagoLabel})
    </span>
  )}
</span>

                {onUpdateSalePago && (
                  <select
                    value={s.pago?.tarjeta === 100 ? 'T' : 'E'}
                    onChange={(e) => {
                      const mode = e.target.value;
                      const pago = mode === 'T' ? { efectivo: 0, tarjeta: 100 } : { efectivo: 100, tarjeta: 0 };
                      onUpdateSalePago(s.id, pago);
                    }}
                    className="text-[10px] bg-transparent hover:bg-[#C9B8A8]/20 border border-[#C9B8A8]/30 rounded px-1 py-0.5 font-bold cursor-pointer text-[#1A1A1A]/70"
                  >
                    <option value="E">E</option>
                    <option value="T">T</option>
                  </select>
                )}

                <button
                  onClick={() => {
                    const diasTranscurridos = Math.floor(
                      (Date.now() - new Date(s.fecha).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    if (diasTranscurridos > 15) {
                      showAlert('Ya han pasado 15 días desde la compra.', 'Plazo Vencido', 'warning');
                      return;
                    }
                    setModoCambio(true);
                    setVentaOriginal(s);
                    setItemsDevueltos([]);
                    setCantDevueltasInput({});
                    setCart([]);
                    setPagoEfectivo(100);
                    setPagoTarjeta(0);
                    setGiftCardSeleccionada(null);
                    setGiftDestinatario('');
                  }}
                  className="text-xs uppercase underline hover:text-[#C9B8A8] transition-colors text-[#1A1A1A]"
                >
                  Cambio
                </button>

                <button
                  onClick={() => onDeleteSale(s.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Eliminar venta y revertir stock"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {/* MODAL AVISO VENTA > 15 DÍAS */}
      {mostrarModalAntiguo && ventaSeleccionadaPendiente && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-red-200 space-y-5">
            <div className="text-center">
              <div className="text-3xl mb-3">⚠️</div>
              <h3 className="font-serif text-2xl italic text-[#1A1A1A] mb-2">Ya han pasado 15 días</h3>
              <p className="text-sm text-[#1A1A1A]/70">
                Esta venta fue realizada hace más de 15 días.<br />
                <strong>No se permite realizar cambios.</strong>
              </p>
              <p className="text-xs text-[#1A1A1A]/50 mt-2">
                Fecha de venta: {new Date(ventaSeleccionadaPendiente.fecha).toLocaleDateString('es-AR')}<br />
                Días transcurridos: {Math.floor((Date.now() - new Date(ventaSeleccionadaPendiente.fecha).getTime()) / 86400000)}
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setMostrarModalAntiguo(false);
                  setVentaSeleccionadaPendiente(null);
                }}
                className="w-full py-3 bg-[#1A1A1A] text-white rounded-xl text-sm font-bold hover:bg-black/80 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
