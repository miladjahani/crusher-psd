// src/lib/types.ts — shared types only (no runtime values).
import type { PSDResult, SieveInput } from '../psd';

export type Tab = 'visual' | 'manual' | 'reports' | 'settings';
export type HandleResult = (rows: SieveInput[], result: PSDResult, source: 'ai' | 'manual', name: string) => void;
export type Buzz = (ms?: number) => void;
export type Notify = (msg: string) => void;

export interface AnalysisRecord {
  id: string;
  sampleName: string;
  source: 'ai' | 'manual';
  createdAt: number;
  rows: SieveInput[];
  result: PSDResult;
}

export type AccentId = 'green' | 'yellow' | 'cyan';
export interface SettingsState { accent: AccentId; grid: boolean; haptics: boolean; }
