import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe, X, RefreshCw, Search, CheckCircle, XCircle,
  Download, Eye, MessageSquare, PhoneCall, Mail, MapPin,
  DollarSign, Smartphone, ChevronLeft, ChevronRight,
  FileDown, Clock, Send, Lock, Building,
} from 'lucide-react';
import axios from '../utils/axios';
import { useAuth } from '../contexts/AuthContext';
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

const fmt     = (v) => (v === undefined || v === null || v === '') ? '—' : v;
const fmtDate = (d) => d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';

// canWrite comes from the API response — true for Reddington admin / superadmin, false for tenant org admins
const BenWebsiteLeadsModal = ({ onClose, targetOrgName, title }) => {
  const { user } = useAuth();
  const [leads, setLeads]           = useState([]);
  const [summary, setSummary]       = useState({ new: 0, reviewed: 0, imported: 0, rejected: 0, total: 0 });
  const [organizations, setOrganizations] = useState([]);
  const [orgFilter, setOrgFilter]   = useState('');
  const [canWrite, setCanWrite]     = useState(false);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [detail, setDetail]         = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [exporting, setExporting]   = useState(false);
  const [commentText, setCommentText]   = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const commentSectionRef = useRef(null);

  const openDetail = useCallback(async (lead, scrollToComments = false) => {
    setDetail(lead);
    setCommentText('');
    try {
      const res = await axios.get(`/api/ben-website-leads/${lead._id}`);
      if (res.data?.success) {
        setDetail(res.data.data);
        if (scrollToComments) {
          setTimeout(() => {
            commentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }
      }
    } catch { /* keep cached */ }
  }, []);

  const fetchLeads = useCallback(async (opts = {}) => {
    const { silent = false, page = pagination.page } = opts;
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (statusFilter) params.set('status', statusFilter);
      if (orgFilter) {
        params.set('organizationId', orgFilter);
      } else if (targetOrgName) {
        params.set('orgName', targetOrgName);
      }
      if (search.trim()) params.set('search', search.trim());

      const res = await axios.get(`/api/ben-website-leads?${params}`);
      if (res.data?.success) {
        setLeads(res.data.data);
        setSummary(res.data.summary || {});
        const orgList = res.data.organizations || [];
        setOrganizations(orgList);
        setPagination(res.data.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
        setCanWrite(!!res.data.canWrite);

        // If targetOrgName is passed and no orgFilter is set yet, auto-select matching org
        if (targetOrgName && !orgFilter && orgList.length > 0) {
          const match = orgList.find(o => o.name?.toLowerCase().includes(targetOrgName.toLowerCase()));
          if (match) {
            setOrgFilter(match._id);
          }
        }
      }
    } catch (err) {
      console.error('Fetch inbound website leads:', err);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, orgFilter, search, pagination.page, targetOrgName]);

  useEffect(() => { fetchLeads({ page: 1 }); }, [statusFilter, orgFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ page: 1, limit: 5000 });
      if (statusFilter) params.set('status', statusFilter);
      if (orgFilter) {
        params.set('organizationId', orgFilter);
      } else if (targetOrgName) {
        params.set('orgName', targetOrgName);
      }
      if (search.trim()) params.set('search', search.trim());
      const res = await axios.get(`/api/ben-website-leads?${params}`);
      const rows = res.data?.data || [];
      if (!rows.length) { toast.error('No leads to export'); return; }

      const headers = canWrite
        ? ['Organization', 'Name', 'Email', 'Phone', 'Form Type', 'Message', 'Debt Amount', 'Status', 'Received']
        : ['Name', 'Email', 'Phone', 'Form Type', 'Message', 'Debt Amount', 'Status', 'Received'];
      const esc = (v) => { if (v == null || v === '') return ''; const s = String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
      const csvRows = [
        headers.join(','),
        ...rows.map(r => {
          const rowData = [
            esc(r.name), esc(r.email), esc(r.phone),
            esc(r.formType === 'contact-form' ? 'Contact Form' : r.formType === 'qualify-form' ? 'Qualify Form' : 'Unknown'),
            esc(r.message),
            esc(r.totalDebtAmount != null ? r.totalDebtAmount : ''),
            esc(r.status),
            esc(r.createdAt ? new Date(r.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '')
          ];
          if (canWrite) {
            rowData.unshift(esc(r.organization?.name || ''));
          }
          return rowData.join(',');
        })
      ];
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `inbound-leads-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} leads`);
    } catch { toast.error('Export failed'); } finally { setExporting(false); }
  };

  const handleStatusChange = async (lead, newStatus) => {
    if (!canWrite) return;
    setActionLoading(lead._id);
    try {
      await axios.patch(`/api/ben-website-leads/${lead._id}/status`, { status: newStatus });
      toast.success(`Marked as ${newStatus}`);
      setLeads(prev => prev.map(l => l._id === lead._id ? { ...l, status: newStatus } : l));
      setSummary(prev => { const n = { ...prev }; n[lead.status] = Math.max(0, (n[lead.status] || 0) - 1); n[newStatus] = (n[newStatus] || 0) + 1; return n; });
      if (detail?._id === lead._id) setDetail(d => ({ ...d, status: newStatus }));
    } catch { toast.error('Failed to update status'); } finally { setActionLoading(null); }
  };

  const handleImport = async (lead) => {
    if (!canWrite) return;
    if (!window.confirm(`Import "${lead.name}" into the main Lead collection?`)) return;
    setActionLoading(lead._id);
    try {
      const res = await axios.post(`/api/ben-website-leads/${lead._id}/import`);
      if (res.data?.success) {
        toast.success(`Lead imported — ID: ${res.data.data.leadId}`);
        setLeads(prev => prev.map(l => l._id === lead._id ? { ...l, status: 'imported' } : l));
        if (detail?._id === lead._id) setDetail(d => ({ ...d, status: 'imported' }));
      }
    } catch (err) { toast.error(err.response?.data?.message || 'Import failed'); } finally { setActionLoading(null); }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!canWrite) return;
    const text = commentText.trim();
    if (!text) return;
    if (text.length > 1000) { toast.error('Comment must be 1000 characters or fewer.'); return; }
    setCommentSubmitting(true);
    try {
      const res = await axios.post(`/api/ben-website-leads/${detail._id}/comments`, { text });
      if (res.data?.success) {
        const updated = [...(detail.comments || []), res.data.data];
        setDetail(prev => ({ ...prev, comments: updated }));
        setLeads(prev => prev.map(l => l._id === detail._id ? { ...l, comments: updated } : l));
        setCommentText('');
        toast.success('Comment added');
      }
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add comment'); } finally { setCommentSubmitting(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-orange-500 to-amber-600 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Globe className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {title || (canWrite ? 'Inbound / Webhook Leads' : `${user?.organization?.name ? `${user.organization.name} Leads` : 'Inbound Leads'}`)}
                </h2>
                <p className="text-xs text-orange-100">
                  {targetOrgName ? `Submissions for ${title || targetOrgName}` : (canWrite ? 'Submissions across all organization webhook integrations' : `Submissions for ${user?.organization?.name || 'your organization'}`)} · {canWrite ? 'Full access' : <span className="flex items-center gap-1 inline-flex"><Lock className="h-3 w-3" /> Read-only</span>}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-white hover:text-orange-200 transition-colors p-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Summary Badges + toolbar */}
          <div className="flex gap-2 px-6 py-3 bg-gray-50 border-b flex-wrap flex-shrink-0 items-center">
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
                  statusFilter === key ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-orange-50'
                }`}
              >
                {label}
                <span className={`ml-0.5 px-1.5 rounded-full text-xs ${statusFilter === key ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  {count ?? 0}
                </span>
              </button>
            ))}

            {canWrite && organizations.length > 0 && (
              <select
                value={orgFilter}
                onChange={(e) => { setOrgFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">All Organizations</option>
                {organizations.map(o => (
                  <option key={o._id} value={o._id}>{o.name}</option>
                ))}
              </select>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button onClick={handleExport} disabled={exporting}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                <FileDown className={`h-3.5 w-3.5 ${exporting ? 'animate-bounce' : ''}`} />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
              <form onSubmit={(e) => { e.preventDefault(); fetchLeads({ page: 1 }); }} className="flex items-center gap-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search name / email / phone..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <button type="submit" className="px-2.5 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 transition-colors">Go</button>
              </form>
              <button onClick={() => fetchLeads({ silent: true })} disabled={refreshing}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Read-only banner for non-writers */}
          {!canWrite && !loading && (
            <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">You have read-only access. Contact the main organisation admin to take action on these leads.</p>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Loading…</div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <Globe className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm font-medium">No inbound leads found</p>
                <p className="text-xs mt-1">Submissions from webhook integrations will appear here</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    {canWrite && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Organization</th>}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Form</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Debt</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Received</th>
                    {canWrite && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map(lead => (
                    <tr key={lead._id} className="hover:bg-orange-50/40 transition-colors">
                      {canWrite && (
                        <td className="px-4 py-3 text-xs">
                          <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-800 border border-gray-200 whitespace-nowrap">
                            {lead.organization?.name || '—'}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <button onClick={() => openDetail(lead)} className="font-semibold text-gray-900 hover:text-orange-600 text-left transition-colors">
                          {lead.name}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {lead.email && <p className="text-xs text-gray-600 flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</p>}
                        {lead.phone && <p className="text-xs text-gray-600 flex items-center gap-1"><PhoneCall className="h-3 w-3" />{lead.phone}</p>}
                        {!lead.email && !lead.phone && <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${(FORM_LABELS[lead.formType] || FORM_LABELS.unknown).color}`}>
                          {(FORM_LABELS[lead.formType] || FORM_LABELS.unknown).label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">{lead.totalDebtAmount != null ? fmtMoney(lead.totalDebtAmount) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-700'}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(lead.createdAt)}</td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openDetail(lead)} className="p-1.5 rounded-lg hover:bg-orange-100 text-orange-600 transition-colors" title="View details">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {lead.status !== 'imported' && (
                              <button disabled={actionLoading === lead._id} onClick={() => handleImport(lead)}
                                className="p-1.5 rounded-lg hover:bg-green-100 text-green-600 transition-colors disabled:opacity-50" title="Import to LMS">
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {lead.status === 'new' && (
                              <button disabled={actionLoading === lead._id} onClick={() => handleStatusChange(lead, 'rejected')}
                                className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors disabled:opacity-50" title="Reject">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
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
                <button disabled={pagination.page <= 1}
                  onClick={() => { const p = pagination.page - 1; setPagination(prev => ({ ...prev, page: p })); fetchLeads({ page: p }); }}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1.5 text-xs text-gray-700 font-medium bg-white border border-gray-200 rounded-lg">
                  {pagination.page} / {pagination.pages}
                </span>
                <button disabled={pagination.page >= pagination.pages}
                  onClick={() => { const p = pagination.page + 1; setPagination(prev => ({ ...prev, page: p })); fetchLeads({ page: p }); }}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail pane */}
      {detail && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => { setDetail(null); setCommentText(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-orange-500 to-amber-600">
              <div>
                <h3 className="text-lg font-bold text-white">{detail.name}</h3>
                <p className="text-xs text-orange-100">{fmtDate(detail.createdAt)}</p>
              </div>
              <button onClick={() => { setDetail(null); setCommentText(''); }} className="text-white hover:text-orange-200 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Badges */}
              <div className="flex gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[detail.status] || 'bg-gray-100 text-gray-700'}`}>{detail.status}</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${(FORM_LABELS[detail.formType] || FORM_LABELS.unknown).color}`}>{(FORM_LABELS[detail.formType] || FORM_LABELS.unknown).label}</span>
                {detail.smsOptIn && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800"><Smartphone className="h-3 w-3 mr-1" />SMS Opt-In</span>}
                {!canWrite && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"><Lock className="h-3 w-3 mr-1" />Read Only</span>}
              </div>

              {/* Contact */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</h4>
                {detail.organization?.name && <Row icon={<Building className="h-4 w-4 text-orange-500" />} label="Organization" value={detail.organization.name} />}
                <Row icon={<Mail className="h-4 w-4 text-blue-500" />} label="Email" value={fmt(detail.email)} />
                <Row icon={<PhoneCall className="h-4 w-4 text-green-500" />} label="Phone" value={fmt(detail.phone)} />
              </div>

              {(detail.streetAddress || detail.city) && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</h4>
                  <Row icon={<MapPin className="h-4 w-4 text-red-500" />} label="Street" value={fmt(detail.streetAddress)} />
                  <Row icon={null} label="City" value={fmt(detail.city)} />
                  <Row icon={null} label="State" value={fmt(detail.state)} />
                  <Row icon={null} label="ZIP" value={fmt(detail.zipCode)} />
                </div>
              )}

              {detail.totalDebtAmount != null && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Debt</h4>
                  <Row icon={<DollarSign className="h-4 w-4 text-yellow-500" />} label="Estimated Debt" value={fmtMoney(detail.totalDebtAmount)} />
                </div>
              )}

              {(detail.preferredContactDate || detail.preferredContactSlot) && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Preferred Contact</h4>
                  <Row icon={<Clock className="h-4 w-4 text-teal-500" />} label="Date" value={fmt(detail.preferredContactDate)} />
                  <Row icon={null} label="Time Slot" value={fmt(detail.preferredContactSlot)} />
                  {detail.preferredContactCustomTime && <Row icon={null} label="Custom Time" value={fmt(detail.preferredContactCustomTime)} />}
                </div>
              )}

              {detail.message && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Message</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.message}</p>
                </div>
              )}

              {/* Comments — visible to all, but add form only for canWrite */}
              <div ref={commentSectionRef} className="bg-gray-50 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" /> Comments ({(detail.comments || []).length})
                </h4>
                {(detail.comments || []).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No comments yet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {(detail.comments || []).map((c, i) => (
                      <div key={c._id || i} className="bg-white rounded-lg p-3 border border-gray-100">
                        <p className="text-xs text-gray-800 whitespace-pre-wrap break-words">{c.text}</p>
                        <p className="text-xs text-gray-400 mt-1.5">{c.authorName || 'Staff'} &middot; {c.createdAt ? new Date(c.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                      </div>
                    ))}
                  </div>
                )}
                {canWrite && (
                  <form onSubmit={handleAddComment} className="flex flex-col gap-2 pt-1">
                    <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                      placeholder="Add a comment…" maxLength={1000} rows={2}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                      disabled={commentSubmitting} />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{commentText.length}/1000</span>
                      <button type="submit" disabled={commentSubmitting || !commentText.trim()}
                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                        <Send className="h-3 w-3" /> {commentSubmitting ? 'Saving…' : 'Add Comment'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Actions — Reddington admin only */}
            {canWrite && detail.status !== 'imported' && (
              <div className="border-t px-5 py-4 flex gap-2 flex-wrap bg-gray-50">
                {detail.status !== 'reviewed' && (
                  <button disabled={actionLoading === detail._id} onClick={() => handleStatusChange(detail, 'reviewed')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors disabled:opacity-50">
                    <Eye className="h-3.5 w-3.5" /> Mark Reviewed
                  </button>
                )}
                {detail.status !== 'rejected' && (
                  <button disabled={actionLoading === detail._id} onClick={() => handleStatusChange(detail, 'rejected')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50">
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                )}
                <button disabled={actionLoading === detail._id} onClick={() => handleImport(detail)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 ml-auto">
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

const Row = ({ icon, label, value }) => (
  <div className="flex justify-between items-start gap-2">
    <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">{icon}{label}</span>
    <span className="text-xs text-gray-900 text-right break-all">{value}</span>
  </div>
);

export default BenWebsiteLeadsModal;
