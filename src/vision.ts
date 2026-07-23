export type CalMode = 'line' | 'circle' | 'numeric';
export type Pipeline = 'fast' | 'accurate';
export interface Calibration { mode: CalMode; mmPerPx: number; linePx?: number; valueMm?: number; radiusPx?: number; diameterMm?: number; framePx?: number; frameMm?: number; }
export interface Particle { id: number; areaPx: number; perimeterPx: number; bbox: { x: number; y: number; w: number; h: number }; aspectRatio: number; deqPx: number; deqMm: number | null; }
export interface VisionStats { count: number; meanDeqPx: number; meanDeqMm: number | null; d50NumberPx: number | null; d50MassMm: number | null; meanAspectRatio: number; totalAreaPx: number; coverage: number; calibrated: boolean; confidence: number; confidenceLabel: 'high' | 'medium' | 'low'; confidenceReasons: string[]; }
export interface VisionResult { width: number; height: number; particles: Particle[]; mask: Uint8Array; labels: Int32Array; labelCount: number; stats: VisionStats; calibration: Calibration; }
export interface AnalyzeOpts { pipeline?: Pipeline; invert?: boolean; blurRadius?: number; morphIter?: number; minAreaPx?: number; maxAreaRatio?: number; edgeThr?: number; }
export interface SieveLike { size: number; weight: number; }
const clampI = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export function imageDataFromImage(img: HTMLImageElement, maxDim = 700): ImageData {
  const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
export function toGrayscale(d: ImageData): Uint8Array {
  const s = d.data, n = d.width * d.height, g = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (s[j] * 0.299 + s[j + 1] * 0.587 + s[j + 2] * 0.114) | 0;
  return g;
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
function blur(g: Uint8Array, w: number, h: number, r: number, passes = 2): Uint8Array {
  if (r < 1) return g; let c = g; for (let p = 0; p < passes; p++) { c = blurH(c, w, h, r); c = blurV(c, w, h, r); } return c;
}
function otsu(g: Uint8Array): number {
  const hist = new Int32Array(256); for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxV = -1, thr = 0;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > maxV) { maxV = v; thr = t; } }
  return thr;
}
function buildMask(g: Uint8Array, thr: number, invert: boolean): Uint8Array {
  const m = new Uint8Array(g.length); for (let i = 0; i < g.length; i++) m[i] = (g[i] > thr) === !invert ? 1 : 0; return m;
}
function erode(m: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(m.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x;
    if (m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w] && m[i - w - 1] && m[i - w + 1] && m[i + w - 1] && m[i + w + 1]) o[i] = 1; }
  return o;
}
function dilate(m: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(m.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x;
    if (m[i] || m[i - 1] || m[i + 1] || m[i - w] || m[i + w] || m[i - w - 1] || m[i - w + 1] || m[i + w - 1] || m[i + w + 1]) o[i] = 1; }
  return o;
}
function morph(m: Uint8Array, w: number, h: number, iter: number, op: 'open' | 'close'): Uint8Array {
  let c = m; for (let k = 0; k < iter; k++) c = op === 'open' ? dilate(erode(c, w, h), w, h) : erode(dilate(c, w, h), w, h); return c;
}
const BIG = 1 << 25;
function distTransform(mask: Uint8Array, w: number, h: number): Int32Array {
  const d = new Int32Array(mask.length); for (let i = 0; i < mask.length; i++) d[i] = mask[i] ? BIG : 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!mask[i]) continue;
    d[i] = Math.min(d[i], d[i - 1] + 3, d[i - w] + 3, d[i - w - 1] + 4, d[i - w + 1] + 4); }
  for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) { const i = y * w + x; if (!mask[i]) continue;
    d[i] = Math.min(d[i], d[i + 1] + 3, d[i + w] + 3, d[i + w + 1] + 4, d[i + w - 1] + 4); }
  return d;
}
function findPeaks(d: Int32Array, w: number, h: number, minPeak: number, minDist: number) {
  const cand: { x: number; y: number; v: number }[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, v = d[i]; if (v < minPeak) continue;
    if (v >= d[i - 1] && v >= d[i + 1] && v >= d[i - w] && v >= d[i + w] && v >= d[i - w - 1] && v >= d[i - w + 1] && v >= d[i + w - 1] && v >= d[i + w + 1]) cand.push({ x, y, v }); }
  cand.sort((a, b) => b.v - a.v);
  const kept: { x: number; y: number; v: number }[] = [], md2 = minDist * minDist;
  for (const c of cand) { let ok = true; for (const k of kept) { const dx = c.x - k.x, dy = c.y - k.y; if (dx * dx + dy * dy < md2) { ok = false; break; } } if (ok) kept.push(c); }
  return kept;
}
function grow(seeds: { x: number; y: number }[], mask: Uint8Array, w: number, h: number): Int32Array {
  const labels = new Int32Array(mask.length), q = new Int32Array(mask.length); let head = 0, tail = 0;
  for (let s = 0; s < seeds.length; s++) { const p = seeds[s].y * w + seeds[s].x; labels[p] = s + 1; q[tail++] = p; }
  while (head < tail) { const p = q[head++], x = p % w, y = (p / w) | 0, l = labels[p];
    if (x > 0) { const n = p - 1; if (mask[n] && !labels[n]) { labels[n] = l; q[tail++] = n; } }
    if (x < w - 1) { const n = p + 1; if (mask[n] && !labels[n]) { labels[n] = l; q[tail++] = n; } }
    if (y > 0) { const n = p - w; if (mask[n] && !labels[n]) { labels[n] = l; q[tail++] = n; } }
    if (y < h - 1) { const n = p + w; if (mask[n] && !labels[n]) { labels[n] = l; q[tail++] = n; } } }
  return labels;
}
function ccLabels(mask: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(mask.length), parent = new Int32Array(mask.length + 1); let next = 1;
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!mask[i]) continue;
    const l = x > 0 ? labels[i - 1] : 0, u = y > 0 ? labels[i - w] : 0;
    if (!l && !u) { labels[i] = next; parent[next] = next; next++; } else if (l && !u) labels[i] = l; else if (!l && u) labels[i] = u; else { labels[i] = Math.min(l, u); union(l, u); } }
  const remap = new Int32Array(next); let K = 0;
  for (let i = 0; i < labels.length; i++) if (mask[i]) { const r = find(labels[i]); if (!remap[r]) remap[r] = ++K; labels[i] = remap[r]; }
  return { labels, count: K };
}
function measure(labels: Int32Array, w: number, h: number, count: number, minA: number, maxA: number): Particle[] {
  const area = new Int32Array(count + 1), perim = new Int32Array(count + 1);
  const minX = new Int32Array(count + 1).fill(w), minY = new Int32Array(count + 1).fill(h);
  const maxX = new Int32Array(count + 1), maxY = new Int32Array(count + 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, l = labels[i]; if (!l) continue;
    area[l]++; if (x < minX[l]) minX[l] = x; if (x > maxX[l]) maxX[l] = x; if (y < minY[l]) minY[l] = y; if (y > maxY[l]) maxY[l] = y;
    if (x === 0 || x === w - 1 || y === 0 || y === h - 1 || labels[i - 1] !== l || labels[i + 1] !== l || labels[i - w] !== l || labels[i + w] !== l) perim[l]++; }
  const out: Particle[] = []; let id = 1;
  for (let l = 1; l <= count; l++) { const a = area[l]; if (a < minA || a > maxA) continue;
    const bw = maxX[l] - minX[l] + 1, bh = maxY[l] - minY[l] + 1;
    out.push({ id: id++, areaPx: a, perimeterPx: perim[l], bbox: { x: minX[l], y: minY[l], w: bw, h: bh }, aspectRatio: Math.max(bw, bh) / Math.max(1, Math.min(bw, bh)), deqPx: 2 * Math.sqrt(a / Math.PI), deqMm: null }); }
  return out;
}
export function makeCalibrationLine(linePx: number, valueMm: number): Calibration { const ok = linePx > 1 && valueMm > 0; return { mode: 'line', linePx, valueMm, mmPerPx: ok ? valueMm / linePx : 0 }; }
export function makeCalibrationCircle(radiusPx: number, diameterMm: number): Calibration { const ok = radiusPx > 1 && diameterMm > 0; return { mode: 'circle', radiusPx, diameterMm, mmPerPx: ok ? diameterMm / (2 * radiusPx) : 0 }; }
export function makeCalibrationNumeric(framePx: number, frameMm: number): Calibration { const ok = framePx > 1 && frameMm > 0; return { mode: 'numeric', framePx, frameMm, mmPerPx: ok ? frameMm / framePx : 0 }; }
function calibrate(p: Particle[], cal: Calibration): Particle[] { const f = cal.mmPerPx; if (!(f > 0)) return p; return p.map((q) => ({ ...q, deqMm: q.deqPx * f })); }
export function edgeViewImageData(g: Uint8Array, w: number, h: number, thr = 46): ImageData {
  const out = new ImageData(w, h), d = out.data, mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x;
    const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
    const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]; mag[i] = Math.sqrt(gx * gx + gy * gy); }
  for (let i = 0, j = 0; i < mag.length; i++, j += 4) { if (mag[i] > thr) { const k = Math.min(1, mag[i] / 220); d[j] = 30 + 30 * k; d[j + 1] = 180 + 60 * k; d[j + 2] = 200 + 55 * k; d[j + 3] = 255; } else d[j + 3] = 255; }
  return out;
}
export function maskToImageData(mask: Uint8Array, w: number, h: number): ImageData {
  const out = new ImageData(w, h), d = out.data;
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = mask[i] ? 200 : 8; d[j + 3] = 255; }
  return out;
}
export function labelsToImageData(labels: Int32Array, w: number, h: number): ImageData {
  const out = new ImageData(w, h), d = out.data;
  for (let i = 0, j = 0; i < labels.length; i++, j += 4) { const l = labels[i]; if (!l) { d[j + 3] = 255; continue; }
    d[j] = 60 + ((l * 1103515245 + 12345) & 195); d[j + 1] = 60 + (((l * 214013 + 2531011) >> 5) & 195); d[j + 2] = 60 + ((l * 16807) & 195); d[j + 3] = 255; }
  return out;
}
function medianSorted(xs: number[]): number | null { if (!xs.length) return null; const m = xs.length >> 1; return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2; }
function numericStats(p: Particle[], cal: Calibration) {
  const n = p.length;
  if (!n) return { meanDeqPx: 0, meanDeqMm: null, d50NumberPx: null, d50MassMm: null, meanAspectRatio: 0, totalAreaPx: 0 };
  let sPx = 0, sAR = 0, sArea = 0; const pxs: number[] = [];
  for (const q of p) { sPx += q.deqPx; sAR += q.aspectRatio; sArea += q.areaPx; pxs.push(q.deqPx); }
  pxs.sort((a, b) => a - b);
  let meanMm: number | null = null, d50M: number | null = null;
  if (cal.mmPerPx > 0) { const mms = p.map((q) => q.deqMm!).filter((d) => d > 0);
    if (mms.length) { meanMm = mms.reduce((s, d) => s + d, 0) / mms.length;
      const wv = p.filter((q) => q.deqMm! > 0).map((q) => ({ d: q.deqMm!, m: q.deqMm! ** 3 })).sort((a, b) => a.d - b.d);
      const tot = wv.reduce((s, x) => s + x.m, 0); let cum = 0; for (const x of wv) { cum += x.m; if (cum >= tot * 0.5) { d50M = x.d; break; } } } }
  return { meanDeqPx: sPx / n, meanDeqMm: meanMm, d50NumberPx: medianSorted(pxs), d50MassMm: d50M, meanAspectRatio: sAR / n, totalAreaPx: sArea };
}
function confidence(p: Particle[], w: number, h: number) {
  const n = p.length;
  if (!n) return { confidence: 0, confidenceLabel: 'low' as const, confidenceReasons: ['no particles detected'], coverage: 0 };
  const total = p.reduce((s, q) => s + q.areaPx, 0); const coverage = total / (w * h);
  const maxA = p.reduce((m, q) => Math.max(m, q.areaPx), 0); const giant = maxA / total;
  const mean = p.reduce((s, q) => s + q.deqPx, 0) / n; const variance = p.reduce((s, q) => s + (q.deqPx - mean) ** 2, 0) / n; const cv = Math.sqrt(variance) / Math.max(1, mean);
  let score = 1; const reasons: string[] = [];
  if (coverage < 0.15) { score -= 0.3; reasons.push('low coverage'); }
  if (coverage > 0.92) { score -= 0.3; reasons.push('mask saturated'); }
  if (giant > 0.25) { score -= 0.35; reasons.push('one giant blob (heap/merge)'); }
  if (n < 10) { score -= 0.2; reasons.push('too few particles'); }
  if (cv > 1.1) { score -= 0.2; reasons.push('high size spread (heap/mixed)'); }
  if (!reasons.length) reasons.push('clean separation');
  score = Math.max(0, Math.min(1, score));
  return { confidence: score, confidenceLabel: (score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low') as 'high' | 'medium' | 'low', confidenceReasons: reasons, coverage };
}
export function analyze(data: ImageData, cal: Calibration, opts: AnalyzeOpts = {}): VisionResult {
  const w = data.width, h = data.height;
  const blurR = opts.blurRadius ?? 2, morphIt = opts.morphIter ?? 1, minA = opts.minAreaPx ?? 40, maxA = (opts.maxAreaRatio ?? 0.5) * (w * h);
  const g = blur(toGrayscale(data), w, h, blurR, 2); const thr = otsu(g);
  let mask = buildMask(g, thr, !!opts.invert); mask = morph(mask, w, h, Math.max(1, morphIt), 'close'); mask = morph(mask, w, h, 1, 'open');
  let labels: Int32Array, count: number;
  if (opts.pipeline === 'fast') { const cc = ccLabels(mask, w, h); labels = cc.labels; count = cc.count; }
  else { const d = distTransform(mask, w, h); let maxD = 0; for (let i = 0; i < d.length; i++) if (d[i] < BIG && d[i] > maxD) maxD = d[i];
    const minPeak = Math.max(3, maxD * 0.32), minDist = Math.max(2, Math.round(maxD * 0.45)); const peaks = findPeaks(d, w, h, minPeak, minDist);
    if (peaks.length < 2) { const cc = ccLabels(mask, w, h); labels = cc.labels; count = cc.count; } else { labels = grow(peaks, mask, w, h); count = peaks.length; } }
  let particles = measure(labels, w, h, count, minA, maxA); particles = calibrate(particles, cal);
  const ns = numericStats(particles, cal); const cf = confidence(particles, w, h);
  return { width: w, height: h, particles, mask, labels, labelCount: count, calibration: cal, stats: { count: particles.length, ...ns, calibrated: cal.mmPerPx > 0, coverage: cf.coverage, confidence: cf.confidence, confidenceLabel: cf.confidenceLabel, confidenceReasons: cf.confidenceReasons } };
}
export function buildSieveFromDiameters(diamsMm: number[], bins = 14): SieveLike[] {
  const v = diamsMm.filter((d) => d > 0 && isFinite(d)); if (v.length < 3) return [];
  const lo = Math.log10(Math.min(...v)), hi = Math.log10(Math.max(...v)); if (!isFinite(lo) || !isFinite(hi) || hi - lo < 1e-6) return [];
  const step = (hi - lo) / bins, edges: number[] = []; for (let i = 1; i <= bins; i++) edges.push(Math.pow(10, lo + step * i));
  const weight = new Float64Array(bins);
  for (const d of v) { let b = Math.floor((Math.log10(d) - lo) / step); if (b < 0) b = 0; if (b >= bins) b = bins - 1; weight[b] += d * d * d; }
  return edges.map((e, i) => ({ size: +e.toFixed(4), weight: weight[i] }));
}
