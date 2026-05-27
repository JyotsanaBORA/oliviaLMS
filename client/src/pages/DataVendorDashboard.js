import React, { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  Download, RefreshCw, Search, ChevronLeft, ChevronRight,
  List, BarChart2, FileSpreadsheet, ArrowLeft, Calendar,
  Hash, Users, Filter, TrendingUp, ChevronDown, ChevronUp,
  DollarSign, ShoppingCart, Activity
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

// ── All 45 ViciDial columns for the records view ──────────────────
const ALL_COLUMNS = [
  { key: 'lead_id',                label: 'Lead ID' },
  { key: 'entry_date',             label: 'Entry Date' },
  { key: 'modify_date',            label: 'Modify Date' },
  { key: 'status',                 label: 'Status' },
  { key: 'user',                   label: 'User' },
  { key: 'vendor_lead_code',       label: 'Vendor Lead Code' },
  { key: 'source_id',              label: 'Source ID' },
  { key: 'list_id',                label: 'List ID' },
  { key: 'gmt_offset_now',         label: 'GMT Offset' },
  { key: 'called_since_last_reset',label: 'Called Since Reset' },
  { key: 'phone_code',             label: 'Phone Code' },
  { key: 'phone_number',           label: 'Phone Number' },
  { key: 'title',                  label: 'Title' },
  { key: 'first_name',             label: 'First Name' },
  { key: 'middle_initial',         label: 'Middle Initial' },
  { key: 'last_name',              label: 'Last Name' },
  { key: 'address1',               label: 'Address 1' },
  { key: 'address2',               label: 'Address 2' },
  { key: 'address3',               label: 'Address 3' },
  { key: 'city',                   label: 'City' },
  { key: 'state',                  label: 'State' },
  { key: 'province',               label: 'Province' },
  { key: 'postal_code',            label: 'Postal Code' },
  { key: 'country_code',           label: 'Country Code' },
  { key: 'gender',                 label: 'Gender' },
  { key: 'date_of_birth',          label: 'Date of Birth' },
  { key: 'alt_phone',              label: 'Alt Phone' },
  { key: 'email',                  label: 'Email' },
  { key: 'security_phrase',        label: 'Security Phrase' },
  { key: 'comments',               label: 'Comments' },
  { key: 'called_count',           label: 'Called Count' },
  { key: 'last_local_call_time',   label: 'Last Call Time' },
  { key: 'rank',                   label: 'Rank' },
  { key: 'owner',                  label: 'Owner' },
  { key: 'entry_id',               label: 'Entry ID' },
  { key: 'debt',                   label: 'Debt' },
  { key: 'ccount',                 label: 'CCount' },
  { key: 'monthly_payment',        label: 'Monthly Payment' },
  { key: 'remark',                 label: 'Remark' },
  { key: 'custom1',                label: 'Custom 1' },
  { key: 'custom2',                label: 'Custom 2' },
  { key: 'custom3',                label: 'Custom 3' },
  { key: 'custom4',                label: 'Custom 4' },
  { key: 'custom5',                label: 'Custom 5' },
  { key: 'custom6',                label: 'Custom 6' },
  { key: 'enrolled_debt',          label: 'Enrolled Debt' },
];

// Known ViciDial dispositions with colors (future unknown ones get default)
const DISP_META = {
  'SALE':   { label: 'Sale',                   color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  'NQ':     { label: 'Not Qualified',          color: 'bg-red-100 text-red-800 ring-red-200' },
  'NI':     { label: 'Not Interested',         color: 'bg-orange-100 text-orange-800 ring-orange-200' },
  'NP':     { label: 'No Pitch No Price',      color: 'bg-amber-100 text-amber-800 ring-amber-200' },
  'NEW':    { label: 'New / Uncalled',         color: 'bg-blue-100 text-blue-800 ring-blue-200' },
  'A':      { label: 'Answering Machine',      color: 'bg-indigo-100 text-indigo-800 ring-indigo-200' },
  'AB':     { label: 'Busy Auto',              color: 'bg-violet-100 text-violet-800 ring-violet-200' },
  'ADC':    { label: 'Disconnected Auto',      color: 'bg-purple-100 text-purple-800 ring-purple-200' },
  'AL':     { label: 'Ans Machine Msg Played', color: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200' },
  'AM':     { label: 'Ans Machine SentToMsg',  color: 'bg-pink-100 text-pink-800 ring-pink-200' },
  'B':      { label: 'Busy',                   color: 'bg-rose-100 text-rose-800 ring-rose-200' },
  'CALLBK': { label: 'Call Back',              color: 'bg-teal-100 text-teal-800 ring-teal-200' },
  'DAIR':   { label: 'Dead Air',               color: 'bg-slate-100 text-slate-800 ring-slate-200' },
  'DNC':    { label: 'Do Not Call',            color: 'bg-red-200 text-red-900 ring-red-300' },
  'DNCL':   { label: 'DNC Hopper Match',       color: 'bg-red-300 text-red-900 ring-red-400' },
  'HU':     { label: 'Hangup',                 color: 'bg-gray-100 text-gray-800 ring-gray-200' },
  'LB':     { label: 'Language Barrier',       color: 'bg-cyan-100 text-cyan-800 ring-cyan-200' },
  'N':      { label: 'No Answer',              color: 'bg-yellow-100 text-yellow-800 ring-yellow-200' },
  'NA':     { label: 'No Answer AutoDial',     color: 'bg-amber-100 text-amber-900 ring-amber-200' },
  'ND':     { label: 'No Debt',                color: 'bg-lime-100 text-lime-800 ring-lime-200' },
  'PDROP':  { label: 'Pre-Routing Drop',       color: 'bg-purple-100 text-purple-800 ring-purple-200' },
  'RING':   { label: 'Ringing',                color: 'bg-sky-100 text-sky-800 ring-sky-200' },
  'WNU':    { label: 'Wrong Number',           color: 'bg-stone-100 text-stone-800 ring-stone-200' },
  'VDAD':   { label: 'ViciDial AutoDial',      color: 'bg-stone-100 text-stone-700 ring-stone-200' },
  'UNKNOWN':{ label: 'Unknown',               color: 'bg-gray-100 text-gray-500 ring-gray-200' },
};
const DEFAULT_DISP_COLOR = 'bg-gray-100 text-gray-600 ring-gray-200';

function getDispMeta(status) {
  const key = (status || '').toUpperCase().trim();
  return DISP_META[key] || { label: key || 'Unknown', color: DEFAULT_DISP_COLOR };
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCurrency(val) {
  if (!val && val !== 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

// ─────────────────────────────────────────────────────────────────
const DataVendorDashboard = () => {
  const { user } = useAuth();

  // Three-level navigation state
  const [view, setView] = useState('lists'); // 'lists' | 'runs' | 'records'
  const [selectedList, setSelectedList] = useState(null);   // list object
  const [selectedRun, setSelectedRun]   = useState(null);   // run object

  // ── LISTS VIEW ───────────────────────────────────────────────
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [listsRefreshing, setListsRefreshing] = useState(false);

  // ── RUNS VIEW ────────────────────────────────────────────────
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [allDispositionKeys, setAllDispositionKeys] = useState([]);

  // ── RECORDS VIEW ─────────────────────────────────────────────
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, pages: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [runStats, setRunStats] = useState({ totalLeads: 0, dispositions: {} });
  const [showAllStatuses, setShowAllStatuses] = useState(false);

  // ── SALES TRACKER ────────────────────────────────────────────
  const [salesStats, setSalesStats] = useState({ totalSales: 0, totalEnrolledDebt: 0, avgEnrolledDebt: 0, dailyBreakdown: [] });
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');
  const [showDailyBreakdown, setShowDailyBreakdown] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [dayRecords, setDayRecords] = useState({});
  const [loadingDay, setLoadingDay] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const searchRef = useRef('');

  // ── Fetch lists ──────────────────────────────────────────────
  const fetchLists = useCallback(async (quiet = false) => {
    if (!quiet) setListsLoading(true);
    else setListsRefreshing(true);
    try {
      const res = await axios.get('/api/data-vendor-uploads/lists');
      if (res.data?.success) setLists(res.data.data || []);
    } catch { toast.error('Failed to load lists'); }
    finally { setListsLoading(false); setListsRefreshing(false); }
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  // ── Fetch runs for a list ────────────────────────────────────
  const fetchRuns = useCallback(async (listName) => {
    setRunsLoading(true);
    try {
      const res = await axios.get(`/api/data-vendor-uploads/lists/${encodeURIComponent(listName)}/runs`);
      if (res.data?.success) {
        const data = res.data.data || [];
        setRuns(data);
        // Collect all unique disposition keys across every run
        const keys = new Set();
        data.forEach(run => Object.keys(run.dispositions || {}).forEach(k => keys.add(k)));
        // Sort: put SALE first, then alphabetically
        const sorted = [...keys].sort((a, b) => {
          if (a === 'SALE') return -1;
          if (b === 'SALE') return 1;
          return a.localeCompare(b);
        });
        setAllDispositionKeys(sorted);
      }
    } catch { toast.error('Failed to load runs'); }
    finally { setRunsLoading(false); }
  }, []);

  // ── Fetch records for a run ──────────────────────────────────
  const fetchRecords = useCallback(async (runBatchId, page = 1) => {
    setRecordsLoading(true);
    try {
      const params = { page, limit: pagination.limit };
      if (statusFilter) params.statusFilter = statusFilter;
      if (searchRef.current) params.search = searchRef.current;

      const res = await axios.get(`/api/data-vendor-uploads/runs/${runBatchId}`, { params });
      if (res.data?.success) {
        setRecords(res.data.data || []);
        setPagination(prev => ({ ...prev, ...res.data.pagination }));
      }
    } catch { toast.error('Failed to load records'); }
    finally { setRecordsLoading(false); }
  }, [pagination.limit, statusFilter]);

  // Fetch run stats when entering records view
  const fetchRunStats = useCallback(async (runBatchId) => {
    try {
      const res = await axios.get(`/api/data-vendor-uploads/runs/${runBatchId}/stats`);
      if (res.data?.success) setRunStats(res.data.data);
    } catch {}
  }, []);

  // ── Fetch sales / enrolled-debt stats ───────────────────────
  const fetchSalesStats = useCallback(async (startDate = '', endDate = '') => {
    setSalesLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await axios.get('/api/data-vendor-uploads/sales-stats', { params });
      if (res.data?.success) {
        setSalesStats(res.data.data);
        // Clear expanded state when new stats are fetched
        setExpandedDay(null);
        setDayRecords({});
      }
    } catch { toast.error('Failed to load sales stats'); }
    finally { setSalesLoading(false); }
  }, []);

  // Load sales stats once the lists have loaded (lists view only)
  useEffect(() => {
    if (!listsLoading) fetchSalesStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listsLoading]);

  // Refetch when statusFilter changes (records view)
  useEffect(() => {
    if (view === 'records' && selectedRun) {
      fetchRecords(selectedRun.runBatchId, 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // ── Navigation helpers ───────────────────────────────────────
  const goToRuns = (list) => {
    setSelectedList(list);
    setSelectedRun(null);
    setRuns([]);
    setView('runs');
    fetchRuns(list.listName);
  };

  const goToRecords = (run) => {
    setSelectedRun(run);
    setStatusFilter('');
    setSearchTerm('');
    searchRef.current = '';
    setRecords([]);
    setPagination(prev => ({ ...prev, page: 1, total: 0 }));
    setView('records');
    fetchRecords(run.runBatchId, 1);
    fetchRunStats(run.runBatchId);
  };

  const goBack = () => {
    if (view === 'records') { setView('runs'); setSelectedRun(null); }
    else if (view === 'runs') { setView('lists'); setSelectedList(null); }
  };

  // ── Download helpers ─────────────────────────────────────────
  const downloadRun = async (run) => {
    flushSync(() => setDownloadingId(`run-${run.runBatchId}`));
    try {
      const res = await axios.get(`/api/data-vendor-uploads/runs/${run.runBatchId}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      const safeList = (selectedList?.listName || 'run').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${safeList}_run${run.runNumber}_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch { toast.error('Download failed'); }
    finally { setDownloadingId(null); }
  };

  const downloadAllSales = async () => {
    flushSync(() => setDownloadingId('sales-all'));
    try {
      const params = {};
      if (salesStartDate) params.startDate = salesStartDate;
      if (salesEndDate) params.endDate = salesEndDate;
      const res = await axios.get('/api/data-vendor-uploads/sales-export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      const suffix = salesStartDate || salesEndDate
        ? `_${salesStartDate || 'start'}_to_${salesEndDate || 'end'}`
        : `_all_${new Date().toISOString().slice(0, 10)}`;
      a.download = `sales${suffix}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Sales CSV downloaded');
    } catch (err) {
      if (err.response?.status === 404) toast.error('No SALE records found');
      else toast.error('Download failed');
    } finally { setDownloadingId(null); }
  };

  const downloadCurrentRecords = async () => {
    if (!selectedRun) return;
    await downloadRun(selectedRun);
  };

  const downloadSalesByDay = async (date) => {
    flushSync(() => setDownloadingId(`day-${date}`));
    try {
      const res = await axios.get('/api/data-vendor-uploads/sales-export-day', {
        params: { date },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `sales_${date}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Sales for ${date} downloaded`);
    } catch (err) {
      if (err.response?.status === 404) toast.error(`No SALE records found for ${date}`);
      else toast.error('Download failed');
    } finally { setDownloadingId(null); }
  };

  const toggleDayExpand = async (date) => {
    if (expandedDay === date) { setExpandedDay(null); return; }
    setExpandedDay(date);
    if (dayRecords[date]) return; // already loaded
    setLoadingDay(date);
    try {
      const res = await axios.get('/api/data-vendor-uploads/sales-records-day', { params: { date } });
      if (res.data?.success) setDayRecords(prev => ({ ...prev, [date]: res.data.data }));
    } catch { toast.error(`Failed to load deals for ${date}`); }
    finally { setLoadingDay(null); }
  };

  // ── Search handler (records) ─────────────────────────────────
  const handleSearch = (val) => {
    setSearchTerm(val);
    searchRef.current = val;
  };

  const applySearch = () => {
    if (selectedRun) fetchRecords(selectedRun.runBatchId, 1);
  };

  // ── Render dispositions summary (runs table cell) ────────────
  const renderDispBadge = (status, count) => {
    const meta = getDispMeta(status);
    return (
      <span key={status} title={meta.label}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ${meta.color}`}>
        {status} <span className="opacity-70">{count}</span>
      </span>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────
  if (listsLoading) return <LoadingSpinner message="Loading dashboard…" />;

  // ─────────────────────────────────────────────────────────────
  // SHARED HEADER
  // ─────────────────────────────────────────────────────────────
  const Header = () => (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-xl p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <img src="/rglogo2.png" alt="Logo" className="h-12 w-auto object-contain" loading="eager" />
          <div className="border-l border-slate-600 pl-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <button onClick={() => { setView('lists'); setSelectedList(null); setSelectedRun(null); }}
                className="hover:text-yellow-400 transition-colors font-semibold">
                Dashboard
              </button>
              {selectedList && (
                <>
                  <span>/</span>
                  <button onClick={() => { setView('runs'); setSelectedRun(null); }}
                    className="hover:text-yellow-400 transition-colors font-semibold max-w-[160px] truncate">
                    {selectedList.listName}
                  </button>
                </>
              )}
              {selectedRun && (
                <>
                  <span>/</span>
                  <span className="text-yellow-400 font-semibold">Run #{selectedRun.runNumber}</span>
                </>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {view === 'lists' ? 'Data Vendor Dashboard' :
               view === 'runs' ? selectedList?.listName :
               `Run #${selectedRun?.runNumber}${selectedRun?.runLabel ? ` — ${selectedRun.runLabel}` : ''}`}
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {view === 'lists' && <><span className="text-yellow-400 font-semibold">{lists.length}</span> list{lists.length !== 1 ? 's' : ''}</>}
              {view === 'runs' && <><span className="text-yellow-400 font-semibold">{runs.length}</span> run{runs.length !== 1 ? 's' : ''}</>}
              {view === 'records' && <><span className="text-yellow-400 font-semibold">{pagination.total.toLocaleString()}</span> records</>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {view !== 'lists' && (
            <button onClick={goBack}
              className="px-3 py-2.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-xl flex items-center gap-1.5 transition-all">
              <ArrowLeft size={14} /> Back
            </button>
          )}
          {view === 'lists' && (
            <button onClick={() => fetchLists(true)} disabled={listsRefreshing}
              className="px-4 py-2.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-xl flex items-center gap-2 transition-all disabled:opacity-50">
              <RefreshCw size={14} className={listsRefreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          )}
          {view === 'records' && (
            <button onClick={downloadCurrentRecords} disabled={!!downloadingId}
              className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-yellow-400 to-yellow-500 text-slate-900 rounded-xl hover:from-yellow-300 hover:to-yellow-400 shadow-lg shadow-yellow-400/20 flex items-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {downloadingId && downloadingId.startsWith('run-') ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
              {downloadingId && downloadingId.startsWith('run-') ? 'Downloading…' : 'Download Run'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // VIEW: LISTS
  // ─────────────────────────────────────────────────────────────
  if (view === 'lists') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-purple-50">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-6 space-y-5">
          <Header />

          {/* ── Sales Tracker ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg shadow-emerald-500/20">
                  <TrendingUp size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Sales Tracker</h2>
                  <p className="text-xs text-slate-500">Enrolled debt for SALE dispositions</p>
                </div>
              </div>
              {/* Date Range Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  <span className="text-xs text-slate-500 font-medium">From</span>
                  <input
                    type="date"
                    value={salesStartDate}
                    onChange={e => setSalesStartDate(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 font-medium">To</span>
                  <input
                    type="date"
                    value={salesEndDate}
                    onChange={e => setSalesEndDate(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                  />
                </div>
                <button
                  onClick={() => fetchSalesStats(salesStartDate, salesEndDate)}
                  disabled={salesLoading}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5 transition-all">
                  {salesLoading ? <RefreshCw size={11} className="animate-spin" /> : <Activity size={11} />}
                  Apply
                </button>
                {(salesStartDate || salesEndDate) && (
                  <button
                    onClick={() => { setSalesStartDate(''); setSalesEndDate(''); fetchSalesStats('', ''); }}
                    className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all">
                    ✕ Clear
                  </button>
                )}
                {salesStats.totalSales > 0 && (
                  <button
                    onClick={downloadAllSales}
                    disabled={!!downloadingId}
                    className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300 rounded-lg hover:from-emerald-200 hover:to-teal-200 flex items-center gap-1.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                    {downloadingId === 'sales-all' ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />}
                    {downloadingId === 'sales-all' ? 'Downloading…' : 'Download Sales'}
                  </button>
                )}
              </div>
            </div>

            {/* Stat Cards */}
            {salesLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw size={20} className="animate-spin text-emerald-400" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {/* Total Sales */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total Sales</p>
                      <ShoppingCart size={16} className="text-emerald-500" />
                    </div>
                    <p className="text-3xl font-extrabold text-emerald-800">
                      {(salesStats.totalSales || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">SALE dispositions</p>
                  </div>

                  {/* Total Enrolled Debt */}
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-violet-600 uppercase tracking-wider">Total Enrolled Debt</p>
                      <DollarSign size={16} className="text-violet-500" />
                    </div>
                    <p className="text-3xl font-extrabold text-violet-800">
                      {fmtCurrency(salesStats.totalEnrolledDebt)}
                    </p>
                    <p className="text-xs text-violet-600 mt-1">Sum of enrolled_debt for sales</p>
                  </div>
                </div>

                {/* Daily Breakdown Toggle */}
                {salesStats.dailyBreakdown?.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowDailyBreakdown(s => !s)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors mb-2">
                      {showDailyBreakdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {showDailyBreakdown ? 'Hide' : 'Show'} daily breakdown ({salesStats.dailyBreakdown.length} day{salesStats.dailyBreakdown.length !== 1 ? 's' : ''})
                    </button>

                    {showDailyBreakdown && (
                      <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="min-w-full">
                          <thead className="bg-slate-900">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                              <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sales</th>
                              <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Enrolled Debt</th>
                              <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Export</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {salesStats.dailyBreakdown.map((row, idx) => {
                              const isExpanded = expandedDay === row.date;
                              const isLoadingThis = loadingDay === row.date;
                              const deals = dayRecords[row.date] || [];
                              return (
                                <React.Fragment key={row.date}>
                                  {/* Summary row — click to expand */}
                                  <tr
                                    onClick={() => toggleDayExpand(row.date)}
                                    className={`cursor-pointer transition-colors ${isExpanded ? 'bg-emerald-50' : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'}`}
                                  >
                                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700">
                                      <span className="inline-flex items-center gap-1.5">
                                        {isExpanded ? <ChevronUp size={13} className="text-emerald-600 shrink-0" /> : <ChevronDown size={13} className="text-slate-400 shrink-0" />}
                                        {row.date}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-sm font-bold text-emerald-700 text-right">
                                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs">
                                        {row.sales.toLocaleString()}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-sm font-bold text-violet-700 text-right">
                                      {fmtCurrency(row.enrolledDebt)}
                                    </td>
                                    <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                      <button
                                        onClick={() => downloadSalesByDay(row.date)}
                                        disabled={!!downloadingId}
                                        title={`Download all SALE leads for ${row.date}`}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                                        {downloadingId === `day-${row.date}` ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />}
                                        {downloadingId === `day-${row.date}` ? 'Downloading…' : 'CSV'}
                                      </button>
                                    </td>
                                  </tr>

                                  {/* Expanded deals rows */}
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan={4} className="p-0 border-b border-emerald-100">
                                        <div className="bg-emerald-50/60 border-t border-emerald-100">
                                          {isLoadingThis ? (
                                            <div className="flex items-center justify-center gap-2 py-4 text-sm text-emerald-600">
                                              <RefreshCw size={14} className="animate-spin" /> Loading deals…
                                            </div>
                                          ) : deals.length === 0 ? (
                                            <p className="text-center text-xs text-slate-400 py-3">No records found</p>
                                          ) : (
                                            <div className="overflow-x-auto">
                                              <table className="min-w-full text-xs">
                                                <thead>
                                                  <tr className="bg-emerald-800/10">
                                                    <th className="px-4 py-2 text-left font-bold text-emerald-800 uppercase tracking-wider">#</th>
                                                    <th className="px-4 py-2 text-left font-bold text-emerald-800 uppercase tracking-wider">Name</th>
                                                    <th className="px-4 py-2 text-left font-bold text-emerald-800 uppercase tracking-wider">Phone</th>
                                                    <th className="px-4 py-2 text-right font-bold text-emerald-800 uppercase tracking-wider">Debt</th>
                                                    <th className="px-4 py-2 text-right font-bold text-violet-700 uppercase tracking-wider">Enrolled Debt</th>
                                                    <th className="px-4 py-2 text-left font-bold text-emerald-800 uppercase tracking-wider">List / Run</th>
                                                    <th className="px-4 py-2 text-left font-bold text-indigo-700 uppercase tracking-wider">Payment</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-emerald-100/60">
                                                  {deals.map((deal, di) => (
                                                    <tr key={di} className="hover:bg-emerald-100/40 transition-colors">
                                                      <td className="px-4 py-1.5 text-slate-400 font-medium">{di + 1}</td>
                                                      <td className="px-4 py-1.5 font-semibold text-slate-800">
                                                        {[deal.first_name, deal.last_name].filter(Boolean).join(' ') || <span className="text-slate-400">—</span>}
                                                      </td>
                                                      <td className="px-4 py-1.5 text-slate-600 font-mono">
                                                        {deal.phone_number ? `${deal.phone_code ? deal.phone_code + ' ' : ''}${deal.phone_number}` : <span className="text-slate-400">—</span>}
                                                      </td>
                                                      <td className="px-4 py-1.5 text-right text-slate-600">
                                                        {deal.debt ? fmtCurrency(parseFloat(deal.debt) || 0) : <span className="text-slate-400">—</span>}
                                                      </td>
                                                      <td className="px-4 py-1.5 text-right font-bold text-violet-700">
                                                        {deal.enrolled_debt ? fmtCurrency(parseFloat(deal.enrolled_debt) || 0) : <span className="text-slate-400">—</span>}
                                                      </td>
                                                      <td className="px-4 py-1.5 text-slate-600">
                                                        <span className="font-medium">{deal.listName}</span>
                                                        <span className="text-slate-400 ml-1">
                                                          Run #{deal.runNumber}{deal.runLabel ? ` · ${deal.runLabel}` : ''}
                                                        </span>
                                                      </td>
                                                      <td className="px-4 py-1.5">
                                                        {deal.paymentStatus === 'First Payment Complete' ? (
                                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">✓ 1st Paid</span>
                                                        ) : deal.paymentStatus === 'NFC' ? (
                                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">NFC</span>
                                                        ) : (
                                                          <span className="text-slate-400 text-[10px]">—</span>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-slate-100 border-t-2 border-slate-200">
                            <tr>
                              <td className="px-4 py-2 text-xs font-extrabold text-slate-700 uppercase tracking-wider">Total</td>
                              <td className="px-4 py-2 text-sm font-extrabold text-emerald-800 text-right">
                                {salesStats.dailyBreakdown.reduce((s, r) => s + r.sales, 0).toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-sm font-extrabold text-violet-800 text-right">
                                {fmtCurrency(salesStats.dailyBreakdown.reduce((s, r) => s + r.enrolledDebt, 0))}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {salesStats.totalSales === 0 && (
                  <p className="text-center text-sm text-slate-400 py-4">
                    No SALE records found{salesStartDate || salesEndDate ? ' for the selected date range' : ''}.
                  </p>
                )}
              </>
            )}
          </div>
          {/* ── End Sales Tracker ──────────────────────────────── */}

          {lists.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
              <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-gray-700 mb-2">No data yet</h3>
              <p className="text-sm text-gray-500">The admin hasn't shared any lists with you yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {lists.map(list => (
                <div key={list.listName}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-purple-200 transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 truncate group-hover:text-purple-700 transition-colors">
                        {list.listName}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Last run: <span className="font-semibold text-gray-700">{fmtDate(list.lastRunDate)}</span>
                      </p>
                    </div>
                    <div className="p-2.5 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg shadow-purple-500/20 ml-3 shrink-0">
                      <List size={18} className="text-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-extrabold text-slate-900">{list.totalRuns}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Runs</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-extrabold text-slate-900">{(list.totalLeads || 0).toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Total Leads</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => goToRuns(list)}
                      className="flex-1 px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-violet-600 rounded-xl hover:from-purple-500 hover:to-violet-500 flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-500/20">
                      <BarChart2 size={13} /> View Runs
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW: RUNS
  // ─────────────────────────────────────────────────────────────
  if (view === 'runs') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-purple-50">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-6 space-y-5">
          <Header />

          {runsLoading ? (
            <LoadingSpinner message="Loading runs…" />
          ) : runs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
              <BarChart2 size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-gray-700">No runs found</h3>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-slate-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-yellow-400 uppercase tracking-wider whitespace-nowrap">Run #</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">Label</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">Total Leads</th>
                      {allDispositionKeys.map(k => (
                        <th key={k} className="px-3 py-3 text-center text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                          <span title={getDispMeta(k).label}>{k}</span>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {runs.map((run, idx) => (
                      <tr key={run.runBatchId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-xs font-extrabold">
                            {run.runNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-medium">
                          {fmtDate(run.runDate)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {run.runLabel || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                          {(run.totalLeads || 0).toLocaleString()}
                        </td>
                        {allDispositionKeys.map(k => {
                          const count = run.dispositions?.[k] || 0;
                          const meta = getDispMeta(k);
                          return (
                            <td key={k} className="px-3 py-3 whitespace-nowrap text-center">
                              {count > 0 ? (
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ring-1 ${meta.color}`}>
                                  {count.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => goToRecords(run)}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors flex items-center gap-1">
                              <Search size={11} /> Records
                            </button>
                            <button onClick={() => downloadRun(run)} disabled={!!downloadingId}
                              className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-1 border border-purple-200 disabled:opacity-60 disabled:cursor-not-allowed">
                              {downloadingId === `run-${run.runBatchId}` ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />}
                              {downloadingId === `run-${run.runBatchId}` ? 'Downloading…' : 'CSV'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Disposition legend */}
              {allDispositionKeys.length > 0 && (
                <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Disposition Legend</p>
                  <div className="flex flex-wrap gap-2">
                    {allDispositionKeys.map(k => {
                      const meta = getDispMeta(k);
                      return (
                        <span key={k} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ring-1 ${meta.color}`}>
                          <span className="font-extrabold">{k}</span>
                          <span className="opacity-60">— {meta.label}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW: RECORDS
  // ─────────────────────────────────────────────────────────────
  const dispKeys = Object.keys(runStats.dispositions || {}).sort((a, b) => {
    if (a === 'SALE') return -1;
    if (b === 'SALE') return 1;
    return a.localeCompare(b);
  });

  const displayedStatuses = showAllStatuses ? dispKeys : dispKeys.slice(0, 8);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-purple-50">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <Header />

        {/* Stats strip */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-purple-500" />
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Run Dispositions — Total {runStats.totalLeads.toLocaleString()} leads
              </p>
            </div>
            {dispKeys.length > 8 && (
              <button onClick={() => setShowAllStatuses(s => !s)}
                className="text-xs font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-1">
                {showAllStatuses ? <><ChevronUp size={13} /> Show Less</> : <><ChevronDown size={13} /> Show All ({dispKeys.length})</>}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {displayedStatuses.map(k => {
              const count = runStats.dispositions[k] || 0;
              const meta = getDispMeta(k);
              const pct = runStats.totalLeads > 0 ? ((count / runStats.totalLeads) * 100).toFixed(1) : 0;
              return (
                <button key={k}
                  onClick={() => setStatusFilter(statusFilter === k ? '' : k)}
                  title={`${meta.label}: ${count.toLocaleString()} (${pct}%)`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold ring-1 transition-all hover:scale-105 ${meta.color} ${statusFilter === k ? 'ring-2 scale-105' : ''}`}>
                  <span>{k}</span>
                  <span className="font-extrabold">{count.toLocaleString()}</span>
                  <span className="opacity-60 font-normal">{pct}%</span>
                </button>
              );
            })}
            {statusFilter && (
              <button onClick={() => setStatusFilter('')}
                className="px-2.5 py-1.5 text-xs font-bold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 ring-1 ring-red-200 transition-all">
                ✕ Clear Filter
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySearch()}
              placeholder="Search by name, phone, email, status…"
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm font-medium transition-all"
            />
          </div>
          <button onClick={applySearch}
            className="px-4 py-2.5 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-500 transition-colors">
            Search
          </button>
          {searchTerm && (
            <button onClick={() => { handleSearch(''); fetchRecords(selectedRun.runBatchId, 1); }}
              className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors">
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {recordsLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw size={24} className="animate-spin text-purple-400" />
            </div>
          ) : records.length === 0 ? (
            <div className="py-16 text-center">
              <Search size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No records found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-900 sticky top-0">
                  <tr>
                    {ALL_COLUMNS.map(col => (
                      <th key={col.key} className="px-3 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((rec, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white hover:bg-purple-50' : 'bg-slate-50 hover:bg-purple-50'}>
                      {ALL_COLUMNS.map(col => (
                        <td key={col.key} className="px-3 py-2 whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis">
                          {col.key === 'status' ? (
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ring-1 ${getDispMeta(rec[col.key]).color}`}>
                              {rec[col.key] || '—'}
                            </span>
                          ) : col.key === 'enrolled_debt' && rec[col.key] ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold ring-1 bg-violet-100 text-violet-800 ring-violet-200">
                              {rec[col.key]}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-700">{rec[col.key] || ''}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 font-medium">
                Page <span className="font-bold text-gray-700">{pagination.page}</span> of <span className="font-bold text-gray-700">{pagination.pages}</span>
                {' '}— {pagination.total.toLocaleString()} total
              </p>
              <div className="flex items-center gap-1">
                <button disabled={pagination.page <= 1}
                  onClick={() => fetchRecords(selectedRun.runBatchId, pagination.page - 1)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 py-1 text-xs font-bold text-gray-700">{pagination.page}</span>
                <button disabled={pagination.page >= pagination.pages}
                  onClick={() => fetchRecords(selectedRun.runBatchId, pagination.page + 1)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataVendorDashboard;
