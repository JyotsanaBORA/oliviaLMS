import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  TrendingUp,
  Users,
  DollarSign,
  Award,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtDateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

function fmtCurrency(val) {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString('en-US')}`;
}

function fmtCurrencyFull(val) {
  if (val === null || val === undefined || val === '') return '—';
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

const SALE_STATUSES = ['SALE', 'Sale Long Play', 'Immediate Enrollment'];

// ── Stat Card Component ───────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, sub, accent }) => (
  <div
    style={{ borderTop: `3px solid ${accent}` }}
    className="bg-white rounded-xl shadow-sm p-5 flex items-start gap-4 min-w-0"
  >
    <div
      className="rounded-lg p-3 flex-shrink-0"
      style={{ backgroundColor: `${accent}18` }}
    >
      <Icon size={22} style={{ color: accent }} />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
const AffiliateDashboard = () => {
  const { user } = useAuth();

  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [saleOnly,  setSaleOnly]  = useState(false);

  const [leads,      setLeads]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });

  const filterRef = useRef({ startDate: '', endDate: '', saleOnly: false });

  // ── Computed stats from current page ──────────────────────────
  const stats = useMemo(() => {
    const totalDebt = leads.reduce((s, l) => s + (Number(l.totalDebtAmount) || 0), 0);
    const saleCount = leads.filter(l => SALE_STATUSES.includes(l.leadProgressStatus)).length;
    const scores    = leads.map(l => Number(l.creditScore)).filter(n => n > 0);
    const avgScore  = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return { totalDebt, saleCount, avgScore };
  }, [leads]);

  // ── Fetch ──────────────────────────────────────────────────────
  const fetchLeads = useCallback(async (page = 1, filters = filterRef.current) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: pagination.limit });
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate)   params.set('endDate',   filters.endDate);
      if (filters.saleOnly)  params.set('saleOnly',  'true');
      const res = await axios.get(`/api/affiliate/leads?${params}`);
      if (res.data?.success) {
        setLeads(res.data.data.leads || []);
        setPagination(res.data.data.pagination || { page, limit: 50, total: 0, pages: 0 });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.limit]);

  useEffect(() => { fetchLeads(1); }, [fetchLeads]);

  const handleApplyFilters = () => {
    if (startDate && endDate && startDate > endDate) {
      toast.error('Start date must be before end date');
      return;
    }
    filterRef.current = { startDate, endDate, saleOnly };
    fetchLeads(1, { startDate, endDate, saleOnly });
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSaleOnly(false);
    filterRef.current = { startDate: '', endDate: '', saleOnly: false };
    fetchLeads(1, { startDate: '', endDate: '', saleOnly: false });
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.pages) return;
    fetchLeads(newPage, filterRef.current);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      const f = filterRef.current;
      if (f.startDate) params.set('startDate', f.startDate);
      if (f.endDate)   params.set('endDate',   f.endDate);
      if (f.saleOnly)  params.set('saleOnly',  'true');
      const res = await axios.get(`/api/affiliate/leads/export?${params}`, { responseType: 'blob' });
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href  = url;
      const cd   = res.headers['content-disposition'] || '';
      link.setAttribute('download', cd.match(/filename="?([^"]+)"?/)?.[1] || 'affiliate_leads.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV downloaded successfully');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ── Credit score badge colour ─────────────────────────────────
  const scoreBadge = (score) => {
    if (!score) return { bg: '#f3f4f6', text: '#9ca3af', label: '—' };
    if (score >= 750) return { bg: '#dcfce7', text: '#15803d', label: score };
    if (score >= 650) return { bg: '#fef9c3', text: '#a16207', label: score };
    return { bg: '#fee2e2', text: '#b91c1c', label: score };
  };

  // ── Status pill ───────────────────────────────────────────────
  const statusPill = (status) => {
    if (!status) return null;
    const isSale = SALE_STATUSES.includes(status);
    const isPending = ['Pending', 'pending', 'active'].includes(status);
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
        style={isSale
          ? { background: '#dcfce7', color: '#15803d' }
          : isPending
          ? { background: '#fef3c7', color: '#92400e' }
          : { background: '#f3f4f6', color: '#6b7280' }}
      >
        {isSale ? <CheckCircle2 size={11} /> : <Clock size={11} />}
        {status}
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>

      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
        }}
      >
        {/* Decorative circles */}
        <div
          className="absolute -top-16 -right-16 rounded-full opacity-10"
          style={{ width: 260, height: 260, background: '#EAB308' }}
        />
        <div
          className="absolute -bottom-20 -left-10 rounded-full opacity-5"
          style={{ width: 200, height: 200, background: '#EAB308' }}
        />

        <div className="relative px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Left: logo + title */}
          <div className="flex items-center gap-4">
            <div
              className="rounded-xl p-2 flex-shrink-0"
              style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)' }}
            >
              <img
                src="/rglogo2.png"
                alt="RG Consultancy"
                style={{ height: 52, width: 'auto', filter: 'brightness(1.05)' }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-white tracking-tight">
                  Affiliate Dashboard
                </h1>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(234,179,8,0.18)', color: '#FDE047' }}
                >
                  LIVE
                </span>
              </div>
              <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>
                Campaign&nbsp;
                <span className="font-semibold" style={{ color: '#FDE047' }}>
                  GTIOB
                </span>
                &nbsp;· Inbound Vicidial Leads
              </p>
              {user?.name && (
                <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                  Logged in as&nbsp;
                  <span className="font-medium" style={{ color: '#cbd5e1' }}>{user.name}</span>
                </p>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={() => fetchLeads(pagination.page, filterRef.current)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50 transition-colors"
              style={{ background: 'linear-gradient(135deg, #EAB308, #ca8a04)', color: '#0f172a' }}
            >
              <Download size={15} />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-5">

        {/* ── Stat Cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Leads"
            value={pagination.total.toLocaleString()}
            sub="matching campaign"
            accent="#6366f1"
          />
          <StatCard
            icon={DollarSign}
            label="Total Debt Value"
            value={fmtCurrency(stats.totalDebt)}
            sub="this page"
            accent="#EAB308"
          />
          <StatCard
            icon={TrendingUp}
            label="Sales Closed"
            value={stats.saleCount.toLocaleString()}
            sub={`of ${leads.length} on this page`}
            accent="#10b981"
          />
          <StatCard
            icon={Award}
            label="Avg Credit Score"
            value={stats.avgScore ? stats.avgScore : '—'}
            sub="this page"
            accent="#f59e0b"
          />
        </div>

        {/* ── Filter Panel ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div
            className="px-5 py-3 flex items-center gap-2 border-b border-slate-100"
            style={{ background: '#f8fafc' }}
          >
            <SlidersHorizontal size={16} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Filter Leads</span>
          </div>
          <div className="px-5 py-4 flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': '#6366f1' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <button
                onClick={() => setSaleOnly(v => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors"
                style={saleOnly
                  ? { background: '#dcfce7', color: '#15803d', borderColor: '#86efac' }
                  : { background: 'white', color: '#64748b', borderColor: '#e2e8f0' }}
              >
                <CheckCircle2 size={15} />
                SALE Only
              </button>
            </div>
            <div className="flex gap-2 pb-1">
              <button
                onClick={handleApplyFilters}
                className="px-5 py-2 rounded-lg text-sm font-bold text-white transition-colors"
                style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
              >
                Apply
              </button>
              <button
                onClick={handleClearFilters}
                className="px-5 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Table header bar */}
          <div className="px-5 py-3 flex items-center justify-between border-b border-slate-100" style={{ background: '#f8fafc' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">
                {pagination.total.toLocaleString()} Lead{pagination.total !== 1 ? 's' : ''}
              </span>
              {(filterRef.current.startDate || filterRef.current.endDate) && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  Date filtered
                </span>
              )}
              {filterRef.current.saleOnly && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#dcfce7', color: '#15803d' }}>
                  SALE only
                </span>
              )}
            </div>
            {pagination.pages > 1 && (
              <span className="text-xs text-slate-400">
                Page {pagination.page} of {pagination.pages}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-56 gap-3">
              <div
                className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
                style={{ borderColor: '#6366f1 transparent #6366f1 #6366f1' }}
              />
              <p className="text-sm text-slate-400 font-medium">Loading leads…</p>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 gap-2">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: '#f1f5f9' }}>
                <Users size={28} className="text-slate-300" />
              </div>
              <p className="text-base font-semibold text-slate-500">No leads found</p>
              <p className="text-sm text-slate-400">
                {startDate || endDate || saleOnly
                  ? 'Try adjusting your filters'
                  : 'No GTIOB campaign leads or calls in the system yet'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: '#0f172a' }}>
                    {['#', 'Lead Created At', 'Customer Name', 'Primary Phone #', 'Total Debt', 'Draft Date', 'Credit Score', 'Status', 'Agent 1', 'Agent 2'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${i === 0 ? 'text-center w-10' : i === 3 || i === 4 || i === 6 ? 'text-right' : 'text-left'}`}
                        style={{ color: '#94a3b8' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, idx) => {
                    const isEven = idx % 2 === 0;
                    const sc = scoreBadge(lead.creditScore);
                    const rowNum = ((pagination.page - 1) * pagination.limit) + idx + 1;
                    return (
                      <tr
                        key={lead._id || idx}
                        style={{ background: isEven ? '#ffffff' : '#f8fafc' }}
                        className="hover:bg-indigo-50 transition-colors"
                      >
                        <td className="px-4 py-3 text-center text-xs text-slate-300 font-mono">{rowNum}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{fmtDate(lead.createdAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-800">{lead.name || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="font-mono text-slate-600 text-xs">{lead.phone || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="font-bold" style={{ color: '#15803d' }}>
                            {fmtCurrencyFull(lead.totalDebtAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">{fmtDateOnly(lead.draftDate)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span
                            className="inline-block px-2 py-0.5 rounded-md text-xs font-bold"
                            style={{ background: sc.bg, color: sc.text }}
                          >
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{statusPill(lead.leadProgressStatus)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-slate-600">{lead.createdBy?.name || '—'}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-slate-600">{lead.updatedBy?.name || lead.assignedTo?.name || '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Pagination ────────────────────────────────────────── */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Showing&nbsp;
              <span className="font-semibold text-slate-700">
                {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>
              &nbsp;of&nbsp;
              <span className="font-semibold text-slate-700">{pagination.total.toLocaleString()}</span>
              &nbsp;leads
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(pagination.pages, 7) }, (_, i) => {
                const p = pagination.pages <= 7 ? i + 1
                  : pagination.page <= 4 ? i + 1
                  : pagination.page >= pagination.pages - 3 ? pagination.pages - 6 + i
                  : pagination.page - 3 + i;
                return (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    disabled={loading}
                    className="w-9 h-9 rounded-lg text-sm font-semibold transition-colors"
                    style={p === pagination.page
                      ? { background: '#6366f1', color: 'white', border: '1px solid #6366f1' }
                      : { background: 'white', color: '#64748b', border: '1px solid #e2e8f0' }}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages || loading}
                className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Footer branding ───────────────────────────────────── */}
        <div className="flex items-center justify-center gap-3 pt-2 pb-4 opacity-40">
          <img src="/rglogo2.png" alt="RG" style={{ height: 18, width: 'auto' }} />
          <span className="text-xs text-slate-400 font-medium tracking-widest uppercase">
            RG Consultancy · Affiliate Portal
          </span>
        </div>

      </div>
    </div>
  );
};

export default AffiliateDashboard;
