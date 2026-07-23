// src/screens/SettingsScreen.tsx — language, accent, toggles, clear history, about.
import type { Dispatch, SetStateAction } from 'react';
import { Info, Layers, Settings, Trash2, Zap } from 'lucide-react';
import { useI18n } from '../i18n';
import type { Buzz, SettingsState } from '../lib/types';
import { ACCENTS } from '../lib/constants';
import { Card, ScreenTitle } from '../components/ui';

function ToggleRow({ label, icon: Icon, checked, onChange }: { label: string; icon: any; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5 text-sm font-bold text-zinc-200"><Icon size={16} className="text-accent" /> {label}</div>
      <button onClick={onChange} role="switch" aria-checked={checked} className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? 'bg-accent shadow-glow' : 'bg-white/10'}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'start-[30px]' : 'start-1'}`} />
      </button>
    </div>
  );
}

export function SettingsScreen({ settings, setSettings, onClearHistory, buzz }: {
  settings: SettingsState; setSettings: Dispatch<SetStateAction<SettingsState>>; onClearHistory: () => void; buzz: Buzz;
}) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="fade-up space-y-4">
      <ScreenTitle icon={Settings} title={t('settingsTitle')} desc={t('appTagline')} />
      <Card>
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-zinc-500">{t('language')}</div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-ink-900/60 p-1">
          <button onClick={() => { buzz(10); setLang('en'); }} className={`h-12 rounded-xl text-sm font-black transition ${lang === 'en' ? 'bg-accent text-ink-950 shadow-glow' : 'text-zinc-400'}`}>English</button>
          <button onClick={() => { buzz(10); setLang('fa'); }} className={`h-12 rounded-xl text-sm font-black transition ${lang === 'fa' ? 'bg-accent text-ink-950 shadow-glow' : 'text-zinc-400'}`}>فارسی</button>
        </div>
      </Card>
      <Card>
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-zinc-500">{t('accentColor')}</div>
        <div className="grid grid-cols-3 gap-2">
          {ACCENTS.map((a) => (
            <button key={a.id} onClick={() => { buzz(10); setSettings((s) => ({ ...s, accent: a.id })); }} className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition active:scale-95 ${settings.accent === a.id ? 'border-white/70' : 'border-white/10'}`} style={{ background: `linear-gradient(140deg, ${a.hex}22, transparent 65%)` }}>
              <span className="h-7 w-7 rounded-full border-2 border-white/20" style={{ background: a.hex, boxShadow: `0 0 14px ${a.hex}` }} />
              <span className="text-[10px] font-bold text-zinc-300">{a.id === 'green' ? t('neonGreen') : a.id === 'yellow' ? t('safetyYellow') : t('plasmaCyan')}</span>
            </button>
          ))}
        </div>
      </Card>
      <Card className="space-y-1">
        <ToggleRow label={t('scannerGrid')} icon={Layers} checked={settings.grid} onChange={() => { buzz(8); setSettings((s) => ({ ...s, grid: !s.grid })); }} />
        <div className="h-px bg-white/5" />
        <ToggleRow label={t('haptics')} icon={Zap} checked={settings.haptics} onChange={() => setSettings((s) => ({ ...s, haptics: !s.haptics }))} />
      </Card>
      <Card>
        <button onClick={() => { buzz(15); onClearHistory(); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/5 py-3.5 text-sm font-bold text-red-400 transition active:scale-[0.98]"><Trash2 size={16} /> {t('clearHistory')}</button>
      </Card>
      <Card>
        <div className="flex items-center gap-2 text-sm font-black"><Info size={15} className="text-accent" /> {t('about')}</div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">{t('aboutText')}</p>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-[11px] text-zinc-500"><span>{t('version')}</span><span dir="ltr" className="font-bold text-zinc-300">v2.1.0 • modular</span></div>
      </Card>
    </div>
  );
}
