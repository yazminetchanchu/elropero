import React from 'react';
import { X, Gift, Send, CreditCard, Landmark, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useModal } from '../contexts/ModalContext';
import { reserveWebOrderStock } from '../services/webOrderFulfillment';
import { createUalaPayment } from '../services/ualaApi';
import { collection, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { DESCUENTO_BASE_TRANSFERENCIA } from '../services/exchangePricing';

const PUBLIC_SHOWROOM_ID = localStorage.getItem('ropero_showroom_id_v3_2026') || 'EL-ROPERO-DEFAULT';

interface BuyGiftCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PRESET_AMOUNTS = [80000, 100000, 150000, 180000];
const PRESET_MESSAGES = [
  "¡Feliz Cumpleaños! Que lo disfrutes mucho.",
  "¡Felicidades! Un pequeño mimo para vos.",
  "Gracias por todo. ¡Te lo merecés!",
  "¡Disfrutá tu regalo!"
];

const BuyGiftCardModal: React.FC<BuyGiftCardModalProps> = ({ isOpen, onClose, onSuccess }) => {
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
      if (customerProfile) {
        setDeParteDe(customerProfile.nombre || '');
      } else {
        setDeParteDe('');
      }
    }
  }, [isOpen, customerProfile]);

  const handleNext = () => {
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

  const handlePay = async () => {
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
        customerId: user ? user.uid : 'GUEST',
        customerEmail: user ? (user.email || '') : '',
        customerNombre: deParteDe.trim().toUpperCase(),
        customerTelefono: '',
        fecha: new Date().toISOString(),
        items: orderItems,
        total: finalPrice, 
        tipoEnvio: 'retiro',
        metodoPago: paymentMethod === 'transferencia' ? 'Ualá Bis' : 'Ualá Bis',
        ualaPlan: null,
        estado: 'Pendiente' as const
      };

      const ordersCol = collection(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'orders');
      const orderRef = doc(ordersCol);
      const orderId = orderRef.id;

      let redirectUrl: string | null = null;
      let ualaPaymentId: string | null = null;

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

      const finalOrderData = {
        ...orderData,
        orderId: orderId,
        showroomId: PUBLIC_SHOWROOM_ID,
        ualaPaymentId: ualaPaymentId,
        ualaPaymentUrl: redirectUrl
      };

      await reserveWebOrderStock(PUBLIC_SHOWROOM_ID, orderId, finalOrderData);

      setPlacedOrderId(orderId);
      setStep('success');
      
      if (redirectUrl) {
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

      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
        
        <div className="flex items-center justify-between p-6 border-b border-black/5">
          <div className="flex items-center gap-3">
            <Gift size={20} className="text-[#C9B8A8]" />
            <span className="text-[14px] tracking-[3px] uppercase font-bold">Regalar Gift Card</span>
          </div>
          <button onClick={onClose} className="opacity-40 hover:opacity-100 transition-opacity">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 max-h-[80vh]">
          {step === 'form' && (
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] tracking-[2px] uppercase font-semibold text-black/60 mb-3">Monto del Regalo</label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {PRESET_AMOUNTS.map(amt => (
                    <button
                      key={amt}
                      onClick={() => { setMonto(amt); setCustomMonto(''); }}
                      className={`py-3 border rounded-xl text-[14px] font-bold transition-all ${!customMonto && monto === amt ? 'bg-[#111111] text-white border-[#111111] shadow-md' : 'bg-white text-black border-black/10 hover:border-black/30'}`}
                    >
                      ${amt.toLocaleString('es-AR')}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40 font-bold">$</span>
                  <input
                    type="number"
                    value={customMonto}
                    onChange={(e) => { setCustomMonto(e.target.value); setMonto(0); }}
                    placeholder="Otro monto..."
                    className="w-full bg-[#f8f9fa] border border-black/10 rounded-xl py-3 pl-8 pr-4 text-[14px] font-bold focus:outline-none focus:border-[#C9B8A8] transition-all placeholder:font-normal"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-black/5">
                <label className="block text-[10px] tracking-[2px] uppercase font-semibold text-black/60">Datos del Afortunado</label>
                
                <div>
                  <input
                    type="text"
                    value={destinatario}
                    onChange={(e) => setDestinatario(e.target.value)}
                    placeholder="Nombre y Apellido de quien recibe"
                    className="w-full bg-transparent border-b border-black/10 py-2.5 text-[13px] focus:outline-none focus:border-black transition-all"
                  />
                </div>
                <div>
                  <input
                    type="email"
                    value={emailDestinatario}
                    onChange={(e) => setEmailDestinatario(e.target.value)}
                    placeholder="Email de quien recibe (A donde le llegará la tarjeta)"
                    className="w-full bg-transparent border-b border-black/10 py-2.5 text-[13px] focus:outline-none focus:border-black transition-all"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={deParteDe}
                    onChange={(e) => setDeParteDe(e.target.value)}
                    placeholder="Tu Nombre (De parte de...)"
                    className="w-full bg-transparent border-b border-black/10 py-2.5 text-[13px] focus:outline-none focus:border-black transition-all"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-black/5">
                <label className="block text-[10px] tracking-[2px] uppercase font-semibold text-black/60">Frase / Mensaje</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_MESSAGES.map((msg, i) => (
                    <button
                      key={i}
                      onClick={() => setMensaje(msg)}
                      className={`px-3 py-1.5 rounded-full text-[11px] border transition-all ${mensaje === msg ? 'bg-[#F5F1EB] border-[#C9B8A8] text-[#111111] font-semibold' : 'bg-white border-black/10 text-black/60 hover:border-black/30'}`}
                    >
                      {msg}
                    </button>
                  ))}
                </div>
                <textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Escribí un mensaje personalizado..."
                  rows={2}
                  className="w-full bg-[#f8f9fa] border border-black/10 rounded-xl p-3 text-[13px] focus:outline-none focus:border-[#C9B8A8] transition-all resize-none mt-2"
                />
              </div>

              <button
                onClick={handleNext}
                className="w-full bg-[#111111] text-white py-4 rounded-xl text-[12px] tracking-[2px] uppercase font-bold flex items-center justify-center gap-2 hover:bg-black/80 transition-all shadow-lg mt-6"
              >
                Continuar al Pago <Send size={16} />
              </button>
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-6">
              <div className="bg-[#F5F1EB] rounded-xl p-6 text-center border border-[#C9B8A8]/30">
                <p className="text-[10px] tracking-[2px] uppercase text-black/50 mb-1">Valor de la Gift Card</p>
                <p className="text-[32px] font-bold text-[#111111]">${finalMonto.toLocaleString('es-AR')}</p>
                <p className="text-[12px] text-black/60 mt-2">Para: <strong>{destinatario}</strong></p>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] tracking-[2px] uppercase font-semibold text-black/60">Método de Pago</label>
                
                <button
                  onClick={() => setPaymentMethod('transferencia')}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${paymentMethod === 'transferencia' ? 'border-[#111111] bg-[#111111]/5' : 'border-black/10 hover:border-black/30'}`}
                >
                  <div className="flex items-center gap-3">
                    <Landmark size={20} className={paymentMethod === 'transferencia' ? 'text-[#111111]' : 'text-black/40'} />
                    <div className="text-left">
                      <p className="text-[13px] font-bold text-[#111111]">Ualá Bis (Transferencia / Dinero en cuenta)</p>
                      <p className="text-[11px] text-[#2e7d32] font-semibold">Precio Efectivo</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-bold text-[#111111]">${finalMonto.toLocaleString('es-AR')}</p>
                  </div>
                </button>

                <button
                  onClick={() => setPaymentMethod('tarjeta')}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${paymentMethod === 'tarjeta' ? 'border-[#111111] bg-[#111111]/5' : 'border-black/10 hover:border-black/30'}`}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard size={20} className={paymentMethod === 'tarjeta' ? 'text-[#111111]' : 'text-black/40'} />
                    <div className="text-left">
                      <p className="text-[13px] font-bold text-[#111111]">Tarjetas de Crédito / Débito</p>
                      <p className="text-[11px] text-black/40">Precio de Lista</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-bold text-[#111111]">${Math.round(finalMonto / (1 - (DESCUENTO_BASE_TRANSFERENCIA / 100))).toLocaleString('es-AR')}</p>
                  </div>
                </button>
              </div>

              <div className="flex gap-3 pt-4 border-t border-black/5">
                <button
                  onClick={() => setStep('form')}
                  className="px-6 py-4 rounded-xl text-[12px] tracking-[2px] uppercase font-bold text-black border border-black/10 hover:bg-black/5 transition-all"
                >
                  Volver
                </button>
                <button
                  onClick={handlePay}
                  disabled={isLoading}
                  className="flex-1 bg-[#111111] text-white py-4 rounded-xl text-[12px] tracking-[2px] uppercase font-bold flex items-center justify-center gap-2 hover:bg-black/80 transition-all shadow-lg disabled:opacity-50"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Pagar y Enviar'}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-10 text-center space-y-4">
              <Gift size={64} className="mx-auto text-[#C9B8A8]" />
              <h3 className="text-[20px] font-bold uppercase tracking-[2px]">¡Redirigiendo al Pago!</h3>
              <p className="text-[14px] text-black/60 max-w-sm mx-auto">
                Se abrirá la ventana de Ualá Bis para que completes tu pago. Una vez que se confirme, <strong>{destinatario}</strong> recibirá su Gift Card por email automáticamente.
              </p>
              <button
                onClick={() => { onClose(); onSuccess(); }}
                className="mt-8 px-8 py-3 bg-[#111111] text-white rounded-xl text-[12px] tracking-[2px] uppercase font-bold hover:bg-black/80 transition-all shadow-lg"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BuyGiftCardModal;
