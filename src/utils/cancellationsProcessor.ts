import * as XLSX from 'xlsx';

/* =====================================================================
 *  Cancellation Requests 2026 — data model, parsing & aggregation
 *  This file is intentionally independent from dataProcessor.ts /
 *  csvParser.ts so the existing dashboard is not affected in any way.
 * ===================================================================== */

export interface CancellationRecord {
  seq: string;
  membershipId: string;
  memberName: string;
  subscriptionDate: string; // YYYY-MM-DD or ''
  requestDate: string; // YYYY-MM-DD or ''
  periodDays: number | null;
  periodClass: string; // تصنيف فترة الاشتراك (as written in the sheet)
  membershipType: string; // نوع العضوية
  club: string; // نادي الفرع
  paymentMethod: string; // طريقة الدفع
  currency: string; // العملة
  reason: string; // سبب الإلغاء
  reasonDetail: string;
  committeeDecision: string;
  rejectionReason: string;
  committeeNo: string;
  approvalDate: string; // تاريخ موافقة اللجنة
  refundTotal: number; // مبلغ الاسترداد الكلي
  refundCompanies: number; // رد للعميل (Companies)
  status: string; // حالة الإلغاء
  statusDate: string;
  exception: string;
  exceptionType: string;
}

/* ---------------------------------------------------------------------
 *  RULES — edit here if the business rules change
 * ------------------------------------------------------------------- */

export const UNSPECIFIED = 'غير محدد';

/** A record counts as a "refund" only when its status is Cancelled (Deletion is NOT included). */
export const REFUND_STATUS_KEYWORDS = ['cancel', 'ملغ', 'إلغاء', 'الغاء'];

/** A membership is International (WDI) when its type contains one of these, or when its currency is not EGP. */
export const WDI_KEYWORDS = ['wdi', 'international', 'دولي'];

/** Payment-method grouping. First matching group wins (order matters). */
export const PAYMENT_GROUPS: { group: string; keywords: string[] }[] = [
  { group: 'Cheques', keywords: ['شيك', 'شيكات', 'cheque', 'check'] },
  { group: 'Cash', keywords: ['كاش', 'نقد', 'cash'] },
  {
    group: 'Companies',
    keywords: [
      'شركة', 'شركات', 'company', 'companies', 'تمويل',
      'ollin', 'اولين', 'أولين', 'premium', 'بريميم', 'aman', 'امان', 'أمان',
      'contact', 'كونتكت', 'valu', 'فاليو', 'sympl', 'سيمبل', 'souhoola', 'سهولة',
    ],
  },
  {
    group: 'Banks',
    keywords: [
      'بنك', 'بنكي', 'bank', 'visa', 'فيزا', 'master', 'ماستر', 'card', 'كارت', 'بطاقة',
      'تحويل', 'transfer', 'تقسيط', 'instapay', 'انستا', 'cib', 'nbe', 'qnb',
    ],
  },
  { group: 'default', keywords: ['default', 'ديفولت', 'افتراضي'] },
];
export const PAYMENT_GROUP_ORDER = ['Companies', 'Banks', 'Cash', 'Cheques', 'default', 'Other'];
export const PAYMENT_GROUP_COLORS: Record<string, string> = {
  Companies: '#6366f1',
  Banks: '#0ea5e9',
  Cash: '#10b981',
  Cheques: '#f59e0b',
  default: '#ef4444',
  Other: '#94a3b8',
};

/* ---------------------------------------------------------------------
 *  Normalisation helpers
 * ------------------------------------------------------------------- */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d)));
}

function clean(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
}

