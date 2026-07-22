import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BarChart3,
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  FolderOpen,
  Info,
  Layers,
  Mountain,
  PenLine,
  Plus,
  RefreshCcw,
  ScanLine,
  Settings,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { LanguageProvider, useI18n, jalali, greg, type TKey } from './i18n';
import {
  computePSD,
  generateMockSieveData,
  classify,
  fmtSize,
  STANDARD_SIEVES,
  type PSDResult,
  type SieveInput,
} from './psd';
import { exportExcel, exportPDF, type ReportMeta, type ReportStrings } from './exporters';

/* ============================== types & helpers ============================== */

type Tab = 'visual' | 'manual' | 'reports' | 'settings';
type HandleResult = (rows: SieveInput[], result: PSDResult, source: 'ai' | 'manual', name: string) => void;
type Buzz = (ms?: number) => void;
type Notify = (msg: string) => void;

interface AnalysisRecord {
  id: string;
  sampleName: string;
  source: 'ai' | 'manual';
  createdAt: number;
  rows: SieveInput[];
  result: PSDResult;
}

type AccentId = 'green' | 'yellow' | 'cyan';
const ACCENTS: { id: AccentId; rgb: string; hex: string }[] = [
  { id: 'green', rgb: '0 230 118', hex: '#00e676' },
  { id: 'yellow', rgb: '255 196 0', hex: '#ffc400' },
  { id: 'cyan', rgb: '34 211 238', hex: '#22d3ee' },
];

interface SettingsState {
  accent: AccentId;
  grid: boolean;
  haptics: boolean;
}
const DEFAULT_SETTINGS: SettingsState = { accent: 'green', grid: true, haptics: true };

const uid = () => Math.random().toString(36).slice(2, 10);

