// src/vision-screen.tsx — optical analysis. save() persists image+particles+sieve under active session;
// send() only shows the chart (no duplicate DB row). Uses shared uid for a stable record id.
import { useEffect, useRef, useState, type PointerEvent as RPointer } from 'react';
import { Camera, Save, Trash2, BarChart3, Ruler, RefreshCcw, AlertTriangle, Boxes, ScanLine, Eye, Grid3x3, Square } from 'lucide-react';
import { useI18n, type Lang } from './i18n';
import { analyze, imageDataFromImage, makeCalibrationLine, makeCalibrationCircle, makeCalibrationNumeric, maskToImageData, labelsToImageData, buildSieveFromDiameters, type VisionResult, type Calibration } from './vision';
import { edgeDetect, cappedImageBlob, thumbFromImage, type EdgeResult } from './edges';
import { saveScan, type StoredParticle, type StoredStats, type StoredCalibration } from './db';
import { computePSD, type PSDResult } from './psd';
import { uid } from './lib/constants';

type OnResult = (rows: { size: number; weight: number }[], result: PSDResult, source: 'ai' | 'manual', name: string) => void;
interface Props { showGrid: boolean; onResult: OnResult; buzz: (ms?: number) => void; notify: (msg: string) => void; }
type BaseView = 'raw' | 'edges' | 'mask' | 'labels';
type CalMode = 'line' | 'circle' | 'numeric';
type Pt = { x: number; y: number };

