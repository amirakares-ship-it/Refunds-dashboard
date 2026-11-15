import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertCircle, Banknote, CalendarClock, CheckCircle2, CircleDollarSign, FileSpreadsheet, Filter,
  Globe2, Hash, Landmark, Layers, ListChecks, Loader2, Maximize2, MessageSquareText, PieChart as PieIcon,
  RotateCcw, Scale, ShieldAlert, ShieldCheck, TrendingUp, Upload, X, LayoutGrid,
} from 'lucide-react';
import { ChartModal } from './ChartModal';
import { ChartModalState } from '../types';
import {
  CancellationFilters, CancellationRecord, DEFAULT_CANCELLATION_FILTERS, PAYMENT_GROUP_COLORS,
  applyChartFilter, buildFilterOptions, calculateCancellationKpis, clubDistribution, filterCancellations,
  fmtMoney, fmtNum, fmtShort, paletteColor, parseCancellationWorkbook, paymentBreakdown,
  periodDistribution, reasonDistribution, requestTimeline,
  decisionStats, exceptionStats, reasonClubHeatmap, periodEn,
} from '../utils/cancellationsProcessor';
import { loadCancellations, loadLocalCancellations, saveCancellations } from '../utils/cancellationsStore';

interface Props {
  isLight: boolean;
  isPresentationMode: boolean;
}

/* ------------------------------------------------------------------ */
/*  Small shared UI pieces                                             */
/* ------------------------------------------------------------------ */

const RADIAN = Math.PI / 180;
const pieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (!percent || percent < 0.04) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      className="text-[11px] font-black pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
};

const tooltipBox = 'bg-slate-900/95 p-3 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1 min-w-[170px]';

