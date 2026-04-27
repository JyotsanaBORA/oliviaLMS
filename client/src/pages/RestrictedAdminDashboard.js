import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Download,
  Calendar,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Filter,
  Users,
  DollarSign,
  TrendingUp,
  XCircle,
  PhoneOff,
  AlertTriangle,
  Globe
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

// ── All 45 CSV columns in display order ─────────────────────────
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
  { key: 'custom6',                label: 'Custom 6' }
];

const DATE_PRESETS = [
  { key: 'all',    label: 'All' },
  { key: 'today',  label: 'Today' },
  { key: '7days',  label: '7 Days' },
  { key: '30days', label: '30 Days' }
];

function isValidDDMMYYYY(v) {
  return /^\d{2}-\d{2}-\d{4}$/.test(v);
}

const RestrictedAdminDashboard = () => {
  const { user } = useAuth();

  // Data
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pagination
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, pages: 0 });

  // Date filter
  const [activePreset, setActivePreset] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const customStartRef = useRef('');
  const customEndRef = useRef('');

  // Stats
  const [stats, setStats] = useState({ totalLeads: 0, enrolledDebt: 0, salesClosed: 0, notQualified: 0, dnc: 0, wnu: 0, lb: 0 });

  // Status filter (server-side)
  const [statusFilter, setStatusFilter] = useState('');

  // Search (client-side across all visible records)
  const [searchTerm, setSearchTerm] = useState('');

  // For superadmin: optional restricted-admin filter
  const [restrictedAdmins, setRestrictedAdmins] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState('');

  // ── Fetch restricted admin list (superadmin only) ──────────────
  useEffect(() => {
    if (user?.role === 'superadmin') {
      axios.get('/api/admin-uploads/restricted-admins')
        .then(res => {
          if (res.data?.success) setRestrictedAdmins(res.data.data);
        })
        .catch(() => {});
    }
  }, [user]);

  // ── Fetch stats ────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const params = { dateFilter: activePreset };
      if (activePreset === 'custom' && isValidDDMMYYYY(customStartRef.current) && isValidDDMMYYYY(customEndRef.current)) {
        params.startDate = customStartRef.current;
        params.endDate = customEndRef.current;
      }
      if (user?.role === 'superadmin' && selectedAdmin) {
        params.sharedWith = selectedAdmin;
      }
      const res = await axios.get('/api/admin-uploads/stats', { params });
      if (res.data?.success) setStats(res.data.data);
    } catch (err) {
      console.error('Stats fetch error:', err);
    }
  }, [activePreset, user, selectedAdmin]);

  // ── Fetch data ─────────────────────────────────────────────────
  const fetchData = useCallback(async (page = 1) => {
    try {
      setRefreshing(true);
      const params = {
        page,
        limit: pagination.limit,
        dateFilter: activePreset
      };

      if (activePreset === 'custom' && isValidDDMMYYYY(customStartRef.current) && isValidDDMMYYYY(customEndRef.current)) {
        params.startDate = customStartRef.current;
        params.endDate = customEndRef.current;
      }

      // SuperAdmin can filter by restricted admin
      if (user?.role === 'superadmin' && selectedAdmin) {
        params.sharedWith = selectedAdmin;
      }

      if (statusFilter) params.statusFilter = statusFilter;

      const res = await axios.get('/api/admin-uploads', { params });
      if (res.data?.success) {
        setRecords(res.data.data);
        setPagination(prev => ({ ...prev, ...res.data.pagination }));
      }
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activePreset, pagination.limit, user, selectedAdmin, statusFilter]);

  // Initial load + filter change
  useEffect(() => {
    fetchData(1);
    fetchStats();
  }, [fetchData, fetchStats]);

  // ── Export / Download ──────────────────────────────────────────
  const handleExport = async () => {
    try {
      const params = { dateFilter: activePreset };
      if (activePreset === 'custom' && isValidDDMMYYYY(customStart) && isValidDDMMYYYY(customEnd)) {
        params.startDate = customStart;
        params.endDate = customEnd;
      }
      if (user?.role === 'superadmin' && selectedAdmin) {
        params.sharedWith = selectedAdmin;
      }
      if (statusFilter) params.statusFilter = statusFilter;

      const res = await axios.get('/api/admin-uploads/export', {
        params,
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin_uploads_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  // ── Delete single record (superadmin) ──────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      await axios.delete(`/api/admin-uploads/${id}`);
      toast.success('Record deleted');
      fetchData(pagination.page);
    } catch {
      toast.error('Delete failed');
    }
  };

  // ── Client-side search ─────────────────────────────────────────
  const displayRecords = searchTerm
    ? records.filter(r =>
        ALL_COLUMNS.some(c =>
          String(r[c.key] || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : records;

  // ── Date preset click ──────────────────────────────────────────
  const handlePreset = (key) => {
    setActivePreset(key);
    if (key !== 'custom') {
      setCustomStart('');
      setCustomEnd('');
      customStartRef.current = '';
      customEndRef.current = '';
    }
  };

  // ── Update refs when custom dates change ───────────────────────
  // Convert YYYY-MM-DD (native input) → DD-MM-YYYY (API format)
  const handleCustomStartChange = (isoVal) => {
    if (!isoVal) { setCustomStart(''); customStartRef.current = ''; return; }
    const [y, m, d] = isoVal.split('-');
    const formatted = `${d}-${m}-${y}`;
    setCustomStart(formatted);
    customStartRef.current = formatted;
  };
  const handleCustomEndChange = (isoVal) => {
    if (!isoVal) { setCustomEnd(''); customEndRef.current = ''; return; }
    const [y, m, d] = isoVal.split('-');
    const formatted = `${d}-${m}-${y}`;
    setCustomEnd(formatted);
    customEndRef.current = formatted;
  };

  // Convert DD-MM-YYYY → YYYY-MM-DD for the native date input value
  const toISODate = (ddmmyyyy) => {
    if (!ddmmyyyy || !isValidDDMMYYYY(ddmmyyyy)) return '';
    const [d, m, y] = ddmmyyyy.split('-');
    return `${y}-${m}-${d}`;
  };

  // ── Apply custom date ──────────────────────────────────────────
  const handleApplyCustom = () => {
    if (!isValidDDMMYYYY(customStart) || !isValidDDMMYYYY(customEnd)) {
      toast.error('Please enter dates in dd-mm-yyyy format');
      return;
    }
    if (activePreset === 'custom') {
      // Already on custom — force re-fetch with new dates
      fetchData(1);
    } else {
      setActivePreset('custom');
    }
  };

  // Status badge color helper
  const getStatusStyle = (status) => {
    if (!status) return '';
    const s = status.toUpperCase();
    if (s === 'SALE') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300';
    if (s === 'NQ' || s === 'NOT QUALIFIED' || s === 'NOTQUALIFIED') return 'bg-red-100 text-red-700 ring-1 ring-red-300';
    if (s === 'NEW') return 'bg-blue-100 text-blue-700 ring-1 ring-blue-300';
    if (s === 'NI') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-300';
    if (s === 'NP') return 'bg-orange-100 text-orange-700 ring-1 ring-orange-300';
    if (s === 'PDROP') return 'bg-purple-100 text-purple-700 ring-1 ring-purple-300';
    if (s === 'NIBP') return 'bg-pink-100 text-pink-700 ring-1 ring-pink-300';
    if (s === 'WNU' || s === 'VDAD') return 'bg-gray-100 text-gray-600 ring-1 ring-gray-300';
    return 'bg-gray-100 text-gray-600 ring-1 ring-gray-300';
  };

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Branded Header ──────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-xl p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src="/rglogo2.png"
                alt="RG Consultancy"
                className="h-12 w-auto object-contain"
                loading="eager"
              />
              <div className="border-l border-slate-600 pl-4">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {user?.role === 'superadmin' ? 'Admin Uploads Overview' : 'Restricted Admin Dashboard'}
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  <span className="text-yellow-400 font-semibold">{pagination.total.toLocaleString()}</span> total records
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { fetchData(pagination.page); fetchStats(); }}
                disabled={refreshing}
                className="px-4 py-2.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-xl flex items-center gap-2 transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={handleExport}
                className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-yellow-400 to-yellow-500 text-slate-900 rounded-xl hover:from-yellow-300 hover:to-yellow-400 shadow-lg shadow-yellow-400/20 flex items-center gap-2 transition-all duration-200"
              >
                <Download size={15} />
                Download CSV
              </button>
            </div>
          </div>
        </div>

        {/* ── Stat Cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {/* Total Leads */}
          <div className="relative overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-full" />
            <div className="relative flex items-start gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/25">
                <Users size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Leads</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{stats.totalLeads.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Enrolled Debt */}
          <div className="relative overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-green-50 to-transparent rounded-bl-full" />
            <div className="relative flex items-start gap-3">
              <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg shadow-green-500/25">
                <DollarSign size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Enrolled Debt</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">${stats.enrolledDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">SALE leads only</p>
              </div>
            </div>
          </div>

          {/* Sales Closed */}
          <div className="relative overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-50 to-transparent rounded-bl-full" />
            <div className="relative flex items-start gap-3">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg shadow-emerald-500/25">
                <TrendingUp size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sales Closed</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{stats.salesClosed.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Not Qualified */}
          <div className="relative overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-red-50 to-transparent rounded-bl-full" />
            <div className="relative flex items-start gap-3">
              <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg shadow-red-500/25">
                <XCircle size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Not Qualified</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{stats.notQualified.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* DNC - Do Not Contact */}
          <div className="relative overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-orange-50 to-transparent rounded-bl-full" />
            <div className="relative flex items-start gap-3">
              <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg shadow-orange-500/25">
                <PhoneOff size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">DNC</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{stats.dnc.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Do Not Contact</p>
              </div>
            </div>
          </div>

          {/* WNU - Wrong Number */}
          <div className="relative overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-50 to-transparent rounded-bl-full" />
            <div className="relative flex items-start gap-3">
              <div className="p-3 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl shadow-lg shadow-amber-500/25">
                <AlertTriangle size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">WNU</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{stats.wnu.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Wrong Number</p>
              </div>
            </div>
          </div>

          {/* LB - Language Barrier */}
          <div className="relative overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-50 to-transparent rounded-bl-full" />
            <div className="relative flex items-start gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg shadow-purple-500/25">
                <Globe size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">LB</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{stats.lb.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Language Barrier</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filters Bar ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-3">
          {/* Row 1: Date + Status filters */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* Date section */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mr-1">
                <Calendar size={16} className="text-slate-500" />
                <span>Date</span>
              </div>
              <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
                {DATE_PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => handlePreset(p.key)}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                      activePreset === p.key
                        ? 'bg-slate-900 text-yellow-400 shadow-md'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-7 bg-gray-200" />

            {/* Custom date range */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="relative px-1.5 py-1">
                  <input
                    type="date"
                    value={toISODate(customStart)}
                    onChange={e => {
                      handleCustomStartChange(e.target.value);
                      if (activePreset !== 'custom') setActivePreset('custom');
                    }}
                    className="w-[130px] px-2 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-transparent cursor-pointer transition-all"
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-300 px-0.5">→</span>
                <div className="relative px-1.5 py-1">
                  <input
                    type="date"
                    value={toISODate(customEnd)}
                    onChange={e => {
                      handleCustomEndChange(e.target.value);
                      if (activePreset !== 'custom') setActivePreset('custom');
                    }}
                    min={toISODate(customStart)}
                    className="w-[130px] px-2 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-transparent cursor-pointer transition-all"
                  />
                </div>
              </div>
              <button
                onClick={handleApplyCustom}
                className="px-4 py-2 text-xs font-bold bg-slate-900 text-yellow-400 rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
              >
                Apply
              </button>
              {activePreset === 'custom' && customStart && customEnd && (
                <button
                  onClick={() => handlePreset('all')}
                  className="px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  ✕ Clear
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-7 bg-gray-200" />

            {/* Status filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mr-1">
                <Filter size={15} className="text-slate-500" />
                <span>Status</span>
              </div>
              <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
                {[
                  { key: '',     label: 'All',     color: 'text-slate-500' },
                  { key: 'SALE', label: 'Sale',     color: 'text-emerald-600' },
                  { key: 'NQ',   label: 'NQ',       color: 'text-red-600' },
                  { key: 'NEW',  label: 'New',      color: 'text-blue-600' },
                  { key: 'NI',   label: 'NI',       color: 'text-amber-600' },
                  { key: 'PDROP',label: 'PDrop',    color: 'text-purple-600' },
                ].map(s => (
                  <button
                    key={s.key}
                    onClick={() => setStatusFilter(s.key)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                      statusFilter === s.key
                        ? s.key === 'SALE'
                          ? 'bg-emerald-600 text-white shadow-md'
                          : s.key === 'NQ'
                            ? 'bg-red-600 text-white shadow-md'
                            : 'bg-slate-900 text-yellow-400 shadow-md'
                        : `${s.color} hover:bg-white`
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {statusFilter && (
                <button
                  onClick={() => setStatusFilter('')}
                  className="px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Clear status filter"
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* Row 2: SuperAdmin restricted admin filter */}
          {user?.role === 'superadmin' && restrictedAdmins.length > 0 && (
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              <Filter size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">Restricted Admin:</span>
              <select
                value={selectedAdmin}
                onChange={e => setSelectedAdmin(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-transparent bg-white"
              >
                <option value="">All Restricted Admins</option>
                {restrictedAdmins.map(a => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({a.email})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Search ──────────────────────────────────────────────── */}
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search across all fields..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 text-sm font-medium border-2 border-gray-200 rounded-2xl focus:ring-2 focus:ring-slate-300 focus:border-transparent transition-all bg-white shadow-sm placeholder-slate-400"
          />
        </div>

        {/* ── Data Table ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-slate-800 to-slate-900">
                  <th className="px-3 py-3.5 text-left text-[11px] font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                    #
                  </th>
                  {ALL_COLUMNS.map(col => (
                    <th
                      key={col.key}
                      className="px-3 py-3.5 text-left text-[11px] font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                  {user?.role === 'superadmin' && (
                    <th className="px-3 py-3.5 text-center text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan={ALL_COLUMNS.length + (user?.role === 'superadmin' ? 2 : 1)}
                      className="px-6 py-16 text-center"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Search size={32} className="text-slate-300" />
                        <p className="text-sm font-semibold text-slate-500">No records found</p>
                        <p className="text-xs text-slate-400">Try adjusting your filters or search term</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayRecords.map((record, idx) => (
                    <tr
                      key={record._id}
                      className={`transition-colors hover:bg-blue-50/60 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-400 whitespace-nowrap">
                        {(pagination.page - 1) * pagination.limit + idx + 1}
                      </td>
                      {ALL_COLUMNS.map(col => (
                        <td
                          key={col.key}
                          className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap max-w-[200px] truncate"
                          title={record[col.key] || ''}
                        >
                          {col.key === 'status' && record[col.key] ? (
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full ${getStatusStyle(record[col.key])}`}>
                              {record[col.key]}
                            </span>
                          ) : col.key === 'debt' && record[col.key] ? (
                            <span className="font-semibold text-slate-800">${Number(record[col.key] || 0).toLocaleString()}</span>
                          ) : (
                            record[col.key] || '—'
                          )}
                        </td>
                      ))}
                      {user?.role === 'superadmin' && (
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => handleDelete(record._id)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete record"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ──────────────────────────────────────────── */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-slate-50/80">
              <div className="text-xs font-medium text-slate-500">
                Page <span className="font-extrabold text-slate-800">{pagination.page}</span> of{' '}
                <span className="font-extrabold text-slate-800">{pagination.pages}</span>{' '}
                <span className="text-slate-400">({pagination.total.toLocaleString()} records)</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => fetchData(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-all shadow-sm"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button
                  onClick={() => fetchData(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages}
                  className="px-3 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-all shadow-sm"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 py-3 opacity-60">
          <img src="/rglogo2.png" alt="" className="h-5 w-auto" loading="lazy" />
          <span className="text-xs font-medium text-slate-400">RG CONSULTANCY</span>
        </div>

      </div>
    </div>
  );
};

export default RestrictedAdminDashboard;
