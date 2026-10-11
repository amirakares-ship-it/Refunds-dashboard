import React, { useMemo, useState } from 'react';
import { RefundRecord, ManualInputs } from '../../types';
import { formatEGP, formatEGPFull, formatTableAmount, formatTableAmountFull, formatMonthLabel, parseMonthAndYear } from '../../utils/dataProcessor';
import { DollarSign, CreditCard, Clock, CheckCircle2, TrendingUp, ShieldAlert, BarChart3, PieChart as PieIcon, FileSpreadsheet, Building2, Maximize2, Filter, Eye, EyeOff, Download } from 'lucide-react';
import { exportTableToExcel } from '../../utils/exportUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, AreaChart, Area, LabelList } from 'recharts';

interface FinanceSectionProps {
  records: RefundRecord[];
  manualInputs: ManualInputs;
  selectedCompany: string;
  onExpandChart?: (chartId: string, title: string, desc?: string) => void;
  isLight?: boolean;
  standaloneChartId?: string;
}

export const FinanceSection: React.FC<FinanceSectionProps> = ({
  records,
  manualInputs,
  selectedCompany,
  onExpandChart,
  isLight = false,
  standaloneChartId,
}) => {
  // Chart-specific Type filters
  const [chart1Type, setChart1Type] = useState<'ALL' | 'default' | 'Request'>('ALL');
  const [chart2Type, setChart2Type] = useState<'ALL' | 'default' | 'Request'>('ALL');
  const [tableType, setTableType] = useState<'ALL' | 'default' | 'Request'>('ALL');

  // Raw Records Explorer table — hidden by default, own Company/Type/Status filters
  const [isRawTableVisible, setIsRawTableVisible] = useState(false);
  const [rawFilterCompany, setRawFilterCompany] = useState('ALL');
  const [rawFilterType, setRawFilterType] = useState<'ALL' | 'default' | 'Request'>('ALL');
  const [rawFilterStatus, setRawFilterStatus] = useState('Cheque pending');
  const [rawAgingFilter, setRawAgingFilter] = useState<'ALL' | 'fresh' | 'mid' | 'overdue'>('ALL');

  // Filter by Status: strictly ONLY 'Cancelled' and 'Cheque pending' (case-insensitive), excluding Reactive
  // And filter by company if selected
  const financeRecords = useMemo(() => {
    return records.filter(r => {
      if (r.reactive) return false;
      const s = (r.status || '').toLowerCase().trim();
      const isValidStatus = s === 'cancelled' || s === 'cheque pending' || s.includes('cheque') || s.includes('cancelled');
      if (!isValidStatus) return false;
      if (selectedCompany && selectedCompany !== 'ALL' && r.company.toLowerCase() !== selectedCompany.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [records, selectedCompany]);

  // Overall Financial Calculations (Strictly Cancelled + Cheque pending)
  const chequePendingRecords = useMemo(() => financeRecords.filter(r => r.status.toLowerCase().includes('cheque')), [financeRecords]);
  const chequePendingAmount = useMemo(() => chequePendingRecords.reduce((sum, r) => sum + r.amount, 0), [chequePendingRecords]);
  
  const cancelledRecords = useMemo(() => financeRecords.filter(r => r.status.toLowerCase().includes('cancelled')), [financeRecords]);
  const cancelledAmount = useMemo(() => cancelledRecords.reduce((sum, r) => sum + r.amount, 0), [cancelledRecords]);

  const totalAmount = useMemo(() => chequePendingAmount + cancelledAmount, [chequePendingAmount, cancelledAmount]);
  const totalCount = useMemo(() => financeRecords.length, [financeRecords]);

  // Chart 1 (Company Exposure) Filtered Records & Aggregates
  const chart1Records = useMemo(() => {
    if (chart1Type === 'ALL') return financeRecords;
    return financeRecords.filter(r => (r.type || '').toLowerCase() === chart1Type.toLowerCase());
  }, [financeRecords, chart1Type]);

  const chart1CompanyData = useMemo(() => {
    const compMap: Record<string, { company: string; total: number; cheque: number; cancelled: number; count: number }> = {};
    chart1Records.forEach(r => {
      if (!compMap[r.company]) {
        compMap[r.company] = { company: r.company, total: 0, cheque: 0, cancelled: 0, count: 0 };
      }
      const isCheque = r.status.toLowerCase().includes('cheque');
      const isCancelled = r.status.toLowerCase().includes('cancelled');
      if (isCheque) {
        compMap[r.company].cheque += r.amount;
        compMap[r.company].total += r.amount;
        compMap[r.company].count += 1;
      } else if (isCancelled) {
        compMap[r.company].cancelled += r.amount;
        compMap[r.company].total += r.amount;
        compMap[r.company].count += 1;
      }
    });
    return Object.values(compMap);
  }, [chart1Records]);

  // Chart 2 (Monthly Cash Burn Trend) Filtered Records & Aggregates
  const chart2Records = useMemo(() => {
    if (chart2Type === 'ALL') return financeRecords;
    return financeRecords.filter(r => (r.type || '').toLowerCase() === chart2Type.toLowerCase());
  }, [financeRecords, chart2Type]);

  const chart2MonthlyTrend = useMemo(() => {
    const monthMap: Record<string, { month: string; sortKey: number; defaultAmount: number; requestAmount: number; total: number }> = {};
    chart2Records.forEach(r => {
      const rawDate = r.actionDate || r.requestMonth || r.requestDate;
      const m = formatMonthLabel(rawDate);
      if (!monthMap[m]) {
        const parsed = parseMonthAndYear(rawDate);
        // Chronological sort key: YYYYMM (falls back to 0 so unparseable dates sink to the start)
        const sortKey = parsed ? (parsed.year || 0) * 100 + parsed.monthIndex : 0;
        monthMap[m] = { month: m, sortKey, defaultAmount: 0, requestAmount: 0, total: 0 };
      }
      const isDef = (r.type || '').toLowerCase() === 'default';
      if (isDef) {
        monthMap[m].defaultAmount += r.amount;
      } else {
        monthMap[m].requestAmount += r.amount;
      }
      monthMap[m].total += r.amount;
    });
    return Object.values(monthMap).sort((a, b) => a.sortKey - b.sortKey);
  }, [chart2Records]);

  // Table (Financial Settlement Summary) Filtered Records & Aggregates
  const tableRecords = useMemo(() => {
    if (tableType === 'ALL') return financeRecords;
    return financeRecords.filter(r => (r.type || '').toLowerCase() === tableType.toLowerCase());
  }, [financeRecords, tableType]);

  const tableCompanyData = useMemo(() => {
    const compMap: Record<string, { company: string; total: number; cheque: number; cancelled: number; count: number }> = {};
    tableRecords.forEach(r => {
      if (!compMap[r.company]) {
        compMap[r.company] = { company: r.company, total: 0, cheque: 0, cancelled: 0, count: 0 };
      }
      const isCheque = r.status.toLowerCase().includes('cheque');
      const isCancelled = r.status.toLowerCase().includes('cancelled');
      if (isCheque) {
        compMap[r.company].cheque += r.amount;
        compMap[r.company].total += r.amount;
        compMap[r.company].count += 1;
      } else if (isCancelled) {
        compMap[r.company].cancelled += r.amount;
        compMap[r.company].total += r.amount;
        compMap[r.company].count += 1;
      }
    });
    return Object.values(compMap);
  }, [tableRecords]);

  // Raw Records Explorer — Company/Type/Status dropdown options & filtered rows
  // Uses the same pool as the rest of Finance (Cancelled / Cheque pending only)
  const companyOptions = useMemo(
    () => Array.from(new Set(financeRecords.map(r => r.company).filter(Boolean))).sort(),
    [financeRecords]
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(financeRecords.map(r => r.status).filter(Boolean))).sort(),
    [financeRecords]
  );
  // Which aging bucket a record's Action Date falls into, relative to today. null = no valid date.
  const getAgingBucket = (r: RefundRecord): 'fresh' | 'mid' | 'overdue' | null => {
    const actionTime = r.actionDate ? new Date(r.actionDate).getTime() : NaN;
    if (isNaN(actionTime)) return null;
    const days = Math.floor((Date.now() - actionTime) / 86400000);
    return days <= 30 ? 'fresh' : days <= 60 ? 'mid' : 'overdue';
  };

  const rawFilteredRecords = useMemo(() => {
    return financeRecords.filter(r => {
      if (rawFilterCompany !== 'ALL' && r.company !== rawFilterCompany) return false;
      if (rawFilterType !== 'ALL' && (r.type || '').toLowerCase() !== rawFilterType.toLowerCase()) return false;
      if (rawFilterStatus !== 'ALL' && r.status !== rawFilterStatus) return false;
      if (rawAgingFilter !== 'ALL' && getAgingBucket(r) !== rawAgingFilter) return false;
      return true;
    });
  }, [financeRecords, rawFilterCompany, rawFilterType, rawFilterStatus, rawAgingFilter]);

  // Aggregate by Company + Action Date + Type: one row per combination, with the
  // total amount — so it's clear exactly which company each delayed cheque belongs to.
  const rawGroupedByDate = useMemo(() => {
    const groups: Record<string, { company: string; date: string; type: string; total: number; count: number }> = {};
    rawFilteredRecords.forEach(r => {
      const company = r.company || 'Unknown';
      const date = r.actionDate || 'No Action Date';
      const type = r.type || 'Unknown';
      const key = `${company}||${date}||${type}`;
      if (!groups[key]) {
        groups[key] = { company, date, type, total: 0, count: 0 };
      }
      groups[key].total += r.amount;
      groups[key].count += 1;
    });
    // ISO dates (YYYY-MM-DD) sort correctly as plain strings; push "No Action Date" to the end
    return Object.values(groups).sort((a, b) => {
      const companyCompare = a.company.localeCompare(b.company);
      if (companyCompare !== 0) return companyCompare;
      if (a.date === 'No Action Date') return 1;
      if (b.date === 'No Action Date') return -1;
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.type.localeCompare(b.type);
    });
  }, [rawFilteredRecords]);

  const handleExportChequesExcel = () => {
    const rows = rawGroupedByDate.map(g => ({
      'Company': g.company,
      'Action Date': g.date,
      'Type': g.type,
      'Records': g.count,
      'Total Amount': g.total,
    }));
    exportTableToExcel(rows, 'Cheques_Export.xlsx', 'Cheques');
  };

  const rawGrandTotal = useMemo(() => rawGroupedByDate.reduce((sum, g) => sum + g.total, 0), [rawGroupedByDate]);
  const rawGrandCount = useMemo(() => rawGroupedByDate.reduce((sum, g) => sum + g.count, 0), [rawGroupedByDate]);

  // Aging analysis for Cheque Pending records — always based on pending status
  // (independent of the Status dropdown) so it's meaningful even when another status is selected
  const chequeAging = useMemo(() => {
    const buckets = {
      fresh: { label: '0-30 Days', count: 0, total: 0 },
      mid: { label: '31-60 Days', count: 0, total: 0 },
      overdue: { label: 'Over 60 Days', count: 0, total: 0 },
    };
    financeRecords
      .filter(r => (r.status || '').toLowerCase().includes('cheque'))
      .filter(r => rawFilterCompany === 'ALL' || r.company === rawFilterCompany)
      .filter(r => rawFilterType === 'ALL' || (r.type || '').toLowerCase() === rawFilterType.toLowerCase())
      .forEach(r => {
        const key = getAgingBucket(r);
        if (!key) return;
        buckets[key].count += 1;
        buckets[key].total += r.amount;
      });
    return buckets;
  }, [financeRecords, rawFilterCompany, rawFilterType]);

  const tableChequeAmount = useMemo(() => tableCompanyData.reduce((sum, c) => sum + c.cheque, 0), [tableCompanyData]);
  const tableCancelledAmount = useMemo(() => tableCompanyData.reduce((sum, c) => sum + c.cancelled, 0), [tableCompanyData]);
  const tableTotalAmount = useMemo(() => tableCompanyData.reduce((sum, c) => sum + c.total, 0), [tableCompanyData]);
  const tableTotalCount = useMemo(() => tableCompanyData.reduce((sum, c) => sum + c.count, 0), [tableCompanyData]);

  // Status Distribution Pie Data (Strictly Cheque Pending vs Cancelled / Delivered)
  const statusPieData = useMemo(() => [
    { name: 'Cheque Pending', value: chequePendingAmount, count: chequePendingRecords.length, color: '#f59e0b' },
    { name: 'Cancelled (Delivered)', value: cancelledAmount, count: cancelledRecords.length, color: '#10b981' },
  ].filter(d => d.value > 0), [chequePendingAmount, cancelledAmount, chequePendingRecords, cancelledRecords]);

  const COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6'];

  const cardBg = isLight ? 'bg-white border-slate-200 shadow-sm text-slate-800' : 'bg-slate-900 border-slate-800 text-white';
  const headerBg = isLight ? 'bg-slate-900 text-white border-slate-800' : 'bg-gradient-to-r from-amber-950 via-slate-900 to-indigo-950 text-white border-amber-500/30';
  const subTextColor = isLight ? 'text-slate-500' : 'text-slate-400';
  const tableBorder = isLight ? 'border-slate-200' : 'border-slate-800';
  const theadBg = isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800';
  const tbodyBg = isLight ? 'bg-white text-slate-700 divide-slate-200' : 'bg-slate-900 text-slate-300 divide-slate-800/60';
  const selectClass = `text-[11px] font-semibold rounded-lg border px-2 py-1.5 outline-none cursor-pointer ${
    isLight ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-200'
  }`;

  const renderTypeFilter = (
    currentValue: 'ALL' | 'default' | 'Request',
    onChange: (val: 'ALL' | 'default' | 'Request') => void
  ) => (
    <div className={`flex items-center p-0.5 rounded-lg border text-xs ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
      <span className={`text-[10px] font-bold px-1.5 ${isLight ? 'text-slate-400' : 'text-slate-500'} flex items-center gap-1`}>
        <Filter className="w-2.5 h-2.5" />
        Type:
      </span>
      {(['ALL', 'default', 'Request'] as const).map((t) => {
        const label = t === 'ALL' ? 'All' : t === 'default' ? 'Default' : 'Request';
        const isActive = currentValue === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
              isActive
                ? 'bg-amber-500 text-white shadow-xs'
                : isLight
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  if (standaloneChartId === 'finance_company_exposure') {
    return (
      <div className={`${cardBg} rounded-2xl p-6 border shadow-lg w-full h-full flex flex-col justify-center space-y-4 animate-fadeIn`}>
        <div className="flex items-center justify-between pb-2 border-b border-slate-700/40">
          <div>
            <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Refund Liabilities Distribution Across Financing Companies
            </h3>
            <p className={`text-xs ${subTextColor}`}>Cheque Pending vs Delivered liabilities distribution per partner</p>
          </div>
          {renderTypeFilter(chart1Type, setChart1Type)}
        </div>
        <div className="h-[480px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart1CompanyData} margin={{ top: 30, right: 20, left: 10, bottom: 10 }}>
              <XAxis dataKey="company" stroke={isLight ? '#64748b' : '#94a3b8'} fontSize={13} tickLine={false} />
              <YAxis stroke={isLight ? '#64748b' : '#94a3b8'} fontSize={12} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isLight ? '#ffffff' : '#0f172a',
                  borderColor: isLight ? '#e2e8f0' : '#334155',
                  borderRadius: '12px',
                  color: isLight ? '#0f172a' : '#ffffff',
                  fontSize: '14px',
                }}
                formatter={(value: any, name: any) => [
                  formatEGPFull(Number(value) || 0),
                  name === 'cheque' ? 'Cheque Pending' : name === 'cancelled' ? 'Delivered' : 'Total Exposure',
                ]}
              />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value) => (
                  <span className={`text-sm font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {value === 'cheque' ? 'Cheque Pending' : value === 'cancelled' ? 'Delivered' : value}
                  </span>
                )}
              />
              <Bar dataKey="cheque" name="cheque" fill="#f59e0b" radius={[0, 0, 0, 0]} stackId="a" />
              <Bar dataKey="cancelled" name="cancelled" fill="#10b981" radius={[6, 6, 0, 0]} stackId="a">
                <LabelList
                  dataKey="total"
                  position="top"
                  formatter={(val: any) => formatEGP(Number(val) || 0)}
                  style={{
                    fill: isLight ? '#0f172a' : '#f8fafc',
                    fontWeight: 'bold',
                    fontSize: 13,
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (standaloneChartId === 'finance_cash_burn_trend') {
    return (
      <div className={`${cardBg} rounded-2xl p-6 border shadow-lg w-full h-full flex flex-col justify-center space-y-4 animate-fadeIn`}>
        <div className="flex items-center justify-between pb-2 border-b border-slate-700/40">
          <div>
            <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Monthly Cash Burn & Liabilities Trend
            </h3>
            <p className={`text-xs ${subTextColor}`}>Default vs Request refund obligations growth per month</p>
          </div>
          {renderTypeFilter(chart2Type, setChart2Type)}
        </div>
        <div className="h-[480px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart2MonthlyTrend} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="colorDefault" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRequest" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="month" stroke={isLight ? '#64748b' : '#94a3b8'} fontSize={12} tickLine={false} />
              <YAxis stroke={isLight ? '#64748b' : '#94a3b8'} fontSize={12} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isLight ? '#ffffff' : '#0f172a',
                  borderColor: isLight ? '#e2e8f0' : '#334155',
                  borderRadius: '12px',
                  color: isLight ? '#0f172a' : '#ffffff',
                  fontSize: '14px',
                }}
                formatter={(val: any, name: any) => [
                  formatEGPFull(Number(val) || 0),
                  name === 'defaultAmount' ? 'Default Refund Obligation' : 'Request Refund Amount',
                ]}
              />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value) => (
                  <span className={`text-sm font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {value === 'defaultAmount' ? 'Default Refunds' : 'Request Refunds'}
                  </span>
                )}
              />
              {(chart2Type === 'ALL' || chart2Type === 'default') && (
                <Area type="monotone" dataKey="defaultAmount" name="defaultAmount" stroke="#ef4444" fillOpacity={1} fill="url(#colorDefault)" />
              )}
              {(chart2Type === 'ALL' || chart2Type === 'Request') && (
                <Area type="monotone" dataKey="requestAmount" name="requestAmount" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRequest)" />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (standaloneChartId === 'finance_settlement_table') {
    return (
      <div className={`${cardBg} rounded-2xl p-6 border shadow-lg w-full h-full flex flex-col justify-center space-y-4 animate-fadeIn`}>
        <div className="flex items-center justify-between pb-2 border-b border-slate-700/40">
          <div>
            <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Financial Settlement Summary per Partner Company
            </h3>
            <p className={`text-xs ${subTextColor}`}>Detailed breakdown of cheque pending vs delivered obligations</p>
          </div>
          {renderTypeFilter(tableType, setTableType)}
        </div>
        <div className={`overflow-x-auto border ${tableBorder} rounded-xl`}>
          <table className="w-full text-left text-sm">
            <thead className={`${theadBg} font-bold border-b text-xs uppercase tracking-wider`}>
              <tr>
                <th className="p-3.5">Company</th>
                <th className="p-3.5 text-center">Requests Count</th>
                <th className="p-3.5 text-right text-amber-500">Cheque Pending</th>
                <th className="p-3.5 text-right text-emerald-500">Delivered</th>
                <th className="p-3.5 text-right text-blue-500">Total Cheques</th>
                <th className="p-3.5 text-center">Percentage %</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${tbodyBg} font-mono text-sm`}>
              {tableCompanyData.map(row => {
                const sharePct = (tableTotalAmount || 1) > 0 ? (row.total / tableTotalAmount) * 100 : 0;
                return (
                  <tr key={row.company} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'}>
                    <td className={`p-3.5 font-sans font-bold ${isLight ? 'text-slate-900' : 'text-white'} text-base`}>{row.company}</td>
                    <td className="p-3.5 text-center font-bold">{row.count}</td>
                    <td className="p-3.5 text-right font-bold text-amber-500 text-base">{formatEGPFull(row.cheque)}</td>
                    <td className="p-3.5 text-right font-bold text-emerald-500 text-base">{formatEGPFull(row.cancelled)}</td>
                    <td className="p-3.5 text-right font-bold text-blue-500 text-base">{formatEGPFull(row.total)}</td>
                    <td className="p-3.5 text-center font-sans">
                      <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 font-bold text-xs">
                        {sharePct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className={`${isLight ? 'bg-slate-900 text-white' : 'bg-slate-950 text-white'} font-bold text-sm border-t`}>
              <tr>
                <td className="p-3.5">Grand Total</td>
                <td className="p-3.5 text-center font-mono">{tableTotalCount}</td>
                <td className="p-3.5 text-right text-amber-400 font-mono">{formatEGPFull(tableChequeAmount)}</td>
                <td className="p-3.5 text-right text-emerald-400 font-mono">{formatEGPFull(tableCancelledAmount)}</td>
                <td className="p-3.5 text-right text-amber-300 font-mono font-black">{formatEGPFull(tableTotalAmount)}</td>
                <td className="p-3.5 text-center font-mono">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  if (standaloneChartId === 'finance_cheques_table') {
    return (
      <div className={`${cardBg} rounded-2xl p-6 border shadow-lg w-full h-full flex flex-col space-y-4 animate-fadeIn`}>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-700/40">
          <div>
            <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              #Cheques
            </h3>
            <p className={`text-xs ${subTextColor}`}>Total Amount grouped by Action Date &amp; Type</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={rawFilterCompany} onChange={(e) => setRawFilterCompany(e.target.value)} className={selectClass}>
              <option value="ALL">All Companies</option>
              {companyOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={rawFilterType} onChange={(e) => setRawFilterType(e.target.value as 'ALL' | 'default' | 'Request')} className={selectClass}>
              <option value="ALL">All Types</option>
              <option value="default">Default</option>
              <option value="Request">Request</option>
            </select>
            <select value={rawFilterStatus} onChange={(e) => setRawFilterStatus(e.target.value)} className={selectClass}>
              <option value="ALL">All Statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={handleExportChequesExcel}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isLight
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-emerald-950/40 text-emerald-300 border-emerald-900 hover:bg-emerald-950/70'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Export Excel
            </button>
          </div>
        </div>

        {/* Cheque Pending Aging Analysis */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              {
                key: 'fresh' as const,
                icon: CheckCircle2,
                card: isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-950/20 border-emerald-900/40',
                iconWrap: 'bg-emerald-500/15 text-emerald-500',
                label: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                key: 'mid' as const,
                icon: Clock,
                card: isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/20 border-amber-900/40',
                iconWrap: 'bg-amber-500/15 text-amber-500',
                label: 'text-amber-600 dark:text-amber-400',
              },
              {
                key: 'overdue' as const,
                icon: ShieldAlert,
                card: isLight ? 'bg-rose-50 border-rose-200' : 'bg-rose-950/20 border-rose-900/40',
                iconWrap: 'bg-rose-500/15 text-rose-500',
                label: 'text-rose-600 dark:text-rose-400',
              },
            ]
          ).map(({ key, icon: Icon, card, iconWrap, label }) => {
            const b = chequeAging[key];
            const isActive = rawAgingFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setRawAgingFilter(prev => (prev === key ? 'ALL' : key))}
                className={`text-left rounded-xl p-3.5 border flex items-center gap-3 cursor-pointer transition-all ${card} ${
                  isActive ? 'ring-2 ring-offset-1 ring-indigo-500' : 'hover:opacity-80'
                } ${isLight ? 'ring-offset-white' : 'ring-offset-slate-900'}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconWrap}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className={`text-[11px] font-bold uppercase tracking-wider ${label}`}>
                    {b.label}
                  </p>
                  <p className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {formatTableAmountFull(b.total)}
                    <span className={`text-xs font-semibold ml-1 ${subTextColor}`}>({b.count})</span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className={`overflow-x-auto overflow-y-auto flex-1 border ${tableBorder} rounded-xl`}>
          <table className="w-full text-left text-sm">
            <thead className={`${theadBg} font-bold border-b text-xs uppercase tracking-wider sticky top-0 z-10`}>
              <tr>
                <th className="p-3.5">Company</th>
                <th className="p-3.5">Action Date</th>
                <th className="p-3.5 text-center">Type</th>
                <th className="p-3.5 text-center">Records</th>
                <th className="p-3.5 text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${tbodyBg} font-mono text-sm`}>
              {rawGroupedByDate.map((group) => (
                <tr key={`${group.company}||${group.date}||${group.type}`} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'}>
                  <td className="p-3.5 font-sans font-bold text-blue-500">{group.company}</td>
                  <td className={`p-3.5 font-sans font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{group.date}</td>
                  <td className="p-3.5 text-center font-sans">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        group.type.toLowerCase() === 'default'
                          ? 'bg-rose-500/20 text-rose-500'
                          : 'bg-indigo-500/20 text-indigo-400'
                      }`}
                    >
                      {group.type}
                    </span>
                  </td>
                  <td className="p-3.5 text-center font-bold">{group.count}</td>
                  <td className="p-3.5 text-right font-black text-base text-amber-500">{formatTableAmountFull(group.total)}</td>
                </tr>
              ))}
              {rawGroupedByDate.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">
                    No records match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
            {rawGroupedByDate.length > 0 && (
              <tfoot className={`${isLight ? 'bg-slate-900 text-white' : 'bg-slate-950 text-white'} font-bold text-sm border-t`}>
                <tr>
                  <td className="p-3.5 font-sans" colSpan={2}>Grand Total</td>
                  <td className="p-3.5 text-center"></td>
                  <td className="p-3.5 text-center font-mono">{rawGrandCount}</td>
                  <td className="p-3.5 text-right font-mono text-amber-300 font-black text-base">{formatTableAmountFull(rawGrandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className={`${headerBg} rounded-2xl p-6 shadow-xl border`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shadow-inner">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold flex items-center gap-2">
                Finance & Cash Liabilities Overview 2026
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Financial obligations, cheque disbursements, monthly cash burn rate, and audit breakdown.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-400">Total Financial Exposure</div>
              <div className="text-lg font-black text-amber-400">{formatEGP(totalAmount)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total Refund Liabilities */}
        <div className={`${cardBg} rounded-2xl p-4 border transition-all relative overflow-hidden`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold ${subTextColor} flex items-center gap-1.5`}>
              <CreditCard className="w-4 h-4 text-amber-500" />
              Total Financial Liabilities
            </span>
          </div>
          <div className="text-2xl font-black text-amber-500 tracking-tight">
            {formatEGP(totalAmount)}
          </div>
          <p className={`text-[11px] ${subTextColor} mt-1 font-mono`}>
            {totalCount} Total Refund Requests
          </p>
        </div>

        {/* Card 2: Cheque Pending Disbursement */}
        <div className={`${cardBg} rounded-2xl p-4 border transition-all relative overflow-hidden`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold ${subTextColor} flex items-center gap-1.5`}>
              <Clock className="w-4 h-4 text-amber-400" />
              Cheques Pending
            </span>
          </div>
          <div className="text-2xl font-black text-amber-400 tracking-tight">
            {formatEGP(chequePendingAmount)}
          </div>
          <p className={`text-[11px] ${subTextColor} mt-1 font-mono`}>
            {chequePendingRecords.length} Cheques ({totalAmount > 0 ? ((chequePendingAmount / totalAmount) * 100).toFixed(1) : 0}%)
          </p>
        </div>

        {/* Card 3: Cheques Delivered */}
        <div className={`${cardBg} rounded-2xl p-4 border transition-all relative overflow-hidden`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold ${subTextColor} flex items-center gap-1.5`}>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Cheques Delivered
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-500 tracking-tight">
            {formatEGP(cancelledAmount)}
          </div>
          <p className={`text-[11px] ${subTextColor} mt-1 font-mono`}>
            {cancelledRecords.length} Cheques Delivered ({totalAmount > 0 ? ((cancelledAmount / totalAmount) * 100).toFixed(1) : 0}%)
          </p>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Financial Settlement Status by Company */}
        <div className={`${cardBg} rounded-2xl p-5 border shadow-md flex flex-col justify-between`}>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Refund Liabilities Distribution Across Financing Companies
                  </h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {renderTypeFilter(chart1Type, setChart1Type)}
                {onExpandChart && (
                  <button
                    onClick={() => onExpandChart('finance_company_exposure', 'Refund Liabilities Distribution Across Financing Companies', 'Cheque Pending vs Delivered liabilities distribution per partner')}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="View Fullscreen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart1CompanyData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="company" stroke={isLight ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} />
                  <YAxis stroke={isLight ? '#64748b' : '#94a3b8'} fontSize={10} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isLight ? '#ffffff' : '#0f172a',
                      borderColor: isLight ? '#e2e8f0' : '#334155',
                      borderRadius: '12px',
                      color: isLight ? '#0f172a' : '#ffffff',
                      fontSize: '12px',
                    }}
                    formatter={(value: any, name: any) => [
                      formatEGPFull(Number(value) || 0),
                      name === 'cheque' ? 'Cheque Pending' : name === 'cancelled' ? 'Delivered' : 'Total Exposure',
                    ]}
                  />
                  <Legend
                    formatter={(value) => (
                      <span className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {value === 'cheque' ? 'Cheque Pending' : value === 'cancelled' ? 'Delivered' : value}
                      </span>
                    )}
                  />
                  <Bar dataKey="cheque" name="cheque" fill="#f59e0b" radius={[0, 0, 0, 0]} stackId="a" />
                  <Bar dataKey="cancelled" name="cancelled" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a">
                    <LabelList
                      dataKey="total"
                      position="top"
                      formatter={(val: any) => formatEGP(Number(val) || 0)}
                      style={{
                        fill: isLight ? '#0f172a' : '#f8fafc',
                        fontWeight: 'bold',
                        fontSize: 10,
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Chart 2: Monthly Disbursement Trend (Area Chart) */}
        <div className={`${cardBg} rounded-2xl p-5 border shadow-md flex flex-col justify-between`}>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Monthly Cash Burn & Liabilities Trend
                  </h3>
                  <p className={`text-[10px] uppercase font-semibold ${subTextColor}`}>
                    Default vs Request refund obligations growth per month
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {renderTypeFilter(chart2Type, setChart2Type)}
                {onExpandChart && (
                  <button
                    onClick={() => onExpandChart('finance_cash_burn_trend', 'Monthly Cash Burn & Liabilities Trend', 'Default vs Request refund obligations growth per month')}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="View Fullscreen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart2MonthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorDefault" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRequest" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke={isLight ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} />
                  <YAxis stroke={isLight ? '#64748b' : '#94a3b8'} fontSize={10} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isLight ? '#ffffff' : '#0f172a',
                      borderColor: isLight ? '#e2e8f0' : '#334155',
                      borderRadius: '12px',
                      color: isLight ? '#0f172a' : '#ffffff',
                      fontSize: '12px',
                    }}
                    formatter={(val: any, name: any) => [
                      formatEGPFull(Number(val) || 0),
                      name === 'defaultAmount' ? 'Default Refunds' : 'Request Refunds',
                    ]}
                  />
                  <Legend
                    formatter={(value) => (
                      <span className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {value === 'defaultAmount' ? 'Default Refunds' : 'Request Refunds'}
                      </span>
                    )}
                  />
                  {(chart2Type === 'ALL' || chart2Type === 'default') && (
                    <Area type="monotone" dataKey="defaultAmount" name="defaultAmount" stroke="#ef4444" fillOpacity={1} fill="url(#colorDefault)" />
                  )}
                  {(chart2Type === 'ALL' || chart2Type === 'Request') && (
                    <Area type="monotone" dataKey="requestAmount" name="requestAmount" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRequest)" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Audit & Finance Matrix Table */}
      <div className={`${cardBg} rounded-2xl p-5 border shadow-md`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Financial Settlement Summary per Partner Company
              </h3>
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${subTextColor}`}>
                Detailed breakdown of cheque pending vs delivered obligations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {renderTypeFilter(tableType, setTableType)}
            {onExpandChart && (
              <button
                onClick={() => onExpandChart('finance_settlement_table', 'Financial Settlement Summary per Partner Company', 'Detailed breakdown of cheque pending vs delivered obligations')}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="View Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className={`overflow-x-auto border ${tableBorder} rounded-xl`}>
          <table className="w-full text-left text-xs">
            <thead className={`${theadBg} font-bold border-b text-[10px] uppercase tracking-wider`}>
              <tr>
                <th className="p-3">Company</th>
                <th className="p-3 text-center"># Requests</th>
                <th className="p-3 text-right">Cheque Pending</th>
                <th className="p-3 text-right text-emerald-500">Delivered</th>
                <th className="p-3 text-right">Total Cheques</th>
                <th className="p-3 text-center">Percentage %</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${tbodyBg} font-mono text-[11px]`}>
              {tableCompanyData.map((c) => {
                const share = tableTotalAmount > 0 ? (c.total / tableTotalAmount) * 100 : 0;
                return (
                  <tr key={c.company} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'}>
                    <td className={`p-3 font-sans font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{c.company}</td>
                    <td className="p-3 text-center font-bold">{c.count}</td>
                    <td className="p-3 text-right text-amber-500 font-bold">{formatTableAmountFull(c.cheque)}</td>
                    <td className="p-3 text-right text-emerald-500 font-bold">{formatTableAmountFull(c.cancelled)}</td>
                    <td className={`p-3 text-right font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{formatTableAmountFull(c.total)}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 font-bold text-[10px] font-sans">
                        {share.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className={`${isLight ? 'bg-slate-900 text-white' : 'bg-slate-950 text-white'} font-bold text-xs border-t`}>
              <tr>
                <td className="p-3">Grand Total</td>
                <td className="p-3 text-center font-mono">{tableTotalCount}</td>
                <td className="p-3 text-right text-amber-400 font-mono">{formatTableAmountFull(tableChequeAmount)}</td>
                <td className="p-3 text-right text-emerald-400 font-mono">{formatTableAmountFull(tableCancelledAmount)}</td>
                <td className="p-3 text-right text-amber-300 font-mono text-sm font-black">{formatTableAmountFull(tableTotalAmount)}</td>
                <td className="p-3 text-center font-mono">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Raw Records Explorer — hidden by default, own Company/Type/Status filters */}
      <div className={`${cardBg} rounded-2xl p-5 border shadow-md`}>
        <div className={`flex flex-wrap items-center gap-2 mb-4 ${isRawTableVisible ? 'justify-between' : 'justify-end'}`}>
          {isRawTableVisible && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  #Cheques
                </h3>
                <p className={`text-[10px] uppercase tracking-wider font-semibold ${subTextColor}`}>
                  Total Amount grouped by Action Date &amp; Type
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            {isRawTableVisible && onExpandChart && (
              <button
                onClick={() => onExpandChart('finance_cheques_table', '#Cheques', 'Total Amount grouped by Action Date & Type')}
                title="Full screen"
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  isLight
                    ? 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setIsRawTableVisible(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isLight
                  ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              {isRawTableVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {isRawTableVisible ? 'Hide table' : 'Show table'}
            </button>
          </div>
        </div>

        {isRawTableVisible && (
          <>
            {/* Cheque Pending Aging Analysis */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {(
                [
                  {
                    key: 'fresh' as const,
                    icon: CheckCircle2,
                    card: isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-950/20 border-emerald-900/40',
                    iconWrap: 'bg-emerald-500/15 text-emerald-500',
                    label: 'text-emerald-600 dark:text-emerald-400',
                  },
                  {
                    key: 'mid' as const,
                    icon: Clock,
                    card: isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/20 border-amber-900/40',
                    iconWrap: 'bg-amber-500/15 text-amber-500',
                    label: 'text-amber-600 dark:text-amber-400',
                  },
                  {
                    key: 'overdue' as const,
                    icon: ShieldAlert,
                    card: isLight ? 'bg-rose-50 border-rose-200' : 'bg-rose-950/20 border-rose-900/40',
                    iconWrap: 'bg-rose-500/15 text-rose-500',
                    label: 'text-rose-600 dark:text-rose-400',
                  },
                ]
              ).map(({ key, icon: Icon, card, iconWrap, label }) => {
                const b = chequeAging[key];
                const isActive = rawAgingFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRawAgingFilter(prev => (prev === key ? 'ALL' : key))}
                    className={`text-left rounded-xl p-3 border flex items-center gap-3 cursor-pointer transition-all ${card} ${
                      isActive ? 'ring-2 ring-offset-1 ring-indigo-500' : 'hover:opacity-80'
                    } ${isLight ? 'ring-offset-white' : 'ring-offset-slate-900'}`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconWrap}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${label}`}>
                        {b.label}
                      </p>
                      <p className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {formatTableAmountFull(b.total)}
                        <span className={`text-[10px] font-semibold ml-1 ${subTextColor}`}>({b.count})</span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Company / Type / Status filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <select
                value={rawFilterCompany}
                onChange={(e) => setRawFilterCompany(e.target.value)}
                className={selectClass}
              >
                <option value="ALL">All Companies</option>
                {companyOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={rawFilterType}
                onChange={(e) => setRawFilterType(e.target.value as 'ALL' | 'default' | 'Request')}
                className={selectClass}
              >
                <option value="ALL">All Types</option>
                <option value="default">Default</option>
                <option value="Request">Request</option>
              </select>

              <select
                value={rawFilterStatus}
                onChange={(e) => setRawFilterStatus(e.target.value)}
                className={selectClass}
              >
                <option value="ALL">All Statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <button
                onClick={handleExportChequesExcel}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ml-auto ${
                  isLight
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-900 hover:bg-emerald-950/70'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                Export Excel
              </button>

              <span className={`text-[11px] font-semibold ${subTextColor}`}>
                {rawFilteredRecords.length} records
              </span>
            </div>

            <div className={`overflow-x-auto overflow-y-auto max-h-[60vh] border ${tableBorder} rounded-xl`}>
              <table className="w-full text-left text-xs">
                <thead className={`${theadBg} font-bold border-b text-[10px] uppercase tracking-wider sticky top-0 z-10`}>
                  <tr>
                    <th className="p-3">Company</th>
                    <th className="p-3">Action Date</th>
                    <th className="p-3 text-center">Type</th>
                    <th className="p-3 text-center">Records</th>
                    <th className="p-3 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${tbodyBg} font-mono text-[11px]`}>
                  {rawGroupedByDate.map((group) => (
                    <tr key={`${group.company}||${group.date}||${group.type}`} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'}>
                      <td className="p-3 font-sans font-bold text-blue-500">{group.company}</td>
                      <td className={`p-3 font-sans font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{group.date}</td>
                      <td className="p-3 text-center font-sans">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            group.type.toLowerCase() === 'default'
                              ? 'bg-rose-500/20 text-rose-500'
                              : 'bg-indigo-500/20 text-indigo-400'
                          }`}
                        >
                          {group.type}
                        </span>
                      </td>
                      <td className="p-3 text-center font-bold">{group.count}</td>
                      <td className="p-3 text-right font-black text-sm text-amber-500">{formatTableAmountFull(group.total)}</td>
                    </tr>
                  ))}
                  {rawGroupedByDate.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        No records match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
                {rawGroupedByDate.length > 0 && (
                  <tfoot className={`${isLight ? 'bg-slate-900 text-white' : 'bg-slate-950 text-white'} font-bold text-[11px] border-t`}>
                    <tr>
                      <td className="p-3 font-sans" colSpan={2}>Grand Total</td>
                      <td className="p-3 text-center"></td>
                      <td className="p-3 text-center font-mono">{rawGrandCount}</td>
                      <td className="p-3 text-right font-mono text-amber-300 font-black text-sm">{formatTableAmountFull(rawGrandTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
