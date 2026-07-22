// src/edges.ts — self-contained Canny & Sobel edge detection + image/blob helpers.
// Real Canny = gaussian blur -> sobel gradient -> non-max suppression -> double threshold -> hysteresis.
// No imports, no deps. NOT imported by App yet (safe to push; UI wires it next).

export type EdgeMethod = 'sobel' | 'canny';

export interface EdgeOpts {
  method?: EdgeMethod;
  low?: number;    // 0..255 ; auto if omitted/<=0
  high?: number;   // 0..255 ; auto if omitted/<=0
  blurR?: number;  // pre-blur radius (canny default 1, sobel default 0)
}

export interface EdgeResult {
  method: EdgeMethod;
  edges: Uint8Array;   // binary 0/255, length = w*h
  view: ImageData;     // cyan-on-black diagnostic image (like the reference app)
  width: number;
  height: number;
  low: number;
  high: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clampI = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function toGrayscale(d: ImageData): Uint8Array {
  const s = d.data, n = d.width * d.height, g = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (s[j] * 0.299 + s[j + 1] * 0.587 + s[j + 2] * 0.114) | 0;
  return g;
}

/* ---- separable box blur (1 pass; canny pre-smooth) ---- */
function blurH(g: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(g.length), win = 2 * r + 1, half = win >> 1;
  for (let y = 0; y < h; y++) {
    const row = y * w; let acc = 0;
    for (let i = -r; i <= r; i++) acc += g[row + clampI(i, 0, w - 1)];
    out[row] = (acc + half) / win | 0;
    for (let x = 1; x < w; x++) {
      acc += g[row + clampI(x + r, 0, w - 1)] - g[row + clampI(x - r - 1, 0, w - 1)];
      out[row + x] = (acc + half) / win | 0;
    }
  }
  return out;
}
function blurV(g: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(g.length), win = 2 * r + 1, half = win >> 1;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += g[clampI(i, 0, h - 1) * w + x];
    out[x] = (acc + half) / win | 0;
    for (let y = 1; y < h; y++) {
      acc += g[clampI(y + r, 0, h - 1) * w + x] - g[clampI(y - r - 1, 0, h - 1) * w + x];
      out[y * w + x] = (acc + half) / win | 0;
    }
  }
  return out;
}
function blur(g: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r < 1) return g;
  return blurV(blurH(g, w, h, r), w, h, r);
}

/* ---- sobel gradient: magnitude + undirected direction (0..180 deg) ---- */
function sobel(g: Uint8Array, w: number, h: number): { mag: Float32Array; dir: Float32Array } {
  const mag = new Float32Array(w * h), dir = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
      const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
      let a = Math.atan2(gy, gx) * 57.29577951308232; if (a < 0) a += 180; dir[i] = a;
    }
  }
  return { mag, dir };
}

/* ---- auto thresholds from magnitude histogram (median-based, robust start) ---- */
function autoHL(mag: Float32Array, maxM: number): { low: number; high: number } {
  if (maxM <= 1) return { low: 8, high: 20 };
  const BINS = 128, sc = (BINS - 1) / maxM, hist = new Int32Array(BINS); let nz = 0;
  for (let i = 0; i < mag.length; i++) { const v = mag[i]; if (v > 0.5) { hist[(v * sc) | 0]++; nz++; } }
  if (nz < 10) return { low: 8, high: 20 };
  const target = nz * 0.6; let cum = 0, hb = 0;
  for (let b = 0; b < BINS; b++) { cum += hist[b]; if (cum >= target) { hb = b; break; } }
  let high = clamp(Math.max(hb / sc, maxM * 0.12), 12, 255);
  const low = Math.max(6, high * 0.4);
  return { low, high };
}

/* ---- non-maximum suppression along the gradient direction ---- */
function nms(mag: Float32Array, dir: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(mag.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, m = mag[i]; if (m === 0) { out[i] = 0; continue; }
      const d = dir[i]; let a: number, b: number;
      if (d < 22.5 || d >= 157.5) { a = mag[i - 1]; b = mag[i + 1]; }
      else if (d < 67.5) { a = mag[i - w + 1]; b = mag[i + w - 1]; }
      else if (d < 112.5) { a = mag[i - w]; b = mag[i + w]; }
      else { a = mag[i - w - 1]; b = mag[i + w + 1]; }
      out[i] = (m >= a && m >= b) ? m : 0;
    }
  }
  return out;
}

