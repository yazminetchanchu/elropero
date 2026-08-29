import { InventoryItem, Sale, Expense, GiftCard, MonthlyClosure, WebSettings } from '../types';
import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, runTransaction, updateDoc, arrayUnion, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { deductSaleFromInventory, restoreSaleToInventory } from './webOrderFulfillment';

export interface DatabaseState {
  inventory?: InventoryItem[];
  sales?: Sale[];
  expenses?: Expense[];
  giftCards?: GiftCard[];
  closures?: MonthlyClosure[];
  webSettings?: WebSettings;
  lastSync?: number;
}

// Cambiar keys fuerza "reset" local (evita cache viejo)
const LOCAL_KEY = "ropero_local_backup_v3_2026";
const SHOWROOM_KEY = "ropero_showroom_id_v3_2026";

// =======================
// SHOWROOM ID
// =======================
export const getShowroomID = () => {
  let id = localStorage.getItem(SHOWROOM_KEY);
  if (!id) {
    id = import.meta.env.DEV ? 'EL-ROPERO-TEST' : 'ROPERO';
    localStorage.setItem(SHOWROOM_KEY, id);
  }
  return id;
};

const setShowroomID = (id: string) => {
  const clean = id.trim().toUpperCase();
  localStorage.setItem(SHOWROOM_KEY, clean);
  return clean;
};

// =======================
// LOCAL STORAGE
// =======================
const getLocalBackup = (): DatabaseState => {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) {
    return {
      inventory: [],
      sales: [],
      expenses: [],
      giftCards: [],
      closures: [],
      lastSync: Date.now()
    };
  }
  return JSON.parse(raw);
};

const updateLocalOnly = (data: DatabaseState) => {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
};

// =======================
// FIREBASE (ONE-SHOT)
// =======================
const fetchRemote = async (overrideID?: string): Promise<DatabaseState | null> => {
  const id = overrideID || getShowroomID();
  const ref = doc(db, "showrooms", id);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as DatabaseState;
  return null;
};

// =======================
// FIREBASE (REALTIME)
// =======================
const subscribe = (onData: (data: DatabaseState) => void, overrideID?: string) => {
  const id = overrideID || getShowroomID();
  const ref = doc(db, "showrooms", id);

  return onSnapshot(
    ref,
    async (snap) => {
      if (snap.exists()) {
        const data = snap.data() as DatabaseState;
        if (!data.giftCards) data.giftCards = [];
        if (!data.closures) data.closures = [];
        updateLocalOnly(data);
        onData(data);
        return;
      }
      const empty: DatabaseState = {
        inventory: [],
        sales: [],
        expenses: [],
        giftCards: [],
        closures: [],
        webSettings: {
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
        },
        lastSync: Date.now()
      };

      try {
        await setDoc(ref, empty);
        updateLocalOnly(empty);
        onData(empty);
      } catch (err) {
        console.warn("No se pudo inicializar documento vacío en Firestore:", err);
      }
    },
    (error) => {
      console.error("Error en la suscripción en tiempo real de Firestore:", error);
    }
  );
};

// =======================
// OPERACIONES GRANULARES Y TRANSACCIONALES (BUG 5)
// =======================

// Elimina campos "undefined" que Firebase no acepta
const sanitize = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

/**
 * Agrega un nuevo ítem al inventario sin alterar otras entidades.
 */
const addInventoryItem = async (item: InventoryItem): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanItem = sanitize(item);
  const now = Date.now();
  await updateDoc(ref, {
    inventory: arrayUnion(cleanItem),
    lastSync: now
  });
};

/**
 * Modifica un ítem de inventario leyendo la versión fresca del servidor dentro de una transacción.
 * No pisa el stock de otros productos que pudieron haber sido vendidos en la web.
 */
const updateInventoryItem = async (updatedItem: InventoryItem): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanItem = sanitize(updatedItem);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Showroom no encontrado.");
    const data = snap.data() as DatabaseState;
    const currentInv = data.inventory || [];
    const newInv = currentInv.map(item => item.id === cleanItem.id ? cleanItem : item);
    transaction.update(ref, {
      inventory: newInv,
      lastSync: now
    });
  });
};

/**
 * Elimina un ítem del inventario directamente en el servidor.
 * Al eliminarse en la base de datos, nunca más resucita.
 */
