import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  X,
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  Download,
  Eye,
  MessageSquare,
  PhoneCall,
  Mail,
  MapPin,
  DollarSign,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  FileDown,
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  new:      'bg-blue-100 text-blue-800',
  reviewed: 'bg-yellow-100 text-yellow-800',
  imported: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const FORM_LABELS = {
  'contact-form': { label: 'Contact Form', color: 'bg-purple-100 text-purple-800' },
  'qualify-form': { label: 'Qualify Form', color: 'bg-teal-100 text-teal-800' },
  'unknown':      { label: 'Unknown',      color: 'bg-gray-100 text-gray-700' },
};

const fmt = (v) => (v === undefined || v === null || v === '') ? '—' : v;
const fmtDate = (d) => d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';

const WebsiteLeadsModal = ({ onClose }) => {
  const [leads, setLeads]           = useState([]);
  const [summary, setSummary]       = useState({ new: 0, reviewed: 0, imported: 0, rejected: 0, total: 0 });
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [detail, setDetail]         = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [exporting, setExporting]   = useState(false);

  const fetchLeads = useCallback(async (opts = {}) => {
    const { silent = false, page = pagination.page } = opts;
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await axios.get(`/api/website-leads?${params}`);
      if (res.data?.success) {
        setLeads(res.data.data);
        setSummary(res.data.summary || {});
        setPagination(res.data.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
      }
    } catch (err) {
      console.error('Fetch website leads:', err);
      toast.error('Failed to load website leads');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search, pagination.page]);

  useEffect(() => { fetchLeads({ page: 1 }); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Export all matching leads to CSV
  const handleExport = async () => {
    setExporting(true);
    try {
      // Fetch all pages (up to 5000 rows) without pagination
      const params = new URLSearchParams({ page: 1, limit: 5000 });
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await axios.get(`/api/website-leads?${params}`);
      const rows = res.data?.data || [];
      if (!rows.length) { toast.error('No leads to export'); return; }

      const headers = ['Name','First Name','Last Name','Email','Phone','Form Type','Message','Debt Amount','Street Address','City','State','ZIP Code','SMS Opt-In','Status','Received'];
      const escape = (v) => {
        if (v == null || v === '') return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csvRows = [
        headers.join(','),
        ...rows.map(r => [
          escape(r.name), escape(r.firstName), escape(r.lastName),
          escape(r.email), escape(r.phone),
          escape(r.formType === 'contact-form' ? 'Contact Form' : r.formType === 'qualify-form' ? 'Qualify Form' : 'Unknown'),
          escape(r.message),
          escape(r.totalDebtAmount != null ? r.totalDebtAmount : ''),
          escape(r.streetAddress), escape(r.city), escape(r.state), escape(r.zipCode),
          escape(r.smsOptIn ? 'Yes' : 'No'),
          escape(r.status),
          escape(r.createdAt ? new Date(r.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '')
        ].join(','))
      ];
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `website-leads-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} leads`);
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchLeads({ page: 1 });
  };

  const handleStatusChange = async (lead, newStatus) => {
    setActionLoading(lead._id);
    try {
      await axios.patch(`/api/website-leads/${lead._id}/status`, { status: newStatus });
      toast.success(`Marked as ${newStatus}`);
      setLeads(prev => prev.map(l => l._id === lead._id ? { ...l, status: newStatus } : l));
      setSummary(prev => {
        const next = { ...prev };
        next[lead.status] = Math.max(0, (next[lead.status] || 0) - 1);
        next[newStatus]   = (next[newStatus] || 0) + 1;
        return next;
      });
      if (detail?._id === lead._id) setDetail(d => ({ ...d, status: newStatus }));
    } catch (err) {
      toast.error('Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleImport = async (lead) => {
    if (!window.confirm(`Import "${lead.name}" into the main Lead collection?`)) return;
    setActionLoading(lead._id);
    try {
      const res = await axios.post(`/api/website-leads/${lead._id}/import`);
      if (res.data?.success) {
        toast.success(`Lead imported — ID: ${res.data.data.leadId}`);
        setLeads(prev => prev.map(l => l._id === lead._id ? { ...l, status: 'imported' } : l));
        if (detail?._id === lead._id) setDetail(d => ({ ...d, status: 'imported' }));
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Import failed';
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-teal-600 to-cyan-700 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Globe className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Website Leads</h2>
                <p className="text-xs text-teal-100">Submissions from marketing website forms</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white hover:text-teal-200 transition-colors p-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Summary Badges + Export */}
          <div className="flex gap-2 px-6 py-3 bg-gray-50 border-b flex-wrap flex-shrink-0">
            {[
              { key: '',         label: 'All',      count: summary.total },
              { key: 'new',      label: 'New',      count: summary.new },
              { key: 'reviewed', label: 'Reviewed', count: summary.reviewed },
              { key: 'imported', label: 'Imported', count: summary.imported },
              { key: 'rejected', label: 'Rejected', count: summary.rejected },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => { setStatusFilter(key); setPagination(p => ({ ...p, page: 1 })); }}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  statusFilter === key
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-teal-50'
                }`}
              >
                {label}
                <span className={`ml-0.5 px-1.5 py-0 rounded-full text-xs ${statusFilter === key ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  {count ?? 0}
                </span>
              </button>
            ))}

            <div className="ml-auto flex items-center gap-2">
              {/* Export CSV */}
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                title="Export current filter to CSV"
              >
                <FileDown className={`h-3.5 w-3.5 ${exporting ? 'animate-bounce' : ''}`} />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
              {/* Search */}
              <form onSubmit={handleSearch} className="flex items-center gap-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name / email / phone..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <button type="submit" className="px-2.5 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                  Go
                </button>
              </form>
              {/* Refresh */}
              <button
                onClick={() => fetchLeads({ silent: true })}
                disabled={refreshing}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Loading…</div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <Globe className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm font-medium">No website leads found</p>
                <p className="text-xs mt-1">Form submissions from your website will appear here</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Form</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Debt</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">SMS</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Received</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map(lead => (
                    <tr key={lead._id} className="hover:bg-teal-50/40 transition-colors">
                      {/* Name */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetail(lead)}
                          className="font-semibold text-gray-900 hover:text-teal-600 text-left transition-colors"
                        >
                          {lead.name}
                        </button>
                      </td>
                      {/* Contact */}
                      <td className="px-4 py-3">
                        {lead.email && <p className="text-xs text-gray-600 flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</p>}
                        {lead.phone && <p className="text-xs text-gray-600 flex items-center gap-1"><PhoneCall className="h-3 w-3" />{lead.phone}</p>}
                        {!lead.email && !lead.phone && <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      {/* Form type */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${(FORM_LABELS[lead.formType] || FORM_LABELS.unknown).color}`}>
                          {(FORM_LABELS[lead.formType] || FORM_LABELS.unknown).label}
                        </span>
                        {lead.message && (
                          <span className="ml-1 inline-flex items-center" title={lead.message}>
                            <MessageSquare className="h-3 w-3 text-gray-400" />
                          </span>
                        )}
                      </td>
                      {/* Debt */}
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {lead.totalDebtAmount != null ? fmtMoney(lead.totalDebtAmount) : '—'}
                      </td>
                      {/* SMS */}
                      <td className="px-4 py-3">
                        {lead.smsOptIn
                          ? <CheckCircle className="h-4 w-4 text-green-500" />
                          : <XCircle className="h-4 w-4 text-gray-300" />}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-700'}`}>
                          {lead.status}
                        </span>
                      </td>
                      {/* Received */}
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDate(lead.createdAt)}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDetail(lead)}
                            className="p-1.5 rounded-lg hover:bg-teal-100 text-teal-600 transition-colors"
                            title="View details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {lead.status !== 'imported' && (
                            <button
                              disabled={actionLoading === lead._id}
                              onClick={() => handleImport(lead)}
                              className="p-1.5 rounded-lg hover:bg-green-100 text-green-600 transition-colors disabled:opacity-50"
                              title="Import to LMS"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {lead.status === 'new' && (
                            <button
                              disabled={actionLoading === lead._id}
                              onClick={() => handleStatusChange(lead, 'rejected')}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors disabled:opacity-50"
                              title="Reject"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t bg-gray-50 flex-shrink-0">
              <p className="text-xs text-gray-500">
                Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-1">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => { const p = pagination.page - 1; setPagination(prev => ({ ...prev, page: p })); fetchLeads({ page: p }); }}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1.5 text-xs text-gray-700 font-medium bg-white border border-gray-200 rounded-lg">
                  {pagination.page} / {pagination.pages}
                </span>
                <button
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => { const p = pagination.page + 1; setPagination(prev => ({ ...prev, page: p })); fetchLeads({ page: p }); }}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail pane — rendered inline to avoid stale closure issues */}
      {detail && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-teal-600 to-cyan-600">
              <div>
                <h3 className="text-lg font-bold text-white">{detail.name}</h3>
                <p className="text-xs text-teal-100">{fmtDate(detail.createdAt)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-white hover:text-teal-200 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Badges */}
              <div className="flex gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[detail.status] || 'bg-gray-100 text-gray-700'}`}>
                  {detail.status}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${(FORM_LABELS[detail.formType] || FORM_LABELS.unknown).color}`}>
                  {(FORM_LABELS[detail.formType] || FORM_LABELS.unknown).label}
                </span>
                {detail.smsOptIn && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                    <Smartphone className="h-3 w-3 mr-1" /> SMS Opt-In
                  </span>
                )}
              </div>

              {/* Contact */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</h4>
                <Row icon={<Mail className="h-4 w-4 text-blue-500" />} label="Email" value={fmt(detail.email)} />
                <Row icon={<PhoneCall className="h-4 w-4 text-green-500" />} label="Phone" value={fmt(detail.phone)} />
              </div>

              {/* Address */}
              {(detail.streetAddress || detail.city || detail.state || detail.zipCode) && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</h4>
                  <Row icon={<MapPin className="h-4 w-4 text-red-500" />} label="Street" value={fmt(detail.streetAddress)} />
                  <Row icon={null} label="City" value={fmt(detail.city)} />
                  <Row icon={null} label="State" value={fmt(detail.state)} />
                  <Row icon={null} label="ZIP" value={fmt(detail.zipCode)} />
                </div>
              )}

              {/* Debt */}
              {detail.totalDebtAmount != null && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Debt Information</h4>
                  <Row icon={<DollarSign className="h-4 w-4 text-yellow-500" />} label="Estimated Debt" value={fmtMoney(detail.totalDebtAmount)} />
                </div>
              )}

              {/* Message */}
              {detail.message && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Message</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.message}</p>
                </div>
              )}

            </div>

            {/* Actions */}
            {detail.status !== 'imported' && (
              <div className="border-t px-5 py-4 flex gap-2 flex-wrap bg-gray-50">
                {detail.status !== 'reviewed' && (
                  <button
                    disabled={actionLoading === detail._id}
                    onClick={() => handleStatusChange(detail, 'reviewed')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors disabled:opacity-50"
                  >
                    <Eye className="h-3.5 w-3.5" /> Mark Reviewed
                  </button>
                )}
                {detail.status !== 'rejected' && (
                  <button
                    disabled={actionLoading === detail._id}
                    onClick={() => handleStatusChange(detail, 'rejected')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                )}
                <button
                  disabled={actionLoading === detail._id}
                  onClick={() => handleImport(detail)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 ml-auto"
                >
                  <Download className="h-3.5 w-3.5" /> Import to LMS
                </button>
              </div>
            )}
            {detail.status === 'imported' && (
              <div className="border-t px-5 py-3 bg-green-50">
                <span className="text-xs font-semibold text-green-700 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> Already imported into the main Lead collection
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// Small helper row for detail pane
const Row = ({ icon, label, value }) => (
  <div className="flex justify-between items-start gap-2">
    <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
      {icon}{label}
    </span>
    <span className="text-xs text-gray-900 text-right break-all">{value}</span>
  </div>
);

export default WebsiteLeadsModal;