interface CardProps {
  chartId: string;
  title: string;
  icon: React.ReactNode;
  isLight: boolean;
  isFullscreen: boolean;
  onExpand: (id: string, title: string) => void;
  controls?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const ChartCard: React.FC<CardProps> = ({ chartId, title, icon, isLight, isFullscreen, onExpand, controls, footer, children }) => (
  <div className={`rounded-2xl border shadow-md flex flex-col justify-between h-full ${isFullscreen ? 'p-4 sm:p-5' : 'p-5'} ${
    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
  }`}>
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center shrink-0">
            {icon}
          </div>
          {!isFullscreen && (
            <h3 className={`text-sm sm:text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{title}</h3>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-2">
          {controls}
          {!isFullscreen && (
            <button
              onClick={() => onExpand(chartId, title)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
              title="View Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
    {footer && (
      <div className={`mt-3 pt-2.5 border-t text-xs flex flex-wrap items-center justify-between gap-2 ${
        isLight ? 'border-slate-200 text-slate-600' : 'border-slate-800 text-slate-400'
      }`}>
        {footer}
      </div>
    )}
  </div>
);

interface SelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  isLight: boolean;
  children: React.ReactNode;
  compact?: boolean;
}

const Select: React.FC<SelectProps> = ({ label, value, onChange, isLight, children, compact }) => (
  <label className={`flex items-center gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'} font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
    <span className="whitespace-nowrap">{label}</span>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      dir="auto"
      className={`rounded-lg border px-2 py-1 font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[170px] ${
        value !== 'ALL'
          ? 'bg-indigo-600/15 border-indigo-500/50 text-indigo-500'
          : isLight ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
      }`}
    >
      {children}
    </select>
  </label>
);

const Segmented = <T extends string>({ options, value, onChange, isLight }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; isLight: boolean;
}) => (
  <div className={`flex p-0.5 rounded-xl border text-xs ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
    {options.map(o => (
      <button
        key={o.id}
        onClick={() => onChange(o.id)}
        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
          value === o.id
            ? 'bg-indigo-600 text-white shadow-xs'
            : isLight ? 'text-slate-600 hover:bg-slate-200/60' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Upload modal (own sheet — not the main dashboard sheet)           */
/* ------------------------------------------------------------------ */

const UploadModal: React.FC<{
  onClose: () => void;
  onLoaded: (records: CancellationRecord[], fileName: string) => void;
}> = ({ onClose, onLoaded }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = async (file: File) => {
    setError(null); setOk(null); setWarn(null); setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') {
        setError('Please upload an Excel file (.xlsx / .xls) using the Cancellation Requests template.');
        return;
      }
      const { records, missingColumns } = parseCancellationWorkbook(await file.arrayBuffer());
      if (missingColumns.length > 0) {
        setError(`These required columns were not found in the sheet: ${missingColumns.join(' ، ')}`);
        return;
      }
      if (records.length === 0) {
        setError('No data rows found in the file.');
        return;
      }
      const res = await saveCancellations(file.name, records);
      onLoaded(records, file.name);
      if (res.cloud) {
        setOk(`Imported ${fmtNum(records.length)} requests and saved to the shared database.`);
      } else {
        setOk(`Imported ${fmtNum(records.length)} requests.`);
        setWarn(
          res.local
            ? `Could not save to the shared database (${res.error}). Data is saved in this browser only for now.`
            : `Could not save anywhere (${res.error}). Data is visible only until you refresh.`
        );
      }
      if (res.cloud) setTimeout(onClose, 1300);
    } catch (e: any) {
      setError(`Failed to read the file: ${e?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-xl text-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Upload Cancellation Requests Sheet</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Separate sheet
                </span>
              </div>
              <p className="text-xs text-slate-400">Used only by this page. The main refunds sheet is not affected.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div
            onDragEnter={e => { e.preventDefault(); setDrag(true); }}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={e => { e.preventDefault(); setDrag(false); }}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) process(f); }}
            onClick={() => !busy && inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center ${
              drag ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 hover:border-indigo-500/50 hover:bg-slate-950'
            }`}
          >
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; if (f) process(f); e.target.value = ''; }} />
            {busy ? <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-3" /> : <FileSpreadsheet className="w-12 h-12 text-indigo-400 mb-3" />}
            <span className="text-sm font-bold text-white">{busy ? 'Reading & saving…' : 'Click to upload or drag & drop the Excel file'}</span>
            <span className="text-xs text-slate-400 mt-1">Uploading replaces the previous Cancellation Requests data</span>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span dir="auto">{error}</span>
            </div>
          )}
          {ok && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><span>{ok}</span>
            </div>
          )}
          {warn && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{warn}</span>
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700">Close</button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  KPI cards                                                          */
/* ------------------------------------------------------------------ */

const KpiBox: React.FC<{
  isLight: boolean; title: string; icon: React.ReactNode; accent: string; children: React.ReactNode;
}> = ({ isLight, title, icon, accent, children }) => (
  <div className={`rounded-2xl p-4 border relative overflow-hidden ${
    isLight ? 'bg-white border-slate-200/80 text-slate-800 shadow-xs' : 'bg-slate-900 border-slate-800 text-slate-100 shadow-md'
  }`}>
    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accent}`} />
    <div className={`flex items-center gap-1.5 text-xs font-bold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
      <div className={`p-1 rounded-lg ${isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-300'}`}>{icon}</div>
      <span dir="auto" className="truncate">{title}</span>
    </div>
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main section                                                       */
/* ------------------------------------------------------------------ */

export const CancellationRequestsSection: React.FC<Props> = ({ isLight, isPresentationMode }) => {
  const [records, setRecords] = useState<CancellationRecord[]>(() => loadLocalCancellations().records);
  const [fileName, setFileName] = useState<string | null>(() => loadLocalCancellations().fileName);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSlot, setFilterSlot] = useState<HTMLElement | null>(null);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<CancellationFilters>(DEFAULT_CANCELLATION_FILTERS);
  const [modal, setModal] = useState<ChartModalState>({ isOpen: false, title: '', chartId: '' });

  // Chart-level state
  const [payMode, setPayMode] = useState<'group' | 'option'>('group');
  const [clubMetric, setClubMetric] = useState<'both' | 'count' | 'amount'>('count');
  const [reasonClub, setReasonClub] = useState('ALL');
  const [reasonPay, setReasonPay] = useState('ALL');
  const [timeClub, setTimeClub] = useState('ALL');
  const [timePay, setTimePay] = useState('ALL');
  const [timeMetric, setTimeMetric] = useState<'both' | 'count' | 'amount'>('count');
  const [periodClub, setPeriodClub] = useState('ALL');
  const [periodPay, setPeriodPay] = useState('ALL');
  const [exMetric, setExMetric] = useState<'both' | 'count' | 'amount'>('count');
  const [heatMode, setHeatMode] = useState<'top10' | 'all'>('top10');

  // The filter icon lives in the app header (next to the presentation icon) — rendered through a portal.
  useEffect(() => {
    setFilterSlot(document.getElementById('cancellation-filter-slot'));
  }, []);
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filterOpen]);

  useEffect(() => {
    loadCancellations()
      .then(s => {
        if (s.records.length > 0) {
          setRecords(s.records);
          setFileName(s.fileName);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const options = useMemo(() => buildFilterOptions(records), [records]);
  const periodOrder = options.periods;
  const filtered = useMemo(() => filterCancellations(records, filters), [records, filters]);
  const kpis = useMemo(() => calculateCancellationKpis(filtered), [filtered]);

  const activeFilterCount = Object.values(filters).filter(v => v !== 'ALL').length;
  const setF = (k: keyof CancellationFilters) => (v: string) => setFilters(p => ({ ...p, [k]: v }));

  const openChart = (id: string, title: string) => setModal({ isOpen: true, chartId: id, title });

  /* ---------------- shared option elements ---------------- */
  const paymentOptionsEls = (
    <>
      <option value="ALL">All</option>
      {options.paymentGroups.length > 0 && (
        <optgroup label="Groups">
          {options.paymentGroups.map(g => <option key={g} value={`g:${g}`}>{g}</option>)}
        </optgroup>
      )}
      <optgroup label="Payment methods">
        {options.paymentOptions.map(o => <option key={o} value={`o:${o}`}>{o}</option>)}
      </optgroup>
    </>
  );
  const clubOptionsEls = (
    <>
      <option value="ALL">All</option>
      {options.clubs.map(c => <option key={c} value={c}>{c}</option>)}
    </>
  );
  const chartFilters = (club: string, setClub: (v: string) => void, pay: string, setPay: (v: string) => void) => (
    <>
      <Select compact label="Club:" value={club} onChange={setClub} isLight={isLight}>{clubOptionsEls}</Select>
      <Select compact label="Payment:" value={pay} onChange={setPay} isLight={isLight}>{paymentOptionsEls}</Select>
    </>
  );

  const axis = isLight ? '#64748b' : '#94a3b8';
  const grid = isLight ? '#e2e8f0' : '#1e293b';
  const subText = isLight ? 'text-slate-600' : 'text-slate-400';

  // Footer total follows the Count / Amount / Both selector of the chart
  const metricTotals = (metric: 'both' | 'count' | 'amount', count: number, amount: number) => (
    <span className="font-mono font-bold text-indigo-500">
      {metric !== 'amount' && `${fmtNum(count)} requests`}
      {metric === 'both' && ' · '}
      {metric !== 'count' && `Refund: EGP ${fmtMoney(amount)}`}
    </span>
  );

  /* ---------------- chart renderers ---------------- */
  const renderChart = (id: string, full: boolean): React.ReactNode => {
    const common = { isLight, isFullscreen: full, onExpand: openChart };
    const h = full ? 'h-[420px]' : 'h-72';

    switch (id) {
      /* 1. Payment methods ------------------------------------------------ */
      case 'payment_methods': {
        const data = paymentBreakdown(filtered, payMode);
        const totalCount = data.reduce((s, d) => s + d.count, 0);
        const totalAmount = data.reduce((s, d) => s + d.amount, 0);
        const donut = (key: 'count' | 'amount', total: number, caption: string) => (
          <div className="flex flex-col items-center">
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${subText}`}>{caption}</div>
            <div className={`${full ? 'h-[300px]' : 'h-56'} w-full`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey={key} nameKey="name" cx="50%" cy="50%" innerRadius={full ? 55 : 40}
                    outerRadius={full ? 120 : 90} paddingAngle={2} labelLine={false} label={pieLabel}>
                    {data.map((d, i) => <Cell key={i} fill={d.fill} stroke={isLight ? '#fff' : '#0f172a'} strokeWidth={2} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className={tooltipBox}>
                        <div className="flex items-center gap-1.5 font-bold text-white" dir="auto">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />{d.name}
                        </div>
                        <div className="text-slate-300">Requests: <strong className="text-white">{fmtNum(d.count)}</strong>
                          {totalCount > 0 && <span className="text-slate-400"> ({((d.count / totalCount) * 100).toFixed(1)}%)</span>}</div>
                        <div className="text-slate-300">Refund: <strong className="text-emerald-400">EGP {fmtMoney(d.amount)}</strong>
                          {totalAmount > 0 && <span className="text-slate-400"> ({((d.amount / totalAmount) * 100).toFixed(1)}%)</span>}</div>
                      </div>
                    );
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className={`text-xs font-mono font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
              {key === 'count' ? `${fmtNum(total)} requests` : `EGP ${fmtShort(total)}`}
            </div>
          </div>
        );
        return (
          <ChartCard chartId={id} title="Payment Methods (Count & Amount)" icon={<PieIcon className="w-4 h-4" />} {...common}
            controls={<Segmented isLight={isLight} value={payMode} onChange={setPayMode}
              options={[{ id: 'group', label: 'Grouped' }, { id: 'option', label: 'By option' }]} />}
            footer={<><span>{data.length} {payMode === 'group' ? 'groups' : 'payment methods'}</span>
              <span className="font-mono font-bold text-indigo-500">Refund: EGP {fmtMoney(totalAmount)}</span></>}>
            {data.length === 0 ? <Empty isLight={isLight} /> : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {donut('count', totalCount, 'Count')}
                  {donut('amount', totalAmount, 'Amount')}
                </div>
                <div className={`mt-3 grid gap-2 ${full ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                  {data.map(d => (
                    <div key={d.name} className={`p-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'}`}>
                      <span className="flex items-center gap-2 font-bold min-w-0" dir="auto">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                        <span className="truncate">{d.name}</span>
                      </span>
                      <span className="font-mono text-right shrink-0">
                        <span className="font-black">{fmtNum(d.count)}</span>
                        <span className={subText}> · {fmtShort(d.amount)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>
        );
      }

      /* 2. Clubs ---------------------------------------------------------- */
      case 'clubs': {
        const data = clubDistribution(filtered);
        const totalAmount = data.reduce((s, d) => s + d.amount, 0);
        const showCount = clubMetric !== 'amount';
        const showAmount = clubMetric !== 'count';
        return (
          <ChartCard chartId={id} title="Distribution by Clubs (Count & Amount)" icon={<Landmark className="w-4 h-4" />} {...common}
            controls={<Segmented isLight={isLight} value={clubMetric} onChange={setClubMetric}
              options={[{ id: 'both', label: 'Both' }, { id: 'count', label: 'Count' }, { id: 'amount', label: 'Amount' }]} />}
            footer={<><span>{data.length} clubs</span>{metricTotals(clubMetric, data.reduce((a, d) => a + d.count, 0), totalAmount)}</>}>
            {data.length === 0 ? <Empty isLight={isLight} /> : (
              <div className={h}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 25, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                    <XAxis dataKey="name" interval={0} angle={data.length > 5 ? -25 : 0} textAnchor={data.length > 5 ? 'end' : 'middle'}
                      height={data.length > 5 ? 70 : 30} tick={{ fill: axis, fontSize: 11, fontWeight: 600 }} />
                    {showCount && <YAxis yAxisId="l" tick={{ fill: axis, fontSize: 11 }} allowDecimals={false} />}
                    {showAmount && <YAxis yAxisId="r" orientation={showCount ? 'right' : 'left'} tickFormatter={fmtShort} tick={{ fill: axis, fontSize: 11 }} />}
                    <Tooltip cursor={{ fill: isLight ? '#f1f5f9' : '#1e293b55' }} content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className={tooltipBox}>
                          <div className="font-bold text-white border-b border-slate-800 pb-1" dir="auto">{label}</div>
                          <div className="text-slate-300">Requests: <strong className="text-white">{fmtNum(d.count)}</strong></div>
                          <div className="text-slate-300">Refund: <strong className="text-emerald-400">EGP {fmtMoney(d.amount)}</strong></div>
                        </div>
                      );
                    }} />
                    <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 11, color: axis }} />
                    {showCount && <Bar yAxisId="l" dataKey="count" name="Requests" fill="#6366f1" radius={[4, 4, 0, 0]}
                      label={{ position: 'top', fill: axis, fontSize: 10, fontWeight: 700 }} />}
                    {showAmount && <Bar yAxisId="r" dataKey="amount" name="Refund amount (EGP)" fill="#10b981" radius={[4, 4, 0, 0]}
                      label={{ position: 'top', fill: axis, fontSize: 10, fontWeight: 700, formatter: (v: number) => fmtShort(v) }} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        );
      }

      /* 3. Reasons -------------------------------------------------------- */
      case 'reasons': {
        const data = reasonDistribution(applyChartFilter(filtered, reasonClub, reasonPay));
        const total = data.reduce((s, d) => s + d.count, 0);
        const rowH = 30;
        const height = full ? Math.max(380, data.length * rowH + 40) : Math.max(288, Math.min(data.length * rowH + 40, 460));
        return (
          <ChartCard chartId={id} title="Cancellation Reasons (Count)" icon={<MessageSquareText className="w-4 h-4" />} {...common}
            controls={chartFilters(reasonClub, setReasonClub, reasonPay, setReasonPay)}
            footer={<><span>{data.length} reasons</span><span className="font-mono font-bold text-indigo-500">{fmtNum(total)} requests</span></>}>
            {data.length === 0 ? <Empty isLight={isLight} /> : (
              <div style={{ height }} className={!full && data.length * rowH + 40 > 460 ? 'overflow-y-auto' : ''}>
                <ResponsiveContainer width="100%" height={Math.max(height, data.length * rowH + 40)}>
                  <BarChart data={data} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={full ? 260 : 170} interval={0}
                      tick={{ fill: axis, fontSize: 11, fontWeight: 600 }}
                      tickFormatter={(v: string) => (v.length > (full ? 40 : 26) ? v.slice(0, full ? 40 : 26) + '…' : v)} />
                    <Tooltip cursor={{ fill: isLight ? '#f1f5f9' : '#1e293b55' }} content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className={tooltipBox}>
                          <div className="font-bold text-white" dir="auto">{d.name}</div>
                          <div className="text-slate-300">Requests: <strong className="text-white">{fmtNum(d.count)}</strong>
                            <span className="text-slate-400"> ({total ? ((d.count / total) * 100).toFixed(1) : 0}%)</span></div>
                        </div>
                      );
                    }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: axis, fontSize: 11, fontWeight: 700 }}>
                      {data.map((_, i) => <Cell key={i} fill={paletteColor(i)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        );
      }

      /* 4. Timeline ------------------------------------------------------- */
      case 'timeline': {
        const scoped = applyChartFilter(filtered, timeClub, timePay);
        const data = requestTimeline(scoped);
        const showCount = timeMetric !== 'amount';
        const showAmount = timeMetric !== 'count';
        const noDate = scoped.filter(r => !r.requestDate).length;
        return (
          <ChartCard chartId={id} title="Timeline by Request Date (Month)" icon={<TrendingUp className="w-4 h-4" />} {...common}
            controls={<>
              <Segmented isLight={isLight} value={timeMetric} onChange={setTimeMetric}
                options={[{ id: 'both', label: 'Both' }, { id: 'count', label: 'Count' }, { id: 'amount', label: 'Amount' }]} />
              {chartFilters(timeClub, setTimeClub, timePay, setTimePay)}
            </>}
            footer={<><span>{data.length} months{noDate > 0 ? ` · ${noDate} without request date` : ''}</span>
              {metricTotals(timeMetric, data.reduce((a, d) => a + d.count, 0), data.reduce((a, d) => a + d.amount, 0))}</>}>
            {data.length === 0 ? <Empty isLight={isLight} /> : (
              <div className={h}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                    <XAxis dataKey="month" tick={{ fill: axis, fontSize: 11, fontWeight: 600 }} />
                    {showCount && <YAxis yAxisId="l" allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} />}
                    {showAmount && <YAxis yAxisId="r" orientation={showCount ? 'right' : 'left'} tickFormatter={fmtShort} tick={{ fill: axis, fontSize: 11 }} />}
                    <Tooltip content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className={tooltipBox}>
                          <div className="font-bold text-white border-b border-slate-800 pb-1">Request month: {label}</div>
                          <div className="text-slate-300">Requests: <strong className="text-white">{fmtNum(d.count)}</strong></div>
                          <div className="text-slate-300">Refund: <strong className="text-emerald-400">EGP {fmtMoney(d.amount)}</strong></div>
                        </div>
                      );
                    }} />
                    <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 11, color: axis }} />
                    {showCount && <Bar yAxisId="l" dataKey="count" name="Requests" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={full ? 36 : 26}
                      label={{ position: 'top', fill: axis, fontSize: 10, fontWeight: 700 }} />}
                    {showAmount && <Line yAxisId="r" type="monotone" dataKey="amount" name="Refund amount (EGP)" stroke="#10b981" strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        );
      }

      /* 5. Period --------------------------------------------------------- */
      case 'periods': {
        const scoped = applyChartFilter(filtered, periodClub, periodPay);
        const data = periodDistribution(scoped, periodOrder);
        const total = data.reduce((s, d) => s + d.count, 0);
        return (
          <ChartCard chartId={id} title="Subscription Period (Count)" icon={<CalendarClock className="w-4 h-4" />} {...common}
            controls={chartFilters(periodClub, setPeriodClub, periodPay, setPeriodPay)}
            footer={<><span>Ordered from shortest to longest period</span><span className="font-mono font-bold text-indigo-500">{fmtNum(total)} requests</span></>}>
            {total === 0 ? <Empty isLight={isLight} /> : (
              <div className={h}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                    <XAxis dataKey="name" interval={0} angle={data.length > 5 ? -25 : 0} textAnchor={data.length > 5 ? 'end' : 'middle'}
                      height={data.length > 5 ? 70 : 30} tick={{ fill: axis, fontSize: 11, fontWeight: 600 }} />
                    <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} />
                    <Tooltip cursor={{ fill: isLight ? '#f1f5f9' : '#1e293b55' }} content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className={tooltipBox}>
                          <div className="font-bold text-white" dir="auto">{d.name}</div>
                          <div className="text-slate-300">Requests: <strong className="text-white">{fmtNum(d.count)}</strong>
                            <span className="text-slate-400"> ({total ? ((d.count / total) * 100).toFixed(1) : 0}%)</span></div>
                        </div>
                      );
                    }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: axis, fontSize: 11, fontWeight: 700 }}>
                      {data.map((_, i) => <Cell key={i} fill={paletteColor(i)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        );
      }

      /* 6. Committee decisions -------------------------------------------- */
      case 'decisions': {
        const st = decisionStats(filtered);
        const colorOf = (d: { kind: string }, i: number) =>
          d.kind === 'approved' ? '#10b981' : d.kind === 'rejected' ? '#ef4444' : paletteColor(i + 2);
        const data = st.decisions.map((d, i) => ({ ...d, fill: colorOf(d, i) }));
        const pct = (n: number) => (filtered.length ? ((n / filtered.length) * 100).toFixed(1) : '0.0');
        const chip = (txt: string, n: number, color: string) => (
          <div className={`px-3 py-2 rounded-xl border flex-1 min-w-[110px] ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'}`}>
            <div className="text-[11px] font-bold" style={{ color }}>{txt}</div>
            <div className="flex items-baseline justify-between">
              <span className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{fmtNum(n)}</span>
              <span className={`text-[10px] font-mono ${subText}`}>{pct(n)}%</span>
            </div>
          </div>
        );
        return (
          <ChartCard chartId={id} title="Committee Decision (قرار اللجنة)" icon={<Scale className="w-4 h-4" />} {...common}
            footer={<><span>{data.length} decision values</span>
              <span className="font-mono font-bold text-indigo-500">
                Approval rate: {st.approvalRate === null ? '—' : `${(st.approvalRate * 100).toFixed(1)}%`}
              </span></>}>
            {filtered.length === 0 ? <Empty isLight={isLight} /> : (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  {chip('Approved', st.approved, '#10b981')}
                  {chip('Rejected', st.rejected, '#ef4444')}
                  {(st.other > 0 || st.none > 0) && chip('Other / blank', st.other + st.none, '#94a3b8')}
                </div>
                <div className={full ? 'h-[330px]' : 'h-60'}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={full ? 55 : 40}
                        outerRadius={full ? 125 : 90} paddingAngle={2} labelLine={false} label={pieLabel}>
                        {data.map((d, i) => <Cell key={i} fill={d.fill} stroke={isLight ? '#fff' : '#0f172a'} strokeWidth={2} />)}
                      </Pie>
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11, color: axis }} />
                      <Tooltip content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className={tooltipBox}>
                            <div className="font-bold text-white" dir="auto">{d.name}</div>
                            <div className="text-slate-300">Requests: <strong className="text-white">{fmtNum(d.count)}</strong>
                              <span className="text-slate-400"> ({pct(d.count)}%)</span></div>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </ChartCard>
        );
      }

      /* 7. Rejection reasons ---------------------------------------------- */
      case 'rejections': {
        const st = decisionStats(filtered);
        const data = st.rejectionReasons;
        const rowH = 30;
        const height = full ? Math.max(380, data.length * rowH + 40) : Math.max(288, Math.min(data.length * rowH + 40, 460));
        return (
          <ChartCard chartId={id} title="Rejection Reasons (سبب الرفض)" icon={<AlertCircle className="w-4 h-4" />} {...common}
            footer={<><span>{data.length} reasons</span><span className="font-mono font-bold text-rose-500">{fmtNum(st.rejectionTotal)} rejected requests</span></>}>
            {data.length === 0 ? <Empty isLight={isLight} /> : (
              <div style={{ height }} className={!full && data.length * rowH + 40 > 460 ? 'overflow-y-auto' : ''}>
                <ResponsiveContainer width="100%" height={Math.max(height, data.length * rowH + 40)}>
                  <BarChart data={data} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={full ? 260 : 170} interval={0}
                      tick={{ fill: axis, fontSize: 11, fontWeight: 600 }}
                      tickFormatter={(v: string) => (v.length > (full ? 40 : 26) ? v.slice(0, full ? 40 : 26) + '…' : v)} />
                    <Tooltip cursor={{ fill: isLight ? '#f1f5f9' : '#1e293b55' }} content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className={tooltipBox}>
                          <div className="font-bold text-white" dir="auto">{d.name}</div>
                          <div className="text-slate-300">Requests: <strong className="text-white">{fmtNum(d.count)}</strong>
                            <span className="text-slate-400"> ({st.rejectionTotal ? ((d.count / st.rejectionTotal) * 100).toFixed(1) : 0}%)</span></div>
                        </div>
                      );
                    }} />
                    <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: axis, fontSize: 11, fontWeight: 700 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        );
      }

      /* 8. Exceptions ----------------------------------------------------- */
      case 'exceptions': {
        const st = exceptionStats(filtered);
        const showCount = exMetric !== 'amount';
        const showAmount = exMetric !== 'count';
        const chip = (txt: string, value: string, color: string) => (
          <div className={`px-3 py-2 rounded-xl border min-w-[130px] ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'}`}>
            <div className="text-[11px] font-bold" style={{ color }}>{txt}</div>
            <div className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{value}</div>
          </div>
        );
        return (
          <ChartCard chartId={id} title="Exceptions (الاستثناءات)" icon={<ShieldAlert className="w-4 h-4" />} {...common}
            controls={<Segmented isLight={isLight} value={exMetric} onChange={setExMetric}
              options={[{ id: 'both', label: 'Both' }, { id: 'count', label: 'Count' }, { id: 'amount', label: 'Amount' }]} />}
            footer={<><span>{st.byType.length} exception types</span>{metricTotals(exMetric, st.count, st.amount)}</>}>
            {st.count === 0 ? <Empty isLight={isLight} /> : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {chip('Exception requests', fmtNum(st.count), '#f59e0b')}
                  {chip('Share of requests', `${(st.share * 100).toFixed(1)}%`, '#6366f1')}
                  {chip('Refund amount (EGP)', fmtShort(st.amount), '#10b981')}
                </div>
                <div className={h}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={st.byType} margin={{ top: 15, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                      <XAxis dataKey="name" interval={0} angle={st.byType.length > 5 ? -25 : 0} textAnchor={st.byType.length > 5 ? 'end' : 'middle'}
                        height={st.byType.length > 5 ? 70 : 30} tick={{ fill: axis, fontSize: 11, fontWeight: 600 }} />
                      {showCount && <YAxis yAxisId="l" allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} />}
                      {showAmount && <YAxis yAxisId="r" orientation={showCount ? 'right' : 'left'} tickFormatter={fmtShort} tick={{ fill: axis, fontSize: 11 }} />}
                      <Tooltip cursor={{ fill: isLight ? '#f1f5f9' : '#1e293b55' }} content={({ active, payload, label: lb }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className={tooltipBox}>
                            <div className="font-bold text-white border-b border-slate-800 pb-1" dir="auto">{lb}</div>
                            <div className="text-slate-300">Requests: <strong className="text-white">{fmtNum(d.count)}</strong></div>
                            <div className="text-slate-300">Refund: <strong className="text-emerald-400">EGP {fmtMoney(d.amount)}</strong></div>
                          </div>
                        );
                      }} />
                      <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 11, color: axis }} />
                      {showCount && <Bar yAxisId="l" dataKey="count" name="Requests" fill="#f59e0b" radius={[4, 4, 0, 0]} />}
                      {showAmount && <Bar yAxisId="r" dataKey="amount" name="Refund amount (EGP)" fill="#10b981" radius={[4, 4, 0, 0]} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </ChartCard>
        );
      }

      /* 9. Reasons x Clubs heatmap ---------------------------------------- */
      case 'heatmap': {
        const hm = reasonClubHeatmap(filtered, heatMode === 'top10' ? 10 : null);
        return (
          <ChartCard chartId={id} title="Reasons × Clubs (Count)" icon={<LayoutGrid className="w-4 h-4" />} {...common}
            controls={<Segmented isLight={isLight} value={heatMode} onChange={setHeatMode}
              options={[{ id: 'top10', label: 'Top 10 reasons' }, { id: 'all', label: 'All reasons' }]} />}
            footer={<><span>{hm.reasons.length} reasons × {hm.clubs.length} clubs
              {hm.hiddenReasons > 0 ? ` · ${hm.hiddenReasons} less frequent reasons hidden` : ''}</span>
              <span className="font-mono font-bold text-indigo-500">{fmtNum(hm.total)} requests</span></>}>
            {hm.reasons.length === 0 ? <Empty isLight={isLight} /> : (
              <div className={`overflow-auto rounded-xl border ${full ? 'max-h-[65vh]' : 'max-h-[440px]'} ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className={isLight ? 'bg-slate-100' : 'bg-slate-950'}>
                      <th className={`sticky top-0 left-0 z-20 px-3 py-2 text-left font-bold min-w-[180px] ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-950 text-slate-300'}`}>Reason</th>
                      {hm.clubs.map(c => (
                        <th key={c} dir="auto" title={c}
                          className={`sticky top-0 z-10 px-2 py-2 font-bold whitespace-nowrap ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-950 text-slate-300'}`}>{c}</th>
                      ))}
                      <th className={`sticky top-0 z-10 px-2 py-2 font-black ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-white'}`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hm.reasons.map((re, i) => (
                      <tr key={re}>
                        <td dir="auto" title={re}
                          className={`sticky left-0 z-10 px-3 py-1.5 font-semibold max-w-[260px] truncate ${isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'}`}>{re}</td>
                        {hm.cells[i].map((v, j) => {
                          const t = hm.max ? v / hm.max : 0;
                          return (
                            <td key={j} title={`${re} · ${hm.clubs[j]}: ${v}`}
                              className="px-2 py-1.5 text-center font-mono font-bold"
                              style={v > 0
                                ? { background: `rgba(99,102,241,${0.12 + 0.78 * t})`, color: t > 0.45 ? '#fff' : isLight ? '#312e81' : '#c7d2fe' }
                                : { color: isLight ? '#cbd5e1' : '#334155' }}>
                              {v > 0 ? v : '·'}
                            </td>
                          );
                        })}
                        <td className={`px-2 py-1.5 text-center font-mono font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{hm.rowTotals[i]}</td>
                      </tr>
                    ))}
                    <tr className={isLight ? 'bg-slate-50' : 'bg-slate-950/60'}>
                      <td className={`sticky left-0 z-10 px-3 py-1.5 font-black ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'}`}>Total</td>
                      {hm.colTotals.map((v, j) => (
                        <td key={j} className={`px-2 py-1.5 text-center font-mono font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{v}</td>
                      ))}
                      <td className="px-2 py-1.5 text-center font-mono font-black text-indigo-500">{hm.rowTotals.reduce((a, b) => a + b, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        );
      }
      default:
        return null;
    }
  };

  /* ---------------- empty state ---------------- */
  if (!loading && records.length === 0) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <PageBanner isLight={isLight} />
        <div className={`rounded-2xl border p-10 text-center ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <FileSpreadsheet className="w-12 h-12 mx-auto text-indigo-400 mb-3" />
          <h3 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>No cancellation requests data yet</h3>
          <p className={`text-sm mt-1 ${subText}`}>
            {isPresentationMode
              ? 'The data sheet for this page has not been uploaded yet.'
              : 'Upload the Cancellation Requests Excel sheet to see the dashboard.'}
          </p>
          {!isPresentationMode && (
            <button onClick={() => setShowUpload(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl cursor-pointer">
              <Upload className="w-4 h-4" /> Upload sheet
            </button>
          )}
        </div>
        {showUpload && <UploadModal onClose={() => setShowUpload(false)} onLoaded={(r, n) => { setRecords(r); setFileName(n); }} />}
      </div>
    );
  }

  const kpiValue = isLight ? 'text-slate-900' : 'text-white';

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageBanner isLight={isLight}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            {fileName && (
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-indigo-100 max-w-[220px] truncate" title={fileName}>
                {fileName}
              </span>
            )}
            {loading && <Loader2 className="w-4 h-4 animate-spin text-indigo-200" />}
            {!isPresentationMode && (
              <button onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 border border-blue-400/30 text-xs font-bold rounded-xl cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Upload sheet
              </button>
            )}
          </div>
        } />

      {/* Filters (whole page): icon in the header next to the presentation icon, opens on click */}
      {filterSlot && createPortal(
        <div className="relative" ref={filterWrapRef}>
          <button
            onClick={() => setFilterOpen(o => !o)}
            className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all cursor-pointer shadow-xs ${
              filterOpen || activeFilterCount > 0
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
            }`}
            title={activeFilterCount > 0 ? `${activeFilterCount} Active Filters` : 'Filter Dashboard'}
            aria-label="Toggle Dashboard Filters"
          >
            <Filter className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 text-[10px] font-black rounded-full flex items-center justify-center shadow-xs">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filterOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 p-4 rounded-2xl bg-slate-900 border border-slate-700/90 shadow-2xl shadow-black/80 z-50 text-xs text-slate-200 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Filter className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-sm text-white">Dashboard Filters</span>
                </div>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <button onClick={() => setFilters(DEFAULT_CANCELLATION_FILTERS)}
                      className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1 px-2 py-0.5 rounded hover:bg-rose-500/10 cursor-pointer">
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  )}
                  <button onClick={() => setFilterOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="py-3 space-y-3.5">
                {([
                  ['Payment method', 'payment', paymentOptionsEls],
                  ['Club', 'club', clubOptionsEls],
                  ['Year (approval date)', 'year', <><option value="ALL">All</option>{options.years.map(y => <option key={y} value={y}>{y}</option>)}</>],
                  ['Type', 'type', <><option value="ALL">All</option>{options.types.map(t => <option key={t} value={t}>{t}</option>)}</>],
                  ['Period', 'period', <><option value="ALL">All</option>{options.periods.map(pd => <option key={pd} value={pd}>{periodEn(pd)}</option>)}</>],
                ] as [string, keyof CancellationFilters, React.ReactNode][]).map(([lbl, key, opts]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{lbl}</label>
                    <select value={filters[key]} onChange={e => setF(key)(e.target.value)} dir="auto"
                      className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                        filters[key] !== 'ALL' ? 'bg-indigo-600/15 border-indigo-500/50 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-200'
                      }`}>
                      {opts}
                    </select>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                Showing <strong className="text-white">{fmtNum(filtered.length)}</strong> of {fmtNum(records.length)} requests
              </div>
            </div>
          )}
        </div>,
        filterSlot
      )}

      {/* ------------------------------ KPI cards ------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <KpiBox isLight={isLight} title="Count of All Requests" icon={<Hash className="w-3.5 h-3.5" />} accent="from-indigo-500 to-blue-500">
          <div className={`text-2xl font-black tracking-tight ${kpiValue}`}>{fmtNum(kpis.totalRequests)}</div>
        </KpiBox>

        <KpiBox isLight={isLight} title="Amount of Refunds (EGP)" icon={<CircleDollarSign className="w-3.5 h-3.5" />} accent="from-emerald-500 to-teal-500">
          <div className="text-2xl font-black tracking-tight text-emerald-500">EGP {fmtShort(kpis.refundAmount)}</div>
          <div className={`flex items-center justify-between mt-2 pt-1.5 border-t text-[11px] font-mono ${isLight ? 'border-slate-100 text-slate-500' : 'border-slate-800/60 text-slate-400'}`}>
            <span>EGP {fmtMoney(kpis.refundAmount)}</span>
            <span className="font-sans font-bold text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-500 border-emerald-500/30"># {fmtNum(kpis.refundCount)}</span>
          </div>
          <div className={`mt-1.5 pt-1.5 border-t space-y-1 text-[11px] ${isLight ? 'border-slate-100' : 'border-slate-800/60'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Companies refunds</span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-indigo-500">EGP {fmtMoney(kpis.companiesRefund)}</span>
                <span className="font-sans font-bold text-[10px] px-2 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-500 border-indigo-500/30"># {fmtNum(kpis.companiesCount)}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`font-bold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Remaining refunds</span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-teal-500">EGP {fmtMoney(kpis.remainingRefund)}</span>
                <span className="font-sans font-bold text-[10px] px-2 py-0.5 rounded-full border bg-teal-500/10 text-teal-500 border-teal-500/30"># {fmtNum(kpis.remainingCount)}</span>
              </span>
            </div>
          </div>
        </KpiBox>

        <KpiBox isLight={isLight} title="International Memberships" icon={<Globe2 className="w-3.5 h-3.5" />} accent="from-amber-500 to-orange-500">
          {(kpis.wdiByCurrency.length > 0 ? kpis.wdiByCurrency : [{ currency: 'SAR', amount: 0, count: 0 }]).map(w => (
            <div key={w.currency} className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-black tracking-tight text-amber-500">
                {fmtMoney(w.amount)} <span className="text-sm font-bold" dir="auto">{w.currency}</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/30"># {fmtNum(w.count)}</span>
            </div>
          ))}
          <div className={`mt-2 pt-1.5 border-t space-y-1 text-[11px] ${isLight ? 'border-slate-100' : 'border-slate-800/60'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Cancelled</span>
              <span className="font-sans font-bold text-[10px] px-2 py-0.5 rounded-full border bg-rose-500/10 text-rose-500 border-rose-500/30"># {fmtNum(kpis.wdiCancelledCount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`font-bold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Pending</span>
              <span className="font-sans font-bold text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/30"># {fmtNum(kpis.wdiPendingCount)}</span>
            </div>
          </div>
        </KpiBox>
      </div>

      {/* Status counts */}
      <div>
        <SectionTitle isLight={isLight} icon={<ListChecks className="w-4 h-4" />} text="Count by Status" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {kpis.statusCounts.map((s, i) => (
            <MiniCard key={s.name} isLight={isLight} name={s.name} count={s.count} total={kpis.totalRequests} color={paletteColor(i)} />
          ))}
        </div>
      </div>

      {/* Type counts (نوع العضوية) */}
      <div>
        <SectionTitle isLight={isLight} icon={<Layers className="w-4 h-4" />} text="Count by Type (نوع العضوية)" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {kpis.typeCounts.map((t, i) => (
            <MiniCard key={t.name} isLight={isLight} name={t.name} count={t.count} total={kpis.totalRequests} color={paletteColor(i + 4)} />
          ))}
        </div>
      </div>

      {/* ------------------------------- Charts ------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderChart('payment_methods', false)}
        {renderChart('clubs', false)}
        {renderChart('reasons', false)}
        {renderChart('timeline', false)}
        <div className="lg:col-span-2">{renderChart('periods', false)}</div>
        {renderChart('decisions', false)}
        {renderChart('rejections', false)}
        <div className="lg:col-span-2">{renderChart('exceptions', false)}</div>
        <div className="lg:col-span-2">{renderChart('heatmap', false)}</div>
      </div>

      {/* Fullscreen modal — scoped to this page only */}
      <ChartModal modalState={modal} onClose={() => setModal(m => ({ ...m, isOpen: false }))} isLight={isLight}>
        {modal.isOpen && renderChart(modal.chartId, true)}
      </ChartModal>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onLoaded={(r, n) => { setRecords(r); setFileName(n); setFilters(DEFAULT_CANCELLATION_FILTERS); }} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const PageBanner: React.FC<{ isLight: boolean; right?: React.ReactNode }> = ({ right }) => (
  <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-blue-950 text-white rounded-2xl p-6 shadow-xl border border-indigo-500/30">
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-400/30 shadow-inner">
          <Banknote className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-extrabold">Cancellation Requests 2026</h2>
      </div>
      {right}
    </div>
  </div>
);

const SectionTitle: React.FC<{ isLight: boolean; icon: React.ReactNode; text: string }> = ({ isLight, icon, text }) => (
  <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
    <span className="text-indigo-500">{icon}</span>{text}
  </div>
);

const MiniCard: React.FC<{ isLight: boolean; name: string; count: number; total: number; color: string }> = ({ isLight, name, count, total, color }) => {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div className="rounded-2xl p-4 border relative overflow-hidden shadow-xs"
      style={{ background: `${color}${isLight ? '1f' : '2e'}`, borderColor: `${color}66` }}>
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
      <div className={`text-xs font-bold mb-2 truncate ${isLight ? 'text-slate-700' : 'text-slate-200'}`} dir="auto" title={name}>{name}</div>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-2xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>{fmtNum(count)}</span>
        <span className="text-sm font-black px-2.5 py-0.5 rounded-full text-white shadow-xs" style={{ background: color }}>{pct.toFixed(1)}%</span>
      </div>
      <div className={`mt-2.5 h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-white/70' : 'bg-slate-950/50'}`}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
};

const Empty: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div className={`h-48 flex items-center justify-center text-sm ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
    No data for the current filters
  </div>
);
