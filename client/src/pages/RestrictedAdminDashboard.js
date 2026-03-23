import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Download,
  Calendar,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Filter
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

// ── Auto-format dd-mm-yyyy while typing ─────────────────────────
function autoFormatDate(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + '-' + digits.slice(2);
  return digits.slice(0, 2) + '-' + digits.slice(2, 4) + '-' + digits.slice(4);
}

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
  }, [activePreset, pagination.limit, user, selectedAdmin]);

  // Initial load + filter change
  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

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
  const handleCustomStartChange = (val) => {
    const formatted = autoFormatDate(val);
    setCustomStart(formatted);
    customStartRef.current = formatted;
  };
  const handleCustomEndChange = (val) => {
    const formatted = autoFormatDate(val);
    setCustomEnd(formatted);
    customEndRef.current = formatted;
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

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {user?.role === 'superadmin' ? 'Admin Uploads Overview' : 'Restricted Admin Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {pagination.total} total records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(pagination.page)}
            disabled={refreshing}
            className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:shadow-lg flex items-center gap-1.5 transition-all"
          >
            <Download size={14} />
            Download CSV
          </button>
        </div>
      </div>

      {/* ── Date Filters ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Calendar size={16} />
            <span>Date:</span>
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1.5">
            {DATE_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => handlePreset(p.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border-2 transition-all duration-200 ${
                  activePreset === p.key
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs font-medium text-gray-500">Custom:</span>
            <input
              type="text"
              placeholder="dd-mm-yyyy"
              value={customStart}
              onChange={e => handleCustomStartChange(e.target.value)}
              maxLength={10}
              className={`w-28 px-2 py-1.5 text-xs border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                activePreset === 'custom' ? 'border-blue-400' : 'border-gray-200'
              }`}
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="text"
              placeholder="dd-mm-yyyy"
              value={customEnd}
              onChange={e => handleCustomEndChange(e.target.value)}
              maxLength={10}
              className={`w-28 px-2 py-1.5 text-xs border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                activePreset === 'custom' ? 'border-blue-400' : 'border-gray-200'
              }`}
            />
            <button
              onClick={handleApplyCustom}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>

        {/* SuperAdmin: restricted admin filter */}
        {user?.role === 'superadmin' && restrictedAdmins.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <Filter size={14} className="text-gray-500" />
            <span className="text-xs font-medium text-gray-600">Restricted Admin:</span>
            <select
              value={selectedAdmin}
              onChange={e => setSelectedAdmin(e.target.value)}
              className="px-2 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
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
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search across all fields..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
        />
      </div>

      {/* ── Data Table ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                  #
                </th>
                {ALL_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
                {user?.role === 'superadmin' && (
                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {displayRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={ALL_COLUMNS.length + (user?.role === 'superadmin' ? 2 : 1)}
                    className="px-6 py-12 text-center text-sm text-gray-500"
                  >
                    No records found
                  </td>
                </tr>
              ) : (
                displayRecords.map((record, idx) => (
                  <tr key={record._id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {(pagination.page - 1) * pagination.limit + idx + 1}
                    </td>
                    {ALL_COLUMNS.map(col => (
                      <td
                        key={col.key}
                        className="px-3 py-2 text-xs text-gray-800 whitespace-nowrap max-w-[200px] truncate"
                        title={record[col.key] || ''}
                      >
                        {record[col.key] || '—'}
                      </td>
                    ))}
                    {user?.role === 'superadmin' && (
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleDelete(record._id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-600">
              Page <span className="font-bold text-blue-600">{pagination.page}</span> of{' '}
              <span className="font-bold">{pagination.pages}</span>{' '}
              ({pagination.total} records)
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => fetchData(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-2.5 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                onClick={() => fetchData(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="px-2.5 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RestrictedAdminDashboard;
