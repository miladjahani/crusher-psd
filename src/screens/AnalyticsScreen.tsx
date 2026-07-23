// src/screens/AnalyticsScreen.tsx — long-term view: trend, control chart, PSD overlay, location box-plots, month-vs-month.
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Calendar, GitCompare, MapPin, TrendingUp } from 'lucide-react';
import { greg, jalali, useI18n, type Lang } from '../i18n';
import { listResults, listLocations, listSessions, type Result, type Session } from '../db';
import { computePSD } from '../psd';
import { boxStats, controlLimits, dayOfMonthSeries, startOfMonth, startOfYear, addMonths, addYears, type Box } from '../lib/analytics';
import { useSession } from '../session';
import { Card, ScreenTitle } from '../components/ui';

const L: Record<Lang, Record<string, string>> = {
  en: { title: 'Analytics', desc: 'Long-term trends, control limits, and comparisons across sessions, locations and time.', scope: 'Scope', sess: 'Active session', all: 'All sessions', range: 'Range', d30: '30 days', d90: '90 days', year: 'This year', custom: 'Custom', from: 'From', to: 'To', trend: 'Dx trend over time', control: 'Control chart (D50)', overlay: 'PSD overlay (pick sessions)', overlayHint: 'Latest scan of each selected session', box: 'D50 spread by location', boxEmpty: 'Add a location to results to see spread.', compare: 'Month comparison', cmpPrev: 'vs previous month', cmpYear: 'vs same month last year', day: 'Day of month', noData: 'Not enough data for this view.', mean: 'mean', out: 'out of control', sessions: 'Sessions' },
  fa: { title: 'تحلیل روند', desc: 'روندهای بلندمدت، حدود کنترل، و مقایسه بین سشن‌ها، مکان‌ها و زمان.', scope: 'دامنه', sess: 'سشن فعال', all: 'همه سشن‌ها', range: 'بازه', d30: '۳۰ روز', d90: '۹۰ روز', year: 'امسال', custom: 'دلخواه', from: 'از', to: 'تا', trend: 'روند Dx در زمان', control: 'نمودار کنترل (D50)', overlay: 'هم‌پوشانی PSD (سشن انتخاب کنید)', overlayHint: 'آخرین اسکن هر سشن انتخابی', box: 'پراکندگی D50 بر اساس مکان', boxEmpty: 'به نتایج مکان اضافه کنید تا پراکندگی دیده شود.', compare: 'مقایسه ماهانه', cmpPrev: 'در برابر ماه قبل', cmpYear: 'در برابر همین ماه پارسال', day: 'روز ماه', noData: 'داده برای این نما کافی نیست.', mean: 'میانگین', out: 'خارج از کنترل', sessions: 'سشن‌ها' },
};
type Range = '30' | '90' | 'year' | 'custom';
const DAY = 86400000;

