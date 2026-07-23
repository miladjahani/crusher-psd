// src/components/BottomNav.tsx — fixed bottom tab bar (4 tabs, safe-area aware).
import { BarChart3, PenLine, ScanLine, Settings } from 'lucide-react';
import { useI18n } from '../i18n';
import type { Buzz, Tab } from '../lib/types';

export function BottomNav({ tab, setTab, buzz }: { tab: Tab; setTab: (t: Tab) => void; buzz: Buzz }) {
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
            <button key={id} onClick={() => { buzz(8); setTab(id); }} className="relative flex min-h-[68px] flex-col items-center justify-center gap-1.5">
              {active && <span className="absolute top-0 h-[3px] w-10 rounded-b-full bg-accent shadow-glow" />}
              <Icon size={22} strokeWidth={active ? 2.4 : 2} className={active ? 'text-accent drop-shadow-[0_0_8px_rgb(var(--accent)/0.8)]' : 'text-zinc-500'} />
              <span className={`text-[10px] font-bold ${active ? 'text-accent' : 'text-zinc-500'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
