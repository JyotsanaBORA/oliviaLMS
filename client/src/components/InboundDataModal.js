import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PhoneCall,
  X,
  RefreshCw,
  Search,
  CheckCircle,
  Clock,
  User,
  Building,
  Tag,
  ArrowRight,
  Filter,
  Download,
  Lock,
  Calendar,
  Edit3,
  PlusCircle,
  FileText,
  AlertCircle
} from 'lucide-react';
import axios from '../utils/axios';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  RECEIVED: 'bg-blue-100 text-blue-800 border-blue-200',
  DISPOSITIONED: 'bg-amber-100 text-amber-800 border-amber-200',
  CONVERTED: 'bg-green-100 text-green-800 border-green-200',
  MISSED: 'bg-red-100 text-red-800 border-red-200',
  COMPLETED: 'bg-purple-100 text-purple-800 border-purple-200',
};

const AGENT2_DISPOSITION_OPTIONS = [
  "SALE",
  "Callback Needed",
  "Existing Client",
  "Unacceptable Creditors",
  "Not Serviceable State",
  "Sale Long Play",
  "Request for Loan",
  "DO NOT CALL - Litigator",
  "DO NOT CALL",
  "Hang-up",
  "Not Interested",
  "No Answer",
  "AIP Client",
  "Not Qualified",
  "Affordability",
  "Others"
];

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
};

