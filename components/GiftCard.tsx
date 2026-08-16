import React from 'react';
import { GiftCard } from '../types';
import { Plus, Trash2, Edit2, X, Gift, CheckCircle, XCircle, AlertCircle, Copy, Check } from 'lucide-react';
import { DESCUENTO_BASE_TRANSFERENCIA } from '../services/exchangePricing';

interface GiftCardsProps {
  giftCards: GiftCard[];
  onAddGiftCard: (data: { destinatario: string; montoInicial: number; pago?: { efectivo: number; tarjeta: number }; email?: string; mensaje?: string; deParteDe?: string; emailComprador?: string }) => void;
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
  const [email, setEmail] = React.useState('');
  const [mensaje, setMensaje] = React.useState('');
  const [deParteDe, setDeParteDe] = React.useState('');
  const [emailComprador, setEmailComprador] = React.useState('');
  const [editing, setEditing] = React.useState<GiftCard | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  
  // Búsqueda
  const [searchTerm, setSearchTerm] = React.useState('');

  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

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
      pago: { efectivo: pagoEfectivo, tarjeta: pagoTarjeta },
      email: email.trim(),
      mensaje: mensaje.trim(),
      deParteDe: deParteDe.trim(),
      emailComprador: emailComprador.trim()
    });
    setDestinatario('');
    setMonto(0);
    setPagoEfectivo(100);
    setPagoTarjeta(0);
    setEmail('');
    setMensaje('');
    setDeParteDe('');
    setEmailComprador('');
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
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-[#1A1A1A]/70 font-mono font-bold bg-[#C9B8A8]/10 px-2 py-0.5 rounded border border-[#C9B8A8]/30 tracking-wider select-all">
              {gc.codigo}
            </span>
            <button
              onClick={() => handleCopy(gc.codigo)}
              className="p-1 text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-[#C9B8A8]/20 rounded transition-all flex items-center justify-center"
              title="Copiar código"
            >
              {copiedCode === gc.codigo ? (
                <span className="text-[9px] uppercase tracking-wider text-emerald-600 font-bold flex items-center gap-1">
                  <Check size={12} /> ¡Copiado!
                </span>
              ) : (
                <Copy size={12} />
              )}
            </button>
          </div>

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
      <header className="border-b border-stone-200/60 pb-3">
        <h2 className="font-serif text-2xl italic font-normal text-stone-900">Gift Cards</h2>
        <p className="text-[9px] tracking-[0.18em] uppercase font-light text-stone-400 mt-0.5">
          Administración de tarjetas y registros contables
        </p>
      </header>

      {/* ── CREAR ─────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-stone-200/60 rounded-2xl p-6 space-y-5 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.02)] max-w-xl transition-all duration-200 ease-out hover:border-stone-300 hover:shadow-[0_8px_30px_-5px_rgba(0,0,0,0.05)]"
      >
        <div className="flex items-center gap-3">
          <Gift className="text-stone-800" size={18} strokeWidth={1.5} />
          <h3 className="font-serif text-xl italic text-stone-900">Nueva Gift Card</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400">Destinatario</label>
            <input
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              className="w-full border-b border-stone-200/80 py-2 bg-transparent focus:outline-none focus:border-stone-500 text-stone-900 text-xs transition-colors placeholder:text-stone-400"
              placeholder="Nombre del destinatario"
            />
          </div>
          <div>
            <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400">Monto inicial</label>
            <div className="flex items-center border-b border-stone-200/80 focus-within:border-stone-500 transition-colors">
              <span className="text-xs font-mono font-medium pr-1 text-stone-400">$</span>
              <input
                type="text"
                value={monto === 0 ? '' : monto}
                onChange={(e) => setMonto(toInt(e.target.value))}
                className="w-full py-2 bg-transparent focus:outline-none text-stone-900 text-xs font-mono placeholder:text-stone-400"
                placeholder="0"
              />
            </div>
          </div>

          <div className="col-span-2 md:col-span-1">
            <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400">De parte de (Opcional)</label>
            <input
              value={deParteDe}
              onChange={(e) => setDeParteDe(e.target.value)}
              className="w-full border-b border-stone-200/80 py-2 bg-transparent focus:outline-none focus:border-stone-500 text-stone-900 text-xs transition-colors placeholder:text-stone-400"
              placeholder="Tu nombre"
            />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400">Email comprador (Opcional)</label>
            <input
              type="email"
              value={emailComprador}
              onChange={(e) => setEmailComprador(e.target.value)}
              className="w-full border-b border-stone-200/80 py-2 bg-transparent focus:outline-none focus:border-stone-500 text-stone-900 text-xs transition-colors placeholder:text-stone-400"
              placeholder="Para enviar comprobante"
            />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400">Email destinatario (Opcional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-b border-stone-200/80 py-2 bg-transparent focus:outline-none focus:border-stone-500 text-stone-900 text-xs transition-colors placeholder:text-stone-400"
              placeholder="Para enviar por email"
            />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400">Mensaje (Opcional)</label>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              className="w-full border-b border-stone-200/80 py-2 bg-transparent focus:outline-none focus:border-stone-500 text-stone-900 text-xs transition-colors placeholder:text-stone-400 resize-none h-10"
              placeholder="Escribí un mensaje lindo"
            />
          </div>

          {/* Selector de Medios de Pago */}
          <div className="col-span-2 border-t border-stone-100 pt-3 space-y-3">
            <p className="text-[9px] uppercase font-semibold tracking-[0.18em] text-stone-400">Medio de Pago</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] text-stone-500 font-medium">Efectivo %</label>
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
                  className="w-full border-b border-stone-200/80 py-1 bg-transparent focus:outline-none focus:border-stone-500 text-xs text-stone-900 font-mono font-medium"
                />
              </div>
              <div>
                <label className="text-[9px] text-stone-500 font-medium">Tarjeta %</label>
                <input
                  type="number"
                  value={pagoTarjeta}
                  readOnly
                  className="w-full border-b border-stone-200/80 py-1 bg-stone-50 focus:outline-none text-xs text-stone-900 font-mono font-medium"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setPagoEfectivo(100); setPagoTarjeta(0); }}
                className="text-[9px] uppercase underline hover:text-stone-900 text-stone-500 font-medium tracking-wider"
              >
                100% Efectivo
              </button>
              <button
                type="button"
                onClick={() => { setPagoEfectivo(0); setPagoTarjeta(100); }}
                className="text-[9px] uppercase underline hover:text-stone-900 text-stone-500 font-medium tracking-wider"
              >
                100% Tarjeta
              </button>
            </div>
          </div>

          {/* Total a Cobrar Display */}
          {monto > 0 && (
            <div className="col-span-2 bg-stone-50 rounded-xl p-3.5 flex items-center justify-between border border-stone-200/60 mt-1">
              <span className="text-[9px] uppercase font-medium tracking-[0.18em] text-stone-500">Total a cobrar al cliente:</span>
              <span className="text-lg font-serif italic font-normal text-stone-900">
                ${Math.round(monto * (pagoEfectivo / 100) + (monto * (pagoTarjeta / 100)) / (1 - DESCUENTO_BASE_TRANSFERENCIA / 100)).toLocaleString('es-AR')}
              </span>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!destinatario.trim() || monto <= 0}
          className="bg-stone-900 text-white px-5 py-3 text-[10px] tracking-[0.2em] font-medium uppercase flex items-center gap-2 hover:bg-black transition-all duration-200 ease-out rounded-xl shadow-xs hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={14} strokeWidth={1.5} /> Crear e informar venta
        </button>
      </form>

      {/* ── BUSCADOR ─────────────────────────────────── */}
      <div className="max-w-xl">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar gift card por nombre o código..."
          className="w-full border border-stone-200/80 rounded-xl p-3 text-xs text-stone-900 bg-white outline-none focus:border-stone-400 shadow-2xs hover:border-stone-300 transition-all duration-200"
        />
      </div>
      <section className="space-y-3">
        <h3 className="font-serif text-2xl italic text-stone-900">
          Activas
          {activas.length > 0 && (
            <span className="ml-2 text-sm font-sans font-normal text-stone-400 not-italic">({activas.length})</span>
          )}
        </h3>
        <div className="border border-stone-200/60 bg-white rounded-2xl divide-y divide-stone-100 shadow-2xs overflow-hidden">
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