/* ---- double threshold + hysteresis edge tracking ---- */
function hysteresis(n: Float32Array, w: number, h: number, low: number, high: number): Uint8Array {
  const edges = new Uint8Array(n.length), stack = new Int32Array(n.length); let top = 0;
  for (let i = 0; i < n.length; i++) {
    if (n[i] >= high) { edges[i] = 255; stack[top++] = i; }
    else if (n[i] >= low) edges[i] = 128;
  }
  while (top > 0) {
    const p = stack[--top], x = p % w, y = (p / w) | 0;
    if (x > 0 && edges[p - 1] === 128) { edges[p - 1] = 255; stack[top++] = p - 1; }
    if (x < w - 1 && edges[p + 1] === 128) { edges[p + 1] = 255; stack[top++] = p + 1; }
    if (y > 0 && edges[p - w] === 128) { edges[p - w] = 255; stack[top++] = p - w; }
    if (y < h - 1 && edges[p + w] === 128) { edges[p + w] = 255; stack[top++] = p + w; }
    if (x > 0 && y > 0 && edges[p - w - 1] === 128) { edges[p - w - 1] = 255; stack[top++] = p - w - 1; }
    if (x < w - 1 && y > 0 && edges[p - w + 1] === 128) { edges[p - w + 1] = 255; stack[top++] = p - w + 1; }
    if (x > 0 && y < h - 1 && edges[p + w - 1] === 128) { edges[p + w - 1] = 255; stack[top++] = p + w - 1; }
    if (x < w - 1 && y < h - 1 && edges[p + w + 1] === 128) { edges[p + w + 1] = 255; stack[top++] = p + w + 1; }
  }
  for (let i = 0; i < edges.length; i++) if (edges[i] !== 255) edges[i] = 0;
  return edges;
}

function buildView(intensity: Float32Array, edges: Uint8Array, w: number, h: number, norm: number): ImageData {
  const out = new ImageData(w, h), d = out.data;
  for (let i = 0, j = 0; i < intensity.length; i++, j += 4) {
    if (edges[i]) {
      const t = Math.min(1, intensity[i] / norm);
      d[j] = (30 + 30 * t) | 0; d[j + 1] = (180 + 60 * t) | 0; d[j + 2] = (200 + 55 * t) | 0; d[j + 3] = 255;
    } else { d[j] = 0; d[j + 1] = 0; d[j + 2] = 0; d[j + 3] = 255; }
  }
  return out;
}

/* ---- public entry ---- */
export function edgeDetect(data: ImageData, opts: EdgeOpts = {}): EdgeResult {
  const w = data.width, h = data.height;
  const method: EdgeMethod = opts.method || 'canny';
  const blurR = opts.blurR !== undefined ? opts.blurR : (method === 'canny' ? 1 : 0);
  const g = blur(toGrayscale(data), w, h, blurR);
  const { mag, dir } = sobel(g, w, h);

  let maxM = 0; for (let i = 0; i < mag.length; i++) if (mag[i] > maxM) maxM = mag[i];
  const auto = !(opts.high !== undefined && opts.high > 0) ? autoHL(mag,
بله — و این بار **واقعی**، نه یک نمایشِ شبیه Canny. بگذار اول یک‌خط جواب صریح بدهم، بعد دو نکته‌ی صادقانه که ارزشش از خود کد بیشتر است، بعد کد.

**جواب:** بله، Canny کامل (Gaussian → Sobel → **Non‑Maximum Suppression** در جهت گرادیان → **آستانه دوگانه** → **هیسترزیس/ردیابی لبه**) و Sobel جدا را پیاده می‌کنم، هر دو خالص، بدون وابستگی، روی `ImageData`. و بله، تصویر + جدول ذرات را در **IndexedDB** نگه می‌دارم (تصویر در یک store جدا تا لیست تاریخچه سریع بماند). هر دو فایل **مستقل**‌اند و هنوز از `App.tsx` import نشده‌اند → push با **Update Multi** بی‌خطر است و اپ زنده دست نمی‌خورد.


**۱) نقش درست Canny/Sobel (تا گمراه نشوی).** در اپ مرجع هم Canny یک *لایه‌ی نمایش/عیب‌یابی* است، نه موتور شمارش. دلیل فنی: Canny لبه (یک خط نازک دور هر ذره) می‌دهد، نه یک ناحیه‌ی پُر؛ برای شمردن ذره از روی لبه باید контурها را ببندی و پر کنی که روی کپه‌ی فشرده ذاتاً شکننده است. پس معماری درست — همان چیزی که مرجع هم ناخودآگاه انجام داده — این است: **Canny/Sobel = چشمِ عیب‌یاب** (نشان می‌دهد موتور کجا گیج شده)، و **شمارش/جدول = بخش‌بندی robust** (آستانه + morphology + marker‑Watershed که در `vision.ts` v2 ساختیم). من Canny را *واقعی* پیاده می‌کنم تا آن چشم دقیق باشد، ولی وانمود نمی‌کنم که Canny به‌تنهایی ذره می‌شمارد. این تمایز، تفاوت یک demo و یک ابزار قابل‌دفاع است.

**۲) IndexedDB کجا کار می‌کند.** روی سایت منتشرشده‌ات (`https://miladjahani.github.io/...`) پایدار و درست است. روی `file://` (همان‌جا که deploy tool را دابل‌کلیک می‌کنی) نامطمئن است. پس **persist بودن تصویر+جدول را روی سایت github.io تست کن**، نه روی فایل محلی. (deploy tool اصلاً به IDB نیاز ندارد و سمتش نمی‌بریم.)

یک نکته‌ی build هم: چون `npm run build` اول `tsc` را روی کل `src` اجرا می‌کند، این دو فایل type‑check می‌شوند؛ اگر یک خطای تایپی ریز جا مانده باشد، workflow قرمز می‌شود ولی **سایت روی آخرین build سالم می‌ماند** (چون deploy-pages فقط روی موفقیت منتشر می‌کند) و با یک Update One رفع می‌شود. ریسک کنترل‌شده.

---
