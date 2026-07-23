export type EdgeMethod = 'sobel' | 'canny';
export interface EdgeOpts { method?: EdgeMethod; low?: number; high?: number; blurR?: number; }
export interface EdgeResult { method: EdgeMethod; edges: Uint8Array; view: ImageData; width: number; height: number; low: number; high: number; }
const clampI = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export function toGrayscale(d: ImageData): Uint8Array {
  const s = d.data, n = d.width * d.height, g = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (s[j] * 0.299 + s[j + 1] * 0.587 + s[j + 2] * 0.114) | 0; return g;
}
function blurH(g: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(g.length), win = 2 * r + 1, half = win >> 1;
  for (let y = 0; y < h; y++) { const row = y * w; let acc = 0;
    for (let i = -r; i <= r; i++) acc += g[row + clampI(i, 0, w - 1)]; out[row] = (acc + half) / win | 0;
    for (let x = 1; x < w; x++) { acc += g[row + clampI(x + r, 0, w - 1)] - g[row + clampI(x - r - 1, 0, w - 1)]; out[row + x] = (acc + half) / win | 0; } }
  return out;
}
function blurV(g: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(g.length), win = 2 * r + 1, half = win >> 1;
  for (let x = 0; x < w; x++) { let acc = 0;
    for (let i = -r; i <= r; i++) acc += g[clampI(i, 0, h - 1) * w + x]; out[x] = (acc + half) / win | 0;
    for (let y = 1; y < h; y++) { acc += g[clampI(y + r, 0, h - 1) * w + x] - g[clampI(y - r - 1, 0, h - 1) * w + x]; out[y * w + x] = (acc + half) / win | 0; } }
  return out;
}
function blur(g: Uint8Array, w: number, h: number, r: number): Uint8Array { if (r < 1) return g; return blurV(blurH(g, w, h, r), w, h, r); }
function sobel(g: Uint8Array, w: number, h: number): { mag: Float32Array; dir: Float32Array } {
  const mag = new Float32Array(w * h), dir = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x;
    const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
    const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
    mag[i] = Math.hypot(gx, gy); let a = Math.atan2(gy, gx) * 57.29577951308232; if (a < 0) a += 180; dir[i] = a; }
  return { mag, dir };
}
function autoHL(mag: Float32Array, maxM: number): { low: number; high: number } {
  if (maxM <= 1) return { low: 8, high: 20 };
  const BINS = 128, sc = (BINS - 1) / maxM, hist = new Int32Array(BINS); let nz = 0;
  for (let i = 0; i < mag.length; i++) { const v = mag[i]; if (v > 0.5) { hist[(v * sc) | 0]++; nz++; } }
  if (nz < 10) return { low: 8, high: 20 };
  const target = nz * 0.6; let cum = 0, hb = 0; for (let b = 0; b < BINS; b++) { cum += hist[b]; if (cum >= target) { hb = b; break; } }
  const high = Math.max(hb / sc, maxM * 0.12); const clH = high < 12 ? 12 : high > 255 ? 255 : high;
  const low = Math.max(6, clH * 0.4); return { low, high: clH };
}
function nms(mag: Float32Array, dir: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(mag.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, m = mag[i]; if (m === 0) { out[i] = 0; continue; }
    const d = dir[i]; let a: number, b: number;
    if (d < 22.5 || d >= 157.5) { a = mag[i - 1]; b = mag[i + 1]; } else if (d < 67.5) { a = mag[i - w + 1]; b = mag[i + w - 1]; }
    else if (d < 112.5) { a = mag[i - w]; b = mag[i + w]; } else { a = mag[i - w - 1]; b = mag[i + w + 1]; }
    out[i] = (m >= a && m >= b) ? m : 0; }
  return out;
}
function hysteresis(n: Float32Array, w: number, h: number, low: number, high: number): Uint8Array {
  const edges = new Uint8Array(n.length), stack = new Int32Array(n.length); let top = 0;
  for (let i = 0; i < n.length; i++) { if (n[i] >= high) { edges[i] = 255; stack[top++] = i; } else if (n[i] >= low) edges[i] = 128; }
  while (top > 0) { const p = stack[--top], x = p % w, y = (p / w) | 0;
    if (x > 0 && edges[p - 1] === 128) { edges[p - 1] = 255; stack[top++] = p - 1; }
    if (x < w - 1 && edges[p + 1] === 128) { edges[p + 1] = 255; stack[top++] = p + 1; }
    if (y > 0 && edges[p - w] === 128) { edges[p - w] = 255; stack[top++] = p - w; }
    if (y < h - 1 && edges[p + w] === 128) { edges[p + w] = 255; stack[top++] = p + w; }
    if (x > 0 && y > 0 && edges[p - w - 1] === 128) { edges[p - w - 1] = 255; stack[top++] = p - w - 1; }
    if (x < w - 1 && y > 0 && edges[p - w + 1] === 128) { edges[p - w + 1] = 255; stack[top++] = p - w + 1; }
    if (x > 0 && y < h - 1 && edges[p + w - 1] === 128) { edges[p + w - 1] = 255; stack[top++] = p + w - 1; }
    if (x < w - 1 && y < h - 1 && edges[p + w + 1] === 128) { edges[p + w + 1] = 255; stack[top++] = p + w + 1; } }
  for (let i = 0; i < edges.length; i++) if (edges[i] !== 255) edges[i] = 0; return edges;
}
function buildView(intensity: Float32Array, edges: Uint8Array, w: number, h: number, norm: number): ImageData {
  const out = new ImageData(w, h), d = out.data;
  for (let i = 0, j = 0; i < intensity.length; i++, j += 4) { if (edges[i]) { const t = Math.min(1, intensity[i] / norm); d[j] = (30 + 30 * t) | 0; d[j + 1] = (180 + 60 * t) | 0; d[j + 2] = (200 + 55 * t) | 0; d[j + 3] = 255; } else { d[j] = 0; d[j + 1] = 0; d[j + 2] = 0; d[j + 3] = 255; } }
  return out;
}
export function edgeDetect(data: ImageData, opts: EdgeOpts = {}): EdgeResult {
  const w = data.width, h = data.height; const method: EdgeMethod = opts.method || 'canny';
  const blurR = opts.blurR !== undefined ? opts.blurR : (method === 'canny' ? 1 : 0);
  const g = blur(toGrayscale(data), w, h, blurR); const { mag, dir } = sobel(g, w, h);
  let maxM = 0; for (let i = 0; i < mag.length; i++) if (mag[i] > maxM) maxM = mag[i];
  const auto = !(opts.high !== undefined && opts.high > 0) ? autoHL(mag, maxM) : null;
  const high = (opts.high !== undefined && opts.high > 0) ? opts.high : (auto ? auto.high : 20);
  const low = (opts.low !== undefined && opts.low > 0) ? opts.low : (auto ? auto.low : Math.max(6, high * 0.4));
  if (method === 'sobel') { const edges = new Uint8Array(mag.length); for (let i = 0; i < mag.length; i++) edges[i] = mag[i] >= high ? 255 : 0; return { method, edges, view: buildView(mag, edges, w, h, Math.max(1, maxM)), width: w, height: h, low, high }; }
  const n = nms(mag, dir, w, h); const edges = hysteresis(n, w, h, low, high);
  return { method, edges, view: buildView(n, edges, w, h, Math.max(1, high * 1.4)), width: w, height: h, low, high };
}
function canvasToBlob(cv: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => { cv.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), mime, quality); });
}
export function thumbFromImage(img: HTMLImageElement, maxDim = 160, quality = 0.72): Promise<Blob> {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; const s = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d')!.drawImage(img, 0, 0, w, h); return canvasToBlob(cv, 'image/jpeg', quality);
}
export function cappedImageBlob(img: HTMLImageElement, maxDim = 1600, quality = 0.85): Promise<Blob> {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; const s = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d')!.drawImage(img, 0, 0, w, h); return canvasToBlob(cv, 'image/jpeg', quality);
}
export function imageDataToBlob(data: ImageData, mime = 'image/png', quality = 0.92): Promise<Blob> {
  const cv = document.createElement('canvas'); cv.width = data.width; cv.height = data.height; cv.getContext('2d')!.putImageData(data, 0, 0); return canvasToBlob(cv, mime, quality);
}
