// src/screens/ReportsScreen.tsx — per-session history from IndexedDB + immediate record + export.
import { useEffect, useState } from 'react';
import { BarChart3, FileSpreadsheet, FileText, FlaskConical, FolderOpen, PenLine, ScanLine, Trash2 } from 'lucide-react';
import { greg, jalali, useI18n, type Lang, type TKey } from '../i18n';
import { classify, fmtSize } from '../psd';
import { exportExcel, exportPDF, type ReportMeta, type ReportStrings } from '../exporters';
import { listResults, resultToAnalysisRecord, type Result } from '../db';
import { useSession } from '../session';
import type { AnalysisRecord, Buzz, Notify, Tab } from '../lib/types';
import { Card, KPI, ScreenTitle } from '../components/ui';
import { PSDChart } from '../components/PSDChart';

const L: Record<Lang, Record<string, string>> = {
  en: { sessionResults: 'Session results', none: 'No results in this session yet', open: 'Open', del: 'Delete' },
  fa: { sessionResults: 'نتایج این سشن', none: 'هنوز نتیجه‌ای در این سشن نیست', open: 'باز کردن', del: 'حذف' },
};

export function ReportsScreen({ record, accent, onLoadResult, onDeleteResult, onNavigate, buzz, notify, refreshKey }: {
  record: AnalysisRecord | null; accent: string;
  onLoadResult: (id: string) => void; onDeleteResult: (id: string) => void; onNavigate: (t: Tab) => void; buzz: Buzz; notify: Notify; refreshKey: number;
}) {
  const { t, num, isFa, lang } = useI18n();
  const tr = (k: string) => L[lang][k] ?? L.en[k] ?? k;
  const { activeId } = useSession();
  const [list, setList] = useState<Result[]>([]);

  useEffect(() => { let alive = true; listResults({ sessionId: activeId || undefined }).then((r) => { if (alive) setList(r); }); return () => { alive = false; }; }, [activeId, refreshKey]);

  const history = list.map(resultToAnalysisRecord).filter((x): x is AnalysisRecord => !!x);

  if (!record) {
    return (
      <div className="fade-up space-y-4">
        <ScreenTitle icon={BarChart3} title={t('reportsTitle')} desc={t('noDataHint')} />
        {history.length > 0 && (
          <Card>
            <div className="mb-2 text-sm font-black">{tr('sessionResults')} <span className="text-zinc-500">({num(history.length)})</span></div>
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-accent">{h.source === 'ai' ? <ScanLine size={17} /> : <PenLine size={17} />}</div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{h.sampleName}</div><div className="truncate text-[11px] text-zinc-500">{h.source === 'ai' ? t('sourceAI') : t('sourceManual')} • {num(jalali(h.createdAt))} • D50 {fmtSize(h.result.d50)} mm</div></div>
                  <button onClick={() => onLoadResult(h.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-zinc-300 active:scale-90"><FolderOpen size={16} /></button>
                  <button onClick={() => onDeleteResult(h.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-zinc-500 active:scale-90"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </Card>
        )}
        <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-3xl border border-accent/25 bg-accent/5 text-accent"><FlaskConical size={34} /></div>
          <div><div className="text-base font-black">{t('noData')}</div><p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">{history.length ? tr('none') : t('noDataHint')}</p></div>
          <div className="flex gap-2">
            <button onClick={() => onNavigate('visual')} className="h-12 rounded-xl bg-accent px-5 text-sm font-black text-ink-950 shadow-glow active:scale-95">{t('tabVisual')}</button>
            <button onClick={() => onNavigate('manual')} className="h-12 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-bold text-zinc-200 active:scale-95">{t('tabManual')}</button>
          </div>
        </div>
      </div>
    );
  }

  const r = record.result; const grad = classify(r); const gradKey: TKey = grad === 'well' ? 'wellGraded' : grad === 'uniform' ? 'uniformGraded' : 'gapGraded';
  const Lr: ReportStrings = { psd: t('psdChart'), sample: t('sampleName'), date: t('date'), sourceLabel: t('sourceLabel'), sieve: t('sieveSize'), weight: t('colRetained'), retPct: t('colRetPct'), cumRet: t('colCumRet'), passing: t('colPassing'), eff: t('effectiveSize'), med: t('medianSize'), coarse: t('coarseSize'), grad: t('gradation'), gradVal: t(gradKey) };
  const meta: ReportMeta = { sampleName: record.sampleName, source: record.source === 'ai' ? t('sourceAI') : t('sourceManual'), dateJalali: jalali(record.createdAt), dateGreg: greg(record.createdAt), lang: isFa ? 'fa' : 'en' };
  return (
    <div className="fade-up space-y-4">
      <ScreenTitle icon={BarChart3} title={t('reportsTitle')} desc={t('psdChart')} />
      <Card className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">{record.source === 'ai' ? <ScanLine size={20} /> : <PenLine size={20} />}</div>
          <div className="min-w-0"><div className="truncate text-sm font-black">{record.sampleName}</div><div className="truncate text-[11px] text-zinc-500">{record.source === 'ai' ? t('sourceAI') : t('sourceManual')} • {num(jalali(record.createdAt))} • {greg(record.createdAt)}</div></div>
        </div>
        <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-accent">{t(gradKey)}</span>
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
      <Card><div className="flex items-center justify-between"><h3 className="text-sm font-black">{t('psdChart')}</h3><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t('percentPassing')}</span></div><PSDChart res={r} accent={accent} /></Card>
      <Card className="overflow-hidden p-0">
        <div className="px-4 pb-2 pt-4 text-sm font-black">{t('dataTable')}</div>
        <div dir="ltr" className="overflow-x-auto">
          <table className="w-full min-w-[430px] text-center text-xs tabular-nums">
            <thead><tr className="bg-white/5 text-[10px] uppercase tracking-wider text-zinc-500"><th className="px-2 py-2.5">{t('sieveSize')}</th><th className="px-2 py-2.5">{t('colRetained')}</th><th className="px-2 py-2.5">{t('colRetPct')}</th><th className="px-2 py-2.5">{t('colCumRet')}</th><th className="px-2 py-2.5 text-accent">{t('colPassing')}</th></tr></thead>
            <tbody>{[...r.points].reverse().map((p, i) => (<tr key={i} className="border-t border-white/5"><td className="px-2 py-2 font-bold text-zinc-200">{p.size}</td><td className="px-2 py-2 text-zinc-400">{p.weight.toFixed(1)}</td><td className="px-2 py-2 text-zinc-400">{p.retained.toFixed(1)}</td><td className="px-2 py-2 text-zinc-400">{p.cumRetained.toFixed(1)}</td><td className="px-2 py-2 font-black text-accent">{p.passing.toFixed(1)}</td></tr>))}</tbody>
          </table>
        </div>
      </Card>
      <div>
        <h3 className="mb-2 px-1 text-sm font-black">{t('exportTitle')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { buzz(15); if (!exportPDF(r, meta, Lr)) notify('Popup blocked — allow popups.'); }} className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-[#ffc400]/70 bg-[#ffc400]/10 px-2 text-center text-[11px] font-black leading-tight text-[#ffc400] transition active:scale-[0.97]"><FileText size={20} /> {t('downloadPDF')}</button>
          <button onClick={() => { buzz(15); exportExcel(r, meta, Lr); notify(`${t('exportExcel')} ✓`); }} className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl bg-accent px-2 text-center text-[11px] font-black leading-tight text-ink-950 shadow-glow transition active:scale-[0.97]"><FileSpreadsheet size={20} /> {t('exportExcel')}</button>
        </div>
      </div>
      {history.length > 0 && (
        <div>
          <h3 className="mb-2 px-1 text-sm font-black">{tr('sessionResults')} <span className="text-zinc-500">({num(history.length)})</span></h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className={`flex items-center gap-3 rounded-2xl border p-3 transition ${h.id === record.id ? 'border-accent/50 bg-accent/5' : 'border-white/10 bg-white/[0.03]'}`}>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-accent">{h.source === 'ai' ? <ScanLine size={17} /> : <PenLine size={17} />}</div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{h.sampleName}</div><div className="truncate text-[11px] text-zinc-500">{h.source === 'ai' ? t('sourceAI') : t('sourceManual')} • {num(jalali(h.createdAt))} • D50 {fmtSize(h.result.d50)} mm</div></div>
                <button onClick={() => onLoadResult(h.id)} aria-label={tr('open')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-zinc-300 active:scale-90"><FolderOpen size={16} /></button>
                <button onClick={() => onDeleteResult(h.id)} aria-label={tr('del')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-zinc-500 active:scale-90"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
