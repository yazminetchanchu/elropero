import React from 'react';
import { Link } from 'react-router-dom';
import { InventoryItem, WebSettings, GiftCard, SaleItem } from '../types';
import { db, functions } from '../services/firebase';
import { doc, onSnapshot, getDoc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { X, Plus, Minus, ShoppingBag, Search, Menu, ChevronDown, Trash2, Send, ChevronRight, Ruler, ChevronLeft, Instagram, Heart, User, RefreshCw, Loader2, CheckCircle, ArrowRight, Gift, Copy, Check } from 'lucide-react';
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


const PUBLIC_SHOWROOM_ID = localStorage.getItem('ropero_showroom_id_v3_2026') || 'EL-ROPERO-DEFAULT';

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
  const [showSearch, setShowSearch] = React.useState(false);
  const [showNav, setShowNav] = React.useState(false);
  const { showAlert, showConfirm } = useModal();
  const { user, customerProfile, syncCart, addToWishlist, removeFromWishlist, refreshOrders, assignGiftCard } = useAuth();
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [showCart, setShowCart] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<InventoryItem | null>(null);
  const [addedFeedback, setAddedFeedback] = React.useState<string | null>(null);
  
  // Modal state for selection
  const [modalTalle, setModalTalle] = React.useState('');
  const [modalColor, setModalColor] = React.useState('');
  const [modalImgIdx, setModalImgIdx] = React.useState(0);

  // Auth & UX Modal States
  const [showAuthModal, setShowAuthModal] = React.useState(false);
  const [showDashboard, setShowDashboard] = React.useState(false);
  const [showCheckout, setShowCheckout] = React.useState(false);
  const [exchangeSession, setExchangeSession] = React.useState<ExchangeSession | null>(null);
  const [isConfirmingExchange, setIsConfirmingExchange] = React.useState(false);
  const [exchangeSuccessMsg, setExchangeSuccessMsg] = React.useState<string | null>(null);
  const [showExpiryModal, setShowExpiryModal] = React.useState(false);
  const [showTerms, setShowTerms] = React.useState(false);
  const [showLocation, setShowLocation] = React.useState(false);
  const [showBuyGiftCard, setShowBuyGiftCard] = React.useState(false);

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
       showAlert('Hubo un problema con tu pago en Ualá. Tu pedido sigue guardado como pendiente.', 'Pago Pendiente', 'warning');
       const cleanUrl = window.location.origin + window.location.pathname;
       window.history.replaceState({}, document.title, cleanUrl);
    }
  }, []);

  // Unified body scroll-lock hook for high-end mobile experience
  React.useEffect(() => {
    const isAnyOverlayActive = showNav || showCart || !!selectedProduct || showAuthModal || showDashboard || showCheckout || showTerms || showLocation;
    if (isAnyOverlayActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showNav, showCart, selectedProduct, showAuthModal, showDashboard, showCheckout, showTerms, showLocation]);

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

  const filteredItems = React.useMemo(() => {
    const hiddenSections = webSettings.hiddenSections || [];
    return inventory
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
      });
  }, [inventory, search, category, getDiscount, webSettings.hiddenSections]);

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
      const price = getDiscountedPrice(c.product.ventaEfectivo, disc);
      msg += `${i + 1}. ${c.product.descripcion}\n`;
      if (c.selectedTalle) msg += `   Talle: ${c.selectedTalle}\n`;
      if (c.selectedColor) msg += `   Color: ${c.selectedColor}\n`;
      if (disc > 0) msg += `   Descuento: ${disc}%\n`;
      msg += `   Cant: ${c.quantity} × $${price.toLocaleString('es-AR')} (Transferencia)\n`;
      msg += `   Subtotal: $${(price * c.quantity).toLocaleString('es-AR')}\n\n`;
    });
    msg += `━━━━━━━━━━━━━━━\n*TOTAL: $${cartTotal.toLocaleString('es-AR')}*`;
    const phone = (webSettings.contactWhatsapp || '5492346685836').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
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
  };


  if (isLoading && inventory.length === 0) {
    return <InnovativeLoader storeName={webSettings.storeName || 'EL ROPERO'} />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col text-black font-['Inter'] selection:bg-black selection:text-white overflow-x-hidden w-full">
      
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
      <header className="sticky top-0 z-[60] bg-white border-b border-black/5">
        <div className="flex items-center justify-between px-3 sm:px-6 h-16 sm:h-20">
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            <button onClick={() => setShowNav(true)} className="flex items-center gap-2 hover:opacity-60 transition-opacity">
              <Menu size={20} strokeWidth={1.5} />
              <span className="hidden sm:inline text-[11px] tracking-[3px] uppercase font-light">Menú</span>
            </button>
            <button onClick={() => setShowSearch(!showSearch)} className="hover:opacity-60 transition-opacity">
              <Search size={19} strokeWidth={1.5} />
            </button>
          </div>

          <Link to="/" className="flex-1 min-w-0 flex items-center justify-center text-center px-1 sm:px-2" onClick={() => { setCategory(''); setSearch(''); }}>
            <h1 className="text-[clamp(13px,3.8vw,20px)] tracking-[clamp(3px,2vw,16px)] uppercase font-medium leading-none whitespace-nowrap transition-all duration-300 select-none">
              {webSettings.storeName || 'EL ROPERO'}
            </h1>
          </Link>

          <div className="flex items-center justify-end gap-4 sm:gap-6 shrink-0">
            {/* User Icon */}
            <button 
              onClick={() => user ? setShowDashboard(true) : setShowAuthModal(true)} 
              className="hover:opacity-60 transition-opacity flex items-center gap-1.5"
            >
              <User size={20} strokeWidth={1.5} />
              {user && customerProfile?.nombre && (
                <span className="hidden md:inline text-[9px] tracking-[2px] uppercase font-light truncate max-w-[100px]">
                  {customerProfile.nombre.split(' ')[0]}
                </span>
              )}
            </button>

            {/* Gift Card Icon */}
            <button 
              onClick={() => setShowBuyGiftCard(true)}
              className="hover:opacity-60 transition-opacity flex items-center gap-1.5"
            >
              <Gift size={20} strokeWidth={1.5} />
            </button>

            <button onClick={() => setShowCart(true)} className="relative hover:opacity-60 transition-opacity flex items-center gap-2">
              <ShoppingBag size={20} strokeWidth={1.5} />
              {cartCount > 0 && <span className="text-[11px] font-light">({cartCount})</span>}
            </button>
          </div>
        </div>

        {/* Infinite Announcement Marquee */}
        {webSettings.announcementText && (
          <div className="marquee-container">
            <div className="marquee-content">
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              
              {/* Duplicate to ensure seamless looping */}
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
              <span className="marquee-item">{webSettings.announcementText}</span>
            </div>
          </div>
        )}

        {showSearch && (
          <div className="absolute top-full left-0 w-full bg-white border-b border-black/5 px-6 py-4 animate-in slide-in-from-top-2 duration-200">
            <div className="max-w-xl mx-auto relative">
              <input
                autoFocus type="text" value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="BUSCAR PRENDA..."
                className="w-full text-[14px] tracking-[4px] uppercase bg-transparent border-b border-black/10 py-2 outline-none placeholder:text-black/20"
              />
              <button onClick={() => { setShowSearch(false); setSearch(''); }} className="absolute right-0 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100"><X size={18} /></button>
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
          <div className="fixed top-0 left-0 h-full w-[80vw] max-w-[320px] sm:w-[350px] sm:max-w-none bg-white z-[80] p-10 flex flex-col drawer-slide-in-left shadow-2xl">
            <button onClick={() => setShowNav(false)} className="self-end mb-16 opacity-40 hover:opacity-100 p-1.5 hover:bg-neutral-50 rounded-full transition-all"><X size={20} strokeWidth={1.5} /></button>
            <nav className="space-y-6 overflow-y-auto no-scrollbar pb-10">
              <p className="text-[10px] tracking-[6px] uppercase text-black/40 font-semibold mb-8 border-b border-black/10 pb-4">Secciones</p>
              
              <button onClick={() => { setCategory(''); setShowNav(false); }}
                className={`block w-full text-left text-[18px] sm:text-[22px] tracking-[6px] uppercase transition-all duration-300 ${!category ? 'font-medium text-black translate-x-2' : 'font-light text-black/50 hover:text-black hover:translate-x-2'}`}>
                Ver Todo
              </button>

              <button onClick={() => { setCategory('SALE'); setShowNav(false); }}
                className={`block w-full text-left text-[18px] sm:text-[22px] tracking-[6px] uppercase transition-all duration-300 ${category === 'SALE' ? 'font-medium text-red-600 translate-x-2' : 'font-light text-red-500/70 hover:text-red-600 hover:translate-x-2'}`}>
                SALE
              </button>

              {sections.map(s => (
                <button key={s} onClick={() => { setCategory(s); setShowNav(false); }}
                  className={`block w-full text-left text-[18px] sm:text-[22px] tracking-[6px] uppercase transition-all duration-300 ${category === s ? 'font-medium text-black translate-x-2' : 'font-light text-black/50 hover:text-black hover:translate-x-2'}`}>
                  {s}
                </button>
              ))}

              <button onClick={() => { setShowBuyGiftCard(true); setShowNav(false); }}
                className={`block w-full text-left text-[18px] sm:text-[22px] tracking-[6px] uppercase transition-all duration-300 font-light text-black/50 hover:text-black hover:translate-x-2 mt-6 border-t border-black/10 pt-6 flex items-center gap-2`}>
                Regalar Gift Card <Gift size={18} />
              </button>
            </nav>
            <div className="mt-auto pt-10 border-t border-black/5">
              <Link to="/admin" onClick={() => setShowNav(false)} className="text-[11px] tracking-[4px] uppercase opacity-40 hover:opacity-100 flex items-center gap-2">Administración <ChevronRight size={12} /></Link>
            </div>
          </div>
        </>
      )}

      {/* ══════ HERO ══════ */}
      {webSettings.storeHidden ? (
        <section className="w-full h-[70vh] flex flex-col items-center justify-center text-center px-6">
          <div className="max-w-md mx-auto space-y-6">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 size={24} className="text-black/30 animate-spin" />
            </div>
            <h2 className="text-[20px] sm:text-[24px] tracking-[10px] uppercase font-medium leading-tight">
              TIENDA EN MANTENIMIENTO
            </h2>
            <p className="text-[12px] sm:text-[14px] font-light leading-relaxed text-black/60">
              Estamos actualizando nuestro catálogo o realizando tareas de mantenimiento. Por favor, vuelve más tarde.
            </p>
            {(webSettings.contactWhatsapp || '5492346685836') && (
              <a 
                href={`https://wa.me/${(webSettings.contactWhatsapp || '5492346685836').replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hola El Ropero! Desde la pagina web me surgio una consulta sobre ...')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-8 text-[11px] tracking-[3px] uppercase font-medium border-b border-black pb-1 hover:opacity-50 transition-opacity"
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
              <div className="relative w-full h-[70vh] sm:h-[85vh] overflow-hidden bg-neutral-100">
            <img src={webSettings.heroImageUrl || '/assets/hero.png'} alt={webSettings.heroTitle || 'Portada'} className="w-full h-full object-cover grayscale brightness-95 contrast-105"/>
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 sm:pb-32 px-6 text-center text-white">
              <p className="text-[11px] tracking-[6px] uppercase font-light mb-4 drop-shadow-md">{webSettings.heroSubtitle || 'Nuevo Ingreso'}</p>
              <h2 className="text-[32px] sm:text-[52px] tracking-[12px] sm:tracking-[24px] uppercase font-light leading-none drop-shadow-lg mb-8">{webSettings.heroTitle || ''}</h2>
              <button onClick={() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })} className="bg-white text-black px-10 py-4 text-[11px] tracking-[4px] uppercase font-medium hover:bg-black hover:text-white transition-all duration-500">Explorar</button>
            </div>
          </div>
        </section>
      )}

      {/* ══════ GIFT CARD BANNER ══════ */}
      {!category && !search && !webSettings.storeHidden && (
        <section className="w-full bg-[#111111] text-[#F5F1EB] py-16 px-6 flex flex-col items-center justify-center text-center">
          <Gift size={40} strokeWidth={1} className="text-[#C9B8A8] mb-6" />
          <h3 className="text-[20px] sm:text-[28px] tracking-[8px] uppercase font-light mb-4">
            El Regalo Perfecto
          </h3>
          <p className="text-[13px] sm:text-[15px] font-light text-[#F5F1EB]/70 max-w-lg mb-10 leading-relaxed">
            Sorprendé a quien quieras con una Gift Card digital. Elegí el monto, escribí una dedicatoria y se la enviamos por mail al instante.
          </p>
          <button 
            onClick={() => setShowBuyGiftCard(true)}
            className="border border-[#C9B8A8] text-[#C9B8A8] px-10 py-4 text-[12px] tracking-[4px] uppercase font-semibold hover:bg-[#C9B8A8] hover:text-[#111111] transition-all"
          >
            Regalar Gift Card
          </button>
        </section>
      )}

      {/* ══════ COLLECTION ══════ */}
      <div id="catalogo" className="pt-16 sm:pt-24 px-6 sm:px-12 lg:px-16 flex flex-col items-center w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-40"><div className="w-8 h-8 rounded-full border border-black/15 border-t-black animate-spin"></div></div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-40">
            <p className="text-[14px] tracking-[3px] uppercase text-black/50 font-medium">
              {category ? `Sin stock disponible por el momento en ${category}` : 'No se han encontrado prendas'}
            </p>
          </div>
        ) : (
          <main className="w-full max-w-[1800px]">

            
            {/* Si no hay filtro, mostrar por secciones */}
            {!category && !search ? (
              sections.map(sec => {
                const secItems = filteredItems.filter(i => i.categoria === sec);
                if (secItems.length === 0) return null;
                const secDisc = webSettings.discountBySection?.[sec] || 0;
                return (
                  <section key={sec} className="mb-32">
                    <div className="px-6 mb-16 flex flex-col items-center text-center">
                      <div className="flex items-center justify-center gap-6 w-full max-w-md mx-auto">
                        <div className="h-[1px] bg-black/10 flex-1"></div>
                        <h2 className="text-[20px] sm:text-[28px] tracking-[10px] uppercase font-light text-black/90">{sec}</h2>
                        <div className="h-[1px] bg-black/10 flex-1"></div>
                      </div>
                      {secDisc > 0 && <span className="mt-6 inline-block bg-black text-white px-4 py-1.5 text-[10px] tracking-[4px] uppercase">-{secDisc}% OFF</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-16 sm:gap-y-24 gap-x-6 sm:gap-x-8">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-10 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedProduct(null)} />
          <div className="relative bg-white w-full max-w-5xl h-full sm:h-[90vh] flex flex-col sm:flex-row overflow-hidden transition-all sm:rounded-2xl shadow-2xl">
            <button onClick={() => setSelectedProduct(null)} className="absolute top-6 right-6 z-10 opacity-40 hover:opacity-100 p-2 bg-white/80 rounded-full shadow-md"><X size={20} strokeWidth={1.5} /></button>

            {/* Left: Gallery */}
            <div className="w-full sm:w-[60%] h-[40vh] sm:h-full bg-neutral-50 relative group">
              {selectedProduct.imagenes && selectedProduct.imagenes.length > 0 ? (
                <>
                  <img src={selectedProduct.imagenes[modalImgIdx]} alt="" className="w-full h-full object-cover transition-all duration-500"/>
                  {selectedProduct.imagenes.length > 1 && (
                    <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setModalImgIdx(prev => (prev - 1 + selectedProduct.imagenes.length) % selectedProduct.imagenes.length)} className="bg-white/80 p-2 rounded-full shadow-lg"><ChevronLeft size={20}/></button>
                      <button onClick={() => setModalImgIdx(prev => (prev + 1) % selectedProduct.imagenes.length)} className="bg-white/80 p-2 rounded-full shadow-lg"><ChevronRight size={20}/></button>
                    </div>
                  )}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                    {Array.isArray(selectedProduct.imagenes) && selectedProduct.imagenes.map((img, i) => <div key={`img-${i}`} className={`w-1.5 h-1.5 rounded-full transition-all ${i === modalImgIdx ? 'bg-black w-4' : 'bg-black/20'}`}/>)}
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center p-12 text-center">
                  <p className="text-[40px] sm:text-[64px] font-extralight tracking-tighter uppercase text-black/[0.05] leading-none">{selectedProduct.descripcion}</p>
                </div>
              )}
            </div>

            {/* Right: Info */}
            <div className="w-full sm:w-[40%] flex-1 p-6 sm:p-12 flex flex-col overflow-y-auto no-scrollbar">
              <p className="text-[11px] tracking-[3px] uppercase text-black/50 font-medium mb-2">{selectedProduct.categoria}</p>
              <h2 className="text-[20px] sm:text-[28px] tracking-[3px] uppercase font-semibold mb-6 leading-tight text-black">{selectedProduct.descripcion}</h2>

              
              {(() => {
                const disc = getDiscount(selectedProduct);
                const efDisc = getDiscountedPrice(selectedProduct.ventaEfectivo, disc, true);
                const tarDisc = getDiscountedPrice(selectedProduct.ventaTarjeta, disc, false);
                const cuotas3 = Math.round(tarDisc / 3);
                const cuotas6 = Math.round(tarDisc / 6);
                return (
                  <div className="space-y-3 mb-8 fade-in">
                    {disc > 0 && (
                      <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-600 px-2.5 py-1 rounded-full mb-1 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        <span className="text-[9px] tracking-[2px] uppercase font-bold">-{disc}% OFF SALE</span>
                      </div>
                    )}
                    
                    {/* PRECIO EFECTIVO */}
                    <div className="rounded-xl bg-white border border-black/10 p-3.5 transition-all hover:border-black/20 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex-1 min-w-[140px]">
                          <p className="text-[9px] sm:text-[10px] tracking-[2px] uppercase text-black/50 font-bold mb-2">Transferencia</p>
                          <div className="flex flex-wrap gap-2">
                            <div className="flex items-center bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1">
                              <span className="text-[10px] uppercase tracking-[1px] font-bold text-emerald-600">{DESCUENTO_BASE_TRANSFERENCIA}% OFF</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {efDisc < selectedProduct.ventaEfectivo && <span className="text-[11px] font-medium line-through text-black/30 block mb-0.5">${selectedProduct.ventaEfectivo.toLocaleString()}</span>}
                          <span className={`text-[18px] sm:text-[22px] font-bold tracking-tight ${efDisc < selectedProduct.ventaEfectivo ? 'text-rose-600' : 'text-black/80'}`}>${efDisc.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* PRECIO TARJETA */}
                    <div className="rounded-xl bg-white border border-black/10 p-3.5 transition-all hover:border-black/20 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex-1 min-w-[140px]">
                          <p className="text-[9px] sm:text-[10px] tracking-[2px] uppercase text-black/50 font-bold mb-2">Tarjetas / Otros</p>
                          <div className="flex flex-wrap gap-2">
                            <div className="flex items-center gap-1.5 bg-neutral-50 border border-black/5 rounded-lg pr-2 pl-1 py-1">
                              <span className="text-[9px] uppercase tracking-[1px] font-bold bg-black text-white px-1.5 py-0.5 rounded-md">3x</span>
                              <span className="text-[11px] font-semibold text-black">${cuotas3.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-neutral-50 border border-black/5 rounded-lg pr-2 pl-1 py-1">
                              <span className="text-[9px] uppercase tracking-[1px] font-bold bg-black text-white px-1.5 py-0.5 rounded-md">6x</span>
                              <span className="text-[11px] font-semibold text-black">${cuotas6.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {tarDisc < selectedProduct.ventaTarjeta && <span className="text-[11px] font-medium line-through text-black/30 block mb-0.5">${selectedProduct.ventaTarjeta.toLocaleString()}</span>}
                          <span className={`text-[18px] sm:text-[22px] font-bold tracking-tight ${tarDisc < selectedProduct.ventaTarjeta ? 'text-rose-600' : 'text-black/80'}`}>${tarDisc.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Talles */}
              {selectedProduct.talles && selectedProduct.talles.length > 0 && (
                <div className="mb-8">
                  <p className="text-[12px] tracking-[3px] uppercase text-black/60 font-semibold mb-4 text-center sm:text-left">Talles</p>
                  <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                    {Array.isArray(selectedProduct.talles) && Array.from(new Set(selectedProduct.talles as string[])).map((t, idx) => {
                      let isOutOfStock = false;
                      if (selectedProduct.stockPorVariante && modalColor) {
                        isOutOfStock = getVariantStock(selectedProduct, t, modalColor) <= 0;
                      } else if (selectedProduct.stockPorVariante) {
                        isOutOfStock = !selectedProduct.colores?.some(c => getVariantStock(selectedProduct, t, c) > 0);
                      }
                      
                      return (
                        <button 
                          key={`${t}-${idx}`} 
                          disabled={isOutOfStock}
                          onClick={() => {
                            setModalTalle(t);
                            if (selectedProduct.colores && modalColor && getVariantStock(selectedProduct, t, modalColor) <= 0) {
                              const nextColor = selectedProduct.colores.find(c => getVariantStock(selectedProduct, t, c) > 0);
                              if (nextColor) setModalColor(nextColor);
                            }
                          }} 
                          className={`w-12 h-12 text-[11px] tracking-[1px] flex items-center justify-center border transition-all ${
                            modalTalle === t 
                              ? 'border-black border-[2px] font-bold text-black' 
                              : isOutOfStock
                                ? 'border-black/5 opacity-20 cursor-not-allowed line-through'
                                : 'border-black/20 text-black/60 hover:border-black/50'
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
                <div className="mb-8">
                  <p className="text-[12px] tracking-[3px] uppercase text-black/60 font-semibold mb-4 text-center sm:text-left">Color</p>
                  <div className="flex flex-wrap gap-2.5 justify-center sm:justify-start">
                    {Array.isArray(selectedProduct.colores) && Array.from(new Set(selectedProduct.colores as string[])).map((c, idx) => {
                      const colorStock = modalTalle ? getVariantStock(selectedProduct, modalTalle, c) : getVariantStock(selectedProduct, undefined, c);
                      const hasStockTracking = selectedProduct.stockPorVariante !== undefined || selectedProduct.coloresStock !== undefined;
                      const isOutOfStock = hasStockTracking && colorStock <= 0;
                      const isSel = modalColor === c;
                      const hex = getColorHex(c);
                      
                      return (
                        <button 
                          key={`${c}-${idx}`} 
                          disabled={isOutOfStock}
                          onClick={() => {
                            setModalColor(c);
                            if (selectedProduct.talles && modalTalle && getVariantStock(selectedProduct, modalTalle, c) <= 0) {
                              const nextTalle = selectedProduct.talles.find(t => getVariantStock(selectedProduct, t, c) > 0);
                              if (nextTalle) setModalTalle(nextTalle);
                            }
                          }} 
                          className={`px-3 py-2 text-[10px] tracking-[2px] uppercase border transition-all flex items-center gap-2 rounded-lg font-medium ${
                            isSel 
                              ? 'border-black border-[2px] text-black shadow-sm font-bold' 
                              : isOutOfStock
                                ? 'border-black/5 opacity-20 cursor-not-allowed line-through'
                                : 'border-black/20 text-black/60 hover:border-black/50'
                          }`}
                        >
                          <span 
                            className="w-3.5 h-3.5 rounded-full border border-black/10 flex-shrink-0"
                            style={{ background: hex }}
                          />
                          <span>{c}</span>
                          {hasStockTracking && (
                            <span className="text-[8px] font-bold opacity-60 ml-1">
                              {isOutOfStock ? '(SIN STOCK)' : colorStock <= 2 ? `(Últimas ${colorStock} u.)` : `(${colorStock} u.)`}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}


              {/* Medidas */}
              {selectedProduct.medidas && (
                <div className="mb-8 p-4 bg-neutral-50/50 border border-black/5">
                  <p className="text-[12px] tracking-[3px] uppercase text-black/60 font-semibold mb-2 flex items-center gap-2"><Ruler size={12}/> Medidas y Calce</p>
                  <p className="text-[13px] tracking-[1px] leading-relaxed text-black/70 uppercase">{selectedProduct.medidas}</p>
                </div>
              )}

              <div className="mt-auto space-y-3">
                {(() => {
                  const needsTalle = selectedProduct.talles && selectedProduct.talles.length > 0;
                  const needsColor = selectedProduct.colores && selectedProduct.colores.length > 0;
                  const canAdd = (!needsTalle || modalTalle) && (!needsColor || modalColor);
                  return (
                    <button 
                      disabled={!canAdd}
                      onClick={() => { addToCart(selectedProduct, modalTalle, modalColor); setSelectedProduct(null); }} 
                      className={`w-full py-5 text-[13px] tracking-[4px] uppercase font-semibold transition-colors ${canAdd ? 'bg-black text-white hover:bg-neutral-800' : 'bg-black/10 text-black/40 cursor-not-allowed'}`}
                    >
                      {canAdd ? 'Añadir al carrito' : 'Selecciona opciones'}
                    </button>
                  );
                })()}
                <p className="text-[11px] tracking-[2px] uppercase text-black/40 font-medium text-center">Ref: {selectedProduct.sku}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ CART ══════ */}
      {showCart && (
        <>
          <div className="fixed inset-0 bg-black/20 z-[110]" onClick={() => setShowCart(false)} />
          <div className="fixed top-0 right-0 h-full w-full sm:w-[450px] bg-white z-[120] shadow-2xl flex flex-col drawer-slide-in">
            <div className="flex items-center justify-between px-8 h-20 border-b border-black/5">
              <span className="text-[14px] tracking-[4px] uppercase font-semibold">
                {exchangeSession ? `Cambio — nuevas (${cartCount})` : `Carrito (${cartCount})`}
              </span>
              <button onClick={() => setShowCart(false)} className="opacity-40 hover:opacity-100"><X size={20} strokeWidth={1} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-8 divide-y divide-black/5">
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
                        {disc > 0 && <span className="text-[10px] tracking-[2px] uppercase text-red-600 font-bold mb-3">-{disc}% OFF</span>}
                        <div className="mt-auto flex justify-between items-center">
                          <div className="flex items-center border border-black/15">
                            <button onClick={() => updateQty(c.product.id, -1, c.selectedTalle, c.selectedColor)} className="w-9 h-9 flex items-center justify-center hover:bg-black/5"><Minus size={14} /></button>
                            <span className="w-10 text-center text-[14px] font-semibold text-black">{c.quantity}</span>
                            <button onClick={() => updateQty(c.product.id, 1, c.selectedTalle, c.selectedColor)} className="w-9 h-9 flex items-center justify-center hover:bg-black/5"><Plus size={14} /></button>
                          </div>
                          <div className="text-right">
                            {disc > 0 && <span className="text-[12px] font-light line-through text-black/30 block">${(basePrice * c.quantity).toLocaleString()}</span>}
                            <span className={`text-[18px] font-bold ${disc > 0 ? 'text-red-600' : 'text-black'}`}>${(price * c.quantity).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {cart.length > 0 && !exchangeSession && (
              <div className="p-6 border-t border-black/5 space-y-4 bg-white flex-shrink-0">
                {/* Selector de Medio de Pago */}
                <div className="space-y-2">
                  <p className="text-[9px] tracking-[2px] uppercase font-bold text-black/30">Medio de Pago</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('transferencia')}
                      className={`relative p-3.5 border text-left flex flex-col gap-1 rounded-2xl transition-all duration-200 ${
                        paymentMethod === 'transferencia'
                          ? 'border-black bg-black text-white shadow-lg scale-[1.02]'
                          : 'border-black/10 bg-white hover:border-black/30 hover:shadow-sm'
                      }`}
                    >
                      <span className={`text-[9px] tracking-[1.5px] uppercase font-bold ${paymentMethod === 'transferencia' ? 'text-white' : 'text-black'}`}>Transferencia</span>
                      <span className={`text-[9px] font-bold ${paymentMethod === 'transferencia' ? 'text-emerald-300' : 'text-emerald-600'}`}>-{DESCUENTO_BASE_TRANSFERENCIA}% OFF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('tarjeta')}
                      className={`relative p-3.5 border text-left flex flex-col gap-1 rounded-2xl transition-all duration-200 ${
                        paymentMethod === 'tarjeta'
                          ? 'border-black bg-black text-white shadow-lg scale-[1.02]'
                          : 'border-black/10 bg-white hover:border-black/30 hover:shadow-sm'
                      }`}
                    >
                      <span className={`text-[9px] tracking-[1.5px] uppercase font-bold ${paymentMethod === 'tarjeta' ? 'text-white' : 'text-black'}`}>Tarjeta</span>
                      <span className={`text-[9px] font-medium ${paymentMethod === 'tarjeta' ? 'text-white/50' : 'text-black/40'}`}>Precio lista</span>
                    </button>
                  </div>
                </div>

                {/* Gift Card Coupon Accordion inside Cart */}
                <div className="border border-black/8 rounded-2xl overflow-hidden bg-neutral-50/60">
                  <button
                    type="button"
                    onClick={() => setShowCartGiftInput(!showCartGiftInput)}
                    className="w-full px-4 py-3 flex items-center justify-between text-[9px] tracking-[2px] uppercase font-bold text-black/70 hover:bg-black/5 transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <Gift size={11} strokeWidth={1.5} /> ¿Tenés una Gift Card?
                    </span>
                    <ChevronDown size={12} strokeWidth={1.5} className={`text-black/30 transition-transform duration-200 ${showCartGiftInput ? 'rotate-180' : ''}`} />
                  </button>

                  {showCartGiftInput && (
                    <div className="p-4 border-t border-black/5 space-y-3 bg-[#F5F1EB]/10 animate-in fade-in duration-300">
                      {appliedGiftCard ? (
                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-150 p-3 rounded-lg">
                          <div className="space-y-0.5 text-left">
                            <p className="text-[8px] font-bold text-emerald-800 tracking-[1.5px] uppercase">
                              Gift Card Aplicada
                            </p>
                            <p className="text-[10px] font-mono font-bold text-emerald-950">
                              {appliedGiftCard.codigo}
                            </p>
                            <p className="text-[9px] text-emerald-700/80 font-medium">
                              Descuento: ${cartGiftDiscountAmount.toLocaleString('es-AR')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveCartGift}
                            className="text-[8px] tracking-[1.5px] uppercase font-bold text-red-600 hover:text-red-800 underline transition-all"
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
                              placeholder="CÓDIGO DE GIFT CARD"
                              disabled={isValidatingCartGift}
                              className="flex-1 bg-white border border-black/10 px-3 py-2 text-[10px] tracking-[1.5px] font-mono focus:outline-none focus:border-black uppercase placeholder:text-black/20"
                            />
                            <button
                              type="button"
                              onClick={handleApplyCartGift}
                              disabled={isValidatingCartGift || !cartGiftCode.trim()}
                              className="bg-black hover:bg-neutral-800 disabled:opacity-30 text-white px-4 text-[9px] tracking-[1.5px] uppercase font-bold transition-all flex items-center justify-center min-w-[70px]"
                            >
                              {isValidatingCartGift ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : (
                                'Aplicar'
                              )}
                            </button>
                          </div>
                          {cartGiftError && (
                            <p className="text-[8px] uppercase tracking-[1px] text-red-600 font-semibold animate-pulse text-left">
                              ⚠️ {cartGiftError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Desglose de Totales del Carrito */}
                <div className="space-y-1.5 border-t border-black/5 pt-4 text-[10px] tracking-[1px] uppercase">
                  <div className="flex justify-between text-black/50">
                    <span>Subtotal prendas</span>
                    <span>${cartTotal.toLocaleString('es-AR')}</span>
                  </div>
                  {appliedGiftCard && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Descuento Gift Card</span>
                      <span>-${cartGiftDiscountAmount.toLocaleString('es-AR')}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-baseline border-t border-black/5 pt-3">
                  <span className="text-[9px] tracking-[3px] uppercase text-black/40 font-semibold">Total Final</span>
                  <span className="text-[26px] font-bold text-black tracking-tight">${finalCartTotal.toLocaleString()}</span>
                </div>

                <button 
                  onClick={() => {
                    setShowCart(false);
                    if (user) {
                      setShowCheckout(true);
                    } else {
                      setShowAuthModal(true);
                    }
                  }} 
                  className="group w-full bg-black text-white py-[14px] text-[10px] tracking-[5px] uppercase font-semibold hover:bg-neutral-900 transition-all duration-300 flex items-center justify-center gap-3 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.18)] hover:shadow-[0_6px_28px_rgba(0,0,0,0.28)] hover:scale-[1.01] active:scale-[0.99]"
                >
                  Finalizar pedido
                  <ArrowRight size={14} strokeWidth={1.5} className="transition-transform duration-300 group-hover:translate-x-1" />
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
        <div className="w-full max-w-4xl flex flex-col sm:flex-row justify-center items-center gap-8">
          <p className="text-[11px] tracking-[3px] uppercase text-black/50 font-medium">© 2026 {webSettings.storeName || 'EL ROPERO'} SHOWROOM</p>
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
                <p>Las prendas tienen cambio dentro de los 30 días corridos de realizada la compra, presentándolas con su etiqueta original y en perfecto estado.</p>
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
        onClose={() => setShowAuthModal(false)}
        onContinueAsGuest={() => {
          setShowAuthModal(false);
          setShowCheckout(true);
        }}
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
      />
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
    <article className="fade-in group flex flex-col relative" style={{ animationDelay: `${(idx % 8) * 100}ms` }}>
      <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] overflow-hidden bg-neutral-50/50 cursor-pointer flex items-center justify-center" onClick={() => onOpen(item)}>
        {item.imagenes?.[0] ? (
          <img src={item.imagenes[0]} alt="" className="w-full h-full object-contain p-2 transition-transform duration-700 group-hover:scale-105"/>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 transition-transform duration-700 group-hover:scale-110">
            <p className="text-[14px] sm:text-[18px] md:text-[22px] font-extralight tracking-[4px] sm:tracking-[6px] uppercase text-black/[0.08] leading-normal select-none text-center break-words px-4">{item.descripcion}</p>
          </div>
        )}
        <button onClick={(e) => { e.stopPropagation(); onOpen(item); }} className={`absolute bottom-0 left-0 w-full py-4 text-[10px] tracking-[4px] uppercase font-medium transition-all duration-500 translate-y-full group-hover:translate-y-0 ${addedFeedback === item.id ? 'bg-black text-white' : 'bg-white/90 text-black'}`}>Ver Detalles</button>
        
        {/* Wishlist Heart Icon */}
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id); }}
          className="absolute top-4 right-4 z-10 bg-white/80 p-2 rounded-full shadow-md hover:bg-white transition-all scale-100 active:scale-95 flex items-center justify-center"
        >
          <Heart 
            size={14} 
            strokeWidth={1.5} 
            className={`transition-colors duration-300 ${isFavorited ? 'fill-red-600 text-red-600' : 'text-black/60'}`} 
          />
        </button>

        <div className="absolute top-4 left-4 flex flex-col gap-1">
          {item.cantidad <= 2 && <span className="text-[9px] tracking-[2px] uppercase bg-black text-white px-2 py-1">Últimas unidades</span>}
          {discount > 0 && <span className="text-[9px] tracking-[2px] uppercase bg-red-500 text-white px-2 py-1 font-semibold">-{discount}% OFF</span>}
        </div>
      </div>
      {/* Info de precio */}
      <div className="mt-3 px-1.5 flex flex-col gap-0.5 text-left">
        <h4 className="text-[10px] sm:text-[13px] tracking-[1.5px] uppercase font-medium text-black truncate">{item.descripcion}</h4>
        {/* Precio tarjeta — principal */}
        <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
          {discount > 0 && <span className="text-[9px] sm:text-[11px] font-light line-through text-black/30">${item.ventaTarjeta.toLocaleString()}</span>}
          <span className={`text-[12px] sm:text-[16px] font-semibold tracking-tight ${discount > 0 ? 'text-red-600' : 'text-black'}`}>${tarjetaPrice.toLocaleString()}</span>
          <span className="text-[9px] tracking-[1px] text-black/40 uppercase font-light">tarjeta</span>
        </div>
        {/* Cuotas: Habilitado solo para desktop para mantener la grilla móvil sumamente sutil, fina y despejada */}
        <div className="hidden sm:flex flex-col gap-0.5 mt-1 border-t border-black/[0.03] pt-1">
          <p className="text-[10px] tracking-[0.5px] text-black/60 font-light">3 cuotas de <span className="font-semibold text-black">${cuotas3.toLocaleString()}</span></p>
          <p className="text-[10px] tracking-[0.5px] text-black/60 font-light">6 cuotas de <span className="font-semibold text-black">${cuotas6.toLocaleString()}</span></p>
        </div>
      </div>
    </article>

  );
};

export default StorefrontPage;
