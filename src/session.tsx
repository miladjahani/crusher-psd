// src/session.tsx — SessionContext: list/create/switch/delete sessions + active-session wiring.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  ensureReady, listSessions, createSession as dbCreate, updateSession as dbUpdate,
  deleteSession as dbDelete, countBySession, setActiveSessionId, QUICK_ID, type Session,
} from './db';

const COLORS = ['#00e676', '#ffc400', '#22d3ee', '#f472b6', '#a78bfa', '#fb923c'];

interface SessionCtx {
  ready: boolean;
  sessions: Session[];
  activeId: string | null;
  counts: Record<string, number>;
  setActiveId: (id: string) => void;
  create: (name: string, location?: string) => Promise<string>;
  update: (id: string, patch: Partial<Session>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}
const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    await ensureReady();
    const [ss, c] = await Promise.all([listSessions(), countBySession()]);
    setSessions(ss); setCounts(c);
    return ss;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ss = await load();
      if (!alive) return;
      let saved: string | null = null;
      try { saved = localStorage.getItem('psd-active-session'); } catch {}
      const initial = (saved && ss.some((s) => s.id === saved) ? saved : null) || ss[0]?.id || QUICK_ID;
      setActiveIdState(initial);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [load]);

  useEffect(() => {
    if (!activeId) return;
    setActiveSessionId(activeId);
    try { localStorage.setItem('psd-active-session', activeId); } catch {}
  }, [activeId]);

  const setActiveId = useCallback((id: string) => setActiveIdState(id), []);

  const create = useCallback(async (name: string, location?: string) => {
    const color = COLORS[sessions.filter((s) => s.id !== QUICK_ID).length % COLORS.length];
    const id = await dbCreate({ name: name.trim() || 'Untitled', location: location?.trim() || undefined, color });
    await load(); setActiveIdState(id); return id;
  }, [load, sessions]);

  const update = useCallback(async (id: string, patch: Partial<Session>) => { await dbUpdate(id, patch); await load(); }, [load]);

  const remove = useCallback(async (id: string) => {
    if (id === QUICK_ID) return;
    await dbDelete(id);
    const ss = await load();
    if (activeId === id) setActiveIdState(ss[0]?.id || QUICK_ID);
  }, [load, activeId]);

  const refresh = useCallback(async () => { await load(); }, [load]);

  return <Ctx.Provider value={{ ready, sessions, activeId, counts, setActiveId, create, update, remove, refresh }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx); if (!v) throw new Error('useSession must be inside <SessionProvider>'); return v;
}
