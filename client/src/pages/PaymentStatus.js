import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Search, RefreshCw, ChevronLeft, ChevronRight,
  Calendar, User, CheckCircle2, XCircle, Clock
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['', 'NFC', 'First Payment Complete'];

const STATUS_BADGE = {
  'NFC': 'bg-rose-100 text-rose-700 border border-rose-200',
  'First Payment Complete': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  '': 'bg-gray-100 text-gray-500 border border-gray-200',
};

const STATUS_ICON = {
  'NFC': <XCircle size={12} />,
  'First Payment Complete': <CheckCircle2 size={12} />,
  '': <Clock size={12} />,
};

const STATUS_LABEL = {
  '': 'Not Set',
  'NFC': 'NFC',
  'First Payment Complete': 'First Payment Complete',
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

  const [loading, setLoading] = useState(false);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

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
      if (selectedVendorId) params.vendorId = selectedVendorId;
      if (search)    params.search    = search;
      if (startDate) params.startDate = startDate;
      if (endDate)   params.endDate   = endDate;

      const res = await axios.get('/api/data-vendor-uploads/payment-status/sales', { params });
      setRecords(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch {
      toast.error('Failed to load SALE records');
    } finally {
      setLoading(false);
    }
  }, [selectedVendorId, search, startDate, endDate, page]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ── Update payment status ──────────────────────────────────────
  const handleStatusChange = async (record, newStatus) => {
    setUpdatingId(record._id);
    try {
      const res = await axios.patch(
        `/api/data-vendor-uploads/${record._id}/payment-status`,
        { paymentStatus: newStatus }
      );
      setRecords((prev) =>
        prev.map((r) =>
          r._id === record._id
            ? { ...r, paymentStatus: res.data.data.paymentStatus, paymentStatusUpdatedAt: res.data.data.paymentStatusUpdatedAt }
            : r
        )
      );
      toast.success('Payment status updated');
    } catch {
      toast.error('Failed to update status');
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

          {/* Search */}
          <form onSubmit={handleSearch} className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Search size={11} /> Search
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name, phone, email, list…"
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Debt / Enrolled</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">List / Run</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Entry Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Status</th>
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

                    {/* Debt */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-slate-300">{rec.debt ? `$${Number(rec.debt).toLocaleString()}` : '—'}</div>
                      {rec.enrolled_debt && (
                        <div className="text-xs text-emerald-400">${Number(rec.enrolled_debt).toLocaleString()} enrolled</div>
                      )}
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
                      <div className="flex items-center gap-2">
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
                              onChange={(e) => handleStatusChange(rec, e.target.value)}
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
