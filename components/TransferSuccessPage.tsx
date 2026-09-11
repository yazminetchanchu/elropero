import React from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, Clock, Copy, Check, Send, Landmark, ArrowLeft, ShieldCheck } from 'lucide-react';
import { WebSettings } from '../types';

interface TransferSuccessPageProps {
  webSettings: WebSettings;
}

export const TransferSuccessPage: React.FC<TransferSuccessPageProps> = ({ webSettings }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const orderId = searchParams.get('orderId') || '';
  
  // Obtener datos guardados de la orden desde localStorage si existen
  const [orderData] = React.useState<any | null>(() => {
    try {
      const saved = localStorage.getItem('ropero_last_pending_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!orderId || parsed.orderId === orderId || parsed.id === orderId) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error al leer orden pendiente de localStorage:', e);
    }
    return null;
  });

  const [copiedCbu, setCopiedCbu] = React.useState(false);
  const [copiedAlias, setCopiedAlias] = React.useState(false);
  const [copiedOrderId, setCopiedOrderId] = React.useState(false);

  const titular = webSettings?.bankTitular?.trim() || 'Danisa Guzman';
  const cbu = webSettings?.bankCbu?.trim() || (webSettings as any)?.cbuData?.trim() || '0000003100037658598052';
  const alias = webSettings?.bankAlias?.trim() || webSettings?.mercadoPagoAlias?.trim() || 'Danisa.guz.03';
  const rawBank = webSettings?.bankName?.trim();
  const banco = (!rawBank || /santander/i.test(rawBank)) ? 'Mercado Pago' : rawBank;

  const totalAmount = orderData?.total ? Math.round(orderData.total) : null;
  const storeName = webSettings?.storeName?.trim() || 'EL ROPERO';
  const whatsappNumber = webSettings?.contactWhatsapp?.replace(/\D/g, '') || '5492346685836';

  const copyToClipboard = (text: string, type: 'cbu' | 'alias' | 'orderId') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === 'cbu') {
      setCopiedCbu(true);
      setTimeout(() => setCopiedCbu(false), 2000);
    } else if (type === 'alias') {
      setCopiedAlias(true);
      setTimeout(() => setCopiedAlias(false), 2000);
    } else if (type === 'orderId') {
      setCopiedOrderId(true);
      setTimeout(() => setCopiedOrderId(false), 2000);
    }
  };

  const handleSendWhatsApp = () => {
    const orderDisplayId = orderId ? (orderId.startsWith('#') ? orderId.toUpperCase() : `#${orderId.toUpperCase()}`) : '';
    const totalDisplay = totalAmount ? `$${totalAmount.toLocaleString('es-AR')}` : '';
    
    let msg = `Hola ${storeName}! Acabo de registrar mi pedido ${orderDisplayId} por transferencia bancaria`;
    if (totalDisplay) {
      msg += ` por un total de ${totalDisplay}`;
    }
    msg += `. Les adjunto el comprobante de pago para su confirmación. ¡Muchas gracias!`;

    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-neutral-900 font-['Inter'] flex flex-col justify-between selection:bg-black selection:text-white">
      {/* Top Header Minimalista */}
      <header className="border-b border-neutral-200/70 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase font-light text-neutral-600 hover:text-black transition-colors">
            <ArrowLeft size={14} strokeWidth={1.3} />
            <span>Volver a la tienda</span>
          </Link>
          <span className="text-[12px] tracking-[0.3em] uppercase font-medium text-black">
            {storeName}
          </span>
          <div className="w-20" /> {/* Spacer */}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-5 sm:px-8 py-10 sm:py-14 animate-in fade-in duration-500">
        
        {/* Card Principal */}
        <div className="bg-white border border-neutral-200/80 shadow-sm p-6 sm:p-10 space-y-8">
          
          {/* Header de Éxito */}
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle size={28} strokeWidth={1.4} />
            </div>
            <p className="text-[9px] tracking-[0.3em] uppercase font-light text-neutral-400">Reserva de Compra</p>
            <h1 className="text-xl sm:text-2xl tracking-[0.15em] uppercase font-light text-black">
              ¡Pedido Registrado con Éxito!
            </h1>
            <p className="text-[11px] text-neutral-500 font-light leading-relaxed max-w-md mx-auto">
              Tu pedido ha sido guardado y tus prendas han quedado reservadas a tu nombre. Para completar la compra, realizá la transferencia bancaria con el descuento bonificado.
            </p>
          </div>

          {/* Banner Temporizador de 24 Horas */}
          <div className="bg-amber-50/70 border border-amber-200/80 p-4 sm:p-5 flex items-start gap-3.5 text-amber-900 rounded-none">
            <Clock size={18} className="mt-0.5 flex-shrink-0 text-amber-700 animate-pulse" strokeWidth={1.5} />
            <div className="space-y-1">
              <p className="text-[10px] tracking-[0.2em] uppercase font-semibold text-amber-900">
                Tenés 24 horas para realizar la transferencia
              </p>
              <p className="text-[10px] leading-relaxed font-light text-amber-800/90">
                Tu stock permanecerá reservado durante 24 horas. Recordá enviar el comprobante por WhatsApp antes de que expire el plazo para confirmar tu pedido.
              </p>
            </div>
          </div>

          {/* Resumen del Pedido (ID y Monto Bonificado) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            
            {/* ID Pedido */}
            <div className="bg-neutral-50 border border-neutral-200/70 p-4 space-y-1">
              <p className="text-[8px] tracking-[0.25em] uppercase font-light text-neutral-400">Identificador de Pedido</p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs sm:text-sm font-medium tracking-wider text-black">
                  {orderId ? (orderId.startsWith('#') ? orderId.toUpperCase() : `#${orderId.toUpperCase()}`) : 'REGISTRADO'}
                </span>
                {orderId && (
                  <button
                    onClick={() => copyToClipboard(orderId, 'orderId')}
                    className="text-[9px] tracking-[0.15em] uppercase font-light text-neutral-600 hover:text-black flex items-center gap-1 transition-colors"
                    title="Copiar ID completo"
                  >
                    {copiedOrderId ? (
                      <span className="text-emerald-700 flex items-center gap-1 font-medium"><Check size={11} /> Copiado</span>
                    ) : (
                      <span className="flex items-center gap-1"><Copy size={11} /> Copiar</span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Total con Descuento Bonificado */}
            <div className="bg-neutral-50 border border-neutral-200/70 p-4 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[8px] tracking-[0.25em] uppercase font-light text-neutral-400">Total a Transferir</p>
                <span className="text-[8px] tracking-[0.15em] uppercase bg-black text-white px-1.5 py-0.5 font-light">
                  -20% OFF APLICADO
                </span>
              </div>
              <div className="text-lg sm:text-xl font-normal tracking-wide text-black">
                {totalAmount !== null ? `$${totalAmount.toLocaleString('es-AR')}` : 'Monto bonificado'}
              </div>
            </div>

          </div>

          {/* Tarjeta de Datos Bancarios */}
          <div className="border border-neutral-200 space-y-4 p-5 sm:p-6 bg-white">
            <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Landmark size={16} className="text-black" strokeWidth={1.3} />
              <h2 className="text-[10px] tracking-[0.25em] uppercase font-medium text-black">
                Datos para la Transferencia
              </h2>
            </div>

            <div className="space-y-3.5 text-left text-[11px] font-light">
              
              {/* Titular */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2.5 border-b border-neutral-100/70">
                <span className="text-[8px] tracking-[0.2em] uppercase text-neutral-400">Titular de la cuenta</span>
                <span className="font-normal text-black tracking-wider uppercase text-[11px]">{titular}</span>
              </div>

              {/* Banco si existe */}
              {banco && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2.5 border-b border-neutral-100/70">
                  <span className="text-[8px] tracking-[0.2em] uppercase text-neutral-400">Entidad / Cuenta</span>
                  <span className="font-normal text-black tracking-wider uppercase text-[11px]">{banco}</span>
                </div>
              )}

              {/* Alias */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-neutral-100/70">
                <div>
                  <span className="block text-[8px] tracking-[0.2em] uppercase text-neutral-400">Alias</span>
                  <span className="font-mono text-xs font-medium text-black tracking-wider">{alias}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(alias, 'alias')}
                  className="w-fit border border-black/20 hover:border-black px-3 py-1.5 text-[9px] tracking-[0.15em] uppercase text-black font-light flex items-center gap-1.5 transition-all bg-white hover:bg-black hover:text-white"
                >
                  {copiedAlias ? (
                    <>
                      <Check size={11} className="text-emerald-500" />
                      <span>¡Alias Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Copiar Alias</span>
                    </>
                  )}
                </button>
              </div>

              {/* CBU / CVU */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="block text-[8px] tracking-[0.2em] uppercase text-neutral-400">CBU / CVU</span>
                  <span className="font-mono text-xs font-medium text-black tracking-wider break-all">{cbu}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(cbu, 'cbu')}
                  className="w-fit border border-black/20 hover:border-black px-3 py-1.5 text-[9px] tracking-[0.15em] uppercase text-black font-light flex items-center gap-1.5 transition-all bg-white hover:bg-black hover:text-white"
                >
                  {copiedCbu ? (
                    <>
                      <Check size={11} className="text-emerald-500" />
                      <span>¡CBU Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Copiar CBU</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>

          {/* Botones de Acción */}
          <div className="space-y-3 pt-2">
            
            {/* Botón WhatsApp */}
            <button
              onClick={handleSendWhatsApp}
              className="w-full bg-black text-white hover:bg-neutral-800 py-4 px-6 text-[10px] tracking-[0.25em] uppercase font-light transition-all flex items-center justify-center gap-2.5 shadow-sm rounded-none group"
            >
              <Send size={13} strokeWidth={1.3} className="group-hover:translate-x-0.5 transition-transform" />
              <span>Enviar Comprobante por WhatsApp</span>
            </button>

            {/* Botón Volver a la Tienda */}
            <button
              onClick={() => navigate('/')}
              className="w-full bg-transparent border border-neutral-300 hover:border-black text-black py-3.5 px-6 text-[9px] tracking-[0.25em] uppercase font-light transition-all rounded-none"
            >
              Volver a la Tienda
            </button>

          </div>

          {/* Seguridad y Garantía */}
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-center gap-2 text-neutral-400 text-[9px] tracking-[0.15em] uppercase font-light text-center">
            <ShieldCheck size={13} strokeWidth={1.2} />
            <span>Compra protegida · Confirmación inmediata tras recepción del comprobante</span>
          </div>

        </div>

      </main>

      {/* Footer Minimalista */}
      <footer className="border-t border-neutral-200/60 py-6 text-center text-[9px] tracking-[0.2em] uppercase text-neutral-400 font-light">
        © {new Date().getFullYear()} {storeName} — Todos los derechos reservados
      </footer>
    </div>
  );
};

export default TransferSuccessPage;
