// src/db.ts (v2) — session-based IndexedDB schema.
// Stores: sessions, results, images. Legacy v1 'scans' auto-migrated into results (no data loss).
// Keeps a legacy saveScan() wrapper so vision-screen.tsx stays untouched.
// Pure module; exposes setActiveSessionId() so the SessionContext can tell us the active session.

export interface StoredParticle { id: number; areaPx: number; aspectRatio: number; deqPx: number; deqMm: number | null; bbox: { x: number; y: number; w: number; h: number }; }
export interface StoredStats { count: number; meanDeqMm: number | null; d50MassMm: number | null; d50NumberPx: number | null; meanAspectRatio: number; coverage: number; confidence: number; confidenceLabel: string; calibrated: boolean; }
export interface StoredCalibration { mode: string; mmPerPx: number; }

export interface Session {
  id: string; name: string; location?: string; operator?: string; color?: string;
  createdAt: number; updatedAt: number; notes?: string;
}
export interface Result {
  id: string; sessionId: string; kind: 'manual' | 'vision' | 'ai-mock';
  sampleName: string; location?: string; operator?: string; createdAt: number;
  sieve: { size: number; weight: number }[];
  d10: number | null; d50: number | null; d80: number | null; cu: number | null; cc: number | null;
  gradation: 'well' | 'uniform' | 'gap';
  calibration?: StoredCalibration; stats?: StoredStats; particles?: StoredParticle[];
  thumbBlob?: Blob | null; hasImage?: boolean; notes?: string;
}
export interface ResultFilter { sessionId?: string; location?: string; kind?: Result['kind']; from?: number; to?: number; }

export const QUICK_ID = 'quick';

const DB = 'crusher-psd-db', VER = 2;
const S_SESSIONS = 'sessions', S_RESULTS = 'results', S_IMAGES = 'images', S_SCANS = 'scans';
let dbp: Promise<IDBDatabase> | null = null;
let _activeSessionId: string | null = null;
export function setActiveSessionId(id: string | null) { _activeSessionId = id; }
export function getActiveSessionId(): string | null { return _activeSessionId; }

function req<T>(r: IDBRequest<T>): Promise<T> { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('IDB request error')); }); }
function txDone(tx: IDBTransaction): Promise<void> { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error || new Error('IDB tx error')); tx.onabort = () => rej(tx.error || new Error('IDB tx aborted')); }); }

export function openDB(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable (file:// may block; use the https site).'));
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(S_SESSIONS)) { const s = db.createObjectStore(S_SESSIONS, { keyPath: 'id' }); s.createIndex('updatedAt', 'updatedAt'); }
      if (!db.objectStoreNames.contains(S_RESULTS)) { const s = db.createObjectStore(S_RESULTS, { keyPath: 'id' }); s.createIndex('sessionId', 'sessionId'); s.createIndex('createdAt', 'createdAt'); s.createIndex('location', 'location'); s.createIndex('kind', 'kind'); }
      if (!db.objectStoreNames.contains(S_IMAGES)) db.createObjectStore(S_IMAGES, { keyPath: 'id' });
      // NOTE: legacy 'scans' store is intentionally left in place so ensureMigrated() can read it.
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbp = null; reject(r.error || new Error('IDB open failed')); };
    r.onblocked = () => { dbp = null; reject(new Error('IDB open blocked')); };
  });
  return dbp;
}

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

