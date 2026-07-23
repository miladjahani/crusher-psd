// src/App.tsx — orchestrator. Single source of truth = IndexedDB (sessions/results). Analytics tab added.
import { useCallback, useEffect, useRef, useState } from 'react';
import { LanguageProvider, useI18n } from './i18n';
import type { AnalysisRecord, HandleResult, SettingsState, Tab } from './lib/types';
import { ACCENTS, loadSettings, uid } from './lib/constants';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { SessionDrawer } from './components/SessionDrawer';
import { SessionProvider, useSession } from './session';
import { saveResult, deleteResult, getResult, resultToAnalysisRecord, clearResultsForSession, QUICK_ID, type Result } from './db';
import { classify } from './psd';
import VisionScreen from './vision-screen';
import { ManualScreen } from './screens/ManualScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';

function Shell() {
  const { t, lang } = useI18n();
  const { sessions, activeId, setActiveId, create, remove, refresh, ready } = useSession();
  const [tab, setTab] = useState<Tab>('visual');
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [current, setCurrent] = useState<AnalysisRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const activeSessionName = sessions.find((s) => s.id === activeId)?.name ?? '—';

  useEffect(() => { document.documentElement.style.setProperty('--accent', ACCENTS.find((a) => a.id === settings.accent)!.rgb); try { localStorage.setItem('psd-settings', JSON.stringify(settings)); } catch {} }, [settings]);
  const buzz = useCallback((ms = 12) => { if (settings.haptics && 'vibrate' in navigator) navigator.vibrate(ms); }, [settings.haptics]);
  const notify = useCallback((msg: string) => { setToast(msg); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2400); }, []);

  const handleResult: HandleResult = (rows, result, source, sampleName) => {
    const rec: AnalysisRecord = { id: uid(), sampleName, source, createdAt: Date.now(), rows, result };
    setCurrent(rec); setTab('reports'); notify(t('savedToast'));
    if (source === 'manual') { // vision persists itself (with image) inside vision-screen; manual persists here
      const sid = activeId || QUICK_ID;
      const r: Result = { id: rec.id, sessionId: sid, kind: 'manual', sampleName, createdAt: rec.createdAt, sieve: rows, d10: result.d10, d50: result.d50, d80: result.d80, cu: result.cu, cc: result.cc, gradation: classify(result), thumbBlob: null, hasImage: false };
      void saveResult(r, null).then(() => setRefreshKey((k) => k + 1)).catch(() => {});
    } else {
      setRefreshKey((k) => k + 1); // vision just saved; refresh lists
    }
  };
  const loadResultById = useCallback((id: string) => {
    void getResult(id).then((g) => { if (!g) return; const rec = resultToAnalysisRecord(g.record); if (rec) { setCurrent(rec); setTab('reports'); buzz(10); } });
  }, [buzz]);
  const deleteResultById = useCallback((id: string) => {
    void deleteResult(id).then(() => { if (current?.id === id) setCurrent(null); setRefreshKey((k) => k + 1); notify(t('deletedToast')); });
  }, [current, notify, t]);
  const clearSessionResults = useCallback(() => {
    const msg = lang === 'fa' ? 'همه‌ی نتایج سشن فعال پاک شود؟' : 'Delete all results in the active session?';
    if (!window.confirm(msg)) return;
    void clearResultsForSession(activeId || QUICK_ID).then(() => { setCurrent(null); setRefreshKey((k) => k + 1); notify(lang === 'fa' ? 'نتایج سشن پاک شد' : 'Session results cleared'); });
  }, [activeId, lang, notify]);
  const accentHex = ACCENTS.find((a) => a.id === settings.accent)!.hex;

  return (
    <div className="min-h-dvh bg-ink-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-36 start-1/4 h-80 w-80 rounded-full opacity-[0.13] blur-3xl" style={{ background: accentHex }} />
        <div className="absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-[#ffc400] opacity-[0.07] blur-3xl" />
      </div>
      <Header onOpenDrawer={() => setDrawerOpen(true)} activeSessionName={activeSessionName} />
      <main className="relative mx-auto w-full max-w-2xl px-4 pb-36 pt-5">
        {tab === 'visual' && <VisionScreen showGrid={settings.grid} onResult={handleResult} buzz={buzz} notify={notify} />}
        {tab === 'manual' && <ManualScreen onResult={handleResult} buzz={buzz} notify={notify} />}
        {tab === 'reports' && <ReportsScreen record={current} accent={accentHex} onLoadResult={loadResultById} onDeleteResult={deleteResultById} onNavigate={setTab} buzz={buzz} notify={notify} refreshKey={refreshKey} />}
        {tab === 'analytics' && <AnalyticsScreen accent={accentHex} buzz={buzz} notify={notify} />}
        {tab === 'settings' && <SettingsScreen settings={settings} setSettings={setSettings} onClearHistory={clearSessionResults} buzz={buzz} />}
      </main>
      <BottomNav tab={tab} setTab={setTab} buzz={buzz} />
      <SessionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sessions={sessions} activeId={activeId} counts={{}} onSelect={(id) => { setActiveId(id); setDrawerOpen(false); }} onCreate={create} onDelete={remove} onRefresh={refresh} ready={ready} />
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="fade-up rounded-full border border-accent/40 bg-ink-900/95 px-5 py-2.5 text-sm font-bold text-accent shadow-glow backdrop-blur">{toast}</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <LanguageProvider><SessionProvider><Shell /></SessionProvider></LanguageProvider>;
}