export default function AnalyticsScreen({ accent, buzz }: { accent: string; buzz: (ms?: number) => void; notify: (m: string) => void }) {
  const { lang, num } = useI18n();
  const tr = (k: string) => L[lang][k] ?? L.en[k] ?? k;
  const { activeId, sessions } = useSession();
  const [scope, setScope] = useState<'session' | 'all'>('session');
  const [range, setRange] = useState<Range>('90');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [cmp, setCmp] = useState<'prev' | 'year'>('prev');

  const bounds = useMemo(() => {
    const now = Date.now();
    if (range === '30') return { from: now - 30 * DAY, to: now };
    if (range === '90') return { from: now - 90 * DAY, to: now };
    if (range === 'year') return { from: startOfYear(now), to: now };
    const f = from ? new Date(from).getTime() : now - 90 * DAY;
    const t = to ? new Date(to).getTime() + DAY - 1 : now;
    return { from: f, to: t };
  }, [range, from, to]);

  useEffect(() => { let a = true; listResults({ sessionId: scope === 'session' ? (activeId || undefined) : undefined, from: bounds.from, to: bounds.to }).then((r) => { if (a) setResults(r); }); listLocations().then((l) => { if (a) setLocations(l); }); return () => { a = false; }; }, [scope, activeId, bounds.from, bounds.to]);
  useEffect(() => { if (selected.length === 0 && sessions.length) setSelected([sessions[0]?.id].filter(Boolean) as string[]); }, [sessions]);

  const trend = useMemo(() => [...results].filter((r) => r.d50 != null).sort((a, b) => a.createdAt - b.createdAt).map((r) => ({ t: r.createdAt, d10: r.d10, d50: r.d50, d80: r.d80 })), [results]);
  const lim = useMemo(() => controlLimits(trend.map((d) => d.d50 as number)), [trend]);

  const overlay = useMemo(() => {
    return selected.map((sid) => {
      const s = sessions.find((x) => x.id === sid);
      const rs = results.filter((r) => r.sessionId === sid && (r.sieve || []).length >= 2);
      const last = rs[0];
      const psd = last ? computePSD(last.sieve) : null;
      return { id: sid, name: s?.name || sid, color: s?.color || accent, points: psd?.points || [] };
    }).filter((o) => o.points.length);
  }, [selected, results, sessions, accent]);
  const overlayDomain = useMemo(() => { const all = overlay.flatMap((o) => o.points.map((p) => p.size)); return all.length ? [Math.min(...all), Math.max(...all)] : [1, 100]; }, [overlay]);

  const boxes = useMemo(() => {
    const byLoc: Record<string, number[]> = {};
    for (const r of results) { const k = r.location || '—'; if (r.d50 != null) (byLoc[k] = byLoc[k] || []).push(r.d50); }
    const out: { label: string; box: Box }[] = [];
    for (const k of Object.keys(byLoc)) { const b = boxStats(byLoc[k]); if (b) out.push({ label: k, box: b }); }
    return out;
  }, [results]);

  const cmpSeries = useMemo(() => {
    const now = Date.now();
    const curFrom = startOfMonth(now), curTo = now;
    const oFrom = cmp === 'prev' ? addMonths(now, -1) : addYears(now, -1);
    const oTo = cmp === 'prev' ? startOfMonth(now) - 1 : addMonths(addYears(now, -1), 1) - 1;
    const cur = dayOfMonthSeries(results.filter((r) => r.d50 != null && r.createdAt >= curFrom && r.createdAt <= curTo).map((r) => ({ t: r.createdAt, v: r.d50 as number })));
    const oth = dayOfMonthSeries(results.filter((r) => r.d50 != null && r.createdAt >= oFrom && r.createdAt <= oTo).map((r) => ({ t: r.createdAt, v: r.d50 as number })));
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const cm = new Map(cur.map((d) => [d.day, d.v])); const om = new Map(oth.map((d) => [d.day, d.v]));
    return { data: days.map((d) => ({ day: d, cur: cm.get(d) ?? null, oth: om.get(d) ?? null })), has: cur.length > 0 || oth.length > 0 };
  }, [results, cmp]);

  const fmtT = (t: number) => (lang === 'fa' ? jalali(t) : greg(t));
  const toggleSel = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="fade-up space-y-4">
      <ScreenTitle icon={TrendingUp} title={tr('title')} desc={tr('desc')} />
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-widest text-zinc-500">{tr('scope')}</div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-900/60 p-1 text-[11px] font-bold">
              <button onClick={() => { setScope('session'); buzz(6); }} className={`rounded-lg py-2 ${scope === 'session' ? 'bg-accent text-ink-950' : 'text-zinc-400'}`}>{tr('sess')}</button>
              <button onClick={() => { setScope('all'); buzz(6); }} className={`rounded-lg py-2 ${scope === 'all' ? 'bg-accent text-ink-950' : 'text-zinc-400'}`}>{tr('all')}</button>
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-widest text-zinc-500">{tr('range')}</div>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-ink-900/60 p-1 text-[10px] font-bold">
              {([['30', tr('d30')], ['90', tr('d90')], ['year', tr('year')], ['custom', tr('custom')]] as const).map(([k, lab]) => (
                <button key={k} onClick={() => { setRange(k as Range); buzz(6); }} className={`rounded-lg py-2 ${range === k ? 'bg-accent text-ink-950' : 'text-zinc-400'}`}>{lab}</button>
              ))}
            </div>
          </div>
        </div>
        {range === 'custom' && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            <label className="block text-zinc-400">{tr('from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-ink-900/60 px-2 text-sm" /></label>
            <label className="block text-zinc-400">{tr('to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-ink-900/60 px-2 text-sm" /></label>
          </div>
        )}
        <div className="mt-2 text-[11px] text-zinc-500">{num(results.length)} results</div>
      </Card>

      <Card>
        <div className="mb-1 flex items-center gap-2 text-sm font-black"><Activity size={15} className="text-accent" />{tr('trend')}</div>
        {trend.length < 2 ? <Empty tr={tr} /> : (
          <div dir="ltr"><ResponsiveContainer width="100%" height={230}><LineChart data={trend} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtT} tick={{ fontSize: 9, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)" height={36} />
            <YAxis tick={{ fontSize: 10, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)" width={34} />
            <Tooltip contentStyle={{ background: '#0b0f14', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, fontSize: 12 }} labelFormatter={fmtT} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="d80" stroke="#22d3ee" strokeWidth={2} dot={false} name="D80" connectNulls />
            <Line type="monotone" dataKey="d50" stroke={accent} strokeWidth={2.5} dot={{ r: 2.5 }} name="D50" connectNulls />
            <Line type="monotone" dataKey="d10" stroke="#ffc400" strokeWidth={2} dot={false} name="D10" connectNulls />
          </LineChart></ResponsiveContainer></div>
        )}
      </Card>

      <Card>
        <div className="mb-1 flex items-center gap-2 text-sm font-black"><Activity size={15} className="text-[#22d3ee]" />{tr('control')}</div>
        {!lim || trend.length < 2 ? <Empty tr={tr} /> : (
          <>
            <div dir="ltr"><ResponsiveContainer width="100%" height={210}><LineChart data={trend} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtT} tick={{ fontSize: 9, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)" height={36} />
              <YAxis tick={{ fontSize: 10, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)" width={34} />
              <Tooltip contentStyle={{ background: '#0b0f14', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, fontSize: 12 }} labelFormatter={fmtT} />
              <ReferenceLine y={lim.ucl3} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '+3σ', fill: '#ef4444', fontSize: 9 }} />
              <ReferenceLine y={lim.ucl2} stroke="#fb923c" strokeDasharray="4 4" label={{ value: '+2σ', fill: '#fb923c', fontSize: 9 }} />
              <ReferenceLine y={lim.mean} stroke={accent} label={{ value: tr('mean'), fill: accent, fontSize: 9 }} />
              <ReferenceLine y={lim.lcl2} stroke="#fb923c" strokeDasharray="4 4" label={{ value: '-2σ', fill: '#fb923c', fontSize: 9 }} />
              <ReferenceLine y={lim.lcl3} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '-3σ', fill: '#ef4444', fontSize: 9 }} />
              <Line type="monotone" dataKey="d50" stroke={accent} strokeWidth={2} connectNulls dot={(p: any) => { const v = p.payload?.d50; const out = v != null && (v > lim.ucl2 || v < lim.lcl2); return <circle key={p.index} cx={p.cx} cy={p.cy} r={out ? 5 : 2.5} fill={out ? '#ef4444' : accent} />; }} />
            </LineChart></ResponsiveContainer></div>
            <div className="mt-1 text-[11px] text-zinc-500">μ={num(lim.mean.toFixed(2))} • σ={num(lim.sigma.toFixed(2))} • n={num(lim.n)}</div>
          </>
        )}
      </Card>

      <Card>
        <div className="mb-1 flex items-center gap-2 text-sm font-black"><GitCompare size={15} className="text-[#ffc400]" />{tr('overlay')}</div>
        <p className="mb-2 text-[11px] text-zinc-500">{tr('overlayHint')}</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {sessions.map((s) => (
            <button key={s.id} onClick={() => { toggleSel(s.id); buzz(6); }} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${selected.includes(s.id) ? 'border-accent/60 bg-accent/10 text-accent' : 'border-white/10 text-zinc-400'}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: s.color || '#64748b' }} />{s.name}
            </button>
          ))}
        </div>
        {overlay.length === 0 ? <Empty tr={tr} /> : (
          <div dir="ltr"><ResponsiveContainer width="100%" height={240}><LineChart margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <XAxis dataKey="size" type="number" scale="log" domain={overlayDomain as [number, number]} tick={{ fontSize: 9, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)}" height={36} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)" width={34} />
            <Tooltip contentStyle={{ background: '#0b0f14', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {overlay.map((o) => <Line key={o.id} data={o.points} type="monotone" dataKey="passing" name={o.name} stroke={o.color} strokeWidth={2.5} dot={{ r: 2 }} />)}
          </LineChart></ResponsiveContainer></div>
        )}
      </Card>

      <Card>
        <div className="mb-2 flex items-center gap-2 text-sm font-black"><MapPin size={15} className="text-[#a78bfa]" />{tr('box')}</div>
        {boxes.length === 0 ? <p className="text-[11px] text-zinc-500">{tr('boxEmpty')}</p> : <BoxPlot boxes={boxes} accent={accent} />}
      </Card>

      <Card>
        <div className="mb-2 flex items-center gap-2 text-sm font-black"><Calendar size={15} className="text-[#f472b6]" />{tr('compare')}</div>
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-ink-900/60 p-1 text-[11px] font-bold">
          <button onClick={() => { setCmp('prev'); buzz(6); }} className={`rounded-lg py-2 ${cmp === 'prev' ? 'bg-accent text-ink-950' : 'text-zinc-400'}`}>{tr('cmpPrev')}</button>
          <button onClick={() => { setCmp('year'); buzz(6); }} className={`rounded-lg py-2 ${cmp === 'year' ? 'bg-accent text-ink-950' : 'text-zinc-400'}`}>{tr('cmpYear')}</button>
        </div>
        {!cmpSeries.has ? <Empty tr={tr} /> : (
          <div dir="ltr"><ResponsiveContainer width="100%" height={210}><LineChart data={cmpSeries.data} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <XAxis dataKey="day" type="number" domain={[1, 31]} ticks={[1, 5, 10, 15, 20, 25, 31]} tick={{ fontSize: 9, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)" height={30} label={{ value: tr('day'), position: 'insideBottomRight', fill: '#79839a', fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)" width={34} />
            <Tooltip contentStyle={{ background: '#0b0f14', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="cur" stroke={accent} strokeWidth={2.5} dot={{ r: 2 }} name={cmp === 'prev' ? 'this month' : 'this month'} connectNulls />
            <Line type="monotone" dataKey="oth" stroke="#f472b6" strokeWidth={2} strokeDasharray="5 4" dot={false} name={cmp === 'prev' ? 'prev month' : 'last year'} connectNulls />
          </LineChart></ResponsiveContainer></div>
        )}
      </Card>
    </div>
  );
}

function Empty({ tr }: { tr: (k: string) => string }) { return <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-[11px] text-zinc-500">{tr('noData')}</div>; }

function BoxPlot({ boxes, accent }: { boxes: { label: string; box: Box }[]; accent: string }) {
  const all = boxes.flatMap((b) => [b.box.min, b.box.max]);
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.1 || 1;
  const yMin = lo - pad, yMax = hi + pad, H = 220, top = 14, bot = 34, iw = H - top - bot;
  const Y = (v: number) => top + (1 - (v - yMin) / (yMax - yMin)) * iw;
  const n = boxes.length; const colW = 100 / n;
  return (
    <div dir="ltr">
      <svg viewBox={`0 0 ${Math.max(280, n * 70)} ${H}`} className="w-full" style={{ minHeight: 200 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => { const v = yMin + (yMax - yMin) * p; const y = Y(v); return <g key={p}><line x1={28} y1={y} x2={'100%'} y2={y} stroke="rgba(255,255,255,0.06)" /><text x={24} y={y + 3} textAnchor="end" fontSize="9" fill="#79839a">{v.toFixed(1)}</text></g>; })}
        {boxes.map((b, i) => {
          const cx = 40 + i * ((Math.max(280, n * 70) - 50) / n); const w = Math.min(46, colW * 0.5);
          const bx = b.box;
          return (
            <g key={i}>
              <line x1={cx} y1={Y(bx.max)} x2={cx} y2={Y(bx.q3)} stroke={accent} />
              <line x1={cx} y1={Y(bx.min)} x2={cx} y2={Y(bx.q1)} stroke={accent} />
              <line x1={cx - w / 3} y1={Y(bx.max)} x2={cx + w / 3} y2={Y(bx.max)} stroke={accent} />
              <line x1={cx - w / 3} y1={Y(bx.min)} x2={cx + w / 3} y2={Y(bx.min)} stroke={accent} />
              <rect x={cx - w / 2} y={Y(bx.q3)} width={w} height={Math.max(1, Y(bx.q1) - Y(bx.q3))} fill={accent} fillOpacity={0.18} stroke={accent} rx={3} />
              <line x1={cx - w / 2} y1={Y(bx.median)} x2={cx + w / 2} y2={Y(bx.median)} stroke="#ffc400" strokeWidth={2} />
              <text x={cx} y={H - 14} textAnchor="middle" fontSize="9.5" fill="#cdd6e0">{b.label.length > 10 ? b.label.slice(0, 9) + '…' : b.label}</text>
              <text x={cx} y={H - 3} textAnchor="middle" fontSize="8" fill="#79839a">n={bx.n}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
