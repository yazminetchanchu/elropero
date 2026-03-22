import { InventoryItem, Sale, Expense, GiftCard } from '../types';
import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, runTransaction } from "firebase/firestore";

export interface DatabaseState {
  inventory: InventoryItem[];
  sales: Sale[];
  expenses: Expense[];
  giftCards: GiftCard[];
  lastSync?: number
}

// Cambiar keys fuerza "reset" local (evita cache viejo)
const LOCAL_KEY = "ropero_local_backup_v3_2026";
const SHOWROOM_KEY = "ropero_showroom_id_v3_2026";

// =======================
// SHOWROOM ID
// =======================
const getShowroomID = () => {
  let id = localStorage.getItem(SHOWROOM_KEY);
  if (!id) {
    id = crypto.randomUUID();
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
const subscribe = (onData: (data: DatabaseState) => void) => {
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);

  return onSnapshot(ref, async (snap) => {
    if (snap.exists()) {
      const data = snap.data() as DatabaseState;
      if (!data.giftCards) data.giftCards = [];
      updateLocalOnly(data);
      onData(data);
      return;
    }

    const empty: DatabaseState = {
      inventory: [],
      sales: [],
      expenses: [],
      giftCards: [],
      lastSync: Date.now()
    };

    await setDoc(ref, empty);
    updateLocalOnly(empty);
    onData(empty);
  });
};

// =======================
// PERSIST SAFE — read-before-write con transacción atómica
// =======================

// Elimina campos "undefined" que Firebase no acepta
const sanitize = (obj: object) => JSON.parse(JSON.stringify(obj));

/**
 * Escribe los datos de forma segura:
 *
 * 1. Abre una transacción atómica en Firestore.
 * 2. Lee el estado actual del servidor.
 * 3. Si el servidor tiene datos MÁS NUEVOS que el cliente (localLastSync),
 *    aborta y lanza un error CONFLICT con el estado del servidor para que
 *    App.tsx pueda sincronizar antes de reintentar.
 * 4. Si el cliente está al día, escribe el nuevo estado atómicamente.
 *
 * En modo OFFLINE: guarda solo en localStorage y retorna el payload local.
 *
 * @param newState   Datos nuevos a persistir (sin lastSync).
 * @param localLastSync  Timestamp del último sync que el cliente conoce.
 * @throws { type: 'CONFLICT', serverState }  si el servidor tiene datos más nuevos.
 * @throws Error  si hay un fallo de red u otro error de Firebase.
 */
const persistSafe = async (
  newState: Omit<DatabaseState, 'lastSync'>,
  localLastSync: number
): Promise<DatabaseState> => {
  const id = getShowroomID();
  const ref = doc(db, "showrooms", id);
  const payload: DatabaseState = { ...sanitize(newState), lastSync: Date.now() };

  // Sin conexión: guardar solo localmente y continuar
  if (!navigator.onLine) {
    updateLocalOnly(payload);
    return payload;
  }

  let serverStateOnConflict: DatabaseState | null = null;

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);

      if (snap.exists()) {
        const serverState = snap.data() as DatabaseState;
        const serverTime = serverState.lastSync ?? 0;

        // Si el servidor tiene datos más nuevos que los que el cliente conocía,
        // abortamos para no sobreescribir cambios de otro dispositivo.
        if (serverTime > localLastSync) {
          serverStateOnConflict = serverState;
          throw Object.assign(
            new Error('CONFLICT'),
            { type: 'CONFLICT', serverState }
          );
        }
      }

      // Cliente al día → escribir atómicamente
      transaction.set(ref, payload);
    });

    updateLocalOnly(payload);
    return payload;

  } catch (error: any) {
    if (error?.type === 'CONFLICT' && serverStateOnConflict) {
      throw Object.assign(
        new Error('CONFLICT'),
        { type: 'CONFLICT', serverState: serverStateOnConflict }
      );
    }
    throw error;
  }
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
};