const deleteInventoryItem = async (itemId: string): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Showroom no encontrado.");
    const data = snap.data() as DatabaseState;
    const currentInv = data.inventory || [];
    const newInv = currentInv.filter(item => item.id !== itemId);
    transaction.update(ref, {
      inventory: newInv,
      lastSync: now
    });
  });
};

/**
 * Actualiza el array completo de inventario (por ejemplo para reordenamiento de catálogo en WebManager).
 */
const updateInventory = async (newInventory: InventoryItem[]): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanInv = sanitize(newInventory);
  const now = Date.now();
  await updateDoc(ref, {
    inventory: cleanInv,
    lastSync: now
  });
};

/**
 * Registra una venta o cambio físico en una transacción atómica:
 * 1. Lee el inventario fresco del servidor.
 * 2. Descuenta/devuelve prendas sobre ese inventario fresco (soporta tanto venta regular como cambio).
 * 3. Agrega la venta a la lista de ventas.
 * 4. Actualiza Gift Cards si fueron utilizadas o generadas.
 * 5. NO toca gastos, cierres mensuales ni configuraciones web.
 */
const recordSale = async (
  sale: Sale,
  options?: {
    newGiftCard?: GiftCard;
    updatedGiftCards?: GiftCard[];
  }
): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanSale: Sale = sanitize(sale);
  const saleDocRef = doc(db, "showrooms", id, "sales", cleanSale.id);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Showroom no encontrado.");
    const data = snap.data() as DatabaseState;

    // 1. Descontar stock sobre el inventario fresco del servidor
    const currentInventory = data.inventory || [];
    const updatedInventory = deductSaleFromInventory(currentInventory, cleanSale);

    // 2. Persistir venta en subcolección individual
    transaction.set(saleDocRef, cleanSale);

    // 3. Mantener buffer recortado a las últimas 50 ventas en el documento del showroom (evita límite 1MB)
    const currentSales = data.sales || [];
    const updatedSales = [...currentSales, cleanSale].slice(-50);

    // 4. Gestionar Gift Cards si aplica
    let updatedGiftCards = [...(data.giftCards || [])];
    if (options?.updatedGiftCards) {
      updatedGiftCards = sanitize(options.updatedGiftCards);
    } else {
      if (cleanSale.giftCardUsada) {
        updatedGiftCards = updatedGiftCards.map(gc => {
          if (gc.codigo === cleanSale.giftCardUsada!.codigo) {
            const nuevoSaldo = gc.saldo - cleanSale.giftCardUsada!.montoUsado;
            return {
              ...gc,
              saldo: nuevoSaldo,
              estado: nuevoSaldo <= 0 ? 'AGOTADA' : 'ACTIVA'
            };
          }
          return gc;
        });
      }
      if (options?.newGiftCard) {
        updatedGiftCards.push(sanitize(options.newGiftCard));
      }
    }

    transaction.update(ref, {
      inventory: updatedInventory,
      sales: updatedSales,
      giftCards: updatedGiftCards,
      lastSync: now
    });
  });
};

/**
 * Elimina una venta revirtiendo stock y saldos de gift cards de forma atómica.
 */
const deleteSale = async (saleId: string): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const saleDocRef = doc(db, "showrooms", id, "sales", saleId);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Showroom no encontrado.");
    const data = snap.data() as DatabaseState;

    const currentSales = data.sales || [];
    let sale = currentSales.find(s => s.id === saleId);

    // Si la venta ya no está en el buffer de 50 del doc showroom, leerla de la subcolección
    const saleDocSnap = await transaction.get(saleDocRef);
    if (!sale && saleDocSnap.exists()) {
      sale = saleDocSnap.data() as Sale;
    }
    if (!sale) return;

    // 1. Restaurar stock al inventario fresco del servidor
    const currentInventory = data.inventory || [];
    const updatedInventory = restoreSaleToInventory(currentInventory, sale);

    // 2. Revertir Gift Cards si aplica
    let updatedGiftCards = [...(data.giftCards || [])];
    if (sale.giftCardUsada) {
      updatedGiftCards = updatedGiftCards.map(gc => {
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
    if (sale.tipo === 'gift') {
      const giftSku = sale.items?.[0]?.sku;
      if (giftSku) {
        updatedGiftCards = updatedGiftCards.filter(gc => gc.codigo !== giftSku);
      }
    }
    if (sale.giftGeneradaId) {
      updatedGiftCards = updatedGiftCards.filter(gc => gc.id !== sale.giftGeneradaId);
    }

    // 3. Eliminar de la subcolección y del buffer de ventas del showroom
    if (saleDocSnap.exists()) {
      transaction.delete(saleDocRef);
    }
    const updatedSales = currentSales.filter(s => s.id !== saleId);

    transaction.update(ref, {
      inventory: updatedInventory,
      sales: updatedSales,
      giftCards: updatedGiftCards,
      lastSync: now
    });
  });
};

