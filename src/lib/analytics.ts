// src/lib/analytics.ts — pure math helpers for the Analytics tab (no React, no DOM, no deps).
export interface Limits { mean: number; sigma: number; ucl2: number; lcl2: number; ucl3: number; lcl3: number; n: number; }
export interface Box { min: number; q1: number; median: number; q3: number; max: number; n: number; }

export function controlLimits(values: number[]): Limits | null {
  const v = values.filter((x) => isFinite(x));
  if (v.length < 2) return null;
  const n = v.length;
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const sigma = Math.sqrt(variance);
  return { mean, sigma, ucl2: mean + 2 * sigma, lcl2: mean - 2 * sigma, ucl3: mean + 3 * sigma, lcl3: mean - 3 * sigma, n };
}

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
export function boxStats(values: number[]): Box | null {
  const v = values.filter((x) => isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return { min: v[0], q1: quantile(v, 0.25), median: quantile(v, 0.5), q3: quantile(v, 0.75), max: v[v.length - 1], n: v.length };
}

export const dayOfMonth = (t: number) => new Date(t).getDate();
export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const startOfMonth = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
export const startOfYear = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), 0, 1).getTime(); };
export const addMonths = (t: number, m: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + m, 1).getTime(); };
export const addYears = (t: number, y: number) => { const d = new Date(t); return new Date(d.getFullYear() + y, d.getMonth(), 1).getTime(); };

// average value per day-of-month within a range (for month-vs-month overlay on a 1..31 axis)
export function dayOfMonthSeries(points: { t: number; v: number }[]): { day: number; v: number }[] {
  const byDay: Record<number, number[]> = {};
  for (const p of points) { if (!isFinite(p.v)) continue; const d = dayOfMonth(p.t); (byDay[d] = byDay[d] || []).push(p.v); }
  return Object.keys(byDay).map((k) => ({ day: Number(k), v: byDay[Number(k)].reduce((s, x) => s + x, 0) / byDay[Number(k)].length })).sort((a, b) => a.day - b.day);
}
