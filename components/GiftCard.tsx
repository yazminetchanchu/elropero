import React from 'react';
import { GiftCard } from '../types';
import { Plus, Trash2, Edit2, X, Gift, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface GiftCardsProps {
  giftCards: GiftCard[];
  onAddGiftCard: (data: { destinatario: string; montoInicial: number; pago?: { efectivo: number; tarjeta: number } }) => void;
  onUpdateGiftCard: (gc: GiftCard) => void;
  onCancelGiftCard: (id: string) => void;
}

const estadoConfig = {
  ACTIVA:   { label: 'Activa',   icon: CheckCircle,   color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  AGOTADA:  { label: 'Agotada',  icon: AlertCircle,   color: 'text-amber-600   bg-amber-50   border-amber-200'   },
  ANULADA:  { label: 'Anulada',  icon: XCircle,       color: 'text-red-600     bg-red-50     border-red-200'      },
};

const GiftCards: React.FC<GiftCardsProps> = ({
  giftCards,
  onAddGiftCard,
  onUpdateGiftCard,
  onCancelGiftCard,
}) => {
  const [destinatario, setDestinatario] = React.useState('');
  const [monto, setMonto] = React.useState<number>(0);
  const [pagoEfectivo, setPagoEfectivo] = React.useState(100);
  const [pagoTarjeta, setPagoTarjeta] = React.useState(0);
  const [editing, setEditing] = React.useState<GiftCard | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  
  // Búsqueda
  const [searchTerm, setSearchTerm] = React.useState('');

  // Limpia el valor a número entero
  const toInt = (value: string) => {
    const num = value.replace(/\D/g, '');
    return num === '' ? 0 : parseInt(num, 10);
  };

  // ─── CREAR ───────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinatario.trim() || monto <= 0) return;
    onAddGiftCard({ 
      destinatario: destinatario.trim(), 
      montoInicial: monto,
      pago: { efectivo: pagoEfectivo, tarjeta: pagoTarjeta }
    });
    setDestinatario('');
    setMonto(0);
    setPagoEfectivo(100);
    setPagoTarjeta(0);
  };

  // ─── EDITAR — calcula saldo al modificar montoInicial ────────────────
  const setEditingMontoInicial = (nuevoMonto: number) => {
    if (!editing) return;
    const yaUsado = editing.montoInicial - editing.saldo;
    // El saldo nunca puede subir más allá de (nuevoMonto - yaUsado)
    const nuevoSaldo = Math.max(0, nuevoMonto - yaUsado);
    setEditing({ ...editing, montoInicial: nuevoMonto, saldo: nuevoSaldo });
  };

  const setEditingSaldo = (nuevoSaldo: number) => {
    if (!editing) return;
    // El saldo no puede superar el monto inicial
    const saldoClamped = Math.max(0, Math.min(nuevoSaldo, editing.montoInicial));
    const nuevoEstado: GiftCard['estado'] =
      saldoClamped <= 0 ? 'AGOTADA' : 'ACTIVA';
    setEditing({ ...editing, saldo: saldoClamped, estado: nuevoEstado });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    // Sincronizar estado según saldo final
    const estadoFinal: GiftCard['estado'] =
      editing.estado === 'ANULADA'
        ? 'ANULADA'
        : editing.saldo <= 0
        ? 'AGOTADA'
        : 'ACTIVA';
    onUpdateGiftCard({ ...editing, estado: estadoFinal });
    setEditing(null);
  };

  // ─── CANCELAR / ELIMINAR ─────────────────────────
  const handleDelete = (id: string) => {
    if (pendingDeleteId === id) {
      onCancelGiftCard(id);
      setPendingDeleteId(null);
    } else {
      setPendingDeleteId(id);
      setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  // ─── RENDER ──────────────────────────────────────
  // ─── FILTRAR Y RENDER ──────────────────────────
  const filterList = (list: GiftCard[]) => {
    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter(gc => 
      gc.destinatario.toLowerCase().includes(q) || 
      gc.codigo.toLowerCase().includes(q)
    );
  };

  const activas  = filterList(giftCards.filter(gc => gc.estado === 'ACTIVA'));
  const inactivas = filterList(giftCards.filter(gc => gc.estado !== 'ACTIVA'));

  const GcCard = ({ gc }: { gc: GiftCard }) => {
    const cfg = estadoConfig[gc.estado];
    const Icon = cfg.icon;
    const pctUsado = gc.montoInicial > 0
      ? Math.round(((gc.montoInicial - gc.saldo) / gc.montoInicial) * 100)
      : 0;

    return (
      <div className="p-4 flex justify-between items-start hover:bg-[#C9B8A8]/5 transition-colors gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold tracking-[2px] uppercase text-[#1A1A1A] text-sm">{gc.destinatario}</span>
            <span className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>
              <Icon size={10} />
              {cfg.label}
            </span>
          </div>
          <div className="text-[10px] text-[#1A1A1A]/50 uppercase tracking-[2px] mt-0.5">{gc.codigo}</div>

          {/* Barra de saldo */}
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs text-[#1A1A1A]">
              <span>Saldo: <strong>${gc.saldo.toLocaleString()}</strong></span>
              <span className="text-[#1A1A1A]/50">de ${gc.montoInicial.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-[#C9B8A8]/30 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${gc.estado === 'ANULADA' ? 'bg-red-400' : gc.saldo <= 0 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${Math.max(0, 100 - pctUsado)}%` }}
              />
            </div>
            {pctUsado > 0 && (
              <div className="text-[9px] text-[#1A1A1A]/40 uppercase tracking-widest">{pctUsado}% utilizado</div>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setEditing({ ...gc })}
            className="p-2.5 border border-[#C9B8A8]/50 rounded-lg text-[#1A1A1A] hover:bg-[#C9B8A8] transition-all shadow-sm"
            title="Editar"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => handleDelete(gc.id)}
            className={`p-2.5 border rounded-lg transition-all shadow-sm ${
              pendingDeleteId === gc.id
                ? 'bg-red-600 text-white border-red-600'
                : 'border-red-200 text-red-500 hover:bg-red-50'
            }`}
            title={pendingDeleteId === gc.id ? 'Confirmar cancelación' : 'Cancelar gift card'}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-left max-w-6xl">
      <header className="border-b-2 border-[#C9B8A8]/30 pb-4">
        <h2 className="font-serif text-3xl italic text-[#1A1A1A]">Gift Cards</h2>
        <p className="text-[10px] tracking-[4px] uppercase font-medium text-[#1A1A1A]/60 mt-1">
          Administración de tarjetas y registros contables
        </p>
      </header>

      {/* ── CREAR ─────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-2xl p-6 space-y-5 shadow-xl max-w-xl"
      >
        <div className="flex items-center gap-3">
          <Gift className="text-[#1A1A1A]" size={20} />
          <h3 className="font-serif text-xl italic text-[#1A1A1A]">Nueva Gift Card</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-[10px] tracking-[3px] uppercase font-medium text-[#1A1A1A]">Destinatario</label>
            <input
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              className="w-full border-b-2 border-[#C9B8A8]/40 py-2.5 bg-transparent focus:outline-none focus:border-[#C9B8A8] text-[#1A1A1A] text-sm transition-colors placeholder:text-gray-400"
              placeholder="Nombre del destinatario"
            />
          </div>
          <div>
            <label className="text-[10px] tracking-[3px] uppercase font-medium text-[#1A1A1A]">Monto inicial</label>
            <div className="flex items-center border-b-2 border-[#C9B8A8]/40 focus-within:border-[#C9B8A8] transition-colors">
              <span className="text-sm font-bold pr-1 text-[#1A1A1A]/40">$</span>
              <input
                type="text"
                value={monto === 0 ? '' : monto}
                onChange={(e) => setMonto(toInt(e.target.value))}
                className="w-full py-2.5 bg-transparent focus:outline-none text-[#1A1A1A] text-sm placeholder:text-gray-400"
                placeholder="0"
              />
            </div>
          </div>

          {/* Selector de Medios de Pago */}
          <div className="col-span-2 border-t border-[#C9B8A8]/20 pt-3 space-y-3">
            <p className="text-[9px] uppercase font-bold tracking-[2px] text-[#1A1A1A]">Medio de Pago</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-[#1A1A1A]/60 font-medium">Efectivo %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={pagoEfectivo}
                  onChange={e => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value)));
                    setPagoEfectivo(v);
                    setPagoTarjeta(100 - v);
                  }}
                  className="w-full border-b border-[#C9B8A8]/40 py-1.5 bg-transparent focus:outline-none focus:border-[#C9B8A8] text-sm text-[#1A1A1A] font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#1A1A1A]/60 font-medium">Tarjeta %</label>
                <input
                  type="number"
                  value={pagoTarjeta}
                  readOnly
                  className="w-full border-b border-[#C9B8A8]/40 py-1.5 bg-[#F5F1EB]/50 focus:outline-none text-sm text-[#1A1A1A] font-bold"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setPagoEfectivo(100); setPagoTarjeta(0); }}
                className="text-[10px] uppercase underline hover:text-[#C9B8A8] text-[#1A1A1A] font-medium"
              >
                100% Efectivo
              </button>
              <button
                type="button"
                onClick={() => { setPagoEfectivo(0); setPagoTarjeta(100); }}
                className="text-[10px] uppercase underline hover:text-[#C9B8A8] text-[#1A1A1A] font-medium"
              >
                100% Tarjeta
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={!destinatario.trim() || monto <= 0}
          className="bg-[#C9B8A8] text-[#1A1A1A] px-6 py-3.5 text-[11px] tracking-[3px] font-medium uppercase flex items-center gap-3 hover:bg-[#B8A696] transition-all rounded-lg shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={15} /> Crear e informar venta
        </button>
      </form>

      {/* ── BUSCADOR ─────────────────────────────────── */}
      <div className="max-w-xl">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar gift card por nombre o código..."
          className="w-full border border-[#C9B8A8]/50 rounded-xl p-3 text-sm text-[#1A1A1A] bg-white outline-none focus:border-[#C9B8A8] shadow-sm"
        />
      </div>
      <section className="space-y-3">
        <h3 className="font-serif text-2xl italic text-[#1A1A1A]">
          Activas
          {activas.length > 0 && (
            <span className="ml-2 text-sm font-sans font-normal text-[#1A1A1A]/40 not-italic">({activas.length})</span>
          )}
        </h3>
        <div className="border border-[#C9B8A8]/50 bg-white/90 backdrop-blur-sm rounded-xl divide-y divide-[#C9B8A8]/20 shadow-lg overflow-hidden">
          {activas.length === 0
            ? <p className="p-5 text-sm italic text-[#1A1A1A]/40">No hay gift cards activas.</p>
            : activas.map(gc => <React.Fragment key={gc.id}><GcCard gc={gc} /></React.Fragment>)
          }
        </div>
      </section>

      {/* ── LISTADO INACTIVAS / HISTORIAL ─────────── */}
      {inactivas.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-serif text-2xl italic text-[#1A1A1A]/50">
            Historial
            <span className="ml-2 text-sm font-sans font-normal not-italic">({inactivas.length})</span>
          </h3>
          <div className="border border-[#C9B8A8]/30 bg-white/60 backdrop-blur-sm rounded-xl divide-y divide-[#C9B8A8]/10 overflow-hidden opacity-70">
            {inactivas.map(gc => <React.Fragment key={gc.id}><GcCard gc={gc} /></React.Fragment>)}
          </div>
        </section>
      )}

      {/* ── MODAL EDITAR ──────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/97 backdrop-blur-md p-8 border border-[#C9B8A8]/50 rounded-2xl w-full max-w-md relative shadow-2xl">
            <button
              onClick={() => setEditing(null)}
              className="absolute top-4 right-4 p-2 hover:bg-[#C9B8A8]/20 rounded-lg transition-colors text-[#1A1A1A]"
            >
              <X size={18} />
            </button>

            <h3 className="font-serif text-2xl italic mb-1 text-[#1A1A1A]">Editar Gift Card</h3>
            <p className="text-[10px] uppercase tracking-[3px] text-[#1A1A1A]/40 mb-6">{editing.codigo}</p>

            <form onSubmit={handleEditSubmit} className="space-y-5">

              {/* Destinatario */}
              <div>
                <label className="text-[10px] tracking-[3px] uppercase font-medium text-[#1A1A1A]">Destinatario</label>
                <input
                  value={editing.destinatario}
                  onChange={(e) => setEditing({ ...editing, destinatario: e.target.value })}
                  className="w-full border-b-2 border-[#C9B8A8]/40 py-2.5 focus:outline-none focus:border-[#C9B8A8] text-[#1A1A1A] transition-colors"
                />
              </div>

              {/* Monto inicial */}
              <div>
                <label className="text-[10px] tracking-[3px] uppercase font-medium text-[#1A1A1A]">Monto Inicial</label>
                <div className="flex items-center border-b-2 border-[#C9B8A8]/40 focus-within:border-[#C9B8A8] transition-colors">
                  <span className="text-sm font-bold pr-1 text-[#1A1A1A]/40">$</span>
                  <input
                    type="text"
                    value={editing.montoInicial === 0 ? '' : editing.montoInicial}
                    onChange={(e) => setEditingMontoInicial(toInt(e.target.value))}
                    className="w-full py-2.5 focus:outline-none text-[#1A1A1A]"
                  />
                </div>
                <p className="text-[9px] text-[#1A1A1A]/40 mt-1 uppercase tracking-wide">
                  Modificar el monto recalcula el saldo automáticamente
                </p>
              </div>

              {/* Saldo actual */}
              <div>
                <label className="text-[10px] tracking-[3px] uppercase font-medium text-[#1A1A1A]">
                  Saldo Actual
                  <span className="ml-2 font-normal normal-case tracking-normal text-[#1A1A1A]/40">(editable para correcciones)</span>
                </label>
                <div className="flex items-center border-b-2 border-[#C9B8A8]/40 focus-within:border-[#C9B8A8] transition-colors">
                  <span className="text-sm font-bold pr-1 text-[#1A1A1A]/40">$</span>
                  <input
                    type="text"
                    value={editing.saldo === 0 ? '' : editing.saldo}
                    onChange={(e) => setEditingSaldo(toInt(e.target.value))}
                    className="w-full py-2.5 focus:outline-none text-[#1A1A1A]"
                    placeholder="0"
                  />
                </div>
                <p className="text-[9px] text-[#1A1A1A]/40 mt-1 uppercase tracking-wide">
                  Máx: ${editing.montoInicial.toLocaleString()} — No puede superar el monto inicial
                </p>
              </div>

              {/* Estado */}
              <div>
                <label className="text-[10px] tracking-[3px] uppercase font-medium text-[#1A1A1A] block mb-2">Estado</label>
                <div className="flex gap-2">
                  {((['ACTIVA', 'AGOTADA', 'ANULADA'] as GiftCard['estado'][]).map(est => {
                    const cfg = estadoConfig[est];
                    const Icon = cfg.icon;
                    const selected = editing.estado === est;
                    return (
                      <button
                        key={est}
                        type="button"
                        onClick={() => setEditing({ ...editing, estado: est })}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[9px] uppercase tracking-widest font-bold rounded-lg border transition-all ${
                          selected
                            ? cfg.color + ' shadow-sm'
                            : 'border-[#C9B8A8]/30 text-[#1A1A1A]/40 hover:border-[#C9B8A8]'
                        }`}
                      >
                        <Icon size={12} />
                        {cfg.label}
                      </button>
                    );
                  }))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#C9B8A8] text-[#1A1A1A] py-4 text-[11px] tracking-[3px] uppercase font-medium shadow-md hover:bg-[#B8A696] transition-all rounded-lg hover:shadow-lg"
              >
                Guardar cambios
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GiftCards;