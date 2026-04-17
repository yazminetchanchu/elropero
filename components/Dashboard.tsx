import React from 'react';
import { InventoryItem, Sale, Expense, GiftCard, MonthlyClosure } from '../types';
import MetricCard from './MetricCard';
import { Edit2, Trash2, X, Search, TrendingUp, TrendingDown, DollarSign, Calendar, CreditCard, Banknote, ChevronLeft, ChevronRight } from 'lucide-react';
import { computeSaleBreakdown, isMonth, calcTrend, calculatePricesFromCost } from '../services/finance';

interface DashboardProps {
  inventory: InventoryItem[];
  sales: Sale[];
  expenses: Expense[];
  giftCards: GiftCard[];
  closures: MonthlyClosure[];
  onUpdateItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  inventory,
  sales,
  expenses,
  giftCards,
  closures,
  onUpdateItem,
  onDeleteItem
}) => {
  const [editingItem, setEditingItem] = React.useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [detailView, setDetailView] = React.useState<{ month: number; year: number; type: 'ganancia' | 'efectivo' | 'tarjeta' | 'gastos' } | null>(null);
  const [showSinStock, setShowSinStock] = React.useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();


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
  // MÉTRICAS
  // ==========================
  const expensesThisMonth = monthlyExpenses.reduce((acc, expense) => acc + expense.monto, 0);

  const totalEfectivoVentas = monthlySales.reduce((acc, sale) => {
    const { efectivo } = computeSaleBreakdown(sale, sales);
    const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
    return acc + signo * efectivo;
  }, 0);

  const totalEfectivo = totalEfectivoVentas - expensesThisMonth;

  const totalTarjeta = monthlySales.reduce((acc, sale) => {
    const { tarjeta } = computeSaleBreakdown(sale, sales);
    const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
    return acc + signo * tarjeta;
  }, 0);

  const gBrutaMes = monthlySales.reduce((acc, sale) => {
    const { ganancia } = computeSaleBreakdown(sale, sales);
    const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
    return acc + signo * ganancia;
  }, 0);

  const gNetaMes = gBrutaMes - expensesThisMonth;

  const prevClosure = closures.find(c => c.month === prevMonth && c.year === prevYear);

  const prevExpensesTotal = prevClosure ? prevClosure.gastos : previousMonthlyExpenses.reduce((acc, expense) => acc + expense.monto, 0);
  const prevTotalEfectivo = prevClosure ? prevClosure.cajaEfectivo : (() => {
    const efVentas = previousMonthlySales.reduce((acc, sale) => {
      const { efectivo } = computeSaleBreakdown(sale, sales);
      const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
      return acc + signo * efectivo;
    }, 0);
    return efVentas - prevExpensesTotal;
  })();

  const prevTotalTarjeta = prevClosure ? prevClosure.cajaTarjeta : previousMonthlySales.reduce((acc, sale) => {
    const { tarjeta } = computeSaleBreakdown(sale, sales);
    const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
    return acc + signo * tarjeta;
  }, 0);

  const prevGNeta = prevClosure ? prevClosure.gananciaNeta : (() => {
    const gBruta = previousMonthlySales.reduce((acc, sale) => {
      const { ganancia } = computeSaleBreakdown(sale, sales);
      const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
      return acc + signo * ganancia;
    }, 0);
    return gBruta - prevExpensesTotal;
  })();

  const trendGanancia = calcTrend(gNetaMes, prevGNeta);
  const trendEfectivo = calcTrend(totalEfectivo, prevTotalEfectivo);
  const trendTarjeta = calcTrend(totalTarjeta, prevTotalTarjeta);

  const conStock = inventory.filter(item => item.cantidad > 0);
  const sinStock = inventory.filter(item => item.cantidad <= 0);
  const stockTotal = conStock.reduce((acc, item) => acc + item.cantidad, 0);

  const baseInventory = showSinStock ? sinStock : conStock;

  const filteredInventory = [...baseInventory]
    .reverse()
    .filter(item => {
      const q = searchTerm.toLowerCase();
      return (
        (item.descripcion?.toLowerCase() || "").includes(q) ||
        (item.proveedor?.toLowerCase() || "").includes(q) ||
        (item.sku?.toLowerCase() || "").includes(q)
      );
    });

  const handleDelete = (id: string) => {
    if (pendingDeleteId === id) {
      onDeleteItem(id);
      setPendingDeleteId(null);
    } else {
      setPendingDeleteId(id);
      setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Ganancia Neta (Mes)"
          value={`$ ${gNetaMes.toLocaleString()}`}
          subValue={`${currentMonth}/${currentYear}`}
          clickable={true}
          onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'ganancia' })}
          trend={{
            value: trendGanancia.value,
            label: `mes anterior`,
            isPositive: trendGanancia.isPositive
          }}
          dataTestId="metric-ganancia"
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
          clickable={true}
          onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'efectivo' })}
          dataTestId="metric-efectivo"
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
          clickable={true}
          onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'tarjeta' })}
          dataTestId="metric-tarjeta"
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
          <div 
            data-testid="compare-ganancia"
            onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'ganancia' })}
            className="text-center p-8 bg-[#F5F1EB]/30 rounded-lg border border-[#C9B8A8]/10 cursor-pointer hover:bg-[#F5F1EB] transition-colors group"
          >
            <p className="text-[9px] uppercase tracking-[3px] text-[#1A1A1A]/40 mb-4 font-bold group-hover:text-[#1A1A1A]">Ganancia Neta</p>
            <p className="text-2xl font-bold text-[#1A1A1A] mb-2">${gNetaMes.toLocaleString()}</p>
            <p className="text-xs text-[#1A1A1A]/30 font-medium">vs ${prevGNeta.toLocaleString()}</p>
          </div>

          <div 
            data-testid="compare-efectivo"
            onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'efectivo' })}
            className="text-center p-8 bg-[#F5F1EB]/30 rounded-lg border border-[#C9B8A8]/10 cursor-pointer hover:bg-[#F5F1EB] transition-colors group"
          >
            <p className="text-[9px] uppercase tracking-[3px] text-[#1A1A1A]/40 mb-4 font-bold group-hover:text-[#1A1A1A]">Caja Efectivo</p>
            <p className="text-2xl font-bold text-[#1A1A1A] mb-2">${totalEfectivo.toLocaleString()}</p>
            <p className="text-xs text-[#1A1A1A]/30 font-medium">vs ${prevTotalEfectivo.toLocaleString()}</p>
          </div>

          <div 
            data-testid="compare-tarjeta"
            onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'tarjeta' })}
            className="text-center p-8 bg-[#F5F1EB]/30 rounded-lg border border-[#C9B8A8]/10 cursor-pointer hover:bg-[#F5F1EB] transition-colors group"
          >
            <p className="text-[9px] uppercase tracking-[3px] text-[#1A1A1A]/40 mb-4 font-bold group-hover:text-[#1A1A1A]">Caja Tarjeta</p>
            <p className="text-2xl font-bold text-[#1A1A1A] mb-2">${totalTarjeta.toLocaleString()}</p>
            <p className="text-xs text-[#1A1A1A]/30 font-medium">vs ${prevTotalTarjeta.toLocaleString()}</p>
          </div>

          <div 
            data-testid="compare-gastos"
            onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'gastos' })}
            className="text-center p-8 bg-[#F5F1EB]/30 rounded-lg border border-[#C9B8A8]/10 cursor-pointer hover:bg-[#F5F1EB] transition-colors group"
          >
            <p className="text-[9px] uppercase tracking-[3px] text-[#1A1A1A]/40 mb-4 font-bold group-hover:text-[#1A1A1A]">Gastos</p>
            <p className="text-2xl font-bold text-[#1A1A1A] mb-2">${expensesThisMonth.toLocaleString()}</p>
            <p className="text-xs text-[#1A1A1A]/30 font-medium">vs ${prevExpensesTotal.toLocaleString()}</p>
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
                {showSinStock ? '✕ Ver disponibles' : `Ver agotadas (${sinStock.length})`}
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
              {filteredInventory.map(item => (
                <tr
                  key={item.id}
                  className={`transition-colors ${item.cantidad <= 0 ? 'bg-gray-50 opacity-60' : 'hover:bg-[#C9B8A8]/5'}`}
                >
                  <td className="px-3 py-2.5 text-xs font-mono text-[#1A1A1A]">{item.sku}</td>
                  <td className="px-3 py-2.5 text-xs text-[#1A1A1A]">{item.descripcion}</td>
                  <td className="px-3 py-2.5 text-xs text-[#1A1A1A]">{item.proveedor}</td>
                  <td className="px-3 py-2.5 text-xs text-right text-[#1A1A1A]">$ {item.costo.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-right text-[#1A1A1A]">$ {item.ventaEfectivo.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-right text-[#1A1A1A]">$ {(item.ventaTarjeta ?? item.ventaEfectivo).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-center">
                    {item.cantidad <= 0
                      ? <span className="text-red-400 font-bold text-[9px] uppercase tracking-[2px]">Agotado</span>
                      : <span className={`font-bold ${item.cantidad <= 2 ? 'text-amber-600' : 'text-[#1A1A1A]'}`}>
                          {item.cantidad}
                          <span className="ml-1 text-[9px] font-normal opacity-40 uppercase tracking-tighter">unids</span>
                        </span>
                    }
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5 items-center justify-center">
                      <button onClick={() => setEditingItem(item)} className="p-1.5 hover:bg-[#C9B8A8]/20 text-[#1A1A1A] rounded-lg transition-colors"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(item.id)} className={`p-1.5 rounded-lg transition-all ${pendingDeleteId === item.id ? 'bg-red-600 text-white' : 'hover:bg-red-50 text-red-600'}`}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailView && (() => {
        const vMonth = detailView.month;
        const vYear = detailView.year;
        const vClosure = closures.find(c => c.month === vMonth && c.year === vYear);
        const vSales = sales.filter(s => isMonth(s.fecha, vMonth, vYear));
        const vExpensesList = expenses.filter(e => isMonth(e.fecha, vMonth, vYear));

        // Mes comparativo dentro del modal
        let pMonth = vMonth - 1;
        let pYear = vYear;
        if (pMonth === 0) { pMonth = 12; pYear -= 1; }
        
        const pClosure = closures.find(c => c.month === pMonth && c.year === pYear);
        const pSales = sales.filter(s => isMonth(s.fecha, pMonth, pYear));
        const pExpensesList = expenses.filter(e => isMonth(e.fecha, pMonth, pYear));

        // Cálculos Mes Seleccionado
        const vGastos = vClosure ? vClosure.gastos : vExpensesList.reduce((acc, e) => acc + e.monto, 0);
        
        const vBreakdown = vSales.reduce((acc, s) => {
          const { efectivo, tarjeta, ganancia } = computeSaleBreakdown(s, sales);
          const signo = (s.tipo === 'devolucion' || s.tipo === 'anulacion') ? -1 : 1;
          
          let prendas = 0;
          if (s.tipo === 'cambio') {
            prendas = (s.itemsNuevos ?? []).reduce((sum, i) => sum + (i.cantidad ?? 1), 0);
          } else if (s.tipo === 'venta') {
            prendas = (s.items ?? []).reduce((sum, i) => sum + (i.cantidad ?? 1), 0);
          }

          return {
            efectivo: acc.efectivo + (efectivo * signo),
            tarjeta: acc.tarjeta + (tarjeta * signo),
            ganancia: acc.ganancia + (ganancia * signo),
            prendas: acc.prendas + prendas
          };
        }, { efectivo: 0, tarjeta: 0, ganancia: 0, prendas: 0 });

        const vGNeta = vClosure ? vClosure.gananciaNeta : (vBreakdown.ganancia - vGastos);
        const vGBruta = vGNeta + vGastos;
        const vEfectivo = vClosure ? vClosure.cajaEfectivo : (vBreakdown.efectivo - vGastos);
        const vTarjeta = vClosure ? vClosure.cajaTarjeta : vBreakdown.tarjeta;

        // Cálculos Mes Anterior (para el ∆ del modal)
        const pGastos = pClosure ? pClosure.gastos : pExpensesList.reduce((acc, e) => acc + e.monto, 0);
        const pBreakdown = pSales.reduce((acc, s) => {
          const { efectivo, tarjeta, ganancia } = computeSaleBreakdown(s, sales);
          const signo = (s.tipo === 'devolucion' || s.tipo === 'anulacion') ? -1 : 1;
          
          let prendas = 0;
          if (s.tipo === 'cambio') {
             prendas = (s.itemsNuevos ?? []).reduce((sum, i) => sum + (i.cantidad ?? 1), 0);
          } else if (s.tipo === 'venta') {
             prendas = (s.items ?? []).reduce((sum, i) => sum + (i.cantidad ?? 1), 0);
          }

          return {
            efectivo: acc.efectivo + (efectivo * signo),
            tarjeta: acc.tarjeta + (tarjeta * signo),
            ganancia: acc.ganancia + (ganancia * signo),
            prendas: acc.prendas + prendas
          };
        }, { efectivo: 0, tarjeta: 0, ganancia: 0, prendas: 0 });

        const pGNeta = pClosure ? pClosure.gananciaNeta : (pBreakdown.ganancia - pGastos);
        const pEfectivo = pClosure ? pClosure.cajaEfectivo : (pBreakdown.efectivo - pGastos);
        const pTarjeta = pClosure ? pClosure.cajaTarjeta : pBreakdown.tarjeta;
        const pPrendas = pBreakdown.prendas;

        const getDelta = (val: number, prev: number) => {
          const diff = val - prev;
          const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : (val > 0 ? 100 : 0);
          return { diff, pct, isPos: diff >= 0 };
        };

        const dG = getDelta(vGNeta, pGNeta);
        const dE = getDelta(vEfectivo, pEfectivo);
        const dT = getDelta(vTarjeta, pTarjeta);
        const dEx = getDelta(vGastos, pGastos);

        const changeMonth = (offset: number) => {
          let newMonth = vMonth + offset;
          let newYear = vYear;
          if (newMonth === 0) { newMonth = 12; newYear -= 1; }
          else if (newMonth === 13) { newMonth = 1; newYear += 1; }
          setDetailView({ month: newMonth, year: newYear, type: detailView.type });
        };

        // Preparar lista con saldo acumulado (solo relevante en caja efectivo)
        const sortedSales = vSales.slice().sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
        let runningBalance = 0;
        const salesWithBalance = sortedSales.map(sale => {
          const b = computeSaleBreakdown(sale, sales);
          const s = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
          const cashImpact = b.efectivo * s;
          runningBalance += cashImpact;
          return { ...sale, breakdown: b, impact: cashImpact, balance: runningBalance };
        }).reverse(); // Mostramos más reciente primero en la tabla, pero el saldo se calculó cronológicamente

        // Helper para gráfico de barras
        const RenderBarChart = (val: number, prev: number, label: string, prefix = '$') => {
          const max = Math.max(val, prev, 1);
          const valPct = (val / max) * 100;
          const prevPct = (prev / max) * 100;
          const diff = val - prev;
          const diffPct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : (val > 0 ? 100 : 0);

          return (
            <div className="bg-white/50 p-6 rounded-2xl border border-[#C9B8A8]/30 space-y-6">
              <div className="flex justify-between items-end">
                <h5 className="text-[10px] uppercase tracking-[2px] font-bold text-[#1A1A1A]/60">{label}</h5>
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${diff >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {diff >= 0 ? '↑' : '↓'} {prefix}{Math.abs(diff).toLocaleString()} ({diffPct.toFixed(1)}%)
                </div>
              </div>
              
              <div className="space-y-4">
                {/* BARRA ACTUAL */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
                    <span>Mes Actual</span>
                    <span>{prefix}{val.toLocaleString()}</span>
                  </div>
                  <div className="h-4 bg-[#F5F1EB] rounded-full overflow-hidden border border-[#C9B8A8]/20">
                    <div 
                      className="h-full bg-[#1A1A1A] transition-all duration-1000 ease-out"
                      style={{ width: `${valPct}%` }}
                    />
                  </div>
                </div>

                {/* BARRA ANTERIOR */}
                <div className="space-y-1.5 opacity-60">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
                    <span>Mes Anterior</span>
                    <span>{prefix}{prev.toLocaleString()}</span>
                  </div>
                  <div className="h-4 bg-[#F5F1EB] rounded-full overflow-hidden border border-[#C9B8A8]/20">
                    <div 
                      className="h-full bg-[#C9B8A8] transition-all duration-1000 ease-out"
                      style={{ width: `${prevPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-center items-center p-4" onClick={() => setDetailView(null)}>
            <div className="bg-white/95 backdrop-blur-md border border-[#C9B8A8]/50 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
              
              {/* HEADER ESPECIALIZADO CON NAVEGACIÓN */}
              <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b-2 border-[#C9B8A8]/30 p-6 flex justify-between items-center z-10">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <button data-testid="chevron-left" onClick={() => changeMonth(-1)} className="p-2 hover:bg-[#C9B8A8]/20 rounded-full transition-colors text-[#1A1A1A]/40 hover:text-[#1A1A1A]">
                      <ChevronLeft size={20} />
                    </button>
                    <div className="p-3 bg-[#C9B8A8]/20 rounded-xl text-[#1A1A1A]">
                      {detailView.type === 'ganancia' && <TrendingUp size={24} />}
                      {detailView.type === 'efectivo' && <Banknote size={24} />}
                      {detailView.type === 'tarjeta' && <CreditCard size={24} />}
                      {detailView.type === 'prendas' && <Calendar size={24} />}
                      {detailView.type === 'gastos' && <TrendingDown size={24} />}
                    </div>
                    {(vMonth !== currentMonth || vYear !== currentYear) && (
                      <button data-testid="chevron-right" onClick={() => changeMonth(1)} className="p-2 hover:bg-[#C9B8A8]/20 rounded-full transition-colors text-[#1A1A1A]/40 hover:text-[#1A1A1A]">
                        <ChevronRight size={20} />
                      </button>
                    )}
                  </div>
                  <div>
                    <h3 className="font-serif text-3xl italic text-[#1A1A1A]">
                      {detailView.type === 'ganancia' && 'Análisis de Ganancias'}
                      {detailView.type === 'efectivo' && 'Análisis de Efectivo'}
                      {detailView.type === 'tarjeta' && 'Análisis de Tarjetas'}
                      {detailView.type === 'prendas' && 'Análisis de Unidades'}
                      {detailView.type === 'gastos' && 'Análisis de Gastos'}
                    </h3>
                    <p className="text-[10px] text-[#1A1A1A]/60 uppercase tracking-[2px] mt-1 font-medium">
                      MES: {vMonth}/{vYear} (vs {pMonth}/{pYear}) {vClosure ? '• [PERIODO CERRADO]' : '• [EN CURSO]'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setDetailView(null)} className="p-2 hover:bg-[#C9B8A8]/20 rounded-lg transition-colors text-[#1A1A1A]"><X size={24} /></button>
              </div>

              <div className="p-8 space-y-10">
                
                {/* 1. SECCIÓN DE GRÁFICOS COMPARATIVOS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {detailView.type === 'ganancia' && RenderBarChart(vGNeta, pGNeta, 'Ganancia Neta Mensual')}
                  {detailView.type === 'efectivo' && RenderBarChart(vEfectivo, pEfectivo, 'Caja Efectivo (Física)')}
                  {detailView.type === 'tarjeta' && RenderBarChart(vTarjeta, pTarjeta, 'Caja Tarjeta (Bancos)')}
                  {detailView.type === 'gastos' && RenderBarChart(vGastos, pGastos, 'Gastos Operativos')}

                  {/* MINI INDICADORES COMPLEMENTARIOS AL LADO DEL GRÁFICO */}
                  <div className="grid grid-cols-2 gap-4">
                    {detailView.type === 'ganancia' && (
                      <>
                        <div className="p-4 bg-[#F5F1EB]/40 rounded-xl border border-[#C9B8A8]/20">
                          <p className="text-[8px] uppercase tracking-widest text-gray-500 mb-1">Ganancia Bruta</p>
                          <p className="text-lg font-bold font-mono">${vGBruta.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-[#F5F1EB]/40 rounded-xl border border-[#C9B8A8]/20">
                          <p className="text-[8px] uppercase tracking-widest text-gray-500 mb-1">Gastos Totales</p>
                          <p className="text-lg font-bold font-mono text-red-700">-${vGastos.toLocaleString()}</p>
                        </div>
                      </>
                    )}
                    {detailView.type === 'efectivo' && (
                      <>
                        <div className="p-4 bg-[#F5F1EB]/40 rounded-xl border border-[#C9B8A8]/20">
                          <p className="text-[8px] uppercase tracking-widest text-gray-500 mb-1">Ventas Brutas</p>
                          <p className="text-lg font-bold font-mono text-emerald-800">${vBreakdown.efectivo.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-[#F5F1EB]/40 rounded-xl border border-[#C9B8A8]/20">
                          <p className="text-[8px] uppercase tracking-widest text-gray-500 mb-1">Gastos Pagados</p>
                          <p className="text-lg font-bold font-mono text-red-700">-${vGastos.toLocaleString()}</p>
                        </div>
                      </>
                    )}
                    {detailView.type === 'gastos' && (
                      <>
                        <div className="p-4 bg-[#F5F1EB]/40 rounded-xl border border-[#C9B8A8]/20">
                          <p className="text-[8px] uppercase tracking-widest text-gray-500 mb-1">Egresos Efectivo</p>
                          <p className="text-lg font-bold font-mono text-red-700">${vGastos.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-[#F5F1EB]/40 rounded-xl border border-[#C9B8A8]/20">
                          <p className="text-[8px] uppercase tracking-widest text-gray-500 mb-1">Frecuencia</p>
                          <p className="text-lg font-bold font-mono">{vExpensesList.length} puros</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 2. LISTA DE VENTAS O GASTOS (FILTRADA POR CONTEXTO) */}
                <div className="space-y-4">
                  <h4 className="font-serif text-xl italic text-[#1A1A1A] border-b border-[#C9B8A8]/30 pb-2">
                    {detailView.type === 'gastos' ? `Egresos del Periodo (${vExpensesList.length})` : `Ventas del Periodo (${vSales.length})`}
                  </h4>
                  <div className="border border-[#C9B8A8]/50 rounded-2xl overflow-auto max-h-[400px] shadow-sm bg-white">
                    {detailView.type === 'gastos' ? (
                       <table className="w-full text-sm">
                       <thead className="bg-[#C9B8A8]/20 sticky top-0 backdrop-blur-md">
                         <tr>
                           <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">Fecha</th>
                           <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">Concepto</th>
                           <th className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">Monto</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-[#C9B8A8]/10 text-xs text-left">
                         {vExpensesList.slice().sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).map(exp => (
                           <tr key={exp.id} className="hover:bg-[#F5F1EB]/30 transition-colors">
                             <td className="px-4 py-3 text-gray-500 font-medium">{new Date(exp.fecha).toLocaleDateString('es-AR')}</td>
                             <td className="px-4 py-3 uppercase tracking-tighter font-bold">{exp.concepto}</td>
                             <td className="px-4 py-3 text-right font-mono font-bold text-red-700">-${exp.monto.toLocaleString()}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                    ) : (
                      <table className="w-full text-sm">
                      <thead className="bg-[#C9B8A8]/20 sticky top-0 backdrop-blur-md">
                        <tr>
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">Fecha</th>
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">Tipo</th>
                          <th className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">
                            {detailView.type === 'efectivo' ? 'Impacto Efectivo' : detailView.type === 'tarjeta' ? 'Cobrado Tarj.' : 'Total'}
                          </th>
                          {detailView.type === 'efectivo' && (
                            <th className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">Saldo Acum.</th>
                          )}
                          {detailView.type === 'ganancia' && (
                            <>
                              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">Costo</th>
                              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">Ganancia</th>
                            </>
                          )}
                          {detailView.type === 'prendas' && (
                            <th className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-[#1A1A1A]/60 font-bold">Prendas</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#C9B8A8]/10 text-xs text-left">
                        {salesWithBalance.map(item => {
                              return (
                                <tr key={item.id} className="hover:bg-[#F5F1EB]/30 transition-colors">
                                  <td className="px-4 py-3 text-gray-500 font-medium">{new Date(item.fecha).toLocaleDateString('es-AR')}</td>
                                  <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 bg-[#C9B8A8]/10 text-[#1A1A1A] rounded text-[9px] font-bold uppercase tracking-tighter">
                                      {item.tipo}
                                    </span>
                                  </td>
                                  <td className={`px-4 py-3 text-right font-mono font-bold ${item.impact >= 0 ? 'text-[#1A1A1A]' : 'text-rose-600'}`}>
                                    {detailView.type === 'efectivo' ? `$${item.impact.toLocaleString()}` : 
                                     detailView.type === 'tarjeta' ? `$${(item.breakdown.tarjeta * (item.tipo.includes('devolucion') ? -1 : 1)).toLocaleString()}` : 
                                     `$${(item.breakdown.totalCobrado * (item.tipo.includes('devolucion') ? -1 : 1)).toLocaleString()}`}
                                  </td>
                                  {detailView.type === 'efectivo' && (
                                    <td className="px-4 py-3 text-right font-mono text-gray-500 font-bold">
                                      ${item.balance.toLocaleString()}
                                    </td>
                                  )}
                                  {detailView.type === 'ganancia' && (
                                    <>
                                      <td className="px-4 py-3 text-right text-gray-400 font-mono">${(item.breakdown.costoTotal * (item.tipo.includes('devolucion') ? -1 : 1)).toLocaleString()}</td>
                                      <td className={`px-4 py-3 text-right font-mono font-bold ${item.breakdown.ganancia * (item.tipo.includes('devolucion') ? -1 : 1) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        ${(item.breakdown.ganancia * (item.tipo.includes('devolucion') ? -1 : 1)).toLocaleString()}
                                      </td>
                                    </>
                                  )}
                                  {detailView.type === 'gastos' && (
                                    <td className="px-4 py-3 text-right font-mono font-bold">
                                      -
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                      </tbody>
                    </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/20 flex justify-center items-center">
          <div className="bg-white p-8 w-full max-w-xl space-y-4 border border-[#D4C4B0]">
            <h3 className="font-serif text-2xl italic">Editar producto</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-500">Descripción</label>
                <input className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-black" value={editingItem.descripcion} onChange={e => setEditingItem({...editingItem, descripcion: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-gray-500">Costo</label>
                  <input 
                    type="number" 
                    step="any"
                    autoComplete="off"
                    className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-black" 
                    value={editingItem.costo} 
                    onChange={e => {
                      const newCost = Number(e.target.value);
                      const { ventaEfectivo, ventaTarjeta } = calculatePricesFromCost(newCost);
                      setEditingItem({
                        ...editingItem,
                        costo: newCost,
                        ventaEfectivo,
                        ventaTarjeta
                      });
                    }} 
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-gray-500">Stock</label>
                  <input type="number" className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-black" value={editingItem.cantidad} onChange={e => setEditingItem({...editingItem, cantidad: Number(e.target.value)})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-gray-500">Precio Efectivo</label>
                  <input type="number" className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-black" value={editingItem.ventaEfectivo} onChange={e => setEditingItem({...editingItem, ventaEfectivo: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-gray-500">Precio Tarjeta</label>
                  <input type="number" className="w-full border-b border-gray-300 py-2 focus:outline-none focus:border-black" value={editingItem.ventaTarjeta} onChange={e => setEditingItem({...editingItem, ventaTarjeta: Number(e.target.value)})} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-4 pt-6">
              <button onClick={() => setEditingItem(null)} className="text-xs uppercase tracking-widest">Cancelar</button>
              <button onClick={() => { onUpdateItem(editingItem); setEditingItem(null); }} className="bg-black text-white px-6 py-2 text-xs uppercase tracking-widest">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
