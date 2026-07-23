// src/lib/constants.ts — runtime constants & small helpers (no history here anymore; IDB is the source of truth).
import type { AccentId, SettingsState } from './types';

export const ACCENTS: { id: AccentId; rgb: string; hex: string }[] = [
  { id: 'green', rgb: '0 230 118', hex: '#00e676' },
  { id: 'yellow', rgb: '255 196 0', hex: '#ffc400' },
  { id: 'cyan', rgb: '34 211 238', hex: '#22d3ee' },
];
export const DEFAULT_SETTINGS: SettingsState = { accent: 'green', grid: true, haptics: true };
export const uid = () => Math.random().toString(36).slice(2, 10);
export function loadSettings(): SettingsState {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('psd-settings') || '{}') }; }
  catch { return DEFAULT_SETTINGS; }
}
export const inputCls =
  'h-12 w-full rounded-xl border border-white/10 bg-ink-900/60 px-3 text-base font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-accent focus:ring-2 focus:ring-accent/25';
