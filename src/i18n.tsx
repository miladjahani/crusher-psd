import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Lang = 'en' | 'fa';

const en = {
  appName: 'Crusher PSD',
  appTagline: 'Particle Size Distribution Analysis',
  tabVisual: 'Visual AI',
  tabManual: 'Manual',
  tabReports: 'Reports',
  tabSettings: 'Settings',
  // Visual AI
  visualTitle: 'Visual AI Analysis',
  visualDesc: 'Upload a photo of the crushed sample — the AI engine estimates the PSD automatically.',
  uploadTitle: 'Tap to upload sample image',
  uploadHint: 'JPG or PNG • good lighting • flat surface',
  startScan: 'Start AI Scan',
  rescan: 'New Image',
  stage0: 'Preprocessing image…',
  stage1: 'Detecting particle boundaries…',
  stage2: 'Measuring equivalent diameters…',
  stage3: 'Fitting distribution curve…',
  scanDone: 'Analysis Complete',
  scanDoneDesc: 'PSD curve estimated from image analysis.',
  viewResults: 'View Results & Curve',
  particlesDetected: 'Particles',
  confidence: 'Confidence',
  // Manual
  manualTitle: 'Manual Sieve Analysis',
  manualDesc: 'Enter sieve openings and retained mass. The passing curve is calculated instantly.',
  sampleName: 'Sample ID',
  samplePlaceholder: 'e.g. CR-2026-07',
  sieveSize: 'Sieve Size (mm)',
  weightRetained: 'Weight Retained (g)',
  addRow: 'Add Sieve',
  loadStandard: 'Standard Series',
  clearAll: 'Clear',
  totalMass: 'Total mass',
  generateCurve: 'Generate Curve',
  needMoreRows: 'Add at least 2 valid rows (size & weight).',
  // Reports
  reportsTitle: 'PSD Dashboard',
  noData: 'No analysis yet',
  noDataHint: 'Run a Visual AI scan or enter sieve data manually to see the curve here.',
  psdChart: 'Particle Size Distribution',
  percentPassing: '% Passing',
  effectiveSize: 'Effective size',
  medianSize: 'Median size',
  coarseSize: 'Coarse fraction',
  uniformity: 'Uniformity',
  curvature: 'Curvature',
  gradation: 'Gradation',
  wellGraded: 'Well-graded',
  uniformGraded: 'Uniform',
  gapGraded: 'Gap-graded',
  exportTitle: 'Export Report',
  downloadPDF: 'Download PDF Report',
  exportExcel: 'Export to Excel (XLSX)',
  dataTable: 'Sieve Data',
  colRetained: 'Retained (g)',
  colRetPct: '% Retained',
  colCumRet: 'Cum. % Ret',
  colPassing: '% Passing',
  history: 'History',
  load: 'Load',
  delete: 'Delete',
  sourceAI: 'AI Scan',
  sourceManual: 'Manual',
  savedToast: 'Analysis saved to history',
  deletedToast: 'Record deleted',
  date: 'Date',
  sourceLabel: 'Source',
  // Settings
  settingsTitle: 'Settings',
  language: 'Language / زبان',
  accentColor: 'Accent Color',
  neonGreen: 'Neon Green',
  safetyYellow: 'Safety Yellow',
  plasmaCyan: 'Plasma Cyan',
  scannerGrid: 'Scanner grid overlay',
  haptics: 'Haptic feedback',
  clearHistory: 'Clear all history',
  historyCleared: 'History cleared',
  about: 'About',
  aboutText:
    'Industrial PSD toolkit for crusher product QC. Sieve math follows ASTM D6913 methodology with logarithmic interpolation for Dx values.',
  version: 'Version',
  grams: 'g',
};

export type TKey = keyof typeof en;

