import React from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Sales from './components/Sales';
import Stock from './components/Stock';
import Expenses from './components/Expenses';
import { InventoryItem, Sale, Expense, Section, GiftCard, MonthlyClosure } from './types';
import { database, DatabaseState } from './services/storage';
import { Store, Lock, Loader2, Monitor, ArrowRightLeft, Smartphone } from 'lucide-react';
import GiftCards from './components/GiftCard';
import { computeSaleBreakdown, isMonth } from './services/finance';

const SYSTEM_PASSWORD = "Danisa0302";

const App: React.FC = () => {
  const [isEntered, setIsEntered] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [showroomID, setShowroomID] = React.useState(() => database.getShowroomID());
  const [authError, setAuthError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [section, setSection] = React.useState<Section>('admin');

  const [inventory, setInventory] = React.useState<InventoryItem[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [giftCards, setGiftCards] = React.useState<GiftCard[]>([]);
  const [closures, setClosures] = React.useState<MonthlyClosure[]>([]);

  const [isSyncing, setIsSyncing] = React.useState(false);
  const [lastUpdate, setLastUpdate] = React.useState<number>(0);
  const [hasMigrated, setHasMigrated] = React.useState(false);

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
    newClosures: MonthlyClosure[] = closures
  ) => {
    // 1. ACTUALIZACIÓN OPTIMISTA (React State primero)
    setInventory(newInv);
    setSales(newSales);
    setExpenses(newExp);
    setGiftCards(newGift);
    setClosures(newClosures);

    setIsSyncing(true);
    try {
      const confirmed = await database.persistSafe(
        { inventory: newInv, sales: newSales, expenses: newExp, giftCards: newGift, closures: newClosures },
        lastUpdate  // timestamp del estado que el cliente cree tener
      );

      // 2. SINCRONIZACIÓN DE TIMESTAMPS (Post-confirmación)
      setLastUpdate(confirmed.lastSync ?? Date.now());
      
      // Actualizar backup local inmediatamente
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
      } else if (!navigator.onLine) {
        // Offline: ya actualizamos la UI, solo asegurar el backup
        const payload = { 
          inventory: newInv, 
          sales: newSales, 
          expenses: newExp, 
          giftCards: newGift, 
          closures: newClosures,
          lastSync: Date.now() 
        };
        database.updateLocalOnly(payload);
        setLastUpdate(payload.lastSync);
      } else {
        console.error('❌ Error al guardar cambios:', error);
        alert('❌ Error al guardar en la nube. Los cambios se mantienen localmente pero verificá tu conexión.');
      }

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
  // LOGIN
  // =======================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showroomID.trim()) return;

    setIsLoading(true);

    if (password === SYSTEM_PASSWORD) {
      const cleanID = database.setShowroomID(showroomID);
      setShowroomID(cleanID);

      try {
        console.log('🔍 Buscando datos remotos para ID:', cleanID);
        const remote = await database.fetchRemote(cleanID);

        if (remote) {
          console.log('✅ Datos remotos encontrados, aplicando...');
          applyRemoteData(remote);
        } else {
          console.log('⚠️ No se encontraron datos remotos, cargando locales...');
          const local = database.getLocalBackup();
          console.log('📦 Datos locales:', {
            inventory: local.inventory?.length || 0,
            sales: local.sales?.length || 0,
            expenses: local.expenses?.length || 0,
            giftCards: local.giftCards?.length || 0,
            lastSync: local.lastSync
          });
          setInventory(local.inventory || []);
          setSales(local.sales || []);
          setExpenses(local.expenses || []);
          setGiftCards(local.giftCards || []);
          setClosures(local.closures || []);
          setLastUpdate(local.lastSync || Date.now()); // Evita que el polling sobreescriba inmediatamente
        }
      } catch (error) {
        console.error('❌ Error al obtener datos remotos:', error);
        // En caso de error, cargar datos locales como fallback
        const local = database.getLocalBackup();
        setInventory(local.inventory || []);
        setSales(local.sales || []);
        setExpenses(local.expenses || []);
        setGiftCards(local.giftCards || []);
        setClosures(local.closures || []);
        setLastUpdate(local.lastSync || Date.now()); // Evita que el polling sobreescriba inmediatamente
        alert('Error al conectar con Firebase. Se cargaron datos locales. Verifica tu conexión.');
      }

      setIsEntered(true);
      setAuthError(false);
    } else {
      setAuthError(true);
    }

    setIsLoading(false);
  };

  // =======================
  // INVENTORY
  // =======================
  const handleAddItem = (item: Omit<InventoryItem, 'id'>) => {
    const newItem: InventoryItem = {
      ...item,
      id: `inv_${Date.now()}`
    };
  
    setInventory(prev => {
      const next = [...prev, newItem];
      handleDataChange(next, sales, expenses, giftCards);
      return next;
    });
  };

  const handleUpdateItem = (updatedItem: InventoryItem) => {
    setInventory(prev => {
      const next = prev.map(item => item.id === updatedItem.id ? updatedItem : item);
      handleDataChange(next, sales, expenses, giftCards);
      return next;
    });
  };

  const handleDeleteItem = (id: string) => {
    setInventory(prev => {
      const next = prev.filter(item => item.id !== id);
      handleDataChange(next, sales, expenses, giftCards);
      return next;
    });
  };

  // =======================
  // SALES + GIFTCARD
  // =======================
  const handleAddSale = (saleData: Omit<Sale, 'id'>) => {
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

    if (saleData.tipo === 'cambio' && diferencia < 0) {
      const montoGift = Math.abs(diferencia);
      const giftId = saleData.giftGeneradaId || `gift_${Date.now()}`;
      const destinatario = saleData.giftDestinatario?.trim() || 'Cambio automático';

      giftGenerada = {
        id: giftId,
        codigo: `GIFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        destinatario,
        montoInicial: montoGift,
        saldo: montoGift,
        estado: 'ACTIVA',
        fechaCreacion: new Date().toISOString()
      };
    }

    // =======================
    // CONSTRUIR VENTA — usar valores de Sales.tsx tal cual
    // =======================
    const newSale: Sale = {
      ...saleData,
      id: `sale_${Date.now()}`,
      // Guardar el ID de la gift card generada si existe
      giftGeneradaId: giftGenerada?.id
    };
  
    const nextInv = inventory.map(item => {

      // =======================
      // CAMBIO → NO USA items
      // =======================
      if (saleData.tipo === 'cambio') {
        const devuelto = saleData.itemsDevueltos?.find(i => i.id === item.id);
        const nuevo = saleData.itemsNuevos?.find(i => i.id === item.id);
    
        let cantidad = item.cantidad;
    
        if (devuelto) cantidad += devuelto.cantidad;
        if (nuevo) cantidad -= nuevo.cantidad;
    
        return {
          ...item,
          cantidad: Math.max(0, cantidad)
        };
      }
    
      // =======================
      // VENTA / DEVOLUCIÓN
      // =======================
      const sold = saleData.items?.find(si => si.id === item.id);
      
      if (!sold) return item;
      return {
        ...item,
        cantidad: Math.max(0, item.cantidad - sold.cantidad)
      };      
    });
    
    const nextSales = [...sales, newSale];
    const finalGiftCards = giftGenerada ? [...nextGiftCards, giftGenerada] : nextGiftCards;

    handleDataChange(nextInv, nextSales, expenses, finalGiftCards);
  };

  // =======================
  // ✏️ UPDATE SALE PAGO/MEDIO
  // =======================
  const handleUpdateSalePago = (saleId: string, pago: { efectivo: number; tarjeta: number }) => {
    setSales(prev => {
      const next = prev.map(s => s.id === saleId ? { ...s, pago } : s);
      handleDataChange(inventory, next, expenses, giftCards);
      return next;
    });
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
            nextInv[idx] = {
              ...nextInv[idx],
              cantidad: nextInv[idx].cantidad + itemNuevo.cantidad
            };
          }
        });
      }
      if (sale.itemsDevueltos) {
        sale.itemsDevueltos.forEach(itemDevuelto => {
          const idx = nextInv.findIndex(i => i.id === itemDevuelto.id);
          if (idx !== -1) {
            nextInv[idx] = {
              ...nextInv[idx],
              cantidad: Math.max(0, nextInv[idx].cantidad - itemDevuelto.cantidad)
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
            nextInv[idx] = {
              ...nextInv[idx],
              cantidad: nextInv[idx].cantidad + si.cantidad
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
    if (sale.giftGeneradaId) {
      nextGiftCards = nextGiftCards.filter(gc => gc.id !== sale.giftGeneradaId);
    }

    // 4. Eliminar la venta
    const nextSales = prevSales.filter(s => s.id !== saleId);

    // 5. Guardar todo
    handleDataChange(nextInv, nextSales, expenses, nextGiftCards);
    return nextSales;
  });
};

  // =======================
  // EXPENSES
  // =======================
  const handleAddExpense = (expenseData: Omit<Expense, 'id'>) => {
    const newExp = { ...expenseData, id: `exp_${Date.now()}` };
    handleDataChange(inventory, sales, [...expenses, newExp], giftCards);
  };

  const handleUpdateExpense = (updated: Expense) => {
    const nextExp = expenses.map(e => e.id === updated.id ? updated : e);
    handleDataChange(inventory, sales, nextExp, giftCards);
  };

  const handleDeleteExpense = (id: string) => {
    const nextExp = expenses.filter(e => e.id !== id);
    handleDataChange(inventory, sales, nextExp, giftCards);
  };

 // =======================
// GIFT CARDS
// =======================
const handleAddGiftCard = (data: { destinatario: string; montoInicial: number; codigo?: string; pago?: { efectivo: number; tarjeta: number } }) => {
  // 1. Crear el objeto de la Gift Card
  const nuevoCodigo = data.codigo || `GIFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const newGift: GiftCard = {
    id: `gift_${Date.now()}`,
    codigo: nuevoCodigo,
    destinatario: data.destinatario,
    montoInicial: data.montoInicial,
    saldo: data.montoInicial,
    estado: 'ACTIVA',
    fechaCreacion: new Date().toISOString(),
  };

  // 2. Crear la Venta para que aparezca en CAJA y GANANCIAS
  const newSale: Sale = {
    id: `sale_gift_${Date.now()}`,
    tipo: 'gift',
    fecha: new Date().toISOString(),
    total: data.montoInicial,
    // Se usa el mix de pago especificado o efectivo por defecto
    pago: data.pago || { efectivo: 100, tarjeta: 0 },
    items: [{
      id: nuevoCodigo,
      sku: nuevoCodigo,
      descripcion: `Gift Card: ${data.destinatario}`,
      cantidad: 1,
      costo: 0,
      precioEfectivo: data.montoInicial,
      precioTarjeta: data.montoInicial,
      descuento: 0
    }],
  };

  // 3. GUARDAR TODO JUNTO (Si no se hace así, una lista pisa a la otra)
  handleDataChange(
    inventory,
    [...sales, newSale], // Añadimos la venta a la caja
    expenses,
    [...giftCards, newGift] // Añadimos la gift al listado
  );
};

const handleUpdateGiftCard = (updated: GiftCard) => {
  // 1. Actualizar la tarjeta
  const nextGift = giftCards.map(gc => (gc.id === updated.id ? updated : gc));

  // 2. Sincronizar con la venta existente para que la ganancia en Dashboard cambie
  const nextSales = sales.map(s => {
    const esVentaDeEstaGift = s.items?.some(item => item.sku === updated.codigo);
    if (esVentaDeEstaGift) {
      return {
        ...s,
        total: updated.montoInicial,
        pago: { efectivo: updated.montoInicial, tarjeta: 0 }, // Actualiza el ingreso en caja
        items: (s.items ?? []).map(item =>
          item.sku === updated.codigo
            ? { ...item, precioEfectivo: updated.montoInicial, precioTarjeta: updated.montoInicial, descripcion: `Gift Card: ${updated.destinatario}` }
            : item
        )
      };
    }
    return s;
  });

  handleDataChange(inventory, nextSales, expenses, nextGift);
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
  handleDataChange(inventory, nextSales, expenses, nextGift);
};

  // =======================
  // LOGIN UI
  // =======================
  if (!isEntered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F1EB] p-6">
        <div className="max-w-md w-full space-y-12 animate-in fade-in zoom-in duration-500">

          <h1 className="font-serif text-5xl md:text-6xl tracking-[18px] uppercase text-[#1A1A1A] italic text-center">
            EL ROPERO
          </h1>

          <form onSubmit={handleLogin} className="bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-2xl p-10 space-y-8 shadow-xl">
            <div className="space-y-6 text-left">

              <div>
                <label className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[2px] text-[#1A1A1A]">
                  <Store size={12} /> ID
                </label>
                <input
                  type="text"
                  value={showroomID}
                  onChange={(e) => setShowroomID(e.target.value.toUpperCase())}
                  className="w-full bg-transparent border-b-2 border-[#C9B8A8]/40 py-3 text-sm focus:outline-none focus:border-[#C9B8A8] tracking-[2px] font-medium uppercase text-[#1A1A1A] placeholder:text-gray-500 transition-colors"
                  placeholder="SHOWROOM-ID"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[2px] text-[#1A1A1A]">
                  <Lock size={12} /> Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setAuthError(false); }}
                  className={`w-full bg-transparent border-b-2 py-3 text-sm focus:outline-none tracking-[4px] transition-colors ${
                    authError 
                      ? 'border-red-400 text-red-600 focus:border-red-500' 
                      : 'border-[#C9B8A8]/40 text-[#1A1A1A] focus:border-[#C9B8A8]'
                  }`}
                />
              </div>

            </div>

            <button
              type="submit"
              className="w-full bg-[#C9B8A8] text-[#1A1A1A] py-6 text-[11px] tracking-[4px] uppercase font-medium hover:bg-[#B8A696] transition-all flex items-center justify-center gap-4 rounded-lg shadow-md hover:shadow-lg disabled:opacity-60"
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : "INGRESAR"}
            </button>

            {authError && (
              <p className="text-[10px] text-red-600 text-center uppercase tracking-widest font-semibold">
                Contraseña incorrecta
              </p>
            )}
          </form>

          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-8">
              <Monitor size={28} className="text-black/40" />
              <ArrowRightLeft size={18} className="animate-pulse text-black/40" />
              <Smartphone size={28} className="text-black/40" />
            </div>
            <p className="text-[9px] uppercase tracking-[4px] font-medium text-black/60 max-w-[320px]">
              Usa el mismo ID en tu celular y computadora para que la información se sincronice.
            </p>
          </div>

        </div>
      </div>
    );
  }

  // =======================
  // APP
  // =======================
  return (
    <Layout 
      currentSection={section} 
      setSection={setSection} 
      onLogout={() => setIsEntered(false)} 
      isSyncing={isSyncing}
      onForceSync={forceSync}
    >
      {section === 'admin' && (
        <Dashboard 
          inventory={inventory} 
          sales={sales} 
          expenses={expenses} 
          giftCards={giftCards}
          closures={closures}
          onUpdateItem={handleUpdateItem} 
          onDeleteItem={handleDeleteItem} 
        />
      )}
      {section === 'ventas' && <Sales inventory={inventory} onAddSale={handleAddSale} recentSales={sales} onDeleteSale={handleDeleteSale} onUpdateSalePago={handleUpdateSalePago} giftCards={giftCards} isSyncing={isSyncing} />}
      {section === 'stock' && <Stock onAddItem={handleAddItem} inventory={inventory} />}
      {section === 'gastos' && <Expenses expenses={expenses} onAddExpense={handleAddExpense} onUpdateExpense={handleUpdateExpense} onDeleteExpense={handleDeleteExpense} />}
      {section === 'giftcards' && (
        <GiftCards
          giftCards={giftCards}
          onAddGiftCard={handleAddGiftCard}
          onUpdateGiftCard={handleUpdateGiftCard}
          onCancelGiftCard={handleCancelGiftCard}
        />
      )}
</Layout> 
  );
};

export default App;
