import type { PSDResult } from './psd';

export type ReportStrings = Record<string, string>;

export interface ReportMeta {
  sampleName: string;
  source: string;
  dateJalali: string;
  dateGreg: string;
  lang: 'en' | 'fa';
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** Excel 2003 XML Spreadsheet — opens natively in Excel/LibreOffice, zero deps. */
export function exportExcel(res: PSDResult, meta: ReportMeta, L: ReportStrings) {
  const esc = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cell = (v: string | number, style = '') => {
    const type = typeof v === 'number' ? 'Number' : 'String';
    return `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="${type}">${esc(v)}</Data></Cell>`;
  };
  const rowsDesc = [...res.points].reverse();
  const head = `<Row>${cell(L.sieve, 'h')}${cell(L.weight, 'h')}${cell(L.retPct, 'h')}${cell(
    L.cumRet,
    'h'
  )}${cell(L.passing, 'h')}</Row>`;
  const body = rowsDesc
    .map(
      (p) =>
        `<Row>${cell(p.size)}${cell(+p.weight.toFixed(2))}${cell(+p.retained.toFixed(2))}${cell(
          +p.cumRetained.toFixed(2)
        )}${cell(+p.passing.toFixed(2))}</Row>`
    )
    .join('');
  const metric = (k: string, v: number | null) =>
    `<Row>${cell(k, 'h')}${cell(v == null ? '—' : +v.toFixed(3))}</Row>`;
  const metrics =
    '<Row/>' +
    metric('D10 (mm)', res.d10) +
    metric('D50 (mm)', res.d50) +
    metric('D80 (mm)', res.d80) +
    metric('Cu', res.cu) +
    metric('Cc', res.cc);
  const metaRows =
    `<Row>${cell(L.sample, 'h')}${cell(meta.sampleName)}</Row>` +
    `<Row>${cell(L.date, 'h')}${cell(`${meta.dateGreg}  |  ${meta.dateJalali}`)}</Row>` +
    `<Row>${cell(L.sourceLabel, 'h')}${cell(meta.source)}</Row><Row/>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#0B0F14"/><Interior ss:Color="#00E676" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="PSD"><Table>${metaRows}${head}${body}${metrics}</Table></Worksheet>
</Workbook>`;

  triggerDownload(
    new Blob([xml], { type: 'application/vnd.ms-excel' }),
    `PSD_${meta.sampleName.replace(/\s+/g, '_') || 'report'}.xls`
  );
}

/** Light-themed SVG chart for the printable report. */
function chartSVG(res: PSDResult): string {
  const W = 760, H = 340, ml = 46, mr = 14, mt = 14, mb = 40;
  const iw = W - ml - mr, ih = H - mt - mb;
  const sizes = res.points.map((p) => p.size);
  const lo = Math.log10(Math.min(...sizes));
  const hi = Math.log10(Math.max(...sizes));
  const X = (s: number) => ml + ((Math.log10(s) - lo) / (hi - lo)) * iw;
  const Y = (p: number) => mt + (1 - p / 100) * ih;

  const vLines = res.points
    .map((p) => `<line x1="${X(p.size)}" y1="${mt}" x2="${X(p.size)}" y2="${mt + ih}" stroke="#eef2f7"/>`)
    .join('');
  const hLines = [0, 20, 40, 60, 80, 100]
    .map(
      (p) =>
        `<line x1="${ml}" y1="${Y(p)}" x2="${ml + iw}" y2="${Y(p)}" stroke="#eef2f7"/><text x="${ml - 6}" y="${Y(p) + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${p}</text>`
    )
    .join('');
  const xLabels = res.points
    .map(
      (p) =>
        `<text x="${X(p.size)}" y="${mt + ih + 14}" text-anchor="middle" font-size="8.5" fill="#94a3b8">${p.size}</text>`
    )
    .join('');
  const path = res.points
    .map((p, i) => `${i ? 'L' : 'M'}${X(p.size).toFixed(1)},${Y(p.passing).toFixed(1)}`)
    .join('');
  const last = res.points[res.points.length - 1];
  const area = `${path}L${X(last.size).toFixed(1)},${Y(0)}L${X(res.points[0].size).toFixed(1)},${Y(0)}Z`;
  const dots = res.points
    .map((p) => `<circle cx="${X(p.size)}" cy="${Y(p.passing)}" r="3" fill="#00a651"/>`)
    .join('');
  const dline = (v: number | null, c: string, lab: string) =>
    v
      ? `<line x1="${X(v)}" y1="${mt}" x2="${X(v)}" y2="${mt + ih}" stroke="${c}" stroke-dasharray="5 4" stroke-width="1.4"/><text x="${X(v) + 3}" y="${mt + 10}" font-size="9.5" font-weight="700" fill="${c}">${lab}</text>`
      : '';

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;border:1.5px solid #e2e8f0;border-radius:12px">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00a651" stop-opacity=".22"/><stop offset="1" stop-color="#00a651" stop-opacity=".02"/></linearGradient></defs>
${vLines}${hLines}
<path d="${area}" fill="url(#g)"/>
<path d="${path}" fill="none" stroke="#00a651" stroke-width="2.6" stroke-linecap="round"/>
${dots}
${dline(res.d10, '#d97706', 'D10')}${dline(res.d50, '#0f766e', 'D50')}${dline(res.d80, '#0284c7', 'D80')}
${xLabels}
</svg>`;
}

/** Opens a print-ready report window (Save as PDF on desktop / Share→Print on mobile). */
export function exportPDF(res: PSDResult, meta: ReportMeta, L: ReportStrings): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  const rtl = meta.lang === 'fa';
  const rowsDesc = [...res.points].reverse();
  const f = (v: number | null, d = 2) => (v == null ? '—' : v.toFixed(d));

  w.document.write(`<!doctype html>
<html dir="${rtl ? 'rtl' : 'ltr'}" lang="${meta.lang}">
<head>
<meta charset="utf-8"/>
<title>PSD Report — ${meta.sampleName}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Vazirmatn:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{font-family:${rtl ? 'Vazirmatn' : 'Inter'},sans-serif;margin:0;color:#0f172a;background:#fff}
.wrap{max-width:800px;margin:0 auto;padding:28px}
.hd{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:4px solid #00a651;padding-bottom:14px;margin-bottom:16px}
h1{font-size:20px;margin:0}
.sub{color:#64748b;font-size:12px;margin-top:4px}
.badge{background:#0f172a;color:#00e676;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:800;display:inline-block}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}
.kpi{border:1.5px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center}
.kpi b{display:block;font-size:20px}
.kpi span{font-size:11px;color:#64748b}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th{background:#0f172a;color:#e2e8f0;padding:8px;text-align:center}
td{border:1px solid #e2e8f0;padding:7px;text-align:center}
tr:nth-child(even) td{background:#f8fafc}
.pass{font-weight:800;color:#00874a}
.ft{margin-top:22px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
@media print{.wrap{padding:0}}
</style>
</head>
<body onload="setTimeout(function(){window.print()},400)">
<div class="wrap">
  <div class="hd">
    <div><h1>${L.psd}</h1><div class="sub">${meta.sampleName} • ${meta.source}</div></div>
    <div style="text-align:${rtl ? 'left' : 'right'}">
      <span class="badge">PSD • ASTM D6913</span>
      <div class="sub">${meta.dateGreg}<br/>${meta.dateJalali}</div>
    </div>
  </div>
  ${chartSVG(res)}
  <div class="kpis">
    <div class="kpi"><span>D10 • ${L.eff}</span><b>${f(res.d10, 3)} mm</b></div>
    <div class="kpi"><span>D50 • ${L.med}</span><b>${f(res.d50, 3)} mm</b></div>
    <div class="kpi"><span>D80 • ${L.coarse}</span><b>${f(res.d80, 3)} mm</b></div>
  </div>
  <table>
    <thead><tr><th>${L.sieve}</th><th>${L.weight}</th><th>${L.retPct}</th><th>${L.cumRet}</th><th>${L.passing}</th></tr></thead>
    <tbody>${rowsDesc
      .map(
        (p) =>
          `<tr><td>${p.size}</td><td>${p.weight.toFixed(1)}</td><td>${p.retained.toFixed(1)}</td><td>${p.cumRetained.toFixed(1)}</td><td class="pass">${p.passing.toFixed(1)}</td></tr>`
      )
      .join('')}</tbody>
  </table>
  <div class="ft">
    <span>Cu = ${f(res.cu)} • Cc = ${f(res.cc)} • ${L.grad}: ${L.gradVal}</span>
    <span>Crusher PSD Analyzer v1.0</span>
  </div>
</div>
</body>
</html>`);
  w.document.close();
  return true;
}
