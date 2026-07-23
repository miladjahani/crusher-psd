// src/App.tsx — orchestrator only. UI lives in components/ and screens/.
import { useCallback, useEffect, useRef, useState } from 'react';
import { LanguageProvider, useI18n } from './i18n';
import type { AnalysisRecord, HandleResult, SettingsState, Tab } from './lib/types';
import { ACCENTS, loadHistory, loadSettings, uid } from './lib/constants';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import VisionScreen from './vision-screen';
import { ManualScreen } from './screens/ManualScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

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
    try { localStorage.setItem('psd-settings', JSON.stringify(settings)); } catch {}
  }, [settings]);

  const buzz = useCallback((ms = 12) => { if (settings.haptics && 'vibrate' in navigator) navigator.vibrate(ms); }, [settings.haptics]);
  const notify = useCallback((msg: string) => { setToast(msg); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2400); }, []);

  const handleResult: HandleResult = (rows, result, source, sampleName) => {
    const rec: AnalysisRecord = { id: uid(), sampleName, source, createdAt: Date.now(), rows, result };
    setCurrent(rec);
    setHistory((h) => { const nh = [rec, ...h].slice(0, 25); try { localStorage.setItem('psd-history', JSON.stringify(nh)); } catch {} return nh; });
    setTab('reports');
    notify(t('savedToast'));
  };
  const loadRec = (rec: AnalysisRecord) => { setCurrent(rec); setTab('reports'); buzz(10); };
  const delRec = (id: string) => {
    setHistory((h) => { const nh = h.filter((x) => x.id !== id); try { localStorage.setItem('psd-history', JSON.stringify(nh)); } catch {} return nh; });
    if (current?.id === id) setCurrent(null);
    notify(t('deletedToast'));
  };
  const clearHistory = () => { setHistory([]); setCurrent(null); try { localStorage.removeItem('psd-history'); } catch {} notify(t('historyCleared')); };
  const accentHex = ACCENTS.find((a) => a.id === settings.accent)!.hex;

  return (
    <div className="min-h-dvh bg-ink-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-36 start-1/4 h-80 w-80 rounded-full opacity-[0.13] blur-3xl" style={{ background: accentHex }} />
        <div className="absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-[#ffc400] opacity-[0.07] blur-3xl" />
      </div>
      <Header />
      <main className="relative mx-auto w-full max-w-2xl px-4 pb-36 pt-5">
        {tab === 'visual' && <VisionScreen showGrid={settings.grid} onResult={handleResult} buzz={buzz} notify={notify} />}
        {tab === 'manual' && <ManualScreen onResult={handleResult} buzz={buzz} notify={notify} />}
        {tab === 'reports' && <ReportsScreen record={current} history={history} accent={accentHex} onLoad={loadRec} onDelete={delRec} onNavigate={setTab} buzz={buzz} notify={notify} />}
        {tab === 'settings' && <SettingsScreen settings={settings} setSettings={setSettings} onClearHistory={clearHistory} buzz={buzz} />}
      </main>
      <BottomNav tab={tab} setTab={setTab} buzz={buzz} />
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="fade-up rounded-full border border-accent/40 bg-ink-900/95 px-5 py-2.5 text-sm font-bold text-accent shadow-glow backdrop-blur">{toast}</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <LanguageProvider><Shell /></LanguageProvider>;
}
