import React from 'react';
import { sendNotificationEmail, sendSaleConfirmationEmail, sendGiftCardEmail } from './services/emailService';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Sales from './components/Sales';
import Stock from './components/Stock';
import Expenses from './components/Expenses';
import { InventoryItem, Sale, Expense, Section, GiftCard, MonthlyClosure, WebSettings } from './types';
import { database, DatabaseState } from './services/storage';
import { DESCUENTO_BASE_TRANSFERENCIA } from './services/exchangePricing';
import { Store, Lock, Loader2, Monitor, ArrowRightLeft, Smartphone, Globe, ShieldCheck, Clock, Key, RefreshCw } from 'lucide-react';
import GiftCards from './components/GiftCard';
import WebManager from './components/WebManager';
import StorefrontPage from './components/StorefrontPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import TransferSuccessPage from './components/TransferSuccessPage';
import WebOrdersManager from './components/WebOrdersManager';
import InnovativeLoader from './components/InnovativeLoader';
import { computeSaleBreakdown, isMonth, getItemSnapshot } from './services/finance';
import { deductSaleFromInventory, restoreSaleToInventory } from './services/webOrderFulfillment';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ModalProvider } from './contexts/ModalContext';
import NetworkStatus from './components/NetworkStatus';
import { auth, functions } from './services/firebase';
import { httpsCallable } from 'firebase/functions';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';


