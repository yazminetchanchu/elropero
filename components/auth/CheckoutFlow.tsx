import React from 'react';
import { X, ArrowRight, ArrowLeft, Loader2, CheckCircle, Smartphone, MapPin, ShoppingBag, Send, AlertCircle, Lock, Gift, Clock } from 'lucide-react';
import { useAuth, ShippingAddress } from '../../contexts/AuthContext';
import { InventoryItem, WebSettings, GiftCard } from '../../types';
import { db, auth, functions } from '../../services/firebase';
import { httpsCallable } from 'firebase/functions';
import { fulfillWebOrder, reserveWebOrderStock, getAvailableStock } from '../../services/webOrderFulfillment';
import { collection, addDoc, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { sendNotificationEmail } from '../../services/emailService';
import { DESCUENTO_BASE_TRANSFERENCIA } from '../../services/exchangePricing';
import { createUalaPayment, setUalaEnvironment, getUalaEnvironment } from '../../services/ualaApi';
import { calculateCartWeightKg, calculateCartWeightGrams, calculateCartDimensions } from '../../utils/shippingHelpers';
import { useModal } from '../../contexts/ModalContext';
import { sanitizeInput } from '../../utils/sanitize';
import { buildOrderWhatsAppMessage } from '../../utils/whatsappHelpers';


const CORREO_PROVINCES: Record<string, string> = {
  'A': 'Salta', 'B': 'Buenos Aires', 'C': 'CABA', 'D': 'San Luis', 'E': 'Entre Ríos',
  'F': 'La Rioja', 'G': 'Santiago del Estero', 'H': 'Chaco', 'J': 'San Juan',
  'K': 'Catamarca', 'L': 'La Pampa', 'M': 'Mendoza', 'N': 'Misiones', 'P': 'Formosa',
  'Q': 'Neuquén', 'R': 'Río Negro', 'S': 'Santa Fe', 'T': 'Tucumán', 'U': 'Chubut',
  'V': 'Tierra del Fuego', 'W': 'Corrientes', 'X': 'Córdoba', 'Y': 'Jujuy', 'Z': 'Santa Cruz'
};

import { getShowroomID } from '../../services/storage';

const PUBLIC_SHOWROOM_ID = getShowroomID();

const ARGENTINA_PROVINCES = [
  'CABA',
  'BUENOS AIRES',
  'CATAMARCA',
  'CHACO',
  'CHUBUT',
  'CÓRDOBA',
  'CORRIENTES',
  'ENTRE RÍOS',
  'FORMOSA',
  'JUJUY',
  'LA PAMPA',
  'LA RIOJA',
  'MENDOZA',
  'MISIONES',
  'NEUQUÉN',
  'RÍO NEGRO',
  'SALTA',
  'SAN JUAN',
  'SAN LUIS',
  'SANTA CRUZ',
  'SANTA FE',
  'SANTIAGO DEL ESTERO',
  'TIERRA DEL FUEGO',
  'TUCUMÁN'
];

const CP_RANGES: Record<string, { min: number, max: number }[]> = {
  'CABA': [{ min: 1000, max: 1499 }],
  'BUENOS AIRES': [{ min: 1500, max: 1999 }, { min: 2700, max: 2999 }, { min: 6000, max: 6799 }, { min: 7000, max: 7699 }, { min: 8000, max: 8199 }],
  'CATAMARCA': [{ min: 4700, max: 4799 }, { min: 5200, max: 5399 }],
  'CHACO': [{ min: 3500, max: 3799 }],
  'CHUBUT': [{ min: 9000, max: 9299 }],
  'CÓRDOBA': [{ min: 2100, max: 2699 }, { min: 5000, max: 5399 }, { min: 5800, max: 5999 }],
  'CORRIENTES': [{ min: 3100, max: 3499 }],
  'ENTRE RÍOS': [{ min: 2800, max: 3399 }],
  'FORMOSA': [{ min: 3600, max: 3699 }],
  'JUJUY': [{ min: 4500, max: 4699 }],
  'LA PAMPA': [{ min: 6300, max: 6399 }, { min: 8200, max: 8300 }],
  'LA RIOJA': [{ min: 5300, max: 5399 }],
  'MENDOZA': [{ min: 5400, max: 5699 }],
  'MISIONES': [{ min: 3300, max: 3399 }],
  'NEUQUÉN': [{ min: 8300, max: 8499 }],
  'RÍO NEGRO': [{ min: 8100, max: 8599 }],
  'SALTA': [{ min: 4100, max: 4199 }, { min: 4400, max: 4499 }],
  'SAN JUAN': [{ min: 5400, max: 5499 }],
  'SAN LUIS': [{ min: 5700, max: 5799 }],
  'SANTA CRUZ': [{ min: 9000, max: 9499 }],
  'SANTA FE': [{ min: 2000, max: 2599 }, { min: 3000, max: 3099 }, { min: 3500, max: 3599 }],
  'SANTIAGO DEL ESTERO': [{ min: 3700, max: 3799 }, { min: 4200, max: 4399 }],
  'TIERRA DEL FUEGO': [{ min: 9400, max: 9499 }],
  'TUCUMÁN': [{ min: 4000, max: 4199 }]
};

const validateProvinciaPostalCode = (provincia: string, cpStr: string): boolean => {
  const numMatch = cpStr.match(/\d+/);
  if (!numMatch) return false;
  const cp = parseInt(numMatch[0], 10);
  
  const ranges = CP_RANGES[provincia.toUpperCase()];
  if (!ranges) return true; // Si no está en el mapa, omitimos validación estricta
  
  return ranges.some(r => cp >= r.min && cp <= r.max);
};

interface CartItem {
  product: InventoryItem;
  quantity: number;
  payMethod: 'transferencia';
  selectedTalle?: string;
  selectedColor?: string;
}

interface CheckoutFlowProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  cartTotal: number;
  inventory?: InventoryItem[];
  webSettings: WebSettings;
  onSuccess: () => void; // Limpia el carrito local y cierra
  getDiscount: (item: InventoryItem) => number;
  getDiscountedPrice: (price: number, discount: number, isTransferencia?: boolean) => number;
  initialPaymentMethod: 'transferencia' | 'tarjeta';
  initialAppliedGiftCard: GiftCard | null;
}

type CheckoutStep = 'identification' | 'delivery' | 'review' | 'success';