const InboundDataModal = ({ onClose, title = 'Inbound Call Data' }) => {
  const { user } = useAuth();
  const { socket, onEvent, offEvent } = useSocket();

  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [canWrite, setCanWrite] = useState(false);
  const [isGlobal, setIsGlobal] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [didFilter, setDidFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Stats
  const [stats, setStats] = useState({
    totalCalls: 0,
    todayCalls: 0,
    newCalls: 0,
    convertedCalls: 0,
  });

  // Modals for Detail / Disposition / Convert
  const [selectedCall, setSelectedCall] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDispositionModal, setShowDispositionModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  // Disposition form state
  const [dispositionData, setDispositionData] = useState({
    leadProgressStatus: '',
    notes: '',
    callStatus: 'DISPOSITIONED',
    callerName: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zipcode: '',
    totalDebtAmount: '',
  });

  // Lead Conversion form state
  const [convertFormData, setConvertFormData] = useState({
    name: '',
    phone: '',
    email: '',
    totalDebtAmount: '',
    leadProgressStatus: '',
    notes: '',
    city: '',
    state: '',
    zipcode: '',
  });

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get('/api/inbound/stats');
      if (res.data?.success) {
        setStats(res.data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch inbound stats:', err);
    }
  }, []);

  const fetchCalls = useCallback(async (pageNum = 1) => {
    try {
      setRefreshing(true);
      const params = {
        page: pageNum,
        limit: 50,
        search: search.trim() || undefined,
        did: didFilter.trim() || undefined,
        status: statusFilter || undefined,
        campaign: campaignFilter.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };

      const res = await axios.get('/api/inbound', { params });
      if (res.data?.success) {
        setCalls(res.data.data.calls || []);
        setTotal(res.data.data.total || 0);
        setTotalPages(res.data.data.totalPages || 1);
        setPage(res.data.data.page || 1);
        setCanWrite(Boolean(res.data.data.canWrite));
        setIsGlobal(Boolean(res.data.data.isGlobal));
      }
    } catch (err) {
      console.error('Failed to fetch inbound data:', err);
      toast.error('Failed to load inbound calls');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, didFilter, statusFilter, campaignFilter, dateFrom, dateTo]);

  // Initial load
  useEffect(() => {
    fetchCalls(1);
    fetchStats();
  }, [fetchCalls, fetchStats]);

  // Real-time socket listener for incoming calls
  useEffect(() => {
    const handleNewInbound = (data) => {
      console.log('📡 [InboundDataModal] Real-time inbound call received:', data);
      fetchCalls(1);
      fetchStats();
      toast(`📞 Inbound Call on DID ${data.did || 'N/A'}: ${data.phoneNumber || 'Unknown'}`, {
        icon: '📥',
        duration: 4000,
      });
    };

    if (onEvent) {
      onEvent('newInboundData', handleNewInbound);
    }

    return () => {
      if (offEvent) {
        offEvent('newInboundData', handleNewInbound);
      }
    };
  }, [onEvent, offEvent, fetchCalls, fetchStats]);

  // Open Disposition Modal
  const handleOpenDisposition = (call) => {
    setSelectedCall(call);
    setDispositionData({
      leadProgressStatus: call.leadProgressStatus || '',
      notes: call.notes || '',
      callStatus: call.callStatus || 'DISPOSITIONED',
      callerName: call.callerName || '',
      email: call.email || '',
      address: call.address || '',
      city: call.city || '',
      state: call.state || '',
      zipcode: call.zipcode || '',
      totalDebtAmount: call.totalDebtAmount ? String(call.totalDebtAmount) : '',
    });
    setShowDispositionModal(true);
  };

  // Submit Disposition
  const handleSaveDisposition = async (e) => {
    e.preventDefault();
    if (!selectedCall) return;

    try {
      const res = await axios.put(`/api/inbound/${selectedCall._id}/disposition`, dispositionData);
      if (res.data?.success) {
        toast.success('Disposition updated successfully');
        setShowDispositionModal(false);
        fetchCalls(page);
        fetchStats();
      }
    } catch (err) {
      console.error('Error saving disposition:', err);
      toast.error(err.response?.data?.message || 'Failed to update disposition');
    }
  };

  // Open Lead Conversion Modal
  const handleOpenConvert = (call) => {
    setSelectedCall(call);
    setConvertFormData({
      name: call.callerName || [call.firstName, call.lastName].filter(Boolean).join(' ') || '',
      phone: call.phoneNumber || '',
      email: call.email || '',
      totalDebtAmount: call.totalDebtAmount ? String(call.totalDebtAmount) : '',
      leadProgressStatus: call.leadProgressStatus || 'SALE',
      notes: call.notes || '',
      city: call.city || '',
      state: call.state || '',
      zipcode: call.zipcode || '',
    });
    setShowConvertModal(true);
  };

  // Submit Lead Conversion
  const handleSaveConvert = async (e) => {
    e.preventDefault();
    if (!selectedCall) return;

    try {
      const res = await axios.post(`/api/inbound/${selectedCall._id}/convert-to-lead`, convertFormData);
      if (res.data?.success) {
        toast.success('Lead successfully created and saved in LMS!');
        setShowConvertModal(false);
        fetchCalls(page);
        fetchStats();
      }
    } catch (err) {
      console.error('Error converting lead:', err);
      toast.error(err.response?.data?.message || 'Failed to convert lead');
    }
  };

  // Quick Date Preset Helper
  const applyDatePreset = (preset) => {
    const now = new Date();
    const formatYMD = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'today') {
      const str = formatYMD(now);
      setDateFrom(str);
      setDateTo(str);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const str = formatYMD(y);
      setDateFrom(str);
      setDateTo(str);
    } else if (preset === '7days') {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      setDateFrom(formatYMD(past));
      setDateTo(formatYMD(now));
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(formatYMD(firstDay));
      setDateTo(formatYMD(now));
    }
  };

  // Export CSV (Unlocked once dateFrom and dateTo are selected)
  const isDateRangeSelected = Boolean(dateFrom && dateTo);

  const handleExportCSV = async () => {
    if (!dateFrom || !dateTo) {
      toast.error("Please select both 'From' and 'To' dates to unlock CSV export.");
      return;
    }

    try {
      setExporting(true);
      const params = {
        dateFrom,
        dateTo,
        search: search.trim() || undefined,
        did: didFilter.trim() || undefined,
        status: statusFilter || undefined,
        campaign: campaignFilter.trim() || undefined,
      };

      const response = await axios.get('/api/inbound/export', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inbound_calls_${dateFrom}_to_${dateTo}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`Inbound calls CSV exported (${dateFrom} to ${dateTo})!`);
    } catch (err) {
      console.error('Failed to export inbound calls:', err);
      toast.error(err.response?.data?.message || 'Failed to export inbound calls CSV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-7xl rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-300">
              <PhoneCall className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
                {!canWrite && !isGlobal && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-800/60 text-indigo-200 border border-indigo-600/40">
                    <Lock className="h-3 w-3" /> Read-Only Org Access
                  </span>
                )}
              </div>
              <p className="text-xs text-indigo-200/80">
                Real-time DID tracking, campaign identification & disposition management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchCalls(page); fetchStats(); }}
              disabled={refreshing}
              className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Refresh Inbound Data"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            
            {/* Header CSV Button (Locked if no dates, Unlocked if dates selected) */}
            {isDateRangeSelected ? (
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95 animate-in fade-in"
                title={`Download CSV for ${dateFrom} to ${dateTo}`}
              >
                <Download className={`h-4 w-4 ${exporting ? 'animate-bounce' : ''}`} />
                <span>{exporting ? 'Exporting...' : 'Download CSV'}</span>
              </button>
            ) : (
              <button
                onClick={() => toast.error("Please select both 'From' and 'To' dates below to unlock CSV download.")}
                className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-indigo-200/70 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Select 'From' and 'To' dates below to unlock CSV download"
              >
                <Lock className="h-3.5 w-3.5 text-indigo-300/70" />
                <span className="hidden sm:inline opacity-80">CSV Locked</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-2"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Stats Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 bg-indigo-50/50 border-b border-indigo-100">
          <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Total Inbound</p>
              <p className="text-xl font-bold text-gray-900">{stats.totalCalls}</p>
            </div>
            <PhoneCall className="h-7 w-7 text-indigo-500 opacity-60" />
          </div>
          <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Today's Calls</p>
              <p className="text-xl font-bold text-blue-600">{stats.todayCalls}</p>
            </div>
            <Clock className="h-7 w-7 text-blue-500 opacity-60" />
          </div>
          <div className="bg-white p-3 rounded-xl border border-amber-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Pending Review</p>
              <p className="text-xl font-bold text-amber-600">{stats.newCalls}</p>
            </div>
            <AlertCircle className="h-7 w-7 text-amber-500 opacity-60" />
          </div>
          <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Converted to Leads</p>
              <p className="text-xl font-bold text-emerald-600">{stats.convertedCalls}</p>
            </div>
            <CheckCircle className="h-7 w-7 text-emerald-500 opacity-60" />
          </div>
        </div>

        {/* Filters & Export Bar */}
        <div className="px-6 py-3 bg-white border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search phone, DID, campaign, caller name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="w-36">
            <input
              type="text"
              placeholder="Filter DID..."
              value={didFilter}
              onChange={(e) => setDidFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="w-36">
            <input
              type="text"
              placeholder="Filter Campaign..."
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="w-32">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="RECEIVED">Received</option>
              <option value="DISPOSITIONED">Dispositioned</option>
              <option value="CONVERTED">Converted</option>
              <option value="MISSED">Missed</option>
            </select>
          </div>

          {/* Date Range & Unlock CSV Section */}
          <div className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-xl shadow-inner">
            <div className="flex items-center gap-1 text-xs text-gray-600 font-medium px-1">
              <Calendar className="h-3.5 w-3.5 text-indigo-600" />
              <span>Date:</span>
            </div>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded-md text-xs bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              title="From Date (Required for CSV download)"
            />
            <span className="text-xs text-gray-400 font-bold">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded-md text-xs bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              title="To Date (Required for CSV download)"
            />

            {/* Quick Presets */}
            <div className="hidden lg:flex items-center gap-1 border-l border-slate-200 pl-1.5">
              <button
                type="button"
                onClick={() => applyDatePreset('today')}
                className="px-1.5 py-0.5 text-[10px] font-semibold bg-white hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 border border-gray-200 rounded transition-colors"
                title="Select Today"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('yesterday')}
                className="px-1.5 py-0.5 text-[10px] font-semibold bg-white hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 border border-gray-200 rounded transition-colors"
                title="Select Yesterday"
              >
                Yday
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('7days')}
                className="px-1.5 py-0.5 text-[10px] font-semibold bg-white hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 border border-gray-200 rounded transition-colors"
                title="Select Last 7 Days"
              >
                7D
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('month')}
                className="px-1.5 py-0.5 text-[10px] font-semibold bg-white hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 border border-gray-200 rounded transition-colors"
                title="Select This Month"
              >
                Month
              </button>
            </div>

            {/* Download CSV Locked vs Unlocked Button */}
            {isDateRangeSelected ? (
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all duration-150 active:scale-95 animate-in fade-in"
                title={`Download CSV (${dateFrom} to ${dateTo})`}
              >
                <Download className={`h-3.5 w-3.5 ${exporting ? 'animate-bounce' : ''}`} />
                <span>{exporting ? 'Exporting…' : 'Download CSV'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toast.error("Please select both 'From' and 'To' dates to unlock CSV download.")}
                className="flex items-center gap-1 px-2.5 py-1 bg-gray-200/70 hover:bg-gray-200 text-gray-400 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                title="Select 'From' and 'To' dates to unlock CSV export"
              >
                <Lock className="h-3 w-3 text-gray-400" />
                <span className="text-[11px]">CSV Locked</span>
              </button>
            )}
          </div>

          {(search || didFilter || campaignFilter || statusFilter || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setSearch('');
                setDidFilter('');
                setCampaignFilter('');
                setStatusFilter('');
                setDateFrom('');
                setDateTo('');
              }}
              className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
            >
              Reset
            </button>
          )}
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto bg-gray-50 p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
              <p className="text-sm font-medium">Loading inbound call data...</p>
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200 text-center">
              <div className="p-3 bg-indigo-50 rounded-full text-indigo-500 mb-3">
                <PhoneCall className="h-8 w-8" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">No Inbound Calls Found</h3>
              <p className="text-sm text-gray-500 max-w-md mt-1">
                No incoming calls matching your active filters or assigned DIDs have been recorded yet.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Received Time</th>
                    <th className="py-3 px-4">Caller Phone</th>
                    <th className="py-3 px-4">Inbound DID</th>
                    <th className="py-3 px-4">Campaign Name</th>
                    <th className="py-3 px-4">Organization</th>
                    <th className="py-3 px-4">Call Status</th>
                    <th className="py-3 px-4">Disposition / Action</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {calls.map((call) => (
                    <tr key={call._id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-xs text-gray-600 font-medium">
                        {fmtDate(call.receivedAt)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-semibold text-gray-900">
                        <div className="flex items-center gap-1.5">
                          <PhoneCall className="h-3.5 w-3.5 text-indigo-600" />
                          <span>{call.phoneNumber || '—'}</span>
                        </div>
                        {call.callerName && (
                          <div className="text-xs text-gray-500 font-normal">{call.callerName}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          {call.did || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-gray-700 font-medium text-xs">
                        {call.campaignName || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700">
                          <Building className="h-3 w-3 text-gray-400" />
                          {call.organization?.name || 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[call.callStatus] || 'bg-gray-100 text-gray-800'}`}>
                          {call.callStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-[200px]">
                        {call.leadProgressStatus ? (
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200 truncate">
                            {call.leadProgressStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No disposition</span>
                        )}
                        {call.agentLastAction && (
                          <div className="text-[11px] text-gray-500 truncate" title={call.agentLastAction}>
                            by {call.agentLastAction}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedCall(call);
                              setShowDetailModal(true);
                            }}
                            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <FileText className="h-4 w-4" />
                          </button>

                          {(canWrite || isGlobal || user?.role === 'agent2') && (
                            <>
                              <button
                                onClick={() => handleOpenDisposition(call)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors"
                                title="Update Call Disposition"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                <span>Disposition</span>
                              </button>

                              {!call.importedLeadId && (
                                <button
                                  onClick={() => handleOpenConvert(call)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                                  title="Convert to LMS Lead"
                                >
                                  <PlusCircle className="h-3.5 w-3.5" />
                                  <span>Save Lead</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Pagination */}
        <div className="px-6 py-3 bg-white border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing <strong className="text-gray-900">{calls.length}</strong> of <strong className="text-gray-900">{total}</strong> calls
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchCalls(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <span className="font-semibold text-gray-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => fetchCalls(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>

      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Inbound Call Details</h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="py-4 space-y-2 text-sm text-gray-700">
              <div className="grid grid-cols-2 gap-2">
                <div><strong>Phone Number:</strong> {selectedCall.phoneNumber || '—'}</div>
                <div><strong>DID:</strong> {selectedCall.did || '—'}</div>
                <div><strong>Campaign:</strong> {selectedCall.campaignName || '—'}</div>
                <div><strong>Organization:</strong> {selectedCall.organization?.name || 'Unassigned'}</div>
                <div><strong>Received Time:</strong> {fmtDate(selectedCall.receivedAt)}</div>
                <div><strong>Call Status:</strong> {selectedCall.callStatus}</div>
                <div><strong>Caller Name:</strong> {selectedCall.callerName || '—'}</div>
                <div><strong>Disposition:</strong> {selectedCall.leadProgressStatus || '—'}</div>
              </div>
              {selectedCall.notes && (
                <div className="pt-2">
                  <strong>Notes:</strong>
                  <p className="mt-1 p-2 bg-gray-50 rounded-lg text-xs font-mono">{selectedCall.notes}</p>
                </div>
              )}
              {selectedCall.rawPayload && (
                <div className="pt-2">
                  <strong>Raw Telephony Payload:</strong>
                  <pre className="mt-1 p-2 bg-slate-900 text-slate-100 rounded-lg text-[11px] max-h-40 overflow-auto font-mono">
                    {JSON.stringify(selectedCall.rawPayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-3 border-t border-gray-200">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 font-semibold text-gray-800 text-xs rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disposition Modal */}
      {showDispositionModal && selectedCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Update Disposition</h3>
              <button
                onClick={() => setShowDispositionModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveDisposition} className="py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase">Lead Progress Status</label>
                <select
                  value={dispositionData.leadProgressStatus}
                  onChange={(e) => setDispositionData(prev => ({ ...prev, leadProgressStatus: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Select Status...</option>
                  {AGENT2_DISPOSITION_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase">Caller Full Name</label>
                <input
                  type="text"
                  value={dispositionData.callerName}
                  onChange={(e) => setDispositionData(prev => ({ ...prev, callerName: e.target.value }))}
                  placeholder="John Doe"
                  className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase">Follow-up Notes</label>
                <textarea
                  rows={3}
                  value={dispositionData.notes}
                  onChange={(e) => setDispositionData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Enter qualification notes, details or follow-up reason..."
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowDispositionModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  Save Disposition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert to LMS Lead Modal */}
      {showConvertModal && selectedCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-gray-900">Save Inbound Call as LMS Lead</h3>
              </div>
              <button
                onClick={() => setShowConvertModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveConvert} className="py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={convertFormData.name}
                    onChange={(e) => setConvertFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={convertFormData.phone}
                    onChange={(e) => setConvertFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase">Email Address</label>
                  <input
                    type="email"
                    value={convertFormData.email}
                    onChange={(e) => setConvertFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase">Total Debt ($)</label>
                  <input
                    type="number"
                    value={convertFormData.totalDebtAmount}
                    onChange={(e) => setConvertFormData(prev => ({ ...prev, totalDebtAmount: e.target.value }))}
                    placeholder="25000"
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase">Lead Progress Status</label>
                <select
                  value={convertFormData.leadProgressStatus}
                  onChange={(e) => setConvertFormData(prev => ({ ...prev, leadProgressStatus: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                >
                  <option value="">Select Status...</option>
                  {AGENT2_DISPOSITION_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase">Intake Notes</label>
                <textarea
                  rows={2}
                  value={convertFormData.notes}
                  onChange={(e) => setConvertFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800">
                This will create a new Lead in the system assigned to your account with Inbound DID <strong>{selectedCall.did || 'N/A'}</strong> and Campaign <strong>{selectedCall.campaignName || 'N/A'}</strong>.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowConvertModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  Create & Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default InboundDataModal;