const L: Record<Lang, Record<string, string>> = {
  en: { title: 'Optical Granulometry', desc: 'Real Canny/Sobel edges + robust segmentation. Calibrate with a line, a coin/ball, or a number.', upload: 'Upload sample image', hint: 'Spread particles on a flat surface for best accuracy', raw: 'Raw', edges: 'Edges', mask: 'Mask', labels: 'Segments', boxes: 'Bounding boxes', canny: 'Canny', sobel: 'Sobel', cal: 'Scale calibration', line: 'Line', circle: 'Coin / Ball', numeric: 'Numeric', lineHint: 'Drag a line over a known length', circleHint: 'Drag a circle over the coin/ball', numericHint: 'Image width equals (mm)', realLen: 'Real length (mm)', diameter: 'Diameter (mm)', frameMm: 'Frame width (mm)', blur: 'Blur', low: 'Low thr', high: 'High thr', invert: 'Invert', fast: 'Fast', accurate: 'Accurate', count: 'Particles', mean: 'Mean ⌀', d50: 'D50', conf: 'Confidence', highC: 'High', mediumC: 'Medium', lowC: 'Low', notCal: 'Not calibrated — sizes shown in pixels. Set a scale to get mm.', heap: 'Low confidence: likely a packed heap. Spread a single layer for reliable numbers.', table: 'Particle table', id: '#', area: 'Area(px)', ar: 'AR', deq: 'deq', sample: 'Sample name', save: 'Save scan', saved: 'Saved ✓', send: 'Send to report', needCal: 'Calibrate first (need mm) to build a PSD curve.', needMore: 'Need ≥3 measured particles.', clear: 'Clear', px: 'px' },
  fa: { title: 'دانه‌بندی اپتیکی', desc: 'لبه‌یابی واقعی Canny/Sobel + بخش‌بندی مقاوم. با خط، سکه/توپ یا عدد کالیبره کنید.', upload: 'بارگذاری تصویر نمونه', hint: 'برای دقت بهتر ذرات را روی سطح صاف پخش کنید', raw: 'خام', edges: 'لبه', mask: 'ماسک', labels: 'بخش‌ها', boxes: 'کادر محیطی', canny: 'Canny', sobel: 'Sobel', cal: 'کالیبراسیون مقیاس', line: 'خط', circle: 'سکه / توپ', numeric: 'عددی', lineHint: 'روی یک طول معلوم خط بکشید', circleHint: 'دور سکه/توپ دایره بکشید', numericHint: 'عرض تصویر برابر (mm)', realLen: 'طول واقعی (mm)', diameter: 'قطر (mm)', frameMm: 'عرض کادر (mm)', blur: 'محو', low: 'آستانه پایین', high: 'آستانه بالا', invert: 'معکوس', fast: 'سریع', accurate: 'دقیق', count: 'ذرات', mean: 'میانگین ⌀', d50: 'D50', conf: 'اعتماد', highC: 'بالا', mediumC: 'متوسط', lowC: 'پایین', notCal: 'کالیبره نشده — اندازه‌ها بر حسب پیکسل‌اند. برای mm مقیاس بدهید.', heap: 'اعتماد پایین: احتمالاً کپه‌ی فشرده. یک لایه پخش کنید.', table: 'جدول ذرات', id: '#', area: 'مساحت(px)', ar: 'AR', deq: 'deq', sample: 'نام نمونه', save: 'ذخیره اسکن', saved: 'ذخیره شد ✓', send: 'ارسال به گزارش', needCal: 'اول کالیبره کنید (mm لازم است) تا منحنی PSD ساخته شود.', needMore: 'حداقل ۳ ذره‌ی اندازه‌گیری‌شده لازم است.', clear: 'پاک کردن', px: 'px' },
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export default function VisionScreen({ showGrid, onResult, buzz, notify }: Props) {
  const { lang, num } = useI18n();
  const tr = (k: string) => L[lang][k] ?? L.en[k] ?? k;
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [res, setRes] = useState<VisionResult | null>(null);
  const [edge, setEdge] = useState<EdgeResult | null>(null);
  const [baseView, setBaseView] = useState<BaseView>('raw');
  const [edgeMethod, setEdgeMethod] = useState<'canny' | 'sobel'>('canny');
  const [showBoxes, setShowBoxes] = useState(true);
  const [calMode, setCalMode] = useState<CalMode>('line');
  const [calLine, setCalLine] = useState<[Pt, Pt] | null>(null);
  const [calCircle, setCalCircle] = useState<{ c: Pt; r: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [valueMm, setValueMm] = useState('10');
  const [diameterMm, setDiameterMm] = useState('25');
  const [frameMm, setFrameMm] = useState('');
  const [blurR, setBlurR] = useState(2);
  const [low, setLow] = useState(0);
  const [high, setHigh] = useState(0);
  const [invert, setInvert] = useState(false);
  const [pipeline, setPipeline] = useState<'fast' | 'accurate'>('accurate');
  const [minA, setMinA] = useState(40);
  const [sampleName, setSampleName] = useState('');
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const accent = (() => { try { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '0 230 118'; } catch { return '0 230 118'; } })();
  const accentCss = `rgb(${accent})`;

  function currentCal(): Calibration {
    if (calMode === 'line') return calLine ? makeCalibrationLine(dist(calLine[0], calLine[1]), parseFloat(valueMm) || 0) : makeCalibrationLine(0, 0);
    if (calMode === 'circle') return calCircle && calCircle.r > 1 ? makeCalibrationCircle(calCircle.r, parseFloat(diameterMm) || 0) : makeCalibrationCircle(0, 0);
    return makeCalibrationNumeric(res?.width || 0, parseFloat(frameMm) || 0);
  }
  function runEngine() {
    if (!imgEl) return;
    try {
      const data = imageDataFromImage(imgEl, 700); const cal = currentCal();
      setRes(analyze(data, cal, { pipeline, invert, blurRadius: blurR, morphIter: 1, minAreaPx: minA }));
      setEdge(edgeDetect(data, { method: edgeMethod, low: low > 0 ? low : undefined, high: high > 0 ? high : undefined, blurR: 0 }));
      setSaved(false);
    } catch {}
  }
  useEffect(() => { runEngine(); }, [imgEl, edgeMethod, pipeline, invert, blurR, low, high, minA, valueMm, diameterMm, frameMm, calMode]);
  useEffect(() => { draw(); });

  function draw() {
    const cv = canvasRef.current; if (!cv || !res) return;
    cv.width = res.width; cv.height = res.height; const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (baseView === 'raw' && imgEl) ctx.drawImage(imgEl, 0, 0, cv.width, cv.height);
    else if (baseView === 'edges' && edge) ctx.putImageData(edge.view, 0, 0);
    else if (baseView === 'mask') ctx.putImageData(maskToImageData(res.mask, res.width, res.height), 0, 0);
    else if (baseView === 'labels') ctx.putImageData(labelsToImageData(res.labels, res.width, res.height), 0, 0);
    if (showGrid) { ctx.strokeStyle = `rgb(${accent} / 0.18)`; ctx.lineWidth = 1;
      for (let x = 0; x < cv.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); }
      for (let y = 0; y < cv.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); } }
    if (showBoxes) { ctx.strokeStyle = accentCss; ctx.fillStyle = accentCss; ctx.lineWidth = 1; ctx.font = '9px ui-monospace, monospace';
      const list = res.particles.slice(0, 500);
      for (const p of list) { ctx.strokeRect(p.bbox.x + 0.5, p.bbox.y + 0.5, p.bbox.w, p.bbox.h); if (list.length <= 120) ctx.fillText(p.deqMm != null ? p.deqMm.toFixed(1) : p.deqPx.toFixed(0), p.bbox.x + 1, p.bbox.y + 9); } }
    ctx.strokeStyle = '#ffc400'; ctx.fillStyle = '#ffc400'; ctx.lineWidth = 2;
    if (calMode === 'line' && calLine) { ctx.beginPath(); ctx.moveTo(calLine[0].x, calLine[0].y); ctx.lineTo(calLine[1].x, calLine[1].y); ctx.stroke(); for (const p of calLine) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill(); } }
    if (calMode === 'circle' && calCircle) { ctx.beginPath(); ctx.arc(calCircle.c.x, calCircle.c.y, calCircle.r, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(calCircle.c.x, calCircle.c.y, 3, 0, 7); ctx.fill(); }
  }
  function getPos(e: RPointer<HTMLCanvasElement>): Pt { const cv = canvasRef.current!; const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; }
  function onDown(e: RPointer<HTMLCanvasElement>) { if (calMode === 'numeric') return; (e.target as Element).setPointerCapture?.(e.pointerId); const p = getPos(e); setDrawing(true); if (calMode === 'line') setCalLine([p, p]); else setCalCircle({ c: p, r: 0 }); }
  function onMove(e: RPointer<HTMLCanvasElement>) { if (!drawing) return; const p = getPos(e); if (calMode === 'line') setCalLine((c) => (c ? [c[0], p] : null)); else setCalCircle((c) => (c ? { c: c.c, r: dist(c.c, p) } : null)); }
  function onUp() { if (!drawing) return; setDrawing(false); buzz(10); runEngine(); }
  function onFile(f?: File) { if (!f) return; const url = URL.createObjectURL(f); const im = new Image(); im.onload = () => { setImgEl(im); setCalLine(null); setCalCircle(null); setSavedId(null); buzz(12); }; im.src = url; }

  function buildSieveIfCal(): { size: number; weight: number }[] {
    if (!res || !res.stats.calibrated) return [];
    const diams = res.particles.map((p) => p.deqMm).filter((d): d is number => d != null && d > 0);
    return buildSieveFromDiameters(diams);
  }
  async function save(): Promise<string | null> {
    if (!res || !imgEl) return null; buzz(15);
    const id = savedId || uid();
    const particles: StoredParticle[] = res.particles.map((p) => ({ id: p.id, areaPx: p.areaPx, aspectRatio: p.aspectRatio, deqPx: p.deqPx, deqMm: p.deqMm, bbox: p.bbox }));
    const stats: StoredStats = { count: res.stats.count, meanDeqMm: res.stats.meanDeqMm, d50MassMm: res.stats.d50MassMm, d50NumberPx: res.stats.d50NumberPx, meanAspectRatio: res.stats.meanAspectRatio, coverage: res.stats.coverage, confidence: res.stats.confidence, confidenceLabel: res.stats.confidenceLabel, calibrated: res.stats.calibrated };
    const calibration: StoredCalibration = { mode: res.calibration.mode, mmPerPx: res.calibration.mmPerPx };
    const thumb = await thumbFromImage(imgEl).catch(() => null);
    const image = await cappedImageBlob(imgEl).catch(() => null);
    const name = sampleName.trim() || `Vision-${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    const sieve = buildSieveIfCal();
    await saveScan({ id, sampleName: name, source: 'vision', calibration, stats, particles, sieve, thumbBlob: thumb }, image);
    setSavedId(id); setSaved(true); notify(tr('saved'));
    return id;
  }
  async function send() {
    if (!res) return;
    if (!res.stats.calibrated) return notify(tr('needCal'));
    const diams = res.particles.map((p) => p.deqMm).filter((d): d is number => d != null && d > 0);
    if (diams.length < 3) return notify(tr('needMore'));
    if (!savedId) await save(); // persist image+particles+sieve first; onResult only shows the chart (no dup row)
    const sieve = buildSieveFromDiameters(diams); const psd = computePSD(sieve);
    if (!psd) return notify(tr('needMore')); buzz(20);
    onResult(sieve, psd, 'ai', sampleName.trim() || `Vision-${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
  }
  function clearAll() { setImgEl(null); setRes(null); setEdge(null); setCalLine(null); setCalCircle(null); setSaved(false); setSavedId(null); if (fileRef.current) fileRef.current.value = ''; }
  const s = res?.stats; const cal = res?.calibration;

  return (
    <div className="fade-up space-y-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent"><ScanLine size={21} /></div>
        <div><h2 className="text-lg font-black">{tr('title')}</h2><p className="mt-1 text-xs text-zinc-400">{tr('desc')}</p></div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {!imgEl ? (
        <button onClick={() => fileRef.current?.click()} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.02] active:scale-[0.99]">
          <div className="grid h-20 w-20 place-items-center rounded-3xl border border-accent/30 bg-accent/10 text-accent"><Camera size={34} /></div>
          <div className="px-6 text-center"><div className="text-sm font-black">{tr('upload')}</div><div className="mt-1 text-xs text-zinc-500">{tr('hint')}</div></div>
        </button>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-black">
            <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="block w-full touch-none select-none" style={{ cursor: calMode === 'numeric' ? 'default' : 'crosshair' }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              {([['raw', tr('raw'), Eye], ['edges', tr('edges'), ScanLine], ['mask', tr('mask'), Square], ['labels', tr('labels'), Grid3x3]] as const).map(([k, lab, Ic]) => (
                <button key={k} onClick={() => { setBaseView(k as BaseView); buzz(6); }} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold ${baseView === k ? 'bg-accent text-ink-950' : 'text-zinc-400'}`}><Ic size={15} />{lab}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              <button onClick={() => { setEdgeMethod('canny'); setBaseView('edges'); buzz(6); }} className={`rounded-xl py-2 text-xs font-bold ${edgeMethod === 'canny' && baseView === 'edges' ? 'bg-accent text-ink-950' : 'text-zinc-400'}`}>{tr('canny')}</button>
              <button onClick={() => { setEdgeMethod('sobel'); setBaseView('edges'); buzz(6); }} className={`rounded-xl py-2 text-xs font-bold ${edgeMethod === 'sobel' && baseView === 'edges' ? 'bg-accent text-ink-950' : 'text-zinc-400'}`}>{tr('sobel')}</button>
            </div>
          </div>
          <button onClick={() => { setShowBoxes((v) => !v); buzz(6); }} className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold ${showBoxes ? 'border-accent/50 bg-accent/10 text-accent' : 'border-white/10 text-zinc-400'}`}><Boxes size={15} />{tr('boxes')}</button>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-black"><Ruler size={14} className="text-accent" />{tr('cal')}</div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-900/60 p-1 text-[11px] font-bold">
              {([['line', tr('line')], ['circle', tr('circle')], ['numeric', tr('numeric')]] as const).map(([k, lab]) => (
                <button key={k} onClick={() => { setCalMode(k as CalMode); buzz(6); }} className={`rounded-lg py-2 ${calMode === k ? 'bg-accent text-ink-950' : 'text-zinc-400'}`}>{lab}</button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">{calMode === 'line' ? tr('lineHint') : calMode === 'circle' ? tr('circleHint') : tr('numericHint')}</p>
            <div className="mt-2">
              {calMode === 'line' && <label className="block text-[11px] text-zinc-400">{tr('realLen')}<input value={valueMm} onChange={(e) => setValueMm(e.target.value)} inputMode="decimal" dir="ltr" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 text-sm font-bold" /></label>}
              {calMode === 'circle' && <label className="block text-[11px] text-zinc-400">{tr('diameter')}<input value={diameterMm} onChange={(e) => setDiameterMm(e.target.value)} inputMode="decimal" dir="ltr" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 text-sm font-bold" /></label>}
              {calMode === 'numeric' && <label className="block text-[11px] text-zinc-400">{tr('frameMm')}<input value={frameMm} onChange={(e) => setFrameMm(e.target.value)} inputMode="decimal" dir="ltr" placeholder="100" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 text-sm font-bold" /></label>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-[11px]">
            <div className="grid grid-cols-2 gap-3">
              <Slider label={tr('blur')} value={blurR} min={0} max={6} onChange={setBlurR} />
              <Slider label={tr('high')} value={high} min={0} max={255} onChange={setHigh} />
              <Slider label={tr('low')} value={low} min={0} max={255} onChange={setLow} />
              <Slider label="min px" value={minA} min={5} max={400} onChange={setMinA} />
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setInvert((v) => !v); buzz(6); }} className={`flex-1 rounded-xl border py-2 font-bold ${invert ? 'border-accent/50 bg-accent/10 text-accent' : 'border-white/10 text-zinc-400'}`}>{tr('invert')}</button>
              <button onClick={() => { setPipeline('fast'); buzz(6); }} className={`flex-1 rounded-xl border py-2 font-bold ${pipeline === 'fast' ? 'border-accent/50 bg-accent/10 text-accent' : 'border-white/10 text-zinc-400'}`}>{tr('fast')}</button>
              <button onClick={() => { setPipeline('accurate'); buzz(6); }} className={`flex-1 rounded-xl border py-2 font-bold ${pipeline === 'accurate' ? 'border-accent/50 bg-accent/10 text-accent' : 'border-white/10 text-zinc-400'}`}>{tr('accurate')}</button>
            </div>
          </div>
          {s && (
            <>
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold ${s.confidenceLabel === 'low' ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : s.confidenceLabel === 'medium' ? 'border-white/15 bg-white/5 text-zinc-300' : 'border-accent/40 bg-accent/10 text-accent'}`}>
                <AlertTriangle size={14} />{tr('conf')}: {s.confidenceLabel === 'high' ? tr('highC') : s.confidenceLabel === 'medium' ? tr('mediumC') : tr('lowC')} — {s.confidenceReasons.join(', ')}
              </div>
              {(!cal || cal.mmPerPx <= 0) && <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[11px] font-bold text-sky-300">{tr('notCal')}</div>}
              {s.confidenceLabel === 'low' && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] font-bold text-amber-300">{tr('heap')}</div>}
              <div className="grid grid-cols-3 gap-3">
                <Kpi label={tr('count')} value={num(s.count)} color="#22d3ee" />
                <Kpi label={tr('mean')} value={s.calibrated && s.meanDeqMm != null ? s.meanDeqMm.toFixed(2) : s.meanDeqPx.toFixed(0)} unit={s.calibrated ? 'mm' : tr('px')} color={accentCss} />
                <Kpi label={tr('d50')} value={s.calibrated && s.d50MassMm != null ? s.d50MassMm.toFixed(2) : s.d50NumberPx != null ? s.d50NumberPx.toFixed(0) : '—'} unit={s.calibrated ? 'mm' : tr('px')} color="#ffc400" />
              </div>
            </>
          )}
          {res && res.particles.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
              <div className="px-3 py-2 text-sm font-black">{tr('table')}</div>
              <div dir="ltr" className="max-h-64 overflow-auto">
                <table className="w-full text-center text-xs tabular-nums">
                  <thead><tr className="bg-white/5 text-[10px] uppercase text-zinc-500"><th className="px-2 py-2">{tr('id')}</th><th className="px-2 py-2">{tr('area')}</th><th className="px-2 py-2">{tr('ar')}</th><th className="px-2 py-2 text-accent">{tr('deq')}</th></tr></thead>
                  <tbody>{res.particles.slice(0, 60).map((p) => (
                    <tr key={p.id} className="border-t border-white/5"><td className="px-2 py-1.5 text-zinc-500">{p.id}</td><td className="px-2 py-1.5 text-zinc-400">{p.areaPx}</td><td className="px-2 py-1.5 text-zinc-400">{p.aspectRatio.toFixed(2)}</td><td className="px-2 py-1.5 font-bold text-accent">{p.deqMm != null ? p.deqMm.toFixed(2) : p.deqPx.toFixed(0)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          <label className="block text-[11px] text-zinc-400">{tr('sample')}<input value={sampleName} onChange={(e) => setSampleName(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 text-sm font-bold" /></label>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { save(); }} disabled={!res} className="flex min-h-[54px] items-center justify-center gap-2 rounded-2xl border-2 border-[#ffc400]/70 bg-[#ffc400]/10 text-[13px] font-black text-[#ffc400] disabled:opacity-40 active:scale-[0.98]"><Save size={18} />{saved ? tr('saved') : tr('save')}</button>
            <button onClick={() => { send(); }} disabled={!res} className="flex min-h-[54px] items-center justify-center gap-2 rounded-2xl bg-accent text-[13px] font-black text-ink-950 shadow-glow disabled:opacity-40 active:scale-[0.98]"><BarChart3 size={18} />{tr('send')}</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => fileRef.current?.click()} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-bold text-zinc-300 active:scale-95"><RefreshCcw size={14} />{tr('upload')}</button>
            <button onClick={clearAll} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-bold text-zinc-500 active:scale-95"><Trash2 size={14} />{tr('clear')}</button>
          </div>
        </>
      )}
    </div>
  );
}
function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (<label className="block"><span className="flex justify-between text-zinc-400"><span>{label}</span><span dir="ltr" className="text-zinc-300">{value || 'auto'}</span></span><input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="mt-1 w-full" /></label>);
}
function Kpi({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500">{label}</div><div className="mt-1 text-lg font-black tabular-nums" style={color ? { color } : undefined}>{value}{unit && <span className="ms-1 text-[10px] text-zinc-500">{unit}</span>}</div></div>);
}
