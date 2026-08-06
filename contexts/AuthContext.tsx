import React from 'react';
import { 
  User, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from '../services/firebase';
import { InventoryItem } from '../types';
import { sendWelcomeEmail } from '../services/emailService';

const PUBLIC_SHOWROOM_ID = localStorage.getItem('ropero_showroom_id_v3_2026') || 'EL-ROPERO-DEFAULT';

export interface ShippingAddress {
  id: string;
  provincia: string;
  localidad: string;
  calle: string;
  numero: string;
  pisoDepto?: string;
  codigoPostal: string;
  indicaciones?: string;
  esPrincipal: boolean;
}

export interface SavedCartItem {
  productId: string;
  quantity: number;
  payMethod: 'transferencia' | 'efectivo' | 'tarjeta';
  selectedTalle?: string;
  selectedColor?: string;
}

export interface CustomerProfile {
  uid: string;
  email: string;
  nombre?: string;
  telefono?: string;
  direcciones: ShippingAddress[];
  wishlist: string[]; // IDs de productos
  cart: SavedCartItem[];
  giftCards?: string[]; // Códigos de Gift Cards
  createdAt: string;
}

export interface CustomerOrder {
  id: string;
  fecha: string;
  items: {
    productId: string;
    descripcion: string;
    sku: string;
    cantidad: number;
    precioUnitario: number;
    talle?: string;
    color?: string;
  }[];
  total: number;
  metodoPago: string;
  tipoEnvio: 'retiro' | 'envio';
  direccionEnvio?: ShippingAddress;
  estado: 'Pendiente' | 'Enviado' | 'Entregado' | 'Confirmado' | 'Cancelado';
  saleId?: string;
  costoEnvio?: number;
  ualaPlan?: {
    cuotas: number;
    montoCuota: number;
    totalConRecargo: number;
  } | null;
  isExchanged?: boolean;
}

interface AuthContextType {
  user: User | null;
  customerProfile: CustomerProfile | null;
  orders: CustomerOrder[];
  isLoading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name?: string, phone?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  reauthenticate: (password: string) => Promise<boolean>;
  updateProfile: (updates: Partial<Omit<CustomerProfile, 'uid' | 'email' | 'createdAt'>>) => Promise<void>;
  addToWishlist: (productId: string) => Promise<void>;
  removeFromWishlist: (productId: string) => Promise<void>;
  syncCart: (cartItems: SavedCartItem[]) => Promise<void>;
  addOrder: (orderData: Omit<CustomerOrder, 'id' | 'fecha' | 'estado'>) => Promise<string>;
  refreshOrders: () => Promise<void>;
  assignGiftCard: (codigo: string) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [customerProfile, setCustomerProfile] = React.useState<CustomerProfile | null>(null);
  const [orders, setOrders] = React.useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const ordersUnsubscribe = React.useRef<() => void>();

  // Obtener referencia al documento del cliente
  const getCustomerRef = (uid: string) => {
    return doc(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'customers', uid);
  };

  // Cargar órdenes de compra del cliente
  const fetchOrders = async (uid: string) => {
    try {
      if (ordersUnsubscribe.current) {
        ordersUnsubscribe.current();
      }
      const ordersCol = collection(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'customers', uid, 'orders');
      const q = query(ordersCol, orderBy('fecha', 'desc'));
      
      ordersUnsubscribe.current = onSnapshot(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerOrder));
        setOrders(list);
      }, (error) => {
        console.error('Error in orders snapshot:', error);
      });
    } catch (e) {
      console.error('Error al configurar listener de órdenes de compra:', e);
    }
  };

  const refreshOrders = async () => {
    if (user) await fetchOrders(user.uid);
  };

  // Crear o asegurar perfil en Firestore
  const ensureProfile = async (firebaseUser: User, extraData?: { nombre?: string; telefono?: string }) => {
    const ref = getCustomerRef(firebaseUser.uid);
    const snap = await getDoc(ref);

    let profile: CustomerProfile;

    if (!snap.exists()) {
      profile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        nombre: extraData?.nombre || firebaseUser.displayName || '',
        telefono: extraData?.telefono || '',
        direcciones: [],
        wishlist: [],
        cart: [],
        createdAt: new Date().toISOString()
      };
      await setDoc(ref, profile);
      if (profile.email) {
        sendWelcomeEmail(profile.email, profile.nombre).catch(err => 
          console.error('[Email] Error al enviar correo de bienvenida:', err)
        );
      }
    } else {
      profile = snap.data() as CustomerProfile;
      // Si hay datos nuevos a actualizar
      if (extraData && (extraData.nombre || extraData.telefono)) {
        const updates: Partial<CustomerProfile> = {};
        if (extraData.nombre) updates.nombre = extraData.nombre;
        if (extraData.telefono) updates.telefono = extraData.telefono;
        await updateDoc(ref, updates);
        profile = { ...profile, ...updates };
      }
    }

    // Fusión de carritos
    const localCartRaw = localStorage.getItem('ropero_guest_cart');
    if (localCartRaw) {
      try {
        const localCart = JSON.parse(localCartRaw) as SavedCartItem[];
        if (localCart.length > 0) {
          const mergedCart = [...profile.cart];
          
          localCart.forEach(localItem => {
            const idx = mergedCart.findIndex(
              c => c.productId === localItem.productId && 
                   c.selectedTalle === localItem.selectedTalle && 
                   c.selectedColor === localItem.selectedColor
            );
            if (idx !== -1) {
              // Si existe, combinamos cantidades
              mergedCart[idx].quantity += localItem.quantity;
            } else {
              mergedCart.push(localItem);
            }
          });

          await updateDoc(ref, { cart: mergedCart });
          profile.cart = mergedCart;
          localStorage.removeItem('ropero_guest_cart');
          console.log('🛒 Carrito de invitado fusionado con éxito!');
        }
      } catch (e) {
        console.error('Error al fusionar carrito local:', e);
      }
    }

    // Fusión de wishlist local
    const localWishRaw = localStorage.getItem('ropero_guest_wishlist');
    if (localWishRaw) {
      try {
        const localWish = JSON.parse(localWishRaw) as string[];
        if (localWish.length > 0) {
          const mergedWish = Array.from(new Set([...profile.wishlist, ...localWish]));
          await updateDoc(ref, { wishlist: mergedWish });
          profile.wishlist = mergedWish;
          localStorage.removeItem('ropero_guest_wishlist');
          console.log('❤️ Wishlist de invitado fusionada con éxito!');
        }
      } catch (e) {
        console.error('Error al fusionar wishlist local:', e);
      }
    }

    setCustomerProfile(profile);
    await fetchOrders(firebaseUser.uid);
  };

  // Monitorear estado de autenticación
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          await ensureProfile(firebaseUser);
        } catch (e) {
          console.error('Error al cargar perfil de cliente en Firestore:', e);
        }
      } else {
        setUser(null);
        setCustomerProfile(null);
        setOrders([]);
        if (ordersUnsubscribe.current) {
          ordersUnsubscribe.current();
          ordersUnsubscribe.current = undefined;
        }
      }
      setIsLoading(false);
    });
    return () => {
      unsub();
      if (ordersUnsubscribe.current) {
        ordersUnsubscribe.current();
      }
    };
  }, []);

  // API de Autenticación
  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (email: string, pass: string, name?: string, phone?: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, pass);
    await ensureProfile(credential.user, { nombre: name, telefono: phone });
  };

  const loginWithGoogle = async () => {
    const credential = await signInWithPopup(auth, googleProvider);
    await ensureProfile(credential.user);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const resetPassword = async (email: string) => {
    const continueUrl = window.location.origin;
    try {
      // 1. Intentar enviar el correo de recuperación con estética web y botón propio del sistema a través de la Cloud Function
      const response = await fetch('https://us-central1-el-ropero-8989a.cloudfunctions.net/sendCustomPasswordResetEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { email, continueUrl } }),
      });
      if (response.ok) {
        console.log('[Auth] Correo de recuperación con estética web enviado exitosamente vía Cloud Function.');
        return;
      }
      console.warn('[Auth] Endpoint de reseteo personalizado respondió con error, usando fallback de Firebase:', response.status);
    } catch (err) {
      console.warn('[Auth] No se pudo contactar a la Cloud Function de reseteo (puede no estar desplegada aún), usando fallback estándar:', err);
    }

    // 2. Fallback estándar de Firebase Auth si la Cloud Function aún no está desplegada o no es accesible
    const actionCodeSettings = {
      url: window.location.origin + '/reset-password',
    };
    await sendPasswordResetEmail(auth, email, actionCodeSettings);
  };

  const reauthenticate = async (password: string): Promise<boolean> => {
    if (!user || !user.email) return false;
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      return true;
    } catch (e) {
      console.error('Error de re-autenticación:', e);
      return false;
    }
  };

  // Mutaciones de Perfil en Firestore
  const updateProfile = async (updates: Partial<Omit<CustomerProfile, 'uid' | 'email' | 'createdAt'>>) => {
    if (!user) return;
    const ref = getCustomerRef(user.uid);
    await updateDoc(ref, updates);
    setCustomerProfile(prev => prev ? { ...prev, ...updates } : null);
  };

  const addToWishlist = async (productId: string) => {
    if (!user || !customerProfile) {
      // Fallback local para invitados
      const local = localStorage.getItem('ropero_guest_wishlist');
      const list = local ? JSON.parse(local) as string[] : [];
      if (!list.includes(productId)) {
        list.push(productId);
        localStorage.setItem('ropero_guest_wishlist', JSON.stringify(list));
      }
      return;
    }
    const updatedWish = [...customerProfile.wishlist];
    if (!updatedWish.includes(productId)) {
      updatedWish.push(productId);
      await updateProfile({ wishlist: updatedWish });
    }
  };

  const removeFromWishlist = async (productId: string) => {
    if (!user || !customerProfile) {
      // Fallback local para invitados
      const local = localStorage.getItem('ropero_guest_wishlist');
      if (local) {
        const list = JSON.parse(local) as string[];
        const filtered = list.filter(id => id !== productId);
        localStorage.setItem('ropero_guest_wishlist', JSON.stringify(filtered));
      }
      return;
    }
    const updatedWish = customerProfile.wishlist.filter(id => id !== productId);
    await updateProfile({ wishlist: updatedWish });
  };

  const syncCart = async (cartItems: SavedCartItem[]) => {
    if (!user || !customerProfile) {
      // Guardar localmente para invitados
      localStorage.setItem('ropero_guest_cart', JSON.stringify(cartItems));
      return;
    }
    await updateProfile({ cart: cartItems });
  };

  const assignGiftCard = async (codigo: string) => {
    if (!user || !customerProfile) return;
    const list = customerProfile.giftCards || [];
    if (!list.includes(codigo)) {
      const updated = [...list, codigo];
      await updateProfile({ giftCards: updated });
    }
  };

  const addOrder = async (orderData: Omit<CustomerOrder, 'id' | 'fecha' | 'estado'>): Promise<string> => {
    if (!user) {
      throw new Error('Debe iniciar sesión para registrar pedidos en su cuenta.');
    }
    const ordersCol = collection(db, 'showrooms', PUBLIC_SHOWROOM_ID, 'customers', user.uid, 'orders');
    const newOrder: Omit<CustomerOrder, 'id'> = {
      ...orderData,
      fecha: new Date().toISOString(),
      estado: 'Pendiente'
    };
    
    // 1. Guardar orden en el historial del cliente
    const docRef = await addDoc(ordersCol, newOrder);

    // 2. Limpiar carrito de compras
    await updateProfile({ cart: [] });

    // 3. Recargar órdenes locales
    await fetchOrders(user.uid);

    return docRef.id;
  };

  return (
    <AuthContext.Provider value={{
      user,
      customerProfile,
      orders,
      isLoading,
      loginWithEmail,
      signUpWithEmail,
      loginWithGoogle,
      logout,
      resetPassword,
      reauthenticate,
      updateProfile,
      addToWishlist,
      removeFromWishlist,
      syncCart,
      addOrder,
      refreshOrders,
      assignGiftCard
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};