// TypeScript enforces a complete Persian dictionary:
const fa: Record<TKey, string> = {
  appName: 'آنالیز سنگ‌شکن',
  appTagline: 'آنالیز توزیع اندازه ذرات',
  tabVisual: 'آنالیز تصویری',
  tabManual: 'ورودی دستی',
  tabReports: 'گزارش‌ها',
  tabSettings: 'تنظیمات',
  visualTitle: 'آنالیز تصویری هوشمند',
  visualDesc: 'تصویر نمونه خردشده را بارگذاری کنید؛ موتور هوش مصنوعی منحنی PSD را خودکار تخمین می‌زند.',
  uploadTitle: 'برای بارگذاری تصویر نمونه ضربه بزنید',
  uploadHint: 'JPG یا PNG • نور مناسب • سطح صاف',
  startScan: 'شروع اسکن هوشمند',
  rescan: 'تصویر جدید',
  stage0: 'پیش‌پردازش تصویر…',
  stage1: 'تشخیص مرز ذرات…',
  stage2: 'اندازه‌گیری قطر معادل ذرات…',
  stage3: 'برازش منحنی توزیع…',
  scanDone: 'آنالیز کامل شد',
  scanDoneDesc: 'منحنی PSD از تحلیل تصویر تخمین زده شد.',
  viewResults: 'مشاهده نتایج و منحنی',
  particlesDetected: 'ذرات',
  confidence: 'دقت تخمین',
  manualTitle: 'آنالیز دستی سرند',
  manualDesc: 'سایز سرند و وزن مانده را وارد کنید؛ منحنی عبور بلافاصله محاسبه می‌شود.',
  sampleName: 'شناسه نمونه',
  samplePlaceholder: 'مثلاً CR-1405-07',
  sieveSize: 'سایز سرند (mm)',
  weightRetained: 'وزن مانده (g)',
  addRow: 'افزودن سرند',
  loadStandard: 'سری استاندارد',
  clearAll: 'پاک کردن',
  totalMass: 'وزن کل',
  generateCurve: 'رسم منحنی',
  needMoreRows: 'حداقل ۲ ردیف معتبر (سایز و وزن) وارد کنید.',
  reportsTitle: 'داشبورد PSD',
  noData: 'هنوز آنالیزی انجام نشده',
  noDataHint: 'یک اسکن تصویری انجام دهید یا داده سرند را دستی وارد کنید تا منحنی اینجا نمایش داده شود.',
  psdChart: 'توزیع اندازه ذرات',
  percentPassing: 'درصد عبور',
  effectiveSize: 'اندازه مؤثر',
  medianSize: 'اندازه میانه',
  coarseSize: 'بخش درشت',
  uniformity: 'یکنواختی',
  curvature: 'انحنا',
  gradation: 'درجه‌بندی',
  wellGraded: 'خوب درجه‌بندی‌شده',
  uniformGraded: 'یکنواخت',
  gapGraded: 'دانه‌بندی گسسته',
  exportTitle: 'خروجی گزارش',
  downloadPDF: 'دانلود گزارش PDF',
  exportExcel: 'خروجی اکسل (XLSX)',
  dataTable: 'داده‌های سرند',
  colRetained: 'مانده (g)',
  colRetPct: 'درصد مانده',
  colCumRet: 'مانده تجمعی٪',
  colPassing: 'درصد عبور',
  history: 'تاریخچه',
  load: 'بارگذاری',
  delete: 'حذف',
  sourceAI: 'اسکن هوشمند',
  sourceManual: 'دستی',
  savedToast: 'آنالیز در تاریخچه ذخیره شد',
  deletedToast: 'رکورد حذف شد',
  date: 'تاریخ',
  sourceLabel: 'منبع',
  settingsTitle: 'تنظیمات',
  language: 'Language / زبان',
  accentColor: 'رنگ تأکیدی',
  neonGreen: 'سبز نئون',
  safetyYellow: 'زرد ایمنی',
  plasmaCyan: 'فیروزه‌ای',
  scannerGrid: 'شبکه روی اسکنر',
  haptics: 'بازخورد لمسی',
  clearHistory: 'پاک کردن تاریخچه',
  historyCleared: 'تاریخچه پاک شد',
  about: 'درباره',
  aboutText:
    'ابزار صنعتی کنترل کیفیت محصول سنگ‌شکن؛ محاسبات مطابق روش سرند ASTM D6913 با درون‌یابی لگاریتمی برای مقادیر Dx.',
  version: 'نسخه',
  grams: 'گرم',
};

export const dict: Record<Lang, Record<TKey, string>> = { en, fa };

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const toFaDigits = (v: string | number) =>
  String(v).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

/** Jalali (Persian calendar) date with Persian numerals, e.g. ۱۴۰۵/۰۵/۰۱ */
export const jalali = (ts: number = Date.now()) =>
  new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);

export const greg = (ts: number = Date.now()) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(ts);

interface I18nValue {
  lang: Lang;
  isFa: boolean;
  dir: 'ltr' | 'rtl';
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
  /** locale-aware number display (Persian digits when FA) */
  num: (v: string | number) => string;
}

const Ctx = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('psd-lang') as Lang) || 'en';
    } catch {
      return 'en';
    }
  });

  const dir: 'ltr' | 'rtl' = lang === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    // Dynamic RTL/LTR switching for the whole document:
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    document.title = `${dict[lang].appName} — ${dict[lang].appTagline}`;
    try {
      localStorage.setItem('psd-lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang, dir]);

  const t = useCallback((k: TKey) => dict[lang][k] ?? dict.en[k] ?? k, [lang]);
  const num = useCallback(
    (v: string | number) => (lang === 'fa' ? toFaDigits(v) : String(v)),
    [lang]
  );

  return (
    <Ctx.Provider value={{ lang, isFa: lang === 'fa', dir, setLang, t, num }}>
      {children}
    </Ctx.Provider>
  );
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <LanguageProvider>');
  return v;
}