// Sistema seguro de autenticación activado
const App: React.FC = () => {
  const [isEntered, setIsEntered] = React.useState(false);
  const [adminEmail, setAdminEmail] = React.useState("elropero.informacion@gmail.com");
  const [password, setPassword] = React.useState("");
  const [showroomID, setShowroomID] = React.useState(() => database.getShowroomID());
  const [authError, setAuthError] = React.useState<string | null>(null);

  // Intentos fallidos guardados en localStorage para ser inmunes a F5 / recargas
  const [failedAttempts, setFailedAttempts] = React.useState<number>(() => {
    const saved = localStorage.getItem('ropero_admin_failed_attempts');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lockUntil, setLockUntil] = React.useState<number | null>(() => {
    const saved = localStorage.getItem('ropero_admin_lock_until');
    if (!saved) return null;
    const lockTime = parseInt(saved, 10);
    if (Date.now() >= lockTime) {
      localStorage.removeItem('ropero_admin_lock_until');
      localStorage.removeItem('ropero_admin_failed_attempts');
      return null;
    }
    return lockTime;
  });

  // Estados para autenticación de 2 factores (2FA OTP)
  const [step2FA, setStep2FA] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [isSendingOTP, setIsSendingOTP] = React.useState(false);
  const [otpCountdown, setOtpCountdown] = React.useState(300); // 5 min
  const [showInactivityWarning, setShowInactivityWarning] = React.useState(false);

  const [isLoading, setIsLoading] = React.useState(false);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isDataLoaded, setIsDataLoaded] = React.useState(false);
  const [section, setSection] = React.useState<Section>('admin');

  // Countdown timer para el código 2FA
  React.useEffect(() => {
    if (!step2FA || otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [step2FA, otpCountdown]);

  // Timer de inactividad de 30 minutos con advertencia previa de 60 segundos
  React.useEffect(() => {
    if (!isEntered) return;

    let warningTimer: NodeJS.Timeout;
    let logoutTimer: NodeJS.Timeout;

    const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutos
    const WARNING_TIME = 29 * 60 * 1000; // 29 minutos (alerta a los 60 seg restantes)

    const resetInactivityTimers = () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      setShowInactivityWarning(false);

      warningTimer = setTimeout(() => {
        setShowInactivityWarning(true);
      }, WARNING_TIME);

      logoutTimer = setTimeout(async () => {
        console.warn('🔒 Sesión de administración cerrada por inactividad.');
        setShowInactivityWarning(false);
        sessionStorage.removeItem('ropero_2fa_verified');
        try {
          await signOut(auth);
        } catch (err) {
          console.error('Error cerrando sesión por inactividad:', err);
        }
        setIsEntered(false);
        setStep2FA(false);
        alert('Su sesión de administración ha sido cerrada automáticamente por inactividad.');
      }, INACTIVITY_LIMIT);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(ev => window.addEventListener(ev, resetInactivityTimers));
    resetInactivityTimers();

    return () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      events.forEach(ev => window.removeEventListener(ev, resetInactivityTimers));
    };
  }, [isEntered]);

  const [inventory, setInventory] = React.useState<InventoryItem[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [giftCards, setGiftCards] = React.useState<GiftCard[]>([]);
  const [closures, setClosures] = React.useState<MonthlyClosure[]>([]);
  const [webSettings, setWebSettings] = React.useState<WebSettings>({
    heroImageUrl: '/assets/hero.png',
    heroTitle: '',
    heroSubtitle: 'NUEVO INGRESO',
    storeName: 'EL ROPERO',
    contactWhatsapp: '5492346685836',
    categoriesOrder: [],
    announcementText: '20% de descuento pagando por transferencia ★',
    aboutUsText: 'El Ropero es el resultado de un compromiso profundo con la indumentaria y cada detalle. Lo que comenzó como un proyecto personal impulsado por esfuerzo y dedicación, se consolidó hoy como un espacio donde pensamos en cada mujer. Cada paso de nuestro camino está marcado por la gratitud hacia quienes nos eligen.',
    locationShowroomAddress: 'San Martín 382, Chivilcoy',
    locationShowroomMapUrl: 'https://www.google.com/maps/search/?api=1&query=San+Martin+382+Chivilcoy+Buenos+Aires',
    locationPickupAddress: 'Recoleta, CABA',
    locationPickupMapUrl: 'https://www.google.com/maps/search/?api=1&query=Recoleta+CABA'
  });

  const [isSyncing, setIsSyncing] = React.useState(false);
  const [lastUpdate, setLastUpdate] = React.useState<number>(0);
  const [hasMigrated, setHasMigrated] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<string>('');
  const [webManagerEditItemId, setWebManagerEditItemId] = React.useState<string | null>(null);

  const handleNavigateToWebManager = React.useCallback((itemId: string) => {
    setWebManagerEditItemId(itemId);
    setSection('sitio');
  }, []);

  // =======================
  // APLICAR DATA REMOTA
  // =======================
  const applyRemoteData = React.useCallback((data: DatabaseState) => {
    console.log('📥 Aplicando datos remotos:', {
      inventory: data.inventory?.length || 0,
      sales: data.sales?.length || 0,
      expenses: data.expenses?.length || 0,
      giftCards: data.giftCards?.length || 0,
      lastSync: data.lastSync
    });
    setInventory(data.inventory || []);
    setSales(data.sales || []);
    setExpenses(data.expenses || []);
    setGiftCards(data.giftCards || []);
    setClosures(data.closures || []);
    if (data.webSettings) {
      setWebSettings({
        announcementText: '20% de descuento pagando por transferencia ★',
        aboutUsText: 'El Ropero es el resultado de un compromiso profundo con la indumentaria y cada detalle. Lo que comenzó como un proyecto personal impulsado por esfuerzo y dedicación, se consolidó hoy como un espacio donde pensamos en cada mujer. Cada paso de nuestro camino está marcado por la gratitud hacia quienes nos eligen.',
        locationShowroomAddress: 'San Martín 382, Chivilcoy',
        locationShowroomMapUrl: 'https://www.google.com/maps/search/?api=1&query=San+Martin+382+Chivilcoy+Buenos+Aires',
        locationPickupAddress: 'Recoleta, CABA',
        locationPickupMapUrl: 'https://www.google.com/maps/search/?api=1&query=Recoleta+CABA',
        ...data.webSettings,
        contactWhatsapp: data.webSettings.contactWhatsapp || '5492346685836',
        categoriesOrder: data.webSettings.categoriesOrder || []
      });
    }
    setLastUpdate(data.lastSync || Date.now());
    database.updateLocalOnly(data);
  // Los setters de useState son estables, no necesitan ser dependencias
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =======================
  // GUARDAR DATA — read-before-write seguro
  // =======================
  const handleDataChange = async (
    newInv: InventoryItem[],
    newSales: Sale[],
    newExp: Expense[],
    newGift: GiftCard[] = giftCards,
    newClosures: MonthlyClosure[] = closures,
    newWebSettings: WebSettings = webSettings
  ) => {
    if (!navigator.onLine) {
      alert('❌ Error: No hay conexión a internet. No se pueden guardar los cambios.');
      throw new Error('Offline');
    }

    setIsSyncing(true);
    try {
      const confirmed = await database.persistSafe(
        { inventory: newInv, sales: newSales, expenses: newExp, giftCards: newGift, closures: newClosures, webSettings: newWebSettings },
        lastUpdate
      );

      // 1. ACTUALIZACIÓN (React State post-confirmación)
      setInventory(newInv);
      setSales(newSales);
      setExpenses(newExp);
      setGiftCards(newGift);
      setClosures(newClosures);
      setWebSettings(newWebSettings);

      setLastUpdate(confirmed.lastSync ?? Date.now());
      database.updateLocalOnly(confirmed);
      return confirmed;

    } catch (error: any) {
      console.error('❌ Error al guardar cambios en la base de datos:', error);
      alert('❌ Error general: No se pudo guardar en la base de datos. La operación fue cancelada.');
      throw error;
    } finally {
      setIsSyncing(false);
    }
  };


  // =======================
  // REPARACIÓN DE DATOS VIEJOS
  // =======================
  React.useEffect(() => {
    if (!isEntered || hasMigrated || sales.length === 0 || isSyncing) return;

    let hasChanges = false;
    const repairedSales = sales.map(sale => {
      let saleChanged = false;
      let repairedPago = sale.pago;

      // 1. REPARAR: Falta de medio de pago (default a Efectivo para historial)
      if (!repairedPago) {
        repairedPago = { efectivo: 100, tarjeta: 0 };
        saleChanged = true;
      }

      const repairedItems = (sale.items || []).map(item => {
        let itemChanged = false;
         
        const parsedPrecioTarjeta = typeof item.precioTarjeta === 'string' ? (Number(item.precioTarjeta) || 0) : item.precioTarjeta;
        if (parsedPrecioTarjeta !== item.precioTarjeta) itemChanged = true;

        const parsedPrecioEfectivo = typeof item.precioEfectivo === 'string' ? (Number(item.precioEfectivo) || 0) : item.precioEfectivo;
        if (parsedPrecioEfectivo !== item.precioEfectivo) itemChanged = true;

        const parsedCosto = typeof item.costo === 'string' ? (Number(item.costo) || 0) : item.costo;
        if (parsedCosto !== item.costo) itemChanged = true;

        const parsedDescuento = typeof item.descuento === 'string' ? (Number(item.descuento) || 0) : item.descuento;
        if (parsedDescuento !== item.descuento) itemChanged = true;

        if (itemChanged) saleChanged = true;

        return {
          ...item,
          precioTarjeta: parsedPrecioTarjeta,
          precioEfectivo: parsedPrecioEfectivo,
          costo: parsedCosto,
          descuento: parsedDescuento
        };
      });

      // 2. DETECCIÓN INTELIGENTE (Precios E vs T)
      if (repairedItems.length > 0 && sale.tipo === 'venta') {
        let teóricoTarjeta = 0;
        let teóricoEfectivo = 0;

        repairedItems.forEach(item => {
          const cant = item.cantidad || 0;
          const desc = item.descuento || 0;
          
          const pTar = item.precioTarjeta * (1 - desc / 100);
          const pEfe = item.precioEfectivo * (1 - Math.max(0, desc - 20) / 100);

          teóricoTarjeta += pTar * cant;
          teóricoEfectivo += pEfe * cant;
        });

        const diffT = Math.abs(sale.total - teóricoTarjeta);
        const diffE = Math.abs(sale.total - teóricoEfectivo);

        let nuevoPago = { ...repairedPago };
        let localChanged = false;

        // Si el precio coincide perfecto con Tarjeta y No con Efectivo (Margen de 2 por redondeos)
        if (diffT < 2 && diffE > 2 && repairedPago?.tarjeta !== 100) {
          nuevoPago = { efectivo: 0, tarjeta: 100 };
          localChanged = true;
        } 
        // Si el precio coincide perfecto con Efectivo y No con Tarjeta
        else if (diffE < 2 && diffT > 2 && repairedPago?.efectivo !== 100) {
          nuevoPago = { efectivo: 100, tarjeta: 0 };
          localChanged = true;
        }

        if (localChanged) {
          repairedPago = nuevoPago;
          saleChanged = true;
        }
      }

      if (saleChanged) {
        hasChanges = true;
        return { ...sale, pago: repairedPago, items: repairedItems };
      }
      return sale;
    });

    if (hasChanges) {
      console.log('🔧 Reparando tipos de datos en ventas...');
      setHasMigrated(true); // Bloquear futuras ejecuciones inmediatamente
      database.updatePartial({ sales: repairedSales }).catch(console.error);
    } else {
      setHasMigrated(true);
    }
  }, [sales, isEntered, hasMigrated, isSyncing, inventory, expenses, giftCards]);



  // =======================
  // CIERRES MENSUALES AUTOMÁTICOS
  // =======================
  React.useEffect(() => {
    if (!isEntered || isSyncing || sales.length === 0) return;

    const now = new Date();
    // Determinamos el mes anterior
    let prevMonth = now.getMonth(); // 0-indexed, so if now is April (3), prev is March (2)
    let prevYear = now.getFullYear();

    if (prevMonth === 0) { // Si es Enero, el anterior es Diciembre del año pasado
      prevMonth = 12;
      prevYear -= 1;
    } else {
      // Ajustar a 1-indexed para consistencia con Dashboard
      // No necesitamos sumar 1 a 'prevMonth' porque now.getMonth() ya nos da el mes anterior en formato 1-indexed relativo?
      // No: Enero=0, Feb=1, Mar=2, Abril=3.
      // Si hoy es Abril (3), el mes pasado es Marzo (2).
      // Queremos guardar Marzo como "3" (1-indexed).
      // Así que: mesPasado1Indexed = now.getMonth() (que es 3 para Abril).
      prevMonth = now.getMonth();
    }

    const closureId = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    const alreadyClosed = closures.some(c => c.id === closureId);

    if (!alreadyClosed) {
      console.log(`📋 Detectado mes finalizado: ${closureId}. Calculando cierre...`);

      // 1. Filtrar datos de ese mes
      const sMes = sales.filter(s => isMonth(s.fecha, prevMonth, prevYear));
      const gMes = expenses.filter(e => isMonth(e.fecha, prevMonth, prevYear));

      if (sMes.length === 0 && gMes.length === 0) {
        // Si no hubo actividad, creamos un cierre en cero para no volver a intentar
        const zeroClosure: MonthlyClosure = {
          id: closureId,
          month: prevMonth,
          year: prevYear,
          gananciaNeta: 0,
          cajaEfectivo: 0,
          cajaTarjeta: 0,
          gastos: 0,
          fechaCierre: new Date().toISOString()
        };
        setClosures(prev => [...prev, zeroClosure]);
        database.addClosure(zeroClosure).catch(console.error);
        return;
      }

      // 2. Calcular totales (usando la misma lógica que el Dashboard)
      const gastos = gMes.reduce((acc, e) => acc + e.monto, 0);
      
      const efVentas = sMes.reduce((acc, sale) => {
        const { efectivo } = computeSaleBreakdown(sale, sales);
        const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
        return acc + signo * efectivo;
      }, 0);
      const cajaEfectivo = efVentas - gastos;

      const cajaTarjeta = sMes.reduce((acc, sale) => {
        const { tarjeta } = computeSaleBreakdown(sale, sales);
        const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
        return acc + signo * tarjeta;
      }, 0);

      const gBruta = sMes.reduce((acc, sale) => {
        const { ganancia } = computeSaleBreakdown(sale, sales);
        const signo = (sale.tipo === 'devolucion' || sale.tipo === 'anulacion') ? -1 : 1;
        return acc + signo * ganancia;
      }, 0);
      const gananciaNeta = gBruta - gastos;

      const newClosure: MonthlyClosure = {
        id: closureId,
        month: prevMonth,
        year: prevYear,
        gananciaNeta,
        cajaEfectivo,
        cajaTarjeta,
        gastos,
        fechaCierre: new Date().toISOString()
      };

      console.log('✅ Cierre calculado con éxito:', newClosure);
      setClosures(prev => [...prev, newClosure]);
      database.addClosure(newClosure).catch(console.error);
    }
  }, [isEntered, isSyncing, sales, expenses, closures]);

  // =======================
  // FORZAR SINCRONIZACIÓN MANUAL
  // =======================
  const forceSync = React.useCallback(async () => {
    if (!navigator.onLine) {
      alert('Sin conexión a internet');
      return;
    }

    setIsSyncing(true);
    try {
      const remote = await database.fetchRemote();
      if (remote) {
        applyRemoteData(remote);
        alert('✅ Sincronización exitosa');
      } else {
        alert('⚠️ No se encontraron datos remotos para este ID');
      }
    } catch (error) {
      console.error('Error en sincronización manual:', error);
      alert('❌ Error al sincronizar: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setIsSyncing(false);
    }
  }, [applyRemoteData]);

  // =======================
  // LOGIN CON FIREBASE AUTH Y RUTA PROTEGIDA
  // =======================
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const cleanEmail = user?.email?.trim().toLowerCase();
      const is2FAVerified = sessionStorage.getItem('ropero_2fa_verified') === 'true' || 
        (cleanEmail && localStorage.getItem(`ropero_trusted_device_${cleanEmail}`) === 'true');

      if (user && is2FAVerified && !isEntered && window.location.pathname.includes('/gestion-ropero-panel')) {
        console.log('✅ Sesión activa y dispositivo verificado para:', user.email);
        const currentID = database.getShowroomID();
        try {
          const remote = await database.fetchRemote(currentID);
          if (remote) {
            applyRemoteData(remote);
            setLastUpdate(remote.lastSync || Date.now());
          }
        } catch (error) {
          console.error('Error al obtener datos remotos con sesión activa:', error);
        }
        setIsEntered(true);
      }
    });
    return () => unsubscribe();
  }, [applyRemoteData, isEntered]);

  // Solicitud inicial de usuario/contraseña -> Paso 1 de Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showroomID.trim()) return;

    // Verificar si el usuario está bloqueado por fuerza bruta (Persistente en localStorage)
    if (lockUntil && Date.now() < lockUntil) {
      const remainingSec = Math.ceil((lockUntil - Date.now()) / 1000);
      const remainingMin = Math.ceil(remainingSec / 60);
      setAuthError(`Bloqueo activo por seguridad. Reintente en ${remainingMin} minuto(s).`);
      return;
    }

    if (lockUntil && Date.now() >= lockUntil) {
      setLockUntil(null);
      setFailedAttempts(0);
      localStorage.removeItem('ropero_admin_lock_until');
      localStorage.removeItem('ropero_admin_failed_attempts');
    }

    setIsLoading(true);
    setAuthError(null);

    const cleanEmail = adminEmail.trim().toLowerCase();

    // Paso 1A: Autenticar credenciales en Firebase Auth
    try {
      if (!adminEmail.trim() || !password) {
        throw new Error('Debe proveer email y contraseña.');
      }

      await signInWithEmailAndPassword(auth, adminEmail.trim(), password);
      console.log('✅ Credenciales correctas en Firebase Auth:', adminEmail);

      // Reiniciar contador de intentos fallidos al acertar contraseña
      setFailedAttempts(0);
      setLockUntil(null);
      localStorage.removeItem('ropero_admin_failed_attempts');
      localStorage.removeItem('ropero_admin_lock_until');
    } catch (fbAuthErr: any) {
      console.warn('⚠️ Error al autenticar con Firebase Auth:', fbAuthErr?.message);
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      localStorage.setItem('ropero_admin_failed_attempts', String(newAttempts));

      if (newAttempts >= 5) {
        const lockoutTime = Date.now() + 5 * 60 * 1000; // 5 minutos
        setLockUntil(lockoutTime);
        localStorage.setItem('ropero_admin_lock_until', String(lockoutTime));
        setAuthError('Bloqueo de seguridad: 5 intentos fallidos acumulados. Reintente en 5 minutos.');
      } else {
        const attemptsLeft = 5 - newAttempts;
        setAuthError(`Credenciales o ID incorrectos. (${attemptsLeft} intento(s) restante(s))`);
      }
      setIsLoading(false);
      return;
    }

    // Paso 1B: Comprobar si el dispositivo ya es de confianza en este navegador
    const isDeviceTrusted = localStorage.getItem(`ropero_trusted_device_${cleanEmail}`) === 'true';

    if (isDeviceTrusted) {
      console.log('✅ Dispositivo conocido y verificado para:', cleanEmail, '- Omitiendo código 2FA.');
      
      const cleanID = database.setShowroomID(showroomID);
      setShowroomID(cleanID);

      try {
        const remote = await database.fetchRemote(cleanID);
        if (remote) {
          applyRemoteData(remote);
          setLastUpdate(remote.lastSync || Date.now());
        }
      } catch (error) {
        console.error('❌ Error al obtener datos remotos:', error);
        const local = database.getLocalBackup();
        setInventory(local.inventory || []);
        setSales(local.sales || []);
        setExpenses(local.expenses || []);
        setGiftCards(local.giftCards || []);
        setClosures(local.closures || []);
        setLastUpdate(local.lastSync || Date.now());
      }

      sessionStorage.setItem('ropero_2fa_verified', 'true');
      setStep2FA(false);
      setIsEntered(true);
      setIsLoading(false);
      return;
    }

    // Paso 1C: Dispositivo nuevo -> Solicitar código 2FA OTP mediante Cloud Function Callable
    setIsSendingOTP(true);
    try {
      const sendOtp = httpsCallable<{ email: string }, { success: boolean; message?: string; error?: string }>(functions, 'sendAdmin2FACode');
      const result = await sendOtp({ email: cleanEmail });
      if (!result.data?.success) {
        throw new Error(result.data?.error || 'No se pudo enviar el código de verificación 2FA por correo.');
      }

      setStep2FA(true);
      setOtpCountdown(300); // 5 minutos
      setAuthError(null);
    } catch (otpErr: any) {
      console.error('❌ Error al enviar código 2FA:', otpErr);
      setAuthError(otpErr?.message || 'Error al enviar el código de verificación 2FA. Reintentá nuevamente.');
    } finally {
      setIsLoading(false);
      setIsSendingOTP(false);
    }
  };

  // Reenviar código 2FA
  const handleResendOTP = async () => {
    if (isSendingOTP) return;
    setIsSendingOTP(true);
    setAuthError(null);
    try {
      const sendOtp = httpsCallable<{ email: string }, { success: boolean; message?: string; error?: string }>(functions, 'sendAdmin2FACode');
      const result = await sendOtp({ email: adminEmail.trim() });
      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Error al reenviar código.');
      }
      setOtpCountdown(300);
      alert('🔒 Código 2FA reenviado a tu email.');
    } catch (err: any) {
      setAuthError(err?.message || 'Error al reenviar código 2FA.');
    } finally {
      setIsSendingOTP(false);
    }
  };

  // Verificación de código 2FA -> Paso 2 de Login (Dispositivo Nuevo)
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.length !== 6) {
      setAuthError('Ingresá el código de 6 dígitos.');
      return;
    }

    setIsLoading(true);
    setAuthError(null);

    const cleanEmail = adminEmail.trim().toLowerCase();

    try {
      const verifyOtp = httpsCallable<{ email: string; code: string }, { success: boolean; verified: boolean; error?: string; message?: string }>(functions, 'verifyAdmin2FACode');
      const result = await verifyOtp({ email: cleanEmail, code: otpCode.trim() });

      if (!result.data?.verified) {
        throw new Error(result.data?.error || 'Código 2FA incorrecto o expirado.');
      }

      // Código correcto -> Guardar este dispositivo como verificado/de confianza en este navegador
      localStorage.setItem(`ropero_trusted_device_${cleanEmail}`, 'true');

      // Autenticación completa -> Aplicar ID y cargar datos del Showroom
      const cleanID = database.setShowroomID(showroomID);
      setShowroomID(cleanID);

      try {
        const remote = await database.fetchRemote(cleanID);
        if (remote) {
          applyRemoteData(remote);
          setLastUpdate(remote.lastSync || Date.now());
        }
      } catch (error) {
        console.error('❌ Error al obtener datos remotos post-2FA:', error);
        const local = database.getLocalBackup();
        setInventory(local.inventory || []);
        setSales(local.sales || []);
        setExpenses(local.expenses || []);
        setGiftCards(local.giftCards || []);
        setClosures(local.closures || []);
        setLastUpdate(local.lastSync || Date.now());
      }

      sessionStorage.setItem('ropero_2fa_verified', 'true');
      setStep2FA(false);
      setOtpCode('');
      setIsEntered(true);
    } catch (err: any) {
      setAuthError(err?.message || 'Error al verificar el código 2FA.');
    } finally {
      setIsLoading(false);
    }
  };


  // =======================
  // SINCRONIZACIÓN EN TIEMPO REAL (FIRESTORE REALTIME)
  // =======================
  React.useEffect(() => {
    setIsInitialLoading(true);
    setIsDataLoaded(false);

    // 1. Cargar respaldo local de inmediato para respuesta instantánea
    const local = database.getLocalBackup();
    if (local.inventory?.length > 0) {
      applyRemoteData(local);
    }

    // 2. Suscribirse a cambios en tiempo real en Firestore
    const unsub = database.subscribe((remoteData) => {
      applyRemoteData(remoteData);
      setIsDataLoaded(true);
      setIsInitialLoading(false);
      setIsLoading(false);
    }, showroomID);

    return () => {
      unsub();
    };
  }, [showroomID, applyRemoteData]);

  // =======================
  // INVENTORY (GRANULAR)
  // =======================
  const handleAddItem = async (item: Omit<InventoryItem, 'id'>) => {
    const newItem: InventoryItem = {
      ...item,
      id: `inv_${Date.now()}`,
      visible: false, // Oculto por defecto hasta ser gestionado en WebManager
      imagenes: (item as any).imagenes || [],
      talles: (item as any).talles || [],
      colores: (item as any).colores || [],
      medidas: (item as any).medidas || '',
      categoria: (item as any).categoria || ''
    };
  
    try {
      await database.addInventoryItem(newItem);
    } catch (error) {
      console.error('❌ Error al agregar producto:', error);
      alert('❌ Error: No se pudo agregar el producto. Verificá tu conexión a internet.');
      throw error;
    }
  };

  const handleUpdateItem = async (updatedItem: InventoryItem) => {
    try {
      await database.updateInventoryItem(updatedItem);
    } catch (error) {
      console.error('❌ Error al actualizar producto:', error);
      alert('❌ Error: No se pudo actualizar el producto.');
      throw error;
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await database.deleteInventoryItem(id);
    } catch (error) {
      console.error('❌ Error al eliminar producto:', error);
      alert('❌ Error: No se pudo eliminar el producto.');
      throw error;
    }
  };

  // =======================
  // SALES + GIFTCARD
  // =======================
  const handleAddSale = async (saleData: Omit<Sale, 'id'>) => {
    let nextGiftCards = [...giftCards];
  
    if (saleData.giftCardUsada) {
      nextGiftCards = giftCards.map(gc => {
        if (gc.codigo === saleData.giftCardUsada!.codigo) {
          const nuevoSaldo = gc.saldo - saleData.giftCardUsada!.montoUsado;
          return {
            ...gc,
            saldo: nuevoSaldo,
            estado: nuevoSaldo <= 0 ? 'AGOTADA' : 'ACTIVA'
          };
        }
        return gc;
      });
    }
  
    // =======================
    // VALIDACIONES DE CAMBIO
    // =======================
    if (saleData.tipo === 'cambio') {
      if (!saleData.itemsDevueltos?.length) {
        const msg = 'Un cambio o devolución debe tener al menos una prenda devuelta';
        alert(msg);
        throw new Error(msg);
      }
      // Allow partial returns without new items or gift card if there is no monetary difference
      if (!saleData.itemsNuevos?.length && (saleData.diferencia ?? 0) > 0 && !saleData.giftGeneradaId) {
        const msg = 'Un cambio debe incluir prendas nuevas o generar una Gift Card a favor del cliente';
        alert(msg);
        throw new Error(msg);
      }
    }

    // La diferencia correcta viene calculada desde Sales.tsx con la lógica de medios de pago
    const diferencia = saleData.tipo === 'cambio' ? (saleData.diferencia ?? 0) : 0;

    if (saleData.tipo === 'cambio' && diferencia > 0 && !saleData.pago) {
      const msg = 'Debe especificarse el método de pago cuando hay diferencia a favor';
      alert(msg);
      throw new Error(msg);
    }

    // Validar stock de las prendas nuevas (si las hay)
    if (saleData.tipo === 'cambio' && saleData.itemsNuevos && saleData.itemsNuevos.length > 0) {
      for (const itemNuevo of saleData.itemsNuevos) {
        const invItem = inventory.find(i => i.id === itemNuevo.id);
        if (!invItem) {
          const msg = 'Producto no encontrado en stock';
          alert(msg);
          throw new Error(msg);
        }
        if (invItem.cantidad < itemNuevo.cantidad) {
          const msg = `Stock insuficiente para ${itemNuevo.descripcion}`;
          alert(msg);
          throw new Error(msg);
        }
      }
    }

    if (saleData.tipo === 'cambio' && saleData.ventaOriginalId) {
      const ventaOriginal = sales.find(s => s.id === saleData.ventaOriginalId);
      if (!ventaOriginal) {
        const msg = 'Venta original no encontrada';
        alert(msg);
        throw new Error(msg);
      }

      const diasTranscurridos = Math.floor(
        (Date.now() - new Date(ventaOriginal.fecha).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diasTranscurridos > 15) {
        const msg = 'Ya han pasado 15 días desde la compra.';
        alert(msg);
        throw new Error(msg);
      }

      // Validar que cada prenda devuelta pertenezca a la venta original
      const itemsOriginales = ventaOriginal.items ?? [];
      for (const devuelto of (saleData.itemsDevueltos || [])) {
        const enOriginal = itemsOriginales.find(i => i.id === devuelto.id && i.talle === devuelto.talle && i.color === devuelto.color);
        if (!enOriginal) {
          const msg = `La prenda "${devuelto.descripcion}" no pertenece a la venta original seleccionada.\nSolo podés devolver prendas que fueron compradas en esa venta.`;
          alert(msg);
          throw new Error(msg);
        }
        if (devuelto.cantidad > enOriginal.cantidad) {
          const msg = `La cantidad devuelta de "${devuelto.descripcion}" (${devuelto.cantidad}) no puede superar la cantidad comprada originalmente (${enOriginal.cantidad}).`;
          alert(msg);
          throw new Error(msg);
        }

        // --- MEJORA #3: Verificar unidades ya devueltas en cambios anteriores ---
        const yaDevueltaEn = sales
          .filter(s => s.tipo === 'cambio' && s.ventaOriginalId === saleData.ventaOriginalId)
          .reduce((sum, s) => {
            const prev = (s.itemsDevueltos ?? []).find(i => i.id === devuelto.id && i.talle === devuelto.talle && i.color === devuelto.color);
            return sum + (prev?.cantidad ?? 0);
          }, 0);

        const disponibleDevolver = enOriginal.cantidad - yaDevueltaEn;
        if (devuelto.cantidad > disponibleDevolver) {
          const msg = `La prenda "${devuelto.descripcion}" tiene ${disponibleDevolver} unidad(es) disponibles para devolver (ya se devolvieron ${yaDevueltaEn} en cambios anteriores).`;
          alert(msg);
          throw new Error(msg);
        }
      }
    }

    // =======================
    // GIFT CARD AUTOMÁTICA (diferencia negativa = a favor del cliente)
    // =======================
    let giftGenerada: GiftCard | undefined;
    if (saleData.tipo === 'cambio' && (saleData.diferencia ?? 0) < 0) {
        const codigoGift = `GIFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        const ventaOrig = sales.find(s => s.id === saleData.ventaOriginalId);
        let medioPagoOrigen: 'efectivo' | 'tarjeta' | 'mixto' = 'efectivo';
        if (ventaOrig?.pago) {
          if (ventaOrig.pago.tarjeta === 100) medioPagoOrigen = 'tarjeta';
          else if (ventaOrig.pago.efectivo === 100) medioPagoOrigen = 'efectivo';
          else medioPagoOrigen = 'mixto';
        } else if (ventaOrig?.metodoPago) {
          const mp = String(ventaOrig.metodoPago).toLowerCase();
          if (mp.includes('tarjeta') || mp.includes('crédito') || mp.includes('debito')) {
            medioPagoOrigen = 'tarjeta';
          }
        }

        // El monto a favor de la Gift Card es el valor neto de la diferencia negativa
        const montoGift = Math.abs(saleData.diferencia ?? 0);

        giftGenerada = {
          id: saleData.giftGeneradaId || `gift_${Date.now()}`,
          codigo: codigoGift,
          destinatario: saleData.giftDestinatario?.trim() || 'Cambio automático',
          montoInicial: montoGift,
          saldo: montoGift,
          estado: 'ACTIVA',
          fechaCreacion: new Date().toISOString(),
          medioPagoOrigen,
          ventaOrigenId: saleData.ventaOriginalId,
        };
      }

    // Los emails se enviarán después de persistir correctamente
    const saleId = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newSale: Sale = {
      ...saleData,
      id: saleId,
      ...(giftGenerada?.id ? { giftGeneradaId: giftGenerada.id } : {})
    };

    try {
      setIsSyncing(true);
      await database.recordSale(newSale, {
        newGiftCard: giftGenerada
      });
      
      // Enviar emails SOLO si se guardó exitosamente
      if (giftGenerada && saleData.giftEmail && saleData.giftEmail.trim() !== '') {
        sendGiftCardEmail(
          saleData.giftEmail.trim(),
          giftGenerada.destinatario,
          saleData.giftDeParteDe || 'Administración',
          giftGenerada.montoInicial,
          giftGenerada.codigo,
          saleData.giftMensaje || ''
        ).catch(err => console.error("Error sending auto-generated gift card email:", err));
      }

      if (newSale.tipo === 'venta') {
        sendSaleConfirmationEmail(newSale, 'Showroom / Local', undefined, 'local');
      } else if (newSale.tipo !== 'gift') {
        sendNotificationEmail(
          newSale.tipo === 'cambio' ? 'Nuevo Cambio en Local' : 'Nueva Venta en Local',
          `Se ha registrado un(a) ${newSale.tipo} en el local.\nID: ${newSale.id}\nTotal: $${newSale.total}\n${newSale.tipo === 'cambio' ? `Diferencia: $${newSale.diferencia || 0}` : ''}`
        );
      }
    } catch (err) {
      console.error("Venta cancelada o fallida, no se enviaron correos.", err);
      alert('❌ Error al registrar la venta en la base de datos. La operación fue cancelada.');
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  // =======================
  // ✏️ UPDATE SALE PAGO/MEDIO
  // =======================
  const handleUpdateSalePago = (saleId: string, pago: { efectivo: number; tarjeta: number }) => {
    database.updateSalePago(saleId, pago).catch(err => {
      console.error('❌ Error al actualizar medio de pago:', err);
      alert('❌ Error al actualizar el medio de pago.');
    });
  };

  // =======================
  // 🗑️ DELETE SALE (REVERSA CONTABLE COMPLETA)
  // =======================
  const handleDeleteSale = async (saleId: string) => {
    try {
      await database.deleteSale(saleId);
    } catch (error) {
      console.error('❌ Error al sincronizar la eliminación de venta:', error);
      alert('❌ Error al eliminar la venta.');
    }
  };

  // =======================
  // EXPENSES (GRANULAR)
  // =======================
  const handleAddExpense = async (expenseData: Omit<Expense, 'id'>) => {
    const newExp = { ...expenseData, id: `exp_${Date.now()}` };
    try {
      await database.addExpense(newExp);
    } catch (err) {
      console.error('❌ Error al registrar egreso:', err);
      alert('❌ Error al registrar egreso.');
      throw err;
    }
  };

  const handleUpdateExpense = async (updatedExpense: Expense) => {
    try {
      await database.updateExpense(updatedExpense);
    } catch (err) {
      console.error('❌ Error al actualizar egreso:', err);
      alert('❌ Error al actualizar egreso.');
      throw err;
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await database.deleteExpense(id);
    } catch (err) {
      console.error('❌ Error al eliminar egreso:', err);
      alert('❌ Error al eliminar egreso.');
      throw err;
    }
  };

 // =======================
// GIFT CARDS
// =======================
const generateUniqueGiftCardCode = (existing: GiftCard[]): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const existingCodes = new Set(existing.map(gc => gc.codigo.toUpperCase()));
  let attempts = 0;
  while (attempts < 1000) {
    let randomPart = '';
    for (let i = 0; i < 5; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const fullCode = `GIFT-${randomPart}`;
    if (!existingCodes.has(fullCode)) {
      return fullCode;
    }
    attempts++;
  }
  return `GIFT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
};

const handleAddGiftCard = async (data: { destinatario: string; montoInicial: number; codigo?: string; pago?: { efectivo: number; tarjeta: number }; email?: string; mensaje?: string; deParteDe?: string; emailComprador?: string }) => {
  // 1. Crear el objeto de la Gift Card
  const nuevoCodigo = data.codigo || generateUniqueGiftCardCode(giftCards);
  const newGift: GiftCard = {
    id: `gift_${Date.now()}`,
    codigo: nuevoCodigo,
    destinatario: data.destinatario,
    montoInicial: data.montoInicial,
    saldo: data.montoInicial,
    estado: 'ACTIVA',
    fechaCreacion: new Date().toISOString(),
  };

  // Los emails se enviarán luego de persistir

  const pagoData = data.pago || { efectivo: 100, tarjeta: 0 };
  const portionEfectivo = pagoData.efectivo / 100;
  const portionTarjeta = pagoData.tarjeta / 100;
  const rawTarjeta = (data.montoInicial * portionTarjeta) / (1 - DESCUENTO_BASE_TRANSFERENCIA / 100);
  const rawEfectivo = data.montoInicial * portionEfectivo;
  const finalTotal = Math.round(rawEfectivo + rawTarjeta);

  // 2. Crear la Venta para que aparezca en CAJA y GANANCIAS
  const newSale: Sale = {
    id: `sale_gift_${Date.now()}`,
    tipo: 'gift',
    fecha: new Date().toISOString(),
    total: finalTotal,
    // Se usa el mix de pago especificado o efectivo por defecto
    pago: pagoData,
    items: [{
      id: nuevoCodigo,
      sku: nuevoCodigo,
      descripcion: `Gift Card: ${data.destinatario}`,
      cantidad: 1,
      costo: 0,
      precioEfectivo: data.montoInicial,
      precioTarjeta: Math.round(data.montoInicial / (1 - DESCUENTO_BASE_TRANSFERENCIA / 100)),
      descuento: 0
    }],
  };

  // 3. GUARDAR TODO JUNTO (Si no se hace así, una lista pisa a la otra)
  try {
    await database.addGiftCard(newGift, newSale);

    // 4. Enviar email al destinatario
    if (data.email && data.email.trim() !== '') {
      sendGiftCardEmail(
        data.email.trim(),
        data.destinatario,
        data.deParteDe || 'Administración',
        data.montoInicial,
        nuevoCodigo,
        data.mensaje || ''
      ).catch(err => console.error("Error sending gift card email:", err));
    }

    // 5. Enviar email al comprador si lo dejó asentado
    if (data.emailComprador && data.emailComprador.trim() !== '') {
      sendSaleConfirmationEmail(
        newSale as any,
        data.deParteDe || 'Cliente',
        data.emailComprador.trim(),
        'local'
      ).catch(err => console.error("Error sending gift card purchase receipt:", err));
    }
  } catch (err) {
    console.error("Compra de Gift Card fallida, no se enviaron correos.", err);
    alert('❌ Error al registrar la Gift Card.');
    throw err;
  }
};

const handleUpdateGiftCard = (updated: GiftCard) => {
  const matchingSale = sales.find(s => s.items?.some(item => item.sku === updated.codigo));
  let updatedSale: Sale | undefined = undefined;
  if (matchingSale) {
    const pagoData = (matchingSale.pago && (matchingSale.pago.efectivo + matchingSale.pago.tarjeta === 100)) ? matchingSale.pago : { efectivo: 100, tarjeta: 0 };
    const portionEfectivo = pagoData.efectivo / 100;
    const portionTarjeta = pagoData.tarjeta / 100;
    const rawTarjeta = (updated.montoInicial * portionTarjeta) / (1 - DESCUENTO_BASE_TRANSFERENCIA / 100);
    const rawEfectivo = updated.montoInicial * portionEfectivo;
    const finalTotal = Math.round(rawEfectivo + rawTarjeta);

    updatedSale = {
      ...matchingSale,
      total: finalTotal,
      pago: pagoData,
      items: (matchingSale.items ?? []).map(item =>
        item.sku === updated.codigo
          ? { ...item, precioEfectivo: updated.montoInicial, precioTarjeta: Math.round(updated.montoInicial / (1 - DESCUENTO_BASE_TRANSFERENCIA / 100)), descripcion: `Gift Card: ${updated.destinatario}` }
          : item
      )
    };
  }

  database.updateGiftCard(updated, updatedSale).catch(err => {
    console.error('❌ Error al actualizar Gift Card:', err);
    alert('❌ Error al actualizar la Gift Card.');
  });
};

const handleCancelGiftCard = (id: string) => {
  const gift = giftCards.find(g => g.id === id);
  if (!gift) return;

  database.cancelGiftCard(id, gift.codigo).catch(err => {
    console.error('❌ Error al cancelar Gift Card:', err);
    alert('❌ Error al cancelar la Gift Card.');
  });
};

  // =======================
  // APP
  // =======================
  if (isInitialLoading) {
    return (
      <InnovativeLoader 
        storeName={webSettings.storeName || 'EL ROPERO'} 
        isDataLoaded={isDataLoaded} 
        onComplete={() => setIsInitialLoading(false)} 
      />
    );
  }

  return (
    <AuthProvider>
      <ModalProvider>
        <Router>
          <NetworkStatus />

          {/* Banner Flotante de Advertencia por Inactividad */}
          {showInactivityWarning && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-black text-white px-6 py-3.5 rounded-full shadow-2xl flex items-center gap-4 text-[11px] tracking-[1px] uppercase border border-white/20 animate-in fade-in duration-300">
              <Clock size={16} className="text-amber-400 animate-pulse" />
              <span>Tu sesión expirará en menos de 60 segundos por inactividad.</span>
              <button
                onClick={() => setShowInactivityWarning(false)}
                className="bg-white text-black hover:bg-neutral-200 px-4 py-1.5 rounded-full text-[9px] font-bold tracking-[2px] transition-all"
              >
                Mantener Activa
              </button>
            </div>
          )}

          <Routes>
            <Route path="/" element={<StorefrontPage inventoryProp={inventory} settingsProp={webSettings} />} />
            <Route path="/checkout/transferencia-exitosa" element={<TransferSuccessPage webSettings={webSettings} />} />
            <Route path="/reset-password" element={<ResetPasswordPage webSettings={webSettings} />} />

            {/* Redireccionar la ruta obsoleta /admin al inicio para evitar escaneo automatizado */}
            <Route path="/admin" element={<Navigate to="/" replace />} />

            {/* Ruta Oculta y Protegida del Panel de Administración */}
            <Route path="/gestion-ropero-panel" element={
              !isEntered ? (
                <div className="min-h-screen w-full flex items-center justify-center bg-white p-6 selection:bg-black selection:text-white font-['Inter'] overflow-y-auto py-12">
                  <div className="max-w-[400px] w-full my-auto space-y-12 sm:space-y-16 animate-in fade-in duration-700">
                    <div className="text-center space-y-2 w-full px-2">
                      <p className="text-[10px] tracking-[6px] uppercase opacity-40 font-light">Acceso Reservado</p>
                      <h1 className="text-[clamp(15px,4.5vw,24px)] tracking-[clamp(4px,2.5vw,18px)] uppercase font-medium leading-none text-black whitespace-nowrap overflow-hidden text-ellipsis">
                        {webSettings.storeName || 'EL ROPERO'}
                      </h1>
                    </div>

                    {!step2FA ? (
                      /* PASO 1: Email + Identificador de Showroom + Contraseña */
                      <form onSubmit={handleLogin} className="space-y-8">
                        <div className="space-y-6">
                          <div className="relative group">
                            <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                              Email de Administrador
                            </label>
                            <input
                              type="email"
                              value={adminEmail}
                              onChange={(e) => { setAdminEmail(e.target.value); setAuthError(null); }}
                              className="w-full bg-transparent border-b border-black/10 py-3 text-[13px] focus:outline-none focus:border-black tracking-[1px] font-light text-black placeholder:text-black/10 transition-all"
                              placeholder="admin@elropero.ar"
                              required
                            />
                          </div>

                          <div className="relative group">
                            <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                              Identificador de Showroom
                            </label>
                            <input
                              type="text"
                              value={showroomID}
                              onChange={(e) => setShowroomID(e.target.value.toUpperCase())}
                              className="w-full bg-transparent border-b border-black/10 py-3 text-[13px] focus:outline-none focus:border-black tracking-[3px] font-light uppercase text-black placeholder:text-black/10 transition-all"
                              placeholder="SHOWROOM-ID"
                              required
                            />
                          </div>

                          <div className="relative group">
                            <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                              Contraseña
                            </label>
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
                              className={`w-full bg-transparent border-b py-3 text-[13px] focus:outline-none tracking-[6px] transition-all ${
                                authError 
                                  ? 'border-red-400 text-red-600 focus:border-red-500' 
                                  : 'border-black/10 text-black focus:border-black'
                              }`}
                              placeholder="••••••••"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-4 pt-2">
                          <button
                            type="submit"
                            className="w-full bg-black text-white py-5 text-[11px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-all flex items-center justify-center gap-4 disabled:opacity-30"
                            disabled={isLoading || (lockUntil !== null && Date.now() < lockUntil)}
                          >
                            {isLoading ? <Loader2 className="animate-spin" size={14} strokeWidth={1.5} /> : "Iniciar Sesión"}
                          </button>

                          {authError && (
                            <p className="text-[10px] text-red-600 text-center uppercase tracking-[2px] font-medium leading-relaxed">
                              {authError}
                            </p>
                          )}
                        </div>
                      </form>
                    ) : (
                      /* PASO 2: Verificación de 2 Factores (Código OTP enviado por Email para Dispositivo Nuevo) */
                      <form onSubmit={handleVerifyOTP} className="space-y-8 animate-in fade-in duration-500">
                        <div className="text-center space-y-3">
                          <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-2 text-black">
                            <ShieldCheck size={24} strokeWidth={1.5} />
                          </div>
                          <h2 className="text-[11px] tracking-[4px] uppercase font-semibold text-black">Dispositivo Nuevo Detectado</h2>
                          <p className="text-[11px] text-black/60 font-light leading-relaxed">
                            Por seguridad, enviamos un código de 6 dígitos a tu correo para autorizar este navegador:<br/>
                            <span className="font-medium text-black">{adminEmail}</span>
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div className="relative group text-center">
                            <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-3">
                              Código de Verificación (6 dígitos)
                            </label>
                            <input
                              type="text"
                              maxLength={6}
                              value={otpCode}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                setOtpCode(val);
                                setAuthError(null);
                              }}
                              className={`w-full bg-transparent border-b text-center text-[22px] font-mono tracking-[12px] py-3 focus:outline-none transition-all ${
                                authError 
                                  ? 'border-red-400 text-red-600 focus:border-red-500' 
                                  : 'border-black/20 text-black focus:border-black'
                              }`}
                              placeholder="••••••"
                              autoFocus
                              required
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-black/50 tracking-[1px] font-light pt-2">
                            <span>Expiración: <strong className="text-black font-mono">{Math.floor(otpCountdown / 60)}:{String(otpCountdown % 60).padStart(2, '0')}</strong></span>
                            <button
                              type="button"
                              onClick={handleResendOTP}
                              disabled={isSendingOTP || otpCountdown > 240}
                              className="underline hover:text-black transition-colors disabled:opacity-40"
                            >
                              {isSendingOTP ? 'Enviando...' : 'Reenviar código'}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4 pt-2">
                          <button
                            type="submit"
                            className="w-full bg-black text-white py-5 text-[11px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-all flex items-center justify-center gap-4 disabled:opacity-30"
                            disabled={isLoading || otpCode.length !== 6}
                          >
                            {isLoading ? <Loader2 className="animate-spin" size={14} strokeWidth={1.5} /> : "Verificar e Ingresar"}
                          </button>

                          <button
                            type="button"
                            onClick={() => { setStep2FA(false); setOtpCode(''); setAuthError(null); }}
                            className="w-full text-black/40 hover:text-black text-[10px] tracking-[2px] uppercase font-light transition-colors py-1"
                          >
                            ← Volver al paso anterior
                          </button>

                          {authError && (
                            <p className="text-[10px] text-red-600 text-center uppercase tracking-[2px] font-medium leading-relaxed">
                              {authError}
                            </p>
                          )}
                        </div>
                      </form>
                    )}

                    <div className="pt-10 border-t border-black/5 flex flex-col items-center gap-6">
                      <div className="flex items-center gap-10 opacity-20">
                        <Monitor size={20} strokeWidth={1} />
                        <div className="w-10 h-[1px] bg-black/20" />
                        <Smartphone size={20} strokeWidth={1} />
                      </div>
                      <p className="text-[9px] uppercase tracking-[3px] font-light text-black/40 leading-relaxed text-center max-w-[280px]">
                        Sincronización en tiempo real activa entre dispositivos mediante ID.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <Layout 
                  currentSection={section} 
                  setSection={setSection} 
                  onLogout={async () => {
                    sessionStorage.removeItem('ropero_2fa_verified');
                    try {
                      await signOut(auth);
                    } catch (err) {
                      console.error('Error al cerrar sesión de Firebase Auth:', err);
                    }
                    setIsEntered(false);
                    setStep2FA(false);
                  }} 
                  isSyncing={isSyncing}
                  onForceSync={forceSync}
                  webSettings={webSettings}
                  selectedCategory={selectedCategory}
                  setSelectedCategory={setSelectedCategory}
                >
                  {section === 'admin' && (
                    <Dashboard 
                      inventory={inventory} 
                      sales={sales} 
                      expenses={expenses} 
                      giftCards={giftCards}
                      closures={closures}
                      webSettings={webSettings}
                      selectedCategory={selectedCategory}
                      onSelectCategory={(cat) => setSelectedCategory(cat)}
                      onUpdateItem={handleUpdateItem} 
                      onDeleteItem={handleDeleteItem} 
                      onNavigateToWebManager={handleNavigateToWebManager}
                    />
                  )}
                  {section === 'ventas' && <Sales inventory={inventory} onAddSale={handleAddSale} recentSales={sales} onDeleteSale={handleDeleteSale} onUpdateSalePago={handleUpdateSalePago} giftCards={giftCards} isSyncing={isSyncing} />}
                  {section === 'stock' && <Stock onAddItem={handleAddItem} inventory={inventory} webSettings={webSettings} />}
                  {section === 'gastos' && <Expenses expenses={expenses} onAddExpense={handleAddExpense} onUpdateExpense={handleUpdateExpense} onDeleteExpense={handleDeleteExpense} />}
                  {section === 'giftcards' && (
                    <GiftCards
                      giftCards={giftCards}
                      onAddGiftCard={handleAddGiftCard}
                      onUpdateGiftCard={handleUpdateGiftCard}
                      onCancelGiftCard={handleCancelGiftCard}
                    />
                  )}
                  {section === 'sitio' && (
                    <WebManager 
                      inventory={inventory} 
                      webSettings={webSettings}
                      selectedCategory={selectedCategory}
                      onSelectCategory={(cat) => setSelectedCategory(cat)}
                      onUpdateInventory={(next) => database.updateInventory(next)}
                      onUpdateSettings={(next) => database.updateWebSettings(next)}
                      initialEditingItemId={webManagerEditItemId}
                      onClearEditItem={() => setWebManagerEditItemId(null)}
                    />
                  )}
                  {section === 'pedidos' && (
                    <WebOrdersManager onOrderFulfilled={forceSync} />
                  )}
                </Layout>
              )
            } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      </ModalProvider>
    </AuthProvider>
  );
};

export default App;
