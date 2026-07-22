export interface SieveInput {
  size: number; // mm
  weight: number; // g retained
}

export interface PSDPoint {
  size: number;
  weight: number;
  retained: number; // %
  cumRetained: number; // %
  passing: number; // %
}

export interface PSDResult {
  points: PSDPoint[]; // sorted ascending by size
  totalWeight: number;
  d10: number | null;
  d30: number | null;
  d50: number | null;
  d60: number | null;
  d80: number | null;
  cu: number | null; // uniformity coefficient D60/D10
  cc: number | null; // coefficient of gradation D30²/(D60·D10)
}

/** Log-scale linear interpolation of Dx between adjacent sieves. */
function interpD(asc: PSDPoint[], p: number): number | null {
  if (!asc.length) return null;
  const first = asc[0];
  const last = asc[asc.length - 1];
  if (p <= first.passing) return p === first.passing ? first.size : null;
  if (p >= last.passing) return p === last.passing ? last.size : null;
  for (let i = 0; i < asc.length - 1; i++) {
    const a = asc[i];
    const b = asc[i + 1];
    if (p >= a.passing && p <= b.passing) {
      if (b.passing === a.passing) return a.size;
      const ratio = (p - a.passing) / (b.passing - a.passing);
      const logD = Math.log10(a.size) + ratio * (Math.log10(b.size) - Math.log10(a.size));
      return Math.pow(10, logD);
    }
  }
  return null;
}

export function computePSD(rows: SieveInput[]): PSDResult | null {
  const valid = rows.filter((r) => isFinite(r.size) && r.size > 0 && isFinite(r.weight) && r.weight >= 0);
  if (valid.length < 2) return null;
  const desc = [...valid].sort((a, b) => b.size - a.size); // largest sieve first
  const totalWeight = desc.reduce((s, r) => s + r.weight, 0);
  if (totalWeight <= 0) return null;

  let cum = 0;
  const descPts: PSDPoint[] = desc.map((r) => {
    const retained = (r.weight / totalWeight) * 100;
    cum += retained;
    return {
      size: r.size,
      weight: r.weight,
      retained,
      cumRetained: cum,
      passing: Math.max(0, 100 - cum),
    };
  });

  const points = [...descPts].reverse(); // ascending for chart + Dx
  const d10 = interpD(points, 10);
  const d30 = interpD(points, 30);
  const d50 = interpD(points, 50);
  const d60 = interpD(points, 60);
  const d80 = interpD(points, 80);

  return {
    points,
    totalWeight,
    d10,
    d30,
    d50,
    d60,
    d80,
    cu: d10 && d60 ? d60 / d10 : null,
    cc: d10 && d30 && d60 ? (d30 * d30) / (d60 * d10) : null,
  };
}

export function classify(r: PSDResult): 'well' | 'uniform' | 'gap' {
  if (r.cu != null && r.cc != null && r.cu >= 4 && r.cc >= 1 && r.cc <= 3) return 'well';
  if (r.cu != null && r.cu < 2) return 'uniform';
  return 'gap';
}

export const STANDARD_SIEVES = [25, 19, 12.5, 9.5, 4.75, 2.36, 1.18, 0.6, 0.3, 0.15, 0.075];

/** Mock AI output: well-graded crusher product with realistic jitter. */
export function generateMockSieveData(): SieveInput[] {
  const target = [100, 95, 84, 75, 62, 48, 37, 28, 19, 10, 4]; // % passing per sieve
  const total = 2400 + Math.random() * 500;
  return STANDARD_SIEVES.map((size, i) => {
    const retPct = i < target.length - 1 ? target[i] - target[i + 1] : target[i];
    return { size, weight: Math.max(0, (retPct * (0.78 + Math.random() * 0.44) * total) / 100) };
  });
}

export const fmtSize = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? '—' : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3);
