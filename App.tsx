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
import { Store, Lock, Loader2, Monitor, ArrowRightLeft, Smartphone, Globe } from 'lucide-react';
import GiftCards from './components/GiftCard';
import WebManager from './components/WebManager';
import StorefrontPage from './components/StorefrontPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import WebOrdersManager from './components/WebOrdersManager';
import InnovativeLoader from './components/InnovativeLoader';
import { computeSaleBreakdown, isMonth } from './services/finance';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import NetworkStatus from './components/NetworkStatus';
import { ModalProvider } from './contexts/ModalContext';
import { auth } from './services/firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';


// Sistema seguro de autenticación activado
const App: React.FC = () => {
  const [isEntered, setIsEntered] = React.useState(false);
  const [adminEmail, setAdminEmail] = React.useState("yazminetchanchu@gmail.com");
  const [password, setPassword] = React.useState("");
  const [showroomID, setShowroomID] = React.useState(() => database.getShowroomID() || 'EL-ROPERO-DEFAULT');
  const [authError, setAuthError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [section, setSection] = React.useState<Section>('admin');

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

    } catch (error: any) {
      if (error?.type === 'CONFLICT') {
        console.warn('⚠️ Conflicto detectado: el servidor tiene datos más nuevos. Sincronizando...');
        const serverState = error.serverState;
        applyRemoteData(serverState);
        alert(
          '⚠️ Datos actualizados desde otro dispositivo.\n' +
          'Se sincronizó tu dispositivo. Por favor, verificá los últimos cambios y reintentá tu última acción si no aparece.'
        );
      } else {
        console.error('❌ Error al guardar cambios:', error);
        alert('❌ Error general: No se pudo guardar en la base de datos. La operación fue cancelada.');
      }
      throw error; // Lanza el error para evitar continuar
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
      handleDataChange(inventory, repairedSales, expenses, giftCards).catch(console.error);
    } else {
      setHasMigrated(true);
    }
  }, [sales, isEntered, hasMigrated, isSyncing, inventory, expenses, giftCards]);

  // =======================
  // POLLING DE SINCRONIZACIÓN
  // =======================
  React.useEffect(() => {
    if (!isEntered) return;

    const interval = setInterval(async () => {
      if (!navigator.onLine || isSyncing) return;

      try {
        const remote = await database.fetchRemote();
        if (remote) {
          const local = database.getLocalBackup();
          // Comparar timestamps para ver si hay datos más recientes
          const remoteTime = remote.lastSync || 0;
          const localTime = local.lastSync || 0;
          
          if (remoteTime > localTime) {
            console.log('🔄 Datos remotos más recientes detectados, sincronizando...');
            applyRemoteData(remote);
          }
        }
      } catch (error) {
        console.error('Error en sincronización automática:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isEntered, isSyncing, applyRemoteData]);

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
        handleDataChange(inventory, sales, expenses, giftCards, [...closures, zeroClosure]);
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
      handleDataChange(inventory, sales, expenses, giftCards, [...closures, newClosure]);
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
  // LOGIN CON FIREBASE AUTH
  // =======================
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !isEntered && window.location.pathname.includes('/admin')) {
        console.log('✅ Sesión activa detectada en Firebase Auth para:', user.email);
        const currentID = database.getShowroomID() || 'EL-ROPERO-DEFAULT';
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showroomID.trim()) return;

    setIsLoading(true);
    setAuthError(false);

    try {
      if (!adminEmail.trim() || !password) {
        throw new Error('Debe proveer email y contraseña.');
      }
      
      try {
        await signInWithEmailAndPassword(auth, adminEmail.trim(), password);
        console.log('✅ Autenticado exitosamente con Firebase Auth:', adminEmail);
      } catch (fbAuthErr: any) {
        console.warn('⚠️ Error al autenticar con Firebase Auth:', fbAuthErr?.message);
        throw fbAuthErr;
      }

      const cleanID = database.setShowroomID(showroomID);
      setShowroomID(cleanID);

      try {
        console.log('🔍 Buscando datos remotos para ID:', cleanID);
        const remote = await database.fetchRemote(cleanID);

        if (remote) {
          console.log('✅ Datos remotos encontrados, aplicando...');
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
        alert('Error al conectar con Firebase. Se cargaron datos locales. Verifica tu conexión.');
      }

      setIsEntered(true);
    } catch (error) {
      console.error('❌ Error al iniciar sesión en el panel de administración:', error);
      setAuthError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // =======================
  // INITIAL FETCH (PUBLIC)
  // =======================
  React.useEffect(() => {
    const initFetch = async () => {
      setIsInitialLoading(true);
      try {
        const id = database.getShowroomID() || 'EL-ROPERO-DEFAULT';
        const remote = await database.fetchRemote(id);
        if (remote) {
          applyRemoteData(remote);
        } else {
          const local = database.getLocalBackup();
          if (local.inventory?.length > 0) applyRemoteData(local);
        }
      } catch (e) {
        console.error("Initial fetch error:", e);
      } finally {
        setIsInitialLoading(false);
        setIsLoading(false);
      }
    };
    initFetch();
  }, [applyRemoteData]);

  // =======================
  // INVENTORY
  // =======================
  const handleAddItem = (item: Omit<InventoryItem, 'id'>) => {
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
  
    const next = [...inventory, newItem];
    handleDataChange(next, sales, expenses, giftCards).catch(console.error);
  };

  const handleUpdateItem = (updatedItem: InventoryItem) => {
    const next = inventory.map(item => item.id === updatedItem.id ? updatedItem : item);
    handleDataChange(next, sales, expenses, giftCards).catch(console.error);
  };

  const handleDeleteItem = (id: string) => {
    const next = inventory.filter(item => item.id !== id);
    handleDataChange(next, sales, expenses, giftCards).catch(console.error);
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
      if (!saleData.itemsDevueltos?.length || !saleData.itemsNuevos?.length) {
        alert('Un cambio debe tener prendas devueltas y prendas nuevas');
        return;
      }
    }

    // La diferencia correcta viene calculada desde Sales.tsx con la lógica de medios de pago
    const diferencia = saleData.tipo === 'cambio' ? (saleData.diferencia ?? 0) : 0;

    if (saleData.tipo === 'cambio' && diferencia > 0 && !saleData.pago) {
      alert('Debe especificarse el método de pago cuando hay diferencia a favor');
      return;
    }

    // Validar stock de las prendas nuevas
    if (saleData.tipo === 'cambio') {
      for (const itemNuevo of saleData.itemsNuevos!) {
        const invItem = inventory.find(i => i.id === itemNuevo.id);
        if (!invItem) {
          alert('Producto no encontrado en stock');
          return;
        }
        if (invItem.cantidad < itemNuevo.cantidad) {
          alert(`Stock insuficiente para ${itemNuevo.descripcion}`);
          return;
        }
      }
    }

    if (saleData.tipo === 'cambio' && saleData.ventaOriginalId) {
      const ventaOriginal = sales.find(s => s.id === saleData.ventaOriginalId);
      if (!ventaOriginal) {
        alert('Venta original no encontrada');
        return;
      }

      const diasTranscurridos = Math.floor(
        (Date.now() - new Date(ventaOriginal.fecha).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diasTranscurridos > 15) {
        alert('Ya han pasado 15 días desde la compra.');
        return;
      }

      // Validar que cada prenda devuelta pertenezca a la venta original
      const itemsOriginales = ventaOriginal.items ?? [];
      for (const devuelto of saleData.itemsDevueltos!) {
        const enOriginal = itemsOriginales.find(i => i.id === devuelto.id);
        if (!enOriginal) {
          alert(
            `La prenda "${devuelto.descripcion}" no pertenece a la venta original seleccionada.\n` +
            `Solo podés devolver prendas que fueron compradas en esa venta.`
          );
          return;
        }
        if (devuelto.cantidad > enOriginal.cantidad) {
          alert(
            `La cantidad devuelta de "${devuelto.descripcion}" (${devuelto.cantidad}) ` +
            `no puede superar la cantidad comprada originalmente (${enOriginal.cantidad}).`
          );
          return;
        }

        // --- MEJORA #3: Verificar unidades ya devueltas en cambios anteriores ---
        const yaDevueltaEn = sales
          .filter(s => s.tipo === 'cambio' && s.ventaOriginalId === saleData.ventaOriginalId)
          .reduce((sum, s) => {
            const prev = (s.itemsDevueltos ?? []).find(i => i.id === devuelto.id);
            return sum + (prev?.cantidad ?? 0);
          }, 0);

        const disponibleDevolver = enOriginal.cantidad - yaDevueltaEn;
        if (devuelto.cantidad > disponibleDevolver) {
          alert(
            `La prenda "${devuelto.descripcion}" tiene ${disponibleDevolver} unidad(es) disponibles para devolver ` +
            `(ya se devolvieron ${yaDevueltaEn} en cambios anteriores).`
          );
          return;
        }
      }
    }

    // =======================
    // GIFT CARD AUTOMÁTICA (diferencia negativa = a favor del cliente)
    // =======================
    let giftGenerada: GiftCard | undefined;

    // Los emails se enviarán después de persistir correctamente
  
    const nextInv = inventory.map(item => {

      // =======================
      // CAMBIO → NO USA items
      // =======================
      if (saleData.tipo === 'cambio') {
        const devuelto = saleData.itemsDevueltos?.find(i => i.id === item.id);
        const nuevo = saleData.itemsNuevos?.find(i => i.id === item.id);
    
        let cantidad = item.cantidad;
        let updatedVariants = item.stockPorVariante ? { ...item.stockPorVariante } : undefined;
    
        if (devuelto) {
          cantidad += devuelto.cantidad;
          if (updatedVariants && devuelto.talle && devuelto.color) {
            const key = `${devuelto.talle}-${devuelto.color}`;
            updatedVariants[key] = (updatedVariants[key] || 0) + devuelto.cantidad;
          }
        }
        if (nuevo) {
          cantidad -= nuevo.cantidad;
          if (updatedVariants && nuevo.talle && nuevo.color) {
            const key = `${nuevo.talle}-${nuevo.color}`;
            updatedVariants[key] = Math.max(0, (updatedVariants[key] || 0) - nuevo.cantidad);
          }
        }
    
        return {
          ...item,
          cantidad: Math.max(0, cantidad),
          ...(updatedVariants !== undefined ? { stockPorVariante: updatedVariants } : {}),
        };
      }
    
      // =======================
      // VENTA / DEVOLUCIÓN
      // =======================
      const sold = saleData.items?.find(si => si.id === item.id);
      
      if (!sold) return item;

      let updatedVariants = item.stockPorVariante ? { ...item.stockPorVariante } : undefined;
      if (updatedVariants && sold.talle && sold.color) {
        const key = `${sold.talle}-${sold.color}`;
        updatedVariants[key] = Math.max(0, (updatedVariants[key] || 0) - sold.cantidad);
      }

      return {
        ...item,
        cantidad: Math.max(0, item.cantidad - sold.cantidad),
        ...(updatedVariants !== undefined ? { stockPorVariante: updatedVariants } : {}),
      };
    });
    
    const nextSales = [...sales, saleData];
    const finalGiftCards = giftGenerada ? [...nextGiftCards, giftGenerada] : nextGiftCards;

    try {
      await handleDataChange(nextInv, nextSales, expenses, finalGiftCards);
      
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

      if (saleData.tipo === 'venta') {
        sendSaleConfirmationEmail(saleData, 'Showroom / Local', undefined, 'local');
      } else if (saleData.tipo !== 'gift') {
        sendNotificationEmail(
          saleData.tipo === 'cambio' ? 'Nuevo Cambio en Local' : 'Nueva Venta en Local',
          `Se ha registrado un(a) ${saleData.tipo} en el local.\nID: ${saleData.id}\nTotal: $${saleData.total}\n${saleData.tipo === 'cambio' ? `Diferencia: $${saleData.diferencia || 0}` : ''}`
        );
      }
    } catch (err) {
      console.error("Venta cancelada o fallida, no se enviaron correos.");
    }
  };

  // =======================
  // ✏️ UPDATE SALE PAGO/MEDIO
  // =======================
  const handleUpdateSalePago = (saleId: string, pago: { efectivo: number; tarjeta: number }) => {
    const next = sales.map(s => s.id === saleId ? { ...s, pago } : s);
    handleDataChange(inventory, next, expenses, giftCards).catch(console.error);
  };

  // =======================
  // 🗑️ DELETE SALE (REVERSA CONTABLE COMPLETA)
  // =======================
const handleDeleteSale = (saleId: string) => {
  setSales(prevSales => {
    const sale = prevSales.find(s => s.id === saleId);
    if (!sale) return prevSales;
    
    // 1. Devolver stock
    let nextInv = [...inventory];

    if (sale.tipo === 'cambio') {
      // Para cambios: devolver items nuevos y quitar items devueltos
      if (sale.itemsNuevos) {
        sale.itemsNuevos.forEach(itemNuevo => {
          const idx = nextInv.findIndex(i => i.id === itemNuevo.id);
          if (idx !== -1) {
            let uv = nextInv[idx].stockPorVariante ? { ...nextInv[idx].stockPorVariante } : undefined;
            if (uv && itemNuevo.talle && itemNuevo.color) {
              const key = `${itemNuevo.talle}-${itemNuevo.color}`;
              uv[key] = (uv[key] || 0) + itemNuevo.cantidad;
            }
            nextInv[idx] = {
              ...nextInv[idx],
              cantidad: nextInv[idx].cantidad + itemNuevo.cantidad,
              ...(uv !== undefined ? { stockPorVariante: uv } : {}),
            };
          }
        });
      }
      if (sale.itemsDevueltos) {
        sale.itemsDevueltos.forEach(itemDevuelto => {
          const idx = nextInv.findIndex(i => i.id === itemDevuelto.id);
          if (idx !== -1) {
            let uv = nextInv[idx].stockPorVariante ? { ...nextInv[idx].stockPorVariante } : undefined;
            if (uv && itemDevuelto.talle && itemDevuelto.color) {
              const key = `${itemDevuelto.talle}-${itemDevuelto.color}`;
              uv[key] = Math.max(0, (uv[key] || 0) - itemDevuelto.cantidad);
            }
            nextInv[idx] = {
              ...nextInv[idx],
              cantidad: Math.max(0, nextInv[idx].cantidad - itemDevuelto.cantidad),
              ...(uv !== undefined ? { stockPorVariante: uv } : {}),
            };
          }
        });
      }
    } else {
      // Para ventas normales: devolver todos los items
      if (sale.items) {
        sale.items.forEach(si => {
          const idx = nextInv.findIndex(i => i.id === si.id);
          if (idx !== -1) {
            let uv = nextInv[idx].stockPorVariante ? { ...nextInv[idx].stockPorVariante } : undefined;
            if (uv && si.talle && si.color) {
              const key = `${si.talle}-${si.color}`;
              uv[key] = (uv[key] || 0) + si.cantidad;
            }
            nextInv[idx] = {
              ...nextInv[idx],
              cantidad: nextInv[idx].cantidad + si.cantidad,
              ...(uv !== undefined ? { stockPorVariante: uv } : {}),
            };
          }
        });
      }
    }

    // 2. Devolver saldo a gift si hubo
    let nextGiftCards = [...giftCards];
    if (sale.giftCardUsada) {
      nextGiftCards = giftCards.map(gc => {
        if (gc.codigo === sale.giftCardUsada!.codigo) {
          return {
            ...gc,
            saldo: gc.saldo + sale.giftCardUsada!.montoUsado,
            estado: 'ACTIVA' as const
          };
        }
        return gc;
      });
    }

    // 3. Si fue una venta de gift card, eliminar la gift card del array
    if (sale.tipo === 'gift') {
      const giftSku = sale.items?.[0]?.sku;
      if (giftSku) {
        nextGiftCards = nextGiftCards.filter(gc => gc.codigo !== giftSku);
      }
    }

    // 4. Si se generó una gift card en este cambio, eliminarla
    // 4. Eliminar la venta
    const nextSales = prevSales.filter(s => s.id !== saleId);

    // 5. Guardar todo
    handleDataChange(nextInv, nextSales, expenses, nextGiftCards).catch(console.error);
    return nextSales;
  });
};

  // =======================
  // EXPENSES
  // =======================
  const handleAddExpense = (expenseData: Omit<Expense, 'id'>) => {
    const newExp = { ...expenseData, id: `exp_${Date.now()}` };
    handleDataChange(inventory, sales, [...expenses, newExp], giftCards).catch(console.error);
  };

  const handleUpdateExpense = (updatedExpense: Expense) => {
    const nextExp = expenses.map(e => e.id === updatedExpense.id ? updatedExpense : e);
    handleDataChange(inventory, sales, nextExp, giftCards).catch(console.error);
  };

  const handleDeleteExpense = (id: string) => {
    const nextExp = expenses.filter(e => e.id !== id);
    handleDataChange(inventory, sales, nextExp, giftCards).catch(console.error);
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
    await handleDataChange(
      inventory,
      [...sales, newSale], // Añadimos la venta a la caja
      expenses,
      [...giftCards, newGift] // Añadimos la gift al listado
    );

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
    console.error("Compra de Gift Card fallida, no se enviaron correos.");
  }
};

const handleUpdateGiftCard = (updated: GiftCard) => {
  // 1. Actualizar la tarjeta
  const nextGift = giftCards.map(gc => (gc.id === updated.id ? updated : gc));

  // 2. Sincronizar con la venta existente para que la ganancia en Dashboard cambie
  const nextSales = sales.map(s => {
    const esVentaDeEstaGift = s.items?.some(item => item.sku === updated.codigo);
    if (esVentaDeEstaGift) {
      const pagoData = (s.pago && (s.pago.efectivo + s.pago.tarjeta === 100)) ? s.pago : { efectivo: 100, tarjeta: 0 };
      const portionEfectivo = pagoData.efectivo / 100;
      const portionTarjeta = pagoData.tarjeta / 100;
      const rawTarjeta = (updated.montoInicial * portionTarjeta) / (1 - DESCUENTO_BASE_TRANSFERENCIA / 100);
      const rawEfectivo = updated.montoInicial * portionEfectivo;
      const finalTotal = Math.round(rawEfectivo + rawTarjeta);

      return {
        ...s,
        total: finalTotal,
        pago: pagoData, // Conservar el método de pago original o resetear si está corrupto
        items: (s.items ?? []).map(item =>
          item.sku === updated.codigo
            ? { ...item, precioEfectivo: updated.montoInicial, precioTarjeta: Math.round(updated.montoInicial / (1 - DESCUENTO_BASE_TRANSFERENCIA / 100)), descripcion: `Gift Card: ${updated.destinatario}` }
            : item
        )
      };
    }
    return s;
  });

  handleDataChange(inventory, nextSales, expenses, nextGift).catch(console.error);
};

const handleCancelGiftCard = (id: string) => {
  const gift = giftCards.find(g => g.id === id);
  if (!gift) return;

  // BUSCA EN EL HISTORIAL LA VENTA QUE TIENE EL SKU DE LA GIFT
  const nextSales = sales.filter(s => {
    // Si alguno de los items de la venta tiene el código de la gift como SKU, se elimina
    const esVentaDeEstaGift = s.items?.some(item => item.sku === gift.codigo);
    return !esVentaDeEstaGift; 
  });

  const nextGift = giftCards.filter(gc => gc.id !== id);

  // Al guardar, la venta desaparece de Caja, Ventas y Ganancias
  handleDataChange(inventory, nextSales, expenses, nextGift).catch(console.error);
};

  // =======================
  // APP
  // =======================
  if (isInitialLoading) {
    return <InnovativeLoader storeName={webSettings.storeName || 'EL ROPERO'} />;
  }

  return (
    <AuthProvider>
      <ModalProvider>
        <Router>
          <NetworkStatus />
          <Routes>
            <Route path="/" element={<StorefrontPage inventoryProp={inventory} settingsProp={webSettings} />} />
            <Route path="/reset-password" element={<ResetPasswordPage webSettings={webSettings} />} />

          
          <Route path="/admin" element={
            !isEntered ? (
              <div className="min-h-screen w-full flex items-center justify-center bg-white p-6 selection:bg-black selection:text-white font-['Inter'] overflow-y-auto py-12">
                <div className="max-w-[400px] w-full my-auto space-y-12 sm:space-y-16 animate-in fade-in duration-700">
                  <div className="text-center space-y-2 w-full px-2">
                    <p className="text-[10px] tracking-[6px] uppercase opacity-40 font-light">Acceso Reservado</p>
                    <h1 className="text-[clamp(15px,4.5vw,24px)] tracking-[clamp(4px,2.5vw,18px)] uppercase font-medium leading-none text-black whitespace-nowrap overflow-hidden text-ellipsis">
                      {webSettings.storeName || 'EL ROPERO'}
                    </h1>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-10">
                    <div className="space-y-10">
                      <div className="relative group">
                        <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                          Identificador
                        </label>
                        <input
                          type="text"
                          value={showroomID}
                          onChange={(e) => setShowroomID(e.target.value.toUpperCase())}
                          className="w-full bg-transparent border-b border-black/10 py-3 text-[13px] focus:outline-none focus:border-black tracking-[3px] font-light uppercase text-black placeholder:text-black/10 transition-all"
                          placeholder="SHOWROOM-ID"
                        />
                      </div>

                      <div className="relative group">
                        <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                          Correo de Administrador
                        </label>
                        <input
                          type="email"
                          value={adminEmail}
                          onChange={(e) => { setAdminEmail(e.target.value); setAuthError(false); }}
                          className="w-full bg-transparent border-b border-black/10 py-3 text-[13px] focus:outline-none focus:border-black tracking-[1px] font-light text-black placeholder:text-black/10 transition-all"
                          placeholder="admin@elropero.com"
                        />
                      </div>

                      <div className="relative group">
                        <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                          Contraseña
                        </label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setAuthError(false); }}
                          className={`w-full bg-transparent border-b py-3 text-[13px] focus:outline-none tracking-[6px] transition-all ${
                            authError 
                              ? 'border-red-400 text-red-600 focus:border-red-500' 
                              : 'border-black/10 text-black focus:border-black'
                          }`}
                          placeholder="••••••••"
                        />
                      </div>
                    </div>

                    <div className="space-y-4 pt-4">
                      <button
                        type="submit"
                        className="w-full bg-black text-white py-5 text-[11px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-all flex items-center justify-center gap-4 disabled:opacity-30"
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="animate-spin" size={14} strokeWidth={1.5} /> : "Ingresar"}
                      </button>

                      {authError && (
                        <p className="text-[9px] text-red-600 text-center uppercase tracking-[3px] font-medium animate-pulse">
                          Credenciales incorrectas
                        </p>
                      )}
                    </div>
                  </form>

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
                  try {
                    await signOut(auth);
                  } catch (err) {
                    console.error('Error al cerrar sesión de Firebase Auth:', err);
                  }
                  setIsEntered(false);
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
                    onUpdateInventory={(next) => handleDataChange(next, sales, expenses, giftCards)}
                    onUpdateSettings={(next) => handleDataChange(inventory, sales, expenses, giftCards, closures, next)}
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