async function ensureMigrated(db: IDBDatabase): Promise<void> {
  try { localStorage.getItem('psd-migrated-v2'); } catch {}
  let done = false; try { done = localStorage.getItem('psd-migrated-v2') === '1'; } catch {}
  if (done) return;
  if (!db.objectStoreNames.contains(S_SCANS)) { try { localStorage.setItem('psd-migrated-v2', '1'); } catch {} return; }
  let scans: any[] = [];
  try { scans = await req<any[]>(db.transaction(S_SCANS, 'readonly').objectStore(S_SCANS).getAll()); } catch { scans = []; }
  const tx = db.transaction([S_RESULTS], 'readwrite'); const store = tx.objectStore(S_RESULTS);
  for (const sc of scans) {
    if (!sc || !sc.id) continue;
    const existing = await req<any>(store.get(sc.id)).catch(() => undefined);
    if (existing) continue;
    const kind: Result['kind'] = sc.source === 'manual' ? 'manual' : sc.source === 'ai-mock' ? 'ai-mock' : 'vision';
    const res: Result = {
      id: sc.id, sessionId: QUICK_ID, kind, sampleName: sc.sampleName || 'Imported', createdAt: sc.createdAt || Date.now(),
      sieve: sc.sieve || [], d10: null, d50: sc.stats?.d50MassMm ?? null, d80: null, cu: null, cc: null, gradation: 'gap',
      calibration: sc.calibration, stats: sc.stats, particles: sc.particles, thumbBlob: sc.thumbBlob || null, hasImage: !!sc.hasImage,
    };
    store.put(res);
  }
  await txDone(tx).catch(() => {});
  try { localStorage.setItem('psd-migrated-v2', '1'); } catch {}
}

async function ensureQuick(db: IDBDatabase): Promise<void> {
  const q = await req<Session | undefined>(db.transaction(S_SESSIONS, 'readonly').objectStore(S_SESSIONS).get(QUICK_ID)).catch(() => undefined);
  if (!q) {
    const now = Date.now();
    const quick: Session = { id: QUICK_ID, name: 'Quick', createdAt: now, updatedAt: now, notes: 'Default session for quick captures' };
    const tx = db.transaction(S_SESSIONS, 'readwrite'); tx.objectStore(S_SESSIONS).put(quick); await txDone(tx).catch(() => {});
  }
}

let readyP: Promise<void> | null = null;
export function ensureReady(): Promise<void> {
  if (readyP) return readyP;
  readyP = (async () => { const db = await openDB(); await ensureMigrated(db); await ensureQuick(db); })();
  return readyP;
}

