// src/components/ui.tsx — shared presentational primitives.
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl ${className}`}>{children}</div>;
}

export function ScreenTitle({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent"><Icon size={21} /></div>
      <div><h2 className="text-lg font-black leading-tight">{title}</h2><p className="mt-1 text-xs leading-relaxed text-zinc-400">{desc}</p></div>
    </div>
  );
}

export function KPI({ label, sub, value, unit, color }: { label: string; sub?: string; value: string; unit?: string; color?: string }) {
  const { num } = useI18n();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl">
      {color && <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />}
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums" style={color ? { color } : undefined}>{num(value)}{unit && <span className="ms-1 text-[11px] font-bold text-zinc-500">{unit}</span>}</div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}
