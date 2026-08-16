import React from 'react';
import { Link } from 'react-router-dom';
import { InventoryItem, WebSettings, GiftCard, SaleItem } from '../types';
import { db, functions } from '../services/firebase';
import { doc, onSnapshot, getDoc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { X, Plus, Minus, ShoppingBag, Search, Menu, ChevronDown, Trash2, Send, ChevronRight, Ruler, ChevronLeft, Instagram, Heart, User, RefreshCw, Loader2, CheckCircle, ArrowRight, Gift, Copy, Check, AlertCircle, SlidersHorizontal } from 'lucide-react';

const getColorDotStyle = (colorName: string): React.CSSProperties => {
  const c = colorName.toLowerCase().trim();
  if (c.includes('blanco') || c.includes('white')) return { backgroundColor: '#ffffff', border: '1px solid #d1d5db' };
  if (c.includes('negro') || c.includes('black')) return { backgroundColor: '#000000' };
  if (c.includes('beige') || c.includes('nude') || c.includes('crudo') || c.includes('crema')) return { backgroundColor: '#f3ebd9' };
  if (c.includes('azul') || c.includes('marino') || c.includes('blue') || c.includes('jeans') || c.includes('denim')) return { backgroundColor: '#1d4ed8' };
  if (c.includes('rojo') || c.includes('red') || c.includes('bordo') || c.includes('bordeaux')) return { backgroundColor: '#b91c1c' };
  if (c.includes('verde') || c.includes('green') || c.includes('militar')) return { backgroundColor: '#15803d' };
  if (c.includes('rosa') || c.includes('pink') || c.includes('fucsia')) return { backgroundColor: '#ec4899' };
  if (c.includes('gris') || c.includes('gray') || c.includes('melange')) return { backgroundColor: '#6b7280' };
  if (c.includes('marron') || c.includes('chocolate') || c.includes('suela') || c.includes('camel')) return { backgroundColor: '#78350f' };
  if (c.includes('amarillo') || c.includes('yellow')) return { backgroundColor: '#eab308' };
  if (c.includes('naranja') || c.includes('orange')) return { backgroundColor: '#f97316' };
  if (c.includes('violeta') || c.includes('púrpura') || c.includes('purple')) return { backgroundColor: '#7e22ce' };
  return { background: 'linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%)' };
};
import { useAuth, SavedCartItem } from '../contexts/AuthContext';
import AuthModal from './auth/AuthModal';
import UserDashboard from './auth/UserDashboard';
import CheckoutFlow from './auth/CheckoutFlow';
import SessionExpiryModal from './auth/SessionExpiryModal';
import BuyGiftCardModal from './BuyGiftCardModal';
import { CustomerOrder } from '../contexts/AuthContext';
import { buildSaleItemsFromOrder, getOrderSaleId } from '../services/webOrderToSale';
import { sumTransferLines, DESCUENTO_BASE_TRANSFERENCIA } from '../services/exchangePricing';
import { fulfillWebCambio } from '../services/webCambioFulfillment';
import { fulfillWebOrder } from '../services/webOrderFulfillment';
import { sendNotificationEmail, sendSaleConfirmationEmail } from '../services/emailService';
import { cartLinesToSaleItems } from '../services/cartToSale';
import { calculateCartWeightGrams, calculateCartDimensions } from '../utils/shippingHelpers';
import { setUalaEnvironment } from '../services/ualaApi';
import { useModal } from '../contexts/ModalContext';
import InnovativeLoader from './InnovativeLoader';
import { buildOrderWhatsAppMessage } from '../utils/whatsappHelpers';


import { getShowroomID } from '../services/storage';

const PUBLIC_SHOWROOM_ID = getShowroomID();

const getColorHex = (colorName: string): string => {
  const c = colorName.trim().toUpperCase();
  const palette: Record<string, string> = {
    'NEGRO': '#000000',
    'BLANCO': '#FFFFFF',
    'CRUDO': '#EADBC8',
    'OFF-WHITE': '#F8F6F0',
    'OFF WHITE': '#F8F6F0',
    'BEIGE': '#F5F5DC',
    'ARENA': '#D2B48C',
    'CAMEL': '#C19A6B',
    'GRIS': '#BEBEBE',
    'GRIS CLARO': '#D3D3D3',
    'GRIS MELANGE': '#B8B8B8',
    'GRIS OSCURO': '#5A5A5A',
    'MARRON': '#4B3621',
    'MARRÓN': '#4B3621',
    'CHOCOLATE': '#3D2314',
    'ROJO': '#DC2626',
    'BORDO': '#800020',
    'BORDÓ': '#800020',
    'VINO': '#58111A',
    'TERRACOTA': '#C05C46',
    'NARANJA': '#F97316',
    'AMARILLO': '#EAB308',
    'MOSTAZA': '#CA8A04',
    'ROSA': '#FBCFE8',
    'ROSA PASTEL': '#FBCFE8',
    'ROSA CHICLE': '#F472B6',
    'FUCSIA': '#D946EF',
    'CORAL': '#F87171',
    'VERDE': '#22C55E',
    'VERDE MILITAR': '#4B5320',
    'VERDE OLIVA': '#65A30D',
    'VERDE ESMERALDA': '#059669',
    'VERDE BENETTON': '#008751',
    'AZUL': '#2563EB',
    'AZUL MARINO': '#1E3A8A',
    'AZUL FRANCIA': '#1D4ED8',
    'CELESTE': '#60A5FA',
    'TURQUESA': '#06B6D4',
    'VIOLETA': '#7C3AED',
    'LILA': '#D8B4FE',
    'LAVANDA': '#E9D5FF',
    'MULTICOLOR': 'linear-gradient(45deg, red, orange, yellow, green, blue, purple)',
    'ORO': '#D4AF37',
    'PLATA': '#C0C0C0'
  };
  return palette[c] || '#E5E7EB';
};


interface CartItem {
  product: InventoryItem;
  quantity: number;
  payMethod: 'transferencia';
  selectedTalle?: string;
  selectedColor?: string;
}

interface ExchangeSession {
  order: CustomerOrder;
  originalItems: SaleItem[];
  itemsDevueltos: SaleItem[];
  cantDevueltasInput: Record<string, number>;
  giftDestinatario: string;
}

interface StorefrontProps {
  inventoryProp?: InventoryItem[];
  settingsProp?: WebSettings;
}

const StorefrontPage: React.FC<StorefrontProps> = ({ inventoryProp, settingsProp }) => {
  const [inventory, setInventory] = React.useState<InventoryItem[]>(inventoryProp || []);
  const [webSettings, setWebSettings] = React.useState<WebSettings>(settingsProp || {
    heroImageUrl: '/assets/hero.png',
    heroTitle: '',
    heroSubtitle: 'NUEVO INGRESO',
    storeName: 'EL ROPERO',
    categoriesOrder: [],
    announcementText: '20% de descuento pagando por transferencia ★',
    aboutUsText: 'El Ropero es el resultado de un compromiso profundo con la indumentaria y cada detalle. Lo que comenzó como un proyecto personal impulsado por esfuerzo y dedicación, se consolidó hoy como un espacio donde pensamos en cada mujer. Cada paso de nuestro camino está marcado por la gratitud hacia quienes nos eligen.',
    locationShowroomAddress: 'San Martín 382, Chivilcoy',
    locationShowroomMapUrl: 'https://www.google.com/maps/search/?api=1&query=San+Martin+382+Chivilcoy+Buenos+Aires',
    locationPickupAddress: 'Recoleta, CABA',
    locationPickupMapUrl: 'https://www.google.com/maps/search/?api=1&query=Recoleta+CABA'
  });
  const [search, setSearch] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(!inventoryProp || inventoryProp.length === 0);
  const [category, setCategory] = React.useState('');
  const [filterTalle, setFilterTalle] = React.useState('');
  const [filterColor, setFilterColor] = React.useState('');
  const [sortOption, setSortOption] = React.useState<'destacados' | 'precio-asc' | 'precio-desc' | 'nombre'>('destacados');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = React.useState(false);

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (filterTalle) count++;
    if (filterColor) count++;
    if (sortOption !== 'destacados') count++;
    return count;
  }, [filterTalle, filterColor, sortOption]);
  const [showSearch, setShowSearch] = React.useState(false);
  const [showNav, setShowNav] = React.useState(false);
  const { showAlert, showConfirm } = useModal();
  const { user, customerProfile, syncCart, addToWishlist, removeFromWishlist, refreshOrders, assignGiftCard } = useAuth();
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [showCart, setShowCart] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<InventoryItem | null>(null);
  const [addedFeedback, setAddedFeedback] = React.useState<string | null>(null);
  
  // Toast notice for item added to cart
  const [cartToastNotification, setCartToastNotification] = React.useState<{
    item: InventoryItem;
    talle?: string;
    color?: string;
  } | null>(null);
  const cartToastTimerRef = React.useRef<any>(null);
  
  // Modal state for selection
  const [modalTalle, setModalTalle] = React.useState('');
  const [modalColor, setModalColor] = React.useState('');
  const [modalImgIdx, setModalImgIdx] = React.useState(0);
  const [showSizeGuideModal, setShowSizeGuideModal] = React.useState(false);

  // Auth & UX Modal States
  const [showAuthModal, setShowAuthModal] = React.useState(false);
  const [showDashboard, setShowDashboard] = React.useState(false);
  const [showCheckout, setShowCheckout] = React.useState(false);
  const [pendingCheckout, setPendingCheckout] = React.useState(false);
  const [pendingBuyGiftCard, setPendingBuyGiftCard] = React.useState(false);
  const [exchangeSession, setExchangeSession] = React.useState<ExchangeSession | null>(null);
  const [isConfirmingExchange, setIsConfirmingExchange] = React.useState(false);
  const [exchangeSuccessMsg, setExchangeSuccessMsg] = React.useState<string | null>(null);
  const [showExpiryModal, setShowExpiryModal] = React.useState(false);
  const [showTerms, setShowTerms] = React.useState(false);
  const [showLocation, setShowLocation] = React.useState(false);
  const [showBuyGiftCard, setShowBuyGiftCard] = React.useState(false);
  const [pendingPaymentOrder, setPendingPaymentOrder] = React.useState<any | null>(null);

  const headerRef = React.useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = React.useState<number>(64);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  React.useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, [webSettings.announcementText, showSearch, isScrolled]);

  const handleOpenBuyGiftCard = () => {
    if (user) {
      setShowBuyGiftCard(true);
    } else {
      showAlert('Debés estar registrado e iniciar sesión para comprar una Gift Card.', 'Registro Requerido', 'info');
      setPendingBuyGiftCard(true);
      setShowAuthModal(true);
    }
  };

  // Deep linking para abrir producto directamente vía URL (?product=ID)
  React.useEffect(() => {
    if (!inventory || inventory.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const prodId = params.get('product') || params.get('producto');
    if (prodId) {
      const found = inventory.find(p => p.id === prodId || (p.sku && p.sku.toLowerCase() === prodId.toLowerCase()));
      if (found) {
        setSelectedProduct(found);
      }
    }
  }, [inventory]);

  // Escuchador en tiempo real para acreditación de pagos de Ualá Bis
  React.useEffect(() => {
    const rawLastPending = localStorage.getItem('ropero_last_pending_order');
    if (!rawLastPending) return;

    try {
      const parsed = JSON.parse(rawLastPending);
      const pendingId = parsed.orderId;
      if (!pendingId) return;

      const orderRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'orders', pendingId);
      const unsubscribe = onSnapshot(orderRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (['PAID', 'APPROVED', 'Confirmada'].includes(data.estado)) {
            localStorage.removeItem('ropero_last_pending_order');
            showAlert('¡Excelente! Tu pago ha sido acreditado y confirmado con éxito.', '¡Pago Exitoso!', 'success');
          }
        }
      });

      return () => unsubscribe();
    } catch (err) {
      console.error('Error escuchando orden pendiente:', err);
    }
  }, []);

  // Abrir modal de login si se proviene de una restauración de contraseña exitosa
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('showLogin') === 'true') {
      setShowAuthModal(true);
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
    
    const pagoStatus = params.get('pago');
    const orderId = params.get('orderId');

    // Retorno interceptado de Ualá
    if (pagoStatus === 'ok' && orderId) {
      localStorage.removeItem('ropero_last_pending_order');
      const confirmOrder = async () => {
        try {
          const orderRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'orders', orderId);
          const snap = await getDoc(orderRef);
          
          if (snap.exists()) {
            const data = snap.data();
            if (data.estado === 'Pendiente') {
              const fulfillPayload: any = {
                fecha: data.fecha,
                items: data.items,
                total: data.total,
                metodoPago: data.metodoPago,
              };
              if (data.costoEnvio !== undefined) fulfillPayload.costoEnvio = data.costoEnvio;
              if (data.giftCardUsada !== undefined) fulfillPayload.giftCardUsada = data.giftCardUsada;

              await fulfillWebOrder(PUBLIC_SHOWROOM_ID, orderId, fulfillPayload);
              
              // 1. Marcar como confirmada en orders oficiales
              await updateDoc(orderRef, { estado: 'Confirmada' });
              
              // 2. Marcar como confirmada en orders del cliente
              if (data.customerId && data.customerId !== 'GUEST') {
                 const customerOrderRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'customers', data.customerId, 'orders', orderId);
                 await updateDoc(customerOrderRef, { estado: 'Confirmada' });
              }

              sendSaleConfirmationEmail(
                {
                  id: data.saleId || orderId,
                  fecha: data.fecha,
                  metodoPago: data.metodoPago,
                  costoEnvio: data.costoEnvio,
                  items: data.items || [],
                  total: data.total || 0,
                  giftCardUsada: data.giftCardUsada
                },
                data.customerNombre || 'Cliente',
                data.customerEmail,
                'web'
              );

              showAlert('¡Tu pago se acreditó correctamente! El pedido ha sido confirmado.', '¡Pago Exitoso!', 'success');
            }
          } else {
             // Verificar si ya estaba confirmado (por si recarga la pagina)
             const orderRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'orders', orderId);
             const snap = await getDoc(orderRef);
             if (snap.exists() && snap.data().estado === 'Confirmada') {
               // Ya está confirmada, no hacer nada más que un feedback silente
               console.log('El pedido ya había sido confirmado.');
             }
          }
        } catch (e) {
          console.error('Error al confirmar pago de Ualá:', e);
          showAlert('Hubo un error al confirmar tu pedido. Si tu pago se debitó, contactanos por WhatsApp.', 'Atención con tu Pedido', 'error');
        } finally {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      };
      confirmOrder();
    } else if (pagoStatus === 'error' && orderId) {
      const handlePaymentErrorReturn = async () => {
        try {
          const orderRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'orders', orderId);
          const snap = await getDoc(orderRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.estado === 'Confirmada') {
              localStorage.removeItem('ropero_last_pending_order');
              showAlert('¡Tu pago fue acreditado exitosamente! El pedido ya está confirmado.', '¡Pago Exitoso!', 'success');
            } else {
              const fullOrder = { orderId, ...data };
              setPendingPaymentOrder(fullOrder);
              try {
                localStorage.setItem('ropero_last_pending_order', JSON.stringify(fullOrder));
              } catch (err) {
                console.error('Error guardando en localStorage:', err);
              }
            }
          } else {
            setPendingPaymentOrder({ orderId });
          }
        } catch (e) {
          console.error("Error al obtener datos de la orden pendiente:", e);
          setPendingPaymentOrder({ orderId });
        } finally {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      };
      handlePaymentErrorReturn();
    } else {
      // Recuperar última orden pendiente si el usuario regresa sin parámetros en la URL
      try {
        const rawSaved = localStorage.getItem('ropero_last_pending_order');
        if (rawSaved) {
          const parsed = JSON.parse(rawSaved);
          const targetId = parsed.orderId || parsed.id;
          if (targetId) {
            const orderRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'orders', targetId);
            getDoc(orderRef).then(snap => {
              if (snap.exists()) {
                const data = snap.data();
                if (data.estado === 'PENDING_PAYMENT' || data.estado === 'Pendiente') {
                  setPendingPaymentOrder({ orderId: targetId, ...data });
                } else {
                  localStorage.removeItem('ropero_last_pending_order');
                }
              } else {
                setPendingPaymentOrder(parsed);
              }
            }).catch(err => {
              console.error('Error al verificar estado de orden guardada:', err);
              setPendingPaymentOrder(parsed);
            });
          }
        }
      } catch (e) {
        console.error('Error al restaurar orden pendiente local:', e);
      }
    }
  }, []);

  // Unified body scroll-lock hook for high-end mobile experience
  React.useEffect(() => {
    const isAnyOverlayActive = showNav || showCart || !!selectedProduct || showAuthModal || showDashboard || showCheckout || showTerms || showLocation || showSizeGuideModal || !!pendingPaymentOrder;
    if (isAnyOverlayActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showNav, showCart, selectedProduct, showAuthModal, showDashboard, showCheckout, showTerms, showLocation, showSizeGuideModal, pendingPaymentOrder]);

  // Blur active input (like search) on scroll to hide mobile keyboard and allow smooth scrolling
  React.useEffect(() => {
    const handleScroll = () => {
      if (document.activeElement instanceof HTMLInputElement) {
        document.activeElement.blur();
      }
    };
    window.addEventListener('touchmove', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('touchmove', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 1. Initial cart load / Guest cart persistence
  React.useEffect(() => {
    if (!user && inventory.length > 0) {
      const raw = localStorage.getItem('ropero_guest_cart');
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SavedCartItem[];
          const mapped = parsed.map(c => {
            const prod = inventory.find(i => i.id === c.productId);
            return prod ? { product: prod, quantity: c.quantity, payMethod: c.payMethod, selectedTalle: c.selectedTalle, selectedColor: c.selectedColor } : null;
          }).filter(Boolean) as CartItem[];
          setCart(mapped);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [user, inventory]);

  // 2. Load Cart from Logged In profile
  React.useEffect(() => {
    if (user && customerProfile && inventory.length > 0) {
      const remoteCart = customerProfile.cart || [];
      const mapped = remoteCart.map(c => {
        const prod = inventory.find(i => i.id === c.productId);
        return prod ? { product: prod, quantity: c.quantity, payMethod: c.payMethod, selectedTalle: c.selectedTalle, selectedColor: c.selectedColor } : null;
      }).filter(Boolean) as CartItem[];
      
      const diff = JSON.stringify(mapped.map(c => ({ id: c.product.id, q: c.quantity, m: c.payMethod, t: c.selectedTalle, cl: c.selectedColor }))) !== 
                   JSON.stringify(cart.map(c => ({ id: c.product.id, q: c.quantity, m: c.payMethod, t: c.selectedTalle, cl: c.selectedColor })));
      if (diff) {
        setCart(mapped);
      }
    }
  }, [user, customerProfile, inventory]);

  // 3. Save / Sync Cart state when changed
  const updateCartStateAndSync = (newCart: CartItem[]) => {
    setCart(newCart);
    const savedItems: SavedCartItem[] = newCart.map(c => ({
      productId: c.product.id,
      quantity: c.quantity,
      payMethod: c.payMethod,
      selectedTalle: c.selectedTalle,
      selectedColor: c.selectedColor
    }));
    syncCart(savedItems);
  };

  // Footer Modals

  React.useEffect(() => {
    if (inventoryProp) {
      setInventory(inventoryProp);
      if (settingsProp) {
        setWebSettings({
          announcementText: '20% de descuento pagando por transferencia ★',
          aboutUsText: 'El Ropero es el resultado de un compromiso profundo con la indumentaria y cada detalle. Lo que comenzó como un proyecto personal impulsado por esfuerzo y dedicación, se consolidó hoy como un espacio donde pensamos en cada mujer. Cada paso de nuestro camino está marcado por la gratitud hacia quienes nos eligen.',
          locationShowroomAddress: 'San Martín 382, Chivilcoy',
          locationShowroomMapUrl: 'https://www.google.com/maps/search/?api=1&query=San+Martin+382+Chivilcoy+Buenos+Aires',
          locationPickupAddress: 'Recoleta, CABA',
          locationPickupMapUrl: 'https://www.google.com/maps/search/?api=1&query=Recoleta+CABA',
          ...settingsProp
        });
      }
      setIsLoading(false);
      return;
    }

    const ref = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setInventory(data.inventory || []);
        if (data.webSettings) {
          setWebSettings({
            announcementText: '20% de descuento pagando por transferencia ★',
            aboutUsText: 'El Ropero es el resultado de un compromiso profundo con la indumentaria y cada detalle. Lo que comenzó como un proyecto personal impulsado por esfuerzo y dedicación, se consolidó hoy como un espacio donde pensamos en cada mujer. Cada paso de nuestro camino está marcado por la gratitud hacia quienes nos eligen.',
            locationShowroomAddress: 'San Martín 382, Chivilcoy',
            locationShowroomMapUrl: 'https://www.google.com/maps/search/?api=1&query=San+Martin+382+Chivilcoy+Buenos+Aires',
            locationPickupAddress: 'Recoleta, CABA',
            locationPickupMapUrl: 'https://www.google.com/maps/search/?api=1&query=Recoleta+CABA',
            ...data.webSettings
          });
        }
      }
      setIsLoading(false);
    }, () => setIsLoading(false));
    return unsub;
  }, [inventoryProp, settingsProp]);

  React.useEffect(() => {
    if (webSettings?.ualaEnvironment) {
      setUalaEnvironment(webSettings.ualaEnvironment);
    }
  }, [webSettings?.ualaEnvironment]);

  // Discount helper: max of product-level and section-level discount
  const getDiscount = React.useCallback((item: InventoryItem) => {
    const itemDisc = item.descuentoWeb || 0;
    const sectionDisc = webSettings.discountBySection?.[item.categoria] || 0;
    return Math.max(itemDisc, sectionDisc);
  }, [webSettings.discountBySection]);

  const getDiscountedPrice = React.useCallback((price: number, discount: number, isTransferencia?: boolean) => {
    if (isTransferencia) {
      const extraDesc = Math.max(0, discount - DESCUENTO_BASE_TRANSFERENCIA);
      return Math.round(price * (1 - extraDesc / 100));
    }
    if (discount <= 0) return price;
    return Math.round(price * (1 - discount / 100));
  }, []);

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

  const instagramUrl = React.useMemo(() => {
    if (!webSettings.instagramHandle?.trim()) return null;
    const handle = webSettings.instagramHandle.replace(/^@/, '').trim();
    return `https://www.instagram.com/${handle}`;
  }, [webSettings.instagramHandle]);

  const startExchange = (order: CustomerOrder) => {
    const days = Math.floor((Date.now() - new Date(order.fecha).getTime()) / 86400000);
    if (days > 15) {
      showAlert('Ya han pasado 15 días desde la compra.', 'Plazo Vencido', 'warning');
      return;
    }
    const originalItems = buildSaleItemsFromOrder(order, inventory);
    setExchangeSession({
      order,
      originalItems,
      itemsDevueltos: [],
      cantDevueltasInput: {},
      giftDestinatario: customerProfile?.nombre || '',
    });
    setExchangeSuccessMsg(null);
    setCart([]);
    updateCartStateAndSync([]);
    setShowDashboard(false);
    setCategory('');
    setSearch('');
    setTimeout(() => {
      document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  const cancelExchange = async () => {
    if (exchangeSession && !(await showConfirm('¿Cancelar el cambio en curso?', 'Cambio en Curso', 'warning'))) return;
    setExchangeSession(null);
    setExchangeSuccessMsg(null);
  };

  const toggleDevuelto = (item: SaleItem) => {
    if (!exchangeSession) return;
    setExchangeSession((prev) => {
      if (!prev) return prev;
      const exists = prev.itemsDevueltos.some((i) => i.id === item.id);
      if (exists) {
        const cant = { ...prev.cantDevueltasInput };
        delete cant[item.id];
        return {
          ...prev,
          cantDevueltasInput: cant,
          itemsDevueltos: prev.itemsDevueltos.filter((i) => i.id !== item.id),
        };
      }
      const qty = prev.cantDevueltasInput[item.id] ?? 1;
      return {
        ...prev,
        itemsDevueltos: [...prev.itemsDevueltos, { ...item, cantidad: Math.min(qty, item.cantidad) }],
      };
    });
  };

  const updateDevueltoQty = (item: SaleItem, qty: number) => {
    if (!exchangeSession) return;
    const val = Math.min(Math.max(1, qty), item.cantidad);
    setExchangeSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cantDevueltasInput: { ...prev.cantDevueltasInput, [item.id]: val },
        itemsDevueltos: prev.itemsDevueltos.map((i) =>
          i.id === item.id ? { ...i, cantidad: val } : i
        ),
      };
    });
  };

  const confirmExchange = async () => {
    if (!exchangeSession) return;
    if (exchangeSession.itemsDevueltos.length === 0) {
      showAlert('Marcá al menos una prenda a devolver en la barra superior.', 'Prenda Requerida', 'warning');
      return;
    }

    const totalDev = sumTransferLines(exchangeSession.itemsDevueltos);
    const totalNuevo = cart.reduce((sum, c) => {
      const disc = getDiscount(c.product);
      const price = getDiscountedPrice(c.product.ventaEfectivo, disc, true);
      return sum + price * c.quantity;
    }, 0);
    const diferencia = totalNuevo - totalDev;

    if (cart.length === 0 && diferencia >= 0) {
      const ok = await showConfirm(
        `¿Generar Gift Card por $${totalDev.toLocaleString('es-AR')}?\nNo hay devoluciones de dinero.`,
        'Generar Gift Card',
        'info'
      );
      if (!ok) return;
    }

    if (diferencia < 0 && !exchangeSession.giftDestinatario.trim()) {
      showAlert('Indicá el nombre para la Gift Card.', 'Dato Faltante', 'warning');
      return;
    }

    if (diferencia > 0 && !mercadoPagoUrl) {
      showAlert('El local no configuró Mercado Pago para el pago de la diferencia.', 'Configuración Faltante', 'error');
      return;
    }

    setIsConfirmingExchange(true);
    try {
      const ventaOriginalId = getOrderSaleId(exchangeSession.order)!;
      const itemsNuevos = cartLinesToSaleItems(cart, getDiscount);
      const { saleId, giftCodigo } = await fulfillWebCambio(PUBLIC_SHOWROOM_ID, {
        ventaOriginalId,
        itemsDevueltos: exchangeSession.itemsDevueltos,
        itemsNuevos,
        diferencia,
        giftDestinatario: exchangeSession.giftDestinatario,
        customerNombre: customerProfile?.nombre,
      });

      if (diferencia > 0 && mercadoPagoUrl) {
        window.open(mercadoPagoUrl, '_blank', 'noopener,noreferrer');
      }

      let msg = `Cambio registrado en caja (${saleId}).`;
      if (giftCodigo) {
        msg += ` Gift Card: ${giftCodigo}`;
        if (user) {
          await assignGiftCard(giftCodigo);
          showAlert(`Se generó una Gift Card a tu favor con código ${giftCodigo}. Anotalo para futuras compras.`, '¡Gift Card Creada!', 'success');
        } else {
          showAlert(`Se generó una Gift Card a tu favor con código ${giftCodigo}. Anotalo para futuras compras.`, '¡Gift Card Creada!', 'success');
        }
      } else {
        showAlert('El cambio ha sido registrado correctamente.', 'Cambio Exitoso', 'success');
      }
      
      sendNotificationEmail(
        `Nuevo Cambio Web - ${customerProfile?.nombre || 'Cliente'}`,
        `Se ha registrado un nuevo cambio web.\nID de Venta (Caja): ${saleId}\nDiferencia: $${diferencia}\n${giftCodigo ? `Gift Card generada: ${giftCodigo}` : ''}`
      );

      if (user) {
        try {
          const orderRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'customers', user.uid, 'orders', exchangeSession.order.id);
          await updateDoc(orderRef, { isExchanged: true });
        } catch (err) {
          console.error('Error al marcar orden como cambiada:', err);
        }
      }

      setExchangeSuccessMsg(msg);
      setExchangeSession(null);
      setCart([]);
      updateCartStateAndSync([]);
      setShowCart(false);
      await refreshOrders();
    } catch (e: unknown) {
      console.error(e);
      showAlert(e instanceof Error ? e.message : 'No se pudo confirmar el cambio.', 'Error en Cambio', 'error');
    } finally {
      setIsConfirmingExchange(false);
    }
  };

  const availableTalles = React.useMemo(() => {
    const set = new Set<string>();
    inventory.forEach(item => {
      if (item.talles) item.talles.forEach(t => set.add(t));
      if (item.stockPorVariante) {
        Object.keys(item.stockPorVariante).forEach(k => {
          const parts = k.split('-');
          if (parts[0]) set.add(parts[0]);
        });
      }
    });
    return Array.from(set).sort();
  }, [inventory]);

  const availableColores = React.useMemo(() => {
    const set = new Set<string>();
    inventory.forEach(item => {
      if (item.colores) item.colores.forEach(c => set.add(c.toUpperCase()));
      if (item.coloresStock) Object.keys(item.coloresStock).forEach(c => set.add(c.toUpperCase()));
    });
    return Array.from(set).sort();
  }, [inventory]);

  const filteredItems = React.useMemo(() => {
    const hiddenSections = webSettings.hiddenSections || [];
    let result = inventory
      .filter(i => i.cantidad > 0 && i.visible !== false && !hiddenSections.includes(i.categoria))
      .filter(i => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (i.descripcion || '').toLowerCase().includes(q) || 
               (i.proveedor || '').toLowerCase().includes(q) || 
               (i.categoria || '').toLowerCase().includes(q);
      })
      .filter(i => {
        if (!category) return true;
        if (category === 'SALE') return getDiscount(i) > 0;
        return i.categoria === category;
      })
      .filter(i => {
        if (!filterTalle) return true;
        if (i.talles) return i.talles.includes(filterTalle);
        if (i.stockPorVariante) {
          return Object.keys(i.stockPorVariante).some(k => k.toLowerCase().startsWith(filterTalle.toLowerCase() + '-') && (i.stockPorVariante![k] || 0) > 0);
        }
        return true;
      })
      .filter(i => {
        if (!filterColor) return true;
        if (i.colores) return i.colores.some(c => c.toLowerCase() === filterColor.toLowerCase());
        if (i.coloresStock) {
          return Object.keys(i.coloresStock).some(k => k.toLowerCase() === filterColor.toLowerCase() && (i.coloresStock![k] || 0) > 0);
        }
        return true;
      });

    if (sortOption === 'precio-asc') {
      result = [...result].sort((a, b) => a.ventaEfectivo - b.ventaEfectivo);
    } else if (sortOption === 'precio-desc') {
      result = [...result].sort((a, b) => b.ventaEfectivo - a.ventaEfectivo);
    } else if (sortOption === 'nombre') {
      result = [...result].sort((a, b) => a.descripcion.localeCompare(b.descripcion));
    }
    return result;
  }, [inventory, search, category, filterTalle, filterColor, sortOption, getDiscount, webSettings.hiddenSections]);

  const sections = React.useMemo(() => {
    const hiddenSections = webSettings.hiddenSections || [];
    return (webSettings.categoriesOrder || []).filter(c => !hiddenSections.includes(c));
  }, [webSettings.categoriesOrder, webSettings.hiddenSections]);

  // Cart logic
  const getVariantStock = (product: InventoryItem, talle?: string, color?: string): number => {
    if (product.stockPorVariante && talle && color) {
      return product.stockPorVariante[`${talle}-${color}`] ?? 0;
    }
    if (product.coloresStock && color) {
      return product.coloresStock[color] ?? 0;
    }
    return product.cantidad;
  };

  const addToCart = (product: InventoryItem, talle?: string, color?: string) => {
    const maxQty = getVariantStock(product, talle, color);

    if (maxQty <= 0) {
      showAlert("Lo sentimos, este color no está disponible actualmente.", "Agotado", "warning");
      return;
    }

    let nextCart: CartItem[] = [];
    const existing = cart.find(c => c.product.id === product.id && c.selectedTalle === talle && c.selectedColor === color);
    if (existing) {
      if (existing.quantity >= maxQty) {
        showAlert(`Alcanzaste el límite de stock disponible para el color ${color || 'seleccionado'}.`, "Límite de Stock", "warning");
        return;
      }
      nextCart = cart.map(c => (c.product.id === product.id && c.selectedTalle === talle && c.selectedColor === color) ? { ...c, quantity: c.quantity + 1 } : c);
    } else {
      nextCart = [...cart, { product, quantity: 1, payMethod: 'transferencia', selectedTalle: talle, selectedColor: color }];
    }
    updateCartStateAndSync(nextCart);
    if (exchangeSession) setShowCart(true);
    setAddedFeedback(product.id);
    setTimeout(() => setAddedFeedback(null), 1200);

    // Activar aviso de prenda agregada al carrito
    if (cartToastTimerRef.current) clearTimeout(cartToastTimerRef.current);
    setCartToastNotification({ item: product, talle, color });
    cartToastTimerRef.current = setTimeout(() => {
      setCartToastNotification(null);
    }, 4000);
  };

  const updateQty = (id: string, delta: number, talle?: string, color?: string) => {
    const nextCart = cart.map(c => {
      if (c.product.id !== id || c.selectedTalle !== talle || c.selectedColor !== color) return c;
      const next = c.quantity + delta;
      
      const maxQty = getVariantStock(c.product, talle, color);

      if (next < 1 || next > maxQty) return c;
      return { ...c, quantity: next };
    });
    updateCartStateAndSync(nextCart);
  };


  const removeFromCart = (id: string, talle?: string, color?: string) => {
    const nextCart = cart.filter(c => !(c.product.id === id && c.selectedTalle === talle && c.selectedColor === color));
    updateCartStateAndSync(nextCart);
  };

  const [guestWishlist, setGuestWishlist] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!customerProfile) {
      setGuestWishlist(JSON.parse(localStorage.getItem('ropero_guest_wishlist') || '[]'));
    }
  }, [customerProfile]);

  // Wishlist Logic
  const handleToggleFavorite = async (productId: string) => {
    const list = customerProfile?.wishlist || guestWishlist;
    if (list.includes(productId)) {
      await removeFromWishlist(productId);
    } else {
      await addToWishlist(productId);
    }
    if (!customerProfile) {
      setGuestWishlist(JSON.parse(localStorage.getItem('ropero_guest_wishlist') || '[]'));
    }
  };

  const isFavorited = (productId: string) => {
    const list = customerProfile?.wishlist || guestWishlist;
    return list.includes(productId);
  };

  const [paymentMethod, setPaymentMethod] = React.useState<'transferencia' | 'tarjeta'>('transferencia');
  const [showCartGiftInput, setShowCartGiftInput] = React.useState(false);
  const [cartGiftCode, setCartGiftCode] = React.useState('');
  
  const [appliedGiftCard, setAppliedGiftCard] = React.useState<GiftCard | null>(null);
  const [isValidatingCartGift, setIsValidatingCartGift] = React.useState(false);
  const [cartGiftError, setCartGiftError] = React.useState<string | null>(null);

  const handleApplyCartGift = async () => {
    if (!cartGiftCode.trim()) return;
    setIsValidatingCartGift(true);
    setCartGiftError(null);
    try {
      const showroomRef = doc(db, 'showrooms', PUBLIC_SHOWROOM_ID);
      const snap = await getDoc(showroomRef);
      if (!snap.exists()) {
        setCartGiftError('Showroom no encontrado.');
        setIsValidatingCartGift(false);
        return;
      }
      const data = snap.data();
      const giftCards: GiftCard[] = data.giftCards || [];
      const found = giftCards.find(
        (gc) => gc.codigo.trim().toUpperCase() === cartGiftCode.trim().toUpperCase()
      );
      if (!found) {
        setCartGiftError('Código de Gift Card no válido o no existe.');
      } else if (found.estado !== 'ACTIVA') {
        setCartGiftError(`Esta Gift Card no está activa (Estado: ${found.estado}).`);
      } else if (found.saldo <= 0) {
        setCartGiftError('Esta Gift Card ya no tiene saldo disponible.');
      } else {
        setAppliedGiftCard(found);
        setCartGiftCode('');
      }
    } catch (err) {
      console.error(err);
      setCartGiftError('Error al validar la Gift Card. Intentá de nuevo.');
    } finally {
      setIsValidatingCartGift(false);
    }
  };

  const handleRemoveCartGift = () => {
    setAppliedGiftCard(null);
    setCartGiftError(null);
  };

  const handleCheckoutSuccess = () => {
    updateCartStateAndSync([]);
    setAppliedGiftCard(null);
    setPaymentMethod('transferencia');
  };

  const cartTotal = React.useMemo(() => {
    return cart.reduce((sum, c) => {
      const disc = getDiscount(c.product);
      const basePrice = paymentMethod === 'transferencia' ? c.product.ventaEfectivo : c.product.ventaTarjeta;
      const price = getDiscountedPrice(basePrice, disc, paymentMethod === 'transferencia');
      return sum + price * c.quantity;
    }, 0);
  }, [cart, getDiscount, getDiscountedPrice, paymentMethod]);

  const cartGiftDiscountAmount = React.useMemo(() => {
    if (!appliedGiftCard) return 0;
    return Math.min(appliedGiftCard.saldo, cartTotal);
  }, [appliedGiftCard, cartTotal]);

  const finalCartTotal = Math.max(0, cartTotal - cartGiftDiscountAmount);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const totalDevueltoExchange = React.useMemo(() => {
    if (!exchangeSession) return 0;
    return sumTransferLines(exchangeSession.itemsDevueltos);
  }, [exchangeSession]);

  const diferenciaExchange = finalCartTotal - totalDevueltoExchange;

  const sendWhatsApp = () => {
    const store = (webSettings.storeName || 'El Ropero').trim();
    let msg = `🛍️ *Pedido — ${store} Showroom*\n\n`;
    cart.forEach((c, i) => {
      const disc = getDiscount(c.product);
      const price = getDiscountedPrice(c.product.ventaEfectivo, disc, true);
      msg += `${i + 1}. ${c.product.descripcion}\n`;
      if (c.selectedTalle) msg += `   Talle: ${c.selectedTalle}\n`;
      if (c.selectedColor) msg += `   Color: ${c.selectedColor}\n`;
      const extraDesc = Math.max(0, disc - DESCUENTO_BASE_TRANSFERENCIA);
      if (extraDesc > 0) msg += `   Descuento: ${disc}%\n`;
      msg += `   Cant: ${c.quantity} × $${price.toLocaleString('es-AR')} (Transferencia)\n`;
      msg += `   Subtotal: $${(price * c.quantity).toLocaleString('es-AR')}\n\n`;
    });
    msg += `━━━━━━━━━━━━━━━\n*TOTAL: $${cartTotal.toLocaleString('es-AR')}*`;
    const phone = (webSettings.contactWhatsapp || '5492346685836').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const closeQuickView = () => {
    setSelectedProduct(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('product');
    url.searchParams.delete('producto');
    window.history.replaceState({}, '', url.toString());
  };

  const openQuickView = (product: InventoryItem) => {
    setSelectedProduct(product);
    
    // Find the first talle that has stock in any color
    const defaultTalle = product.talles?.find(t => {
      if (!product.colores || product.colores.length === 0) return true; // No colors, just pick this talle
      return product.colores.some(c => getVariantStock(product, t, c) > 0);
    }) || product.talles?.[0] || '';
    
    setModalTalle(defaultTalle);
    
    // Find the first color that has stock for the selected talle
    const defaultColor = product.colores?.find(c => {
      return getVariantStock(product, defaultTalle, c) > 0;
    }) || product.colores?.[0] || '';
    
    setModalColor(defaultColor);
    setModalImgIdx(0);

    const url = new URL(window.location.href);
    url.searchParams.set('product', product.id);
    window.history.replaceState({}, '', url.toString());
  };


  if (isLoading && inventory.length === 0) {
    return <InnovativeLoader storeName={webSettings.storeName || 'EL ROPERO'} />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col text-black font-['Inter'] selection:bg-black selection:text-white overflow-x-clip w-full">
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&display=swap');
        
        * { box-sizing: border-box; }
        body {
          font-family: 'Inter', sans-serif;
          color: #111111; /* Dark grey / black for maximum contrast */
        }
        
        /* Overrides to increase contrast and readability for low opacity Tailwind classes */
        .text-black\/30, .text-black\/40 {
          color: #3F3F46 !important; /* Zinc-700 dark grey */
        }
        .text-black\/50, .text-black\/60 {
          color: #27272A !important; /* Zinc-800 very dark grey */
        }
        .opacity-30, .opacity-40, .opacity-50 {
          opacity: 0.8 !important; /* Higher contrast */
        }
        
        /* Improve legibility of smaller text sizes */
        .text-\[9px\] {
          font-size: 10px !important;
          font-weight: 500 !important;
        }
        .text-\[10px\] {
          font-size: 11px !important;
          font-weight: 500 !important;
        }
        .text-\[11px\] {
          font-size: 12px !important;
        }
        
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* Barra desplazante personalizada para el panel lateral (sidebar) */
        .sidebar-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .sidebar-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.04);
          border-radius: 4px;
        }
        .sidebar-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.25);
          border-radius: 4px;
        }
        .sidebar-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.45);
        }
        .sidebar-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 0, 0, 0.25) rgba(0, 0, 0, 0.04);
        }

        .fade-in { animation: fadeIn 0.6s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .drawer-slide-in { animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        
        @keyframes slideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        .drawer-slide-in-left { animation: slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        .marquee-container {
          overflow: hidden;
          white-space: nowrap;
          background-color: #ffffff;
          color: #000000;
          padding: 10px 0;
          display: flex;
          font-size: 9px;
          letter-spacing: 3px;
          font-weight: 500;
          text-transform: uppercase;
          user-select: none;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        .marquee-content {
          display: inline-flex;
          white-space: nowrap;
          animation: marquee-scroll 40s linear infinite;
        }

        .marquee-item {
          padding: 0 4rem;
          display: inline-flex;
          align-items: center;
          gap: 2rem;
        }

        @keyframes marquee-scroll {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {/* ══════ HEADER ══════ */}
      <header 
        ref={headerRef} 
        className={`sticky top-0 z-[60] bg-white/95 backdrop-blur-md border-b border-black/10 transition-all duration-300 ${
          isScrolled ? 'shadow-sm border-black/15' : 'shadow-xs'
        }`}
      >
        <div className={`flex items-center justify-between px-4 sm:px-8 transition-all duration-300 ${
          isScrolled ? 'h-11 sm:h-12' : 'h-14 sm:h-16'
        }`}>
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            <button onClick={() => setShowNav(true)} className="flex items-center gap-2 hover:opacity-60 transition-opacity">
              <Menu size={18} strokeWidth={1.2} />
              <span className="hidden sm:inline text-[10px] tracking-[0.25em] uppercase font-light">Menú</span>
            </button>
            <button onClick={() => setShowSearch(!showSearch)} className="hover:opacity-60 transition-opacity">
              <Search size={17} strokeWidth={1.2} />
            </button>
          </div>

          <Link to="/" className="flex-1 min-w-0 flex items-center justify-center text-center px-2" onClick={() => { setCategory(''); setSearch(''); }}>
            <h1 className={`tracking-[0.28em] uppercase font-light leading-none whitespace-nowrap transition-all duration-300 select-none text-black ${
              isScrolled ? 'text-[11px] sm:text-[14px] md:text-[15px]' : 'text-[13px] sm:text-[16px] md:text-[18px]'
            }`}>
              {webSettings.storeName || 'EL ROPERO'}
            </h1>
          </Link>

          <div className="flex items-center justify-end gap-4 sm:gap-6 shrink-0">
            {/* User Icon */}
            <button 
              onClick={() => user ? setShowDashboard(true) : setShowAuthModal(true)} 
              className="hover:opacity-60 transition-opacity flex items-center gap-1.5"
            >
              <User size={18} strokeWidth={1.2} />
              {user && customerProfile?.nombre && (
                <span className="hidden md:inline text-[9px] tracking-[0.2em] uppercase font-light truncate max-w-[90px]">
                  {customerProfile.nombre.split(' ')[0]}
                </span>
              )}
            </button>

            {/* Gift Card Icon */}
            <button 
              onClick={handleOpenBuyGiftCard}
              className="hover:opacity-60 transition-opacity flex items-center gap-1.5"
              title="Regalar Gift Card"
            >
              <Gift size={18} strokeWidth={1.2} />
            </button>

            <button onClick={() => setShowCart(true)} className="relative hover:opacity-60 transition-opacity flex items-center gap-1.5">
              <ShoppingBag size={18} strokeWidth={1.2} />
              {cartCount > 0 && <span className="text-[10px] font-light tracking-widest">({cartCount})</span>}
            </button>
          </div>
        </div>

        {/* Infinite Announcement Marquee */}
        {webSettings.announcementText && (
          <div className={`marquee-container bg-black text-white border-none transition-all duration-300 ${
            isScrolled ? 'py-1 text-[8px]' : 'py-1.5'
          }`}>
            <div className="marquee-content text-[9px] tracking-[0.25em] font-light uppercase">
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
            </div>
          </div>
        )}

        {showSearch && (
          <div className="absolute top-full left-0 w-full bg-white border-b border-black/10 px-6 py-3.5 animate-in slide-in-from-top-2 duration-200">
            <div className="max-w-md mx-auto relative">
              <input
                autoFocus type="text" value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="BUSCAR PRENDA..."
                className="w-full text-[11px] tracking-[0.25em] uppercase bg-transparent border-b border-black/20 py-2 outline-none placeholder:text-neutral-400 font-light"
              />
              <button onClick={() => { setShowSearch(false); setSearch(''); }} className="absolute right-0 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100"><X size={16} strokeWidth={1.2} /></button>
            </div>
          </div>
        )}
      </header>

      {exchangeSuccessMsg && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-emerald-900">
            <CheckCircle size={18} />
            <p className="text-[10px] tracking-[1px] uppercase font-semibold">{exchangeSuccessMsg}</p>
          </div>
          <button type="button" onClick={() => setExchangeSuccessMsg(null)} className="opacity-50 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}



      {/* ══════ SIDE NAV ══════ */}
      {showNav && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[70] transition-opacity duration-300" onClick={() => setShowNav(false)} />
          <div className="fixed top-0 left-0 h-full w-[80vw] max-w-[300px] sm:w-[320px] bg-white z-[80] p-8 flex flex-col drawer-slide-in-left shadow-xl border-r border-black/10">
            <button onClick={() => setShowNav(false)} className="self-end mb-12 opacity-40 hover:opacity-100 p-1 rounded-none transition-all"><X size={18} strokeWidth={1.2} /></button>
            <nav className="space-y-5 overflow-y-auto sidebar-scrollbar pb-10 pr-2">
              <p className="text-[9px] tracking-[0.25em] uppercase text-neutral-400 font-light mb-6 border-b border-black/10 pb-3">Colección</p>
              
              <button onClick={() => { setCategory(''); setShowNav(false); }}
                className={`block w-full text-left text-[12px] sm:text-[14px] tracking-[0.22em] uppercase transition-all duration-200 ${!category ? 'font-normal text-black' : 'font-light text-neutral-500 hover:text-black'}`}>
                Ver Todo
              </button>

              <button onClick={() => { setCategory('SALE'); setShowNav(false); }}
                className={`block w-full text-left text-[12px] sm:text-[14px] tracking-[0.22em] uppercase transition-all duration-200 ${category === 'SALE' ? 'font-normal text-black underline underline-offset-4' : 'font-light text-neutral-500 hover:text-black'}`}>
                SALE
              </button>

              {sections.map(s => (
                <button key={s} onClick={() => { setCategory(s); setShowNav(false); }}
                  className={`block w-full text-left text-[12px] sm:text-[14px] tracking-[0.22em] uppercase transition-all duration-200 ${category === s ? 'font-normal text-black' : 'font-light text-neutral-500 hover:text-black'}`}>
                  {s}
                </button>
              ))}

              <button onClick={() => { handleOpenBuyGiftCard(); setShowNav(false); }}
                className={`block w-full text-left text-[11px] tracking-[0.22em] uppercase transition-all duration-200 font-light text-neutral-500 hover:text-black mt-6 border-t border-black/10 pt-6 flex items-center gap-2`}>
                Gift Card <Gift size={16} strokeWidth={1.2} />
              </button>
            </nav>
          </div>
        </>
      )}

      {/* ══════ HERO ══════ */}
      {webSettings.storeHidden ? (
        <section className="w-full h-[70vh] flex flex-col items-center justify-center text-center px-6">
          <div className="max-w-md mx-auto space-y-6">
            <div className="w-12 h-12 border border-black/20 rounded-none flex items-center justify-center mx-auto mb-4">
              <Loader2 size={20} className="text-black/40 animate-spin" />
            </div>
            <h2 className="text-base sm:text-lg tracking-[0.25em] uppercase font-light leading-tight">
              TIENDA EN MANTENIMIENTO
            </h2>
            <p className="text-[11px] font-light leading-relaxed text-neutral-500">
              Estamos actualizando nuestro catálogo o realizando tareas de mantenimiento. Por favor, vuelve más tarde.
            </p>
            {(webSettings.contactWhatsapp || '5492346685836') && (
              <a 
                href={`https://wa.me/${(webSettings.contactWhatsapp || '5492346685836').replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hola El Ropero! Desde la pagina web me surgio una consulta sobre ...')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-6 text-[10px] tracking-[0.25em] uppercase font-light border-b border-black pb-0.5 hover:opacity-50 transition-opacity"
              >
                CONTACTANOS POR WHATSAPP
              </a>
            )}
          </div>
        </section>
      ) : (
        <>
          {!category && !search && (
            <section className="w-full">
              <div className="relative w-full h-[65vh] sm:h-[80vh] overflow-hidden bg-neutral-100">
            <img src={webSettings.heroImageUrl || '/assets/hero.png'} alt={webSettings.heroTitle || 'Portada'} className="w-full h-full object-cover grayscale brightness-95 contrast-105"/>
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 sm:pb-24 px-6 text-center text-white bg-gradient-to-t from-black/40 via-transparent to-transparent">
              <p className="text-[10px] tracking-[0.3em] uppercase font-light mb-3">{webSettings.heroSubtitle || 'Nuevo Ingreso'}</p>
              <h2 className="text-xl sm:text-3xl tracking-[0.25em] uppercase font-light leading-none mb-6">{webSettings.heroTitle || ''}</h2>
              <button onClick={() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })} className="bg-white text-black px-8 py-3 text-[10px] tracking-[0.25em] uppercase font-light rounded-none hover:bg-black hover:text-white transition-all duration-300">Explorar</button>
            </div>
          </div>
        </section>
      )}

      {/* ══════ GIFT CARD BANNER (SUBTLE & COMPACT - DARK MODE) ══════ */}
      {!category && !search && !webSettings.storeHidden && (
        <section className="w-full bg-neutral-950 text-white py-4 px-6 sm:px-12">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
              <Gift size={16} strokeWidth={1.2} className="text-neutral-400 shrink-0" />
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="text-[10px] tracking-[0.22em] uppercase font-medium text-white">
                  Gift Cards Digitales
                </span>
                <span className="hidden sm:inline text-neutral-700">•</span>
                <span className="text-[10px] tracking-[0.08em] font-light text-neutral-400">
                  Regalá una tarjeta virtual con dedicatoria y envío inmediato por email.
                </span>
              </div>
            </div>
            <button 
              onClick={handleOpenBuyGiftCard}
              className="border border-white/80 text-white px-4 py-1.5 text-[9px] tracking-[0.2em] uppercase font-light hover:bg-white hover:text-black transition-all rounded-none shrink-0"
            >
              Regalar Gift Card
            </button>
          </div>
        </section>
      )}

      {/* ══════ COLLECTION ══════ */}
      <div id="catalogo" className="pt-12 sm:pt-20 px-4 sm:px-10 lg:px-14 flex flex-col items-center w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-32"><div className="w-6 h-6 border border-black/20 border-t-black animate-spin"></div></div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-32">
            <p className="text-[11px] tracking-[0.25em] uppercase text-neutral-400 font-light">
              {category ? `Sin stock disponible por el momento en ${category}` : 'No se han encontrado prendas'}
            </p>
          </div>
        ) : (
          <main className="w-full max-w-[1800px]">
            {/* ══════ CATALOG CONTROL BAR (MINIMALIST & AESTHETIC - ZHOUE STYLE) ══════ */}
            <div 
              style={{ top: `${headerHeight}px` }}
              className="sticky z-[40] bg-white/95 backdrop-blur-md py-3 px-4 sm:px-8 border-b border-black/10 text-xs tracking-wider mb-8 transition-all flex flex-wrap items-center justify-between gap-3 w-full"
            >
              {/* Left Side: Filter Trigger & Active Filter Badges */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <button 
                  onClick={() => setIsFilterDrawerOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 border border-black/20 text-neutral-900 hover:border-black hover:bg-neutral-50 transition-all cursor-pointer font-light tracking-[0.2em] uppercase text-[11px] bg-white"
                >
                  <SlidersHorizontal size={14} strokeWidth={1.5} className="text-neutral-700" />
                  <span>Filtrar</span>
                  {activeFilterCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[9px] font-medium flex items-center justify-center ml-0.5">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* Active Filter Chips */}
                {filterTalle && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 border border-neutral-200 text-neutral-800 text-[10px] uppercase font-light tracking-wider rounded-none">
                    Talle: <strong className="font-normal">{filterTalle}</strong>
                    <button onClick={() => setFilterTalle('')} className="hover:text-black text-neutral-400 ml-0.5" title="Remover filtro de talle">
                      <X size={12} />
                    </button>
                  </span>
                )}

                {filterColor && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 border border-neutral-200 text-neutral-800 text-[10px] uppercase font-light tracking-wider rounded-none">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={getColorDotStyle(filterColor)} />
                    Color: <strong className="font-normal">{filterColor}</strong>
                    <button onClick={() => setFilterColor('')} className="hover:text-black text-neutral-400 ml-0.5" title="Remover filtro de color">
                      <X size={12} />
                    </button>
                  </span>
                )}

                {sortOption !== 'destacados' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 border border-neutral-200 text-neutral-800 text-[10px] uppercase font-light tracking-wider rounded-none">
                    Orden: <strong className="font-normal">{sortOption === 'precio-asc' ? 'Menor $' : sortOption === 'precio-desc' ? 'Mayor $' : 'A-Z'}</strong>
                    <button onClick={() => setSortOption('destacados')} className="hover:text-black text-neutral-400 ml-0.5" title="Restablecer orden">
                      <X size={12} />
                    </button>
                  </span>
                )}

                {activeFilterCount > 0 && (
                  <button 
                    onClick={() => { setFilterTalle(''); setFilterColor(''); setSortOption('destacados'); }}
                    className="text-neutral-400 hover:text-black underline underline-offset-4 tracking-widest uppercase font-light ml-1 transition-colors text-[10px] cursor-pointer"
                  >
                    Limpiar todo
                  </button>
                )}
              </div>

              {/* Right Side: Quick Sort Trigger */}
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500 font-light ml-auto sm:ml-0">
                <span className="hidden sm:inline">Ordenar:</span>
                <select 
                  value={sortOption} 
                  onChange={(e) => setSortOption(e.target.value as any)}
                  className="px-2 py-1 bg-transparent border-b border-black/20 text-neutral-900 uppercase tracking-widest font-light focus:outline-none focus:border-black transition-colors rounded-none cursor-pointer text-[11px]"
                >
                  <option value="destacados">Destacados</option>
                  <option value="precio-asc">Precio: Menor a Mayor</option>
                  <option value="precio-desc">Precio: Mayor a Menor</option>
                  <option value="nombre">Nombre: A-Z</option>
                </select>
              </div>
            </div>

            {/* ══════ ZHOU-STYLE OFF-CANVAS FILTER DRAWER ══════ */}
            {isFilterDrawerOpen && (
              <div className="fixed inset-0 z-[100] flex justify-end">
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                  onClick={() => setIsFilterDrawerOpen(false)}
                />

                {/* Off-canvas Panel */}
                <div className="relative w-full max-w-md bg-white h-full shadow-2xl z-10 flex flex-col justify-between overflow-hidden transition-transform duration-300">
                  {/* Drawer Header */}
                  <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal size={16} strokeWidth={1.5} className="text-neutral-900" />
                      <h3 className="text-xs uppercase font-light tracking-[0.25em] text-neutral-900">
                        Filtros y Orden
                      </h3>
                      {activeFilterCount > 0 && (
                        <span className="text-[10px] bg-neutral-900 text-white px-2 py-0.5 rounded-full font-light">
                          {activeFilterCount}
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={() => setIsFilterDrawerOpen(false)}
                      className="p-2 text-neutral-500 hover:text-black transition-colors cursor-pointer"
                      aria-label="Cerrar filtros"
                    >
                      <X size={18} strokeWidth={1.5} />
                    </button>
                  </div>

                  {/* Drawer Body - Scrollable */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Talles Section */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-neutral-900">
                          Talles
                        </span>
                        {filterTalle && (
                          <button 
                            onClick={() => setFilterTalle('')} 
                            className="text-[10px] text-neutral-400 hover:text-black underline tracking-wider uppercase cursor-pointer"
                          >
                            Borrar
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setFilterTalle('')}
                          className={`px-3 py-2 text-xs tracking-wider uppercase transition-all border cursor-pointer ${
                            filterTalle === '' 
                              ? 'bg-neutral-900 text-white border-neutral-900 font-medium' 
                              : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-black font-light'
                          }`}
                        >
                          Todos
                        </button>
                        {availableTalles.map(t => {
                          const isSelected = filterTalle === t;
                          return (
                            <button
                              key={t}
                              onClick={() => setFilterTalle(isSelected ? '' : t)}
                              className={`min-w-[42px] px-3.5 py-2 text-xs tracking-wider uppercase transition-all border cursor-pointer ${
                                isSelected 
                                  ? 'bg-neutral-900 text-white border-neutral-900 font-medium shadow-xs' 
                                  : 'bg-neutral-50 text-neutral-800 border-neutral-200 hover:border-black font-light'
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Colores Section */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-neutral-900">
                          Colores
                        </span>
                        {filterColor && (
                          <button 
                            onClick={() => setFilterColor('')} 
                            className="text-[10px] text-neutral-400 hover:text-black underline tracking-wider uppercase cursor-pointer"
                          >
                            Borrar
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setFilterColor('')}
                          className={`px-3 py-2 text-xs tracking-wider uppercase text-left transition-all border flex items-center gap-2 cursor-pointer ${
                            filterColor === '' 
                              ? 'bg-neutral-900 text-white border-neutral-900 font-medium' 
                              : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-black font-light'
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full bg-neutral-300 inline-block" />
                          <span>Todos los colores</span>
                        </button>
                        {availableColores.map(c => {
                          const isSelected = filterColor.toLowerCase() === c.toLowerCase();
                          return (
                            <button
                              key={c}
                              onClick={() => setFilterColor(isSelected ? '' : c)}
                              className={`px-3 py-2 text-xs tracking-wider uppercase text-left transition-all border flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected 
                                  ? 'bg-neutral-900 text-white border-neutral-900 font-medium shadow-xs' 
                                  : 'bg-neutral-50 text-neutral-800 border-neutral-200 hover:border-black font-light'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span 
                                  className="w-3.5 h-3.5 rounded-full inline-block shrink-0 shadow-2xs" 
                                  style={getColorDotStyle(c)} 
                                />
                                <span className="truncate">{c}</span>
                              </div>
                              {isSelected && <Check size={14} className="shrink-0 text-white" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ordenar Por Section */}
                    <div>
                      <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-neutral-900 block mb-4">
                        Ordenar Por
                      </span>
                      <div className="space-y-2">
                        {[
                          { id: 'destacados', label: 'Destacados' },
                          { id: 'precio-asc', label: 'Precio: Menor a Mayor' },
                          { id: 'precio-desc', label: 'Precio: Mayor a Menor' },
                          { id: 'nombre', label: 'Nombre: A - Z' },
                        ].map(opt => {
                          const isSelected = sortOption === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => setSortOption(opt.id as any)}
                              className={`w-full px-4 py-2.5 text-xs tracking-wider uppercase text-left transition-all border flex items-center justify-between cursor-pointer ${
                                isSelected 
                                  ? 'bg-neutral-900 text-white border-neutral-900 font-medium' 
                                  : 'bg-neutral-50 text-neutral-800 border-neutral-200 hover:border-black font-light'
                              }`}
                            >
                              <span>{opt.label}</span>
                              {isSelected && <Check size={14} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Drawer Footer */}
                  <div className="p-6 border-t border-neutral-100 bg-white space-y-3">
                    <button
                      onClick={() => setIsFilterDrawerOpen(false)}
                      className="w-full bg-neutral-900 hover:bg-black text-white py-3.5 text-xs uppercase tracking-[0.25em] font-light transition-all cursor-pointer shadow-md"
                    >
                      Ver {filteredItems.length} {filteredItems.length === 1 ? 'Producto' : 'Productos'}
                    </button>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={() => {
                          setFilterTalle('');
                          setFilterColor('');
                          setSortOption('destacados');
                        }}
                        className="w-full text-center text-neutral-500 hover:text-black text-[11px] uppercase tracking-widest font-light py-1 cursor-pointer transition-colors"
                      >
                        Limpiar Todos los Filtros
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Floating Mobile Filter Pill */}
            {activeFilterCount > 0 && !isFilterDrawerOpen && (
              <div className="fixed bottom-6 right-6 z-[45] sm:hidden">
                <button
                  onClick={() => setIsFilterDrawerOpen(true)}
                  className="bg-neutral-900 text-white px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-xs tracking-widest uppercase font-light border border-white/20 active:scale-95 transition-transform cursor-pointer"
                >
                  <SlidersHorizontal size={14} />
                  <span>Filtros</span>
                  <span className="w-4 h-4 rounded-full bg-white text-black text-[9px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                </button>
              </div>
            )}

            {/* Si no hay filtro, mostrar por secciones */}
            {!category && !search ? (
              sections.map(sec => {
                const secItems = filteredItems.filter(i => i.categoria === sec);
                if (secItems.length === 0) return null;
                const secDisc = webSettings.discountBySection?.[sec] || 0;
                return (
                  <section key={sec} className="mb-24 sm:mb-32">
                    <div className="px-4 mb-10 flex flex-col items-center text-center">
                      <div className="flex items-center justify-center gap-6 w-full max-w-xs mx-auto">
                        <div className="h-[1px] bg-black/10 flex-1"></div>
                        <h2 className="text-xs sm:text-sm tracking-[0.25em] uppercase font-light text-neutral-900">{sec}</h2>
                        <div className="h-[1px] bg-black/10 flex-1"></div>
                      </div>
                      {secDisc > 0 && <span className="mt-3 inline-block bg-black text-white px-3 py-1 text-[9px] tracking-[0.2em] uppercase font-light rounded-none">-{secDisc}% OFF</span>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-10 sm:gap-y-16 gap-x-3 sm:gap-x-6">
                      {secItems.map((item, idx) => <ProductCard key={item.id} item={item} idx={idx} onOpen={openQuickView} addedFeedback={addedFeedback} onAddToCart={addToCart} discount={getDiscount(item)} isFavorited={isFavorited(item.id)} onToggleFavorite={handleToggleFavorite}/>)}
                    </div>
                  </section>
                );
              }).concat([(() => {
                const otherItems = filteredItems.filter(i => !sections.includes(i.categoria));
                if (otherItems.length === 0) return null;
                return (
                  <section key="otras-categorias" className="mb-32">
                    <div className="px-6 mb-16 flex flex-col items-center text-center">
                      <div className="flex items-center justify-center gap-6 w-full max-w-md mx-auto">
                        <div className="h-[1px] bg-black/10 flex-1"></div>
                        <h2 className="text-[18px] sm:text-[24px] tracking-[8px] uppercase font-light text-black/90">Más Categorías</h2>
                        <div className="h-[1px] bg-black/10 flex-1"></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-16 sm:gap-y-24 gap-x-6 sm:gap-x-8">
                      {otherItems.map((item, idx) => <ProductCard key={item.id} item={item} idx={idx} onOpen={openQuickView} addedFeedback={addedFeedback} onAddToCart={addToCart} discount={getDiscount(item)} isFavorited={isFavorited(item.id)} onToggleFavorite={handleToggleFavorite}/>)}
                    </div>
                  </section>
                );
              })()])
            ) : (
              <div className="w-full">
                {category && (
                  <div className="px-6 mb-16 flex flex-col items-center text-center fade-in">
                    <div className="flex items-center justify-center gap-6 w-full max-w-md mx-auto">
                      <div className="h-[1px] bg-black/10 flex-1"></div>
                      <h2 className={`text-[20px] sm:text-[28px] tracking-[10px] uppercase font-light ${category === 'SALE' ? 'text-red-600 font-medium' : 'text-black/90'}`}>{category}</h2>
                      <div className="h-[1px] bg-black/10 flex-1"></div>
                    </div>
                  </div>
                )}
                {search && (
                  <div className="px-6 mb-16 flex flex-col items-center text-center fade-in">
                    <div className="flex items-center justify-center gap-6 w-full max-w-md mx-auto">
                      <div className="h-[1px] bg-black/10 flex-1"></div>
                      <h2 className="text-[18px] sm:text-[24px] tracking-[8px] uppercase font-light text-black/90">"{search}"</h2>
                      <div className="h-[1px] bg-black/10 flex-1"></div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-16 sm:gap-y-24 gap-x-6 sm:gap-x-8">
                  {filteredItems.map((item, idx) => <ProductCard key={item.id} item={item} idx={idx} onOpen={openQuickView} addedFeedback={addedFeedback} onAddToCart={addToCart} discount={getDiscount(item)} isFavorited={isFavorited(item.id)} onToggleFavorite={handleToggleFavorite}/>)}
                </div>
              </div>
            )}
          </main>
        )}
      </div>

      {/* ══════ PRODUCT MODAL ══════ */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={closeQuickView} />
          <div className="relative bg-white w-full max-w-4xl h-full sm:h-[85vh] flex flex-col sm:flex-row overflow-hidden transition-all rounded-none shadow-2xl border border-black/10">
            <button onClick={closeQuickView} className="absolute top-4 right-4 z-10 opacity-60 hover:opacity-100 p-2 bg-white/90 rounded-none border border-black/10"><X size={16} strokeWidth={1.2} /></button>

            {/* Left: Gallery */}
            <div className="w-full sm:w-[55%] h-[40vh] sm:h-full bg-neutral-50 relative group">
              {selectedProduct.imagenes && selectedProduct.imagenes.length > 0 ? (
                <>
                  <img src={selectedProduct.imagenes[modalImgIdx]} alt="" className="w-full h-full object-cover transition-all duration-300"/>
                  {selectedProduct.imagenes.length > 1 && (
                    <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setModalImgIdx(prev => (prev - 1 + selectedProduct.imagenes.length) % selectedProduct.imagenes.length)} className="bg-white/90 p-1.5 rounded-none border border-black/10"><ChevronLeft size={16}/></button>
                      <button onClick={() => setModalImgIdx(prev => (prev + 1) % selectedProduct.imagenes.length)} className="bg-white/90 p-1.5 rounded-none border border-black/10"><ChevronRight size={16}/></button>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {Array.isArray(selectedProduct.imagenes) && selectedProduct.imagenes.map((img, i) => <div key={`img-${i}`} className={`w-1.5 h-1.5 transition-all ${i === modalImgIdx ? 'bg-black w-3' : 'bg-black/20'}`}/>)}
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center p-8 text-center">
                  <p className="text-xl sm:text-2xl font-light tracking-[0.2em] uppercase text-neutral-300 leading-none">{selectedProduct.descripcion}</p>
                </div>
              )}
            </div>

            {/* Right: Info */}
            <div className="w-full sm:w-[45%] flex-1 p-6 sm:p-8 flex flex-col overflow-y-auto no-scrollbar bg-white">
              <p className="text-[9px] tracking-[0.25em] uppercase text-neutral-400 font-light mb-1.5">{selectedProduct.categoria}</p>
              <h2 className="text-xs sm:text-sm tracking-[0.2em] uppercase font-normal mb-4 leading-relaxed text-black">{selectedProduct.descripcion}</h2>

              {(() => {
                const disc = getDiscount(selectedProduct);
                const efDisc = getDiscountedPrice(selectedProduct.ventaEfectivo, disc, true);
                const tarDisc = getDiscountedPrice(selectedProduct.ventaTarjeta, disc, false);
                const cuotas3 = Math.round(tarDisc / 3);
                const cuotas6 = Math.round(tarDisc / 6);
                return (
                  <div className="space-y-2 mb-6">
                    {disc > 0 && (
                      <div className="inline-flex items-center gap-1.5 bg-black text-white px-2 py-0.5 text-[8px] tracking-[0.2em] uppercase font-light rounded-none">
                        <span>-{disc}% OFF SALE</span>
                      </div>
                    )}
                    
                    {/* PRECIO EFECTIVO */}
                    <div className="border border-neutral-200 p-3 bg-white">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[9px] tracking-[0.2em] uppercase text-neutral-400 font-light">Transferencia (-{DESCUENTO_BASE_TRANSFERENCIA}%)</p>
                        </div>
                        <div className="text-right">
                          {efDisc < selectedProduct.ventaEfectivo && <span className="text-[10px] font-light line-through text-neutral-400 block">${selectedProduct.ventaEfectivo.toLocaleString()}</span>}
                          <span className="text-sm font-normal tracking-wide text-black">${efDisc.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* PRECIO TARJETA */}
                    <div className="border border-neutral-200 p-3 bg-white">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[9px] tracking-[0.2em] uppercase text-neutral-400 font-light">Tarjeta (3x ${cuotas3.toLocaleString()} ó 6x ${cuotas6.toLocaleString()})</p>
                        </div>
                        <div className="text-right">
                          {tarDisc < selectedProduct.ventaTarjeta && <span className="text-[10px] font-light line-through text-neutral-400 block">${selectedProduct.ventaTarjeta.toLocaleString()}</span>}
                          <span className="text-sm font-normal tracking-wide text-black">${tarDisc.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Talles */}
              {selectedProduct.talles && selectedProduct.talles.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2 border-b border-neutral-100 pb-1.5">
                    <p className="text-[10px] tracking-[0.2em] uppercase text-black font-light">
                      Talle <span className="text-neutral-400 ml-1">— {modalTalle || 'Seleccionar'}</span>
                    </p>
                    {selectedProduct.medidas && (
                      <button
                        type="button"
                        onClick={() => setShowSizeGuideModal(true)}
                        className="text-[9px] tracking-[0.2em] uppercase text-neutral-500 hover:text-black underline underline-offset-4 flex items-center gap-1 font-light"
                      >
                        <Ruler size={11} strokeWidth={1.2} />
                        Guía de talles
                      </button>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2 justify-start">
                    {Array.isArray(selectedProduct.talles) && Array.from(new Set(selectedProduct.talles as string[])).map((t, idx) => {
                      const isSelected = modalTalle === t;
                      
                      return (
                        <button 
                          key={`${t}-${idx}`} 
                          disabled={false}
                          onClick={() => {
                            setModalTalle(t);
                            if (selectedProduct.colores && selectedProduct.colores.length > 0) {
                              const isCurrentColorAvailable = modalColor && getVariantStock(selectedProduct, t, modalColor) > 0;
                              if (!isCurrentColorAvailable) {
                                const nextColor = selectedProduct.colores.find(c => getVariantStock(selectedProduct, t, c) > 0);
                                setModalColor(nextColor || '');
                              }
                            }
                          }} 
                          className={`w-9 h-9 text-[10px] tracking-[0.1em] uppercase font-light transition-all flex items-center justify-center rounded-none ${
                            isSelected 
                              ? 'bg-black text-white border border-black' 
                              : 'bg-white border border-neutral-300 text-black hover:border-black'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Colores */}
              {selectedProduct.colores && selectedProduct.colores.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2 border-b border-neutral-100 pb-1.5">
                    <p className="text-[10px] tracking-[0.2em] uppercase text-black font-light">
                      Color <span className="text-neutral-400 ml-1">— {modalColor || 'Seleccionar'}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-start">
                    {Array.isArray(selectedProduct.colores) && Array.from(new Set(selectedProduct.colores as string[])).map((c, idx) => {
                      const colorStock = modalTalle ? getVariantStock(selectedProduct, modalTalle, c) : getVariantStock(selectedProduct, undefined, c);
                      const hasStockTracking = selectedProduct.stockPorVariante !== undefined || selectedProduct.coloresStock !== undefined;
                      const isOutOfStock = modalTalle ? (hasStockTracking && colorStock <= 0) : (hasStockTracking && colorStock <= 0);
                      const isSel = modalColor === c;
                      
                      return (
                        <button 
                          key={`${c}-${idx}`} 
                          disabled={isOutOfStock}
                          onClick={() => {
                            setModalColor(c);
                          }} 
                          className={`px-3 py-1.5 text-[9px] tracking-[0.18em] uppercase transition-all font-light rounded-none border ${
                            isSel 
                              ? 'bg-black text-white border-black' 
                              : isOutOfStock
                                ? 'bg-neutral-50 border-neutral-200 text-neutral-300 opacity-40 cursor-not-allowed line-through'
                                : 'bg-white border-neutral-300 text-black hover:border-black'
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-auto space-y-2 pt-4">
                {(() => {
                  const needsTalle = selectedProduct.talles && selectedProduct.talles.length > 0;
                  const needsColor = selectedProduct.colores && selectedProduct.colores.length > 0;
                  const canAdd = (!needsTalle || modalTalle) && (!needsColor || modalColor);
                  return (
                    <button 
                      disabled={!canAdd}
                      onClick={() => { addToCart(selectedProduct, modalTalle, modalColor); setSelectedProduct(null); }} 
                      className={`w-full py-3 text-[10px] tracking-[0.25em] uppercase font-light transition-all rounded-none ${canAdd ? 'bg-black text-white hover:bg-neutral-800' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'}`}
                    >
                      {canAdd ? 'Añadir al carrito' : 'Selecciona opciones'}
                    </button>
                  );
                })()}
                <p className="text-[9px] tracking-[0.2em] uppercase text-neutral-400 font-light text-center">Ref: {selectedProduct.sku}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ CART ══════ */}
      {showCart && (
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-xs z-[110]" onClick={() => setShowCart(false)} />
          <div className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white z-[120] shadow-xl flex flex-col drawer-slide-in border-l border-black/10">
            <div className="flex items-center justify-between px-6 h-16 border-b border-black/10">
              <span className="text-[11px] tracking-[0.25em] uppercase font-light text-black">
                {exchangeSession ? `Cambio — nuevas (${cartCount})` : `Carrito (${cartCount})`}
              </span>
              <button onClick={() => setShowCart(false)} className="opacity-40 hover:opacity-100"><X size={18} strokeWidth={1.2} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 divide-y divide-neutral-100">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-black/30 px-4 text-center">
                  <ShoppingBag size={44} strokeWidth={1} />
                  <p className="text-[12px] tracking-[3px] uppercase font-medium">
                    {exchangeSession
                      ? 'Agregá prendas nuevas desde el catálogo o confirmá solo con devolución abajo'
                      : 'Tu carrito está vacío'}
                  </p>
                </div>
              ) : (
                cart.map((c, i) => {
                  const basePrice = paymentMethod === 'transferencia' ? c.product.ventaEfectivo : c.product.ventaTarjeta;
                  const disc = getDiscount(c.product);
                  const price = getDiscountedPrice(basePrice, disc, paymentMethod === 'transferencia');
                  const hasDiscount = price < basePrice;
                  return (
                    <div key={i} className="py-8 flex gap-6">
                      <div className="w-20 h-28 bg-neutral-50 flex-shrink-0 flex items-center justify-center">
                        {c.product.imagenes?.[0] ? <img src={c.product.imagenes[0]} alt="" className="w-full h-full object-cover"/> : <span className="text-[6px] opacity-20 uppercase">{c.product.descripcion}</span>}
                      </div>
                      <div className="flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-[14px] tracking-[1px] uppercase font-bold text-black">{c.product.descripcion}</h4>
                          <button onClick={() => removeFromCart(c.product.id, c.selectedTalle, c.selectedColor)} className="opacity-30 hover:opacity-100"><Trash2 size={16} /></button>
                        </div>
                        <p className="text-[11px] tracking-[2px] uppercase text-black/50 font-medium mb-4">{c.selectedTalle && `Talle ${c.selectedTalle}`} {c.selectedColor && `— ${c.selectedColor}`}</p>
                        {hasDiscount && <span className="text-[10px] tracking-[2px] uppercase text-red-600 font-bold mb-3">-{disc}% OFF</span>}
                        <div className="mt-auto flex justify-between items-center">
                          <div className="flex items-center border border-black/15">
                            <button onClick={() => updateQty(c.product.id, -1, c.selectedTalle, c.selectedColor)} className="w-9 h-9 flex items-center justify-center hover:bg-black/5"><Minus size={14} /></button>
                            <span className="w-10 text-center text-[14px] font-semibold text-black">{c.quantity}</span>
                            <button onClick={() => updateQty(c.product.id, 1, c.selectedTalle, c.selectedColor)} className="w-9 h-9 flex items-center justify-center hover:bg-black/5"><Plus size={14} /></button>
                          </div>
                          <div className="text-right">
                            {hasDiscount && <span className="text-[12px] font-light line-through text-black/30 block">${(basePrice * c.quantity).toLocaleString()}</span>}
                            <span className={`text-[18px] font-bold ${hasDiscount ? 'text-red-600' : 'text-black'}`}>${(price * c.quantity).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {cart.length > 0 && !exchangeSession && (
              <div className="p-6 border-t border-black/10 space-y-4 bg-white flex-shrink-0">
                {/* Selector de Medio de Pago */}
                <div className="space-y-1.5">
                  <p className="text-[9px] tracking-[0.2em] uppercase font-light text-neutral-400">Medio de Pago</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('transferencia')}
                      className={`p-2.5 border text-left flex flex-col gap-0.5 rounded-none transition-all ${
                        paymentMethod === 'transferencia'
                          ? 'border-black bg-black text-white'
                          : 'border-neutral-200 bg-white hover:border-black text-neutral-800'
                      }`}
                    >
                      <span className={`text-[9px] tracking-[0.2em] uppercase font-light ${paymentMethod === 'transferencia' ? 'text-white' : 'text-black'}`}>Transferencia</span>
                      <span className={`text-[8px] font-light uppercase tracking-wider ${paymentMethod === 'transferencia' ? 'text-white/80' : 'text-neutral-500'}`}>-{DESCUENTO_BASE_TRANSFERENCIA}% OFF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('tarjeta')}
                      className={`p-2.5 border text-left flex flex-col gap-0.5 rounded-none transition-all ${
                        paymentMethod === 'tarjeta'
                          ? 'border-black bg-black text-white'
                          : 'border-neutral-200 bg-white hover:border-black text-neutral-800'
                      }`}
                    >
                      <span className={`text-[9px] tracking-[0.2em] uppercase font-light ${paymentMethod === 'tarjeta' ? 'text-white' : 'text-black'}`}>Tarjeta</span>
                      <span className={`text-[8px] font-light uppercase tracking-wider ${paymentMethod === 'tarjeta' ? 'text-white/70' : 'text-neutral-400'}`}>Precio lista</span>
                    </button>
                  </div>
                </div>

                {/* Gift Card Coupon Accordion inside Cart */}
                <div className="border border-neutral-200 rounded-none overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setShowCartGiftInput(!showCartGiftInput)}
                    className="w-full px-3 py-2.5 flex items-center justify-between text-[9px] tracking-[0.2em] uppercase font-light text-neutral-600 hover:bg-neutral-50 transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <Gift size={11} strokeWidth={1.2} /> ¿Tenés una Gift Card?
                    </span>
                    <ChevronDown size={12} strokeWidth={1.2} className={`text-neutral-400 transition-transform duration-200 ${showCartGiftInput ? 'rotate-180' : ''}`} />
                  </button>

                  {showCartGiftInput && (
                    <div className="p-3 border-t border-neutral-200 space-y-2 bg-neutral-50 animate-in fade-in duration-200">
                      {appliedGiftCard ? (
                        <div className="flex items-center justify-between bg-white border border-black/10 p-2.5 rounded-none">
                          <div className="space-y-0.5 text-left">
                            <p className="text-[8px] font-light text-black tracking-[0.2em] uppercase">
                              Gift Card Aplicada
                            </p>
                            <p className="text-[9px] font-mono text-black">
                              {appliedGiftCard.codigo}
                            </p>
                            <p className="text-[8px] text-neutral-500 font-light">
                              Descuento: ${cartGiftDiscountAmount.toLocaleString('es-AR')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveCartGift}
                            className="text-[8px] tracking-[0.2em] uppercase font-light text-black underline transition-all"
                          >
                            Quitar
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={cartGiftCode}
                              onChange={(e) => setCartGiftCode(e.target.value.toUpperCase())}
                              placeholder="CÓDIGO GIFT CARD"
                              disabled={isValidatingCartGift}
                              className="flex-1 bg-white border border-neutral-300 px-2.5 py-1.5 text-[9px] tracking-[0.15em] font-mono outline-none focus:border-black uppercase placeholder:text-neutral-300 rounded-none"
                            />
                            <button
                              type="button"
                              onClick={handleApplyCartGift}
                              disabled={isValidatingCartGift || !cartGiftCode.trim()}
                              className="bg-black hover:bg-neutral-800 disabled:opacity-30 text-white px-3 text-[8px] tracking-[0.2em] uppercase font-light transition-all flex items-center justify-center rounded-none"
                            >
                              {isValidatingCartGift ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : (
                                'Aplicar'
                              )}
                            </button>
                          </div>
                          {cartGiftError && (
                            <p className="text-[8px] uppercase tracking-[0.1em] text-neutral-900 font-light animate-pulse text-left">
                              ⚠️ {cartGiftError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Desglose de Totales del Carrito */}
                <div className="space-y-1 border-t border-neutral-100 pt-3 text-[9px] tracking-[0.18em] uppercase font-light">
                  <div className="flex justify-between text-neutral-500">
                    <span>Subtotal prendas</span>
                    <span>${cartTotal.toLocaleString('es-AR')}</span>
                  </div>
                  {appliedGiftCard && (
                    <div className="flex justify-between text-black font-normal">
                      <span>Descuento Gift Card</span>
                      <span>-${cartGiftDiscountAmount.toLocaleString('es-AR')}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-baseline border-t border-black/10 pt-2.5">
                  <span className="text-[9px] tracking-[0.25em] uppercase text-neutral-400 font-light">Total Final</span>
                  <span className="text-xl font-normal text-black tracking-wide">${finalCartTotal.toLocaleString()}</span>
                </div>

                <button 
                  onClick={() => {
                    setShowCart(false);
                    if (user) {
                      setShowCheckout(true);
                    } else {
                      setPendingCheckout(true);
                      setShowAuthModal(true);
                    }
                  }} 
                  className="w-full bg-black text-white py-3.5 text-[10px] tracking-[0.25em] uppercase font-light hover:bg-neutral-800 transition-all rounded-none flex items-center justify-center gap-2"
                >
                  Finalizar pedido
                  <ArrowRight size={13} strokeWidth={1.2} />
                </button>
              </div>
            )}
            {exchangeSession && (
              <div className="p-8 border-t border-black/5 space-y-5 bg-neutral-900/5">
                <div className="space-y-3 mb-6 border-b border-black/10 pb-6">
                  <p className="text-[10px] tracking-[2px] uppercase font-bold text-black">Seleccioná qué devolvés</p>
                  <p className="text-[9px] tracking-[1px] uppercase text-black/50">Pedido {new Date(exchangeSession.order.fecha).toLocaleDateString('es-AR')}</p>
                  <div className="space-y-2 mt-3">
                    {exchangeSession.originalItems.map((item) => {
                      const sel = exchangeSession.itemsDevueltos.find((i) => i.id === item.id);
                      const qty = exchangeSession.cantDevueltasInput[item.id] ?? sel?.cantidad ?? 0;
                      return (
                        <label
                          key={item.id}
                          className={`flex items-center gap-3 p-3 rounded border cursor-pointer text-[10px] uppercase tracking-[0.5px] ${
                            sel ? 'border-black bg-black/5' : 'border-black/10 hover:border-black/30'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!sel}
                            onChange={() => toggleDevuelto(item)}
                            className="accent-black"
                          />
                          <span className="flex-1 truncate font-semibold text-black">{item.descripcion}</span>
                          <input
                            type="number"
                            min={1}
                            max={item.cantidad}
                            disabled={!sel}
                            value={qty || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateDevueltoQty(item, parseInt(e.target.value, 10) || 1)}
                            className="w-10 bg-transparent border border-black/20 rounded text-center text-[10px] text-black disabled:opacity-30"
                          />
                          <span className="text-black/40">/ {item.cantidad}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={cancelExchange}
                    className="mt-4 w-full border border-black/20 text-black py-2.5 text-[9px] tracking-[2px] uppercase font-bold hover:bg-black/5 transition-colors"
                  >
                    Cancelar cambio
                  </button>
                </div>
                <p className="text-[10px] tracking-[2px] uppercase font-bold text-black">Resumen del cambio</p>
                {exchangeSession.itemsDevueltos.length > 0 ? (
                  <div className="space-y-2 text-[10px] uppercase tracking-[0.5px] text-black/60">
                    <p className="font-bold text-black/40">Devolvés</p>
                    {exchangeSession.itemsDevueltos.map((i) => (
                      <p key={i.id}>{i.descripcion} × {i.cantidad}</p>
                    ))}
                    <p className="text-right font-bold text-black">− ${totalDevueltoExchange.toLocaleString('es-AR')}</p>
                  </div>
                ) : (
                  <p className="text-[10px] uppercase tracking-[1px] text-amber-700 font-semibold">
                    Marcá las prendas a devolver en la sección superior.
                  </p>
                )}
                {cart.length > 0 && (
                  <div className="space-y-2 text-[10px] uppercase tracking-[0.5px] text-black/60 border-t border-black/5 pt-3">
                    <p className="font-bold text-black/40">Prendas nuevas</p>
                    {cart.map((c, i) => (
                      <p key={i}>{c.product.descripcion} × {c.quantity}</p>
                    ))}
                    <p className="text-right font-bold text-black">+ ${cartTotal.toLocaleString('es-AR')}</p>
                  </div>
                )}
                <div className="border-t border-black/10 pt-3 space-y-1 text-[11px] uppercase tracking-[1px]">
                  <div className="flex justify-between font-bold">
                    <span>{diferenciaExchange > 0 ? 'A pagar' : diferenciaExchange < 0 ? 'Gift Card' : 'Sin diferencia'}</span>
                    <span>${Math.abs(diferenciaExchange).toLocaleString('es-AR')}</span>
                  </div>
                </div>
                {diferenciaExchange < 0 && (
                  <input
                    type="text"
                    value={exchangeSession.giftDestinatario}
                    onChange={(e) =>
                      setExchangeSession((prev) =>
                        prev ? { ...prev, giftDestinatario: e.target.value } : prev
                      )
                    }
                    placeholder="NOMBRE PARA GIFT CARD"
                    className="w-full border-b border-black/20 py-2 text-[11px] uppercase tracking-[1px]"
                  />
                )}
                <button
                  type="button"
                  onClick={confirmExchange}
                  disabled={isConfirmingExchange || exchangeSession.itemsDevueltos.length === 0}
                  className="w-full bg-black text-white py-5 text-[11px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {isConfirmingExchange ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Confirmar cambio en caja
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════ SOBRE NOSOTROS ══════ */}
      {webSettings.aboutUsText && (
        <section className="mt-32 px-6 sm:px-12 py-24 sm:py-32 bg-neutral-50 border-t border-b border-black/5">
          <div className="max-w-3xl mx-auto text-center space-y-8 fade-in">
            <p className="text-[13px] tracking-[6px] uppercase text-black/60 font-bold">Sobre Nosotros</p>
            <div className="w-12 h-px bg-black/30 mx-auto"></div>
            {webSettings.aboutUsText.split('\n').filter(Boolean).map((para, idx) => (
              <p key={idx} className="text-[15px] sm:text-[16px] leading-[2] tracking-[0.5px] text-black/80 font-light">
                {para}
              </p>
            ))}
            <div className="pt-4 flex items-center justify-center gap-2 opacity-40">
              <Heart size={14} strokeWidth={1.5} />
            </div>
          </div>
        </section>
      )}
      </>
      )}

      {/* ══════ INSTAGRAM ══════ */}
      {instagramUrl && (
        <section className="py-20 sm:py-24 flex flex-col items-center gap-6">
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-4 transition-opacity hover:opacity-70"
          >
            <Instagram size={28} strokeWidth={1.2} className="text-black group-hover:text-black/70 transition-opacity" />
            <span className="text-[16px] sm:text-[20px] tracking-[4px] uppercase font-bold">
              {webSettings.instagramHandle?.startsWith('@') ? webSettings.instagramHandle : `@${webSettings.instagramHandle}`}
            </span>
            <span className="text-[13px] tracking-[4px] uppercase text-black/60 font-medium">Seguinos en Instagram</span>
          </a>
        </section>
      )}

          {/* ══════ FOOTER ══════ */}
      <footer className="border-t border-black/5 px-8 py-20 flex flex-col items-center">
        <div className="flex flex-wrap justify-center gap-x-12 gap-y-6 mb-16">
          <button onClick={() => setShowTerms(true)} className="text-[13px] tracking-[3px] uppercase text-black/70 hover:text-black transition-colors font-semibold">Términos</button>
          {(webSettings.contactWhatsapp || '5492346685836') && (
            <a href={`https://wa.me/${(webSettings.contactWhatsapp || '5492346685836').replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hola El Ropero! Desde la pagina web me surgio una consulta sobre ...')}`} target="_blank" rel="noopener noreferrer" className="text-[13px] tracking-[3px] uppercase text-black/70 hover:text-black transition-colors font-semibold">Contacto</a>
          )}
          <button onClick={() => setShowLocation(true)} className="text-[13px] tracking-[3px] uppercase text-black/70 hover:text-black transition-colors font-semibold">Ubicación</button>
          {instagramUrl && (
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] tracking-[3px] uppercase text-black/70 hover:text-black transition-colors font-semibold flex items-center gap-1">
              <Instagram size={14}/>Instagram
            </a>
          )}
        </div>
        <div className="w-full max-w-4xl flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8">
          <p className="text-[11px] tracking-[3px] uppercase text-black/50 font-medium">© 2026 {webSettings.storeName || 'EL ROPERO'} SHOWROOM</p>
          <span className="hidden sm:inline text-black/20">•</span>
          <a 
            href="https://www.instagram.com/siao.tech" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-flex items-center text-[11px] tracking-[2.5px] uppercase text-black/60 hover:text-black transition-all duration-200 group font-medium"
            title="Ir al Instagram de SIAO Tech (@siao.tech)"
          >
            Desarrollado por <span className="font-bold underline underline-offset-4 group-hover:text-black ml-1">SIAO Tech</span>
          </a>
        </div>
      </footer>

      {/* ══════ TERMS MODAL ══════ */}
      {showTerms && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowTerms(false)} />
          <div className="relative bg-white w-full max-w-lg p-10 sm:p-16 space-y-8 animate-in fade-in zoom-in duration-300">
            <button onClick={() => setShowTerms(false)} className="absolute top-6 right-6 opacity-40 hover:opacity-100 transition-opacity"><X size={20} /></button>
            <h3 className="text-[14px] tracking-[6px] uppercase font-semibold border-b border-black/10 pb-4">Términos y Condiciones</h3>
            <div className="space-y-6 text-[11px] tracking-[1px] leading-relaxed uppercase opacity-70 max-h-[60vh] overflow-y-auto no-scrollbar">
              <section>
                <p className="font-bold mb-2">Cambios</p>
                <p>Las prendas tienen cambio dentro de los 15 días corridos de realizada la compra, presentándolas con su etiqueta original y en perfecto estado.</p>
              </section>
              <section>
                <p className="font-bold mb-2">Devoluciones</p>
                <p>No se realizan devoluciones de dinero. En caso de no encontrar una prenda de agrado, se entregará una Gift Card por el valor abonado, con fecha de vencimiento.</p>
              </section>
              <section>
                <p className="font-bold mb-2">Ofertas</p>
                <p>Las prendas adquiridas en liquidación, sale o con descuentos especiales no tienen cambio ni devolución.</p>
              </section>
              <section>
                <p className="font-bold mb-2">Envíos</p>
                <p>Los costos de envío corren por cuenta del cliente, salvo falla de fábrica debidamente comprobada.</p>
              </section>
            </div>
            <button onClick={() => setShowTerms(false)} className="w-full bg-black text-white py-4 text-[10px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-colors">Entendido</button>
            <div className="pt-2 border-t border-black/5 text-center">
              <a 
                href="https://www.instagram.com/siao.tech" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1 text-[9px] tracking-[2px] uppercase text-black/40 hover:text-black transition-colors font-medium"
              >
                Desarrollado por <span className="font-semibold underline underline-offset-2">SIAO Tech</span> (@siao.tech)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ══════ LOCATION MODAL ══════ */}
      {showLocation && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLocation(false)} />
          <div className="relative bg-white w-full max-w-xl p-10 sm:p-16 space-y-10 animate-in fade-in zoom-in duration-300 text-center">
            <button onClick={() => setShowLocation(false)} className="absolute top-6 right-6 opacity-40 hover:opacity-100 transition-opacity"><X size={20} /></button>
            <h3 className="text-[14px] tracking-[6px] uppercase font-semibold border-b border-black/10 pb-4">Nuestras Ubicaciones</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
              {webSettings.locationShowroomAddress && (
                <div className="space-y-4">
                  <p className="text-[10px] tracking-[3px] uppercase font-bold opacity-30">Showroom Central</p>
                  <p className="text-[12px] tracking-[2px] uppercase">
                    {webSettings.locationShowroomAddress.split(',').map((part, idx) => (
                      <React.Fragment key={idx}>
                        {part.trim()}
                        {idx < webSettings.locationShowroomAddress!.split(',').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </p>
                  {webSettings.locationShowroomMapUrl && (
                    <a 
                      href={webSettings.locationShowroomMapUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-block text-[9px] tracking-[3px] uppercase border-b border-black pb-1 hover:opacity-50 transition-opacity"
                    >
                      Ver en mapa
                    </a>
                  )}
                </div>
              )}
              {webSettings.locationPickupAddress && (
                <div className="space-y-4">
                  <p className="text-[10px] tracking-[3px] uppercase font-bold opacity-30">Pick Up Point</p>
                  <p className="text-[12px] tracking-[2px] uppercase">
                    {webSettings.locationPickupAddress.split(',').map((part, idx) => (
                      <React.Fragment key={idx}>
                        {part.trim()}
                        {idx < webSettings.locationPickupAddress!.split(',').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </p>
                  {webSettings.locationPickupMapUrl && (
                    <a 
                      href={webSettings.locationPickupMapUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-block text-[9px] tracking-[3px] uppercase border-b border-black pb-1 hover:opacity-50 transition-opacity"
                    >
                      Ver en mapa
                    </a>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setShowLocation(false)} className="w-full bg-black text-white py-4 text-[10px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-colors">Cerrar</button>
            <div className="pt-2 border-t border-black/5 text-center">
              <a 
                href="https://www.instagram.com/siao.tech" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1 text-[9px] tracking-[2px] uppercase text-black/40 hover:text-black transition-colors font-medium"
              >
                Desarrollado por <span className="font-semibold underline underline-offset-2">SIAO Tech</span> (@siao.tech)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ══════ GUÍA DE TALLES MODAL ══════ */}
      {showSizeGuideModal && selectedProduct && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowSizeGuideModal(false)} />
          <div className="relative bg-white w-full max-w-md p-8 sm:p-10 space-y-6 animate-in zoom-in-95 duration-200 shadow-2xl rounded-xl">
            <button onClick={() => setShowSizeGuideModal(false)} className="absolute top-6 right-6 opacity-40 hover:opacity-100 transition-opacity">
              <X size={20} strokeWidth={1.5} />
            </button>
            <div className="flex items-center gap-2 border-b border-black/10 pb-4">
              <Ruler size={18} strokeWidth={1.5} className="text-black/70" />
              <h3 className="text-[13px] tracking-[4px] uppercase font-semibold text-black">Guía de Talles y Medidas</h3>
            </div>
            
            <div className="space-y-4 text-[12px] tracking-[1px] leading-relaxed uppercase text-black/80">
              <p className="font-semibold text-black/50 text-[10px] tracking-[2px]">{selectedProduct.descripcion}</p>
              {selectedProduct.medidas ? (
                <div className="bg-neutral-50 border border-black/5 p-4 rounded-lg text-black/90 font-medium whitespace-pre-line">
                  {selectedProduct.medidas}
                </div>
              ) : (
                <p className="text-black/50 italic">No hay información detallada de medidas cargada para esta prenda.</p>
              )}
            </div>
            
            <button onClick={() => setShowSizeGuideModal(false)} className="w-full bg-black text-white py-3.5 text-[10px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ══════ NOTIFICACIÓN DE PRENDA AGREGADA AL CARRITO ══════ */}
      {cartToastNotification && (
        <div
          className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[200] max-w-sm w-[calc(100vw-2rem)] sm:w-[380px] bg-black text-white p-3.5 shadow-xl rounded-none border border-white/20 flex items-center gap-3 animate-in fade-in duration-200"
          role="status"
          aria-live="polite"
        >
          {cartToastNotification.item.imagenes?.[0] ? (
            <img
              src={cartToastNotification.item.imagenes[0]}
              alt=""
              className="w-11 h-14 object-cover rounded-none bg-neutral-900 flex-shrink-0 aspect-[3/4]"
            />
          ) : (
            <div className="w-11 h-14 bg-neutral-900 rounded-none flex items-center justify-center text-white/40 flex-shrink-0">
              <ShoppingBag size={16} strokeWidth={1.2} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-white text-[9px] uppercase tracking-[0.25em] font-light mb-0.5">
              <CheckCircle size={12} strokeWidth={1.2} className="flex-shrink-0 text-white" />
              <span>Prenda agregada</span>
            </div>
            <p className="text-[10px] font-light tracking-[0.18em] uppercase truncate text-white">
              {cartToastNotification.item.descripcion}
            </p>
            {(cartToastNotification.talle || cartToastNotification.color) && (
              <p className="text-[8px] tracking-[0.15em] uppercase text-neutral-400 mt-0.5 font-light">
                {[
                  cartToastNotification.talle && `Talle: ${cartToastNotification.talle}`,
                  cartToastNotification.color && `Color: ${cartToastNotification.color}`
                ].filter(Boolean).join(' | ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                setShowCart(true);
                setCartToastNotification(null);
              }}
              className="bg-white text-black text-[9px] uppercase tracking-[0.2em] font-light px-3 py-1.5 rounded-none hover:bg-neutral-200 transition-all cursor-pointer border border-white"
            >
              Ver Carrito
            </button>
            <button
              onClick={() => setCartToastNotification(null)}
              className="text-white/40 hover:text-white p-1 transition-colors cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ══════ WHATSAPP FLOATING BUTTON ══════ */}
      <a
        href={`https://wa.me/${(webSettings.contactWhatsapp || '5492346685836').replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hola El Ropero! Desde la pagina web me surgio una consulta sobre ...')}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-[90] bg-[#25D366] text-white p-3.5 sm:p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center"
        aria-label="Contactar por WhatsApp"
      >
        <svg viewBox="0 0 448 512" width="28" height="28" fill="currentColor">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
        </svg>
      </a>

      {/* ══════ AUTHENTICATION MODALS & FLOWS ══════ */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => {
          setShowAuthModal(false);
          if (pendingCheckout && user) {
            setShowCheckout(true);
          }
          if (pendingBuyGiftCard && user) {
            setShowBuyGiftCard(true);
          }
          setPendingCheckout(false);
          setPendingBuyGiftCard(false);
        }}
        onContinueAsGuest={
          pendingBuyGiftCard ? undefined : () => {
            setShowAuthModal(false);
            setPendingCheckout(false);
            setShowCheckout(true);
          }
        }
      />
      <UserDashboard 
        isOpen={showDashboard} 
        onClose={() => setShowDashboard(false)}
        inventory={inventory}
        onAddToCart={addToCart}
        onRequestExchange={(order) => {
          if (!user) {
            setShowAuthModal(true);
            return;
          }
          startExchange(order);
        }}
        onRefreshOrders={refreshOrders}
      />
      <CheckoutFlow 
        isOpen={showCheckout}
        onClose={() => setShowCheckout(false)}
        cart={cart}
        cartTotal={cartTotal}
        webSettings={webSettings}
        onSuccess={handleCheckoutSuccess}
        getDiscount={getDiscount}
        getDiscountedPrice={getDiscountedPrice}
        initialPaymentMethod={paymentMethod}
        initialAppliedGiftCard={appliedGiftCard}
      />
      <SessionExpiryModal 
        isOpen={showExpiryModal}
        onClose={() => setShowExpiryModal(false)}
      />
      <BuyGiftCardModal 
        isOpen={showBuyGiftCard}
        onClose={() => setShowBuyGiftCard(false)}
        onSuccess={() => setShowBuyGiftCard(false)}
        onRequireAuth={() => {
          setShowBuyGiftCard(false);
          setPendingBuyGiftCard(true);
          setShowAuthModal(true);
        }}
      />

      {/* ══════ MODAL PAGO PENDIENTE / RETORNO DE UALÁ BIS ══════ */}
      {pendingPaymentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-6 md:p-8 relative border border-black/5 text-center space-y-6">
            <button
              onClick={() => setPendingPaymentOrder(null)}
              className="absolute top-4 right-4 p-2 text-black/40 hover:text-black transition-colors rounded-full hover:bg-neutral-100"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>

            <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
              <AlertCircle size={26} strokeWidth={1.5} />
            </div>

            <div className="space-y-2">
              <h3 className="text-[16px] md:text-[18px] tracking-[3px] uppercase font-bold text-black">
                Pago no completado
              </h3>
              <p className="text-[11px] tracking-[1px] uppercase leading-relaxed text-black/60 max-w-[360px] mx-auto">
                Tu pedido {pendingPaymentOrder.orderId ? `#${pendingPaymentOrder.orderId.slice(-6).toUpperCase()}` : ''} sigue guardado como pendiente. Podés reintentar el pago con Ualá Bis o escribirnos si tuviste algún inconveniente.
              </p>
            </div>

            {pendingPaymentOrder.ualaPaymentUrl && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => window.open(pendingPaymentOrder.ualaPaymentUrl, '_blank', 'noopener,noreferrer')}
                  className="w-full bg-black text-white py-4 rounded-xl text-[11px] font-bold tracking-[3px] uppercase hover:bg-neutral-900 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  Pagar con Ualá Bis
                </button>
              </div>
            )}

            <div className="pt-6 border-t border-black/5 space-y-3">
              <p className="text-[11px] tracking-[1px] uppercase font-semibold text-black/70">
                ¿Tuviste problemas para realizar el pago?
              </p>
              <button
                type="button"
                onClick={() => {
                  const phone = (webSettings.contactWhatsapp || '5492346685836').replace(/[^0-9]/g, '');
                  const msg = buildOrderWhatsAppMessage(
                    pendingPaymentOrder,
                    webSettings.storeName || 'El Ropero',
                    'Tuve un problema al realizar el pago con Ualá Bis. ¿Me podrían ayudar a completarlo?'
                  );
                  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                }}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white py-3.5 rounded-xl text-[10px] font-bold tracking-[2.5px] uppercase transition-all shadow-sm"
              >
                <Send size={13} /> Contactar por WhatsApp
              </button>
            </div>

            <button
              onClick={() => setPendingPaymentOrder(null)}
              className="w-full text-[10px] tracking-[3px] uppercase font-bold text-black/40 hover:text-black transition-colors pt-2"
            >
              Volver a la Tienda
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ProductCard: React.FC<{ 
  item: InventoryItem, 
  idx: number, 
  onOpen: (i: InventoryItem) => void, 
  addedFeedback: string | null, 
  onAddToCart: any, 
  discount?: number,
  isFavorited: boolean,
  onToggleFavorite: (id: string) => void
}> = ({ item, idx, onOpen, addedFeedback, onAddToCart, discount = 0, isFavorited, onToggleFavorite }) => {
  const tarjetaPrice = discount > 0 ? Math.round(item.ventaTarjeta * (1 - discount / 100)) : item.ventaTarjeta;
  const cuotas3 = Math.round(tarjetaPrice / 3);
  const cuotas6 = Math.round(tarjetaPrice / 6);
  return (
    <article className="fade-in group flex flex-col relative rounded-none" style={{ animationDelay: `${(idx % 8) * 60}ms` }}>
      <div className="relative w-full aspect-[3/4] overflow-hidden bg-neutral-50 cursor-pointer flex items-center justify-center rounded-none" onClick={() => onOpen(item)}>
        {item.imagenes?.[0] ? (
          <img src={item.imagenes[0]} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-103"/>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 transition-transform duration-500 group-hover:scale-105">
            <p className="text-[11px] font-light tracking-[0.25em] uppercase text-neutral-300 leading-normal select-none text-center break-words px-4">{item.descripcion}</p>
          </div>
        )}
        <button onClick={(e) => { e.stopPropagation(); onOpen(item); }} className={`absolute bottom-0 left-0 w-full py-2.5 text-[9px] tracking-[0.2em] uppercase font-light transition-all duration-300 rounded-none ${addedFeedback === item.id ? 'bg-black text-white' : 'bg-white/95 text-black hover:bg-black hover:text-white'}`}>
          Ver Detalle
        </button>
        
        {/* Wishlist Heart Icon */}
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id); }}
          className="absolute top-3 right-3 z-10 bg-white/90 p-1.5 rounded-none border border-black/10 hover:bg-black hover:text-white transition-all flex items-center justify-center"
        >
          <Heart 
            size={13} 
            strokeWidth={1.2} 
            className={`transition-colors duration-300 ${isFavorited ? 'fill-black text-black' : 'text-neutral-600'}`} 
          />
        </button>

        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {item.cantidad <= 2 && <span className="text-[8px] tracking-[0.2em] uppercase bg-black text-white px-2 py-0.5 font-light rounded-none">Últimas unidades</span>}
          {discount > 0 && <span className="text-[8px] tracking-[0.2em] uppercase bg-black text-white border border-white/20 px-2 py-0.5 font-light rounded-none">-{discount}% OFF</span>}
        </div>
      </div>
      
      {/* Info de precio */}
      <div className="mt-2.5 px-0.5 flex flex-col gap-0.5 text-left">
        <h4 className="text-[10px] sm:text-[11px] tracking-[0.16em] uppercase font-light text-neutral-900 truncate">{item.descripcion}</h4>
        
        <div className="flex items-baseline gap-2 mt-0.5">
          {discount > 0 && <span className="text-[10px] font-light line-through text-neutral-400">${item.ventaTarjeta.toLocaleString()}</span>}
          <span className="text-[11px] sm:text-[12px] font-light tracking-[0.05em] text-black">${tarjetaPrice.toLocaleString()}</span>
        </div>

        <div className="flex flex-col gap-0.5 mt-0.5">
          <p className="text-[9px] tracking-[0.1em] text-neutral-400 font-light">3 cuotas de <span className="font-normal text-neutral-700">${cuotas3.toLocaleString()}</span> ó 6 de <span className="font-normal text-neutral-700">${cuotas6.toLocaleString()}</span></p>
        </div>
      </div>
    </article>
  );
};

export default StorefrontPage;
