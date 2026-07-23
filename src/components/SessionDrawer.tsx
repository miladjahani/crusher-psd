// src/components/SessionDrawer.tsx — slide-in session manager (RTL-aware via inline transform).
import { useEffect, useState } from 'react';
import { Check, FolderOpen, Plus, Trash2, X } from 'lucide-react';
import { useI18n, jalali } from '../i18n';
import { QUICK_ID, type Session } from '../db';

type Lang = 'en' | 'fa';
const L: Record<Lang, Record<string, string>> = {
  en: { title: 'Sessions', newBtn: 'New session', name: 'Session name', loc: 'Location (optional)', create: 'Create', cancel: 'Cancel', empty: 'No sessions yet', quick: 'Default', results: 'results', last: 'Last', del: 'Delete', active: 'Active', namePh: 'e.g. Shift A / Pad 3', locPh: 'e.g. Primary crusher', needName: 'Enter a name', close: 'Close' },
  fa: { title: 'سشن‌ها', newBtn: 'سشن جدید', name: 'نام سشن', loc: 'مکان (اختیاری)', create: 'ساختن', cancel: 'انصراف', empty: 'هنوز سشنی نیست', quick: 'پیش‌فرض', results: 'نتیجه', last: 'آخرین', del: 'حذف', active: 'فعال', namePh: 'مثلاً شیفت الف / پد ۳', locPh: 'مثلاً سنگ‌شکن اولیه', needName: 'یک نام وارد کنید', close: 'بستن' },
};

export function SessionDrawer({ open, onClose, sessions, activeId, counts, onSelect, onCreate, onDelete, onRefresh, ready }: {
  open: boolean; onClose: () => void; sessions: Session[]; activeId: string | null; counts: Record<string, number>;
  onSelect: (id: string) => void; onCreate: (name: string, location?: string) => Promise<string>; onDelete: (id: string) => void; onRefresh: () => Promise<void>; ready: boolean;
}) {
  const { lang, dir, num } = useI18n();
  const tr = (k: string) => L[lang][k] ?? L.en[k] ?? k;
  const rtl = dir === 'rtl';
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [loc, setLoc] = useState('');

  useEffect(() => { if (open) { onRefresh(); setShowForm(false); } }, [open, onRefresh]);

  const submit = async () => {
    if (!name.trim()) return;
    await onCreate(name, loc);
    setName(''); setLoc(''); setShowForm(false);
  };

  return (
    <>
      <div onClick={onClose} className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside
        aria-hidden={!open}
        className="fixed top-0 bottom-0 start-0 z-50 flex w-[84%] max-w-sm flex-col border-e border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out"
        style={{ transform: open ? 'translateX(0)' : `translateX(${rtl ? 100 : -100}%)` }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3.5">
          <div className="flex items-center gap-2 text-base font-black"><FolderOpen size={18} className="text-accent" />{tr('title')}</div>
          <button onClick={onClose} aria-label={tr('close')} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-zinc-400 active:scale-90"><X size={17} /></button>
        </div>

        <div className="px-3 pt-3">
          <button onClick={() => setShowForm((v) => !v)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-accent/50 bg-accent/5 py-2.5 text-sm font-bold text-accent active:scale-[0.98]"><Plus size={16} strokeWidth={3} />{tr('newBtn')}</button>
          {showForm && (
            <div className="mt-2 space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('namePh')} className="h-11 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 text-sm font-bold outline-none focus:border-accent" />
              <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder={tr('locPh')} className="h-11 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 text-sm font-bold outline-none focus:border-accent" />
              <div className="flex gap-2">
                <button onClick={submit} className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-black text-ink-950 active:scale-95">{tr('create')}</button>
                <button onClick={() => setShowForm(false)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-zinc-400 active:scale-95">{tr('cancel')}</button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {!ready && <div className="px-1 py-6 text-center text-xs text-zinc-500">…</div>}
          {ready && sessions.length === 0 && <div className="px-1 py-6 text-center text-xs text-zinc-500">{tr('empty')}</div>}
          {sessions.map((s) => {
            const active = s.id === activeId;
            const c = counts[s.id] || 0;
            return (
              <div key={s.id} className={`rounded-2xl border p-3 transition ${active ? 'border-accent/60 bg-accent/10' : 'border-white/10 bg-white/[0.03]'}`}>
                <button onClick={() => onSelect(s.id)} className="flex w-full items-start gap-3 text-start">
                  <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border border-white/20" style={{ background: s.color || '#64748b', boxShadow: `0 0 10px ${s.color || '#64748b'}66` }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-black">{s.name}</span>
                      {active && <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[9px] font-black uppercase text-accent"><Check size={10} />{tr('active')}</span>}
                      {s.id === QUICK_ID && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-zinc-400">{tr('quick')}</span>}
                    </div>
                    {s.location && <div className="truncate text-[11px] text-zinc-400">📍 {s.location}</div>}
                    <div className="mt-0.5 text-[10px] text-zinc-500">{num(c)} {tr('results')} • {tr('last')} {num(jalali(s.updatedAt))}</div>
                  </div>
                </button>
                {s.id !== QUICK_ID && (
                  <button onClick={() => onDelete(s.id)} aria-label={tr('del')} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 py-1.5 text-[11px] font-bold text-zinc-500 transition hover:border-red-400/40 hover:text-red-400 active:scale-95"><Trash2 size={13} />{tr('del')}</button>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
