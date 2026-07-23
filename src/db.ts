export interface StoredParticle { id: number; areaPx: number; aspectRatio: number; deqPx: number; deqMm: number | null; bbox: { x: number; y: number; w: number; h: number }; }
export interface StoredStats { count: number; meanDeqMm: number | null; d50MassMm: number | null; d50NumberPx: number | null; meanAspectRatio: number; coverage: number; confidence: number; confidenceLabel: string; calibrated: boolean; }
export interface StoredCalibration { mode: string; mmPerPx: number; }
export interface ScanRecord { id: string; createdAt: number; sampleName: string; source: 'vision' | 'manual' | 'ai-mock'; calibration: StoredCalibration; stats: StoredStats; particles: StoredParticle[]; sieve?: { size: number; weight: number }[]; thumbBlob: Blob | null; hasImage: boolean; notes?: string; }
const DB = 'crusher-psd-db', VER = 1, S_SCANS = 'scans', S_IMAGES = 'images';
let dbp: Promise<IDBDatabase> | null = null;
function req<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error || new Error('IDB request error')); }); }
function txDone(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('IDB tx error')); tx.onabort = () => reject(tx.error || new Error('IDB tx aborted')); }); }
export function openDB(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable (file:// may block; use the https site).'));
  dbp = new Promise((resolve, reject) => { const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { const db = r.result;
      if (!db.objectStoreNames.contains(S_SCANS)) { const s = db.createObjectStore(S_SCANS, { keyPath: 'id' }); s.createIndex('createdAt', 'createdAt'); s.createIndex('source', 'source'); }
      if (!db.objectStoreNames.contains(S_IMAGES)) db.createObjectStore(S_IMAGES, { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => { dbp = null; reject(r.error || new Error('IDB open failed')); }; r.onblocked = () => { dbp = null; reject(new Error('IDB open blocked')); }; });
  return dbp;
}
function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
export type NewScan = Omit<ScanRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number };
export async function saveScan(rec: NewScan, imageBlob: Blob | null): Promise<string> {
  const db = await openDB(); const id = rec.id || uid(); const createdAt = rec.createdAt || Date.now();
  const full: ScanRecord = { ...rec, id, createdAt, hasImage: !!imageBlob };
  const tx = db.transaction([S_SCANS, S_IMAGES], 'readwrite'); tx.objectStore(S_SCANS).put(full);
  if (imageBlob) tx.objectStore(S_IMAGES).put({ id, blob: imageBlob }); else tx.objectStore(S_IMAGES).delete(id);
  await txDone(tx); return id;
}
export async function getScan(id: string): Promise<{ record: ScanRecord; imageBlob: Blob | null } | null> {
  const db = await openDB(); const tx = db.transaction([S_SCANS, S_IMAGES], 'readonly');
  const record = await req<ScanRecord | undefined>(tx.objectStore(S_SCANS).get(id)); if (!record) return null;
  let imageBlob: Blob | null = null;
  if (record.hasImage) { const row = await req<{ id: string; blob: Blob } | undefined>(tx.objectStore(S_IMAGES).get(id)); imageBlob = row ? row.blob : null; }
  return { record, imageBlob };
}
export async function listScans(): Promise<ScanRecord[]> {
  const db = await openDB(); const all = await req<ScanRecord[]>(db.transaction(S_SCANS, 'readonly').objectStore(S_SCANS).getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteScan(id: string): Promise<void> {
  const db = await openDB(); const tx = db.transaction([S_SCANS, S_IMAGES], 'readwrite'); tx.objectStore(S_SCANS).delete(id); tx.objectStore(S_IMAGES).delete(id); await txDone(tx);
}
export async function clearScans(): Promise<void> {
  const db = await openDB(); const tx = db.transaction([S_SCANS, S_IMAGES], 'readwrite'); tx.objectStore(S_SCANS).clear(); tx.objectStore(S_IMAGES).clear(); await txDone(tx);
}
