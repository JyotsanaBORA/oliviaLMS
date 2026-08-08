import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Search, RefreshCw, ChevronLeft, ChevronRight,
  Calendar, User, CheckCircle2, XCircle, Clock, TrendingUp, DollarSign
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['', 'Cleared', 'Pending', 'NSF', 'Cancellation', 'Refunded'];

const STATUS_BADGE = {
  'Cleared':      'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'Pending':      'bg-yellow-100 text-yellow-700 border border-yellow-200',
  'NSF':          'bg-rose-100 text-rose-700 border border-rose-200',
  'Cancellation': 'bg-orange-100 text-orange-700 border border-orange-200',
  'Refunded':     'bg-purple-100 text-purple-700 border border-purple-200',
  '':             'bg-gray-100 text-gray-500 border border-gray-200',
};

const STATUS_ICON = {
  'Cleared':      <CheckCircle2 size={12} />,
  'Pending':      <Clock size={12} />,
  'NSF':          <XCircle size={12} />,
  'Cancellation': <XCircle size={12} />,
  'Refunded':     <RefreshCw size={12} />,
  '':             <Clock size={12} />,
};

const STATUS_LABEL = {
  '':             'Not Set',
  'Cleared':      'Cleared',
  'Pending':      'Pending',
  'NSF':          'NSF',
  'Cancellation': 'Cancellation',
  'Refunded':     'Refunded',
};

