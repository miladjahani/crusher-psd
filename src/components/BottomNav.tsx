// src/components/BottomNav.tsx — fixed bottom tab bar (5 tabs). Labels via local L (keeps i18n.tsx untouched).
import { BarChart3, PenLine, ScanLine, Settings, TrendingUp } from 'lucide-react';
import { useI18n, type Lang } from '../i18n';
import type { Buzz, Tab } from '../lib/types';

const L: Record<Lang, Record<Tab, string>> = {
  en: { visual: 'Visual', manual: 'Manual', reports: 'Report', analytics: 'Trends', settings: 'Settings' },
  fa: { visual: 'تصویری', manual: 'دستی', reports: 'گزارش', analytics: 'روند', settings: 'تنظیمات' },
};

export function BottomNav({ tab, setTab, buzz }: { tab: Tab; setTab: (t: Tab) => void; buzz: Buzz }) {
  const { lang } = useI18n();
  const tabs = [
    { id: 'visual' as Tab, icon: ScanLine },
    { id: 'manual' as Tab, icon: PenLine },
    { id: 'reports' as Tab, icon: BarChart3 },
    { id: 'analytics' as Tab, icon: TrendingUp },
    { id: 'settings' as Tab, icon: Settings },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/85 backdrop-blur-2xl">
      <div className="mx-auto grid w-full max-w-2xl grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ id, icon: Icon }) => {
          const active = tab === id; const label = L[lang][id];
          return (
            <button key={id} onClick={() => { buzz(8); setTab(id); }} className="relative flex min-h-[64px] flex-col items-center justify-center gap-1">
              {active && <span className="absolute top-0 h-[3px] w-9 rounded-b-full bg-accent shadow-glow" />}
              <Icon size={20} strokeWidth={active ? 2.4 : 2} className={active ? 'text-accent drop-shadow-[0_0_8px_rgb(var(--accent)/0.8)]' : 'text-zinc-500'} />
              <span className={`text-[9px] font-bold ${active ? 'text-accent' : 'text-zinc-500'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
