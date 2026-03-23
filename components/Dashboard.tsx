import React from 'react';
import { InventoryItem, Sale, Expense } from '../types';
import MetricCard from './MetricCard';
import { Edit2, Trash2, X, Search, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';

interface DashboardProps {
  inventory: InventoryItem[];
  sales: Sale[];
  expenses: Expense[];
  onUpdateItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  inventory,
  sales,
  expenses,
  onUpdateItem,
  onDeleteItem
}) => {
  const [editingItem, setEditingItem] = React.useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [showProfitDetails, setShowProfitDetails] = React.useState(false);
  const [showSinStock, setShowSinStock] = React.useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const isMonth = (dateStr: string, month: number, year: number) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  };

  const isCurrentMonth = (dateStr: string) => isMonth(dateStr, currentMonth, currentYear);
  
  // Mes anterior para comparación
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  // Mes actual
  const monthlySales = sales.filter(s => isCurrentMonth(s.fecha));
  const monthlyExpenses = expenses.filter(e => isCurrentMonth(e.fecha));

  // Mes anterior
  const previousMonthlySales = sales.filter(s => isMonth(s.fecha, prevMonth, prevYear));
  const previousMonthlyExpenses = expenses.filter(e => isMonth(e.fecha, prevMonth, prevYear));

  // ==========================
  // HELPERS COMPAT
  // ==========================
  const getItemSnapshot = (item: any) => {
    const costo = typeof item.costo === 'number' ? item.costo : Number(item.costoUnidad) || 0;

    const precioTarjeta =
      typeof item.precioTarjeta === 'number'
        ? item.precioTarjeta
        : typeof item.ventaTarjeta === 'number'
          ? item.ventaTarjeta
          : typeof item.precio === 'number'
            ? item.precio
            : Number(item.precioTarjeta) || Number(item.ventaTarjeta) || Number(item.precio) || 0;

    const precioEfectivo =
      typeof item.precioEfectivo === 'number'
        ? item.precioEfectivo
        : typeof item.ventaEfectivo === 'number'
          ? item.ventaEfectivo
          : Number(item.precioEfectivo) || Number(item.ventaEfectivo) || precioTarjeta;

    const descuento = typeof item.descuento === 'number' ? item.descuento : Number(item.descuento) || 0;

    return { costo, precioEfectivo, precioTarjeta, descuento };
  };

  // ==========================
  // CÁLCULO POR VENTA
  // ==========================
  /**
   * Regla pedida:
   * - Caja efectivo y caja tarjeta: se calculan por el % de pago real.
   * - Ganancia:
   *   - si es 100% tarjeta => la ganancia se calcula con PRECIO EFECTIVO (precio base),
   *     pero la caja sigue siendo tarjeta (lo cobrado).
   *   - si es mixto => ganancia se calcula con los precios según el mix (E usa precio efectivo, T usa precio tarjeta).
   * - GiftCard NO entra a caja (se descuenta proporcionalmente de E/T para reflejar lo realmente cobrado).
   */

  
  const computeSaleBreakdown = (sale: Sale) => {

    if (sale.tipo === 'gift') {
      return {
        efectivo: sale.pago?.efectivo ? sale.total * (sale.pago.efectivo / 100) : 0,
        tarjeta: sale.pago?.tarjeta ? sale.total * (sale.pago.tarjeta / 100) : 0,
        totalCobrado: sale.total,
        costoTotal: 0,
        ganancia: sale.total
      };
    }

    // ===========================
    // CAMBIO: usa diferencia directamente
    // ===========================
    if (sale.tipo === 'cambio') {
      const diferencia = sale.diferencia ?? sale.total ?? 0;
      const cobrado = Math.max(0, diferencia);
      
      const pctE = sale.pago?.efectivo ?? 100;
      const pctT = sale.pago?.tarjeta ?? 0;

      // FACTOR 1: Reversión de ganancia de los items devueltos (Originales)
      // Buscar la venta original para saber EXACTAMENTE qué mix de pago (E/T) se usó al venderla
      const findOriginalSale = sales.find(s => s.id === sale.ventaOriginalId);
      const origPctE = findOriginalSale?.pago?.efectivo ?? 100;
      const origPctT = findOriginalSale?.pago?.tarjeta ?? 0;

      const gananciaDevueltos = (sale.itemsDevueltos ?? []).reduce((sum, raw: any) => {
        const { costo, precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);
        const cant = raw.cantidad ?? 0;
        const desc = descuento || 0;
        
        const pT = precioTarjeta * (1 - desc / 100);
        const pE = precioEfectivo * (1 - Math.max(0, desc - 20) / 100);
        
        // Usar mix de pago original para la reversión exacta
        const totLinea = (pE * (origPctE / 100) + pT * (origPctT / 100)) * cant;
        const costTotal = costo * cant;
        
        return sum + (totLinea - costTotal);
      }, 0);

      // FACTOR 2: Registro de ganancia de los items nuevos (Nuevos)
      const gananciaNuevos = (sale.itemsNuevos ?? []).reduce((sum, raw: any) => {
        const { costo, precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);
        const cant = raw.cantidad ?? 0;
        const desc = descuento || 0;
        const pT = precioTarjeta * (1 - desc / 100);
        const pE = precioEfectivo * (1 - Math.max(0, desc - 20) / 100);
        
        const totLinea = (pE * (pctE / 100) + pT * (pctT / 100)) * cant;
        const costTotal = costo * cant;
        return sum + (totLinea - costTotal);
      }, 0);

      // FACTOR 3: Diferencial de crédito (si hay gift automática)
      const gananciaGiftManual = diferencia < 0 ? Math.abs(diferencia) : 0;

      // Ganancia Algebraica = (- Reversión) + Nueva + Crédito
      const gananciaFinal = (-gananciaDevueltos) + gananciaNuevos + gananciaGiftManual;

      const costoNuevos = (sale.itemsNuevos ?? []).reduce((sum, i) => sum + (i.costo ?? 0) * (i.cantidad ?? 1), 0);
      const costoDevueltos = (sale.itemsDevueltos ?? []).reduce((sum, i) => sum + (i.costo ?? 0) * (i.cantidad ?? 1), 0);
      const costoNeto = costoNuevos - costoDevueltos;

      return {
        efectivo: cobrado * (pctE / 100),
        tarjeta:  cobrado * (pctT / 100),
        totalCobrado: cobrado,
        costoTotal: costoNeto,
        ganancia: gananciaFinal
      };
    }

    let efectivo = 0;
    let tarjeta = 0;

    let costoTotal = 0;

    // Totales teóricos por línea (sin repartir por medio)
    let totalLineaEfectivo = 0; // suma (precioEfectivo * cant) ya con descuento
    let totalLineaTarjeta = 0;  // suma (precioTarjeta * cant) ya con descuento

    const pctE = sale.pago?.efectivo ?? 100;
    const pctT = sale.pago?.tarjeta ?? 0;

    // Protección: sale.items puede ser undefined en datos viejos
    (sale.items ?? []).forEach((raw: any) => {
      const { costo, precioEfectivo, precioTarjeta, descuento } = getItemSnapshot(raw);
      const cant = raw.cantidad ?? 0;
      const desc = descuento || 0;

      // Tarjeta: descuento manual completo
      const pT = precioTarjeta * (1 - desc / 100);

      // Efectivo: el precio ya incluye ~20% de descuento implícito vs tarjeta.
      // Solo se aplica el excedente del descuento manual sobre ese 20%.
      const DESCUENTO_BASE_EFECTIVO = 20;
      const descuentoExtraEfe = Math.max(0, desc - DESCUENTO_BASE_EFECTIVO);
      const pE = precioEfectivo * (1 - descuentoExtraEfe / 100);

      // Caja (reparto por %)
      const tE = pE * cant * (pctE / 100);
      const tT = pT * cant * (pctT / 100);

      efectivo += tE;
      tarjeta += tT;

      // Totales base por línea (para ganancia según regla)
      totalLineaEfectivo += pE * cant;
      totalLineaTarjeta += pT * cant;

      // Costo
      costoTotal += costo * cant;
    });


    // ==========================
    // APLICAR GIFTCARD (no entra a caja)
    // ==========================
    const gift = sale.giftCardUsada?.montoUsado ?? 0;
    if (gift > 0) {
      const totalCobradoAntesGift = efectivo + tarjeta;

      if (totalCobradoAntesGift > 0) {
        const ratioE = efectivo / totalCobradoAntesGift;
        const ratioT = tarjeta / totalCobradoAntesGift;

        efectivo = Math.max(0, efectivo - gift * ratioE);
        tarjeta = Math.max(0, tarjeta - gift * ratioT);
      }
    }

    const totalCobrado = efectivo + tarjeta;

    // ==========================
    // GANANCIA (según regla del usuario)
    // ==========================
    const es100Tarjeta = pctT === 100 && pctE === 0;

    // En 100% tarjeta: ganancia usa precio efectivo (base) y también descuenta gift si existió
    // En mixto: ganancia usa el total efectivamente cobrado (E+T) ya sin gift
    const ingresoParaGanancia = es100Tarjeta
      ? Math.max(0, totalLineaEfectivo - gift)
      : totalCobrado;
      
    const ganancia = ingresoParaGanancia - costoTotal;

    return {
      efectivo,
      tarjeta,
      totalCobrado,
      costoTotal,
      ganancia
    };
  };


  // ==========================
  // CAJA
  // ==========================
  const totalEfectivo = monthlySales.reduce((acc, sale) => {
    const { efectivo } = computeSaleBreakdown(sale);
    const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
    return acc + signo * efectivo;
  }, 0);

  const totalTarjeta = monthlySales.reduce((acc, sale) => {
    const { tarjeta } = computeSaleBreakdown(sale);
    const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
    return acc + signo * tarjeta;
  }, 0);

  // ==========================
  // GANANCIA
  // ==========================
  const gBrutaMes = monthlySales.reduce((acc, sale) => {
    const { ganancia } = computeSaleBreakdown(sale);
    const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
    return acc + signo * ganancia;
  }, 0);

  const totalGastosMes = monthlyExpenses.reduce((acc, expense) => acc + expense.monto, 0);
  const gNetaMes = gBrutaMes - totalGastosMes;

  // ==========================
  // COMPARACIÓN MES ANTERIOR
  // ==========================
  const prevTotalEfectivo = previousMonthlySales.reduce((acc, sale) => {
    const { efectivo } = computeSaleBreakdown(sale);
    const signo = sale.tipo === 'devolucion' ? -1 : 1;
    return acc + signo * efectivo;
  }, 0);

  const prevTotalTarjeta = previousMonthlySales.reduce((acc, sale) => {
    const { tarjeta } = computeSaleBreakdown(sale);
    const signo = sale.tipo === 'devolucion' ? -1 : 1;
    return acc + signo * tarjeta;
  }, 0);

  const prevGBruta = previousMonthlySales.reduce((acc, sale) => {
    const { ganancia } = computeSaleBreakdown(sale);
    const signo = sale.tipo === 'devolucion' ? -1 : 1;
    return acc + signo * ganancia;
  }, 0);

  const prevGastos = previousMonthlyExpenses.reduce((acc, expense) => acc + expense.monto, 0);
  const prevGNeta = prevGBruta - prevGastos;

  // Calcular porcentajes de cambio
  const calcTrend = (actual: number, anterior: number) => {
    if (anterior === 0) return actual > 0 ? { value: 100, isPositive: true } : { value: 0, isPositive: true };
    const cambio = ((actual - anterior) / anterior) * 100;
    return { value: Math.abs(cambio), isPositive: cambio >= 0 };
  };

  const trendGanancia = calcTrend(gNetaMes, prevGNeta);
  const trendEfectivo = calcTrend(totalEfectivo, prevTotalEfectivo);
  const trendTarjeta = calcTrend(totalTarjeta, prevTotalTarjeta);

  // ==========================
  // STOCK
  // ==========================
  // Prendas con stock disponible (las que se muestran por defecto)
  const conStock = inventory.filter(item => item.cantidad > 0);
  // Prendas agotadas (ocultas por defecto, visibles con el toggle)
  const sinStock = inventory.filter(item => item.cantidad <= 0);

  // Total de unidades en stock (solo las activas)
  const stockTotal = conStock.reduce((acc, item) => acc + item.cantidad, 0);

  // Base para buscar: según toggle muestra ambas o solo las activas
  const baseInventory = showSinStock ? inventory : conStock;

  const filteredInventory = baseInventory.filter(item =>
    item.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.proveedor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );


  const handleDelete = (id: string) => {
    if (pendingDeleteId === id) {
      onDeleteItem(id);
      setPendingDeleteId(null);
    } else {
      setPendingDeleteId(id);
      setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  // ==========================
  // UI
  // ==========================
  return (
    <div className="space-y-6 text-left">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Ganancia Neta (Mes)"
          value={`$ ${gNetaMes.toLocaleString()}`}
          subValue={`${currentMonth}/${currentYear}`}
          clickable={true}
          onClick={() => setShowProfitDetails(true)}
          trend={{
            value: trendGanancia.value,
            label: `mes anterior`,
            isPositive: trendGanancia.isPositive
          }}
        />
        <MetricCard
          label="Caja Efectivo"
          value={`$ ${totalEfectivo.toLocaleString()}`}
          subValue="Física"
          trend={{
            value: trendEfectivo.value,
            label: `mes anterior`,
            isPositive: trendEfectivo.isPositive
          }}
        />
        <MetricCard
          label="Caja Tarjeta"
          value={`$ ${totalTarjeta.toLocaleString()}`}
          subValue="Digital"
          trend={{
            value: trendTarjeta.value,
            label: `mes anterior`,
            isPositive: trendTarjeta.isPositive
          }}
        />
        <MetricCard
          label="Stock Total"
          value={`${stockTotal} u.`}
          subValue="Unidades"
        />
      </div>

      {/* Comparación mensual */}
      <div className="bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <Calendar size={20} className="text-[#1A1A1A]" />
          <h3 className="font-serif text-2xl italic text-[#1A1A1A]">Comparación Mensual</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-[#F5F1EB]/50 rounded-lg border border-[#C9B8A8]/20">
            <p className="text-[9px] uppercase tracking-[2px] text-[#1A1A1A]/60 mb-2">Ganancia Neta</p>
            <p className="text-lg font-bold text-[#1A1A1A] mb-1">${gNetaMes.toLocaleString()}</p>
            <p className="text-xs text-[#1A1A1A]/50">vs ${prevGNeta.toLocaleString()}</p>
          </div>
          <div className="text-center p-4 bg-[#F5F1EB]/50 rounded-lg border border-[#C9B8A8]/20">
            <p className="text-[9px] uppercase tracking-[2px] text-[#1A1A1A]/60 mb-2">Caja Efectivo</p>
            <p className="text-lg font-bold text-[#1A1A1A] mb-1">${totalEfectivo.toLocaleString()}</p>
            <p className="text-xs text-[#1A1A1A]/50">vs ${prevTotalEfectivo.toLocaleString()}</p>
          </div>
          <div className="text-center p-4 bg-[#F5F1EB]/50 rounded-lg border border-[#C9B8A8]/20">
            <p className="text-[9px] uppercase tracking-[2px] text-[#1A1A1A]/60 mb-2">Caja Tarjeta</p>
            <p className="text-lg font-bold text-[#1A1A1A] mb-1">${totalTarjeta.toLocaleString()}</p>
            <p className="text-xs text-[#1A1A1A]/50">vs ${prevTotalTarjeta.toLocaleString()}</p>
          </div>
          <div className="text-center p-4 bg-[#F5F1EB]/50 rounded-lg border border-[#C9B8A8]/20">
            <p className="text-[9px] uppercase tracking-[2px] text-[#1A1A1A]/60 mb-2">Gastos</p>
            <p className="text-lg font-bold text-[#1A1A1A] mb-1">${totalGastosMes.toLocaleString()}</p>
            <p className="text-xs text-[#1A1A1A]/50">vs ${prevGastos.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-[#D4C4B0] pb-3">
          <div className="flex items-center gap-4">
            <h3 className="font-serif text-3xl italic text-black">Inventario</h3>
            {sinStock.length > 0 && (
              <button
                onClick={() => setShowSinStock(v => !v)}
                className={`text-[9px] uppercase tracking-[3px] font-medium px-3 py-1.5 rounded-full border transition-all ${
                  showSinStock
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-transparent text-[#1A1A1A]/50 border-[#C9B8A8]/50 hover:border-[#1A1A1A]/30'
                }`}
              >
                {showSinStock ? '✕ Ocultar agotadas' : `Ver agotadas (${sinStock.length})`}
              </button>
            )}
          </div>
          <div className="relative w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30"
              size={14}
            />
            <input
              type="text"
              placeholder="BUSCAR..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-[#D4C4B0] py-2 pl-10 pr-3 text-xs uppercase text-black placeholder:text-gray-600 focus:outline-none focus:border-[#D4C4B0]"
            />
          </div>
        </div>

        <div className="border border-[#D4C4B0] bg-white overflow-auto max-h-[calc(100vh-400px)]">
          <table className="w-full">
            <thead className="bg-[#D4C4B0] text-black sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[1px]">Código</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[1px]">Descripción</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[1px]">Proveedor</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-[1px]">Costo</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-[1px]">P. Efectivo</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-[1px]">P. Tarjeta</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium uppercase tracking-[1px]">Stock</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium uppercase tracking-[1px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C9B8A8]/20">
              {filteredInventory.map(item => {
                const agotada = item.cantidad <= 0;
                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${agotada ? 'bg-gray-50 opacity-60' : 'hover:bg-[#C9B8A8]/5'}`}
                  >
                    <td className="px-3 py-2.5 text-xs font-mono text-[#1A1A1A]">{item.sku}</td>
                    <td className="px-3 py-2.5 text-xs text-[#1A1A1A]">{item.descripcion}</td>
                    <td className="px-3 py-2.5 text-xs text-[#1A1A1A]">{item.proveedor}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-[#1A1A1A]">$ {item.costo.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-[#1A1A1A]">$ {item.ventaEfectivo.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-[#1A1A1A]">$ {(item.ventaTarjeta ?? item.ventaEfectivo).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-xs text-center font-medium">
                      {agotada
                        ? <span className="inline-flex items-center gap-1">
                            <span className="line-through text-red-400 text-[10px]">0</span>
                            <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-widest font-bold">Agotada</span>
                          </span>
                        : <span className="text-[#1A1A1A]">{item.cantidad}</span>
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5 items-center justify-center">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="p-1.5 hover:bg-[#C9B8A8]/20 text-[#1A1A1A] rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("¿Eliminar permanentemente esta prenda del sistema?")) {
                              onDeleteItem(item.id);
                            }
                          }}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                          title="Eliminar permanentemente"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalles de Ganancia */}
      {showProfitDetails && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-center items-center p-4" onClick={() => setShowProfitDetails(false)}>
          <div className="bg-white/95 backdrop-blur-md border border-[#C9B8A8]/50 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b-2 border-[#C9B8A8]/30 p-6 flex justify-between items-center z-10">
              <div>
                <h3 className="font-serif text-3xl italic text-[#1A1A1A]">Desglose de Ganancias</h3>
                <p className="text-xs text-[#1A1A1A]/60 mt-1">Mes: {currentMonth}/{currentYear}</p>
              </div>
              <button onClick={() => setShowProfitDetails(false)} className="p-2 hover:bg-[#C9B8A8]/20 rounded-lg transition-colors text-[#1A1A1A]">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-[#F5F1EB]/60 p-4 border border-[#C9B8A8]/30 rounded-lg">
                  <p className="text-[9px] uppercase tracking-[2px] text-[#1A1A1A]/60 mb-1">Ganancia Bruta</p>
                  <p className="text-xl font-bold text-[#1A1A1A]">${gBrutaMes.toLocaleString()}</p>
                </div>
                <div className="bg-[#F5F1EB]/60 p-4 border border-[#C9B8A8]/30 rounded-lg">
                  <p className="text-[9px] uppercase tracking-[2px] text-[#1A1A1A]/60 mb-1">Gastos</p>
                  <p className="text-xl font-bold text-red-700">-${totalGastosMes.toLocaleString()}</p>
                </div>
                <div className="bg-[#C9B8A8] p-4 border-2 border-[#1A1A1A]/10 rounded-lg shadow-md">
                  <p className="text-[9px] uppercase tracking-[2px] text-[#1A1A1A] mb-1">Ganancia Neta</p>
                  <p className="text-2xl font-bold text-[#1A1A1A]">${gNetaMes.toLocaleString()}</p>
                </div>
              </div>

              {/* Tabla de ventas */}
              <div>
                <h4 className="font-serif text-xl italic text-[#1A1A1A] mb-3">Ventas del Mes ({monthlySales.length})</h4>
                <div className="border border-[#C9B8A8]/50 rounded-xl overflow-auto max-h-[400px] shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-[#C9B8A8]/80 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] uppercase">Fecha</th>
                        <th className="px-3 py-2 text-left text-[10px] uppercase">Tipo</th>
                        <th className="px-3 py-2 text-left text-[10px] uppercase">Items</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase">Total</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase">Costo</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase">Ganancia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#C9B8A8]/20">
                      {monthlySales.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-[#1A1A1A]/40 text-sm">
                            No hay ventas este mes
                          </td>
                        </tr>
                      ) : (
                        monthlySales
                          .slice()
                          .reverse()
                          .map((sale) => {
                            const breakdown = computeSaleBreakdown(sale);
                            const signo = sale.tipo === 'devolucion' ? -1 : 1;
                            return (
                              <tr key={sale.id} className="hover:bg-[#C9B8A8]/5 transition-colors">
                                <td className="px-3 py-2.5 text-[#1A1A1A]">
                                  {new Date(sale.fecha).toLocaleDateString('es-AR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`text-xs uppercase px-2.5 py-1 rounded-lg ${
                                    sale.tipo === 'venta' ? 'bg-emerald-100 text-emerald-800' :
                                    sale.tipo === 'devolucion' ? 'bg-rose-100 text-rose-800' :
                                    sale.tipo === 'cambio' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {sale.tipo}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-[#1A1A1A] text-xs">
                                  {sale.items?.length || 0} items
                                  {sale.itemsDevueltos && sale.itemsNuevos && (
                                    <span className="text-[#1A1A1A]/60"> (Cambio)</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right text-[#1A1A1A] font-medium">
                                  ${(breakdown.totalCobrado * signo).toLocaleString()}
                                  {(() => {
                                    if (!sale.pago) return null;
                                    const label = sale.pago.efectivo === 100 ? 'E' : sale.pago.tarjeta === 100 ? 'T' : `E ${sale.pago.efectivo}% / T ${sale.pago.tarjeta}%`;
                                    return <span className="ml-1.5 text-[9px] font-bold text-[#1A1A1A]/50">({label})</span>;
                                  })()}
                                </td>
                                <td className="px-3 py-2.5 text-right text-[#1A1A1A]/60">
                                  ${(breakdown.costoTotal * signo).toLocaleString()}
                                </td>
                                <td className={`px-3 py-2.5 text-right font-bold ${
                                  breakdown.ganancia * signo >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                }`}>
                                  ${(breakdown.ganancia * signo).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                    <tfoot className="bg-[#F5F1EB]/60 sticky bottom-0">
                      <tr className="font-bold">
                        <td colSpan={3} className="px-3 py-3 text-right text-[#1A1A1A]">TOTALES:</td>
                        <td className="px-3 py-3 text-right text-[#1A1A1A]">
                          ${(totalEfectivo + totalTarjeta).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-right text-[#1A1A1A]/60">
                          ${monthlySales.reduce((acc, sale) => {
                            const breakdown = computeSaleBreakdown(sale);
                            const signo = sale.tipo === 'devolucion' ? -1 : 1;
                            return acc + breakdown.costoTotal * signo;
                          }, 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-right text-emerald-700">
                          ${gBrutaMes.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
  <div className="fixed inset-0 z-50 bg-black/20 flex justify-center items-center">
    <div className="bg-white p-8 w-full max-w-xl space-y-6 border border-[#D4C4B0]">

      <div className="flex justify-between items-center border-b-2 border-[#C9B8A8]/30 pb-4">
        <h3 className="font-serif text-2xl italic text-[#1A1A1A]">Editar producto</h3>
        <button onClick={() => setEditingItem(null)} className="p-1 hover:bg-[#C9B8A8]/20 rounded-lg transition-colors text-[#1A1A1A]">
          <X size={20} />
        </button>
      </div>

      {/* DESCRIPCIÓN */}
      <div>
        <label className="text-xs text-black font-medium">Descripción</label>
        <input
          className="w-full border border-[#D4C4B0] p-2 text-black focus:outline-none focus:border-[#D4C4B0]"
          value={editingItem.descripcion}
          onChange={(e) =>
            setEditingItem({ ...editingItem, descripcion: e.target.value })
          }
        />
      </div>

      {/* PROVEEDOR */}
      <div>
        <label className="text-xs text-black font-medium">Proveedor</label>
        <input
          className="w-full border border-[#D4C4B0] p-2 text-black focus:outline-none focus:border-[#D4C4B0]"
          value={editingItem.proveedor}
          onChange={(e) =>
            setEditingItem({ ...editingItem, proveedor: e.target.value })
          }
        />
      </div>

      {/* COSTO */}
      <div>
        <label className="text-xs text-black font-medium">Costo</label>
        <input
          type="number"
          className="w-full border border-[#D4C4B0] p-2 text-black focus:outline-none focus:border-[#D4C4B0]"
          value={editingItem.costo}
          onChange={(e) =>
            setEditingItem({ ...editingItem, costo: Number(e.target.value) })
          }
        />
      </div>

      {/* PRECIO EFECTIVO */}
      <div>
        <label className="text-xs text-black font-medium">Precio efectivo</label>
        <input
          type="number"
          className="w-full border border-[#D4C4B0] p-2 text-black focus:outline-none focus:border-[#D4C4B0]"
          value={editingItem.ventaEfectivo}
          onChange={(e) =>
            setEditingItem({ ...editingItem, ventaEfectivo: Number(e.target.value) })
          }
        />
      </div>

      {/* PRECIO TARJETA */}
      <div>
        <label className="text-xs text-black font-medium">Precio tarjeta</label>
        <input
          type="number"
          className="w-full border border-[#D4C4B0] p-2 text-black focus:outline-none focus:border-[#D4C4B0]"
          value={editingItem.ventaTarjeta ?? editingItem.ventaEfectivo}
          onChange={(e) =>
            setEditingItem({ ...editingItem, ventaTarjeta: Number(e.target.value) })
          }
        />
      </div>

      {/* STOCK */}
      <div>
        <label className="text-xs text-black font-medium">Cantidad en stock</label>
        <input
          type="number"
          className="w-full border border-[#D4C4B0] p-2 text-black focus:outline-none focus:border-[#D4C4B0]"
          value={editingItem.cantidad}
          onChange={(e) =>
            setEditingItem({ ...editingItem, cantidad: Number(e.target.value) })
          }
        />
      </div>

      {/* BOTONES */}
      <div className="flex justify-end gap-4 pt-4 border-t">
        <button
          className="px-4 py-2 border border-[#D4C4B0] text-black hover:bg-[#D4C4B0]/20 transition-all text-sm font-medium"
          onClick={() => setEditingItem(null)}
        >
          Cancelar
        </button>

        <button
          className="px-4 py-2 bg-[#D4C4B0] text-black hover:opacity-90 transition-all text-sm font-medium"
          onClick={() => {
            onUpdateItem(editingItem);
            setEditingItem(null);
          }}
        >
          Guardar cambios
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  );
};

export default Dashboard;