export default function PaymentStatus() {
  const [vendors, setVendors] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

  const [loading, setLoading] = useState(false);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [totalEnrolledDebt, setTotalEnrolledDebt] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  // ── Fetch vendors list ─────────────────────────────────────────
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        setVendorLoading(true);
        const res = await axios.get('/api/data-vendor-uploads/vendors');
        setVendors(res.data.data || []);
      } catch {
        toast.error('Failed to load vendors');
      } finally {
        setVendorLoading(false);
      }
    };
    fetchVendors();
  }, []);

  // ── Fetch SALE records ─────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (selectedVendorId)       params.vendorId           = selectedVendorId;
      if (search)                   params.search             = search;
      if (startDate)                params.startDate          = startDate;
      if (endDate)                  params.endDate            = endDate;
      if (paymentStatusFilter !== '') params.paymentStatusFilter = paymentStatusFilter;

      const res = await axios.get('/api/data-vendor-uploads/payment-status/sales', { params });
      setRecords(res.data.data || []);
      setTotal(res.data.total || 0);
      setTotalEnrolledDebt(res.data.totalEnrolledDebt || 0);
      setTotalRevenue(res.data.totalRevenue || 0);
    } catch {
      toast.error('Failed to load SALE records');
    } finally {
      setLoading(false);
    }
  }, [selectedVendorId, search, startDate, endDate, paymentStatusFilter, page]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ── Update any payment status field ───────────────────────────
  const handleFieldChange = async (record, field, value) => {
    setUpdatingId(record._id);
    try {
      const res = await axios.patch(
        `/api/data-vendor-uploads/${record._id}/payment-status`,
        { [field]: value }
      );
      setRecords((prev) =>
        prev.map((r) =>
          r._id === record._id
            ? { ...r, ...res.data.data }
            : r
        )
      );
      toast.success('Updated');
    } catch {
      toast.error('Failed to update');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStartDate('');
    setEndDate('');
    setSelectedVendorId('');
    setPaymentStatusFilter('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / LIMIT);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
            <CreditCard size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Payment Status</h1>
            <p className="text-slate-400 text-sm">Update NFC / First Payment Complete for SALE leads</p>
          </div>
        </div>
      </div>

      {/* Filters card */}
      <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-5 mb-5 shadow-xl">
        <div className="flex flex-wrap gap-3 items-end">

          {/* Vendor selector */}
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <User size={11} /> Data Vendor
            </label>
            {vendorLoading ? (
              <div className="h-9 bg-slate-700/50 rounded-lg animate-pulse" />
            ) : (
              <select
                value={selectedVendorId}
                onChange={(e) => { setSelectedVendorId(e.target.value); setPage(1); }}
                className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Vendors</option>
                {vendors.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name}{v.organization?.name ? ` (${v.organization.name})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar size={11} /> From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Payment Status Filter */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <CreditCard size={11} /> Payment Status
            </label>
            <select
              value={paymentStatusFilter}
              onChange={(e) => { setPaymentStatusFilter(e.target.value); setPage(1); }}
              className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="not_set">Not Set</option>
              <option value="Cleared">Cleared</option>
              <option value="Pending">Pending</option>
              <option value="NSF">NSF</option>
              <option value="Cancellation">Cancellation</option>
              <option value="Refunded">Refunded</option>
            </select>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Search size={11} /> Search
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name, phone, email, list, status…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Go
              </button>
            </div>
          </form>

          {/* Clear */}
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors self-end"
          >
            Clear
          </button>

          {/* Refresh */}
          <button
            onClick={() => { setPage(1); fetchRecords(); }}
            disabled={loading}
            className="px-3 py-2 text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors self-end disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Revenue summary card */}
      {!loading && totalRevenue > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-xl p-4 flex items-center gap-4 shadow">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow">
              <TrendingUp size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Enrolled Debt</p>
              <p className="text-xl font-bold text-white">${totalEnrolledDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-slate-500">{total} SALE records</p>
            </div>
          </div>
          <div className="bg-slate-800/60 backdrop-blur border border-emerald-700/40 rounded-xl p-4 flex items-center gap-4 shadow">
            <div className="p-2.5 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg shadow">
              <CreditCard size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Revenue</p>
              <p className="text-xl font-bold text-emerald-400">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-slate-500">Across all matching records</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-400 text-sm">
          {loading ? 'Loading…' : (
            <>Showing <span className="text-white font-semibold">{records.length}</span> of <span className="text-white font-semibold">{total}</span> SALE records</>
          )}
        </p>
        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-slate-400 text-sm">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <RefreshCw size={28} className="animate-spin text-indigo-400" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <CreditCard size={40} className="text-slate-600" />
            <p className="text-slate-500 text-sm">No SALE records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Enrolled Debt</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Revenue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">List / Run</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Enrollment Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Draft Date 1</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Draft Date 2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {records.map((rec) => (
                  <tr key={rec._id} className="hover:bg-slate-700/30 transition-colors">
                    {/* Lead name */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">
                        {[rec.first_name, rec.last_name].filter(Boolean).join(' ') || '—'}
                      </div>
                      {rec.email && <div className="text-xs text-slate-500 truncate max-w-[160px]">{rec.email}</div>}
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {rec.phone_code && rec.phone_code !== '1' ? `+${rec.phone_code} ` : ''}{rec.phone_number || '—'}
                    </td>

                    {/* Enrolled debt only */}
                    <td className="px-4 py-3">
                      {rec.enrolled_debt
                        ? <span className="text-emerald-400 font-semibold">${Number(rec.enrolled_debt).toLocaleString()}</span>
                        : <span className="text-slate-500">—</span>}
                    </td>

                    {/* Revenue: 2.5% of enrolled_debt */}
                    <td className="px-4 py-3">
                      {rec.enrolled_debt && !isNaN(Number(rec.enrolled_debt)) && Number(rec.enrolled_debt) > 0
                        ? <span className="text-violet-400 font-semibold">${(Number(rec.enrolled_debt) * 0.025).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        : <span className="text-slate-500">—</span>}
                    </td>

                    {/* List / Run */}
                    <td className="px-4 py-3">
                      <div className="text-slate-300 text-xs font-medium">{rec.listName}</div>
                      <div className="text-slate-500 text-xs">
                        Run #{rec.runNumber}{rec.runLabel ? ` · ${rec.runLabel}` : ''}
                      </div>
                    </td>

                    {/* Vendor */}
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {rec.sharedWith?.name || '—'}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {formatDate(rec.entryDateParsed)}
                    </td>

                    {/* Payment status dropdown */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {updatingId === rec._id ? (
                          <RefreshCw size={14} className="animate-spin text-indigo-400" />
                        ) : (
                          <>
                            {/* Current badge */}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[rec.paymentStatus || '']}`}>
                              {STATUS_ICON[rec.paymentStatus || '']}
                              {STATUS_LABEL[rec.paymentStatus || '']}
                            </span>
                            {/* Dropdown */}
                            <select
                              value={rec.paymentStatus || ''}
                              onChange={(e) => handleFieldChange(rec, 'paymentStatus', e.target.value)}
                              className="bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt === '' ? 'Not Set' : opt}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        {rec.paymentStatusUpdatedAt && (
                          <span className="text-[10px] text-slate-600 whitespace-nowrap">
                            {formatDate(rec.paymentStatusUpdatedAt)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Payment Type */}
                    <td className="px-4 py-3">
                      <select
                        value={rec.paymentType || ''}
                        onChange={(e) => handleFieldChange(rec, 'paymentType', e.target.value)}
                        disabled={updatingId === rec._id}
                        className="bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 min-w-[120px]"
                      >
                        <option value="">Not Set</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Semi Monthly">Semi Monthly</option>
                      </select>
                    </td>

                    {/* Draft Date 1 */}
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        defaultValue={rec.draftDate1 ? rec.draftDate1.slice(0, 10) : ''}
                        onBlur={(e) => handleFieldChange(rec, 'draftDate1', e.target.value)}
                        disabled={updatingId === rec._id}
                        className="bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      />
                    </td>

                    {/* Draft Date 2 */}
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        defaultValue={rec.draftDate2 ? rec.draftDate2.slice(0, 10) : ''}
                        onBlur={(e) => handleFieldChange(rec, 'draftDate2', e.target.value)}
                        disabled={updatingId === rec._id}
                        className="bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg disabled:opacity-40 transition-colors text-sm"
          >
            <ChevronLeft size={15} /> Prev
          </button>
          <span className="text-slate-400 text-sm">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg disabled:opacity-40 transition-colors text-sm"
          >
            Next <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