/**
 * Actualiza el medio de pago de una venta específica en subcolección y buffer de showroom.
 */
const updateSalePago = async (saleId: string, pago: { efectivo: number; tarjeta: number }): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const saleDocRef = doc(db, "showrooms", id, "sales", saleId);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Showroom no encontrado.");
    const data = snap.data() as DatabaseState;

    // Actualizar en subcolección si existe
    const saleDocSnap = await transaction.get(saleDocRef);
    if (saleDocSnap.exists()) {
      transaction.update(saleDocRef, { pago });
    }

    // Actualizar en buffer de showroom doc si está presente
    const currentSales = data.sales || [];
    const newSales = currentSales.map(s => s.id === saleId ? { ...s, pago } : s);
    transaction.update(ref, {
      sales: newSales,
      lastSync: now
    });
  });
};

/**
 * Agrega un nuevo egreso con arrayUnion.
 */
const addExpense = async (expense: Expense): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanExp = sanitize(expense);
  const now = Date.now();
  await updateDoc(ref, {
    expenses: arrayUnion(cleanExp),
    lastSync: now
  });
};

/**
 * Actualiza un egreso existente.
 */
const updateExpense = async (updatedExpense: Expense): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanExp = sanitize(updatedExpense);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Showroom no encontrado.");
    const data = snap.data() as DatabaseState;
    const currentExp = data.expenses || [];
    const newExp = currentExp.map(e => e.id === cleanExp.id ? cleanExp : e);
    transaction.update(ref, {
      expenses: newExp,
      lastSync: now
    });
  });
};

/**
 * Elimina un egreso existente.
 */
const deleteExpense = async (expenseId: string): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Showroom no encontrado.");
    const data = snap.data() as DatabaseState;
    const currentExp = data.expenses || [];
    const newExp = currentExp.filter(e => e.id !== expenseId);
    transaction.update(ref, {
      expenses: newExp,
      lastSync: now
    });
  });
};

/**
 * Agrega una Gift Card y opcionalmente su venta vinculada.
 */
const addGiftCard = async (giftCard: GiftCard, sale?: Sale): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanGift = sanitize(giftCard);
  const now = Date.now();

  if (sale) {
    const cleanSale = sanitize(sale);
    const saleDocRef = doc(db, "showrooms", id, "sales", cleanSale.id);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("Showroom no encontrado.");
      const data = snap.data() as DatabaseState;
      const currentSales = data.sales || [];
      const currentGifts = data.giftCards || [];
      transaction.set(saleDocRef, cleanSale);
      transaction.update(ref, {
        giftCards: [...currentGifts, cleanGift],
        sales: [...currentSales, cleanSale].slice(-50),
        lastSync: now
      });
    });
  } else {
    await updateDoc(ref, {
      giftCards: arrayUnion(cleanGift),
      lastSync: now
    });
  }
};

/**
 * Actualiza una Gift Card existente y su venta vinculada si corresponde.
 */
const updateGiftCard = async (updatedGift: GiftCard, updatedSale?: Sale): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanGift = sanitize(updatedGift);
  const cleanSale = updatedSale ? sanitize(updatedSale) : undefined;
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Showroom no encontrado.");
    const data = snap.data() as DatabaseState;
    const currentGifts = data.giftCards || [];
    const newGifts = currentGifts.map(g => g.id === cleanGift.id ? cleanGift : g);

    const updatePayload: Record<string, any> = {
      giftCards: newGifts,
      lastSync: now
    };

    if (cleanSale) {
      const saleDocRef = doc(db, "showrooms", id, "sales", cleanSale.id);
      transaction.set(saleDocRef, cleanSale, { merge: true });
      const currentSales = data.sales || [];
      updatePayload.sales = currentSales.map(s => s.id === cleanSale.id ? cleanSale : s);
    }

    transaction.update(ref, updatePayload);
  });
};

/**
 * Cancela una Gift Card y elimina la venta asociada si se especifica el código.
 */