const CheckoutFlow: React.FC<CheckoutFlowProps> = ({ 
  isOpen, 
  onClose, 
  cart, 
  cartTotal, 
  inventory,
  webSettings, 
  onSuccess,
  getDiscount,
  getDiscountedPrice,
  initialPaymentMethod,
  initialAppliedGiftCard
}) => {
  const { showAlert } = useModal();
  const { user, customerProfile, signUpWithEmail, updateProfile, refreshOrders } = useAuth();
  
  const [step, setStep] = React.useState<CheckoutStep>('identification');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Step 1: Buyer Data
  const [nombre, setNombre] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [telefono, setTelefono] = React.useState('');

  // Step 2: Delivery Method
  const [tipoEnvio, setTipoEnvio] = React.useState<'retiro' | 'envio' | 'envio_sucursal'>('retiro');
  const [selectedAddressId, setSelectedAddressId] = React.useState<string>('');

  // Sucursal State
  const [sucursalProvince, setSucursalProvince] = React.useState('');
  const [sucursales, setSucursales] = React.useState<any[]>([]);
  const [sucursalLoading, setSucursalLoading] = React.useState(false);
  const [selectedSucursal, setSelectedSucursal] = React.useState<any | null>(null);
  
  const [costoEnvio, setCostoEnvio] = React.useState<number>(0);
  const [isCalculatingShipping, setIsCalculatingShipping] = React.useState<boolean>(false);
  
  React.useEffect(() => {
    if (webSettings?.ualaEnvironment) {
      setUalaEnvironment(webSettings.ualaEnvironment);
    }
  }, [webSettings]);

  React.useEffect(() => {
    let active = true;
    if (tipoEnvio !== 'envio_sucursal' || !sucursalProvince) {
      if (active) {
        setSucursales([]);
        setSelectedSucursal(null);
      }
      return;
    }

    const fetchSucursales = async () => {
      setSucursalLoading(true);
      try {
        const obtenerSucursales = httpsCallable(functions, 'obtenerSucursales');
        const response = await obtenerSucursales({ provinceCode: sucursalProvince });
        if (active) {
          const result = (response.data as any) || {};
          setSucursales(result.sucursales || []);
          setSelectedSucursal(null);
        }
      } catch (err) {
        console.error('Error fetching agencies:', err);
        if (active) setSucursales([]);
      } finally {
        if (active) setSucursalLoading(false);
      }
    };
    fetchSucursales();

    return () => { active = false; };
  }, [sucursalProvince, tipoEnvio]);  
  // Custom Address fields (Guest / Adding new)
  const [addNewAddress, setAddNewAddress] = React.useState(false);
  const [calle, setCalle] = React.useState('');
  const [numero, setNumero] = React.useState('');
  const [pisoDepto, setPisoDepto] = React.useState('');
  const [localidad, setLocalidad] = React.useState('');
  const [provincia, setProvincia] = React.useState('');
  const [codigoPostal, setCodigoPostal] = React.useState('');
  const [indicaciones, setIndicaciones] = React.useState('');
  const [saveAddressToAccount, setSaveAddressToAccount] = React.useState(true);

  // Success Step Data
  const [placedOrderId, setPlacedOrderId] = React.useState<string | null>(null);
  const [placedOrderData, setPlacedOrderData] = React.useState<any | null>(null);
  
  // Guest to Account Conversion State
  const [guestPassword, setGuestPassword] = React.useState('');
  const [conversionSuccess, setConversionSuccess] = React.useState(false);
  const [conversionLoading, setConversionLoading] = React.useState(false);

  const [paymentRedirectUrl, setPaymentRedirectUrl] = React.useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = React.useState<'transferencia' | 'tarjeta'>(initialPaymentMethod);

  // 15-minute stock reservation visual countdown timer (900 seconds)
  const [timeLeft, setTimeLeft] = React.useState<number>(15 * 60);

  React.useEffect(() => {
    if (!isOpen || step === 'success') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          showAlert('Tu tiempo de reserva de stock (15 minutos) ha expirado. Por favor, verificá nuevamente los productos en tu carrito.', 'Reserva Expirada', 'warning');
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, step, showAlert, onClose]);

  // Gift Card Coupon States
  const [showGiftInput, setShowGiftInput] = React.useState(false);
  const [giftCardCode, setGiftCardCode] = React.useState('');
  const [appliedGiftCard, setAppliedGiftCard] = React.useState<GiftCard | null>(initialAppliedGiftCard);
  const [isValidatingGift, setIsValidatingGift] = React.useState(false);
  const [giftCardError, setGiftCardError] = React.useState<string | null>(null);

  const handleApplyGiftCard = async () => {
    if (!giftCardCode.trim()) return;
    setIsValidatingGift(true);
    setGiftCardError(null);
    try {
      const showroomRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID);
      const snap = await getDoc(showroomRef);
      if (!snap.exists()) {
        setGiftCardError('Showroom no encontrado.');
        setIsValidatingGift(false);
        return;
      }
      const data = snap.data();
      const giftCards: GiftCard[] = data.giftCards || [];
      const found = giftCards.find(
        (gc) => gc.codigo.trim().toUpperCase() === giftCardCode.trim().toUpperCase()
      );
      if (!found) {
        setGiftCardError('Código de Gift Card no válido o no existe.');
      } else if (found.estado !== 'ACTIVA') {
        setGiftCardError(`Esta Gift Card no está activa (Estado: ${found.estado}).`);
      } else if (found.saldo <= 0) {
        setGiftCardError('Esta Gift Card ya no tiene saldo disponible.');
      } else {
        setAppliedGiftCard(found);
        setGiftCardCode('');
      }
    } catch (err) {
      console.error(err);
      setGiftCardError('Error al validar la Gift Card. Intentá de nuevo.');
    } finally {
      setIsValidatingGift(false);
    }
  };

  const handleRemoveGiftCard = () => {
    setAppliedGiftCard(null);
    setGiftCardError(null);
  };

  const prevIsOpenRef = React.useRef(false);

  React.useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (justOpened) {
      setTimeLeft(15 * 60);
      setErrorMsg(null);
      setPlacedOrderId(null);
      setPlacedOrderData(null);
      setGuestPassword('');
      setConversionSuccess(false);
      setAddNewAddress(false);
      setPaymentRedirectUrl(null);
      setShowGiftInput(false);
      setGiftCardCode('');
      setAppliedGiftCard(initialAppliedGiftCard);
      setGiftCardError(null);
      setIsValidatingGift(false);
      setPaymentMethod(initialPaymentMethod);
      setSucursalProvince('');
      setSucursales([]);
      setSelectedSucursal(null);

      if (user && customerProfile) {
        setNombre(customerProfile.nombre || '');
        setEmail(customerProfile.email || '');
        setTelefono(customerProfile.telefono || '');
        
        // Seleccionar la dirección principal si existe
        const principal = customerProfile.direcciones?.find(a => a.esPrincipal);
        if (principal) {
          setSelectedAddressId(principal.id);
        } else if (customerProfile.direcciones?.length > 0) {
          setSelectedAddressId(customerProfile.direcciones[0].id);
        } else {
          setSelectedAddressId('');
          setAddNewAddress(true);
        }
        setStep('delivery');
      } else {
        setNombre('');
        setEmail('');
        setTelefono('');
        setSelectedAddressId('');
        setAddNewAddress(true);
        setStep('identification');
      }
    }
  }, [isOpen, user, customerProfile, initialAppliedGiftCard, initialPaymentMethod]);

  // Direcciones activas
  const activeAddress = React.useMemo((): Omit<ShippingAddress, 'id'> | null => {
    if (tipoEnvio !== 'envio') return null;
    
    if (user && customerProfile && !addNewAddress) {
      const saved = customerProfile.direcciones?.find(a => a.id === selectedAddressId);
      if (saved) return saved;
    }

    return {
      calle: sanitizeInput(calle.trim().toUpperCase()),
      numero: sanitizeInput(numero.trim()),
      pisoDepto: sanitizeInput(pisoDepto.trim().toUpperCase()),
      localidad: sanitizeInput(localidad.trim().toUpperCase()),
      provincia: sanitizeInput(provincia.trim().toUpperCase()),
      codigoPostal: sanitizeInput(codigoPostal.trim()),
      indicaciones: sanitizeInput(indicaciones.trim().toUpperCase()),
      esPrincipal: false
    };
  }, [tipoEnvio, user, customerProfile, addNewAddress, selectedAddressId, calle, numero, pisoDepto, localidad, provincia, codigoPostal, indicaciones]);

  React.useEffect(() => {
    let active = true;
    const isDomicilio = tipoEnvio === 'envio' && activeAddress?.codigoPostal;
    const isSucursal = tipoEnvio === 'envio_sucursal' && selectedSucursal?.location?.address?.postalCode;

    if (!isDomicilio && !isSucursal) {
      setCostoEnvio(0);
      setIsCalculatingShipping(false);
      return;
    }

    const calculateShipping = async () => {
      setIsCalculatingShipping(true);
      try {
        const totalWeightGrams = calculateCartWeightGrams(cart);
        const dimensions = calculateCartDimensions(cart);
        const cpDestino = isSucursal ? selectedSucursal.location.address.postalCode : activeAddress!.codigoPostal;
        const delType = isSucursal ? 'S' : 'D';

        const cotizarEnvio = httpsCallable(functions, 'cotizarEnvio');
        const response = await cotizarEnvio({
          codigoPostalDestino: cpDestino,
          pesoGramos: totalWeightGrams,
          dimensiones: dimensions,
          codigoPostalOrigen: '6620', // Origen por defecto
          deliveredType: delType
        });

        const result = (response.data as any) || {};
        if (active) {
          setCostoEnvio(result.costoEnvio || 0);
        }
      } catch (err) {
        console.error('Error calculando envío en checkout:', err);
        if (active) setCostoEnvio(0);
      } finally {
        if (active) setIsCalculatingShipping(false);
      }
    };
    calculateShipping();

    return () => { active = false; };
  }, [activeAddress?.codigoPostal, selectedSucursal, cart, tipoEnvio]);

  const calculatedCostoEnvio = costoEnvio;

  const calculatedCartSubtotal = React.useMemo(() => {
    return cart.reduce((sum, c) => {
      const disc = getDiscount(c.product);
      const basePrice = paymentMethod === 'transferencia' ? c.product.ventaEfectivo : c.product.ventaTarjeta;
      const price = getDiscountedPrice(basePrice, disc, paymentMethod === 'transferencia');
      return sum + price * c.quantity;
    }, 0);
  }, [cart, getDiscount, getDiscountedPrice, paymentMethod]);

  const rawTotal = calculatedCartSubtotal + calculatedCostoEnvio;
  const giftCardDiscountAmount = React.useMemo(() => {
    if (!appliedGiftCard) return 0;
    return Math.min(appliedGiftCard.saldo, rawTotal);
  }, [appliedGiftCard, rawTotal]);

  const finalTotal = Math.max(0, rawTotal - giftCardDiscountAmount);

  const mercadoPagoUrl = React.useMemo(() => {
    if (webSettings.mercadoPagoTransferUrl?.trim()) {
      return webSettings.mercadoPagoTransferUrl.trim();
    }
    if (webSettings.mercadoPagoAlias?.trim()) {
      const alias = webSettings.mercadoPagoAlias.replace(/^@/, '').trim();
      return `https://link.mercadopago.com.ar/${encodeURIComponent(alias)}`;
    }
    return null;
  }, [webSettings.mercadoPagoTransferUrl, webSettings.mercadoPagoAlias]);

  const validateCurrentStock = React.useCallback((): string | null => {
    for (const c of cart) {
      const liveProd = (inventory && inventory.length > 0)
        ? inventory.find(i => i.id === c.product.id)
        : c.product;
      
      if (!liveProd) {
        return `El producto "${c.product.descripcion}" ya no se encuentra disponible.`;
      }

      const available = getAvailableStock(liveProd, c.selectedTalle, c.selectedColor);
      const variantInfo = [c.selectedTalle && `Talle ${c.selectedTalle}`, c.selectedColor && `Color ${c.selectedColor}`].filter(Boolean).join(' ');
      
      if (available <= 0) {
        return `El producto "${c.product.descripcion}" ${variantInfo ? `(${variantInfo}) ` : ''}se acaba de agotar en el showroom. Por favor retíralo de tu carrito.`;
      }
      if (available < c.quantity) {
        return `Solo quedan ${available} unidad(es) disponible(s) de "${c.product.descripcion}" ${variantInfo ? `(${variantInfo}) ` : ''}(solicitadas: ${c.quantity}).`;
      }
    }
    return null;
  }, [cart, inventory]);

  const handleNextStep = () => {
    setErrorMsg(null);

    if (step === 'identification') {
      if (!nombre.trim() || !email.trim() || !telefono.trim()) {
        setErrorMsg('Por favor completa todos tus datos personales.');
        return;
      }
      setStep('delivery');
    } else if (step === 'delivery') {
      const stockErr = validateCurrentStock();
      if (stockErr) {
        setErrorMsg(stockErr);
        return;
      }

      if (tipoEnvio === 'envio') {
        const addr = activeAddress;
        if (!addr || !addr.calle || !addr.numero || !addr.localidad || !addr.provincia || !addr.codigoPostal) {
          setErrorMsg('Por favor ingresá todos los datos obligatorios de tu dirección de envío.');
          return;
        }
        if (!validateProvinciaPostalCode(addr.provincia, addr.codigoPostal)) {
          setErrorMsg('El Código Postal ingresado no corresponde a la Provincia seleccionada. Por favor verificá.');
          return;
        }
        if (isCalculatingShipping) {
          setErrorMsg('Calculando costo de envío, aguardá un momento...');
          return;
        }
        if (costoEnvio === 0) {
          setErrorMsg('No se pudo calcular el envío para ese Código Postal. Verificá que sea correcto o probá más tarde.');
          return;
        }
      } else if (tipoEnvio === 'envio_sucursal') {
        if (!selectedSucursal) {
          setErrorMsg('Por favor seleccioná una sucursal para el envío.');
          return;
        }
        if (isCalculatingShipping) {
          setErrorMsg('Calculando costo de envío, aguardá un momento...');
          return;
        }
        if (costoEnvio === 0) {
          setErrorMsg('No se pudo calcular el envío para esta sucursal. Probá más tarde.');
          return;
        }
      }
      setStep('review');
    }
  };

  const handleBackStep = () => {
    setErrorMsg(null);
    if (step === 'delivery') {
      if (user) {
        onClose();
      } else {
        setStep('identification');
      }
    }
    if (step === 'review') setStep('delivery');
  };

  // Crear la orden de compra y enviar WhatsApp
  const handlePlaceOrder = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    const stockErr = validateCurrentStock();
    if (stockErr) {
      setErrorMsg(stockErr);
      setIsLoading(false);
      return;
    }

    try {
      const orderItems = cart.map(c => {
        const disc = getDiscount(c.product);
        const basePrice = paymentMethod === 'transferencia' ? c.product.ventaEfectivo : c.product.ventaTarjeta;
        const finalPrice = getDiscountedPrice(basePrice, disc, paymentMethod === 'transferencia');
        return {
          productId: c.product.id,
          descripcion: c.product.descripcion,
          sku: c.product.sku,
          cantidad: c.quantity,
          precioUnitario: finalPrice,
          talle: c.selectedTalle || '',
          color: c.selectedColor || '',
          payMethod: paymentMethod
        };
      });

      const addressIsComplete = activeAddress && activeAddress.calle && activeAddress.numero && activeAddress.localidad && activeAddress.provincia && activeAddress.codigoPostal;
      const addressField = (tipoEnvio === 'envio' && addressIsComplete) ? { direccionEnvio: activeAddress as ShippingAddress } : {};
      
      const orderData = {
        customerId: user ? user.uid : 'GUEST',
        customerEmail: sanitizeInput(email.trim().toLowerCase()),
        customerNombre: sanitizeInput(nombre.trim().toUpperCase()),
        customerTelefono: sanitizeInput(telefono.trim()),
        fecha: new Date().toISOString(),
        items: orderItems,
        total: Math.round(finalTotal),
        tipoEnvio: tipoEnvio,
        ...addressField,
        ...(tipoEnvio === 'envio' || tipoEnvio === 'envio_sucursal' ? { costoEnvio: calculatedCostoEnvio } : {}),
        ...(tipoEnvio === 'envio_sucursal' && selectedSucursal ? { sucursalCorreoArgentino: selectedSucursal } : {}),
        metodoPago: finalTotal === 0 ? 'Gift Card' : (paymentMethod === 'transferencia' ? 'Transferencia' : 'Tarjeta / Ualá Bis'),
        pago: paymentMethod === 'transferencia' ? { efectivo: 100, tarjeta: 0 } : { efectivo: 0, tarjeta: 100 },
        ualaPlan: null,
        estado: 'PENDING_PAYMENT' as const,
        pesoTotalGramos: calculateCartWeightGrams(cart),
        ...(appliedGiftCard ? {
          giftCardUsada: {
            codigo: appliedGiftCard.codigo,
            montoUsado: giftCardDiscountAmount
          }
        } : {})
      };

      const ordersCol = collection(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'orders');
      const orderRef = doc(ordersCol);
      const orderId = orderRef.id;

      let redirectUrl: string | null = null;
      let ualaPaymentId: string | null = null;

      try {
        if (finalTotal > 0) {
          const successUrl = `${window.location.origin}/?pago=ok&orderId=${orderId}`;
          const failUrl = `${window.location.origin}/?pago=error&orderId=${orderId}`;
          
          const orderForUala = {
            id: orderId,
            total: Math.round(finalTotal),
            customerEmail: email.trim().toLowerCase(),
            customerNombre: nombre.trim().toUpperCase(),
            customerTelefono: telefono.trim(),
          };

          const ualaPayment = await createUalaPayment(orderForUala, successUrl, failUrl);
          redirectUrl = ualaPayment.paymentUrl;
          ualaPaymentId = ualaPayment.paymentId;
        }
      } catch (ualaErr: any) {
        console.error('Error al generar pago en Ualá:', ualaErr);
        setErrorMsg('Hubo un problema al generar el pago con Ualá. Tu pedido no ha sido registrado. Por favor, intentá nuevamente o comunicate por WhatsApp.');
        setIsLoading(false);
        return;
      }

      // Reservar el stock en Firebase (descuenta temporalmente y guarda en pendingOrders)
      const finalOrderData = {
        ...orderData,
        orderId: orderId,                  // Campo propio para buscarlo en Collection Group
        showroomId: PUBLIC_SHOWROOM_ID,    // Permite al webhook de Ualá saber en qué showroom buscar
        ualaPaymentId: ualaPaymentId,
        ualaPaymentUrl: redirectUrl
      };

      try {
        await reserveWebOrderStock(PUBLIC_SHOWROOM_ID, orderId, finalOrderData);
      } catch (reserveErr: any) {
        console.error('Error al reservar stock:', reserveErr);
        setErrorMsg(reserveErr.message || 'No hay stock suficiente para algunos productos. Alguien pudo haberlos comprado.');
        setIsLoading(false);
        return;
      }

      // 2. Si el usuario está registrado, limpiar su carrito de Firestore y guardar dirección nueva si corresponde
      if (user && customerProfile) {
        await updateProfile({ cart: [] });
        
        // Guardar dirección si seleccionó hacerlo
        if (addNewAddress && saveAddressToAccount && activeAddress) {
          const newAddressObj: ShippingAddress = {
            id: `addr_${Date.now()}`,
            ...activeAddress,
            esPrincipal: customerProfile.direcciones?.length === 0
          };
          const savedAddresses = [...(customerProfile.direcciones || []), newAddressObj];
          await updateProfile({ direcciones: savedAddresses });
        }
        await refreshOrders();
      }




      setPlacedOrderId(orderId);
      const updatedOrderDataWithUala = {
        ...orderData,
        orderId: orderId,
        ualaPaymentUrl: redirectUrl
      };
      setPlacedOrderData(updatedOrderDataWithUala);
      try {
        localStorage.setItem('ropero_last_pending_order', JSON.stringify(updatedOrderDataWithUala));
      } catch (storageErr) {
        console.error('Error al guardar la última orden pendiente en localStorage:', storageErr);
      }

      setPaymentRedirectUrl(redirectUrl);
      setStep('success');

      if (redirectUrl) {
        window.open(redirectUrl, '_blank', 'noopener,noreferrer');
      }

    } catch (e: any) {
      console.error(e);
      const offline = !navigator.onLine || e?.code === 'unavailable';
      setErrorMsg(
        offline
          ? 'Sin conexión a internet. Verificá tu red e intentá de nuevo.'
          : 'Error al registrar tu pedido. Por favor, reintentá.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const triggerWhatsAppMessage = () => {
    const store = (webSettings?.storeName || 'El Ropero').trim();
    const phone = (webSettings?.contactWhatsapp || '5492346685836').replace(/[^0-9]/g, '');

    const orderToUse = placedOrderData || {
      orderId: placedOrderId || '',
      customerNombre: nombre.trim().toUpperCase(),
      customerTelefono: telefono.trim(),
      customerEmail: email.trim(),
      tipoEnvio: tipoEnvio,
      direccionEnvio: activeAddress,
      sucursalCorreoArgentino: selectedSucursal,
      costoEnvio: calculatedCostoEnvio,
      metodoPago: paymentMethod === 'transferencia' ? `Ualá Bis (Transferencia) — ${DESCUENTO_BASE_TRANSFERENCIA}% OFF` : 'Ualá Bis (Tarjeta — Lista)',
      items: cart.map(c => {
        const disc = getDiscount(c.product);
        const basePrice = paymentMethod === 'transferencia' ? c.product.ventaEfectivo : c.product.ventaTarjeta;
        const finalPrice = getDiscountedPrice(basePrice, disc, paymentMethod === 'transferencia');
        return {
          descripcion: c.product.descripcion,
          talle: c.selectedTalle || '',
          color: c.selectedColor || '',
          cantidad: c.quantity,
          precioUnitario: finalPrice
        };
      }),
      total: Math.round(finalTotal),
      giftCardUsada: appliedGiftCard ? { codigo: appliedGiftCard.codigo, montoUsado: giftCardDiscountAmount } : undefined
    };

    const msg = buildOrderWhatsAppMessage(orderToUse, store);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Convertir Invitado a Miembro Post-Checkout
  const handleGuestConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestPassword || guestPassword.length < 6) {
      showAlert('La contraseña debe tener al menos 6 caracteres.', 'Contraseña Insegura', 'warning');
      return;
    }
    setConversionLoading(true);

    try {
      // 1. Crear el usuario
      await signUpWithEmail(email.trim().toLowerCase(), guestPassword, nombre.trim().toUpperCase(), telefono.trim());
      
      // 2. Si es envío, le asignamos de inmediato la dirección utilizada
      if (tipoEnvio === 'envio' && activeAddress) {
        const newAddressObj: ShippingAddress = {
          id: `addr_${Date.now()}`,
          ...activeAddress,
          esPrincipal: true
        };
        // A través del AuthContext creado, el perfil ya se inicializó y podemos mutar
        // Para hacerlo directo, actualizamos Firestore
        const userRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'customers', authCurrentUserUid()!);
        await updateDoc(userRef, { direcciones: [newAddressObj] });
      }

      // 3. Vincular el pedido recién creado a la nueva cuenta
      // NOTA: Bajo las nuevas reglas de seguridad, el cliente no puede actualizar `orders`
      // Para vincularlo, se requeriría una Callable Cloud Function adicional.
      /* if (placedOrderId) {
        const orderRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'orders', placedOrderId);
        await updateDoc(orderRef, { customerId: authCurrentUserUid()! });

        if (placedOrderData) {
          const customerOrdersCol = collection(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'customers', authCurrentUserUid()!, 'orders');
          const updatedOrder = { ...placedOrderData, customerId: authCurrentUserUid()! };
          await setDoc(doc(customerOrdersCol, placedOrderId), updatedOrder);
        }
      } */

      setConversionSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 3000);

    } catch (e: any) {
      console.error(e);
      showAlert('Error al crear la cuenta. Puede que este email ya esté registrado.', 'Error al Crear Cuenta', 'error');
    } finally {
      setConversionLoading(false);
    }
  };

  const authCurrentUserUid = (): string | null => {
    return auth.currentUser ? auth.currentUser.uid : null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-0 sm:p-6 font-['Inter'] select-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => { if (step !== 'success' && !isLoading) onClose(); }} 
      />

      {/* Container */}
      <div className="relative bg-white w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in duration-200 border border-black/10 rounded-none">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-16 border-b border-neutral-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step !== 'identification' && step !== 'success' && (
              <button onClick={handleBackStep} disabled={isLoading} className="opacity-40 hover:opacity-100 transition-opacity">
                <ArrowLeft size={16} strokeWidth={1.2} />
              </button>
            )}
            <span className="text-[11px] tracking-[0.25em] uppercase font-light text-black">Checkout</span>
          </div>
          {step !== 'success' && (
            <button onClick={onClose} disabled={isLoading} className="opacity-40 hover:opacity-100 transition-opacity">
              <X size={16} strokeWidth={1.2} />
            </button>
          )}
        </div>

        {/* Banner Temporizador Visual de Reserva */}
        {step !== 'success' && (
          <div className={`px-6 py-2.5 flex items-center justify-between transition-colors border-b ${
            timeLeft < 180 
              ? 'bg-red-50 text-red-900 border-red-200' 
              : 'bg-neutral-950 text-neutral-200 border-neutral-800'
          }`}>
            <div className="flex items-center gap-2 text-[9px] tracking-[0.2em] uppercase font-light">
              <Clock size={13} className={timeLeft < 180 ? 'text-red-500 animate-pulse' : 'text-amber-400'} strokeWidth={1.5} />
              <span>Reserva de stock activa</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-[8px] tracking-[0.2em] uppercase text-neutral-400 font-sans hidden sm:inline">Expira en:</span>
              <span className={`font-semibold px-2 py-0.5 rounded tracking-widest text-[11px] ${
                timeLeft < 180 ? 'bg-red-200/80 text-red-900 animate-pulse' : 'bg-white/10 text-amber-300'
              }`}>
                {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        )}

        {/* Banner Modo Pruebas Ualá Bis */}
        {user?.email?.toLowerCase() === 'yazminetchanchu@gmail.com' && (webSettings?.ualaEnvironment === 'stage' || getUalaEnvironment() === 'stage') && (
          <div className="bg-neutral-100 border-b border-neutral-200 px-6 py-2 flex items-center justify-center gap-2 text-[9px] tracking-[0.2em] uppercase font-light text-neutral-800 text-center">
            Modo Pruebas Ualá Bis (Stage) Activo — No se realizarán cobros reales
          </div>
        )}

        {/* Errors */}
        {errorMsg && (
          <div className="bg-neutral-50 text-neutral-900 px-6 py-3 border-b border-neutral-200 flex items-start gap-2.5 animate-in fade-in duration-200">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-black" />
            <div className="flex flex-col">
              <span className="text-[9px] tracking-[0.1em] uppercase leading-relaxed font-light">{errorMsg}</span>
              {errorMsg.includes('Ualá') && (
                <button 
                  onClick={triggerWhatsAppMessage} 
                  className="mt-1.5 text-[9px] tracking-[0.15em] font-normal underline flex items-center gap-1 hover:text-black w-fit uppercase"
                >
                  <Send size={11} /> COMPLETAR PEDIDO POR WHATSAPP
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content Box */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 visible-scrollbar bg-white">

          {/* STEP 1: IDENTIFICATION */}
          {step === 'identification' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-xs tracking-[0.2em] uppercase font-light text-black">Datos del Comprador</h3>
                <p className="text-[9px] tracking-[0.15em] text-neutral-400 uppercase font-light">Completá tus datos para comunicarnos sobre tu pedido.</p>
              </div>

              <div className="space-y-5">
                <div className="group">
                  <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Nombre Completo *</label>
                  <input
                    type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required
                    className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] uppercase text-black placeholder:text-neutral-300"
                    placeholder="EJ. SOFÍA PÉREZ"
                  />
                </div>

                <div className="group">
                  <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Correo Electrónico *</label>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    disabled={!!user}
                    className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] text-black placeholder:text-neutral-300 disabled:opacity-40"
                    placeholder="SOFIA@CORREO.COM"
                  />
                </div>

                <div className="group">
                  <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Teléfono de Contacto (WhatsApp) *</label>
                  <input
                    type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} required
                    className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] text-black placeholder:text-neutral-300"
                    placeholder="EJ. 11 1234 5678"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: DELIVERY */}
          {step === 'delivery' && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-xs tracking-[0.2em] uppercase font-light text-black">Método de Entrega</h3>
                <p className="text-[9px] tracking-[0.15em] text-neutral-400 uppercase font-light">Elegí cómo querés obtener tus prendas.</p>
              </div>

              {/* Selector de modo */}
              <div className="flex flex-col sm:flex-row gap-3">
                {[
                  { id: 'retiro', label: 'Retiro en Showroom' },
                  { id: 'envio', label: 'Envío a Domicilio' },
                  { id: 'envio_sucursal', label: 'Sucursal Correo' }
                ].map(m => (
                  <button
                    key={m.id} type="button" onClick={() => setTipoEnvio(m.id as 'retiro' | 'envio')}
                    className={`w-full sm:w-1/3 p-4 border text-left flex flex-col justify-between h-24 rounded-none transition-all ${
                      tipoEnvio === m.id ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white hover:border-black text-black'
                    }`}
                  >
                    <span className={`text-[9px] tracking-[0.2em] uppercase font-light ${tipoEnvio === m.id ? 'text-white' : 'text-black'}`}>{m.label}</span>
                    <span className={`text-[10px] font-light uppercase tracking-wider ${tipoEnvio === m.id ? 'text-white/80' : 'text-neutral-500'}`}>{m.id === 'retiro' ? 'GRATIS' : 'A CONVENIR'}</span>
                  </button>
                ))}
              </div>

              {tipoEnvio === 'envio_sucursal' && (
                <div className="space-y-5 pt-3 border-t border-neutral-100 animate-in fade-in duration-200">
                  <div className="group">
                    <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Elegí tu Provincia *</label>
                    <select 
                      value={sucursalProvince} 
                      onChange={(e) => setSucursalProvince(e.target.value)} 
                      required
                      className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] uppercase cursor-pointer text-black"
                    >
                      <option value="" disabled className="text-neutral-300">SELECCIONÁ TU PROVINCIA</option>
                      {Object.entries(CORREO_PROVINCES).map(([code, name]) => (
                        <option key={code} value={code} className="text-black bg-white">{name}</option>
                      ))}
                    </select>
                  </div>

                  {sucursalLoading && (
                    <div className="flex justify-center p-3">
                      <Loader2 size={18} className="animate-spin text-neutral-400" />
                    </div>
                  )}

                  {!sucursalLoading && sucursales.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Sucursales Disponibles *</label>
                      <div className="max-h-52 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {sucursales.map(suc => (
                          <label
                            key={suc.code}
                            className={`flex p-3 border rounded-none cursor-pointer justify-between items-center transition-all ${
                              selectedSucursal?.code === suc.code ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white hover:border-black text-black'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="radio" name="sucursal-radio" value={suc.code}
                                checked={selectedSucursal?.code === suc.code}
                                onChange={() => setSelectedSucursal(suc)}
                                className="accent-black"
                              />
                              <div className="text-[10px] tracking-[0.15em] uppercase font-light">
                                <p className="font-normal">{suc.name} ({suc.code})</p>
                                <p className={`text-[8px] ${selectedSucursal?.code === suc.code ? 'text-white/70' : 'text-neutral-400'}`}>
                                  {suc.location?.address?.streetName} {suc.location?.address?.streetNumber} - {suc.location?.address?.locality}
                                </p>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {!sucursalLoading && sucursalProvince && sucursales.length === 0 && (
                    <p className="text-[9px] text-neutral-800 uppercase tracking-[0.1em] font-light">No se encontraron sucursales para esta provincia.</p>
                  )}
                </div>
              )}

              {/* Formulario / Selector de Dirección */}
              {tipoEnvio === 'envio' && (
                <div className="space-y-5 pt-3 border-t border-neutral-100 animate-in fade-in duration-200">
                  {user && customerProfile && customerProfile.direcciones?.length > 0 && !addNewAddress ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-baseline mb-1">
                        <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400">Tus Direcciones Guardadas</label>
                        <button
                          type="button" onClick={() => setAddNewAddress(true)}
                          className="text-[8px] tracking-[0.2em] uppercase text-neutral-500 hover:text-black underline font-light"
                        >
                          + Usar Otra Dirección
                        </button>
                      </div>

                      <div className="space-y-2">
                        {customerProfile.direcciones.map(addr => (
                          <label
                            key={addr.id}
                            className={`flex p-3 border rounded-none cursor-pointer justify-between items-center transition-all ${
                              selectedAddressId === addr.id ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white hover:border-black text-black'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="radio" name="checkout-addr" value={addr.id}
                                checked={selectedAddressId === addr.id}
                                onChange={() => setSelectedAddressId(addr.id)}
                                className="accent-black"
                              />
                              <div className="text-[10px] tracking-[0.15em] uppercase font-light">
                                <p className="font-normal">{addr.calle} {addr.numero} {addr.pisoDepto && `(P/D: ${addr.pisoDepto})`}</p>
                                <p className={`text-[8px] ${selectedAddressId === addr.id ? 'text-white/70' : 'text-neutral-400'}`}>{addr.localidad}, {addr.provincia}</p>
                              </div>
                            </div>
                            {addr.esPrincipal && <span className="text-[8px] tracking-[0.15em] uppercase bg-white text-black px-1.5 py-0.5 font-light border border-black">Principal</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline mb-1">
                        <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400">Datos de Envío</label>
                        {user && customerProfile && customerProfile.direcciones?.length > 0 && (
                          <button
                            type="button" onClick={() => setAddNewAddress(false)}
                            className="text-[8px] tracking-[0.2em] uppercase text-neutral-500 hover:text-black underline font-light"
                          >
                            Volver a Mis Direcciones
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 group">
                          <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Calle *</label>
                          <input 
                            type="text" value={calle} onChange={(e) => setCalle(e.target.value)} required
                            className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] uppercase placeholder:text-neutral-300"
                            placeholder="AV. SANTA FE"
                          />
                        </div>
                        <div className="sm:col-span-1 group">
                          <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Número *</label>
                          <input 
                            type="text" value={numero} onChange={(e) => setNumero(e.target.value)} required
                            className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] placeholder:text-neutral-300"
                            placeholder="1500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="group sm:col-span-1">
                          <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Piso/Depto</label>
                          <input 
                            type="text" value={pisoDepto} onChange={(e) => setPisoDepto(e.target.value)}
                            className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] uppercase placeholder:text-neutral-300"
                            placeholder="4A"
                          />
                        </div>
                        <div className="group sm:col-span-2">
                          <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Código Postal *</label>
                          <input 
                            type="text" value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} required
                            className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] placeholder:text-neutral-300"
                            placeholder="1425"
                          />
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Localidad *</label>
                        <input 
                          type="text" value={localidad} onChange={(e) => setLocalidad(e.target.value)} required
                          className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] uppercase placeholder:text-neutral-300"
                          placeholder="PALERMO / CABA"
                        />
                      </div>

                      <div className="group">
                        <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Provincia *</label>
                        <select 
                          value={provincia} 
                          onChange={(e) => setProvincia(e.target.value)} 
                          required
                          className="w-full bg-transparent border-b border-neutral-200 py-2 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] uppercase cursor-pointer text-black"
                        >
                          <option value="" disabled className="text-neutral-300">SELECCIONÁ TU PROVINCIA</option>
                          {ARGENTINA_PROVINCES.map(p => (
                            <option key={p} value={p} className="text-black bg-white">{p}</option>
                          ))}
                        </select>
                      </div>

                      <div className="group">
                        <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">Indicaciones (Opcional)</label>
                        <input 
                          type="text" value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)}
                          className="w-full bg-transparent border-b border-neutral-200 py-2 text-[10px] font-light focus:outline-none focus:border-black tracking-[0.1em] uppercase placeholder:text-neutral-300"
                          placeholder="FRENTE A LA PLAZA / TIMBRE GRIS"
                        />
                      </div>

                      {user && (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={saveAddressToAccount}
                            onChange={(e) => setSaveAddressToAccount(e.target.checked)}
                            className="accent-black w-3.5 h-3.5"
                          />
                          <span className="text-[9px] tracking-[0.15em] uppercase text-neutral-500 font-light">Guardar dirección en mi cuenta</span>
                        </label>
                      )}

                      {isCalculatingShipping && (
                        <div className="flex items-center gap-2 text-[9px] tracking-[0.15em] uppercase font-light text-neutral-500 pt-1 animate-in fade-in">
                          <Loader2 size={11} className="animate-spin text-black" />
                          <span>Calculando costo de envío...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: REVIEW */}
          {step === 'review' && (
            <div className="space-y-6 font-['Inter'] animate-in fade-in duration-200">
              <div className="space-y-1">
                <h3 className="text-xs tracking-[0.2em] uppercase font-light text-black">Confirmación de Pedido</h3>
                <p className="text-[9px] tracking-[0.15em] text-neutral-400 uppercase font-light">Revisá la información antes de finalizar.</p>
              </div>

              {/* Items Desglose */}
              <div className="divide-y divide-neutral-100 border-t border-b border-neutral-100 py-1">
                {cart.map((c, idx) => {
                  const disc = getDiscount(c.product);
                  const basePrice = paymentMethod === 'transferencia' ? c.product.ventaEfectivo : c.product.ventaTarjeta;
                  const price = getDiscountedPrice(basePrice, disc, paymentMethod === 'transferencia');
                  return (
                    <div key={idx} className="py-3 flex justify-between items-center text-[10px] tracking-[0.15em] uppercase font-light">
                      <div className="flex flex-col">
                        <span className="font-normal text-black">{c.product.descripcion}</span>
                        <span className="text-neutral-400 text-[8px] font-light mt-0.5">
                          {c.selectedTalle && `Talle ${c.selectedTalle}`} {c.selectedColor && `— ${c.selectedColor}`}
                          {` · Cant: ${c.quantity}`}
                        </span>
                      </div>
                      <span className="font-normal text-black">${(price * c.quantity).toLocaleString('es-AR')}</span>
                    </div>
                  );
                })}
              </div>

              {/* Resumen del Medio de Pago */}
              <div className="space-y-1.5">
                <p className="text-[8px] tracking-[0.25em] font-light text-neutral-400 uppercase">Medio de Pago Seleccionado</p>
                {paymentMethod === 'transferencia' ? (
                  <div className="p-3 border border-neutral-200 bg-white space-y-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] tracking-[0.2em] font-light text-black uppercase">Transferencia Bancaria</p>
                      <span className="text-[8px] font-light text-black bg-neutral-100 px-1.5 py-0.5 uppercase border border-black/10">-{DESCUENTO_BASE_TRANSFERENCIA}% OFF</span>
                    </div>
                    <p className="text-[8px] tracking-[0.1em] text-neutral-400 uppercase font-light">
                      Pasarela segura Ualá Bis por transferencia.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 border border-neutral-200 bg-white space-y-0.5">
                    <p className="text-[9px] tracking-[0.2em] font-light text-black uppercase">Tarjeta de Crédito / Débito</p>
                    <p className="text-[8px] tracking-[0.1em] text-neutral-400 uppercase font-light">
                      Precio de lista. Pasarela segura Ualá Bis.
                    </p>
                  </div>
                )}
              </div>

              {/* Gift Card Aplicada */}
              {appliedGiftCard && (
                <div className="bg-white border border-neutral-200 p-3 flex items-center justify-between">
                  <div className="space-y-0.5 text-left">
                    <div className="flex items-center gap-1 text-black">
                      <Gift size={11} strokeWidth={1.2} />
                      <span className="text-[8px] font-light tracking-[0.2em] uppercase">Gift Card Aplicada</span>
                    </div>
                    <p className="text-[9px] font-mono text-black">
                      {appliedGiftCard.codigo}
                    </p>
                    <p className="text-[8px] text-neutral-500 font-light">
                      Descuento: -${giftCardDiscountAmount.toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>
              )}

              {/* Resumen de Datos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-[10px] tracking-[0.15em] uppercase font-light pt-3 border-t border-neutral-100">
                <div className="space-y-1">
                  <p className="text-[8px] tracking-[0.25em] font-light text-neutral-400">Comprador</p>
                  <p className="font-normal text-black">{nombre}</p>
                  <p className="text-neutral-500">{email}</p>
                  <p className="text-neutral-500">{telefono}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] tracking-[0.25em] font-light text-neutral-400">Entrega</p>
                  <p className="font-normal text-black">{tipoEnvio === 'envio' ? 'Envío a domicilio' : tipoEnvio === 'envio_sucursal' ? 'Envío a sucursal' : 'Retiro por local'}</p>
                  {tipoEnvio === 'envio' && activeAddress && (
                    <p className="text-neutral-500 leading-relaxed">
                      {activeAddress.calle} {activeAddress.numero} {activeAddress.pisoDepto && `- ${activeAddress.pisoDepto}`} <br/>
                      {activeAddress.localidad}, {activeAddress.provincia}
                    </p>
                  )}
                </div>
              </div>

              {/* Desglose de Totales */}
              <div className="space-y-1 pt-4 border-t border-neutral-100 text-[9px] tracking-[0.18em] uppercase font-light">
                <div className="flex justify-between text-neutral-500">
                  <span>Subtotal prendas</span>
                  <span>${calculatedCartSubtotal.toLocaleString('es-AR')}</span>
                </div>
                {(tipoEnvio === 'envio' || tipoEnvio === 'envio_sucursal') && (
                  <div className="flex justify-between text-neutral-500">
                    <span>Costo de envío ({tipoEnvio === 'envio' ? activeAddress?.provincia : selectedSucursal?.location?.address?.province})</span>
                    <span>${calculatedCostoEnvio.toLocaleString('es-AR')}</span>
                  </div>
                )}
                {appliedGiftCard && (
                  <div className="flex justify-between text-black font-normal">
                    <span>Descuento Gift Card ({appliedGiftCard.codigo})</span>
                    <span>-${giftCardDiscountAmount.toLocaleString('es-AR')}</span>
                  </div>
                )}
              </div>

              {/* Total final */}
              <div className="pt-3 border-t border-black/10 flex justify-between items-baseline">
                <span className="text-[9px] tracking-[0.25em] uppercase font-light text-neutral-400">Total Final</span>
                <span className="text-2xl font-normal tracking-wide text-black">${Math.round(finalTotal).toLocaleString('es-AR')}</span>
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS & CONVERSION */}
          {step === 'success' && (
            <div className="space-y-8 text-center py-6 animate-in fade-in duration-200">
              
              <div className="space-y-3">
                <CheckCircle size={44} className="mx-auto text-black" strokeWidth={1} />
                <h3 className="text-base tracking-[0.25em] uppercase font-light text-black">¡Pedido Registrado!</h3>
                <p className="text-[10px] tracking-[0.1em] leading-relaxed uppercase text-neutral-500 max-w-xs mx-auto font-light">
                  Tu pedido ha sido registrado. 
                  {paymentRedirectUrl
                    ? ' Tenés 15 minutos para completar el pago seguro en Ualá Bis (se abrió en una nueva pestaña).'
                    : ' Podés coordinar el pago por WhatsApp con el showroom.'}
                </p>
              </div>

              {paymentRedirectUrl && (
                <div className="max-w-xs mx-auto">
                  <button
                    type="button"
                    onClick={() => window.open(paymentRedirectUrl, '_blank', 'noopener,noreferrer')}
                    className="w-full bg-black text-white py-3 text-[10px] tracking-[0.25em] uppercase font-light hover:bg-neutral-800 transition-all rounded-none"
                  >
                    Pagar con Ualá Bis
                  </button>
                </div>
              )}

              <div className="pt-4 border-t border-neutral-100 max-w-xs mx-auto space-y-2">
                <p className="text-[9px] tracking-[0.15em] uppercase font-light text-neutral-500">
                  ¿Dudas sobre tu pago?
                </p>
                <button
                  onClick={triggerWhatsAppMessage}
                  className="w-full bg-black text-white py-2.5 text-[9px] font-light tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2 rounded-none"
                >
                  <Send size={11} strokeWidth={1.2} /> Contactar por WhatsApp
                </button>
              </div>

              {/* Volver a la Tienda */}
              <div className="pt-6 flex justify-center">
                <button
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="border border-black px-8 py-3 text-[9px] tracking-[0.25em] uppercase font-light hover:bg-black hover:text-white transition-all rounded-none"
                >
                  Volver a la Tienda
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions (Steps 1, 2, 3) */}
        {step !== 'success' && (
          <div className="p-6 border-t border-neutral-100 bg-white flex gap-3 flex-shrink-0">
            {step === 'review' ? (
              <button
                onClick={handlePlaceOrder}
                disabled={isLoading}
                className="w-full bg-black text-white py-3.5 text-[10px] tracking-[0.25em] uppercase font-light hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 rounded-none disabled:opacity-30"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={13} strokeWidth={1.2} />
                ) : (
                  <>
                    <Send size={12} strokeWidth={1.2} /> Finalizar y Enviar Pedido
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleNextStep}
                disabled={isCalculatingShipping || (step === 'delivery' && tipoEnvio === 'envio_sucursal' && sucursalLoading)}
                className="w-full bg-black text-white py-3.5 text-[10px] tracking-[0.25em] uppercase font-light hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 rounded-none disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isCalculatingShipping ? (
                  <>
                    <Loader2 className="animate-spin" size={13} strokeWidth={1.2} />
                    Cargando costo de envío...
                  </>
                ) : (
                  <>
                    Continuar <ArrowRight size={12} strokeWidth={1.2} />
                  </>
                )}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default CheckoutFlow;
