import React from 'react';
import { X, Gift, Send, CreditCard, Landmark, Loader2, CheckCircle, Copy, Check, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useModal } from '../contexts/ModalContext';
import { reserveWebOrderStock } from '../services/webOrderFulfillment';
import { createUalaPayment } from '../services/ualaApi';
import { collection, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { DESCUENTO_BASE_TRANSFERENCIA } from '../services/exchangePricing';
import { WebSettings } from '../types';

import { getShowroomID } from '../services/storage';

const PUBLIC_SHOWROOM_ID = getShowroomID();

interface BuyGiftCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onRequireAuth?: () => void;
  webSettings?: WebSettings;
}

const PRESET_AMOUNTS = [80000, 100000, 150000, 180000];
const PRESET_MESSAGES = [
  "¡Feliz Cumpleaños! Que lo disfrutes mucho.",
  "¡Felicidades! Un pequeño mimo para vos.",
  "Gracias por todo. ¡Te lo merecés!",
  "¡Disfrutá tu regalo!"
];

const BuyGiftCardModal: React.FC<BuyGiftCardModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  onRequireAuth,
  webSettings 
}) => {
  const { user, customerProfile } = useAuth();
  const { showAlert } = useModal();

  const [step, setStep] = React.useState<'form' | 'payment' | 'success'>('form');
  const [monto, setMonto] = React.useState<number>(PRESET_AMOUNTS[0]);
  const [customMonto, setCustomMonto] = React.useState<string>('');

  const [destinatario, setDestinatario] = React.useState('');
  const [emailDestinatario, setEmailDestinatario] = React.useState('');
  const [deParteDe, setDeParteDe] = React.useState('');
  const [mensaje, setMensaje] = React.useState('');
  
  const [paymentMethod, setPaymentMethod] = React.useState<'transferencia' | 'tarjeta'>('transferencia');
  const [isLoading, setIsLoading] = React.useState(false);
  const [placedOrderId, setPlacedOrderId] = React.useState<string | null>(null);

  const [copiedCbu, setCopiedCbu] = React.useState(false);
  const [copiedAlias, setCopiedAlias] = React.useState(false);
  const [copiedOrderId, setCopiedOrderId] = React.useState(false);

  const titular = webSettings?.bankTitular?.trim() || 'EL ROPERO';
  const cbu = webSettings?.bankCbu?.trim() || (webSettings as any)?.cbuData?.trim() || '0000003100084729182736';
  const alias = webSettings?.bankAlias?.trim() || webSettings?.mercadoPagoAlias?.trim() || 'elropero.showroom';
  const banco = webSettings?.bankName?.trim() || '';
  const whatsappNumber = webSettings?.contactWhatsapp?.replace(/\D/g, '') || '5492346685836';
  const storeName = webSettings?.storeName?.trim() || 'EL ROPERO';

  React.useEffect(() => {
    if (isOpen) {
      setStep('form');
      setMonto(PRESET_AMOUNTS[0]);
      setCustomMonto('');
      setDestinatario('');
      setEmailDestinatario('');
      setMensaje('');
      setIsLoading(false);
      setPlacedOrderId(null);
      setCopiedCbu(false);
      setCopiedAlias(false);
      setCopiedOrderId(false);
      if (customerProfile?.nombre) {
        setDeParteDe(customerProfile.nombre);
      } else if (user?.displayName) {
        setDeParteDe(user.displayName);
      } else {
        setDeParteDe('');
      }
    }
  }, [isOpen, customerProfile, user]);

  const handleNext = () => {
    if (!user) {
      showAlert('Debés estar registrado e iniciar sesión para comprar una Gift Card.', 'Registro Requerido', 'warning');
      if (onRequireAuth) onRequireAuth();
      return;
    }

    const finalMonto = customMonto ? parseInt(customMonto, 10) : monto;
    if (!finalMonto || finalMonto < 5000) {
      showAlert('El monto mínimo para la Gift Card es de $5.000', 'Monto inválido', 'warning');
      return;
    }
    if (!destinatario.trim() || !emailDestinatario.trim() || !deParteDe.trim()) {
      showAlert('Por favor completá los datos principales (Destinatario, Email y Tu Nombre).', 'Datos incompletos', 'warning');
      return;
    }
    setStep('payment');
  };

  const finalMonto = customMonto ? parseInt(customMonto, 10) : monto;
  const finalPrice = paymentMethod === 'transferencia' 
    ? finalMonto
    : Math.round(finalMonto / (1 - (DESCUENTO_BASE_TRANSFERENCIA / 100)));

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
    const orderDisplayId = placedOrderId ? (placedOrderId.startsWith('#') ? placedOrderId.toUpperCase() : `#${placedOrderId.toUpperCase()}`) : '';
    const totalDisplay = `$${finalPrice.toLocaleString('es-AR')}`;
    
    let msg = `Hola ${storeName}! Acabo de registrar la compra de una Gift Card ${orderDisplayId} por transferencia bancaria`;
    msg += ` por un total de ${totalDisplay} para ${destinatario.trim().toUpperCase()}.`;
    msg += ` Les adjunto el comprobante de pago para su confirmación. ¡Muchas gracias!`;

    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePay = async () => {
    if (!user) {
      showAlert('Debés estar registrado e iniciar sesión para comprar una Gift Card.', 'Registro Requerido', 'warning');
      if (onRequireAuth) onRequireAuth();
      return;
    }

    setIsLoading(true);
    try {
      const orderItems = [{
        productId: `virtual_gift_card_${Date.now()}`,
        descripcion: `Gift Card para ${destinatario.trim().toUpperCase()}`,
        sku: 'GIFT-CARD',
        cantidad: 1,
        precioUnitario: finalMonto,
        isVirtualGiftCard: true,
        giftCardData: {
          destinatario: destinatario.trim().toUpperCase(),
          email: emailDestinatario.trim().toLowerCase(),
          deParteDe: deParteDe.trim().toUpperCase(),
          mensaje: mensaje.trim()
        }
      }];

      const orderData = {
        customerId: user.uid,
        customerEmail: user.email || '',
        customerNombre: deParteDe.trim().toUpperCase(),
        customerTelefono: '',
        fecha: new Date().toISOString(),
        items: orderItems,
        total: finalPrice, 
        tipoEnvio: 'retiro',
        metodoPago: paymentMethod === 'transferencia' ? 'Transferencia' : 'Tarjeta / Ualá Bis',
        pago: paymentMethod === 'transferencia' ? { efectivo: 100, tarjeta: 0 } : { efectivo: 0, tarjeta: 100 },
        ualaPlan: null,
        estado: 'Pendiente' as const
      };

      const ordersCol = collection(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'orders');
      const orderRef = doc(ordersCol);
      const orderId = orderRef.id;

      let redirectUrl: string | null = null;
      let ualaPaymentId: string | null = null;

      if (paymentMethod === 'tarjeta') {
        const successUrl = `${window.location.origin}/?pago=ok&orderId=${orderId}`;
        const failUrl = `${window.location.origin}/?pago=error&orderId=${orderId}`;
        
        const orderForUala = {
          id: orderId,
          total: finalPrice,
          customerEmail: orderData.customerEmail || emailDestinatario.trim().toLowerCase(),
          customerNombre: orderData.customerNombre,
          customerTelefono: '1100000000',
        };

        const ualaPayment = await createUalaPayment(orderForUala, successUrl, failUrl);
        redirectUrl = ualaPayment.paymentUrl;
        ualaPaymentId = ualaPayment.paymentId;
      }

      const finalOrderData = {
        ...orderData,
        orderId: orderId,
        showroomId: PUBLIC_SHOWROOM_ID,
        ualaPaymentId: ualaPaymentId,
        ualaPaymentUrl: redirectUrl
      };

      await reserveWebOrderStock(PUBLIC_SHOWROOM_ID, orderId, finalOrderData);

      try {
        localStorage.setItem('ropero_last_pending_order', JSON.stringify(finalOrderData));
      } catch (storageErr) {
        console.error('Error al guardar orden pendiente en localStorage:', storageErr);
      }

      setPlacedOrderId(orderId);
      setStep('success');
      
      if (paymentMethod === 'tarjeta' && redirectUrl) {
        window.location.href = redirectUrl;
      }

    } catch (e: any) {
      console.error(e);
      showAlert('Hubo un error al iniciar la compra de la Gift Card. Intentá de nuevo.', 'Error', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 font-['Inter'] select-none">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-lg rounded-none shadow-2xl overflow-hidden flex flex-col animate-in fade-in duration-200 border border-black/10">
        
        <div className="flex items-center justify-between p-5 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <Gift size={16} strokeWidth={1.2} className="text-black" />
            <span className="text-[11px] tracking-[0.25em] uppercase font-light text-black">Regalar Gift Card</span>
          </div>
          <button onClick={onClose} className="opacity-40 hover:opacity-100 transition-opacity">
            <X size={16} strokeWidth={1.2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 max-h-[80vh]">
          {!user ? (
            <div className="py-8 text-center space-y-4">
              <Gift size={40} strokeWidth={1} className="mx-auto text-neutral-400" />
              <h3 className="text-sm font-light uppercase tracking-[0.2em]">Registro Requerido</h3>
              <p className="text-[11px] font-light text-neutral-500 max-w-xs mx-auto leading-relaxed uppercase">
                Para comprar una Gift Card es necesario estar registrado e iniciar sesión en la web.
              </p>
              <button
                onClick={() => {
                  onClose();
                  if (onRequireAuth) onRequireAuth();
                }}
                className="px-6 py-3 bg-black text-white text-[10px] tracking-[0.25em] uppercase font-light hover:bg-neutral-800 transition-all rounded-none"
              >
                Iniciar Sesión / Registrarse
              </button>
            </div>
          ) : (
            <>
              {step === 'form' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-[9px] tracking-[0.25em] uppercase font-light text-neutral-500 mb-2.5">Monto del Regalo</label>
                    <div className="grid grid-cols-2 gap-2 mb-2.5">
                      {PRESET_AMOUNTS.map(amt => (
                        <button
                          key={amt}
                          onClick={() => { setMonto(amt); setCustomMonto(''); }}
                          className={`py-2.5 border rounded-none text-xs tracking-wider font-light transition-all ${!customMonto && monto === amt ? 'bg-black text-white border-black' : 'bg-white text-black border-neutral-300 hover:border-black'}`}
                        >
                          ${amt.toLocaleString('es-AR')}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">$</span>
                      <input
                        type="number"
                        value={customMonto}
                        onChange={(e) => { setCustomMonto(e.target.value); setMonto(0); }}
                        placeholder="Otro monto..."
                        className="w-full bg-white border border-neutral-300 rounded-none py-2 pl-7 pr-3 text-xs tracking-wide focus:outline-none focus:border-black transition-all placeholder:text-neutral-300 font-light"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-neutral-100">
                    <label className="block text-[9px] tracking-[0.25em] uppercase font-light text-neutral-500">Datos del Destinatario</label>
                    
                    <div>
                      <input
                        type="text"
                        value={destinatario}
                        onChange={(e) => setDestinatario(e.target.value)}
                        placeholder="Nombre y Apellido de quien recibe"
                        className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black uppercase tracking-wider transition-all placeholder:text-neutral-300"
                      />
                    </div>
                    <div>
                      <input
                        type="email"
                        value={emailDestinatario}
                        onChange={(e) => setEmailDestinatario(e.target.value)}
                        placeholder="Email de quien recibe"
                        className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-wider transition-all placeholder:text-neutral-300"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={deParteDe}
                        onChange={(e) => setDeParteDe(e.target.value)}
                        placeholder="Tu Nombre (De parte de...)"
                        className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black uppercase tracking-wider transition-all placeholder:text-neutral-300"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-neutral-100">
                    <label className="block text-[9px] tracking-[0.25em] uppercase font-light text-neutral-500">Mensaje Personalizado</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_MESSAGES.map((msg, i) => (
                        <button
                          key={i}
                          onClick={() => setMensaje(msg)}
                          className={`px-2.5 py-1 rounded-none text-[9px] tracking-wider uppercase border transition-all ${mensaje === msg ? 'bg-black border-black text-white font-light' : 'bg-white border-neutral-200 text-neutral-500 hover:border-black'}`}
                        >
                          {msg}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={mensaje}
                      onChange={(e) => setMensaje(e.target.value)}
                      placeholder="Escribí un mensaje..."
                      rows={2}
                      className="w-full bg-white border border-neutral-200 rounded-none p-2.5 text-[11px] font-light focus:outline-none focus:border-black transition-all resize-none mt-1.5 placeholder:text-neutral-300"
                    />
                  </div>

                  <button
                    onClick={handleNext}
                    className="w-full bg-black text-white py-3 rounded-none text-[10px] tracking-[0.25em] uppercase font-light flex items-center justify-center gap-2 hover:bg-neutral-800 transition-all mt-4"
                  >
                    Continuar al Pago <Send size={13} strokeWidth={1.2} />
                  </button>
                </div>
              )}

              {step === 'payment' && (
                <div className="space-y-5">
                  <div className="bg-neutral-50 rounded-none p-5 text-center border border-neutral-200">
                    <p className="text-[9px] tracking-[0.25em] uppercase text-neutral-400 mb-1">Valor de la Gift Card</p>
                    <p className="text-2xl font-light text-black tracking-wide">${finalMonto.toLocaleString('es-AR')}</p>
                    <p className="text-[11px] text-neutral-600 mt-1 uppercase font-light">Para: <strong className="font-normal">{destinatario}</strong></p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[9px] tracking-[0.25em] uppercase font-light text-neutral-400">Método de Pago</label>
                    
                    <button
                      onClick={() => setPaymentMethod('transferencia')}
                      className={`w-full flex items-center justify-between p-3.5 rounded-none border transition-all ${paymentMethod === 'transferencia' ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white hover:border-black text-black'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Landmark size={18} strokeWidth={1.2} className={paymentMethod === 'transferencia' ? 'text-white' : 'text-neutral-500'} />
                        <div className="text-left">
                          <p className="text-[10px] tracking-[0.2em] uppercase font-light">Transferencia / Dinero en cuenta</p>
                          <p className={`text-[9px] uppercase tracking-wider ${paymentMethod === 'transferencia' ? 'text-white/70' : 'text-neutral-400'}`}>Precio Efectivo</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-light tracking-wide">${finalMonto.toLocaleString('es-AR')}</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setPaymentMethod('tarjeta')}
                      className={`w-full flex items-center justify-between p-3.5 rounded-none border transition-all ${paymentMethod === 'tarjeta' ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white hover:border-black text-black'}`}
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard size={18} strokeWidth={1.2} className={paymentMethod === 'tarjeta' ? 'text-white' : 'text-neutral-500'} />
                        <div className="text-left">
                          <p className="text-[10px] tracking-[0.2em] uppercase font-light">Tarjetas de Crédito / Débito</p>
                          <p className={`text-[9px] uppercase tracking-wider ${paymentMethod === 'tarjeta' ? 'text-white/70' : 'text-neutral-400'}`}>Precio de Lista</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-light tracking-wide">${Math.round(finalMonto / (1 - (DESCUENTO_BASE_TRANSFERENCIA / 100))).toLocaleString('es-AR')}</p>
                      </div>
                    </button>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-neutral-100">
                    <button
                      onClick={() => setStep('form')}
                      className="px-5 py-3 rounded-none text-[10px] tracking-[0.2em] uppercase font-light text-black border border-neutral-300 hover:border-black transition-all"
                    >
                      Volver
                    </button>
                    <button
                      onClick={handlePay}
                      disabled={isLoading}
                      className="flex-1 bg-black text-white py-3 rounded-none text-[10px] tracking-[0.25em] uppercase font-light flex items-center justify-center gap-2 hover:bg-neutral-800 transition-all disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 size={14} className="animate-spin" /> : (paymentMethod === 'transferencia' ? 'Confirmar y Ver Datos Bancarios' : 'Pagar con Tarjeta')}
                    </button>
                  </div>
                </div>
              )}

              {step === 'success' && (
                paymentMethod === 'tarjeta' ? (
                  <div className="py-8 text-center space-y-3">
                    <Gift size={48} strokeWidth={1} className="mx-auto text-black" />
                    <h3 className="text-base font-light uppercase tracking-[0.2em]">¡Redirigiendo al Pago!</h3>
                    <p className="text-[11px] font-light text-neutral-500 max-w-xs mx-auto leading-relaxed">
                      Se abrirá la ventana de Ualá Bis para completar el pago. Al confirmarse, <strong>{destinatario}</strong> recibirá su Gift Card digital por email.
                    </p>
                    <button
                      onClick={() => { onClose(); onSuccess(); }}
                      className="mt-6 px-6 py-2.5 bg-black text-white rounded-none text-[10px] tracking-[0.2em] uppercase font-light hover:bg-neutral-800 transition-all"
                    >
                      Cerrar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Header Éxito Transferencia */}
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
                        <CheckCircle size={24} strokeWidth={1.4} />
                      </div>
                      <p className="text-[9px] tracking-[0.25em] uppercase font-light text-neutral-400">Gift Card Registrada</p>
                      <h3 className="text-base font-light uppercase tracking-[0.2em] text-black">
                        ¡Pedido Registrado con Éxito!
                      </h3>
                      <p className="text-[11px] text-neutral-500 font-light leading-relaxed max-w-xs mx-auto">
                        Para enviar la Gift Card a <strong>{destinatario}</strong> ({emailDestinatario}), realizá la transferencia y envianos el comprobante por WhatsApp.
                      </p>
                    </div>

                    {/* Banner Temporizador 24h */}
                    <div className="bg-amber-50/70 border border-amber-200/80 p-3.5 flex items-start gap-3 text-amber-900 rounded-none">
                      <Clock size={16} className="mt-0.5 flex-shrink-0 text-amber-700 animate-pulse" strokeWidth={1.5} />
                      <div className="space-y-0.5">
                        <p className="text-[9px] tracking-[0.15em] uppercase font-semibold text-amber-900">
                          Tenés 24 horas para transferir
                        </p>
                        <p className="text-[9px] leading-relaxed font-light text-amber-800/90">
                          La Gift Card se activará y enviará al destinatario apenas confirmemos el comprobante de pago.
                        </p>
                      </div>
                    </div>

                    {/* Resumen del Pedido */}
                    <div className="grid grid-cols-2 gap-2 text-left">
                      <div className="bg-neutral-50 border border-neutral-200/70 p-3">
                        <p className="text-[8px] tracking-[0.2em] uppercase font-light text-neutral-400 mb-0.5">Pedido</p>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-medium text-black">
                            {placedOrderId ? (placedOrderId.startsWith('#') ? placedOrderId.toUpperCase() : `#${placedOrderId.toUpperCase().slice(0, 10)}`) : 'REGISTRADO'}
                          </span>
                          {placedOrderId && (
                            <button
                              onClick={() => copyToClipboard(placedOrderId, 'orderId')}
                              className="text-[8px] uppercase tracking-wider text-neutral-500 hover:text-black"
                              title="Copiar ID"
                            >
                              {copiedOrderId ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="bg-neutral-50 border border-neutral-200/70 p-3">
                        <p className="text-[8px] tracking-[0.2em] uppercase font-light text-neutral-400 mb-0.5">Total a Transferir</p>
                        <span className="font-mono text-xs font-semibold text-emerald-700">
                          ${finalPrice.toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>

                    {/* Datos Bancarios */}
                    <div className="bg-white border border-neutral-200/80 p-4 space-y-2.5 text-left">
                      <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                        <Landmark size={14} strokeWidth={1.3} className="text-neutral-500" />
                        <span className="text-[9px] tracking-[0.2em] uppercase font-medium text-black">
                          Datos para la Transferencia
                        </span>
                      </div>

                      <div className="space-y-2 text-[10px]">
                        <div className="flex justify-between items-center py-1 border-b border-neutral-100/70">
                          <span className="text-[8px] tracking-[0.15em] uppercase text-neutral-400">Titular</span>
                          <span className="font-normal text-black uppercase tracking-wider">{titular}</span>
                        </div>

                        {banco && (
                          <div className="flex justify-between items-center py-1 border-b border-neutral-100/70">
                            <span className="text-[8px] tracking-[0.15em] uppercase text-neutral-400">Banco</span>
                            <span className="font-normal text-black uppercase tracking-wider">{banco}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center py-1 border-b border-neutral-100/70">
                          <div>
                            <span className="block text-[8px] tracking-[0.15em] uppercase text-neutral-400">Alias</span>
                            <span className="font-mono text-[11px] font-medium text-black">{alias}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(alias, 'alias')}
                            className="border border-neutral-300 hover:border-black px-2 py-1 text-[8px] uppercase tracking-wider text-black font-light flex items-center gap-1 transition-all"
                          >
                            {copiedAlias ? <><Check size={10} className="text-emerald-500" /> Copiado</> : <><Copy size={10} /> Copiar Alias</>}
                          </button>
                        </div>

                        <div className="flex justify-between items-center py-1">
                          <div>
                            <span className="block text-[8px] tracking-[0.15em] uppercase text-neutral-400">CBU / CVU</span>
                            <span className="font-mono text-[11px] font-medium text-black break-all">{cbu}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(cbu, 'cbu')}
                            className="border border-neutral-300 hover:border-black px-2 py-1 text-[8px] uppercase tracking-wider text-black font-light flex items-center gap-1 transition-all"
                          >
                            {copiedCbu ? <><Check size={10} className="text-emerald-500" /> Copiado</> : <><Copy size={10} /> Copiar CBU</>}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="space-y-2 pt-2">
                      <button
                        onClick={handleSendWhatsApp}
                        className="w-full bg-black text-white hover:bg-neutral-800 py-3 px-6 text-[9px] tracking-[0.25em] uppercase font-light transition-all flex items-center justify-center gap-2 rounded-none"
                      >
                        <Send size={12} strokeWidth={1.3} />
                        <span>Enviar Comprobante por WhatsApp</span>
                      </button>

                      <button
                        onClick={() => { onClose(); onSuccess(); }}
                        className="w-full bg-transparent border border-neutral-300 hover:border-black text-black py-2.5 px-6 text-[8px] tracking-[0.25em] uppercase font-light transition-all rounded-none"
                      >
                        Cerrar y Volver a la Tienda
                      </button>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BuyGiftCardModal;