const cancelGiftCard = async (giftCardId: string, giftCode?: string): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Showroom no encontrado.");
    const data = snap.data() as DatabaseState;
    const currentGifts = data.giftCards || [];
    const newGifts = currentGifts.filter(g => g.id !== giftCardId);

    const updatePayload: Record<string, any> = {
      giftCards: newGifts,
      lastSync: now
    };

    if (giftCode) {
      const currentSales = data.sales || [];
      const saleToDelete = currentSales.find(s => s.items?.some(item => item.sku === giftCode));
      if (saleToDelete) {
        const saleDocRef = doc(db, "showrooms", id, "sales", saleToDelete.id);
        transaction.delete(saleDocRef);
      }
      updatePayload.sales = currentSales.filter(s => !(s.items?.some(item => item.sku === giftCode)));
    }

    transaction.update(ref, updatePayload);
  });
};

/**
 * Actualiza únicamente la configuración de la tienda web.
 */
const updateWebSettings = async (settings: WebSettings): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanSettings = sanitize(settings);
  const now = Date.now();
  await updateDoc(ref, {
    webSettings: cleanSettings,
    lastSync: now
  });
};

/**
 * Agrega un cierre mensual con arrayUnion.
 */
const addClosure = async (closure: MonthlyClosure): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanClosure = sanitize(closure);
  const now = Date.now();
  await updateDoc(ref, {
    closures: arrayUnion(cleanClosure),
    lastSync: now
  });
};

/**
 * Actualiza campos específicos de forma granular sin pisar otros campos.
 */
const updatePartial = async (partialState: Partial<DatabaseState>): Promise<void> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const cleanData = sanitize(partialState);
  const now = Date.now();
  await updateDoc(ref, {
    ...cleanData,
    lastSync: now
  });
};

/**
 * Persistencia directa para copias de seguridad completas (DatabaseView)
 */
const persistSafe = async (
  newState: Omit<DatabaseState, 'lastSync'>,
  _localLastSync?: number
): Promise<DatabaseState> => {
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const payload: DatabaseState = { ...sanitize(newState), lastSync: Date.now() };

  if (!navigator.onLine) {
    updateLocalOnly(payload);
    return payload;
  }

  await setDoc(ref, payload);
  updateLocalOnly(payload);
  return payload;
};

// =======================
// EXPORT BACKUP FILE
// =======================
const exportBackupFile = () => {
  const data = getLocalBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "ropero_backup.json";
  a.click();

  URL.revokeObjectURL(url);
};

/**
 * Consulta la subcolección de ventas históricas completas con orden y límite.
 */
const fetchHistoricalSales = async (limitCount = 500): Promise<Sale[]> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const salesCol = collection(db, "showrooms", id, "sales");
  const q = query(salesCol, orderBy("fecha", "desc"), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Sale);
};

/**
 * Migración idempotente: copia ventas históricas del documento único hacia la subcolección
 * y recorta el array del documento raíz a las últimas 50 ventas (Bug 7).
 */
const migrateSalesToSubcollection = async (): Promise<{ migratedCount: number }> => {
  if (!navigator.onLine) throw new Error('Offline');
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { migratedCount: 0 };
  const data = snap.data() as DatabaseState;
  const currentSales = data.sales || [];

  if (currentSales.length === 0) return { migratedCount: 0 };

  let migratedCount = 0;
  for (const sale of currentSales) {
    if (sale.id) {
      const saleDocRef = doc(db, "showrooms", id, "sales", sale.id);
      await setDoc(saleDocRef, sanitize(sale), { merge: true });
      migratedCount++;
    }
  }

  // Recortar buffer en showroom doc a 50
  if (currentSales.length > 50) {
    const trimmedSales = currentSales.slice(-50);
    await updateDoc(ref, {
      sales: trimmedSales,
      lastSync: Date.now()
    });
  }

  console.log(`[migrateSalesToSubcollection] Migradas ${migratedCount} ventas a la subcolección.`);
  return { migratedCount };
};

// =======================
// EXPORT API
// =======================
export const database = {
  getShowroomID,
  setShowroomID,
  getLocalBackup,
  updateLocalOnly,
  fetchRemote,
  subscribe,
  persistSafe,
  exportBackupFile,
  // Operaciones Granulares y Transaccionales (Bug 5)
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateInventory,
  recordSale,
  deleteSale,
  updateSalePago,
  fetchHistoricalSales,
  migrateSalesToSubcollection,
  addExpense,
  updateExpense,
  deleteExpense,
  addGiftCard,
  updateGiftCard,
  cancelGiftCard,
  updateWebSettings,
  addClosure,
  updatePartial,
};
