import React from 'react';
import { InventoryItem, Sale, Expense, GiftCard, MonthlyClosure, WebSettings } from '../types';
import MetricCard from './MetricCard';
import { Edit2, Trash2, X, Search, TrendingUp, TrendingDown, DollarSign, Calendar, CreditCard, Banknote, ChevronLeft, ChevronRight, Filter, Download, Plus, Minus, Eye, EyeOff, AlertTriangle, PackageCheck, Layers } from 'lucide-react';
import { computeSaleBreakdown, isMonth, calcTrend, calculatePricesFromCost } from '../services/finance';
import { useModal } from '../contexts/ModalContext';

interface DashboardProps {
  inventory: InventoryItem[];
  sales: Sale[];
  expenses: Expense[];
  giftCards: GiftCard[];
  closures: MonthlyClosure[];
  webSettings: WebSettings;
  selectedCategory?: string;
  onSelectCategory?: (cat: string) => void;
  onUpdateItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
  onNavigateToWebManager?: (itemId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  inventory,
  sales,
  expenses,
  giftCards,
  closures,
  webSettings,
  selectedCategory,
  onSelectCategory,
  onUpdateItem,
  onDeleteItem,
  onNavigateToWebManager
}) => {
  const { showAlert } = useModal();
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

  const [localCategory, setLocalCategory] = React.useState<string>('');
  const activeCategory = selectedCategory !== undefined ? selectedCategory : localCategory;
  const handleCategoryChange = (cat: string) => {
    if (onSelectCategory) {
      onSelectCategory(cat);
    } else {
      setLocalCategory(cat);
    }
  };

  const filteredInventory = [...baseInventory]
    .reverse()
    .filter(item => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = (item.descripcion?.toLowerCase() || "").includes(q) ||
        (item.proveedor?.toLowerCase() || "").includes(q) ||
        (item.sku?.toLowerCase() || "").includes(q);
      
      const matchesCategory = !activeCategory || item.categoria === activeCategory;
      
      return matchesSearch && matchesCategory;
    });

  const categoriasSet = new Set<string>(webSettings?.categoriesOrder || []);
  inventory.forEach(i => {
    if (i.categoria) categoriasSet.add(i.categoria);
  });
  const allCategories = Array.from(categoriasSet);

  const handleDelete = (id: string) => {
    if (pendingDeleteId === id) {
      onDeleteItem(id);
      setPendingDeleteId(null);
    } else {
      setPendingDeleteId(id);
      setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  const handleFastStockUpdate = async (item: InventoryItem, delta: number) => {
    const newCount = Math.max(0, item.cantidad + delta);
    if (newCount !== item.cantidad) {
      if (item.visible !== false) {
        onUpdateItem({ ...item, cantidad: newCount, visible: false });
        await showAlert('El stock ha sido modificado. El producto se ha ocultado temporalmente de la web para evitar inconsistencias. Serás redirigido para que ajustes las cantidades por talle y color.', 'Stock Modificado', 'warning');
        if (onNavigateToWebManager) {
          onNavigateToWebManager(item.id);
        }
      } else {
        onUpdateItem({ ...item, cantidad: newCount });
      }
    }
  };

  const handleExportCSV = () => {
    if (filteredInventory.length === 0) return;
    const headers = ['SKU', 'DESCRIPCION', 'PROVEEDOR', 'CATEGORIA', 'COSTO', 'PRECIO_EFECTIVO', 'PRECIO_TARJETA', 'STOCK'];
    const rows = filteredInventory.map(item => [
      `"${item.sku || ''}"`,
      `"${(item.descripcion || '').replace(/"/g, '""')}"`,
      `"${(item.proveedor || '').replace(/"/g, '""')}"`,
      `"${(item.categoria || '').replace(/"/g, '""')}"`,
      item.costo || 0,
      item.ventaEfectivo || 0,
      item.ventaTarjeta || item.ventaEfectivo || 0,
      item.cantidad || 0
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `inventario_el_ropero_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

      {/* Alertas y Tareas Rápidas */}
      {(sinStock.length > 0 || conStock.some(i => i.cantidad <= 2)) && (
        <div className="bg-stone-100/90 border border-stone-200/80 rounded-2xl px-4 py-2.5 sm:px-5 sm:py-3 flex items-center justify-between gap-3 sm:gap-4 shadow-2xs">
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <div className="p-1.5 bg-stone-200/80 text-stone-700 rounded-xl shrink-0">
              <AlertTriangle size={16} strokeWidth={1.5} />
            </div>
            <div className="flex items-center gap-2 truncate">
              <h4 className="font-serif text-sm italic font-medium text-stone-900 leading-none shrink-0 whitespace-nowrap">
                Cinta de Alertas Operativas
              </h4>
              <span className="hidden md:inline text-[9px] text-stone-400 font-light">•</span>
              <p className="text-[9px] text-stone-500 uppercase tracking-[0.12em] font-light truncate whitespace-nowrap">
                Atención requerida en inventario y reposición del showroom
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sinStock.length > 0 && (
              <button
                onClick={() => setShowSinStock(true)}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100/70 text-rose-700 border border-rose-200/80 rounded-xl text-[9px] font-medium uppercase tracking-[0.15em] transition-all flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span>Agotados ({sinStock.length})</span>
              </button>
            )}
            {conStock.filter(i => i.cantidad <= 2).length > 0 && (
              <button
                onClick={() => {
                  setShowSinStock(false);
                  setSearchTerm('');
                }}
                className="px-3 py-1.5 bg-white hover:bg-stone-50 text-stone-800 border border-stone-200/80 rounded-xl text-[9px] font-medium uppercase tracking-[0.15em] transition-all flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Stock Crítico ({conStock.filter(i => i.cantidad <= 2).length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Comparación mensual */}
      <div className="bg-white border border-stone-200/60 rounded-2xl p-6 md:p-7 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between mb-6 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-stone-100 rounded-xl text-stone-700">
              <Calendar size={18} strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-serif text-xl italic font-normal text-stone-900">Comparación Mensual</h3>
              <p className="text-[9px] text-stone-400 uppercase tracking-[0.18em] font-light">
                Mes {currentMonth}/{currentYear} vs Mes {prevMonth}/{prevYear}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div 
            data-testid="compare-ganancia"
            onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'ganancia' })}
            className="group relative overflow-hidden text-left p-5 bg-white hover:bg-stone-50/70 rounded-xl border border-stone-200/70 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_8px_25px_-5px_rgba(0,0,0,0.06)] hover:border-stone-300 active:translate-y-0 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-1 mb-2.5">
              <span className="text-[9px] uppercase tracking-[0.18em] text-stone-400 font-medium group-hover:text-stone-700">Ganancia Neta</span>
              <span className={`px-2 py-0.5 rounded-full text-[8px] font-medium ${trendGanancia.isPositive ? 'bg-emerald-50 text-emerald-800 border border-emerald-500/20' : 'bg-rose-50 text-rose-800 border border-rose-500/20'}`}>
                {trendGanancia.isPositive ? '↑' : '↓'} {trendGanancia.value.toFixed(1)}%
              </span>
            </div>
            <p className="font-serif text-2xl font-medium text-stone-900 mb-1">${gNetaMes.toLocaleString()}</p>
            <p className="text-[9px] text-stone-400 font-light tracking-wide">vs ${prevGNeta.toLocaleString()} <span className="opacity-70 italic">ant.</span></p>
          </div>

          <div 
            data-testid="compare-efectivo"
            onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'efectivo' })}
            className="group relative overflow-hidden text-left p-5 bg-white hover:bg-stone-50/70 rounded-xl border border-stone-200/70 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_8px_25px_-5px_rgba(0,0,0,0.06)] hover:border-stone-300 active:translate-y-0 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-1 mb-2.5">
              <span className="text-[9px] uppercase tracking-[0.18em] text-stone-400 font-medium group-hover:text-stone-700">Caja Efectivo</span>
              <span className={`px-2 py-0.5 rounded-full text-[8px] font-medium ${trendEfectivo.isPositive ? 'bg-emerald-50 text-emerald-800 border border-emerald-500/20' : 'bg-rose-50 text-rose-800 border border-rose-500/20'}`}>
                {trendEfectivo.isPositive ? '↑' : '↓'} {trendEfectivo.value.toFixed(1)}%
              </span>
            </div>
            <p className="font-serif text-2xl font-medium text-stone-900 mb-1">${totalEfectivo.toLocaleString()}</p>
            <p className="text-[9px] text-stone-400 font-light tracking-wide">vs ${prevTotalEfectivo.toLocaleString()} <span className="opacity-70 italic">ant.</span></p>
          </div>

          <div 
            data-testid="compare-tarjeta"
            onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'tarjeta' })}
            className="group relative overflow-hidden text-left p-5 bg-white hover:bg-stone-50/70 rounded-xl border border-stone-200/70 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_8px_25px_-5px_rgba(0,0,0,0.06)] hover:border-stone-300 active:translate-y-0 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-1 mb-2.5">
              <span className="text-[9px] uppercase tracking-[0.18em] text-stone-400 font-medium group-hover:text-stone-700">Caja Tarjeta</span>
              <span className={`px-2 py-0.5 rounded-full text-[8px] font-medium ${trendTarjeta.isPositive ? 'bg-emerald-50 text-emerald-800 border border-emerald-500/20' : 'bg-rose-50 text-rose-800 border border-rose-500/20'}`}>
                {trendTarjeta.isPositive ? '↑' : '↓'} {trendTarjeta.value.toFixed(1)}%
              </span>
            </div>
            <p className="font-serif text-2xl font-medium text-stone-900 mb-1">${totalTarjeta.toLocaleString()}</p>
            <p className="text-[9px] text-stone-400 font-light tracking-wide">vs ${prevTotalTarjeta.toLocaleString()} <span className="opacity-70 italic">ant.</span></p>
          </div>

          <div 
            data-testid="compare-gastos"
            onClick={() => setDetailView({ month: currentMonth, year: currentYear, type: 'gastos' })}
            className="group relative overflow-hidden text-left p-5 bg-white hover:bg-stone-50/70 rounded-xl border border-stone-200/70 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_8px_25px_-5px_rgba(0,0,0,0.06)] hover:border-stone-300 active:translate-y-0 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-1 mb-2.5">
              <span className="text-[9px] uppercase tracking-[0.18em] text-stone-400 font-medium group-hover:text-stone-700">Gastos Operativos</span>
              <span className="px-2 py-0.5 rounded-full text-[8px] font-medium bg-stone-100 text-stone-600 border border-stone-200/50">
                {expensesThisMonth <= prevExpensesTotal ? '↓' : '↑'} {calcTrend(expensesThisMonth, prevExpensesTotal).value.toFixed(1)}%
              </span>
            </div>
            <p className="font-serif text-2xl font-medium text-rose-700 mb-1">${expensesThisMonth.toLocaleString()}</p>
            <p className="text-[9px] text-stone-400 font-light tracking-wide">vs ${prevExpensesTotal.toLocaleString()} <span className="opacity-70 italic">ant.</span></p>
          </div>
        </div>
      </div>
      <div className="space-y-5 mt-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-stone-200/60 pb-4 gap-4">
          <div className="flex items-center gap-4">
            <h3 className="font-serif text-2xl italic font-normal text-stone-900">Inventario</h3>
            {sinStock.length > 0 && (
              <button
                onClick={() => setShowSinStock(v => !v)}
                className={`text-[9px] uppercase tracking-[0.15em] font-medium px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs ${
                  showSinStock
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white text-stone-600 border border-stone-200/70 hover:border-stone-400 hover:text-stone-900'
                }`}
              >
                {showSinStock ? <EyeOff size={13} strokeWidth={1.5} /> : <Eye size={13} strokeWidth={1.5} />}
                <span>{showSinStock ? '✕ Ver disponibles' : `Ver agotadas (${sinStock.length})`}</span>
              </button>
            )}
          </div>
          <div className="relative w-full md:w-72">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
              size={14}
              strokeWidth={1.5}
            />
            <input
              type="text"
              placeholder="BUSCAR CÓDIGO, DESCRIPCIÓN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-stone-200/70 rounded-xl py-2 pl-9 pr-8 text-xs uppercase font-medium text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-800 transition-colors"
                title="Limpiar búsqueda"
              >
                <X size={13} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {allCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 py-3 px-4 bg-white/80 border border-stone-200/60 rounded-2xl shadow-2xs">
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-stone-400 mr-1 flex items-center gap-1">
              <Filter size={11} strokeWidth={1.5} /> Categorías:
            </span>
            <button
              onClick={() => handleCategoryChange('')}
              className={`px-3 py-1.5 rounded-xl text-[9px] tracking-[0.15em] uppercase font-medium transition-all ${
                !activeCategory
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'bg-stone-100/60 text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 border border-stone-200/50'
              }`}
            >
              Todas ({baseInventory.length})
            </button>
            {allCategories.map(cat => {
              const count = baseInventory.filter(i => i.categoria === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`px-3 py-1.5 rounded-xl text-[9px] tracking-[0.15em] uppercase font-medium transition-all flex items-center gap-1.5 ${
                    activeCategory === cat
                      ? 'bg-[#C5B4A0] text-stone-900 shadow-2xs font-semibold'
                      : 'bg-stone-100/60 text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 border border-stone-200/50'
                  }`}
                >
                  <span>{cat}</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                    activeCategory === cat ? 'bg-stone-900 text-white' : 'bg-stone-200/80 text-stone-700'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="border border-stone-200/60 bg-white rounded-2xl overflow-hidden shadow-[0_2px_15px_-3px_rgba(0,0,0,0.02)] max-h-[calc(100vh-280px)] min-h-[350px]">
          <table className="w-full">
            <thead className="bg-stone-50/90 text-stone-600 sticky top-0 z-10 border-b border-stone-200/60">
              <tr>
                <th className="px-4 py-3.5 text-left text-[9px] font-semibold uppercase tracking-[0.18em]">Código</th>
                <th className="px-4 py-3.5 text-left text-[9px] font-semibold uppercase tracking-[0.18em]">Descripción</th>
                <th className="px-4 py-3.5 text-left text-[9px] font-semibold uppercase tracking-[0.18em]">Proveedor</th>
                <th className="px-4 py-3.5 text-right text-[9px] font-semibold uppercase tracking-[0.18em]">Costo</th>
                <th className="px-4 py-3.5 text-right text-[9px] font-semibold uppercase tracking-[0.18em]">P. Efectivo</th>
                <th className="px-4 py-3.5 text-right text-[9px] font-semibold uppercase tracking-[0.18em]">P. Tarjeta</th>
                <th className="px-4 py-3.5 text-center text-[9px] font-semibold uppercase tracking-[0.18em]">Stock & Ajuste</th>
                <th className="px-4 py-3.5 text-center text-[9px] font-semibold uppercase tracking-[0.18em]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs">
              {filteredInventory.map(item => (
                <tr
                  key={item.id}
                  className={`transition-colors duration-150 ${item.cantidad <= 0 ? 'bg-stone-50/50 opacity-60' : 'hover:bg-stone-50/70'}`}
                >
                  <td className="px-4 py-3 font-mono font-medium text-stone-900 text-[11px]">{item.sku}</td>
                  <td className="px-4 py-3 font-medium text-stone-800 text-[11px]">{item.descripcion}</td>
                  <td className="px-4 py-3 text-stone-500 font-normal">{item.proveedor}</td>
                  <td className="px-4 py-3 text-right font-mono font-normal text-stone-500">$ {item.costo.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-stone-900 bg-emerald-500/5">$ {item.ventaEfectivo.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-stone-800">$ {(item.ventaTarjeta ?? item.ventaEfectivo).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1.5 bg-stone-50 border border-stone-200/60 rounded-full px-2 py-0.5 shadow-2xs">
                      <button
                        onClick={() => handleFastStockUpdate(item, -1)}
                        disabled={item.cantidad <= 0}
                        title="Restar 1 unidad"
                        className="w-4 h-4 rounded-full bg-white hover:bg-rose-50 text-stone-600 hover:text-rose-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium shadow-2xs"
                      >
                        <Minus size={10} strokeWidth={1.5} />
                      </button>

                      {item.cantidad <= 0 ? (
                        <span className="bg-rose-50 text-rose-700 border border-rose-200/60 px-2 py-0.5 rounded-full text-[8px] font-medium uppercase tracking-wider inline-flex items-center gap-1">
                          Agotado
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium inline-flex items-center gap-1 ${
                          item.cantidad <= 2 
                            ? 'bg-amber-50 text-amber-800 border border-amber-200/60' 
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                        }`}>
                          <span>{item.cantidad}</span>
                          <span className="text-[8px] font-normal opacity-60 uppercase">u.</span>
                        </span>
                      )}

                      <button
                        onClick={() => handleFastStockUpdate(item, 1)}
                        title="Sumar 1 unidad"
                        className="w-4 h-4 rounded-full bg-white hover:bg-emerald-50 text-stone-600 hover:text-emerald-700 flex items-center justify-center transition-colors font-medium shadow-2xs"
                      >
                        <Plus size={10} strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1 bg-stone-50 border border-stone-200/60 rounded-xl p-1 shadow-2xs">
                      <button 
                        onClick={() => setEditingItem(item)} 
                        title="Editar producto"
                        className="p-1 hover:bg-white text-stone-600 hover:text-stone-900 rounded-lg transition-all"
                      >
                        <Edit2 size={12} strokeWidth={1.5} />
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id)} 
                        title={pendingDeleteId === item.id ? "Confirmar eliminación" : "Eliminar producto"}
                        className={`p-1 rounded-lg transition-all ${
                          pendingDeleteId === item.id ? 'bg-rose-600 text-white font-medium' : 'hover:bg-rose-50 text-rose-600'
                        }`}
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </button>
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
                                <tr key={item.id} className="hover:bg-[#F5F1EB]/30 transition-colors" title={`Tipo: ${item.tipo} | Fecha: ${new Date(item.fecha).toLocaleDateString('es-AR')} | Impacto: $${item.impact?.toLocaleString() ?? ''} | Tarjeta: $${(item.breakdown?.tarjeta ?? 0).toLocaleString()} | Ganancia: $${(item.breakdown?.ganancia ?? 0).toLocaleString()}`}>
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
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
          <div className="bg-white p-8 w-full max-w-xl rounded-3xl border border-stone-200 shadow-2xl relative overflow-hidden space-y-6">
            
            <div className="flex items-center justify-between border-b border-[#C9B8A8]/30 pb-4">
              <div>
                <h3 className="font-serif text-2xl italic font-extrabold text-[#1A1A1A]">Editar Producto</h3>
                <p className="text-[10px] text-[#1A1A1A]/60 uppercase tracking-[2px] font-medium mt-0.5">
                  SKU: <span className="font-mono font-bold text-[#1A1A1A]">{editingItem.sku || 'SIN CÓDIGO'}</span>
                </p>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="p-2 rounded-xl text-[#1A1A1A]/40 hover:text-[#1A1A1A] hover:bg-[#C9B8A8]/20 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[9px] uppercase tracking-[2px] font-bold text-[#1A1A1A]/70 mb-1.5 block">Descripción del Producto</label>
                <input 
                  className="w-full bg-[#F5F1EB]/50 border border-[#C9B8A8]/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 focus:border-[#1A1A1A] transition-all" 
                  value={editingItem.descripcion} 
                  onChange={e => setEditingItem({...editingItem, descripcion: e.target.value})} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] uppercase tracking-[2px] font-bold text-[#1A1A1A]/70 mb-1.5 block">Costo Base ($)</label>
                  <input 
                    type="number" 
                    step="any"
                    autoComplete="off"
                    className="w-full bg-[#F5F1EB]/50 border border-[#C9B8A8]/60 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 focus:border-[#1A1A1A] transition-all" 
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
                  <label className="text-[9px] uppercase tracking-[2px] font-bold text-[#1A1A1A]/70 mb-1.5 block">Stock Actual (Unidades)</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#F5F1EB]/50 border border-[#C9B8A8]/60 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 focus:border-[#1A1A1A] transition-all" 
                    value={editingItem.cantidad} 
                    onChange={e => setEditingItem({...editingItem, cantidad: Number(e.target.value)})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#C9B8A8]/20">
                <div>
                  <label className="text-[9px] uppercase tracking-[2px] font-bold text-emerald-800 mb-1.5 block">Precio Efectivo ($)</label>
                  <input 
                    type="number" 
                    className="w-full bg-emerald-50/50 border border-emerald-300/60 rounded-xl px-3.5 py-2.5 text-xs font-mono font-extrabold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all" 
                    value={editingItem.ventaEfectivo} 
                    onChange={e => setEditingItem({...editingItem, ventaEfectivo: Number(e.target.value)})} 
                  />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-[2px] font-bold text-[#1A1A1A]/70 mb-1.5 block">Precio Tarjeta ($)</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#F5F1EB]/50 border border-[#C9B8A8]/60 rounded-xl px-3.5 py-2.5 text-xs font-mono font-extrabold text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 focus:border-[#1A1A1A] transition-all" 
                    value={editingItem.ventaTarjeta} 
                    onChange={e => setEditingItem({...editingItem, ventaTarjeta: Number(e.target.value)})} 
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-[#C9B8A8]/30">
              <button
                onClick={() => {
                  const duplicated: InventoryItem = {
                    ...editingItem,
                    id: Date.now().toString(),
                    sku: `${editingItem.sku || 'SKU'}-COP`,
                    descripcion: `${editingItem.descripcion} (Copia)`
                  };
                  onUpdateItem(duplicated);
                  setEditingItem(null);
                }}
                type="button"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#C9B8A8]/80 hover:bg-[#C9B8A8]/20 text-[#1A1A1A] text-[10px] uppercase font-bold tracking-[2px] transition-all flex items-center justify-center gap-2 shadow-2xs"
              >
                <Layers size={14} />
                <span>Duplicar Producto</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button 
                  onClick={() => setEditingItem(null)} 
                  type="button"
                  className="px-5 py-2.5 rounded-xl border border-transparent hover:bg-gray-100 text-[#1A1A1A]/70 hover:text-[#1A1A1A] text-[10px] uppercase font-bold tracking-[2px] transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={async () => { 
                    const originalItem = inventory.find(i => i.id === editingItem.id);
                    if (originalItem && originalItem.cantidad !== editingItem.cantidad) {
                      if (editingItem.visible !== false) {
                        onUpdateItem({ ...editingItem, visible: false });
                        await showAlert('El stock ha sido modificado. El producto se ha ocultado temporalmente de la web para evitar inconsistencias. Serás redirigido para que ajustes las cantidades por talle y color.', 'Stock Modificado', 'warning');
                        setEditingItem(null);
                        if (onNavigateToWebManager) {
                          onNavigateToWebManager(editingItem.id);
                        }
                        return;
                      }
                    }
                    onUpdateItem(editingItem); 
                    setEditingItem(null); 
                  }} 
                  type="button"
                  className="px-6 py-2.5 rounded-xl bg-[#1A1A1A] hover:bg-black text-white text-[10px] uppercase font-extrabold tracking-[2px] transition-all shadow-md hover:scale-[1.02] active:scale-95"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
