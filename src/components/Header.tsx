// src/components/Header.tsx — sticky top bar with bilingual date + EN/FA toggle.
import { Mountain } from 'lucide-react';
import { useI18n, jalali, greg } from '../i18n';

export function Header() {
  const { t, lang, setLang, isFa } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/40 bg-accent/10 shadow-glow"><Mountain className="h-6 w-6 text-accent" strokeWidth={2.4} /></div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black leading-tight">{t('appName')}</h1>
            <p className="truncate text-[11px] text-zinc-400">
              <span dir="ltr">{isFa ? jalali() : greg()}</span><span className="mx-1.5 opacity-40">•</span><span dir="ltr">{isFa ? greg() : jalali()}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 rounded-full border border-white/15 bg-white/5 p-1 text-xs font-black">
          <button onClick={() => setLang('en')} aria-pressed={lang === 'en'} className={`rounded-full px-3.5 py-1.5 transition ${lang === 'en' ? 'bg-accent text-ink-950 shadow-glow' : 'text-zinc-400'}`}>EN</button>
          <button onClick={() => setLang('fa')} aria-pressed={lang === 'fa'} className={`rounded-full px-3.5 py-1.5 transition ${lang === 'fa' ? 'bg-accent text-ink-950 shadow-glow' : 'text-zinc-400'}`}>FA</button>
        </div>
      </div>
    </header>
  );
}
