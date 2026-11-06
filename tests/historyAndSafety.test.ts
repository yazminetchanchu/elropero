import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockDocState: any = {};
let snapshotCb: ((snap: any) => void) | null = null;

const mockTransaction = {
  get: vi.fn(async () => ({ exists: () => Object.keys(mockDocState).length > 0, data: () => mockDocState })),
  update: vi.fn((_ref, payload) => { mockDocState = { ...mockDocState, ...payload }; }),
  set: vi.fn(),
  delete: vi.fn()
};
const mockSetDoc = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('../services/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...a: any[]) => a.join('/')),
  getDoc: vi.fn(),
  setDoc: (...a: any[]) => mockSetDoc(...a),
  onSnapshot: vi.fn((_ref, cb) => { snapshotCb = cb; return () => {}; }),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(async (_db, fn) => fn(mockTransaction)),
  arrayUnion: vi.fn(),
  collection: vi.fn(() => 'col'),
  getDocs: (...a: any[]) => mockGetDocs(...a),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn()
}));

import { database } from '../services/storage';

describe('Persistencia: historial y protección contra pérdida de datos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotCb = null;
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    mockDocState = { sales: [], closures: [{ id: '2026-08', month: 8, year: 2026 }], lastSync: 1 };
  });

  it('persistSafe ya no existe (pisaba todo el documento con setDoc)', () => {
    expect((database as any).persistSafe).toBeUndefined();
  });

  it('fetchAllSales devuelve todas las ventas de la subcolección', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'a' }) }, { data: () => ({ id: 'b' }) }] });
    const all = await database.fetchAllSales();
    expect(all.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('backfillSales copia con merge y no borra nada', async () => {
    const n = await database.backfillSales([{ id: 's1' } as any, { id: 's2' } as any]);
    expect(n).toBe(2);
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  it('upsertClosure reemplaza solo el cierre con ese id y conserva los demás', async () => {
    mockDocState.closures = [{ id: '2026-07', gananciaNeta: 5 }, { id: '2026-08', gananciaNeta: 0 }];
    await database.upsertClosure({ id: '2026-08', gananciaNeta: 99 } as any);
    expect(mockDocState.closures).toEqual([{ id: '2026-07', gananciaNeta: 5 }, { id: '2026-08', gananciaNeta: 99 }]);
  });

  it('subscribe NO inicializa un documento vacío si el snapshot viene de caché', async () => {
    database.subscribe(() => {});
    await snapshotCb!({ exists: () => false, metadata: { fromCache: true } });
    expect(mockTransaction.set).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('subscribe nunca pisa un documento que ya existe en el servidor', async () => {
    mockDocState = { sales: [{ id: 'x' }] };
    database.subscribe(() => {});
    await snapshotCb!({ exists: () => false, metadata: { fromCache: false } });
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });
});
