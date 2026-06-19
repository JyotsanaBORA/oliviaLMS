import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  User,
  Calendar,
  Clock,
  CheckCircle,
  Filter,
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v) => (v === undefined || v === null || v === '') ? '—' : v;
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month:    'short',
        day:      '2-digit',
        year:     'numeric',
        hour:     '2-digit',
        minute:   '2-digit',
      })
    : '—';
const fmtDateShort = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day:   '2-digit',
        year:  'numeric',
      })
    : '—';
const fmtMoney = (n) => (n != null && n !== '') ? `$${Number(n).toLocaleString()}` : '—';

const todayStr = () => new Date().toISOString().split('T')[0];

const STATUS_COLORS = {
  new:      'bg-blue-100 text-blue-800',
  reviewed: 'bg-yellow-100 text-yellow-800',
  imported: 'bg-green-100 text-green-800',
};

const DATE_PRESETS = [
  { label: 'All',     value: 'all' },
  { label: 'Today',   value: 'today' },
  { label: '7 Days',  value: '7days' },
  { label: '30 Days', value: '30days' },
  { label: 'Custom',  value: 'custom' },
];

// ── Component ─────────────────────────────────────────────────────────────────
const LoopLeadsModal = ({ onClose }) => {
  const [leads, setLeads]               = useState([]);
  const [summary, setSummary]           = useState({ new: 0, reviewed: 0, imported: 0, total: 0 });
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [datePreset, setDatePreset]     = useState('all');
  const [startDate, setStartDate]       = useState('');
  const [endDate, setEndDate]           = useState(todayStr());
  const [pagination, setPagination]     = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [detail, setDetail]             = useState(null);
  const [markingId, setMarkingId]       = useState(null);

  const buildDateParams = useCallback((params) => {
    if (datePreset === 'all') return;
    if (datePreset === 'custom') {
      if (startDate && endDate) {
        params.set('dateFilter', 'custom');
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }
    } else {
      params.set('dateFilter', datePreset);
    }
  }, [datePreset, startDate, endDate]);

  const fetchLeads = useCallback(async (opts = {}) => {
    const { silent = false, page = pagination.page, limit = pagination.limit } = opts;
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams({ page, limit });
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      buildDateParams(params);

      const res = await axios.get(`/api/loop-leads?${params}`);
      if (res.data?.success) {
        setLeads(res.data.data);
        setSummary(res.data.summary || { new: 0, reviewed: 0, imported: 0, total: 0 });
        setPagination(prev => ({ ...prev, ...res.data.pagination, limit, page }));
      }
    } catch (err) {
      console.error('[LoopLeadsModal] fetch:', err);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search, datePreset, startDate, endDate, pagination.limit, buildDateParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchLeads({ page: 1 }); }, [statusFilter, datePreset]); // eslint-disable-line react-hooks/exhaustive-deps

  const markReviewed = async (lead) => {
    if (lead.status !== 'new') return;
    setMarkingId(lead._id);
    try {
      await axios.patch(`/api/loop-leads/${lead._id}/status`, { status: 'reviewed' });
      toast.success('Marked as reviewed');
      fetchLeads({ silent: true, page: pagination.page });
      if (detail?._id === lead._id) setDetail(prev => ({ ...prev, status: 'reviewed' }));
    } catch {
      toast.error('Failed to update status');
    } finally {
      setMarkingId(null);
    }
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { if (detail) setDetail(null); else onClose(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, detail]);

  const goToPage = (p) => {
    if (p < 1 || p > pagination.pages) return;
    fetchLeads({ page: p });
  };

  const renderPageNumbers = () => {
    const { page, pages } = pagination;
    if (pages <= 1) return null;
    const nums = [];
    const range = 2;
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || (i >= page - range && i <= page + range)) {
        nums.push(i);
      } else if (nums[nums.length - 1] !== '...') {
        nums.push('...');
      }
    }
    return nums.map((n, idx) =>
      n === '...' ? (
        <span key={`e-${idx}`} className="px-2 py-1 text-gray-400 text-sm">…</span>
      ) : (
        <button
          key={n}
          onClick={() => goToPage(n)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            n === page
              ? 'bg-indigo-600 text-white shadow'
              : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
          }`}
        >
          {n}
        </button>
      )
    );
  };

  const serialOf = (idx) => (pagination.page - 1) * pagination.limit + idx + 1;

  const renderDetail = () => (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{fmt(detail.firstname)} {fmt(detail.lastname)}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Received: {fmtDate(detail.receivedAt)}</p>
          </div>
          <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[detail.status] || 'bg-gray-100 text-gray-700'}`}>{detail.status || '—'}</span>
            {detail.status === 'new' && (
              <button onClick={() => markReviewed(detail)} disabled={markingId === detail._id}
                className="flex items-center gap-1 px-2 py-0.5 text-xs bg-yellow-50 text-yellow-700 border border-yellow-300 rounded hover:bg-yellow-100 disabled:opacity-50">
                <CheckCircle size={12} /> Mark Reviewed
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><Phone size={11}/> Phone</p><p className="text-sm font-medium text-gray-900">{fmt(detail.phone)}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><Mail size={11}/> Email</p><p className="text-sm font-medium text-gray-900 break-all">{fmt(detail.email)}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><MapPin size={11}/> City</p><p className="text-sm text-gray-700">{fmt(detail.city)}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">State / ZIP</p><p className="text-sm text-gray-700">{fmt(detail.state)} {fmt(detail.zip)}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><DollarSign size={11}/> Debt Amount</p><p className="text-sm font-semibold text-gray-900">{fmtMoney(detail.debt_amount)}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">Unsecured Debt</p><p className="text-sm text-gray-700">{fmtMoney(detail.unsecured_debt)}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-gray-500 mb-0.5">FICO Score</p><p className="text-sm text-gray-700">{fmt(detail.fico)}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><Calendar size={11}/> Date of Birth</p><p className="text-sm text-gray-700">{fmt(detail.dob)}</p></div>
          </div>
          {detail.address && <div><p className="text-xs text-gray-500 mb-0.5">Address</p><p className="text-sm text-gray-700">{detail.address}</p></div>}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <div><p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><Clock size={11}/> Received</p><p className="text-xs text-gray-700">{fmtDate(detail.receivedAt)}</p></div>
            {detail.importedAt && <div><p className="text-xs text-gray-500 mb-0.5">Imported</p><p className="text-xs text-gray-700">{fmtDate(detail.importedAt)}</p></div>}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
                <User size={18} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">MyDebt Review Leads</h2>
                <p className="text-xs text-gray-500">Inbound leads from MyDebt Review</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchLeads({ silent: true, page: 1 })} disabled={refreshing}
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50" title="Refresh">
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
          </div>

          {/* Summary */}
          <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            {[
              { label: 'New',      val: summary.new,      cls: 'bg-blue-100 text-blue-800'    },
              { label: 'Reviewed', val: summary.reviewed, cls: 'bg-yellow-100 text-yellow-800'},
              { label: 'Imported', val: summary.imported, cls: 'bg-green-100 text-green-800'  },
              { label: 'Total',    val: summary.total,    cls: 'bg-indigo-100 text-indigo-800' },
            ].map(({ label, val, cls }) => (
              <span key={label} className={`px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>
                {label}: <strong>{val}</strong>
              </span>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 px-6 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search name, email, phone, city…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchLeads({ page: 1 }); }}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">All Statuses</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="imported">Imported</option>
            </select>
            <select value={pagination.limit}
              onChange={(e) => { const lim = Number(e.target.value); setPagination(prev => ({ ...prev, limit: lim })); fetchLeads({ page: 1, limit: lim }); }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white">
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button onClick={() => fetchLeads({ page: 1 })}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
              <Search size={13} /> Search
            </button>
          </div>

          {/* Date filter */}
          <div className="flex flex-wrap items-center gap-2 px-6 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">
              <Filter size={12} /> Date:
            </span>
            {DATE_PRESETS.map(({ label, value }) => (
              <button key={value} onClick={() => setDatePreset(value)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  datePreset === value
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-white border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                }`}>
                {label}
              </button>
            ))}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={startDate} max={endDate || todayStr()} onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                <span className="text-xs text-gray-400">to</span>
                <input type="date" value={endDate} min={startDate} max={todayStr()} onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                <button onClick={() => fetchLeads({ page: 1 })}
                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <User size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">No leads found</p>
                <p className="text-xs mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">City</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Debt</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Received</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map((lead, idx) => (
                    <tr key={lead._id} className="hover:bg-indigo-50 cursor-pointer transition-colors" onClick={() => setDetail(lead)}>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                          {serialOf(idx)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{fmt(lead.firstname)} {fmt(lead.lastname)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(lead.phone)}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={lead.email}>{fmt(lead.email)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(lead.city)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(lead.state)}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">{fmtMoney(lead.debt_amount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs text-gray-700 font-medium">{fmtDateShort(lead.receivedAt)}</div>
                        <div className="text-[11px] text-gray-400">
                          {lead.receivedAt ? new Date(lead.receivedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) + ' ET' : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-700'}`}>{lead.status || '—'}</span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {lead.status === 'new' && (
                          <button onClick={() => markReviewed(lead)} disabled={markingId === lead._id}
                            className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100 disabled:opacity-50 whitespace-nowrap">
                            {markingId === lead._id ? '…' : 'Mark Reviewed'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <p className="text-sm text-gray-500">
              {pagination.total === 0 ? 'No results' : (
                <>
                  Showing{' '}
                  <span className="font-semibold text-gray-700">
                    {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{' '}
                  of <span className="font-semibold text-gray-700">{pagination.total}</span> leads
                  {pagination.pages > 1 && <> &nbsp;·&nbsp; Page <span className="font-semibold text-gray-700">{pagination.page}</span> of <span className="font-semibold text-gray-700">{pagination.pages}</span></>}
                </>
              )}
            </p>
            {pagination.pages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => goToPage(1)} disabled={pagination.page <= 1}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 font-medium" title="First">«</button>
                <button onClick={() => goToPage(pagination.page - 1)} disabled={pagination.page <= 1}
                  className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30"><ChevronLeft size={15} /></button>
                {renderPageNumbers()}
                <button onClick={() => goToPage(pagination.page + 1)} disabled={pagination.page >= pagination.pages}
                  className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30"><ChevronRight size={15} /></button>
                <button onClick={() => goToPage(pagination.pages)} disabled={pagination.page >= pagination.pages}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 font-medium" title="Last">»</button>
              </div>
            )}
          </div>

        </div>
      </div>
      {detail && renderDetail()}
    </>
  );
};

export default LoopLeadsModal;
