import React from 'react';
import { X, ArrowRight, ArrowLeft, Loader2, CheckCircle, Smartphone, MapPin, ShoppingBag, Send, AlertCircle, Lock, Gift } from 'lucide-react';
import { useAuth, ShippingAddress } from '../../contexts/AuthContext';
import { InventoryItem, WebSettings, GiftCard } from '../../types';
import { db, auth, functions } from '../../services/firebase';
import { httpsCallable } from 'firebase/functions';
import { fulfillWebOrder, reserveWebOrderStock } from '../../services/webOrderFulfillment';
import { collection, addDoc, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { sendNotificationEmail } from '../../services/emailService';
import { DESCUENTO_BASE_TRANSFERENCIA } from '../../services/exchangePricing';
import { createUalaPayment, setUalaEnvironment, getUalaEnvironment } from '../../services/ualaApi';
import { calculateCartWeightKg, calculateCartWeightGrams, calculateCartDimensions } from '../../utils/shippingHelpers';
import { useModal } from '../../contexts/ModalContext';
import { sanitizeInput } from '../../utils/sanitize';


const CORREO_PROVINCES: Record<string, string> = {
  'A': 'Salta', 'B': 'Buenos Aires', 'C': 'CABA', 'D': 'San Luis', 'E': 'Entre Ríos',
  'F': 'La Rioja', 'G': 'Santiago del Estero', 'H': 'Chaco', 'J': 'San Juan',
  'K': 'Catamarca', 'L': 'La Pampa', 'M': 'Mendoza', 'N': 'Misiones', 'P': 'Formosa',
  'Q': 'Neuquén', 'R': 'Río Negro', 'S': 'Santa Fe', 'T': 'Tucumán', 'U': 'Chubut',
  'V': 'Tierra del Fuego', 'W': 'Corrientes', 'X': 'Córdoba', 'Y': 'Jujuy', 'Z': 'Santa Cruz'
};

const PUBLIC_SHOWROOM_ID = localStorage.getItem('ropero_showroom_id_v3_2026') || 'EL-ROPERO-DEFAULT';

const SHIPPING_RATES: Record<string, number> = {
  'CABA': 2500,
  'BUENOS AIRES': 3500,
  'SANTA FE': 4200,
  'CÓRDOBA': 4200,
  'ENTRE RÍOS': 4200,
  'LA PAMPA': 4200,
  'MENDOZA': 4500,
  'SAN JUAN': 4500,
  'SAN LUIS': 4500,
  'CATAMARCA': 4800,
  'CHACO': 4800,
  'CORRIENTES': 4800,
  'FORMOSA': 4800,
  'JUJUY': 4800,
  'MISIONES': 4800,
  'SALTA': 4800,
  'SANTIAGO DEL ESTERO': 4800,
  'TUCUMÁN': 4800,
  'LA RIOJA': 4800,
  'CHUBUT': 5500,
  'NEUQUÉN': 5500,
  'RÍO NEGRO': 5500,
  'SANTA CRUZ': 5500,
  'TIERRA DEL FUEGO': 5800
};

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

const getShippingCost = (prov?: string, pesoKg: number = 1): number => {
  if (!prov) return 0;
  const normalized = prov.trim().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  const isRegional = normalized.includes("CAPITAL") || normalized === "CABA" || normalized.includes("AUTONOMA") || normalized.includes("BUENOS AIRES") || normalized === "PBA";
  
  if (pesoKg <= 1) return isRegional ? 18400 : 24900;
  if (pesoKg <= 5) return isRegional ? 21800 : 30200;
  if (pesoKg <= 10) return isRegional ? 29300 : 42600;
  if (pesoKg <= 15) return isRegional ? 36000 : 53400;
  if (pesoKg <= 20) return isRegional ? 42500 : 62100;
  return isRegional ? 51100 : 76300;
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

  React.useEffect(() => {
    if (isOpen) {
      setStep('identification');
      setErrorMsg(null);
      setPlacedOrderId(null);
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
      } else {
        setNombre('');
        setEmail('');
        setTelefono('');
        setSelectedAddressId('');
        setAddNewAddress(true);
      }
      
    }
  }, [isOpen, user, customerProfile, cart]);

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

  const handleNextStep = () => {
    setErrorMsg(null);

    if (step === 'identification') {
      if (!nombre.trim() || !email.trim() || !telefono.trim()) {
        setErrorMsg('Por favor completa todos tus datos personales.');
        return;
      }
      setStep('delivery');
    } else if (step === 'delivery') {
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
    if (step === 'delivery') setStep('identification');
    if (step === 'review') setStep('delivery');
  };

  // Crear la orden de compra y enviar WhatsApp
  const handlePlaceOrder = async () => {
    setIsLoading(true);
    setErrorMsg(null);

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
        metodoPago: finalTotal === 0 ? 'Gift Card' : 'Ualá Bis',
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
        ualaPaymentUrl: redirectUrl
      };
      setPlacedOrderData(updatedOrderDataWithUala);
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
    let msg = `🛍️ *Nuevo Pedido Web — ${store} Showroom*\n\n`;
    msg += `*Cliente:* ${nombre.trim().toUpperCase()}\n`;
    msg += `*Teléfono:* ${telefono.trim()}\n`;
    msg += `*Email:* ${email.trim()}\n`;
    msg += `*Entrega:* ${tipoEnvio === 'envio' ? 'Envío a domicilio' : tipoEnvio === 'envio_sucursal' ? 'Envío a Sucursal' : 'Retiro por local'}\n`;
    
    if (tipoEnvio === 'envio' && activeAddress) {
      msg += `*Dirección:* ${activeAddress.calle} ${activeAddress.numero}`;
      if (activeAddress.pisoDepto) msg += ` - ${activeAddress.pisoDepto}`;
      msg += ` (${activeAddress.localidad}, ${activeAddress.provincia})\n`;
      if (activeAddress.indicaciones) msg += `*Indicaciones:* ${activeAddress.indicaciones}\n`;
      msg += `*Costo de Envío:* ${calculatedCostoEnvio.toLocaleString('es-AR')}\n`;
    } else if (tipoEnvio === 'envio_sucursal' && selectedSucursal) {
      msg += `*Sucursal Elegida:* ${selectedSucursal.name} (${selectedSucursal.code})\n`;
      msg += `*Dirección:* ${selectedSucursal.location?.address?.streetName} ${selectedSucursal.location?.address?.streetNumber}\n`;
      msg += `*Localidad:* ${selectedSucursal.location?.address?.locality}, ${selectedSucursal.location?.address?.province}\n`;
      msg += `*Costo de Envío:* ${calculatedCostoEnvio.toLocaleString('es-AR')}\n`;
    }
    
    const metodoLabel = paymentMethod === 'transferencia' ? `Ualá Bis (Transferencia) — ${DESCUENTO_BASE_TRANSFERENCIA}% OFF` : 'Ualá Bis (Tarjeta — Lista)';
    msg += `*Método de Pago:* ${metodoLabel}\n`;

    msg += '\n*Detalle de prendas:*\n';
    cart.forEach((c, i) => {
      const disc = getDiscount(c.product);
      const basePrice = paymentMethod === 'transferencia' ? c.product.ventaEfectivo : c.product.ventaTarjeta;
      const price = getDiscountedPrice(basePrice, disc, paymentMethod === 'transferencia');
      msg += `${i + 1}. ${c.product.descripcion.toUpperCase()}`;
      if (c.selectedTalle) msg += ` (T: ${c.selectedTalle})`;
      if (c.selectedColor) msg += ` (C: ${c.selectedColor})`;
      const label = paymentMethod === 'transferencia' ? 'TRANSFERENCIA' : 'TARJETA';
      msg += ` × ${c.quantity} · $${price.toLocaleString('es-AR')} [${label}]\n`;
    });

    if (tipoEnvio === 'envio' || tipoEnvio === 'envio_sucursal') {
      msg += `\n*Subtotal Prendas:* ${calculatedCartSubtotal.toLocaleString('es-AR')}`;
      msg += `\n*Costo Envío:* ${calculatedCostoEnvio.toLocaleString('es-AR')}`;
    }

    if (appliedGiftCard) {
      msg += `\n*Gift Card Aplicada:* ${appliedGiftCard.codigo} (-$${giftCardDiscountAmount.toLocaleString('es-AR')})`;
    }

    msg += `\n━━━━━━━━━━━━━━━\n*TOTAL A PAGAR: $${Math.round(finalTotal).toLocaleString('es-AR')}*`;
    
    const phone = (webSettings.contactWhatsapp || '5492346685836').replace(/[^0-9]/g, '');
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
      <div className="relative bg-white w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 h-20 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center gap-4">
            {step !== 'identification' && step !== 'success' && (
              <button onClick={handleBackStep} disabled={isLoading} className="opacity-40 hover:opacity-100 transition-opacity">
                <ArrowLeft size={20} strokeWidth={1.5} />
              </button>
            )}
            <span className="text-[12px] tracking-[4px] uppercase font-semibold">Checkout</span>
          </div>
          {step !== 'success' && (
            <button onClick={onClose} disabled={isLoading} className="opacity-40 hover:opacity-100 transition-opacity">
              <X size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Banner Modo Pruebas Ualá Bis - SOLO visible si el usuario activo es yazminetchanchu@gmail.com */}
        {user?.email?.toLowerCase() === 'yazminetchanchu@gmail.com' && (webSettings?.ualaEnvironment === 'stage' || getUalaEnvironment() === 'stage') && (
          <div className="bg-amber-100 border-b border-amber-300 px-6 py-2.5 flex items-center justify-center gap-2 text-[10px] tracking-[1.5px] uppercase font-black text-amber-900 text-center shadow-inner">
            <span className="w-2 h-2 rounded-full bg-amber-600 inline-block animate-ping" />
            Modo Pruebas Ualá Bis (Stage) Activo — No se realizarán cobros reales
          </div>
        )}

        {/* Errors */}
        {errorMsg && (
          <div className="bg-red-50 text-red-700 px-8 py-3.5 border-b border-red-100 flex items-start gap-3 animate-in fade-in duration-200">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] tracking-[1px] uppercase leading-relaxed">{errorMsg}</span>
              {errorMsg.includes('Ualá') && (
                <button 
                  onClick={triggerWhatsAppMessage} 
                  className="mt-2 text-[10px] tracking-[1px] font-bold underline flex items-center gap-1 hover:text-red-900 w-fit"
                >
                  <Send size={12} /> COMPLETAR PEDIDO POR WHATSAPP
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content Box */}
        <div className="flex-1 overflow-y-auto p-8 sm:p-10 no-scrollbar">

          {/* STEP 1: IDENTIFICATION */}
          {step === 'identification' && (
            <div className="space-y-8">
              <div className="space-y-1">
                <h3 className="text-[11px] tracking-[3px] uppercase font-bold text-black">Datos del Comprador</h3>
                <p className="text-[10px] tracking-[1px] text-black/40 uppercase">Completá tus datos para comunicarnos sobre tu pedido.</p>
              </div>

              <div className="space-y-6">
                <div className="group">
                  <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Nombre Completo *</label>
                  <input
                    type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required
                    className="w-full bg-transparent border-b border-black/10 py-2.5 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase placeholder:text-black/10"
                    placeholder="EJ. SOFÍA PÉREZ"
                  />
                </div>

                <div className="group">
                  <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Correo Electrónico *</label>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    disabled={!!user} // Bloqueado si está autenticado
                    className="w-full bg-transparent border-b border-black/10 py-2.5 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] placeholder:text-black/10 disabled:opacity-40"
                    placeholder="SOFIA@CORREO.COM"
                  />
                </div>

                <div className="group">
                  <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Teléfono de Contacto (WhatsApp) *</label>
                  <input
                    type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} required
                    className="w-full bg-transparent border-b border-black/10 py-2.5 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] placeholder:text-black/10"
                    placeholder="EJ. 11 1234 5678"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: DELIVERY */}
          {step === 'delivery' && (
            <div className="space-y-8">
              <div className="space-y-1">
                <h3 className="text-[11px] tracking-[3px] uppercase font-bold text-black">Método de Entrega</h3>
                <p className="text-[10px] tracking-[1px] text-black/40 uppercase">Elegí cómo querés obtener tus prendas.</p>
              </div>

              {/* Selector de modo */}
              <div className="flex flex-col sm:flex-row gap-4">
                {[
                  { id: 'retiro', label: 'Retiro en Showroom / Pick Up Point' },
                  { id: 'envio', label: 'Envío a Domicilio' },
                  { id: 'envio_sucursal', label: 'Envío a Sucursal Correo Argentino' }
                ].map(m => (
                  <button
                    key={m.id} type="button" onClick={() => setTipoEnvio(m.id as 'retiro' | 'envio')}
                    className={`w-full sm:w-1/3 p-5 border text-left flex flex-col justify-between h-28 transition-all ${
                      tipoEnvio === m.id ? 'border-black bg-neutral-50/20' : 'border-black/10 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <span className="text-[10px] tracking-[2px] uppercase font-semibold text-black">{m.label}</span>
                    <span className="text-[12px] font-bold text-black/80">{m.id === 'retiro' ? 'GRATIS' : 'A CONVENIR'}</span>
                  </button>
                ))}
              </div>

              
              {tipoEnvio === 'envio_sucursal' && (
                <div className="space-y-6 pt-4 border-t border-black/5 animate-in fade-in duration-200">
                  <div className="group">
                    <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Elegí tu Provincia *</label>
                    <select 
                      value={sucursalProvince} 
                      onChange={(e) => setSucursalProvince(e.target.value)} 
                      required
                      className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase cursor-pointer text-black"
                    >
                      <option value="" disabled className="text-black/20">SELECCIONÁ TU PROVINCIA</option>
                      {Object.entries(CORREO_PROVINCES).map(([code, name]) => (
                        <option key={code} value={code} className="text-black bg-white">{name}</option>
                      ))}
                    </select>
                  </div>

                  {sucursalLoading && (
                    <div className="flex justify-center p-4">
                      <Loader2 size={24} className="animate-spin text-black/40" />
                    </div>
                  )}

                  {!sucursalLoading && sucursales.length > 0 && (
                    <div className="space-y-3">
                      <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Sucursales Disponibles *</label>
                      <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {sucursales.map(suc => (
                          <label
                            key={suc.code}
                            className={`flex p-4 border rounded cursor-pointer justify-between items-center transition-all ${
                              selectedSucursal?.code === suc.code ? 'border-black bg-neutral-50/10' : 'border-black/10 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio" name="sucursal-radio" value={suc.code}
                                checked={selectedSucursal?.code === suc.code}
                                onChange={() => setSelectedSucursal(suc)}
                                className="accent-black"
                              />
                              <div className="text-[11px] tracking-[1px] uppercase">
                                <p className="font-bold text-black">{suc.name} ({suc.code})</p>
                                <p className="text-black/60 text-[9px] font-medium">
                                  {suc.location?.address?.streetName} {suc.location?.address?.streetNumber} 
                                  - {suc.location?.address?.locality}
                                </p>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {!sucursalLoading && sucursalProvince && sucursales.length === 0 && (
                    <p className="text-[10px] text-red-500 uppercase tracking-[1px] font-semibold">No se encontraron sucursales para esta provincia.</p>
                  )}
                </div>
              )}

              {/* Formulario / Selector de Dirección si es Envío */}
              {tipoEnvio === 'envio' && (
                <div className="space-y-6 pt-4 border-t border-black/5 animate-in fade-in duration-200">
                  {user && customerProfile && customerProfile.direcciones?.length > 0 && !addNewAddress ? (
                    // Seleccionar Dirección Existente
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline mb-2">
                        <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40">Tus Direcciones Guardadas</label>
                        <button
                          type="button" onClick={() => setAddNewAddress(true)}
                          className="text-[9px] tracking-[2px] uppercase text-black/60 hover:text-black border-b border-black pb-0.5"
                        >
                          + Usar Otra Dirección
                        </button>
                      </div>

                      <div className="space-y-3">
                        {customerProfile.direcciones.map(addr => (
                          <label
                            key={addr.id}
                            className={`flex p-4 border rounded cursor-pointer justify-between items-center transition-all ${
                              selectedAddressId === addr.id ? 'border-black bg-neutral-50/10' : 'border-black/10 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio" name="checkout-addr" value={addr.id}
                                checked={selectedAddressId === addr.id}
                                onChange={() => setSelectedAddressId(addr.id)}
                                className="accent-black"
                              />
                              <div className="text-[11px] tracking-[1px] uppercase">
                                <p className="font-bold text-black">{addr.calle} {addr.numero} {addr.pisoDepto && `(P/D: ${addr.pisoDepto})`}</p>
                                <p className="text-black/60 text-[9px] font-medium">{addr.localidad}, {addr.provincia}</p>
                              </div>
                            </div>
                            {addr.esPrincipal && <span className="text-[8px] tracking-[1px] uppercase bg-black text-white px-2 py-0.5 font-bold">Principal</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    // Crear / Agregar Dirección Nueva (Guest o Logged In)
                    <div className="space-y-6">
                      <div className="flex justify-between items-baseline mb-2">
                        <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40">Datos de Envío</label>
                        {user && customerProfile && customerProfile.direcciones?.length > 0 && (
                          <button
                            type="button" onClick={() => setAddNewAddress(false)}
                            className="text-[9px] tracking-[2px] uppercase text-black/60 hover:text-black border-b border-black pb-0.5"
                          >
                            Volver a Mis Direcciones
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="sm:col-span-2 group">
                          <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Calle *</label>
                          <input 
                            type="text" value={calle} onChange={(e) => setCalle(e.target.value)} required
                            className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase placeholder:text-black/10"
                            placeholder="AV. SANTA FE"
                          />
                        </div>
                        <div className="sm:col-span-1 group">
                          <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Número *</label>
                          <input 
                            type="text" value={numero} onChange={(e) => setNumero(e.target.value)} required
                            className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] placeholder:text-black/10"
                            placeholder="1500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="group sm:col-span-1">
                          <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Piso/Depto</label>
                          <input 
                            type="text" value={pisoDepto} onChange={(e) => setPisoDepto(e.target.value)}
                            className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase placeholder:text-black/10"
                            placeholder="4A"
                          />
                        </div>
                        <div className="group sm:col-span-2">
                          <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Código Postal *</label>
                          <input 
                            type="text" value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} required
                            className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] placeholder:text-black/10"
                            placeholder="1425"
                          />
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Localidad *</label>
                        <input 
                          type="text" value={localidad} onChange={(e) => setLocalidad(e.target.value)} required
                          className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase placeholder:text-black/10"
                          placeholder="PALERMO / CABA"
                        />
                      </div>

                      <div className="group">
                        <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Provincia *</label>
                        <select 
                          value={provincia} 
                          onChange={(e) => setProvincia(e.target.value)} 
                          required
                          className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase cursor-pointer text-black"
                        >
                          <option value="" disabled className="text-black/20">SELECCIONÁ TU PROVINCIA</option>
                          {ARGENTINA_PROVINCES.map(p => (
                            <option key={p} value={p} className="text-black bg-white">{p}</option>
                          ))}
                        </select>
                      </div>

                      <div className="group">
                        <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Indicaciones (Opcional)</label>
                        <input 
                          type="text" value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)}
                          className="w-full bg-transparent border-b border-black/10 py-2 text-[11px] focus:outline-none focus:border-black tracking-[1px] uppercase placeholder:text-black/10"
                          placeholder="FRENTE A LA PLAZA / TIMBRE GRIS"
                        />
                      </div>

                      {user && (
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={saveAddressToAccount}
                            onChange={(e) => setSaveAddressToAccount(e.target.checked)}
                            className="accent-black w-4.5 h-4.5"
                          />
                          <span className="text-[10px] tracking-[1px] uppercase text-black/60 font-semibold">Guardar dirección en mi cuenta</span>
                        </label>
                      )}

                      {/* (Cotización de envío eliminada) */}
                    </div>
                  )}
                </div>
              )}


            </div>
          )}

          {/* STEP 3: REVIEW */}
          {step === 'review' && (
            <div className="space-y-8 font-['Inter'] animate-in fade-in duration-300">
              <div className="space-y-1">
                <h3 className="text-[11px] tracking-[3px] uppercase font-bold text-black">Confirmación de Pedido</h3>
                <p className="text-[10px] tracking-[1px] text-black/40 uppercase">Revisá que toda la información sea correcta antes de enviar.</p>
              </div>

              {/* Items Desglose */}
              <div className="divide-y divide-black/5 border-t border-b border-black/5 py-2">
                {cart.map((c, idx) => {
                  const disc = getDiscount(c.product);
                  const basePrice = paymentMethod === 'transferencia' ? c.product.ventaEfectivo : c.product.ventaTarjeta;
                  const price = getDiscountedPrice(basePrice, disc, paymentMethod === 'transferencia');
                  return (
                    <div key={idx} className="py-4 flex justify-between items-center text-[11px] tracking-[0.5px] uppercase">
                      <div className="flex flex-col">
                        <span className="font-bold text-black">{c.product.descripcion}</span>
                        <span className="text-black/40 text-[9px] font-medium mt-0.5">
                          {c.selectedTalle && `Talle ${c.selectedTalle}`} {c.selectedColor && `— ${c.selectedColor}`}
                          {` · Cant: ${c.quantity}`} · {paymentMethod === 'transferencia' ? `Transferencia (${DESCUENTO_BASE_TRANSFERENCIA}% OFF)` : 'Tarjeta (Precio Lista)'}
                        </span>
                      </div>
                      <span className="font-bold text-black">${(price * c.quantity).toLocaleString('es-AR')}</span>
                    </div>
                  );
                })}
              </div>

              {/* Medio de Pago Selector in Checkout Review */}
              <div className="space-y-3">
                <p className="text-[9px] tracking-[2px] font-bold text-black/40 uppercase">Medio de Pago</p>
                <div className="flex flex-col sm:flex-row gap-4">
                  {[
                    { id: 'transferencia', label: 'Transferencia (-20% OFF)' },
                    { id: 'tarjeta', label: 'Tarjeta (Lista)' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as 'transferencia' | 'tarjeta')}
                      className={`flex-1 py-3.5 border rounded-xl text-[10px] tracking-[1.5px] uppercase font-bold transition-all ${
                        paymentMethod === m.id
                          ? 'border-black bg-neutral-50 shadow-sm'
                          : 'border-black/10 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'transferencia' ? (
                <div className="p-5 border border-sky-200 bg-sky-50/50 rounded-xl space-y-1">
                  <p className="text-[9px] tracking-[2px] font-bold text-sky-900 uppercase">Pago por transferencia</p>
                  <p className="text-[10px] tracking-[0.5px] text-black/60 uppercase">
                    Precios con {DESCUENTO_BASE_TRANSFERENCIA}% de descuento. Al confirmar se abrirá la pasarela segura de Ualá Bis para abonar por transferencia.
                  </p>
                </div>
              ) : (
                <div className="p-5 border border-[#C9B8A8] bg-[#F5F1EB]/30 rounded-xl space-y-1">
                  <p className="text-[9px] tracking-[2px] font-bold text-[#A38A70] uppercase">Pago con Tarjeta</p>
                  <p className="text-[10px] tracking-[0.5px] text-black/60 uppercase">
                    Pagás a precio de lista. Al confirmar, se abrirá la pasarela segura de Ualá Bis para abonar con tarjeta de crédito o débito.
                  </p>
                </div>
              )}

              {/* Gift Card Coupon Accordion */}
              <div className="border border-black/10 rounded-xl overflow-hidden bg-neutral-50/50">
                <button
                  type="button"
                  onClick={() => setShowGiftInput(!showGiftInput)}
                  className="w-full px-5 py-4 flex items-center justify-between text-[11px] tracking-[2px] uppercase font-bold text-black/80 hover:bg-black/5 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Gift size={14} /> ¿Tenés una Gift Card?
                  </span>
                  <span className="text-[10px] text-black/40 font-normal">
                    {showGiftInput ? 'Cerrar' : 'Agregar'}
                  </span>
                </button>

                {showGiftInput && (
                  <div className="p-5 border-t border-black/5 space-y-4 bg-white animate-in fade-in duration-300">
                    {appliedGiftCard ? (
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-4 rounded-lg">
                        <div className="space-y-0.5 text-left">
                          <p className="text-[9px] font-bold text-emerald-800 tracking-[1.5px] uppercase">
                            Gift Card Aplicada
                          </p>
                          <p className="text-[11px] font-mono font-bold text-emerald-950">
                            {appliedGiftCard.codigo} (Destinatario: {appliedGiftCard.destinatario})
                          </p>
                          <p className="text-[10px] text-emerald-700/80 font-medium">
                            Saldo original: ${appliedGiftCard.saldo.toLocaleString('es-AR')} — Descuento aplicado: ${giftCardDiscountAmount.toLocaleString('es-AR')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveGiftCard}
                          className="text-[9px] tracking-[1.5px] uppercase font-bold text-red-600 hover:text-red-800 underline transition-all"
                        >
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={giftCardCode}
                            onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                            placeholder="CÓDIGO DE GIFT CARD (EJ: GIFT-XXXXX)"
                            disabled={isValidatingGift}
                            className="flex-1 bg-transparent border border-black/15 px-4 py-3 text-[11px] tracking-[1.5px] font-mono focus:outline-none focus:border-black uppercase placeholder:text-black/20"
                          />
                          <button
                            type="button"
                            onClick={handleApplyGiftCard}
                            disabled={isValidatingGift || !giftCardCode.trim()}
                            className="bg-black hover:bg-neutral-800 disabled:opacity-30 text-white px-6 text-[10px] tracking-[2px] uppercase font-bold transition-all flex items-center justify-center min-w-[100px]"
                          >
                            {isValidatingGift ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              'Aplicar'
                            )}
                          </button>
                        </div>
                        {giftCardError && (
                          <p className="text-[9px] uppercase tracking-[1px] text-red-600 font-semibold animate-pulse text-left">
                            ⚠️ {giftCardError}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Resumen de Datos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-[11px] tracking-[1.5px] uppercase pt-4 border-t border-black/5">
                <div className="space-y-2">
                  <p className="text-[9px] tracking-[2px] font-bold text-black/40">Datos del Comprador</p>
                  <p className="font-bold text-black">{nombre}</p>
                  <p className="text-black/60">{email}</p>
                  <p className="text-black/60">{telefono}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[9px] tracking-[2px] font-bold text-black/40">Método de Entrega</p>
                  <p className="font-bold text-black">{tipoEnvio === 'envio' ? 'Envío a domicilio' : tipoEnvio === 'envio_sucursal' ? 'Envío a sucursal' : 'Retiro por local'}</p>
                  {tipoEnvio === 'envio' && activeAddress && (
                    <p className="text-black/60 leading-relaxed">
                      {activeAddress.calle} {activeAddress.numero} {activeAddress.pisoDepto && `- ${activeAddress.pisoDepto}`} <br/>
                      {activeAddress.localidad}, {activeAddress.provincia}
                    </p>
                  )}
                </div>
              </div>

              {/* Desglose de Totales */}
              <div className="space-y-2 pt-6 border-t border-black/5 text-[11px] tracking-[1px] uppercase">
                <div className="flex justify-between text-black/60 font-medium">
                  <span>Subtotal prendas</span>
                  <span>${calculatedCartSubtotal.toLocaleString('es-AR')}</span>
                </div>
                {(tipoEnvio === 'envio' || tipoEnvio === 'envio_sucursal') && (
                  <div className="flex justify-between text-black/60 font-medium">
                    <span>Costo de envío ({tipoEnvio === 'envio' ? activeAddress?.provincia : selectedSucursal?.location?.address?.province})</span>
                    <span>${calculatedCostoEnvio.toLocaleString('es-AR')}</span>
                  </div>
                )}
                {appliedGiftCard && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Descuento Gift Card ({appliedGiftCard.codigo})</span>
                    <span>-${giftCardDiscountAmount.toLocaleString('es-AR')}</span>
                  </div>
                )}
              </div>

              {/* Total final */}
              <div className="pt-4 border-t border-black/5 flex justify-between items-baseline">
                <span className="text-[12px] tracking-[3px] uppercase font-bold text-black/50">Total Final</span>
                <span className="text-[32px] font-bold tracking-tight text-black">${Math.round(finalTotal).toLocaleString('es-AR')}</span>
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS & CONVERSION */}
          {step === 'success' && (
            <div className="space-y-10 text-center py-10 animate-in fade-in duration-300">
              
              <div className="space-y-4">
                <CheckCircle size={56} className="mx-auto text-black" strokeWidth={1} />
                <h3 className="text-[18px] tracking-[4px] uppercase font-bold text-black">¡Pedido Registrado!</h3>
                <p className="text-[11px] tracking-[1px] leading-relaxed uppercase text-black/60 max-w-[420px] mx-auto">
                  Tu pedido ha sido registrado. 
                  {paymentRedirectUrl
                    ? ' Tenés 15 minutos para completar el pago seguro en Ualá Bis (se abrió en una nueva pestaña), de lo contrario la reserva se cancelará automáticamente.'
                    : ' Podés coordinar el pago por WhatsApp con el showroom.'}
                </p>
              </div>

              {paymentRedirectUrl && (
                <div className="bg-[#F5F1EB]/30 border border-[#C9B8A8]/30 p-6 max-w-md mx-auto rounded-2xl shadow-sm">
                  <p className="text-[10px] tracking-[1.5px] uppercase text-[#A38A70] font-bold mb-3">
                    Pasarela de Pago de Ualá Bis
                  </p>
                  <button
                    type="button"
                    onClick={() => window.open(paymentRedirectUrl, '_blank', 'noopener,noreferrer')}
                    className="w-full bg-black hover:bg-neutral-900 text-white py-3.5 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-all shadow-sm"
                  >
                    Pagar con Ualá Bis
                  </button>
                </div>
              )}

              <div className="bg-neutral-50 p-6 max-w-md mx-auto space-y-4 rounded border border-black/5">
                <Smartphone size={24} className="mx-auto opacity-50" strokeWidth={1.5} />
                <p className="text-[10px] tracking-[1px] uppercase text-black/50 leading-relaxed font-semibold">
                  Si la pestaña de WhatsApp no se abrió de forma automática o tuviste problemas, podés reenviar el mensaje utilizando el botón inferior:
                </p>
                <button
                  onClick={triggerWhatsAppMessage}
                  className="inline-flex items-center gap-2 text-[10px] tracking-[3.5px] uppercase font-bold border-b border-black pb-0.5 hover:opacity-60 transition-opacity"
                >
                  <Send size={11} /> Reenviar por WhatsApp
                </button>
              </div>

              {/* GUEST ACCOUNT CONVERSION BOX */}
              {!user && (
                <div className="pt-10 border-t border-black/5 max-w-md mx-auto space-y-8">
                  <div className="space-y-2">
                    <div className="flex justify-center gap-2 items-center text-black/80">
                      <Lock size={12} strokeWidth={2} />
                      <span className="text-[11px] tracking-[3px] uppercase font-bold">Creá tu Cuenta en 1 Clic</span>
                    </div>
                    <p className="text-[10px] tracking-[1px] leading-relaxed uppercase text-black/40">
                      Escribí una contraseña y guardaremos tu historial de compras y dirección de envío para agilizar tus próximas visitas.
                    </p>
                  </div>

                  {conversionSuccess ? (
                    <div className="flex flex-col items-center gap-3 bg-neutral-50 p-6 border border-black text-black">
                      <CheckCircle size={18} strokeWidth={1.5} />
                      <p className="text-[10px] tracking-[2px] uppercase font-bold">¡Cuenta creada con éxito! Sincronizando sesión...</p>
                    </div>
                  ) : (
                    <form onSubmit={handleGuestConversion} className="space-y-4">
                      <div className="relative group text-left">
                        <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1 group-focus-within:text-black">
                          Elegí una Contraseña *
                        </label>
                        <input
                          type="password"
                          value={guestPassword}
                          onChange={(e) => setGuestPassword(e.target.value)}
                          required
                          disabled={conversionLoading}
                          placeholder="MÍNIMO 6 CARACTERES"
                          className="w-full bg-transparent border-b border-black/10 py-2.5 text-[12px] focus:outline-none focus:border-black tracking-[3px] text-black text-center"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={conversionLoading}
                        className="w-full bg-black text-white py-4.5 text-[10px] tracking-[3px] uppercase font-semibold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                      >
                        {conversionLoading ? <Loader2 className="animate-spin" size={12} /> : 'Guardar y Registrarse'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Volver a la Tienda */}
              <div className="pt-8 flex justify-center">
                <button
                  onClick={() => {
                    onSuccess(); // Limpia carro local
                    onClose();   // Cierra modal
                  }}
                  className="border border-black px-12 py-4 text-[10px] tracking-[4px] uppercase font-bold hover:bg-black hover:text-white transition-all duration-300"
                >
                  Volver a la Tienda
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions (Steps 1, 2, 3) */}
        {step !== 'success' && (
          <div className="p-8 border-t border-black/5 bg-neutral-50/50 flex gap-4 flex-shrink-0">
            {step === 'review' ? (
              <button
                onClick={handlePlaceOrder}
                disabled={isLoading}
                className="w-full bg-black text-white py-5 text-[11px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={14} strokeWidth={1.5} />
                ) : (
                  <>
                    <Send size={13} /> Finalizar y Enviar Pedido
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleNextStep}
                className="w-full bg-black text-white py-5 text-[11px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-all flex items-center justify-center gap-3"
              >
                Continuar <ArrowRight size={13} />
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default CheckoutFlow;
