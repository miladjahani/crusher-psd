// src/screens/ManualScreen.tsx — manual sieve data entry + generate curve.
import { useState } from 'react';
import { Activity, FlaskConical, PenLine, Plus, Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { computePSD, STANDARD_SIEVES } from '../psd';
import type { Buzz, HandleResult, Notify } from '../lib/types';
import { inputCls, uid } from '../lib/constants';
import { Card, ScreenTitle } from '../components/ui';

interface UiRow { id: string; size: string; weight: string; }

export function ManualScreen({ onResult, buzz, notify }: { onResult: HandleResult; buzz: Buzz; notify: Notify }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<UiRow[]>(() => Array.from({ length: 5 }, () => ({ id: uid(), size: '', weight: '' })));
  const parsed = rows.map((r) => ({ size: parseFloat(r.size), weight: parseFloat(r.weight) })).filter((r) => isFinite(r.size) && r.size > 0 && isFinite(r.weight) && r.weight >= 0);
  const total = parsed.reduce((s, r) => s + r.weight, 0);
  const canGen = parsed.length >= 2 && total > 0;
  const update = (id: string, key: 'size' | 'weight', v: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: v } : r)));
  const remove = (id: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  const add = () => { buzz(8); setRows((rs) => [...rs, { id: uid(), size: '', weight: '' }]); };
  const loadStd = () => { buzz(8); setRows(STANDARD_SIEVES.map((s) => ({ id: uid(), size: String(s), weight: '' }))); };
  const clear = () => { buzz(8); setRows(Array.from({ length: 5 }, () => ({ id: uid(), size: '', weight: '' }))); setName(''); };
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
        <div className="grid grid-cols-[1fr_1fr_44px] gap-2 pb-2 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500"><span>{t('sieveSize')}</span><span>{t('weightRetained')}</span><span /></div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_1fr_44px] items-center gap-2">
              <input dir="ltr" type="number" inputMode="decimal" step="any" min="0" value={r.size} onChange={(e) => update(r.id, 'size', e.target.value)} placeholder="4.75" className={inputCls} />
              <input dir="ltr" type="number" inputMode="decimal" step="any" min="0" value={r.weight} onChange={(e) => update(r.id, 'weight', e.target.value)} placeholder="0" className={inputCls} />
              <button onClick={() => { buzz(8); remove(r.id); }} aria-label="remove row" className="grid h-12 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-500 transition hover:border-red-400/40 hover:text-red-400 active:scale-95"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={add} className="flex h-11 items-center gap-1.5 rounded-xl border border-dashed border-accent/50 px-3.5 text-xs font-bold text-accent transition hover:bg-accent/10 active:scale-95"><Plus size={15} strokeWidth={3} /> {t('addRow')}</button>
          <button onClick={loadStd} className="flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-bold text-zinc-300 transition hover:bg-white/10 active:scale-95"><FlaskConical size={15} /> {t('loadStandard')}</button>
          <button onClick={clear} className="flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-bold text-zinc-500 transition hover:text-red-400 active:scale-95"><X size={15} /> {t('clearAll')}</button>
        </div>
      </Card>
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <span className="text-xs font-bold text-zinc-400">{t('totalMass')}</span>
        <span dir="ltr" className="text-lg font-black tabular-nums text-accent">{total > 0 ? total.toLocaleString('en', { maximumFractionDigits: 1 }) : '0'} <span className="text-xs text-zinc-500">{t('grams')}</span></span>
      </div>
      <button onClick={generate} disabled={!canGen} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-black text-ink-950 shadow-glow transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"><Activity size={20} strokeWidth={2.6} /> {t('generateCurve')}</button>
    </div>
  );
}