function loadSettings(): SettingsState {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('psd-settings') || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
function loadHistory(): AnalysisRecord[] {
  try {
    return JSON.parse(localStorage.getItem('psd-history') || '[]');
  } catch {
    return [];
  }
}

const inputCls =
  'h-12 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 text-base font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-accent focus:ring-2 focus:ring-accent/25';

/* ============================== shared UI ============================== */

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

function ScreenTitle({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
        <Icon size={21} />
      </div>
      <div>
        <h2 className="text-lg font-black leading-tight">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{desc}</p>
      </div>
    </div>
  );
}

function KPI({
  label,
  sub,
  value,
  unit,
  color,
}: {
  label: string;
  sub?: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  const { num } = useI18n();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl">
      {color && (
        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      )}
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums" style={color ? { color } : undefined}>
        {num(value)}
        {unit && <span className="ms-1 text-[11px] font-bold text-zinc-500">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}

/* ============================== header & nav ============================== */

function Header() {
  const { t, lang, setLang, isFa } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/40 bg-accent/10 shadow-glow">
            <Mountain className="h-6 w-6 text-accent" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black leading-tight">{t('appName')}</h1>
            <p className="truncate text-[11px] text-zinc-400">
              <span dir="ltr">{isFa ? jalali() : greg()}</span>
              <span className="mx-1.5 opacity-40">•</span>
              <span dir="ltr">{isFa ? greg() : jalali()}</span>
            </p>
          </div>
        </div>
        {/* Language toggle */}
        <div className="flex shrink-0 rounded-full border border-white/15 bg-white/5 p-1 text-xs font-black">
          <button
            onClick={() => setLang('en')}
            aria-pressed={lang === 'en'}
            className={`rounded-full px-3.5 py-1.5 transition ${
              lang === 'en' ? 'bg-accent text-ink-950 shadow-glow' : 'text-zinc-400'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLang('fa')}
            aria-pressed={lang === 'fa'}
            className={`rounded-full px-3.5 py-1.5 transition ${
              lang === 'fa' ? 'bg-accent text-ink-950 shadow-glow' : 'text-zinc-400'
            }`}
          >
            FA
          </button>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ tab, setTab, buzz }: { tab: Tab; setTab: (t: Tab) => void; buzz: Buzz }) {
  const { t } = useI18n();
  const tabs = [
    { id: 'visual' as Tab, icon: ScanLine, label: t('tabVisual') },
    { id: 'manual' as Tab, icon: PenLine, label: t('tabManual') },
    { id: 'reports' as Tab, icon: BarChart3, label: t('tabReports') },
    { id: 'settings' as Tab, icon: Settings, label: t('tabSettings') },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/85 backdrop-blur-2xl">
      <div className="mx-auto grid w-full max-w-2xl grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ id, icon: Icon, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => {
                buzz(8);
                setTab(id);
              }}
              className="relative flex min-h-[68px] flex-col items-center justify-center gap-1.5"
            >
              {active && <span className="absolute top-0 h-[3px] w-10 rounded-b-full bg-accent shadow-glow" />}
              <Icon
                size={22}
                strokeWidth={active ? 2.4 : 2}
                className={active ? 'text-accent drop-shadow-[0_0_8px_rgb(var(--accent)/0.8)]' : 'text-zinc-500'}
              />
              <span className={`text-[10px] font-bold ${active ? 'text-accent' : 'text-zinc-500'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ============================== chart ============================== */

function PSDTooltip({ active, payload, accent }: any) {
  const { t, num } = useI18n();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/15 bg-ink-900/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <div className="font-bold text-zinc-300">
        {t('sieveSize')}: <span dir="ltr">{p.size} mm</span>
      </div>
      <div className="mt-1 font-black" style={{ color: accent }}>
        {t('percentPassing')}: {num(p.passing.toFixed(1))}%
      </div>
    </div>
  );
}

function PSDChart({ res, accent }: { res: PSDResult; accent: string }) {
  return (
    /* Charts stay LTR even in Persian mode — standard engineering convention */
    <div dir="ltr" className="mt-2">
      <ResponsiveContainer width="100%" height={290}>
        <AreaChart data={res.points} margin={{ top: 16, right: 10, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="psdFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.42} />
              <stop offset="100%" stopColor={accent} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <XAxis
            dataKey="size"
            type="number"
            scale="log"
            domain={['dataMin', 'dataMax']}
            ticks={res.points.map((p) => p.size)}
            tickFormatter={(v: number) => String(v)}
            tick={{ fontSize: 9.5, fill: '#79839a' }}
            stroke="rgba(255,255,255,0.15)"
            angle={-40}
            textAnchor="end"
            height={44}
            interval={0}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            tick={{ fontSize: 10, fill: '#79839a' }}
            stroke="rgba(255,255,255,0.15)"
            width={34}
          />
          <Tooltip content={<PSDTooltip accent={accent} />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeDasharray: '4 4' }} />
          {res.d80 != null && (
            <ReferenceLine x={res.d80} stroke="#22d3ee" strokeDasharray="5 4"
              label={{ value: 'D80', position: 'insideTopRight', fill: '#22d3ee', fontSize: 10, fontWeight: 700 }} />
          )}
          {res.d50 != null && (
            <ReferenceLine x={res.d50} stroke={accent} strokeDasharray="5 4"
              label={{ value: 'D50', position: 'insideTopRight', fill: accent, fontSize: 10, fontWeight: 700 }} />
          )}
          {res.d10 != null && (
            <ReferenceLine x={res.d10} stroke="#ffc400" strokeDasharray="5 4"
              label={{ value: 'D10', position: 'insideTopRight', fill: '#ffc400', fontSize: 10, fontWeight: 700 }} />
          )}
          <Area
            type="monotone"
            dataKey="passing"
            stroke={accent}
            strokeWidth={3}
            fill="url(#psdFill)"
            dot={{ r: 3.5, fill: accent, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================== Visual AI screen ============================== */

function VisualScreen({
  showGrid,
  onResult,
  buzz,
}: {
  showGrid: boolean;
  onResult: HandleResult;
  buzz: Buzz;
  notify: Notify;
}) {
  const { t, num } = useI18n();
  const [img, setImg] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [mock, setMock] = useState<{ rows: SieveInput[]; res: PSDResult } | null>(null);
  const [stats, setStats] = useState({ particles: 0, conf: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setImg(URL.createObjectURL(f));
    setPhase('idle');
    setProgress(0);
    setMock(null);
    buzz(10);
  };

  const startScan = () => {
    buzz(20);
    setPhase('scanning');
    setProgress(0);
    const t0 = performance.now();
    timer.current = window.setInterval(() => {
      const p = Math.min(100, ((performance.now() - t0) / 3000) * 100); // 3-second simulated scan
      setProgress(p);
      if (p >= 100) {
        window.clearInterval(timer.current);
        const rows = generateMockSieveData();
        const res = computePSD(rows)!;
        setMock({ rows, res });
        setStats({ particles: 1120 + Math.floor(Math.random() * 300), conf: 90 + Math.random() * 7 });
        setPhase('done');
        buzz(35);
      }
    }, 60);
  };

  const stage = Math.min(3, Math.floor(progress / 25));

  return (
    <div className="fade-up space-y-4">
      <ScreenTitle icon={ScanLine} title={t('visualTitle')} desc={t('visualDesc')} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />

      {!img ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.02] transition hover:border-accent/60 hover:bg-accent/[0.04] active:scale-[0.99]"
        >
          <div className="grid h-20 w-20 place-items-center rounded-3xl border border-accent/30 bg-accent/10 text-accent shadow-glow">
            <Camera size={34} />
          </div>
          <div className="px-6 text-center">
            <div className="text-sm font-black">{t('uploadTitle')}</div>
            <div className="mt-1 text-xs text-zinc-500">{t('uploadHint')}</div>
          </div>
        </button>
      ) : (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/15 bg-black shadow-2xl">
          <img src={img} alt="sample" className="h-full w-full object-cover" />
          {showGrid && <div className="scan-grid pointer-events-none absolute inset-0" />}
          <span className="pointer-events-none absolute bottom-2.5 start-2.5 h-6 w-6 rounded-es-lg border-b-[3px] border-s-[3px] border-accent" />
          <span className="pointer-events-none absolute bottom-2.5 end-2.5 h-6 w-6 rounded-ee-lg border-b-[3px] border-e-[3px] border-accent" />
          <span className="pointer-events-none absolute top-2.5 start-2.5 h-6 w-6 rounded-ss-lg border-t-[3px] border-s-[3px] border-accent" />
          <span className="pointer-events-none absolute top-2.5 end-2.5 h-6 w-6 rounded-se-lg border-t-[3px] border-e-[3px] border-accent" />
          {phase === 'scanning' && (
            <>
              <div className="scan-line" />
              <div className="absolute inset-0 bg-ink-950/25" />
            </>
          )}
          {phase === 'done' && (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-2xl border border-accent/40 bg-ink-950/85 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-black text-accent">
                <CheckCircle2 size={17} /> {t('scanDone')}
              </div>
              <div className="flex gap-3 text-[10px] font-bold text-zinc-400">
                <span>
                  {t('particlesDetected')}: <b dir="ltr" className="text-zinc-100">{num(stats.particles.toLocaleString('en-US'))}</b>
                </span>
                <span>
                  {t('confidence')}: <b dir="ltr" className="text-accent">{num(stats.conf.toFixed(1))}%</b>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {img && phase === 'idle' && (
        <div className="space-y-2">
          <button
            onClick={startScan}
            className="scan-btn flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl text-base font-black text-ink-950 transition active:scale-[0.98]"
          >
            <Sparkles size={20} strokeWidth={2.5} /> {t('startScan')}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-bold text-zinc-300 active:scale-[0.98]"
          >
            <RefreshCcw size={15} /> {t('rescan')}
          </button>
        </div>
      )}

      {phase === 'scanning' && (
        <Card className="border-accent/30 bg-accent/[0.06]">
          <div className="flex items-center justify-between text-xs font-black">
            <span className="flex items-center gap-2 text-accent">
              <span className="h-2 w-2 animate-ping rounded-full bg-accent" />
              {t(('stage' + stage) as TKey)}
            </span>
            <span dir="ltr" className="tabular-nums text-zinc-400">{Math.round(progress)}%</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent shadow-glow transition-[width] duration-100" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      )}

      {phase === 'done' && mock && (
        <div className="space-y-2">
          <button
            onClick={() =>
              onResult(
                mock.rows,
                mock.res,
                'ai',
                `AI-${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
              )
            }
            className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-black text-ink-950 shadow-glow transition active:scale-[0.98]"
          >
            <BarChart3 size={20} strokeWidth={2.5} /> {t('viewResults')}
          </button>
          <button
            onClick={() => { setImg(null); setPhase('idle'); setMock(null); }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-bold text-zinc-300 active:scale-[0.98]"
          >
            <RefreshCcw size={15} /> {t('rescan')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================== Manual entry screen ============================== */

interface UiRow { id: string; size: string; weight: string; }

function ManualScreen({ onResult, buzz, notify }: { onResult: HandleResult; buzz: Buzz; notify: Notify }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<UiRow[]>(() =>
    Array.from({ length: 5 }, () => ({ id: uid(), size: '', weight: '' }))
  );

  const parsed = rows
    .map((r) => ({ size: parseFloat(r.size), weight: parseFloat(r.weight) }))
    .filter((r) => isFinite(r.size) && r.size > 0 && isFinite(r.weight) && r.weight >= 0);
  const total = parsed.reduce((s, r) => s + r.weight, 0);
  const canGen = parsed.length >= 2 && total > 0;

  const update = (id: string, key: 'size' | 'weight', v: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: v } : r)));
  const remove = (id: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  const add = () => { buzz(8); setRows((rs) => [...rs, { id: uid(), size: '', weight: '' }]); };
  const loadStd = () => { buzz(8); setRows(STANDARD_SIEVES.map((s) => ({ id: uid(), size: String(s), weight: '' }))); };
  const clear = () => {
    buzz(8);
    setRows(Array.from({ length: 5 }, () => ({ id: uid(), size: '', weight: '' })));
    setName('');
  };

  const generate = () => {
    if (!canGen) return notify(t('needMoreRows'));
    const res = computePSD(parsed);
    if (!res) return notify(t('needMoreRows'));
    buzz(25);
    onResult(parsed, res, 'manual', name.trim() || `${t('sourceManual')} #${Math.floor(Math.random() * 900 + 100)}`);
  };

  return (
    <div className="fade-up space-y-4">
      <ScreenTitle icon={PenLine} title={t('manualTitle')} desc={t('manualDesc')} />

      <Card>
        <label className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-500">{t('sampleName')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('samplePlaceholder')} className={`${inputCls} mt-1.5`} />
      </Card>

      <Card>
        <div className="grid grid-cols-[1fr_1fr_44px] gap-2 pb-2 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
          <span>{t('sieveSize')}</span>
          <span>{t('weightRetained')}</span>
          <span />
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_1fr_44px] items-center gap-2">
              <input dir="ltr" type="number" inputMode="decimal" step="any" min="0" value={r.size}
                onChange={(e) => update(r.id, 'size', e.target.value)} placeholder="4.75" className={inputCls} />
              <input dir="ltr" type="number" inputMode="decimal" step="any" min="0" value={r.weight}
                onChange={(e) => update(r.id, 'weight', e.target.value)} placeholder="0" className={inputCls} />
              <button
                onClick={() => { buzz(8); remove(r.id); }}
                aria-label="remove row"
                className="grid h-12 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-500 transition hover:border-red-400/40 hover:text-red-400 active:scale-95"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={add} className="flex h-11 items-center gap-1.5 rounded-xl border border-dashed border-accent/50 px-3.5 text-xs font-bold text-accent transition hover:bg-accent/10 active:scale-95">
            <Plus size={15} strokeWidth={3} /> {t('addRow')}
          </button>
          <button onClick={loadStd} className="flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-bold text-zinc-300 transition hover:bg-white/10 active:scale-95">
            <FlaskConical size={15} /> {t('loadStandard')}
          </button>
          <button onClick={clear} className="flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-bold text-zinc-500 transition hover:text-red-400 active:scale-95">
            <X size={15} /> {t('clearAll')}
          </button>
        </div>
      </Card>

      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <span className="text-xs font-bold text-zinc-400">{t('totalMass')}</span>
        <span dir="ltr" className="text-lg font-black tabular-nums text-accent">
          {total > 0 ? total.toLocaleString('en', { maximumFractionDigits: 1 }) : '0'}{' '}
          <span className="text-xs text-zinc-500">{t('grams')}</span>
        </span>
      </div>

      <button
        onClick={generate}
        disabled={!canGen}
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-black text-ink-950 shadow-glow transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
      >
        <Activity size={20} strokeWidth={2.6} /> {t('generateCurve')}
      </button>
    </div>
  );
}

/* ============================== Reports screen ============================== */

function ReportsScreen({
  record,
  history,
  accent,
  onLoad,
  onDelete,
  onNavigate,
  buzz,
  notify,
}: {
  record: AnalysisRecord | null;
  history: AnalysisRecord[];
  accent: string;
  onLoad: (r: AnalysisRecord) => void;
  onDelete: (id: string) => void;
  onNavigate: (t: Tab) => void;
  buzz: Buzz;
  notify: Notify;
}) {
  const { t, num, isFa } = useI18n();

  if (!record) {
    return (
      <div className="fade-up space-y-4">
        <ScreenTitle icon={BarChart3} title={t('reportsTitle')} desc={t('noDataHint')} />
        <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-3xl border border-accent/25 bg-accent/5 text-accent">
            <FlaskConical size={34} />
          </div>
          <div>
            <div className="text-base font-black">{t('noData')}</div>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">{t('noDataHint')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onNavigate('visual')} className="h-12 rounded-xl bg-accent px-5 text-sm font-black text-ink-950 shadow-glow active:scale-95">
              {t('tabVisual')}
            </button>
            <button onClick={() => onNavigate('manual')} className="h-12 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-bold text-zinc-200 active:scale-95">
              {t('tabManual')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const r = record.result;
  const grad = classify(r);
  const gradKey: TKey = grad === 'well' ? 'wellGraded' : grad === 'uniform' ? 'uniformGraded' : 'gapGraded';

  const L: ReportStrings = {
    psd: t('psdChart'), sample: t('sampleName'), date: t('date'), sourceLabel: t('sourceLabel'),
    sieve: t('sieveSize'), weight: t('colRetained'), retPct: t('colRetPct'), cumRet: t('colCumRet'), passing: t('colPassing'),
    eff: t('effectiveSize'), med: t('medianSize'), coarse: t('coarseSize'),
    grad: t('gradation'), gradVal: t(gradKey),
  };
  const meta: ReportMeta = {
    sampleName: record.sampleName,
    source: record.source === 'ai' ? t('sourceAI') : t('sourceManual'),
    dateJalali: jalali(record.createdAt),
    dateGreg: greg(record.createdAt),
    lang: isFa ? 'fa' : 'en',
  };

  return (
    <div className="fade-up space-y-4">
      <ScreenTitle icon={BarChart3} title={t('reportsTitle')} desc={t('psdChart')} />

      <Card className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            {record.source === 'ai' ? <ScanLine size={20} /> : <PenLine size={20} />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{record.sampleName}</div>
            <div className="truncate text-[11px] text-zinc-500">
              {record.source === 'ai' ? t('sourceAI') : t('sourceManual')} • {num(jalali(record.createdAt))} • {greg(record.createdAt)}
            </div>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-accent">
          {t(gradKey)}
        </span>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <KPI label="D10" sub={t('effectiveSize')} value={fmtSize(r.d10)} unit="mm" color="#ffc400" />
        <KPI label="D50" sub={t('medianSize')} value={fmtSize(r.d50)} unit="mm" color={accent} />
        <KPI label="D80" sub={t('coarseSize')} value={fmtSize(r.d80)} unit="mm" color="#22d3ee" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Cu" sub={t('uniformity')} value={r.cu != null ? r.cu.toFixed(2) : '—'} />
        <KPI label="Cc" sub={t('curvature')} value={r.cc != null ? r.cc.toFixed(2) : '—'} />
        <KPI label={t('gradation')} value={t(gradKey)} color={grad === 'well' ? accent : '#ffc400'} />
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black">{t('psdChart')}</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t('percentPassing')}</span>
        </div>
        <PSDChart res={r} accent={accent} />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="px-4 pb-2 pt-4 text-sm font-black">{t('dataTable')}</div>
        <div dir="ltr" className="overflow-x-auto">
          <table className="w-full min-w-[430px] text-center text-xs tabular-nums">
            <thead>
              <tr className="bg-white/5 text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-2 py-2.5">{t('sieveSize')}</th>
                <th className="px-2 py-2.5">{t('colRetained')}</th>
                <th className="px-2 py-2.5">{t('colRetPct')}</th>
                <th className="px-2 py-2.5">{t('colCumRet')}</th>
                <th className="px-2 py-2.5 text-accent">{t('colPassing')}</th>
              </tr>
            </thead>
            <tbody>
              {[...r.points].reverse().map((p, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="px-2 py-2 font-bold text-zinc-200">{p.size}</td>
                  <td className="px-2 py-2 text-zinc-400">{p.weight.toFixed(1)}</td>
                  <td className="px-2 py-2 text-zinc-400">{p.retained.toFixed(1)}</td>
                  <td className="px-2 py-2 text-zinc-400">{p.cumRetained.toFixed(1)}</td>
                  <td className="px-2 py-2 font-black text-accent">{p.passing.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div>
        <h3 className="mb-2 px-1 text-sm font-black">{t('exportTitle')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { buzz(15); if (!exportPDF(r, meta, L)) notify('Popup blocked — allow popups.'); }}
            className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-[#ffc400]/70 bg-[#ffc400]/10 px-2 text-center text-[11px] font-black leading-tight text-[#ffc400] transition active:scale-[0.97]"
          >
            <FileText size={20} /> {t('downloadPDF')}
          </button>
          <button
            onClick={() => { buzz(15); exportExcel(r, meta, L); notify(`${t('exportExcel')} ✓`); }}
            className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl bg-accent px-2 text-center text-[11px] font-black leading-tight text-ink-950 shadow-glow transition active:scale-[0.97]"
          >
            <FileSpreadsheet size={20} /> {t('exportExcel')}
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <h3 className="mb-2 px-1 text-sm font-black">
            {t('history')} <span className="text-zinc-500">({num(history.length)})</span>
          </h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                  h.id === record.id ? 'border-accent/50 bg-accent/5' : 'border-white/10 bg-white/[0.03]'
                }`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-accent">
                  {h.source === 'ai' ? <ScanLine size={17} /> : <PenLine size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{h.sampleName}</div>
                  <div className="truncate text-[11px] text-zinc-500">
                    {h.source === 'ai' ? t('sourceAI') : t('sourceManual')} • {num(jalali(h.createdAt))} • D50 {fmtSize(h.result.d50)} mm
                  </div>
                </div>
                <button onClick={() => onLoad(h)} aria-label={t('load')}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-zinc-300 transition hover:border-accent/50 hover:text-accent active:scale-90">
                  <FolderOpen size={16} />
                </button>
                <button onClick={() => onDelete(h.id)} aria-label={t('delete')}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-zinc-500 transition hover:border-red-400/50 hover:text-red-400 active:scale-90">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== Settings screen ============================== */

function ToggleRow({ label, icon: Icon, checked, onChange }: { label: string; icon: any; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5 text-sm font-bold text-zinc-200">
        <Icon size={16} className="text-accent" /> {label}
      </div>
      <button
        onClick={onChange}
        role="switch"
        aria-checked={checked}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? 'bg-accent shadow-glow' : 'bg-white/10'}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'start-[30px]' : 'start-1'}`} />
      </button>
    </div>
  );
}

function SettingsScreen({
  settings,
  setSettings,
  onClearHistory,
  buzz,
}: {
  settings: SettingsState;
  setSettings: Dispatch<SetStateAction<SettingsState>>;
  onClearHistory: () => void;
  buzz: Buzz;
}) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="fade-up space-y-4">
      <ScreenTitle icon={Settings} title={t('settingsTitle')} desc={t('appTagline')} />

      <Card>
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-zinc-500">{t('language')}</div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-ink-900/60 p-1">
          <button onClick={() => { buzz(10); setLang('en'); }}
            className={`h-12 rounded-xl text-sm font-black transition ${lang === 'en' ? 'bg-accent text-ink-950 shadow-glow' : 'text-zinc-400'}`}>
            English
          </button>
          <button onClick={() => { buzz(10); setLang('fa'); }}
            className={`h-12 rounded-xl text-sm font-black transition ${lang === 'fa' ? 'bg-accent text-ink-950 shadow-glow' : 'text-zinc-400'}`}>
            فارسی
          </button>
        </div>
      </Card>

      <Card>
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-zinc-500">{t('accentColor')}</div>
        <div className="grid grid-cols-3 gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => { buzz(10); setSettings((s) => ({ ...s, accent: a.id })); }}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition active:scale-95 ${
                settings.accent === a.id ? 'border-white/70' : 'border-white/10'
              }`}
              style={{ background: `linear-gradient(140deg, ${a.hex}22, transparent 65%)` }}
            >
              <span className="h-7 w-7 rounded-full border-2 border-white/20" style={{ background: a.hex, boxShadow: `0 0 14px ${a.hex}` }} />
              <span className="text-[10px] font-bold text-zinc-300">
                {a.id === 'green' ? t('neonGreen') : a.id === 'yellow' ? t('safetyYellow') : t('plasmaCyan')}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-1">
        <ToggleRow label={t('scannerGrid')} icon={Layers} checked={settings.grid}
          onChange={() => { buzz(8); setSettings((s) => ({ ...s, grid: !s.grid })); }} />
        <div className="h-px bg-white/5" />
        <ToggleRow label={t('haptics')} icon={Zap} checked={settings.haptics}
          onChange={() => setSettings((s) => ({ ...s, haptics: !s.haptics }))} />
      </Card>

      <Card>
        <button onClick={() => { buzz(15); onClearHistory(); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/5 py-3.5 text-sm font-bold text-red-400 transition active:scale-[0.98]">
          <Trash2 size={16} /> {t('clearHistory')}
        </button>
      </Card>

      <Card>
        <div className="flex items-center gap-2 text-sm font-black">
          <Info size={15} className="text-accent" /> {t('about')}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">{t('aboutText')}</p>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-[11px] text-zinc-500">
          <span>{t('version')}</span>
          <span dir="ltr" className="font-bold text-zinc-300">v1.0.0 • PWA</span>
        </div>
      </Card>
    </div>
  );
}

/* ============================== shell ============================== */

function Shell() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('visual');
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [current, setCurrent] = useState<AnalysisRecord | null>(null);
  const [history, setHistory] = useState<AnalysisRecord[]>(loadHistory);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', ACCENTS.find((a) => a.id === settings.accent)!.rgb);
    try { localStorage.setItem('psd-settings', JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);

  const buzz = useCallback(
    (ms = 12) => { if (settings.haptics && 'vibrate' in navigator) navigator.vibrate(ms); },
    [settings.haptics]
  );
  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const handleResult: HandleResult = (rows, result, source, sampleName) => {
    const rec: AnalysisRecord = { id: uid(), sampleName, source, createdAt: Date.now(), rows, result };
    setCurrent(rec);
    setHistory((h) => {
      const nh = [rec, ...h].slice(0, 25);
      try { localStorage.setItem('psd-history', JSON.stringify(nh)); } catch { /* ignore */ }
      return nh;
    });
    setTab('reports');
    notify(t('savedToast'));
  };

  const loadRec = (rec: AnalysisRecord) => { setCurrent(rec); setTab('reports'); buzz(10); };
  const delRec = (id: string) => {
    setHistory((h) => {
      const nh = h.filter((x) => x.id !== id);
      try { localStorage.setItem('psd-history', JSON.stringify(nh)); } catch { /* ignore */ }
      return nh;
    });
    if (current?.id === id) setCurrent(null);
    notify(t('deletedToast'));
  };
  const clearHistory = () => {
    setHistory([]);
    setCurrent(null);
    try { localStorage.removeItem('psd-history'); } catch { /* ignore */ }
    notify(t('historyCleared'));
  };

  const accentHex = ACCENTS.find((a) => a.id === settings.accent)!.hex;

  return (
    <div className="min-h-dvh bg-ink-950 text-zinc-100">
      {/* ambient gradient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-36 start-1/4 h-80 w-80 rounded-full opacity-[0.13] blur-3xl" style={{ background: accentHex }} />
        <div className="absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-[#ffc400] opacity-[0.07] blur-3xl" />
      </div>

      <Header />

      <main className="relative mx-auto w-full max-w-2xl px-4 pb-36 pt-5">
        {tab === 'visual' && <VisualScreen showGrid={settings.grid} onResult={handleResult} buzz={buzz} notify={notify} />}
        {tab === 'manual' && <ManualScreen onResult={handleResult} buzz={buzz} notify={notify} />}
        {tab === 'reports' && (
          <ReportsScreen record={current} history={history} accent={accentHex}
            onLoad={loadRec} onDelete={delRec} onNavigate={setTab} buzz={buzz} notify={notify} />
        )}
        {tab === 'settings' && (
          <SettingsScreen settings={settings} setSettings={setSettings} onClearHistory={clearHistory} buzz={buzz} />
        )}
      </main>

      <BottomNav tab={tab} setTab={setTab} buzz={buzz} />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="fade-up rounded-full border border-accent/40 bg-ink-900/95 px-5 py-2.5 text-sm font-bold text-accent shadow-glow backdrop-blur">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <Shell />
    </LanguageProvider>
  );
}