/* ---------------- sessions ---------------- */
export async function createSession(p: { id?: string; name: string; location?: string; operator?: string; color?: string; notes?: string }): Promise<string> {
  await ensureReady(); const db = await openDB();
  const now = Date.now(); const id = p.id || uid();
  const s: Session = { id, name: p.name || 'Untitled', location: p.location, operator: p.operator, color: p.color, createdAt: now, updatedAt: now, notes: p.notes };
  const tx = db.transaction(S_SESSIONS, 'readwrite'); tx.objectStore(S_SESSIONS).put(s); await txDone(tx);
  return id;
}
export async function listSessions(): Promise<Session[]> {
  await ensureReady(); const db = await openDB();
  const all = await req<Session[]>(db.transaction(S_SESSIONS, 'readonly').objectStore(S_SESSIONS).getAll());
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export async function getSession(id: string): Promise<Session | null> {
  await ensureReady(); const db = await openDB();
  const s = await req<Session | undefined>(db.transaction(S_SESSIONS, 'readonly').objectStore(S_SESSIONS).get(id));
  return s || null;
}
export async function updateSession(id: string, patch: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<void> {
  await ensureReady(); const db = await openDB();
  const cur = await req<Session | undefined>(db.transaction(S_SESSIONS, 'readonly').objectStore(S_SESSIONS).get(id));
  if (!cur) return;
  const next: Session = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: Date.now() };
  const tx = db.transaction(S_SESSIONS, 'readwrite'); tx.objectStore(S_SESSIONS).put(next); await txDone(tx);
}
export async function deleteSession(id: string): Promise<void> {
  if (id === QUICK_ID) return; // never delete the quick session
  await ensureReady(); const db = await openDB();
  const tx = db.transaction([S_SESSIONS, S_RESULTS, S_IMAGES], 'readwrite');
  const all = await req<Result[]>(tx.objectStore(S_RESULTS).getAll());
  const rstore = tx.objectStore(S_RESULTS), istore = tx.objectStore(S_IMAGES);
  for (const r of all) if (r.sessionId === id) { rstore.delete(r.id); istore.delete(r.id); }
  tx.objectStore(S_SESSIONS).delete(id);
  await txDone(tx);
}

/* ---------------- results ---------------- */
export async function saveResult(r: Result, imageBlob: Blob | null): Promise<string> {
  await ensureReady(); const db = await openDB();
  const full: Result = { ...r, hasImage: !!imageBlob };
  const tx = db.transaction([S_RESULTS, S_IMAGES, S_SESSIONS], 'readwrite');
  tx.objectStore(S_RESULTS).put(full);
  if (imageBlob) tx.objectStore(S_IMAGES).put({ id: r.id, blob: imageBlob }); else tx.objectStore(S_IMAGES).delete(r.id);
  // bump session updatedAt
  const s = await req<Session | undefined>(tx.objectStore(S_SESSIONS).get(r.sessionId));
  if (s) tx.objectStore(S_SESSIONS).put({ ...s, updatedAt: Date.now() });
  await txDone(tx);
  return r.id;
}
export async function listResults(filter: ResultFilter = {}): Promise<Result[]> {
  await ensureReady(); const db = await openDB();
  let all = await req<Result[]>(db.transaction(S_RESULTS, 'readonly').objectStore(S_RESULTS).getAll());
  if (filter.sessionId) all = all.filter((r) => r.sessionId === filter.sessionId);
  if (filter.kind) all = all.filter((r) => r.kind === filter.kind);
  if (filter.location) all = all.filter((r) => (r.location || '') === filter.location);
  if (filter.from != null) all = all.filter((r) => r.createdAt >= (filter.from as number));
  if (filter.to != null) all = all.filter((r) => r.createdAt <= (filter.to as number));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function getResult(id: string): Promise<{ record: Result; imageBlob: Blob | null } | null> {
  await ensureReady(); const db = await openDB();
  const tx = db.transaction([S_RESULTS, S_IMAGES], 'readonly');
  const record = await req<Result | undefined>(tx.objectStore(S_RESULTS).get(id));
  if (!record) return null;
  let imageBlob: Blob | null = null;
  if (record.hasImage) { const row = await req<{ id: string; blob: Blob } | undefined>(tx.objectStore(S_IMAGES).get(id)); imageBlob = row ? row.blob : null; }
  return { record, imageBlob };
}
export async function deleteResult(id: string): Promise<void> {
  await ensureReady(); const db = await openDB();
  const tx = db.transaction([S_RESULTS, S_IMAGES], 'readwrite'); tx.objectStore(S_RESULTS).delete(id); tx.objectStore(S_IMAGES).delete(id); await txDone(tx);
}
export async function countBySession(): Promise<Record<string, number>> {
  const all = await listResults(); const m: Record<string, number> = {};
  for (const r of all) m[r.sessionId] = (m[r.sessionId] || 0) + 1;
  return m;
}

/* ---------------- legacy wrapper (keeps vision-screen.tsx working) ---------------- */
export type NewScan = { sampleName: string; source: 'vision' | 'manual' | 'ai-mock'; calibration: StoredCalibration; stats: StoredStats; particles: StoredParticle[]; sieve?: { size: number; weight: number }[]; thumbBlob: Blob | null; notes?: string; id?: string; createdAt?: number };
export async function saveScan(rec: NewScan, imageBlob: Blob | null): Promise<string> {
  const id = rec.id || uid(); const createdAt = rec.createdAt || Date.now();
  const sessionId = getActiveSessionId() || QUICK_ID;
  const result: Result = {
    id, sessionId, kind: rec.source, sampleName: rec.sampleName, createdAt,
    sieve: rec.sieve || [], d10: null, d50: rec.stats?.d50MassMm ?? null, d80: null, cu: null, cc: null, gradation: 'gap',
    calibration: rec.calibration, stats: rec.stats, particles: rec.particles, thumbBlob: rec.thumbBlob || null, notes: rec.notes,
  };
  return saveResult(result, imageBlob);
}
