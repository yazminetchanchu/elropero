import React from 'react';
import { InventoryItem, Sale, GiftCard, SaleItem } from '../types';
import { Trash2, CreditCard, Banknote } from 'lucide-react';

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
}

interface SalesProps {
  inventory: InventoryItem[];
  giftCards?: GiftCard[];
  onAddSale: (sale: Omit<Sale, 'id'>) => void;
  recentSales: Sale[];
  onDeleteSale: (id: string) => void;
  isSyncing?: boolean;
}

const Sales: React.FC<SalesProps> = ({
  inventory,
  giftCards = [],
  onAddSale,
  recentSales,
  onDeleteSale,
  isSyncing = false,
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [showResults, setShowResults] = React.useState(false);
  const [cart, setCart] = React.useState<CartItem[]>([]);

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

  // Modal de aviso 30 días
  const [mostrarModalAntiguo, setMostrarModalAntiguo] = React.useState(false);
  const [ventaSeleccionadaPendiente, setVentaSeleccionadaPendiente] = React.useState<Sale | null>(null);

  // Filtro de fecha en historial
  const now = new Date();
  const [filtroMes, setFiltroMes] = React.useState(now.getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = React.useState(now.getFullYear());

  // Estado temporal para cantidades en el selector de devueltos
  const [cantDevueltasInput, setCantDevueltasInput] = React.useState<Record<string, number>>({});

  // =======================
  // BUSCADOR
  // =======================
  // (filteredProducts se declara más abajo, después de getStockDisponible)

  const findProduct = (key: string) => {
    return inventory.find(p => p.id === key || p.sku === key);
  };

  const getStockDisponible = (productKey: string) => {
    const product = findProduct(productKey);

    const inCart = cart.reduce((sum, ci) => {
      const same =
        ci.id === productKey ||
        (product && ci.id === product.id) ||
        (product && ci.id === product.sku);

      return sum + (same ? ci.cantidad : 0);
    }, 0);

    return (product?.cantidad || 0) - inCart;
  };

  const filteredProducts = React.useMemo(() => {
    if (!searchTerm.trim()) return [];
    return inventory
      .filter(p => {
        // Solo mostrar prendas con stock disponible
        const disponible = getStockDisponible(p.id);
        if (disponible <= 0) return false;

        const q = searchTerm.toLowerCase();
        return (
          p.sku.toLowerCase().includes(q) ||
          p.descripcion.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [inventory, searchTerm, cart]);

  const addToCart = (product: InventoryItem) => {
    const disponible = getStockDisponible(product.id);
    if (disponible <= 0) return;

    const cant = Math.min(quantity, disponible);
    const index = cart.findIndex(i => i.id === product.id);

    const precioTarjeta = product.ventaTarjeta;
    const precioEfectivo = product.ventaEfectivo;

    if (index !== -1) {
      const copy = [...cart];
      const stockActual = getStockDisponible(product.id);
      const nuevaCantidad = Math.min(copy[index].cantidad + cant, stockActual);
      copy[index].cantidad = nuevaCantidad;
      setCart(copy);
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          descripcion: product.descripcion,
          cantidad: cant,
          costo: product.costo,
          precioTarjeta,
          precioEfectivo,
          descuento: 0
        }
      ]);
    }

    setSearchTerm('');
    setQuantity(1);
    setShowResults(false);
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

    const product = findProduct(item.id);
    const stockTotal = product?.cantidad || 0;

    // Clamp entre 1 y el stock total
    const cantidadFinal = Math.min(Math.max(1, Math.floor(cantidad)), stockTotal);

    setCart(prev =>
      prev.map((it, i) => (i === idx ? { ...it, cantidad: cantidadFinal } : it))
    );
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
  // =============  // 1️⃣ TOTALES EN BASE TARJETA (Valor absoluto más alto)
  // Se usa Tarjeta para ambos para que la resta sea matemáticamente proporcional.
  const totalDevuelto = modoCambio
    ? itemsDevueltos.reduce((sum, item) => sum + item.precioTarjeta * item.cantidad, 0)
    : 0;

  const totalNuevo = modoCambio
    ? cart.reduce((sum, item) => {
        const desc = item.descuento || 0;
        // precioTarjeta ya es la base con descuento manual
        const precioTarjetaFinal = item.precioTarjeta * (1 - desc / 100);
        return sum + precioTarjetaFinal * item.cantidad;
      }, 0)
    : totalVentaNormal;

  let diferenciaCambio = 0;

  if (modoCambio) {
    const diferenciaBase = totalNuevo - totalDevuelto;
    diferenciaCambio = diferenciaBase;

    // 2️⃣ AJUSTES PROPORCIONALES SEGÚN MEDIOS si diferencia es positiva (el cliente paga)
    if (diferenciaBase > 0) {
      const pagoOriginal = ventaOriginal?.pago;

      if (pagoOriginal) {
        // Multiplicador sobre la diferencia basado en cuánto de ese excedente se paga en Efectivo/Tarjeta
        // El factor Efectivo es 0.8 (20% de descuento)
        const factorActual = (pagoEfectivo / 100) * 0.8 + (pagoTarjeta / 100) * 1.0;

        if (pagoOriginal.tarjeta === 100) {
          // De Tarjeta a Efectivo/Mix: aplica el descuento al pagar diferencial en efectivo
          diferenciaCambio = diferenciaBase * factorActual;
        } 
        else if (pagoOriginal.efectivo === 100) {
          // De Efectivo a Tarjeta/Mix: usa el recargo teórico fijo (1.27) si paga con tarjeta
          const factorRecargo = (pagoEfectivo / 100) * 1.0 + (pagoTarjeta / 100) * 1.27;
          diferenciaCambio = diferenciaBase * factorRecargo;
        } 
        else {
          // Mixto original: aplica factor actual directamente
          diferenciaCambio = diferenciaBase * factorActual;
        }
      }
    }
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
  const confirmSale = () => {
    // =======================
    // CAMBIO
    // =======================
    if (modoCambio) {
      if (!ventaOriginal) {
        alert('No hay venta original asociada al cambio');
        return;
      }

      if (itemsDevueltos.length === 0) {
        alert('No hay prendas devueltas');
        return;
      }

      const esRetornoCompletoGift = cart.length === 0;

      if (esRetornoCompletoGift) {
        const confirmarGift = window.confirm(
          `No agregaste prendas nuevas.\n` +
          `¿Querés generar una Gift Card por el 100% del valor devuelto ($ ${totalDevuelto.toLocaleString()})?\n` +
          `Esto devolverá el stock de las prendas seleccionadas al local.`
        );
        if (!confirmarGift) return;
      }

      if (diferenciaCambio > 0 && pagoEfectivo + pagoTarjeta !== 100) {
        alert('El pago del cambio debe sumar 100%');
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
          descuento: i.descuento
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
        pago: diferenciaCambio > 0 ? { efectivo: pagoEfectivo, tarjeta: pagoTarjeta } : undefined,
        total: Math.max(0, diferenciaCambio),
        diferencia: diferenciaCambio,
        items: [], // Los cambios no usan items, usan itemsDevueltos e itemsNuevos
        giftGeneradaId, // Pasar el ID para que App.tsx cree la gift card
        giftDestinatario: destinatarioGift,
      };

      onAddSale(saleData);

      // reset
      setCart([]);
      setItemsDevueltos([]);
      setCantDevueltasInput({});
      setVentaOriginal(null);
      setModoCambio(false);
      setPagoEfectivo(100);
      setPagoTarjeta(0);
      setGiftCardSeleccionada(null);
      setGiftDestinatario('');

      return;
    }

    // =======================
    // VENTA NORMAL
    // =======================
    if (cart.length === 0) return;

    if (pagoEfectivo + pagoTarjeta !== 100) {
      alert('El pago debe sumar 100%');
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
        descuento: i.descuento
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
      <header className="border-b-2 border-[#C9B8A8]/30 pb-4">
        <h2 className="font-serif text-3xl italic text-[#1A1A1A]">Caja</h2>
      </header>

      {/* SELECCIÓN DE PRENDAS A DEVOLVER */}
{modoCambio && ventaOriginal && (
  <div className="border border-[#C9B8A8]/50 bg-white/90 backdrop-blur-sm rounded-xl p-4 space-y-2 shadow-lg">
    <h4 className="text-xs uppercase font-bold tracking-widest text-[#1A1A1A]">
      Prendas a devolver
    </h4>

    {(ventaOriginal.items ?? []).map(item => {
      const seleccionada = itemsDevueltos.find(i => i.id === item.id);
      const cantSeleccionada = cantDevueltasInput[item.id] ?? (seleccionada?.cantidad ?? 0);

      return (
        <div
          key={item.id}
          className={`flex items-center gap-3 p-2.5 border rounded-lg transition-colors ${
            seleccionada
              ? 'bg-[#C9B8A8]/20 border-[#C9B8A8]'
              : 'border-[#C9B8A8]/30 hover:bg-[#C9B8A8]/10'
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
            className="accent-[#1A1A1A] w-4 h-4 flex-shrink-0"
          />
          {/* Info prenda */}
          <label htmlFor={`dev-${item.id}`} className="flex-1 cursor-pointer text-sm text-[#1A1A1A]">
            <span className="font-mono text-xs text-[#1A1A1A]/60 mr-1">{item.sku}</span>
            {item.descripcion}
          </label>
          {/* Cantidad editable */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[10px] text-[#1A1A1A]/50">x</span>
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
              className="w-14 border border-[#C9B8A8]/50 rounded px-2 py-1 text-xs text-center text-[#1A1A1A] focus:outline-none disabled:opacity-30"
            />
            <span className="text-[10px] text-[#1A1A1A]/40">/ {item.cantidad}</span>
          </div>
        </div>
      );
    })}
  </div>
)}

      {modoCambio && (
        <div className="border border-[#C9B8A8]/50 bg-white/90 backdrop-blur-sm rounded-xl p-5 space-y-3 shadow-lg">
          <div className="flex justify-between text-sm">
  <span className="text-[#1A1A1A]">Valor devuelto</span>
  <span className="flex items-center gap-2 text-[#1A1A1A] font-medium">
    $ {totalDevuelto.toLocaleString()}
    {devolucionLabel && (
      <span className="text-[10px] uppercase text-[#1A1A1A]/60">
        ({devolucionLabel})
      </span>
    )}
  </span>
</div>


          <div className="flex justify-between text-sm">
            <span className="text-[#1A1A1A]">Valor nuevo</span>
            <span className="text-[#1A1A1A] font-medium">$ {totalNuevo.toLocaleString()}</span>
          </div>

          <div className="border-t-2 border-[#C9B8A8]/30 pt-3 flex justify-between font-bold">
            <span className="text-[#1A1A1A]">{etiquetaDiferencia}</span>
            <span className="text-[#1A1A1A]">$ {diferenciaAbs.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* PANEL BUSCADOR + CARRITO */}
      <div className="border border-[#C9B8A8]/50 bg-white/90 backdrop-blur-sm rounded-xl grid md:grid-cols-2 gap-0 shadow-lg">
        {/* BUSCADOR */}
        <div className="border-b md:border-b-0 md:border-r border-[#C9B8A8]/30 relative">
          <div className="relative">
            <input
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setShowResults(true);
              }}
              onBlur={() => {
                // Delay para permitir el click en los resultados
                setTimeout(() => setShowResults(false), 200);
              }}
              onFocus={() => {
                if (filteredProducts.length > 0) {
                  setShowResults(true);
                }
              }}
              placeholder="Buscar producto..."
              className="w-full p-3.5 text-sm outline-none text-[#1A1A1A] placeholder:text-gray-500 focus:bg-white transition-colors"
            />

            {showResults && filteredProducts.length > 0 && (
              <div className="absolute z-[100] bg-white border border-[#C9B8A8]/50 rounded-lg w-full left-0 top-full shadow-xl max-h-60 overflow-y-auto mt-1">
                {filteredProducts.map(p => (
                  <div
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevenir que onBlur se ejecute antes del click
                      addToCart(p);
                    }}
                    className="p-3.5 hover:bg-[#C9B8A8]/15 cursor-pointer border-b border-[#C9B8A8]/20 last:border-b-0 text-sm transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#1A1A1A] truncate">{p.descripcion}</div>
                        <div className="text-xs text-[#1A1A1A]/60 font-mono mt-1.5">Código: {p.sku}</div>
                      </div>
                      <span className="text-[#1A1A1A]/60 flex-shrink-0 text-xs font-medium">
                        Stock: {getStockDisponible(p.id)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CARRITO */}
        <div className="max-h-[300px] overflow-y-auto">
          {cart.length === 0 && (
            <div className="p-6 text-center text-gray-600 text-sm">
              No hay productos en el carrito
            </div>
          )}

          {cart.map((item, idx) => {
            const product = findProduct(item.id);
            const stockTotal = product?.cantidad || 0;

            return (
              <div
                key={idx}
                className="p-3 border-b border-[#D4C4B0] last:border-b-0 hover:bg-[#D4C4B0]/10 transition-colors"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium text-[#1A1A1A] text-sm truncate">
                      {item.descripcion}
                    </span>

                    {/* PRECIOS POR PRENDA */}
                    {(() => {
                      const desc = item.descuento || 0;
                      const factor = 1 - desc / 100;
                      const pEfe = Math.round(item.precioEfectivo * factor);
                      const pTar = Math.round(item.precioTarjeta * factor);
                      const tieneDescuento = desc > 0;
                      return (
                        <div className="flex gap-3 mt-1">
                          <span className="flex items-center gap-1 text-[10px] text-[#1A1A1A]/70">
                            <span className="uppercase font-semibold tracking-wide">E</span>
                            <span className={tieneDescuento ? 'line-through opacity-40 text-[9px]' : ''}>
                              ${item.precioEfectivo.toLocaleString()}
                            </span>
                            {tieneDescuento && (
                              <span className="font-bold text-emerald-700">${pEfe.toLocaleString()}</span>
                            )}
                          </span>
                          <span className="text-[#C9B8A8]/60">·</span>
                          <span className="flex items-center gap-1 text-[10px] text-[#1A1A1A]/70">
                            <span className="uppercase font-semibold tracking-wide">T</span>
                            <span className={tieneDescuento ? 'line-through opacity-40 text-[9px]' : ''}>
                              ${item.precioTarjeta.toLocaleString()}
                            </span>
                            {tieneDescuento && (
                              <span className="font-bold text-emerald-700">${pTar.toLocaleString()}</span>
                            )}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="flex gap-4 mt-2 items-center">
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] uppercase text-[#1A1A1A] font-medium">
                          Cant:
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateCartItemQty(idx, item.cantidad - 1)}
                            disabled={item.cantidad <= 1}
                            className="w-6 h-6 flex items-center justify-center border border-[#C9B8A8]/50 rounded text-xs text-[#1A1A1A] hover:bg-[#C9B8A8]/20 disabled:opacity-30 transition-colors"
                          >−</button>
                          <input
                            type="number"
                            value={rawQtyInput[idx] ?? String(item.cantidad)}
                            onChange={e => {
                              const raw = e.target.value;
                              // Guardar el valor raw para que el usuario pueda tipear libremente
                              setRawQtyInput(prev => ({ ...prev, [idx]: raw }));
                              // Solo actualizar el carrito si es un número válido y positivo
                              const num = parseInt(raw, 10);
                              if (!isNaN(num) && num >= 1) {
                                updateCartItemQty(idx, num);
                              }
                            }}
                            onBlur={e => {
                              // Al salir del campo, clampear el valor final
                              const num = parseInt(e.target.value, 10);
                              const final = isNaN(num) ? 1 : num;
                              updateCartItemQty(idx, final);
                              // Limpiar el estado raw para que muestre el valor clampleado
                              setRawQtyInput(prev => {
                                const next = { ...prev };
                                delete next[idx];
                                return next;
                              });
                            }}
                            onFocus={e => e.target.select()}
                            className="w-14 border border-[#C9B8A8]/50 rounded-lg px-2 py-1 text-xs text-center text-[#1A1A1A] focus:outline-none focus:border-[#C9B8A8] shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => updateCartItemQty(idx, item.cantidad + 1)}
                            disabled={item.cantidad >= stockTotal}
                            className="w-6 h-6 flex items-center justify-center border border-[#C9B8A8]/50 rounded text-xs text-[#1A1A1A] hover:bg-[#C9B8A8]/20 disabled:opacity-30 transition-colors"
                          >+</button>
                        </div>
                        <span className="text-[9px] text-[#1A1A1A]/60">
                          (Stock: {stockTotal})
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[9px] uppercase text-[#1A1A1A] font-medium">
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
                          className="w-16 border border-[#C9B8A8]/50 rounded-lg px-2 py-1 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#C9B8A8] shadow-sm"
                          placeholder="0"
                        />
                        <span className="text-[9px] text-[#1A1A1A]">%</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => removeFromCart(idx)}
                    className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors flex-shrink-0"
                    title="Eliminar del carrito"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FORMAS DE PAGO */}
      <div className="border border-[#D4C4B0] bg-white p-6 space-y-4">
        <h3 className="font-serif text-xl italic text-black">Forma de pago</h3>

        {/* EFECTIVO */}
        <div className="flex justify-between items-center border-b-2 border-[#C9B8A8]/20 pb-4">
          <div className="flex items-center gap-3">
            <Banknote size={18} className="text-[#1A1A1A]" />

            <button
              type="button"
              onClick={() => {
                setPagoEfectivo(100);
                setPagoTarjeta(0);
              }}
              className="uppercase text-xs font-bold text-[#1A1A1A] hover:text-[#C9B8A8] transition-colors underline"
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
              className="border border-[#C9B8A8]/50 rounded-lg w-20 p-2 text-center font-bold text-[#1A1A1A] focus:outline-none focus:border-[#C9B8A8] shadow-sm"
            />

            <span className="text-xs text-[#1A1A1A]/70">%</span>
          </div>

          <div className="font-serif text-2xl italic text-[#1A1A1A]">
            $ {totals.efectivo.toLocaleString()}
          </div>
        </div>

        {/* TARJETA */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <CreditCard size={18} className="text-[#1A1A1A]" />

            <button
              type="button"
              onClick={() => {
                setPagoEfectivo(0);
                setPagoTarjeta(100);
              }}
              className="uppercase text-xs font-bold text-[#1A1A1A] hover:text-[#C9B8A8] transition-colors underline"
            >
              Tarjeta
            </button>

            <input
              type="number"
              value={pagoTarjeta}
              readOnly
              className="border border-[#C9B8A8]/50 rounded-lg w-20 p-2 text-center font-bold bg-[#F5F1EB]/50 text-[#1A1A1A] shadow-sm"
            />

            <span className="text-xs text-[#1A1A1A]/70">%</span>
          </div>

          <div className="font-serif text-2xl italic text-[#1A1A1A]">
            $ {totals.tarjeta.toLocaleString()}
          </div>
        </div>
      </div>

      {/* GIFT CARD */}
{giftCards.length > 0 && (
  <div className="border border-[#D4C4B0] bg-white p-6 space-y-4">
    <h3 className="font-serif text-xl italic text-black">Gift Card</h3>

    <select
      value={giftCardSeleccionada?.codigo || ''}
      onChange={e => {
        const gc = giftCards.find(g => g.codigo === e.target.value) || null;
        setGiftCardSeleccionada(gc);
      }}
      className="w-full border border-[#C9B8A8]/50 rounded-lg p-3 text-[#1A1A1A] text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#C9B8A8] shadow-sm bg-white"
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
      <div className="space-y-2 border border-[#C9B8A8]/30 bg-[#F5F1EB]/60 rounded-lg p-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-[#1A1A1A] font-medium">Saldo disponible:</span>
          <span className="font-serif text-lg italic text-[#1A1A1A]">$ {giftCardSeleccionada.saldo.toLocaleString()}</span>
        </div>
        
        <div className="flex justify-between items-center text-sm">
          <span className="text-[#1A1A1A] font-medium">Total de la venta:</span>
          <span className="font-serif text-lg italic text-[#1A1A1A]">$ {totals.total.toLocaleString()}</span>
        </div>
        
        <div className="border-t border-[#C9B8A8]/30 pt-3 mt-3">
          <div className="flex justify-between items-center">
            <span className="text-[#1A1A1A] font-bold uppercase text-xs tracking-wider">Se usará de la gift card:</span>
            <span className="font-serif text-xl italic text-[#1A1A1A] font-bold">$ {montoGiftUsar.toLocaleString()}</span>
          </div>
          
          {giftCardSeleccionada.saldo > totals.total && (
            <div className="flex justify-between items-center mt-2 text-xs text-[#1A1A1A]/60">
              <span>Saldo restante en la gift card:</span>
              <span className="font-medium">$ {(giftCardSeleccionada.saldo - montoGiftUsar).toLocaleString()}</span>
            </div>
          )}
          
          {giftCardSeleccionada.saldo <= totals.total && montoGiftUsar > 0 && (
            <div className="mt-2 text-xs text-amber-700 font-medium">
              ⚠️ Se usará el 100% del saldo de la gift card
            </div>
          )}
        </div>
      </div>
    )}
  </div>
)}

      {/* TOTAL */}
      <div className="bg-[#D4C4B0] p-6 flex justify-between items-center">
        <div>
          <span className="text-xs uppercase tracking-widest">Total a cobrar</span>
          <div className="text-3xl font-serif italic">
            $ {totalFinal.toLocaleString()}
          </div>
        </div>
      </div>

      {/* CAMPO DESTINATARIO GIFT AUTO (cuando diferencia negativa en cambio) */}
      {modoCambio && diferenciaCambio < 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            🎁 Se generará gift card — Ingresá el nombre del destinatario
          </p>
          <input
            value={giftDestinatario}
            onChange={e => setGiftDestinatario(e.target.value)}
            placeholder="Nombre del destinatario de la gift card"
            className="w-full border-b-2 border-amber-300 bg-transparent py-2 focus:outline-none text-sm text-[#1A1A1A] placeholder:text-amber-400"
          />
        </div>
      )}

      {/* CONFIRMAR */}
      <button
        onClick={confirmSale}
        disabled={isSyncing}
        className="w-full bg-[#D4C4B0] py-6 text-sm font-medium tracking-[4px]
                   hover:bg-[#C9B99B] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
          className="flex-1 min-w-[180px] border border-[#D4C4B0] p-3 text-sm text-black outline-none focus:bg-[#FAF8F5]"
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
              className="grid grid-cols-3 items-center border border-[#C9B8A8]/50 rounded-lg
                         p-3.5 text-sm hover:bg-[#C9B8A8]/5 transition-colors bg-white/80 backdrop-blur-sm shadow-sm"
            >
              <div className="font-mono text-xs text-[#1A1A1A]/70 truncate">
              {s.tipo === 'cambio'
                ? [
                    ...(s.itemsDevueltos ?? []).map(i => `↩ ${i.sku}`),
                    ...(s.itemsNuevos    ?? []).map(i => `↪ ${i.sku}`)
                  ].join('  ')
                : (s.items ?? []).map(i => `${i.sku} - ${i.descripcion}`).join(' + ')
              }
              </div>

              <div className="text-xs text-[#1A1A1A]">
                {new Date(s.fecha).toLocaleString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>

              <div className="flex justify-end items-center gap-3">
                <span className="font-medium text-[#1A1A1A]">
  $ {s.total.toLocaleString()}
  {pagoLabel && (
    <span className="ml-2 text-[10px] uppercase text-[#1A1A1A]/60">
      ({pagoLabel})
    </span>
  )}
</span>

                <button
                  onClick={() => {
                    // Verificar si la venta tiene más de 30 días
                    const diasTranscurridos = Math.floor(
                      (Date.now() - new Date(s.fecha).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    if (diasTranscurridos > 30) {
                      setVentaSeleccionadaPendiente(s);
                      setMostrarModalAntiguo(true);
                    } else {
                      setModoCambio(true);
                      setVentaOriginal(s);
                      setItemsDevueltos([]);
                      setCantDevueltasInput({});
                      setCart([]);
                      setPagoEfectivo(100);
                      setPagoTarjeta(0);
                      setGiftCardSeleccionada(null);
                      setGiftDestinatario('');
                    }
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
      {/* MODAL AVISO VENTA > 30 DÍAS */}
      {mostrarModalAntiguo && ventaSeleccionadaPendiente && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-amber-200 space-y-5">
            <div className="text-center">
              <div className="text-3xl mb-3">⚠️</div>
              <h3 className="font-serif text-2xl italic text-[#1A1A1A] mb-2">Venta con más de 30 días</h3>
              <p className="text-sm text-[#1A1A1A]/70">
                Esta venta fue realizada hace más de 30 días.<br />
                <strong>La política de cambios estándar no aplica.</strong>
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
                className="flex-1 py-3 border border-[#C9B8A8]/50 rounded-xl text-sm text-[#1A1A1A] hover:bg-[#F5F1EB] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const s = ventaSeleccionadaPendiente;
                  setModoCambio(true);
                  setVentaOriginal(s);
                  setItemsDevueltos([]);
                  setCantDevueltasInput({});
                  setCart([]);
                  setPagoEfectivo(100);
                  setPagoTarjeta(0);
                  setGiftCardSeleccionada(null);
                  setGiftDestinatario('');
                  setMostrarModalAntiguo(false);
                  setVentaSeleccionadaPendiente(null);
                }}
                className="flex-1 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors"
              >
                Permitir cambio igual
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
