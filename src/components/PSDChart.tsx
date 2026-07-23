// src/components/PSDChart.tsx — semi-log PSD area chart + tooltip (always LTR).
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../i18n';
import type { PSDResult } from '../psd';

function PSDTooltip({ active, payload, accent }: any) {
  const { t, num } = useI18n();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/15 bg-ink-900/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <div className="font-bold text-zinc-300">{t('sieveSize')}: <span dir="ltr">{p.size} mm</span></div>
      <div className="mt-1 font-black" style={{ color: accent }}>{t('percentPassing')}: {num(p.passing.toFixed(1))}%</div>
    </div>
  );
}

export function PSDChart({ res, accent }: { res: PSDResult; accent: string }) {
  return (
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
          <XAxis dataKey="size" type="number" scale="log" domain={['dataMin', 'dataMax']} ticks={res.points.map((p) => p.size)} tickFormatter={(v: number) => String(v)} tick={{ fontSize: 9.5, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)" angle={-40} textAnchor="end" height={44} interval={0} />
          <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fontSize: 10, fill: '#79839a' }} stroke="rgba(255,255,255,0.15)" width={34} />
          <Tooltip content={<PSDTooltip accent={accent} />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeDasharray: '4 4' }} />
          {res.d80 != null && <ReferenceLine x={res.d80} stroke="#22d3ee" strokeDasharray="5 4" label={{ value: 'D80', position: 'insideTopRight', fill: '#22d3ee', fontSize: 10, fontWeight: 700 }} />}
          {res.d50 != null && <ReferenceLine x={res.d50} stroke={accent} strokeDasharray="5 4" label={{ value: 'D50', position: 'insideTopRight', fill: accent, fontSize: 10, fontWeight: 700 }} />}
          {res.d10 != null && <ReferenceLine x={res.d10} stroke="#ffc400" strokeDasharray="5 4" label={{ value: 'D10', position: 'insideTopRight', fill: '#ffc400', fontSize: 10, fontWeight: 700 }} />}
          <Area type="monotone" dataKey="passing" stroke={accent} strokeWidth={3} fill="url(#psdFill)" dot={{ r: 3.5, fill: accent, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