function normKey(k: string): string {
  return clean(k).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Excel serial / Date / "dd/mm/yyyy" / "yyyy-mm-dd" / Arabic digits -> YYYY-MM-DD */
export function parseDateValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) {
      const p = XLSX.SSF.parse_date_code(v);
      if (p) return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
    }
    return '';
  }
  const s = toLatinDigits(clean(v));
  if (!s) return '';
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDateValue(parseFloat(s));
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // Egypt: day first
  if (m) {
    let d = +m[1];
    let mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return `${m[3]}-${pad(mo)}-${pad(d)}`;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) return `20${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return '';
}

function parseNumber(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = toLatinDigits(clean(v)).replace(/[٬,]/g, '').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/* ---------------------------------------------------------------------
 *  Sheet parsing
 * ------------------------------------------------------------------- */

const COLUMN_ALIASES: Record<keyof CancellationRecord, string[]> = {
  seq: ['م (تسلسلي)', 'م', 'تسلسلي'],
  membershipId: ['رقم العضوية'],
  memberName: ['اسم العضو المشترك', 'اسم العضو'],
  subscriptionDate: ['تاريخ الاشتراك'],
  requestDate: ['تاريخ الطلب'],
  periodDays: ['فترة الاشتراك باليوم'],
  periodClass: ['تصنيف فترة الاشتراك'],
  membershipType: ['نوع العضوية'],
  club: ['نادي الفرع', 'النادي'],
  paymentMethod: ['طريقة الدفع'],
  currency: ['العملة'],
  reason: ['سبب الإلغاء'],
  reasonDetail: ['السبب بالتفصيل'],
  committeeDecision: ['قرار اللجنة'],
  rejectionReason: ['سبب الرفض'],
  committeeNo: ['رقم اللجنة'],
  approvalDate: ['تاريخ موافقة اللجنة'],
  refundTotal: ['مبلغ الاسترداد الكلي'],
  refundCompanies: ['رد للعميل (Companies)', 'رد للعميل Companies', 'رد للعميل'],
  status: ['حالة الإلغاء'],
  statusDate: ['تاريخ حالة الإلغاء'],
  exception: ['الاستثناء'],
  exceptionType: ['نوع الاستثناء'],
};

/** Columns the dashboard cannot work without. */
const REQUIRED_FIELDS: (keyof CancellationRecord)[] = [
  'requestDate', 'membershipType', 'club', 'paymentMethod', 'approvalDate',
  'refundTotal', 'refundCompanies', 'status', 'periodClass',
];

export interface ParseResult {
  records: CancellationRecord[];
  missingColumns: string[];
  sheetName: string;
}

export function parseCancellationWorkbook(buffer: ArrayBuffer): ParseResult {
  // cellDates:false -> dates stay as Excel serial numbers (no timezone shifts)
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  // Pick the sheet that actually contains the expected headers
  let sheetName = wb.SheetNames[0];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[name], { raw: true, defval: '' });
    if (rows.length && Object.keys(rows[0]).some(k => normKey(k) === normKey('رقم العضوية'))) {
      sheetName = name;
      break;
    }
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { raw: true, defval: '' });
  return mapRows(rows, sheetName);
}

export function mapRows(rows: Record<string, any>[], sheetName = ''): ParseResult {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const headerByNorm = new Map<string, string>();
  headers.forEach(h => headerByNorm.set(normKey(h), h));

  const resolved = {} as Record<keyof CancellationRecord, string | undefined>;
  (Object.keys(COLUMN_ALIASES) as (keyof CancellationRecord)[]).forEach(field => {
    for (const alias of COLUMN_ALIASES[field]) {
      const h = headerByNorm.get(normKey(alias));
      if (h) {
        resolved[field] = h;
        break;
      }
    }
  });

  const missingColumns = REQUIRED_FIELDS.filter(f => !resolved[f]).map(f => COLUMN_ALIASES[f][0]);

  const get = (row: Record<string, any>, f: keyof CancellationRecord) => {
    const h = resolved[f];
    return h ? row[h] : '';
  };

  const records: CancellationRecord[] = [];
  rows.forEach((row, idx) => {
    const hasAny = Object.values(row).some(v => clean(v) !== '');
    if (!hasAny) return;
    const daysRaw = get(row, 'periodDays');
    const days = clean(daysRaw) === '' ? null : parseNumber(daysRaw);
    records.push({
      seq: clean(get(row, 'seq')) || String(idx + 1),
      membershipId: clean(get(row, 'membershipId')),
      memberName: clean(get(row, 'memberName')),
      subscriptionDate: parseDateValue(get(row, 'subscriptionDate')),
      requestDate: parseDateValue(get(row, 'requestDate')),
      periodDays: days,
      periodClass: clean(get(row, 'periodClass')),
      membershipType: clean(get(row, 'membershipType')),
      club: clean(get(row, 'club')),
      paymentMethod: clean(get(row, 'paymentMethod')),
      currency: clean(get(row, 'currency')),
      reason: clean(get(row, 'reason')),
      reasonDetail: clean(get(row, 'reasonDetail')),
      committeeDecision: clean(get(row, 'committeeDecision')),
      rejectionReason: clean(get(row, 'rejectionReason')),
      committeeNo: clean(get(row, 'committeeNo')),
      approvalDate: parseDateValue(get(row, 'approvalDate')),
      refundTotal: parseNumber(get(row, 'refundTotal')),
      refundCompanies: parseNumber(get(row, 'refundCompanies')),
      status: clean(get(row, 'status')),
      statusDate: parseDateValue(get(row, 'statusDate')),
      exception: clean(get(row, 'exception')),
      exceptionType: clean(get(row, 'exceptionType')),
    });
  });

  return { records, missingColumns, sheetName };
}

/* ---------------------------------------------------------------------
 *  Derived values
 * ------------------------------------------------------------------- */

const lc = (s: string) => s.toLowerCase();

export function isRefundStatus(status: string): boolean {
  const s = lc(status);
  return !!s && REFUND_STATUS_KEYWORDS.some(k => s.includes(k));
}

/** Normalises currency spellings: ريال / SR / SAR -> SAR, جنيه / LE -> EGP, ... ('' stays '') */
export function normalizeCurrency(raw: string): string {
  const c = lc(raw).replace(/[.\s]/g, '');
  if (!c) return '';
  if (c.includes('sar') || c === 'sr' || c.includes('ريال') || c.includes('سعود')) return 'SAR';
  if (c.includes('usd') || c.includes('دولار') || c === '$') return 'USD';
  if (c.includes('egp') || c.includes('جني') || c === 'le' || c.includes('مصر')) return 'EGP';
  if (c.includes('aed') || c.includes('درهم')) return 'AED';
  if (c.includes('eur') || c.includes('يورو')) return 'EUR';
  return raw.trim().toUpperCase();
}

/** International (WDI) membership: WDI/International type, or any currency other than EGP. */
export function isWdi(r: CancellationRecord): boolean {
  const t = lc(r.membershipType);
  if (WDI_KEYWORDS.some(k => t.includes(k))) return true;
  const cur = normalizeCurrency(r.currency);
  return cur !== '' && cur !== 'EGP';
}

export function paymentGroupOf(method: string): string {
  const m = lc(method);
  if (!m) return 'Other';
  for (const g of PAYMENT_GROUPS) {
    if (g.keywords.some(k => m.includes(k))) return g.group;
  }
  return 'Other';
}

/** مبلغ الاسترداد الكلي + رد للعميل (Companies) */
export function refundSum(r: CancellationRecord): number {
  return (r.refundTotal || 0) + (r.refundCompanies || 0);
}

/** Refund amount used everywhere in EGP: Cancelled/Deletion only, WDI excluded. */
export function egpRefundAmount(r: CancellationRecord): number {
  if (!isRefundStatus(r.status) || isWdi(r)) return 0;
  return refundSum(r);
}

export const yearOf = (iso: string): string => (iso ? iso.slice(0, 4) : '');
export const monthOf = (iso: string): string => (iso ? iso.slice(0, 7) : '');
const label = (s: string) => s || UNSPECIFIED;

/* ---------------------------------------------------------------------
 *  Filters
 * ------------------------------------------------------------------- */

export interface CancellationFilters {
  payment: string; // 'ALL' | 'g:<group>' | 'o:<raw option>'
  club: string;
  year: string; // from approval date
  type: string; // نوع العضوية
  period: string; // تصنيف فترة الاشتراك
}

export const DEFAULT_CANCELLATION_FILTERS: CancellationFilters = {
  payment: 'ALL',
  club: 'ALL',
  year: 'ALL',
  type: 'ALL',
  period: 'ALL',
};

export function matchesPayment(r: CancellationRecord, selected: string): boolean {
  if (selected === 'ALL') return true;
  if (selected.startsWith('g:')) return paymentGroupOf(r.paymentMethod) === selected.slice(2);
  if (selected.startsWith('o:')) return label(r.paymentMethod) === selected.slice(2);
  return true;
}

export function filterCancellations(records: CancellationRecord[], f: CancellationFilters): CancellationRecord[] {
  return records.filter(r => {
    if (!matchesPayment(r, f.payment)) return false;
    if (f.club !== 'ALL' && label(r.club) !== f.club) return false;
    if (f.year !== 'ALL' && yearOf(r.approvalDate) !== f.year) return false;
    if (f.type !== 'ALL' && label(r.membershipType) !== f.type) return false;
    if (f.period !== 'ALL' && label(r.periodClass) !== f.period) return false;
    return true;
  });
}

/** Local filter used by the Reasons / Timeline / Period charts. */
export function applyChartFilter(records: CancellationRecord[], club: string, payment: string): CancellationRecord[] {
  return records.filter(r => (club === 'ALL' || label(r.club) === club) && matchesPayment(r, payment));
}

/* ---------------------------------------------------------------------
 *  Option lists
 * ------------------------------------------------------------------- */

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'ar'));
}

/** Periods are ordered by their average length in days (short -> long). */
export function orderedPeriods(records: CancellationRecord[]): string[] {
  const stats = new Map<string, { sum: number; n: number }>();
  records.forEach(r => {
    const k = label(r.periodClass);
    const s = stats.get(k) || { sum: 0, n: 0 };
    if (r.periodDays !== null) {
      s.sum += r.periodDays;
      s.n += 1;
    }
    stats.set(k, s);
  });
  return Array.from(stats.entries())
    .sort((a, b) => {
      const av = a[1].n ? a[1].sum / a[1].n : Number.MAX_SAFE_INTEGER;
      const bv = b[1].n ? b[1].sum / b[1].n : Number.MAX_SAFE_INTEGER;
      return av - bv || a[0].localeCompare(b[0], 'ar');
    })
    .map(e => e[0]);
}

export interface FilterOptions {
  clubs: string[];
  years: string[];
  types: string[];
  periods: string[];
  paymentGroups: string[];
  paymentOptions: string[];
}

export function buildFilterOptions(records: CancellationRecord[]): FilterOptions {
  const groups = new Set(records.map(r => paymentGroupOf(r.paymentMethod)));
  return {
    clubs: uniqueSorted(records.map(r => label(r.club))),
    years: Array.from(new Set(records.map(r => yearOf(r.approvalDate)).filter(Boolean))).sort(),
    types: uniqueSorted(records.map(r => label(r.membershipType))),
    periods: orderedPeriods(records),
    paymentGroups: PAYMENT_GROUP_ORDER.filter(g => groups.has(g)),
    paymentOptions: uniqueSorted(records.map(r => label(r.paymentMethod))),
  };
}

/* ---------------------------------------------------------------------
 *  KPI calculations
 * ------------------------------------------------------------------- */

export interface CancellationKpis {
  totalRequests: number;
  statusCounts: { name: string; count: number }[];
  periodCounts: { name: string; count: number }[];
  refundAmount: number; // EGP: Cancelled only, International (WDI) excluded
  companiesRefund: number; // part of refundAmount: رد للعميل (Companies)
  remainingRefund: number; // refundAmount - companiesRefund
  refundCount: number; // all non-international requests (any status)
  wdiByCurrency: { currency: string; amount: number; count: number }[];
  wdiCount: number;
}

export function calculateCancellationKpis(records: CancellationRecord[]): CancellationKpis {
  const statusMap = new Map<string, number>();
  records.forEach(r => statusMap.set(label(r.status), (statusMap.get(label(r.status)) || 0) + 1));

  const periodMap = new Map<string, number>();
  records.forEach(r => periodMap.set(label(r.periodClass), (periodMap.get(label(r.periodClass)) || 0) + 1));

  let refundAmount = 0;
  let companiesRefund = 0;
  let refundCount = 0;
  const wdi = new Map<string, { amount: number; count: number }>();
  let wdiCount = 0;

  // Counts include ALL requests (any status); amounts include Cancelled only.
  records.forEach(r => {
    const cancelled = isRefundStatus(r.status);
    if (isWdi(r)) {
      const cur = normalizeCurrency(r.currency) || 'SAR';
      const e = wdi.get(cur) || { amount: 0, count: 0 };
      if (cancelled) e.amount += refundSum(r);
      e.count += 1;
      wdi.set(cur, e);
      wdiCount += 1;
    } else {
      if (cancelled) {
        refundAmount += refundSum(r);
        companiesRefund += r.refundCompanies || 0;
      }
      refundCount += 1;
    }
  });

  const periodOrder = orderedPeriods(records);
  return {
    totalRequests: records.length,
    statusCounts: Array.from(statusMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    periodCounts: periodOrder.map(name => ({ name, count: periodMap.get(name) || 0 })),
    refundAmount,
    companiesRefund,
    remainingRefund: refundAmount - companiesRefund,
    refundCount,
    wdiByCurrency: Array.from(wdi, ([currency, v]) => ({ currency, ...v })).sort((a, b) => b.amount - a.amount),
    wdiCount,
  };
}

/* ---------------------------------------------------------------------
 *  Chart aggregations
 * ------------------------------------------------------------------- */

export interface Slice {
  name: string;
  count: number;
  amount: number;
  fill: string;
}

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899',
  '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#8b5cf6', '#eab308', '#64748b',
];
export const paletteColor = (i: number) => PALETTE[i % PALETTE.length];

/** count = all requests, amount = EGP refunds (Cancelled + Deletion, no WDI) */
function aggregate(records: CancellationRecord[], keyFn: (r: CancellationRecord) => string) {
  const map = new Map<string, { count: number; amount: number }>();
  records.forEach(r => {
    const k = keyFn(r);
    const e = map.get(k) || { count: 0, amount: 0 };
    e.count += 1;
    e.amount += egpRefundAmount(r);
    map.set(k, e);
  });
  return map;
}

export function paymentBreakdown(records: CancellationRecord[], mode: 'group' | 'option'): Slice[] {
  if (mode === 'group') {
    const map = aggregate(records, r => paymentGroupOf(r.paymentMethod));
    return PAYMENT_GROUP_ORDER.filter(g => map.has(g)).map(g => ({
      name: g,
      ...map.get(g)!,
      fill: PAYMENT_GROUP_COLORS[g],
    }));
  }
  const map = aggregate(records, r => label(r.paymentMethod));
  return Array.from(map, ([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count)
    .map((s, i) => ({ ...s, fill: paletteColor(i) }));
}

export function clubDistribution(records: CancellationRecord[]) {
  const map = aggregate(records, r => label(r.club));
  return Array.from(map, ([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
}

export function reasonDistribution(records: CancellationRecord[]) {
  const map = new Map<string, number>();
  records.forEach(r => map.set(label(r.reason), (map.get(label(r.reason)) || 0) + 1));
  return Array.from(map, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  return idx >= 0 && idx < 12 ? `${MONTH_SHORT[idx]} ${y}` : ym;
}

export function requestTimeline(records: CancellationRecord[]) {
  const map = new Map<string, { count: number; amount: number }>();
  records.forEach(r => {
    const k = monthOf(r.requestDate);
    if (!k) return;
    const e = map.get(k) || { count: 0, amount: 0 };
    e.count += 1;
    e.amount += egpRefundAmount(r);
    map.set(k, e);
  });
  return Array.from(map, ([ym, v]) => ({ ym, month: monthLabel(ym), ...v })).sort((a, b) => a.ym.localeCompare(b.ym));
}

export function periodDistribution(records: CancellationRecord[], order: string[]) {
  const map = new Map<string, number>();
  records.forEach(r => map.set(label(r.periodClass), (map.get(label(r.periodClass)) || 0) + 1));
  return order.map(name => ({ name: periodEn(name), count: map.get(name) || 0 }));
}

/* ---------------------------------------------------------------------
 *  Formatting
 * ------------------------------------------------------------------- */

export const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
export const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export function fmtShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return fmtNum(n);
}

/* ---------------------------------------------------------------------
 *  Committee decisions, rejections, exceptions, month comparison, heatmap
 * ------------------------------------------------------------------- */

/** Checked in this order: rejection first, so "غير موافق" is not read as approval. */
export const REJECT_KEYWORDS = ['غير موافق', 'رفض', 'مرفوض', 'reject', 'declin', 'denied'];
export const APPROVE_KEYWORDS = ['موافق', 'مقبول', 'approv', 'accept'];
/** Values of "الاستثناء" that mean "no exception". */
export const NEGATIVE_EXCEPTION_VALUES = ['لا', 'no', 'false', '0', '-', 'none', 'null', 'n/a', 'na', 'بدون', 'لا يوجد', 'لايوجد'];

export type DecisionKind = 'approved' | 'rejected' | 'other' | 'none';

export function decisionKind(decision: string): DecisionKind {
  const d = lc(decision);
  if (!d) return 'none';
  if (REJECT_KEYWORDS.some(k => d.includes(k))) return 'rejected';
  if (APPROVE_KEYWORDS.some(k => d.includes(k))) return 'approved';
  return 'other';
}

export interface DecisionStats {
  decisions: { name: string; count: number; kind: DecisionKind }[];
  approved: number;
  rejected: number;
  other: number;
  none: number;
  approvalRate: number | null; // approved / (approved + rejected)
  rejectionReasons: { name: string; count: number }[];
  rejectionTotal: number;
}

export function decisionStats(records: CancellationRecord[]): DecisionStats {
  const map = new Map<string, { count: number; kind: DecisionKind }>();
  const counts = { approved: 0, rejected: 0, other: 0, none: 0 };
  const rej = new Map<string, number>();
  records.forEach(r => {
    const kind = decisionKind(r.committeeDecision);
    counts[kind] += 1;
    const name = label(r.committeeDecision);
    const e = map.get(name) || { count: 0, kind };
    e.count += 1;
    map.set(name, e);
    if (r.rejectionReason) rej.set(r.rejectionReason, (rej.get(r.rejectionReason) || 0) + 1);
  });
  const decided = counts.approved + counts.rejected;
  const rejectionReasons = Array.from(rej, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return {
    decisions: Array.from(map, ([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count),
    ...counts,
    approvalRate: decided > 0 ? counts.approved / decided : null,
    rejectionReasons,
    rejectionTotal: rejectionReasons.reduce((s, x) => s + x.count, 0),
  };
}

export function isException(r: CancellationRecord): boolean {
  const v = lc(r.exception);
  if (v) return !NEGATIVE_EXCEPTION_VALUES.includes(v);
  return !!r.exceptionType;
}

export interface ExceptionStats {
  count: number;
  share: number; // of all given records
  amount: number; // EGP refund rule (Cancelled + Deletion, WDI excluded)
  byType: { name: string; count: number; amount: number }[];
}

export function exceptionStats(records: CancellationRecord[]): ExceptionStats {
  const ex = records.filter(isException);
  const map = aggregate(ex, r => label(r.exceptionType));
  return {
    count: ex.length,
    share: records.length ? ex.length / records.length : 0,
    amount: ex.reduce((s, r) => s + egpRefundAmount(r), 0),
    byType: Array.from(map, ([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count),
  };
}

export interface MonthComparison {
  current: string; // YYYY-MM (latest request month in the data)
  previous: string; // the calendar month before it
  curCount: number;
  prevCount: number;
  curAmount: number;
  prevAmount: number;
}

export function monthComparison(records: CancellationRecord[]): MonthComparison | null {
  const months = records.map(r => monthOf(r.requestDate)).filter(Boolean);
  if (!months.length) return null;
  const current = months.reduce((a, b) => (a > b ? a : b));
  const [y, m] = current.split('-').map(Number);
  const previous = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const sum = (ym: string) => {
    const rs = records.filter(r => monthOf(r.requestDate) === ym);
    return { count: rs.length, amount: rs.reduce((s, r) => s + egpRefundAmount(r), 0) };
  };
  const c = sum(current);
  const p = sum(previous);
  return { current, previous, curCount: c.count, prevCount: p.count, curAmount: c.amount, prevAmount: p.amount };
}

/** null when the previous value is 0 (a percentage would be meaningless). */
export function pctChange(cur: number, prev: number): number | null {
  return prev === 0 ? null : (cur - prev) / prev;
}

export interface Heatmap {
  reasons: string[];
  clubs: string[];
  cells: number[][]; // [reason][club]
  rowTotals: number[];
  colTotals: number[];
  max: number;
  hiddenReasons: number;
  total: number;
}

export function reasonClubHeatmap(records: CancellationRecord[], topN: number | null): Heatmap {
  const byReason = new Map<string, number>();
  const byClub = new Map<string, number>();
  const pair = new Map<string, number>();
  records.forEach(r => {
    const re = label(r.reason);
    const cl = label(r.club);
    byReason.set(re, (byReason.get(re) || 0) + 1);
    byClub.set(cl, (byClub.get(cl) || 0) + 1);
    const k = `${re}\u0000${cl}`;
    pair.set(k, (pair.get(k) || 0) + 1);
  });
  const allReasons = Array.from(byReason).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const reasons = topN ? allReasons.slice(0, topN) : allReasons;
  const clubs = Array.from(byClub).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const cells = reasons.map(re => clubs.map(cl => pair.get(`${re}\u0000${cl}`) || 0));
  return {
    reasons,
    clubs,
    cells,
    rowTotals: cells.map(row => row.reduce((s, v) => s + v, 0)),
    colTotals: clubs.map((_, j) => cells.reduce((s, row) => s + row[j], 0)),
    max: Math.max(0, ...cells.flat()),
    hiddenReasons: allReasons.length - reasons.length,
    total: records.length,
  };
}

/* ---------------------------------------------------------------------
 *  Period labels in English (تصنيف فترة الاشتراك)
 *  Add exact overrides here if a label is not translated correctly, e.g.
 *  'أكثر من 3 سنوات': 'over 3 years'
 * ------------------------------------------------------------------- */
export const PERIOD_LABEL_OVERRIDES: Record<string, string> = {};

export function periodEn(raw: string): string {
  if (!raw || raw === UNSPECIFIED) return 'Unspecified';
  if (PERIOD_LABEL_OVERRIDES[raw]) return PERIOD_LABEL_OVERRIDES[raw];
  const t = toLatinDigits(raw).toLowerCase().replace(/[\u0640]/g, '');
  if (/[a-z]/.test(t) && !/[\u0600-\u06FF]/.test(t)) return raw; // already English

  let nums = (t.match(/\d+/g) || []).map(Number);
  if (nums.length === 0) {
    if (/سنتين|سنتان|عامين/.test(t)) nums = [2];
    else if (/شهرين|شهران/.test(t)) nums = [2];
    else if (/ثلاث|تلات/.test(t)) nums = [3];
    else if (/ست(ة|ه)?\b|ستة/.test(t)) nums = [6];
  }
  const hasDay = /يوم|ايام|أيام|day/.test(t);
  const hasMonth = /شهر|اشهر|أشهر|شهور|شهرين|month/.test(t);
  const hasYear = /سنة|سنه|سنين|سنوات|سنتين|سنتان|عام|اعوام|أعوام|عامين|year/.test(t);
  const over = /اكثر|أكثر|اكتر|أكتر|فوق|اعلى|أعلى|اكبر|أكبر|over|more|above|\+/.test(t);
  const range = (a: number, b: number, u: string) => `${Math.min(a, b)}-${Math.max(a, b)} ${u}`;

  if (hasMonth && hasYear && nums.length === 1) return `${nums[0]}-12 months`;
  if (hasDay && !hasMonth && !hasYear) {
    if (nums.length >= 2) return range(nums[0], nums[1], 'days');
    if (nums.length === 1) return over ? `over ${nums[0]} days` : `${nums[0]} days`;
  }
  if (hasMonth && !hasYear) {
    if (nums.length >= 2) return range(nums[0], nums[1], 'months');
    if (nums.length === 1) return over ? `over ${nums[0]} months` : nums[0] === 1 ? '1 month' : `${nums[0]} months`;
  }
  if (hasYear && !hasMonth) {
    const n = nums.length ? nums[nums.length - 1] : 1;
    if (over) return `over ${n} years`;
    return n === 1 ? 'year' : `${n} years`;
  }
  return raw;
}
