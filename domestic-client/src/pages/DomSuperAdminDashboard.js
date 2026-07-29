import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LogOut, Plus, Shield, Eye, EyeOff, X, RefreshCw, Key,
  Users, UserPlus, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Copy,
  Upload, Database, Share2, Globe, Search, UserCheck2,
  Activity, BarChart2, FileText, Briefcase, Coffee, XCircle,
  TrendingUp, Calendar, Download, ArrowUp, ArrowDown, Zap,
  ChevronDown, Menu, Send,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DomAdminDashboard from './DomAdminDashboard';
import api   from '../utils/axios';
import toast from 'react-hot-toast';

/** Shared performance tier helper (mirrors DomAdminDashboard) */
const getAgentTier = (agent) => {
  if (!agent.isActive) return { tier: 0, emoji: '💤', label: 'Inactive', color: 'gray', score: -1 };
  const loaded    = agent.leadsLoaded    || 0;
  const completed = agent.leadsCompleted || 0;
  const worked    = agent.domLeadsCreated || 0;
  const conv      = loaded > 0 ? (completed / loaded) * 100 : 0;
  const score     = (conv * 0.6) + (Math.min(worked, 60) * 0.8);
  if (loaded < 2)                                    return { tier: 1, emoji: '🆕', label: 'New Agent',      color: 'sky',    score };
  if (conv >= 65 && worked >= 5)                     return { tier: 5, emoji: '🏆', label: 'Top Performer',  color: 'amber',  score };
  if (conv >= 45 || (conv >= 35 && worked >= 8))     return { tier: 4, emoji: '⭐', label: 'Star Agent',      color: 'violet', score };
  if (conv >= 25 || worked >= 5)                     return { tier: 3, emoji: '👍', label: 'Good Agent',      color: 'emerald',score };
  if (loaded >= 5 && conv < 15)                      return { tier: 2, emoji: '⚠️', label: 'Needs Coaching', color: 'orange', score };
  return                                                      { tier: 2, emoji: '✅', label: 'Active',          color: 'teal',   score };
};
const SA_TIER_STYLES = {
  amber:'bg-amber-100 text-amber-800 border-amber-300', violet:'bg-violet-100 text-violet-800 border-violet-300',
  emerald:'bg-emerald-100 text-emerald-800 border-emerald-300', teal:'bg-teal-100 text-teal-800 border-teal-300',
  sky:'bg-sky-100 text-sky-800 border-sky-300', orange:'bg-orange-100 text-orange-700 border-orange-300',
  gray:'bg-gray-100 text-gray-500 border-gray-300',
};

const ROLE_LABELS = {
  dom_superadmin: 'Super Admin',
  dom_admin:      'Admin',
  domagent:       'Agent',
};

const ROLE_COLORS = {
  dom_superadmin: 'bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5]',
  dom_admin:      'bg-blue-100 text-blue-800 border border-blue-200',
  domagent:       'bg-gray-100 text-gray-700 border border-gray-200',
};

const IST_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30 — India has no DST
/** Returns today's date in IST as YYYY-MM-DD. offsetDays > 0 = days ago */
const istToday = (offsetDays = 0) => {
  const ist = new Date(Date.now() + IST_MS - offsetDays * 86400000);
  return ist.toISOString().slice(0, 10);
};

const fmtShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : 'Never';

const DomSuperAdminDashboard = () => {
  const { user, logout } = useAuth();
  const [superTab, setSuperTab] = useState('main');

  const [users,           setUsers]           = useState([]);
  const [usersLoading,    setUsersLoading]    = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser,        setEditUser]        = useState(null);
  const [deleteConfirm,   setDeleteConfirm]   = useState(null); // { type, id, name } — universal delete confirm

  const [apiKey,         setApiKey]        = useState(null);
  const [apiKeyVisible,  setApiKeyVisible]  = useState(false);
  const [apiKeyLoading,  setApiKeyLoading]  = useState(false);

  // Import & Share state
  const [batches,         setBatches]         = useState([]);
  const [batchesLoading,  setBatchesLoading]  = useState(false);
  const [importFile,      setImportFile]      = useState(null);
  const [batchName,       setBatchName]       = useState('');
  const [uploading,       setUploading]       = useState(false);
  const [lastImportResult, setLastImportResult] = useState(null); // { count, skippedRows, foundFields, missingFields }
  const [allAdmins,       setAllAdmins]       = useState([]);
  const [shareModal,      setShareModal]      = useState(null);
  const [selectedAdmins,  setSelectedAdmins]  = useState([]);

  // Batch assign to agent (SA direct assign)
  const [batchAssignModal,  setBatchAssignModal]  = useState(null);
  const [batchAssignAgentId,setBatchAssignAgentId]= useState('');
  const [batchAssigning,    setBatchAssigning]    = useState(false);
  const [sharing,         setSharing]         = useState(false);

  // Website Leads management state
  const [webLeads,           setWebLeads]           = useState([]);
  const [webLeadsTotal,      setWebLeadsTotal]       = useState(0);
  const [webLeadsPage,       setWebLeadsPage]        = useState(1);
  const [webLeadsLoading,    setWebLeadsLoading]     = useState(false);
  const [webStatusFilter,    setWebStatusFilter]     = useState('');
  const [webProductFilter,   setWebProductFilter]    = useState('');
  const [webSearch,          setWebSearch]           = useState('');
  const [webDateFrom,        setWebDateFrom]         = useState('');
  const [webDateTo,          setWebDateTo]           = useState('');
  const [webAgentFilter,     setWebAgentFilter]      = useState('');
  const [webProductTypes,    setWebProductTypes]     = useState([]);
  const [webAgents,          setWebAgents]           = useState([]);
  const [webAssignModal,     setWebAssignModal]      = useState(null);
  const [webAssigning,       setWebAssigning]        = useState(false);
  const [webSelectedIds,     setWebSelectedIds]      = useState(new Set());
  const [bulkAssignModal,    setBulkAssignModal]     = useState(false);
  const [webServiceStats,    setWebServiceStats]     = useState([]);
  const webSearchRef      = useRef('');
  const webStatusRef      = useRef('');
  const webProductRef     = useRef('');
  const webDateFromRef    = useRef('');
  const webDateToRef      = useRef('');
  const webAgentRef       = useRef('');

  // Agent Tracker state
  const [trackerAgents,       setTrackerAgents]       = useState([]);

  // Reports state
  const [reportRange,   setReportRange]   = useState('month');
  const [reportFrom,    setReportFrom]    = useState('');
  const [reportTo,      setReportTo]      = useState('');
  const [reportData,    setReportData]    = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportLastUpdated, setReportLastUpdated] = useState(null);
  const [trendView,     setTrendView]     = useState('daily'); // 'daily' | 'hourly'
  const [trackerLoading,      setTrackerLoading]      = useState(false);
  const [trackerSearch,       setTrackerSearch]       = useState('');
  const [selectedTrackAgent,  setSelectedTrackAgent]  = useState(null);
  const [trackLeads,          setTrackLeads]          = useState([]);
  const [trackWorkedLeads,    setTrackWorkedLeads]    = useState([]);
  const [trackPoolLeads,      setTrackPoolLeads]      = useState([]);
  const [trackLeadsLoading,   setTrackLeadsLoading]   = useState(false);
  const [trackerLeadDetail,   setTrackerLeadDetail]   = useState(null);  // lead clicked in tracker

  // Channel Partners — Manual Leads
  const [manualLeads,        setManualLeads]        = useState([]);
  const [manualLeadsLoading, setManualLeadsLoading] = useState(false);
  const [manualLeadDetail,   setManualLeadDetail]   = useState(null);
  const [manualFilter,       setManualFilter]       = useState('all'); // 'all' | 'marked' | 'not_marked'
  const [manualSearch,       setManualSearch]       = useState('');    // search by name/mobile
  const [userSearch,         setUserSearch]         = useState('');    // search users table
  const [batchSearch,        setBatchSearch]        = useState('');    // search import batches

  // Sidebar collapse state — 'agents' group is expanded by default
  const [openGroups, setOpenGroups] = useState(new Set(['agents']));
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Transfer leads (SA)
  const [saTransferAgent,   setSaTransferAgent]   = useState(null); // from-agent object
  const [saTransferTo,      setSaTransferTo]      = useState('');
  const [saTransferTypes,   setSaTransferTypes]   = useState({ website: true, pool: true, worked: false });
  const [saTransferring,    setSaTransferring]    = useState(false);
  const toggleGroup = (key) => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await api.get('/domestic-api/admin/users');
      setUsers(res.data?.data || []);
    } catch { toast.error('Failed to load users.'); }
    finally { setUsersLoading(false); }
  }, []);

  const handleSaTransfer = useCallback(async () => {
    if (!saTransferTo) { toast.error('Please select a target agent.'); return; }
    const types = Object.entries(saTransferTypes).filter(([,v]) => v).map(([k]) => k);
    if (types.length === 0) { toast.error('Select at least one lead type to transfer.'); return; }
    setSaTransferring(true);
    try {
      const res = await api.post('/domestic-api/admin/agents/transfer-leads', {
        fromAgentId: saTransferAgent._id,
        toAgentId:   saTransferTo,
        types,
      });
      toast.success(res.data.message);
      setSaTransferAgent(null);
      setSaTransferTo('');
      setSaTransferTypes({ website: true, pool: true, worked: false });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed.');
    } finally { setSaTransferring(false); }
  }, [saTransferAgent, saTransferTo, saTransferTypes]);

  const fetchApiKey = useCallback(async () => {
    setApiKeyLoading(true);
    try {
      const res = await api.get('/domestic-api/admin/api-key');
      setApiKey(res.data?.apiKey || null);
    } catch { toast.error('Failed to load API key.'); }
    finally { setApiKeyLoading(false); }
  }, []);

  const fetchBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const res = await api.get('/domestic-api/import-leads/batches');
      setBatches(res.data?.data || []);
    } catch { toast.error('Failed to load import batches.'); }
    finally { setBatchesLoading(false); }
  }, []);

  const fetchAdmins = useCallback(async () => {
    try {
      const res = await api.get('/domestic-api/admin/users');
      setAllAdmins((res.data?.data || []).filter(u => u.role === 'dom_admin' && u.isActive));
    } catch {}
  }, []);

  // ── Website Leads fetch functions ────────────────────────────────────────
  const fetchWebLeads = useCallback(async (page = 1) => {
    setWebLeadsLoading(true);
    try {
      const anyFilter = webSearchRef.current.trim() || webStatusRef.current || webProductRef.current || webDateFromRef.current || webDateToRef.current || webAgentRef.current;
      const limit = anyFilter ? 500 : 30;
      const q = new URLSearchParams({ page, limit });
      if (webStatusRef.current)              q.set('status',      webStatusRef.current);
      if (webProductRef.current)             q.set('productType', webProductRef.current);
      if (webSearchRef.current.trim())       q.set('search',      webSearchRef.current.trim());
      if (webDateFromRef.current)            q.set('dateFrom',    webDateFromRef.current);
      if (webDateToRef.current)              q.set('dateTo',      webDateToRef.current);
      if (webAgentRef.current)               q.set('agentId',     webAgentRef.current);
      const res = await api.get(`/domestic-api/website-leads?${q}`);
      setWebLeads(res.data?.data || []);
      setWebLeadsTotal(res.data?.pagination?.total || 0);
      setWebLeadsPage(page);
    } catch { toast.error('Failed to load website leads.'); }
    finally { setWebLeadsLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchWebProductTypes = useCallback(async () => {
    try {
      const res = await api.get('/domestic-api/website-leads/product-types');
      setWebProductTypes(res.data?.data || []);
    } catch {}
  }, []);

  const fetchWebAgents = useCallback(async () => {
    try {
      const res = await api.get('/domestic-api/admin/agents');
      setWebAgents(res.data?.data || []);
    } catch {}
  }, []);

  const fetchWebServiceStats = useCallback(async () => {
    try {
      // Aggregate website leads by productType using available distinct + count approach
      const res = await api.get('/domestic-api/website-leads?limit=1&page=1');
      // We'll get stats from a series of product-filtered count queries via product types
      const typesRes = await api.get('/domestic-api/website-leads/product-types');
      const types = typesRes.data?.data || [];
      const counts = await Promise.all(
        types.map(async (pt) => {
          const r = await api.get(`/domestic-api/website-leads?productType=${encodeURIComponent(pt)}&limit=1`);
          return { type: pt, total: r.data?.pagination?.total || 0 };
        })
      );
      setWebServiceStats(counts.sort((a, b) => b.total - a.total));
    } catch {}
  }, []);

  const handleAssignWebLead = useCallback(async (leadId, agentId, agentName) => {
    setWebAssigning(true);
    try {
      await api.post(`/domestic-api/website-leads/${leadId}/assign`, { agentId });
      toast.success(`Lead assigned to ${agentName}.`);
      setWebAssignModal(null);
      fetchWebLeads(webLeadsPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign lead.');
    } finally { setWebAssigning(false); }
  }, [fetchWebLeads, webLeadsPage]);

  const handleBulkAssign = useCallback(async (agentId, agentName) => {
    const leadIds = [...webSelectedIds];
    if (leadIds.length === 0) return;
    setWebAssigning(true);
    try {
      const res = await api.post('/domestic-api/website-leads/bulk-assign', { leadIds, agentId });
      toast.success(res.data.message);
      setWebSelectedIds(new Set());
      setBulkAssignModal(false);
      fetchWebLeads(webLeadsPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk assign failed.');
    } finally { setWebAssigning(false); }
  }, [webSelectedIds, fetchWebLeads, webLeadsPage]);

  // ── Agent Tracker ────────────────────────────────────────────────────────
  const fetchTrackerAgents = useCallback(async () => {
    setTrackerLoading(true);
    try {
      const res = await api.get('/domestic-api/admin/agents');
      setTrackerAgents(res.data?.data || []);
    } catch { toast.error('Failed to load agents.'); }
    finally { setTrackerLoading(false); }
  }, []);

  const fetchManualLeads = useCallback(async () => {
    setManualLeadsLoading(true);
    try {
      const res = await api.get('/domestic-api/leads?isManual=true&limit=100');
      setManualLeads(res.data?.data || []);
    } catch { toast.error('Failed to load manual leads.'); }
    finally { setManualLeadsLoading(false); }
  }, []);

  const fetchReport = useCallback(async (range, customFrom, customTo) => {
    setReportLoading(true);
    try {
      const toStr = istToday(); // today in IST
      const [y, mo] = toStr.split('-').map(Number);
      let from, to = toStr;
      if (range === 'today') {
        from = toStr;
      } else if (range === 'week') {
        from = istToday(6);
      } else if (range === 'month') {
        from = `${y}-${String(mo).padStart(2,'0')}-01`;
      } else if (range === '3month') {
        const d = new Date(Date.now() + IST_MS); d.setUTCMonth(d.getUTCMonth() - 2); d.setUTCDate(1);
        from = d.toISOString().slice(0, 10);
      } else if (range === 'year') {
        from = `${y}-01-01`;
      } else {
        from = customFrom || `${y}-${String(mo).padStart(2,'0')}-01`;
        to   = customTo   || toStr;
      }
      const res = await api.get(`/domestic-api/admin/reports?from=${from}&to=${to}`);
      setReportData(res.data);
      setReportLastUpdated(new Date());
    } catch { toast.error('Failed to load report.'); }
    finally { setReportLoading(false); }
  }, []);

  const handleSelectTrackAgent = useCallback(async (agent) => {
    setSelectedTrackAgent(agent);
    setTrackLeadsLoading(true);
    setTrackLeads([]);
    setTrackWorkedLeads([]);
    setTrackPoolLeads([]);
    try {
      const [webRes, workedRes, poolRes] = await Promise.all([
        api.get(`/domestic-api/website-leads?limit=10`).catch(() => ({ data: { data: [] } })),
        api.get(`/domestic-api/leads?agentId=${agent._id}&limit=10`),
        api.get(`/domestic-api/import-leads?agentId=${agent._id}&limit=10`).catch(() => ({ data: { data: [] } })),
      ]);
      // Filter web leads to only this agent's
      setTrackLeads((webRes.data?.data || []).filter(l => l.loadedBy?._id === agent._id || l.loadedBy === agent._id));
      setTrackWorkedLeads(workedRes.data?.data || []);
      setTrackPoolLeads(poolRes.data?.data || []);
    } catch (err) {
      toast.error('Failed to load agent activity.');
    } finally { setTrackLeadsLoading(false); }
  }, []);

  const handleImportUpload = useCallback(async (e) => {
    e.preventDefault();
    if (!importFile) { toast.error('Please select a file.'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      if (batchName.trim()) formData.append('batchName', batchName.trim());
      const res = await api.post('/domestic-api/import-leads/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(res.data.message);
      // Show warning if some mapped fields were not found in the Excel
      if (res.data.warning) {
        toast(res.data.warning, { icon: '⚠️', duration: 6000 });
      }
      setLastImportResult({
        count:         res.data.count,
        skippedRows:   res.data.skippedRows || 0,
        foundFields:   res.data.foundFields || [],
        missingFields: res.data.missingFields || [],
        batchName:     res.data.batchName,
      });
      setImportFile(null);
      setBatchName('');
      fetchBatches();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed.');
    } finally { setUploading(false); }
  }, [importFile, batchName, fetchBatches]);

  const handleShare = useCallback(async () => {
    if (!shareModal || selectedAdmins.length === 0) {
      toast.error('Select at least one admin.'); return;
    }
    setSharing(true);
    try {
      const res = await api.post('/domestic-api/import-leads/share', {
        batchId:  shareModal.batchId,
        adminIds: selectedAdmins,
      });
      toast.success(res.data.message);
      setShareModal(null);
      setSelectedAdmins([]);
      fetchBatches();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to share.');
    } finally { setSharing(false); }
  }, [shareModal, selectedAdmins, fetchBatches]);

  const handleBatchAssign = useCallback(async () => {
    if (!batchAssignModal || !batchAssignAgentId) return;
    setBatchAssigning(true);
    try {
      const res = await api.post('/domestic-api/import-leads/assign-batch', {
        batchId: batchAssignModal.batchId,
        agentId: batchAssignAgentId,
      });
      toast.success(res.data.message);
      setBatchAssignModal(null);
      setBatchAssignAgentId('');
      fetchBatches();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Batch assign failed.');
    } finally { setBatchAssigning(false); }
  }, [batchAssignModal, batchAssignAgentId, fetchBatches]);

  useEffect(() => {
    if (superTab === 'users')     fetchUsers();
    if (superTab === 'apikey')    fetchApiKey();
    if (superTab === 'import')    { fetchBatches(); fetchAdmins(); }
    if (superTab === 'web_leads') { fetchWebLeads(1); fetchWebProductTypes(); fetchWebAgents(); fetchWebServiceStats(); }
    if (superTab === 'tracker')      { fetchTrackerAgents(); setSelectedTrackAgent(null); }
    if (superTab === 'reports')      { fetchReport('month', '', ''); }
    if (superTab === 'manual_leads') { fetchManualLeads(); }
    if (superTab === 'agent_performance') { /* uses DomAdminDashboard internally */ }
  }, [superTab, fetchUsers, fetchApiKey, fetchBatches, fetchAdmins, fetchWebLeads, fetchWebProductTypes, fetchWebAgents, fetchWebServiceStats, fetchTrackerAgents, fetchReport, fetchManualLeads]);

  // Auto-refresh tracker every 30 seconds for live monitoring
  useEffect(() => {
    if (superTab !== 'tracker') return;
    const timer = setInterval(fetchTrackerAgents, 30000);
    return () => clearInterval(timer);
  }, [superTab, fetchTrackerAgents]);

  // Auto-refresh reports when the tab is active
  useEffect(() => {
    if (superTab !== 'reports') return;
    const interval = reportRange === 'today' ? 30000 : 120000;
    const timer = setInterval(() => fetchReport(reportRange, reportFrom, reportTo), interval);
    return () => clearInterval(timer);
  }, [superTab, reportRange, reportFrom, reportTo, fetchReport]);

  const handleToggleActive = async (u) => {
    try {
      await api.patch(`/domestic-api/admin/users/${u._id}`, { isActive: !u.isActive });
      toast.success(`${u.name} ${u.isActive ? 'deactivated' : 'activated'}.`);
      fetchUsers();
    } catch { toast.error('Failed to update user.'); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id, batchId } = deleteConfirm;
    try {
      if (type === 'user')           await api.delete(`/domestic-api/admin/users/${id}`);
      else if (type === 'lead')      await api.delete(`/domestic-api/admin/leads/${id}`);
      else if (type === 'batch')     await api.delete(`/domestic-api/admin/import-batch/${batchId}`);
      else if (type === 'import_lead') await api.delete(`/domestic-api/admin/imported-lead/${id}`);
      toast.success(deleteConfirm.successMsg || 'Deleted successfully.');
      setDeleteConfirm(null);
      if (type === 'user')              fetchUsers();
      else if (type === 'batch' || type === 'import_lead') fetchBatches();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed.');
    }
  };

  /* ── Main: renders Admin Dashboard + super-admin header + tab nav ── */
  /* ── Sidebar nav config ── */
  const SIDEBAR_GROUPS = [
    {
      key: 'overview', label: null, collapsible: false,
      items: [{ key: 'main', Icon: BarChart2, label: 'Allocation Dashboard', sub: 'System overview' }],
    },
    {
      key: 'meta', label: 'META ALLOCATION', collapsible: false,
      items: [{ key: 'web_leads', Icon: Globe, label: 'Meta Allocation', sub: 'Website + Meta leads' }],
    },
    {
      key: 'agents', label: 'AGENT ALLOCATION', collapsible: true,
      items: [
        { key: 'tracker',          Icon: Activity,  label: 'Track Agents',      sub: 'Live monitoring'         },
        { key: 'users',            Icon: Users,     label: 'No. of Agents',     sub: 'Agents & admins'        },
        { key: 'agent_performance',Icon: BarChart2, label: 'Agent Allocation', sub: 'Rankings & stats'        },
      ],
    },
    {
      key: 'data', label: 'IMPORT ALLOCATION', collapsible: false,
      items: [{ key: 'import', Icon: Upload, label: 'Import Allocation', sub: 'Upload Excel & share batches' }],
    },
    {
      key: 'partners', label: 'CHANNEL PARTNERS', collapsible: false,
      items: [{ key: 'manual_leads', Icon: Briefcase, label: 'Manual Leads', sub: 'Agent-entered cases' }],
    },
    {
      key: 'system', label: 'REPORTS & SYSTEM', collapsible: false,
      items: [
        { key: 'reports', Icon: TrendingUp, label: 'Reports & Analytics', sub: 'Daily \u00b7 Monthly \u00b7 Yearly' },
        { key: 'apikey',  Icon: Key,        label: 'Integration',         sub: 'API key setup'                   },
      ],
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ════ SIDEBAR ════ */}
      <aside className={`${sidebarOpen ? 'w-[230px]' : 'w-14'} flex-shrink-0 flex flex-col h-screen bg-white border-r border-gray-200 shadow-sm transition-all duration-300 overflow-hidden`}>

        {/* Brand strip */}
        <div className="bg-[#065F36] px-3 py-3 flex-shrink-0 flex items-center gap-2">
          {sidebarOpen ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MCB" className="h-4 w-auto object-contain brightness-0 invert" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-[12px] leading-none">MyCashBridge</p>
                <p className="text-white/60 text-[9px] font-medium tracking-wider uppercase mt-0.5">Super Admin Portal</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
              <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MCB" className="h-4 w-auto object-contain brightness-0 invert" />
            </div>
          )}
          <button onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-sm hover:bg-gray-100 active:scale-95 transition-all">
            {sidebarOpen ? <ChevronLeft className="h-4 w-4 text-[#065F36]" /> : <ChevronRight className="h-4 w-4 text-[#065F36]" />}
          </button>
        </div>

        {/* User card */}
        <div className="px-2 py-2 border-b border-gray-100 flex-shrink-0">
          <div className={`flex items-center ${sidebarOpen ? 'gap-2 px-2' : 'justify-center px-1'} py-2 rounded-xl bg-[#f0faf5] border border-[#d1fae5]`}>
            <div className="relative flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-[#065F36] flex items-center justify-center font-bold text-white text-xs shadow-sm">
                {user.name?.charAt(0)?.toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-[1.5px] border-white" />
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 font-semibold text-[11px] leading-none truncate">{user.name}</p>
                <p className="text-[#065F36]/70 text-[9px] font-medium mt-1">Super Admin</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 pt-2 pb-2 overflow-y-auto min-h-0">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.key} className="mb-0.5">
              {sidebarOpen && group.label && (
                group.collapsible ? (
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 mt-2 mb-0.5 group">
                    <p className="text-gray-400 text-[9px] font-extrabold uppercase tracking-[0.14em] flex-1 text-left group-hover:text-gray-600 transition-colors">{group.label}</p>
                    <ChevronDown className={`h-2.5 w-2.5 text-gray-300 group-hover:text-gray-500 transition-all flex-shrink-0 ${
                      openGroups.has(group.key) ? 'rotate-0' : '-rotate-90'
                    }`} />
                  </button>
                ) : (
                  <div className="px-2 py-1.5 mt-2 mb-0.5">
                    <p className="text-gray-400 text-[9px] font-extrabold uppercase tracking-[0.14em]">{group.label}</p>
                  </div>
                )
              )}
              {(!group.collapsible || openGroups.has(group.key) || !sidebarOpen) && (
                <div className="space-y-px">
                  {group.items.map(({ key, Icon, label, sub }) => {
                    const isActive = superTab === key;
                    return (
                      <button key={key} onClick={() => setSuperTab(key)} title={!sidebarOpen ? label : undefined}
                        className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0 py-2.5'} py-2 rounded-lg transition-all duration-100 text-left relative group ${
                          isActive
                            ? 'bg-[#e8f5ed] text-[#065F36]'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                        }`}>
                        {isActive && sidebarOpen && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#065F36] rounded-r-full" />
                        )}
                        <div className="relative flex-shrink-0">
                          <Icon className={`h-[14px] w-[14px] ${
                            isActive ? 'text-[#065F36]' : 'text-gray-400 group-hover:text-gray-600'
                          }`} />
                          {isActive && !sidebarOpen && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-[#065F36] rounded-full" />}
                        </div>
                        {sidebarOpen && (
                          <div className="flex-1 min-w-0">
                            <p className={`text-[12px] font-semibold leading-none ${
                              isActive ? 'text-[#065F36]' : 'text-gray-600 group-hover:text-gray-800'
                            }`}>{label}</p>
                            <p className={`text-[10px] mt-1 truncate ${
                              isActive ? 'text-[#065F36]/60' : 'text-gray-400'
                            }`}>{sub}</p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Sign out */}
        <div className="flex-shrink-0 px-2 pb-3 pt-2 border-t border-gray-100">
          <button onClick={logout} title={!sidebarOpen ? 'Sign out' : undefined}
            className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0'} py-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all text-left`}>
            <LogOut className="h-[14px] w-[14px] flex-shrink-0" />
            {sidebarOpen && <span className="text-[12px] font-semibold">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ════ CONTENT ════ */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {/* Dashboard */}
        {superTab === 'main' && <DomAdminDashboard />}

        {/* Agent Performance */}
        {superTab === 'agent_performance' && <DomAdminDashboard initialTab="agents" />}

  {superTab === 'reports' && (() => {
    const PRESETS = [
      { key: 'today',  label: 'Today'     },
      { key: 'week',   label: 'This Week' },
      { key: 'month',  label: 'This Month'},
      { key: '3month', label: '3 Months'  },
      { key: 'year',   label: 'This Year' },
      { key: 'custom', label: 'Custom'    },
    ];

    const s   = reportData?.summary;
    const brk = reportData?.breakdown;
    const trend        = reportData?.trend?.domLeads || [];
    const hourlyTrend  = reportData?.trend?.hourly   || [];

    const maxTrend  = trend.length       ? Math.max(...trend.map(d => d.total), 1)        : 1;
    const maxHourly = hourlyTrend.length ? Math.max(...hourlyTrend.map(d => d.total), 1)  : 1;

    const fmtHour = (h) => {
      if (h === 0)  return '12am';
      if (h < 12)   return `${h}am`;
      if (h === 12) return '12pm';
      return `${h - 12}pm`;
    };

    const OUTCOME_LABEL = {
      interested: 'Interested', not_interested: 'Not Interested', callback: 'Callback',
      not_reachable: 'Not Reachable', not_answering: 'Not Answering',
      wrong_number: 'Wrong Number', other: 'Other', none: 'No Outcome', '': 'No Outcome',
    };
    const OUTCOME_COLOR = {
      interested: 'bg-emerald-500', not_interested: 'bg-red-400', callback: 'bg-amber-400',
      not_reachable: 'bg-orange-400', not_answering: 'bg-slate-400',
      wrong_number: 'bg-gray-400', other: 'bg-purple-400', none: 'bg-gray-300', '': 'bg-gray-300',
    };

    const maxOutcome = brk?.outcome?.length ? Math.max(...brk.outcome.map(o => o.count), 1) : 1;
    const maxProduct = brk?.product?.length ? Math.max(...brk.product.map(p => p.count), 1) : 1;

    const fmtProd = (s) => (s || 'other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const exportCSV = () => {
      if (!reportData) return;
      const rows = [
        ['Report', 'Reports & Analytics Export'],
        ['Range', `${reportData.range?.from?.split('T')[0] || ''} to ${reportData.range?.to?.split('T')[0] || ''}`],
        [],
        ['Metric', 'Value'],
        ['Meta Allocation (Website)', s?.websiteLeads?.total],
        ['Disposition Allocation', s?.workedLeads?.total],
        ['Completed', s?.workedLeads?.completed],
        ['Pending', s?.workedLeads?.pending],
        ['Rejected', s?.workedLeads?.rejected],
        ['Interested', s?.workedLeads?.interested],
        ['Callback', s?.workedLeads?.callback],
        ['Pool Imported', s?.poolLeads?.total],
        ['Conversion Rate', `${s?.conversionRate}%`],
        ['Interest Rate', `${s?.interestRate}%`],
        [],
        ['Date', 'Disposition Allocation', 'Completed'],
        ...trend.map(d => [d.date, d.total, d.completed]),
        [],
        ['Agent', 'Cases', 'Completed', 'Interested'],
        ...(reportData.agents || []).map(a => [a.agent?.name || '—', a.total, a.completed, a.interested]),
      ];
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href = url; a.download = 'lms-report.csv'; a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Green breadcrumb bar */}
        <div className="bg-[#065F36] text-white px-6 py-2 flex items-center justify-between border-b border-[#054A2E]">
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3 w-3 text-white/60" />
            <button onClick={() => setSuperTab('main')} className="text-white/60 hover:text-white transition-colors">Super Admin Portal</button>
            <span className="text-white/30">›</span>
            <span className="text-white font-semibold flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Reports & Analytics</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors">
            <LogOut className="h-3 w-3" /> Logout
          </button>
        </div>

        {/* White sticky header */}
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100">
          <div className="px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button onClick={() => setSuperTab('main')}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-[#065F36] border border-gray-200 hover:border-[#065F36]/30 rounded-xl px-3 py-2 transition-all">
                <ChevronLeft className="h-4 w-4" /> Dashboard
              </button>
              <div className="border-l border-gray-200 pl-3 flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 rounded-lg"><TrendingUp className="h-4 w-4 text-emerald-600" /></div>
                <div>
                  <h1 className="text-gray-800 font-bold text-sm">Reports & Analytics</h1>
                  <p className="text-gray-400 text-xs">Daily · Monthly · Yearly performance insights</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportCSV} disabled={!reportData}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 disabled:opacity-40 transition-all">
                <Download className="h-4 w-4" /> Export CSV
              </button>
              <button onClick={() => fetchReport(reportRange, reportFrom, reportTo)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 transition-all">
                <RefreshCw className={`h-4 w-4 ${reportLoading ? 'animate-spin' : ''}`} />
              </button>
              {/* Live indicator */}
              {reportLastUpdated && (
                <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${
                  reportRange === 'today' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${reportRange === 'today' ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                  {reportRange === 'today' ? '🔴 LIVE · ' : ''}
                  Updated {Math.round((new Date() - reportLastUpdated) / 60000) < 1 ? 'just now' : `${Math.round((new Date() - reportLastUpdated) / 60000)}m ago`}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="px-6 py-5 space-y-6">

          {/* ── Date Range Controls ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-600 mr-1">Period:</span>
              {PRESETS.map(p => (
                <button key={p.key}
                  onClick={() => { setReportRange(p.key); if (p.key !== 'custom') fetchReport(p.key, '', ''); }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    reportRange === p.key
                      ? 'bg-[#065F36] text-white border-[#065F36] shadow-sm'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#065F36]/40 hover:text-[#065F36]'
                  }`}>
                  {p.label}
                </button>
              ))}
              {reportRange === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#065F36]" />
                  <span className="text-gray-400 text-sm">to</span>
                  <input type="date" value={reportTo} onChange={e => {
                    setReportTo(e.target.value);
                    if (reportFrom && e.target.value) fetchReport('custom', reportFrom, e.target.value);
                  }}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#065F36]" />
                  <button onClick={() => fetchReport('custom', reportFrom, reportTo)}
                    disabled={!reportFrom || !reportTo}
                    className="px-4 py-2 bg-[#065F36] text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-[#054A2E] transition-colors">
                    Apply
                  </button>
                </div>
              )}
              {reportData?.range && (
                <span className="ml-auto text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                  {new Date(reportData.range.from).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                  {' — '}
                  {new Date(reportData.range.to).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                </span>
              )}
            </div>
          </div>

          {reportLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-12 h-12 border-4 border-gray-100 border-t-[#065F36] rounded-full animate-spin" />
              <p className="text-gray-400 text-sm font-medium">Crunching numbers…</p>
            </div>
          ) : !reportData ? null : (
            <>
              {/* ── KPI Cards ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Meta Allocation',  val: s?.websiteLeads?.total,    icon: Globe,       bg: 'from-teal-500 to-cyan-600',      sub: `${s?.websiteLeads?.new} new` },
                  { label: 'Disposition Allocation', val: s?.workedLeads?.total,     icon: Briefcase,   bg: 'from-[#065F36] to-[#00A651]',   sub: `${s?.workedLeads?.pending} pending` },
                  { label: 'Completed',         val: s?.workedLeads?.completed, icon: CheckCircle2,bg: 'from-emerald-500 to-green-600',  sub: `${s?.conversionRate}% conv.` },
                  { label: 'Interested',        val: s?.workedLeads?.interested,icon: Zap,         bg: 'from-amber-400 to-orange-500',   sub: `${s?.interestRate}% interest` },
                  { label: 'Callbacks',         val: s?.workedLeads?.callback,  icon: Activity,    bg: 'from-orange-400 to-amber-500',   sub: 'follow-ups' },
                  { label: 'Pool Imported',     val: s?.poolLeads?.total,       icon: Database,    bg: 'from-violet-500 to-purple-600',  sub: 'data pool' },
                ].map(({ label, val, icon: Icon, bg, sub }) => (
                  <div key={label} className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${bg} text-white shadow-lg`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-xl"><Icon className="h-5 w-5" /></div>
                    </div>
                    <p className="text-3xl font-black">{val ?? '—'}</p>
                    <p className="text-white/80 text-xs font-semibold mt-1">{label}</p>
                    <p className="text-white/60 text-xs mt-0.5">{sub}</p>
                    <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  </div>
                ))}
              </div>

              {/* ── Conversion gauges ── */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Conversion Rate',  val: s?.conversionRate,  color: 'bg-emerald-500', text: 'text-emerald-600',  desc: 'Completed / Total Worked' },
                  { label: 'Interest Rate',     val: s?.interestRate,    color: 'bg-amber-400',   text: 'text-amber-600',    desc: 'Interested / Total Worked' },
                ].map(g => (
                  <div key={g.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-bold text-gray-800">{g.label}</p>
                        <p className="text-xs text-gray-400">{g.desc}</p>
                      </div>
                      <span className={`text-4xl font-black ${g.text}`}>{g.val}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-1000 ${g.color}`}
                        style={{ width: `${Math.min(g.val, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                      <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Quick Insights ── */}
              {(() => {
                const insights = [];
                if (s?.workedLeads?.total > 0) {
                  if (s.conversionRate >= 60) insights.push({ icon: '🚀', color: 'bg-emerald-50 border-emerald-200 text-emerald-800', text: `Excellent! ${s.conversionRate}% conversion rate — well above average.` });
                  else if (s.conversionRate >= 30) insights.push({ icon: '👍', color: 'bg-blue-50 border-blue-200 text-blue-800', text: `Good conversion rate of ${s.conversionRate}%. Keep pushing to hit 50%+.` });
                  else insights.push({ icon: '⚠️', color: 'bg-amber-50 border-amber-200 text-amber-800', text: `Low conversion rate (${s.conversionRate}%). Review agent scripts and follow-ups.` });
                }
                if (s?.workedLeads?.callback > 0) insights.push({ icon: '📞', color: 'bg-amber-50 border-amber-200 text-amber-800', text: `${s.workedLeads.callback} callback${s.workedLeads.callback > 1 ? 's' : ''} pending — ensure agents follow up today.` });
                if (s?.workedLeads?.notAnswering > 0) insights.push({ icon: '🔕', color: 'bg-slate-50 border-slate-200 text-slate-700', text: `${s.workedLeads.notAnswering} leads not answering — retry during peak hours.` });
                if (hourlyTrend.length) {
                  const workHours = hourlyTrend.filter(h => h.hour >= 9 && h.hour < 18);
                  const peak = workHours.length ? workHours.reduce((a, b) => b.total > a.total ? b : a, workHours[0]) : null;
                  if (peak && peak.total > 0) insights.push({ icon: '⏰', color: 'bg-violet-50 border-violet-200 text-violet-800', text: `Peak productivity within working hours: ${fmtHour(peak.hour)} (${peak.total} cases). Schedule important calls then.` });
                  const offHoursTotal = hourlyTrend.filter(h => (h.hour < 9 || h.hour >= 18) && h.total > 0).reduce((s, h) => s + h.total, 0);
                  if (offHoursTotal > 0) insights.push({ icon: '🌙', color: 'bg-orange-50 border-orange-200 text-orange-800', text: `${offHoursTotal} cases recorded outside 9am–6pm IST working hours.` });
                }
                if (s?.websiteLeads?.new > 0) insights.push({ icon: '🌐', color: 'bg-teal-50 border-teal-200 text-teal-800', text: `${s.websiteLeads.new} unclaimed website lead${s.websiteLeads.new > 1 ? 's' : ''} waiting — assign to agents now.` });
                if (insights.length === 0) return null;
                return (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-lg">💡</span>
                      <h2 className="font-bold text-gray-800">Smart Insights</h2>
                      <span className="text-xs text-gray-400 ml-1">— Auto-generated from your data</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {insights.map((ins, i) => (
                        <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${ins.color}`}>
                          <span className="text-xl flex-shrink-0 mt-0.5">{ins.icon}</span>
                          <p className="text-sm font-medium leading-snug">{ins.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Trend Chart ── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="font-bold text-gray-800">{trendView === 'daily' ? 'Daily Activity Trend' : 'Hourly Activity Breakdown'}</h2>
                    <p className="text-xs text-gray-400">
                      {trendView === 'daily' ? 'Worked cases per day in selected period' : 'Cases by hour of day (0–23h) · best calling windows'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 text-xs text-gray-500 mr-2">
                      <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[#065F36]" /> Worked Cases</div>
                      <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-400" /> Completed</div>
                      <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-teal-300 border border-teal-400" /> Meta Leads</div>
                      {trendView === 'hourly' && <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-400" /> Interested</div>}
                    </div>
                    {/* Toggle */}
                    <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
                      <button onClick={() => setTrendView('daily')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${trendView === 'daily' ? 'bg-white text-[#065F36] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        Daily
                      </button>
                      <button onClick={() => setTrendView('hourly')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${trendView === 'hourly' ? 'bg-white text-[#065F36] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        Hourly
                      </button>
                    </div>
                  </div>
                </div>

                {trendView === 'daily' ? (
                  trend.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-300">
                      <BarChart2 className="h-16 w-16" />
                      <p className="text-sm text-gray-400">No activity in this period</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="flex items-end gap-1.5 pb-6 pt-2" style={{ minWidth: trend.length > 20 ? `${trend.length * 32}px` : '100%', height: '200px' }}>
                        {(() => {
                          const webTrend = reportData?.trend?.websiteLeads || [];
                          const maxCombined = Math.max(
                            trend.length ? Math.max(...trend.map(d => d.total), 1) : 1,
                            1
                          );
                          return trend.map((d, i) => {
                            const webDay = webTrend.find(w => w.date === d.date);
                            const barH = Math.max((d.total / maxCombined) * 140, 4);
                            const compH = d.total > 0 ? Math.round((d.completed / d.total) * barH) : 0;
                            const label = new Date(d.date + 'T12:00:00+05:30').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
                            return (
                              <div key={i} className="flex flex-col items-center gap-1 flex-1 group min-w-[28px]">
                                <div className="flex items-center gap-0.5 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-[10px] font-bold text-[#065F36]">{d.total}</span>
                                  {webDay?.count > 0 && <span className="text-[9px] text-teal-600 font-bold">+{webDay.count}</span>}
                                </div>
                                <div className="w-full flex flex-col justify-end rounded-t-md overflow-hidden cursor-pointer" style={{ height: `${barH}px`, background: '#E8FFF5' }}>
                                  <div style={{ height: `${compH}px`, background: '#10B981' }} />
                                  <div style={{ flex: 1, background: '#065F36' }} />
                                </div>
                                {webDay?.count > 0 && (
                                  <div className="w-full h-1.5 rounded-full bg-teal-300 opacity-70" title={`${webDay.count} website leads`} />
                                )}
                                <span className="text-gray-400 whitespace-nowrap" style={{ fontSize: '9px', transform: 'rotate(-35deg)', transformOrigin: 'top left', marginLeft: '8px', marginTop: '2px' }}>{label}</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )
                ) : (
                  /* Hourly chart — all 24 hours with working-hours (9am–6pm) highlight */
                  <div>
                    {/* Working hours legend */}
                    <div className="flex items-center gap-3 mb-3 px-1">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-semibold">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 border border-emerald-400" />
                        Working hours: 9 AM – 6 PM IST
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl font-semibold">
                        <span className="w-2.5 h-2.5 rounded-sm bg-gray-200" />
                        Off hours
                      </div>
                    </div>
                    <div className="relative flex items-end gap-1 pb-6 pt-2" style={{ height: '200px' }}>
                      {/* Working hours background band */}
                      <div className="absolute inset-y-0 pointer-events-none rounded-lg"
                        style={{
                          left: `calc(${(9/24)*100}% + ${9*2}px)`,
                          width: `calc(${(9/24)*100}% - ${9*2}px)`,
                          background: 'rgba(16,185,129,0.06)',
                          border: '1px dashed rgba(16,185,129,0.3)',
                          top: '4px',
                          bottom: '22px',
                        }} />
                      {hourlyTrend.map((d) => {
                        const isWorkHour = d.hour >= 9 && d.hour < 18;
                        const barH  = Math.max((d.total / maxHourly) * 150, d.total > 0 ? 4 : 0);
                        const compH = d.total > 0 ? Math.round((d.completed / d.total) * barH) : 0;
                        const intH  = d.total > 0 ? Math.round((d.interested / d.total) * barH) : 0;
                        const isPeak = d.total === maxHourly && maxHourly > 0;
                        return (
                          <div key={d.hour} className="relative flex flex-col items-center gap-1 flex-1 group min-w-0 z-10">
                            <span className="text-xs font-bold text-[#065F36] opacity-0 group-hover:opacity-100 transition-opacity mb-0.5 absolute -top-5 whitespace-nowrap">{d.total || ''}</span>
                            <div className={`w-full flex flex-col justify-end rounded-t-md overflow-hidden cursor-pointer transition-all ${isPeak ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
                              style={{
                                height: `${barH}px`,
                                minHeight: d.total > 0 ? '4px' : '2px',
                                background: isWorkHour ? (d.total > 0 ? '#D1FAE5' : '#ECFDF5') : (d.total > 0 ? '#E8FFF5' : '#F9FAFB'),
                              }}>
                              <div style={{ height: `${intH}px`,  background: '#F59E0B' }} />
                              <div style={{ height: `${compH}px`, background: '#10B981' }} />
                              <div style={{ flex: 1, background: isWorkHour ? (d.total > 0 ? '#059669' : '#D1FAE5') : (d.total > 0 ? '#065F36' : '#E5E7EB') }} />
                            </div>
                            <span className={`font-medium ${isWorkHour ? 'text-emerald-600' : 'text-gray-400'}`} style={{ fontSize: '8px' }}>{fmtHour(d.hour)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Peak hour highlight — only within working hours */}
                    {maxHourly > 0 && (() => {
                      const workHours = hourlyTrend.filter(h => h.hour >= 9 && h.hour < 18);
                      const peak = workHours.length
                        ? workHours.reduce((a, b) => b.total > a.total ? b : a, workHours[0])
                        : hourlyTrend.reduce((a, b) => b.total > a.total ? b : a, { hour: 0, total: 0 });
                      const offPeak = hourlyTrend.filter(h => (h.hour < 9 || h.hour >= 18) && h.total > 0);
                      const offPeakTotal = offPeak.reduce((s, h) => s + h.total, 0);
                      const workTotal = workHours.reduce((s, h) => s + h.total, 0);
                      return (
                        <div className="space-y-2 mt-2 pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-200 flex-shrink-0" />
                              <span className="text-gray-600 font-semibold">Peak (work hrs):</span>
                              <span className="font-black text-amber-600">{fmtHour(peak.hour)} — {peak.total} cases</span>
                            </div>
                            {offPeakTotal > 0 && (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="w-2.5 h-2.5 rounded-full bg-orange-300 flex-shrink-0" />
                                <span className="text-gray-500 font-semibold">Off-hours activity:</span>
                                <span className="font-bold text-orange-600">{offPeakTotal} cases (outside 9am–6pm)</span>
                              </div>
                            )}
                            <div className="ml-auto text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl font-semibold">
                              ✅ Work hrs: {workTotal} · Off hrs: {offPeakTotal}
                            </div>
                          </div>
                          {peak.total > 0 && (
                            <div className="text-xs text-gray-500 bg-amber-50 border border-amber-100 text-amber-700 px-4 py-2.5 rounded-xl font-medium">
                              💡 Best calling window within working hours: <strong>{fmtHour(peak.hour)} – {fmtHour(Math.min(peak.hour + 2, 18))}</strong> IST — schedule high-priority calls then.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* ── Breakdowns ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Call Outcomes */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <div className="p-2 bg-amber-100 rounded-xl"><Activity className="h-4 w-4 text-amber-600" /></div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-sm">Call Outcomes</h3>
                      <p className="text-xs text-gray-400">How agents disposed calls</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    {(brk?.outcome || []).sort((a,b) => b.count - a.count).map(o => (
                      <div key={o._id}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-gray-700">{OUTCOME_LABEL[o._id] || o._id || 'No Outcome'}</span>
                          <span className="font-bold text-gray-500">{o.count}</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${OUTCOME_COLOR[o._id] || 'bg-gray-400'}`}
                            style={{ width: `${(o.count / maxOutcome) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                    {(!brk?.outcome?.length) && <p className="text-gray-400 text-sm text-center py-4">No data</p>}
                  </div>
                </div>

                {/* Product Types */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-xl"><Briefcase className="h-4 w-4 text-blue-600" /></div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-sm">Product Mix</h3>
                      <p className="text-xs text-gray-400">Cases by loan / product type</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    {(brk?.product || []).map((p, i) => {
                      const colors = ['bg-blue-500','bg-indigo-500','bg-violet-500','bg-purple-500','bg-cyan-500','bg-teal-500','bg-emerald-500','bg-amber-500','bg-orange-500','bg-red-400','bg-pink-500','bg-gray-400'];
                      return (
                        <div key={p._id}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-gray-700">{fmtProd(p._id)}</span>
                            <span className="font-bold text-gray-500">{p.count}</span>
                          </div>
                          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${colors[i % colors.length]}`}
                              style={{ width: `${(p.count / maxProduct) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {(!brk?.product?.length) && <p className="text-gray-400 text-sm text-center py-4">No data</p>}
                  </div>
                </div>

                {/* Lead Source */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <div className="p-2 bg-teal-100 rounded-xl"><Globe className="h-4 w-4 text-teal-600" /></div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-sm">Lead Source</h3>
                      <p className="text-xs text-gray-400">Website vs Imported vs Manual</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    {(brk?.source || []).map(src => {
                      const total = (brk?.source || []).reduce((a, b) => a + b.count, 0) || 1;
                      const pct   = Math.round((src.count / total) * 100);
                      const cfg   = {
                        Website:  { color: 'bg-teal-500',   icon: '🌐' },
                        Imported: { color: 'bg-violet-500', icon: '📊' },
                        Manual:   { color: 'bg-gray-400',   icon: '✍️' },
                      }[src._id] || { color: 'bg-gray-300', icon: '📋' };
                      return (
                        <div key={src._id}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-gray-700">{cfg.icon} {src._id}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-black text-gray-800">{src.count}</span>
                              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{pct}%</span>
                            </div>
                          </div>
                          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${cfg.color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {(!brk?.source?.length) && (
                      <div className="py-8 text-center">
                        <p className="text-gray-400 text-sm">No worked cases in this period.</p>
                      </div>
                    )}

                    {/* Website leads funnel */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Website Funnel</p>
                      {[
                    { label: 'Meta Allocation',  val: s?.websiteLeads?.total,     color: 'bg-teal-200' },
                        { label: 'Loaded',     val: s?.websiteLeads?.loaded,    color: 'bg-teal-400' },
                        { label: 'Completed',  val: s?.websiteLeads?.completed, color: 'bg-teal-600' },
                      ].map(f => (
                        <div key={f.label} className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-gray-500 w-18">{f.label}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${f.color}`}
                              style={{ width: s?.websiteLeads?.total > 0 ? `${(f.val / s.websiteLeads.total) * 100}%` : '0%' }} />
                          </div>
                          <span className="text-xs font-bold text-gray-600 w-6 text-right">{f.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Agent Leaderboard ── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-sm">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-800">Agent Leaderboard — Selected Period</h2>
                    <p className="text-xs text-gray-400">Ranked by cases worked in this date range</p>
                  </div>
                </div>
                {!reportData.agents?.length ? (
                  <p className="text-center text-gray-400 text-sm py-10">No agent activity in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                          <th className="pl-6 pr-3 py-3.5 text-left">Rank</th>
                          <th className="px-3 py-3.5 text-left">Agent</th>
                          <th className="px-3 py-3.5 text-center">Cases</th>
                          <th className="px-3 py-3.5 text-center">Completed</th>
                          <th className="px-3 py-3.5 text-center">Interested</th>
                          <th className="px-3 pr-6 py-3.5 text-center">Conv. Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {reportData.agents.map((a, i) => {
                          const conv = a.total > 0 ? Math.round((a.completed / a.total) * 100) : 0;
                          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                          const statusKey = a.agent?.agentStatus || 'available';
                          return (
                            <tr key={a._id} className={`hover:bg-gray-50/70 transition-colors ${i < 3 ? 'bg-amber-50/30' : ''}`}>
                              <td className="pl-6 pr-3 py-4">
                                <span className="text-lg">{medal || <span className="text-xs font-bold text-gray-400">#{i+1}</span>}</span>
                              </td>
                              <td className="px-3 py-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm ${
                                    i === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                                    i === 1 ? 'bg-gradient-to-br from-slate-400 to-gray-500' :
                                    i === 2 ? 'bg-gradient-to-br from-orange-600 to-amber-700' :
                                    'bg-gradient-to-br from-[#065F36] to-[#00A651]'
                                  }`}>
                                    {a.agent?.name?.charAt(0)?.toUpperCase() || '?'}
                                  </div>
                                  <div>
                                    <p className="font-bold text-gray-800">{a.agent?.name || 'Unknown'}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                      statusKey === 'break'       ? 'bg-amber-100 text-amber-700' :
                                      statusKey === 'unavailable' ? 'bg-red-100 text-red-600' :
                                                                     'bg-emerald-100 text-emerald-700'
                                    }`}>
                                      {statusKey === 'break' ? '☕ Break' : statusKey === 'unavailable' ? '🔴 Off' : '✅ Live'}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-4 text-center">
                                <span className="text-xl font-black text-gray-800">{a.total}</span>
                              </td>
                              <td className="px-3 py-4 text-center">
                                <span className="inline-block bg-emerald-100 text-emerald-700 font-bold text-sm px-3 py-1 rounded-xl">{a.completed}</span>
                              </td>
                              <td className="px-3 py-4 text-center">
                                <span className="inline-block bg-amber-100 text-amber-700 font-bold text-sm px-3 py-1 rounded-xl">{a.interested}</span>
                              </td>
                              <td className="px-3 pr-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                                    <div className={`h-full rounded-full ${conv >= 50 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : conv >= 25 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gray-300'}`}
                                      style={{ width: `${conv}%` }} />
                                  </div>
                                  <span className={`text-xs font-black w-9 text-right ${conv >= 50 ? 'text-amber-600' : conv >= 25 ? 'text-emerald-600' : 'text-gray-400'}`}>{conv}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </>
          )}
        </main>
      </div>
    );
  })()}

  {superTab === 'users' && (() => {
    const activeCount   = users.filter(u => u.isActive).length;
    const agentCount    = users.filter(u => u.role === 'domagent').length;
    const adminCount    = users.filter(u => u.role === 'dom_admin' || u.role === 'dom_superadmin').length;

    return (
      <div className="min-h-screen bg-[#F0FFF8]">
        {/* Green breadcrumb bar */}
        <div className="bg-[#065F36] text-white px-6 py-2 flex items-center justify-between border-b border-[#054A2E]">
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3 w-3 text-white/60" />
            <button onClick={() => setSuperTab('main')} className="text-white/60 hover:text-white transition-colors">Super Admin Portal</button>
            <span className="text-white/30">›</span>
            <span className="text-white font-semibold flex items-center gap-1"><Users className="h-3 w-3" /> Manage Users</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors">
            <LogOut className="h-3 w-3" /> Logout
          </button>
        </div>
        {/* White sticky header */}
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100">
          <div className="px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button onClick={() => setSuperTab('main')}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-[#065F36] border border-gray-200 hover:border-[#065F36]/30 rounded-xl px-3 py-2 transition-all">
                <ChevronLeft className="h-4 w-4" /> Dashboard
              </button>
              <div className="border-l border-gray-200 pl-3 flex items-center gap-2">
                <div className="p-1.5 bg-[#E8FFF5] rounded-lg"><Users className="h-4 w-4 text-[#065F36]" /></div>
                <div>
                  <h1 className="text-gray-800 font-bold text-sm">Manage Users</h1>
                  <p className="text-gray-400 text-xs">Create and manage agents & admins</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 bg-[#065F36] text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-[#054A2E] shadow-sm transition-all">
                <UserPlus className="h-4 w-4" /> Add User
              </button>
            </div>
          </div>
        </header>

        <main className="px-6 py-5 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className="p-3 bg-[#E8FFF5] rounded-xl"><Users className="h-5 w-5 text-[#065F36]" /></div>
              <div>
                <p className="text-2xl font-black text-gray-800">{users.length}</p>
                <p className="text-xs text-gray-500 font-medium">Total Users</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-xl"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="text-2xl font-black text-gray-800">{activeCount}</p>
                <p className="text-xs text-gray-500 font-medium">Active Users</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className="p-3 bg-[#E8FFF5] rounded-xl"><Shield className="h-5 w-5 text-[#065F36]" /></div>
              <div>
                <p className="text-2xl font-black text-gray-800">{agentCount} <span className="text-sm font-normal text-gray-400">/ {adminCount} admin</span></p>
                <p className="text-xs text-gray-500 font-medium">Agents / Admins</p>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-gray-800">All Domestic LMS Users</h3>
                <p className="text-xs text-gray-400 mt-0.5">Manage agents, admins, and super admins</p>
              </div>
              <div className="flex items-center gap-2">
                {/* User search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Search name, email or role…" value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white w-52 focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]" />
                  {userSearch && <button onClick={() => setUserSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <button onClick={fetchUsers} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2">
                  <RefreshCw className="h-4 w-4" /> Refresh
                </button>
              </div>
            </div>

            {usersLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <span className="w-8 h-8 border-2 border-gray-200 border-t-[#065F36] rounded-full animate-spin mb-3" />
                <span className="text-sm">Loading users…</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-6 pr-3 py-3.5 text-left">User</th>
                      <th className="px-3 py-3.5 text-left">Email</th>
                      <th className="px-3 py-3.5 text-left">Role</th>
                      <th className="px-3 py-3.5 text-left">Status</th>
                      <th className="px-3 py-3.5 text-left">Last Login</th>
                      <th className="px-3 pr-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {users.filter(u => !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || (ROLE_LABELS[u.role] || u.role)?.toLowerCase().includes(userSearch.toLowerCase())).map((u) => (
                      <tr key={u._id} className="hover:bg-[#E8FFF5]/40 transition-colors">
                        <td className="pl-6 pr-3 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${
                              u.role === 'dom_superadmin' ? 'bg-gradient-to-br from-[#065F36] to-[#00874A]' :
                              u.role === 'dom_admin'      ? 'bg-gradient-to-br from-[#1E44A8] to-[#2255CC]' :
                                                            'bg-gradient-to-br from-[#1E44A8] to-[#4472CA]'
                            }`}>
                              {u.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{u.name}</p>
                              {u._id === user._id && <span className="text-xs text-[#065F36] font-medium">(You)</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-gray-500 text-xs">{u.email}</td>
                        <td className="px-3 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role]}`}>
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            u.isActive ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700 border border-red-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-red-400'}`} />
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-gray-400 text-xs">{fmtShort(u.lastLogin)}</td>
                        <td className="px-3 pr-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {u.role === 'domagent' && (
                              <button onClick={() => { setSaTransferAgent(u); setSaTransferTo(''); }}
                                className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg font-semibold border border-amber-200 transition-colors flex items-center gap-1">
                                <Send className="h-3 w-3" /> Transfer
                              </button>
                            )}
                            <button onClick={() => setEditUser(u)}
                              className="text-xs px-3 py-1.5 bg-[#E8FFF5] text-[#065F36] hover:bg-[#D1FAE5] rounded-lg font-semibold border border-[#D1FAE5] transition-colors">
                              Edit
                            </button>
                            {u._id !== user._id && (
                              <button onClick={() => handleToggleActive(u)}
                                className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors ${
                                  u.isActive
                                    ? 'bg-red-50 text-red-600 hover:bg-red-100 border-red-100'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100'
                                }`}>
                                {u.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                            {u._id !== user._id && (
                              <button
                                onClick={() => setDeleteConfirm({ type: 'user', id: u._id, name: u.name, successMsg: `User "${u.name}" deleted.` })}
                                className="text-xs px-2 py-1.5 rounded-lg font-semibold border bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100 border-gray-200 transition-colors"
                                title="Delete user permanently">
                                🗑
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-12 text-gray-400">{userSearch ? `No users match "${userSearch}"` : 'No users found.'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {showCreateModal && (
          <UserFormModal title="Create New User" onClose={() => setShowCreateModal(false)}
            onSaved={() => { setShowCreateModal(false); fetchUsers(); }} />
        )}
        {editUser && (
          <UserFormModal title="Edit User" user={editUser} onClose={() => setEditUser(null)}
            onSaved={() => { setEditUser(null); fetchUsers(); }} />
        )}

        {/* Transfer Leads Modal */}
        {saTransferAgent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold text-base">Transfer Leads</h3>
                  <p className="text-white/80 text-xs mt-0.5">Move leads from <strong>{saTransferAgent.name}</strong> to another agent</p>
                </div>
                <button onClick={() => setSaTransferAgent(null)} className="text-white/80 hover:text-white transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                {/* From agent */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">From Agent</p>
                  <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-400 to-red-500 flex items-center justify-center text-white font-black text-sm">
                      {saTransferAgent.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{saTransferAgent.name}</p>
                      <p className="text-xs text-gray-500">{saTransferAgent.email}</p>
                    </div>
                  </div>
                </div>
                {/* To agent */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Transfer To</p>
                  <select value={saTransferTo} onChange={e => setSaTransferTo(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400">
                    <option value="">— Select target agent —</option>
                    {users.filter(u => u.role === 'domagent' && u._id !== saTransferAgent._id && u.isActive).map(u => (
                      <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
                {/* Types */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">What to Transfer</p>
                  <div className="space-y-2">
                    {[
                      { key: 'website', label: 'Website / Meta Leads',            sub: 'Unworked website leads loaded by this agent',  color: 'teal'   },
                      { key: 'pool',    label: 'Pool / Imported Leads (Unworked)', sub: 'Imported data leads not yet called',           color: 'violet' },
                      { key: 'worked',  label: 'Worked Cases (DomLeads)',          sub: 'Already-filled lead forms — reassign ownership', color: 'orange' },
                    ].map(({ key, label, sub, color }) => (
                      <label key={key} className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                        saTransferTypes[key]
                          ? color === 'teal'   ? 'bg-teal-50 border-teal-300'
                          : color === 'violet' ? 'bg-violet-50 border-violet-300'
                          : 'bg-orange-50 border-orange-300'
                          : 'bg-gray-50 border-gray-200 opacity-70'
                      }`}>
                        <input type="checkbox" className="mt-0.5 accent-amber-500 w-4 h-4 flex-shrink-0"
                          checked={saTransferTypes[key]}
                          onChange={e => setSaTransferTypes(prev => ({ ...prev, [key]: e.target.checked }))} />
                        <div>
                          <p className="text-sm font-semibold text-gray-700">{label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Warning */}
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">This action is <strong>immediate and cannot be undone</strong>. The target agent will see these leads in their dashboard.</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
                <button onClick={() => setSaTransferAgent(null)}
                  className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors">
                  Cancel
                </button>
                <button onClick={handleSaTransfer} disabled={!saTransferTo || saTransferring}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-sm transition-colors">
                  {saTransferring
                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Transferring…</>
                    : <><Send className="h-4 w-4" /> Confirm Transfer</>}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  })()}

  {superTab === 'tracker' && (() => {
    const fmtDate = (d) => d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
    const fmtShortDt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric' }) : 'Never';
    const STATUS_DOT = {
      available:   { dot: 'bg-emerald-500', label: 'Available',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
      break:       { dot: 'bg-amber-400',   label: 'On Break',    cls: 'bg-amber-100 text-amber-700 border-amber-300' },
      unavailable: { dot: 'bg-red-500',     label: 'Unavailable', cls: 'bg-red-100 text-red-700 border-red-300' },
    };

    // Aggregate totals across all agents
    const totalMeta       = trackerAgents.reduce((s, a) => s + (a.leadsLoaded     || 0), 0);
    const totalImported   = trackerAgents.reduce((s, a) => s + (a.poolAssigned    || 0), 0);
    const totalDisp       = trackerAgents.reduce((s, a) => s + (a.domLeadsCreated || 0), 0);
    const totalInterested = trackerAgents.reduce((s, a) => s + (a.interestedCount || 0), 0);
    const totalCallback   = trackerAgents.reduce((s, a) => s + (a.callbackCount   || 0), 0);
    const totalPoolWorked = trackerAgents.reduce((s, a) => s + (a.poolWorked      || 0), 0);

    // Export all agents data as CSV
    const handleExportTracker = () => {
      const headers = ['Rank', 'Name', 'Email', 'Status', 'Active', 'Last Login',
        'Meta Leads Loaded', 'Meta Completed', 'Pool Leads Assigned', 'Pool Leads Worked',
        'Total Dispositions Filed', 'Interested', 'Callbacks', 'Conversion Rate %', 'Last Seen'];
      const rows = [...trackerAgents]
        .sort((a, b) => getAgentTier(b).score - getAgentTier(a).score)
        .filter(a => !trackerSearch || a.name?.toLowerCase().includes(trackerSearch.toLowerCase()) || a.email?.toLowerCase().includes(trackerSearch.toLowerCase()))
        .map((a, i) => [
          i + 1, a.name || '', a.email || '',
          a.agentStatus || 'available', a.isActive ? 'Yes' : 'No',
          a.lastLogin ? new Date(a.lastLogin).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never',
          a.leadsLoaded || 0, a.leadsCompleted || 0,
          a.poolAssigned || 0, a.poolWorked || 0,
          a.domLeadsCreated || 0, a.interestedCount || 0, a.callbackCount || 0,
          `${a.conversionRate || 0}%`,
          a.agentStatusUpdatedAt ? new Date(a.agentStatusUpdatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—',
        ]);
      const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `agent-tracker-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} agents`);
    };

    const sortedAgents = [...trackerAgents]
      .filter(a => !trackerSearch || a.name?.toLowerCase().includes(trackerSearch.toLowerCase()) || a.email?.toLowerCase().includes(trackerSearch.toLowerCase()))
      .sort((a, b) => {
        const order = { available: 0, break: 1, unavailable: 2 };
        const sa = order[a.agentStatus || 'available'] ?? 3;
        const sb = order[b.agentStatus || 'available'] ?? 3;
        if (sa !== sb) return sa - sb;
        return getAgentTier(b).score - getAgentTier(a).score;
      });

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-emerald-50/30">
        {/* Green breadcrumb bar */}
        <div className="bg-[#065F36] text-white px-6 py-2 flex items-center justify-between border-b border-[#054A2E]">
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3 w-3 text-white/60" />
            <button onClick={() => setSuperTab('main')} className="text-white/60 hover:text-white transition-colors">Super Admin Portal</button>
            <span className="text-white/30">›</span>
            <span className="text-white font-semibold flex items-center gap-1"><Activity className="h-3 w-3" /> Agent Tracker</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors">
            <LogOut className="h-3 w-3" /> Logout
          </button>
        </div>
        {/* White sticky header */}
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100">
          <div className="px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button onClick={() => setSuperTab('main')}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-[#065F36] border border-gray-200 hover:border-[#065F36]/30 rounded-xl px-3 py-2 transition-all">
                <ChevronLeft className="h-4 w-4" /> Dashboard
              </button>
              <div className="border-l border-gray-200 pl-3 flex items-center gap-2">
                <div className="p-1.5 bg-violet-100 rounded-lg"><Activity className="h-4 w-4 text-violet-600" /></div>
                <div>
                  <h1 className="text-gray-800 font-bold text-sm">Agent Tracker</h1>
                  <p className="text-gray-400 text-xs">Live activity & performance of every agent</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Search agents */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Search agent…" value={trackerSearch}
                  onChange={e => setTrackerSearch(e.target.value)}
                  className="pl-9 pr-7 py-2 text-sm border border-gray-200 rounded-xl bg-white w-44 focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]" />
                {trackerSearch && <button onClick={() => setTrackerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <button onClick={handleExportTracker}
                className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl px-3 py-2 font-semibold transition-colors">
                <Download className="h-4 w-4" /> Export CSV
              </button>
              <button onClick={fetchTrackerAgents}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 transition-all">
                <RefreshCw className={`h-4 w-4 ${trackerLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
          </div>
        </header>

        <div className="flex h-[calc(100vh-56px)]">
          {/* Left: Agent Grid */}
          <div className={`flex-shrink-0 overflow-y-auto p-5 space-y-4 border-r border-gray-100 bg-white/50 ${selectedTrackAgent ? 'w-80' : 'flex-1'}`}>
            {/* Status summary bar */}
            {trackerAgents.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                {[
                  { status: 'available',   label: 'Available',   dot: 'bg-emerald-500', count: trackerAgents.filter(a => (a.agentStatus || 'available') === 'available' && a.isActive).length },
                  { status: 'break',       label: 'On Break',    dot: 'bg-amber-400',   count: trackerAgents.filter(a => a.agentStatus === 'break').length },
                  { status: 'unavailable', label: 'Unavailable', dot: 'bg-red-500',     count: trackerAgents.filter(a => a.agentStatus === 'unavailable').length },
                ].map(s => (
                  <div key={s.status} className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
                    <span className={`w-2.5 h-2.5 rounded-full ${s.dot} ${s.status === 'available' ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-bold text-gray-800">{s.count}</span>
                    <span className="text-xs text-gray-500">{s.label}</span>
                  </div>
                ))}
                <span className="text-xs text-gray-400 ml-auto">{trackerAgents.length} total agents</span>
              </div>
            )}

            {/* ── Aggregate stat cards ── */}
            {!trackerLoading && trackerAgents.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Total Leads',        val: totalMeta + totalImported, sub: 'Meta + Imported', icon: '📊', bg: 'from-[#065F36] to-[#00874A]', text: 'text-white' },
                  { label: 'Meta Leads',          val: totalMeta,                sub: 'Website / Meta',  icon: '🌐', bg: 'from-teal-500 to-cyan-600',       text: 'text-white' },
                  { label: 'Imported Leads',      val: totalImported,            sub: 'Pool / Batches',  icon: '📥', bg: 'from-violet-500 to-purple-600',    text: 'text-white' },
                  { label: 'Dispositions Filed',  val: totalDisp,                sub: 'Forms submitted', icon: '📝', bg: 'from-blue-500 to-indigo-600',      text: 'text-white' },
                  { label: 'Interested',          val: totalInterested,          sub: 'Hot leads',       icon: '✅', bg: 'from-emerald-500 to-green-600',    text: 'text-white' },
                  { label: 'Callbacks',           val: totalCallback,            sub: 'Follow-ups due',  icon: '📞', bg: 'from-amber-400 to-orange-500',     text: 'text-white' },
                ].map(s => (
                  <div key={s.label} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${s.bg} p-4 text-white shadow-md`}>
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-2xl">{s.icon}</span>
                    </div>
                    <p className="text-2xl font-black">{s.val.toLocaleString()}</p>
                    <p className="text-white/80 text-xs font-semibold mt-0.5">{s.label}</p>
                    <p className="text-white/50 text-[10px]">{s.sub}</p>
                    <div className="absolute -bottom-3 -right-3 w-16 h-16 rounded-full bg-white/10" />
                  </div>
                ))}
              </div>
            )}

            {trackerLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-10 h-10 border-4 border-gray-100 border-t-[#065F36] rounded-full animate-spin" />
                <span className="text-sm text-gray-400">Loading agents…</span>
              </div>
            ) : sortedAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Users className="h-12 w-12 text-gray-200" />
                <p className="text-gray-400 text-sm font-medium">No agents found.</p>
              </div>
            ) : (
              <div className={`grid gap-3 ${selectedTrackAgent ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                {sortedAgents.map((a) => {
                  const tier      = getAgentTier(a);
                  const tierCls   = SA_TIER_STYLES[tier.color] || SA_TIER_STYLES.gray;
                  const statusKey = a.agentStatus || 'available';
                  const statusInfo = STATUS_DOT[statusKey] || STATUS_DOT.available;
                  const conv      = a.leadsLoaded > 0 ? Math.round((a.leadsCompleted / a.leadsLoaded) * 100) : 0;
                  const isSelected = selectedTrackAgent?._id === a._id;

                  return (
                    <div key={a._id}
                      onClick={() => handleSelectTrackAgent(a)}
                      className={`bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md ${
                        isSelected ? 'border-[#065F36] shadow-md shadow-green-100' :
                        !a.isActive ? 'border-gray-100 opacity-60' : 'border-gray-100 hover:border-[#065F36]/30'
                      }`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="relative">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-base ${
                            tier.tier === 5 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                            tier.tier === 4 ? 'bg-gradient-to-br from-violet-500 to-purple-600' :
                            tier.tier === 3 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                            'bg-gradient-to-br from-[#065F36] to-[#00A651]'
                          }`}>
                            {a.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${statusInfo.dot} ${statusKey === 'available' ? 'animate-pulse' : ''}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 truncate">{a.name}</p>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${statusInfo.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                            {statusInfo.label}
                          </span>
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${tierCls} mb-2`}>
                        {tier.emoji} {tier.label}
                      </span>

                      {/* 6-stat grid: meta, pool, dispositions, interested, callbacks, conv */}
                      <div className="grid grid-cols-3 gap-1 text-center">
                        <div className="bg-teal-50 rounded-xl py-1.5">
                          <p className="text-sm font-black text-teal-600">{a.leadsLoaded}</p>
                          <p className="text-[10px] text-gray-400">Meta</p>
                        </div>
                        <div className="bg-violet-50 rounded-xl py-1.5">
                          <p className="text-sm font-black text-violet-600">{a.poolAssigned || 0}</p>
                          <p className="text-[10px] text-gray-400">Pool</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl py-1.5">
                          <p className="text-sm font-black text-blue-600">{a.domLeadsCreated}</p>
                          <p className="text-[10px] text-gray-400">Disposed</p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl py-1.5">
                          <p className="text-sm font-black text-emerald-600">{a.interestedCount || 0}</p>
                          <p className="text-[10px] text-gray-400">Interested</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl py-1.5">
                          <p className="text-sm font-black text-amber-600">{a.callbackCount || 0}</p>
                          <p className="text-[10px] text-gray-400">Callbacks</p>
                        </div>
                        <div className={`${conv >= 50 ? 'bg-green-50' : 'bg-gray-50'} rounded-xl py-1.5`}>
                          <p className={`text-sm font-black ${conv >= 50 ? 'text-green-600' : 'text-gray-500'}`}>{conv}%</p>
                          <p className="text-[10px] text-gray-400">Conv.</p>
                        </div>
                      </div>

                      <p className="text-xs text-gray-400 mt-2">Last login: {fmtShortDt(a.lastLogin)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Agent Activity Panel */}
          {selectedTrackAgent && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Agent detail header */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-md ${
                      getAgentTier(selectedTrackAgent).tier === 5 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                      getAgentTier(selectedTrackAgent).tier === 4 ? 'bg-gradient-to-br from-violet-500 to-purple-600' :
                      'bg-gradient-to-br from-[#065F36] to-[#00A651]'
                    }`}>
                      {selectedTrackAgent.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-gray-800">{selectedTrackAgent.name}</h2>
                      <p className="text-sm text-gray-400">{selectedTrackAgent.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${SA_TIER_STYLES[getAgentTier(selectedTrackAgent).color]}`}>
                          {getAgentTier(selectedTrackAgent).emoji} {getAgentTier(selectedTrackAgent).label}
                        </span>
                        {(() => {
                          const sKey = selectedTrackAgent.agentStatus || 'available';
                          const si   = STATUS_DOT[sKey] || STATUS_DOT.available;
                          return (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${si.cls}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${si.dot} ${sKey === 'available' ? 'animate-pulse' : ''}`} />
                              {si.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedTrackAgent(null)} className="text-gray-400 hover:text-gray-600 p-1">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Quick stats — full breakdown */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-5">
                  {[
                    { label: '🌐 Meta',        val: selectedTrackAgent.leadsLoaded    || 0, color: 'text-teal-600',    bg: 'bg-teal-50' },
                    { label: '📥 Pool',         val: selectedTrackAgent.poolAssigned   || 0, color: 'text-violet-600',  bg: 'bg-violet-50' },
                    { label: '📝 Disposed',     val: selectedTrackAgent.domLeadsCreated|| 0, color: 'text-blue-600',    bg: 'bg-blue-50' },
                    { label: '✅ Interested',   val: selectedTrackAgent.interestedCount|| 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: '📞 Callbacks',    val: selectedTrackAgent.callbackCount  || 0, color: 'text-amber-600',   bg: 'bg-amber-50' },
                    { label: '📊 Pool Worked',  val: selectedTrackAgent.poolWorked     || 0, color: 'text-indigo-600',  bg: 'bg-indigo-50' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                      <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {trackLeadsLoading ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-4 border-gray-100 border-t-[#065F36] rounded-full animate-spin" />
                  <span className="text-sm text-gray-400">Loading activity…</span>
                </div>
              ) : (
                <>
                  {/* Recent Worked Cases */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <div className="p-2 bg-[#E8FFF5] rounded-xl"><Briefcase className="h-4 w-4 text-[#065F36]" /></div>
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">Recent Disposition Allocation</h3>
                        <p className="text-xs text-gray-400">Click any lead to see full disposition details</p>
                      </div>
                    </div>
                    {trackWorkedLeads.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-8">No worked cases yet.</p>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {trackWorkedLeads.map((l) => {
                          const src =
                            l.sourceWebsiteLead  ? { label: 'Website',  emoji: '🌐', borderL: 'border-l-4 border-l-teal-500',   rowHover: 'hover:bg-teal-50/40',   badge: 'bg-teal-100 text-teal-700 border border-teal-300' } :
                            l.sourceImportedLead ? { label: 'Imported', emoji: '📊', borderL: 'border-l-4 border-l-violet-500', rowHover: 'hover:bg-violet-50/40', badge: 'bg-violet-100 text-violet-700 border border-violet-300' } :
                                                   { label: 'Manual',   emoji: '✍️', borderL: 'border-l-4 border-l-gray-300',   rowHover: 'hover:bg-gray-50/40',   badge: 'bg-gray-100 text-gray-600 border border-gray-300' };
                          return (
                          <div key={l._id}
                            onClick={() => setTrackerLeadDetail(l)}
                            className={`px-5 py-3 flex items-center justify-between cursor-pointer transition-colors ${src.borderL} ${src.rowHover}`}>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold bg-gray-900 text-emerald-400 px-1.5 py-0.5 rounded">{l.leadRef || '—'}</span>
                                <span className="font-semibold text-sm text-gray-800">{l.name || '—'}</span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${src.badge}`}>{src.emoji} {src.label}</span>
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {l.mobile} · {l.productType?.replace(/_/g,' ')} · {fmtDate(l.createdAt)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {l.callOutcome && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                  l.callOutcome === 'interested'     ? 'bg-emerald-100 text-emerald-700' :
                                  l.callOutcome === 'not_interested' ? 'bg-red-100 text-red-700' :
                                  l.callOutcome === 'callback'       ? 'bg-amber-100 text-amber-700' :
                                  l.callOutcome === 'not_reachable'  ? 'bg-orange-100 text-orange-700' :
                                  l.callOutcome === 'wrong_number'   ? 'bg-gray-100 text-gray-500' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{l.callOutcome.replace(/_/g,' ')}</span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                l.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                l.status === 'rejected'  ? 'bg-red-100 text-red-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>{l.status}</span>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Pool Leads Assigned */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <div className="p-2 bg-violet-100 rounded-xl"><Database className="h-4 w-4 text-violet-600" /></div>
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">Data Pool Assigned</h3>
                        <p className="text-xs text-gray-400">Imported leads assigned to this agent</p>
                      </div>
                    </div>
                    {trackPoolLeads.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-8">No pool leads assigned.</p>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {trackPoolLeads.slice(0, 8).map((l) => (
                          <div key={l._id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                            <div>
                              <p className="font-semibold text-sm text-gray-800">{l.name || '—'}</p>
                              <p className="text-xs text-gray-400">{l.mobile} · {l.loanType || l.productType || '—'} · {l.state || ''}</p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                              l.workStatus === 'interested'     ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                              l.workStatus === 'not_interested' ? 'bg-red-100 text-red-700 border-red-200' :
                              l.workStatus === 'in_progress'    ? 'bg-blue-100 text-blue-700 border-blue-200' :
                              l.workStatus === 'closed'         ? 'bg-gray-100 text-gray-600 border-gray-200' :
                              'bg-orange-100 text-orange-700 border-orange-200'
                            }`}>
                              {l.workStatus === 'new' ? 'Not Called' : l.workStatus?.replace(/_/g,' ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Lead Disposition Detail Modal ── */}
        {trackerLeadDetail && (() => {
          const l = trackerLeadDetail;
          const OUTCOME_CFG = {
            interested:     { label: 'Interested',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: '✅', bar: 'bg-emerald-500' },
            not_interested: { label: 'Not Interested', cls: 'bg-red-100 text-red-700 border-red-300',             icon: '❌', bar: 'bg-red-500' },
            callback:       { label: 'Callback',       cls: 'bg-amber-100 text-amber-700 border-amber-300',       icon: '📞', bar: 'bg-amber-400' },
            not_reachable:  { label: 'Not Reachable',  cls: 'bg-orange-100 text-orange-700 border-orange-300',    icon: '📵', bar: 'bg-orange-400' },
            wrong_number:   { label: 'Wrong Number',   cls: 'bg-gray-100 text-gray-600 border-gray-300',          icon: '❓', bar: 'bg-gray-400' },
          };
          const oc  = OUTCOME_CFG[l.callOutcome] || { label: l.callOutcome || 'No Disposition', cls: 'bg-gray-100 text-gray-500 border-gray-200', icon: '—', bar: 'bg-gray-300' };
          const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
          const CIBIL_LABEL = { below_600:'< 600 (Poor)', '600_699':'600–699 (Fair)', '700_749':'700–749 (Good)', '750_800':'750–800 (Very Good)', above_800:'> 800 (Excellent)', unknown:'Unknown' };

          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setTrackerLeadDetail(null)}>
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>

                {/* Modal Header */}
                <div className={`px-6 py-5 rounded-t-3xl ${
                  l.callOutcome === 'interested'     ? 'bg-gradient-to-r from-emerald-500 to-teal-600' :
                  l.callOutcome === 'not_interested' ? 'bg-gradient-to-r from-red-500 to-rose-600' :
                  l.callOutcome === 'callback'       ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                  l.callOutcome === 'not_reachable'  ? 'bg-gradient-to-r from-orange-400 to-amber-500' :
                  l.callOutcome === 'wrong_number'   ? 'bg-gradient-to-r from-gray-500 to-gray-600' :
                  'bg-gradient-to-r from-[#065F36] to-[#00874A]'
                } text-white`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-2xl">{oc.icon}</span>
                        <span className="text-xl font-black">{l.name || '—'}</span>
                        {l.leadRef && (
                          <span className="font-mono text-xs font-bold bg-white/20 text-white px-2 py-0.5 rounded-lg tracking-widest">{l.leadRef}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white/80 text-sm">{l.mobile}</span>
                        {l.email && <span className="text-white/60 text-xs">· {l.email}</span>}
                        {(l.city || l.state) && <span className="text-white/60 text-xs">· {[l.city, l.state].filter(Boolean).join(', ')}</span>}
                        <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-bold border border-white/30">
                          {l.sourceWebsiteLead ? '🌐 Website' : l.sourceImportedLead ? '📊 Imported' : '✍️ Manual'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setTrackerLeadDetail(null)}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">

                  {/* Disposition section — the key info */}
                  <div className={`rounded-2xl border-2 p-5 ${
                    l.callOutcome === 'not_interested' || l.status === 'rejected' ? 'border-red-200 bg-red-50' :
                    l.callOutcome === 'interested'     ? 'border-emerald-200 bg-emerald-50' :
                    l.callOutcome === 'callback'       ? 'border-amber-200 bg-amber-50' :
                    l.callOutcome === 'not_reachable'  ? 'border-orange-200 bg-orange-50' :
                    'border-gray-200 bg-gray-50'
                  }`}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Disposition & Outcome</p>
                    <div className="flex items-center gap-3 flex-wrap mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border ${oc.cls}`}>
                        {oc.icon} {oc.label}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border ${
                        l.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                        l.status === 'rejected'  ? 'bg-red-100 text-red-700 border-red-300' :
                                                   'bg-blue-100 text-blue-700 border-blue-300'
                      }`}>
                        {l.status === 'completed' ? '✔ Completed' : l.status === 'rejected' ? '✖ Rejected' : '⏳ Pending'}
                      </span>
                      {l.callbackDate && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-violet-100 text-violet-700 border border-violet-300">
                          📅 Callback: {l.callbackDate}
                        </span>
                      )}
                    </div>
                    {/* Agent Notes — the "why" */}
                    {l.notes ? (
                      <div className="bg-white rounded-xl p-4 border border-gray-200">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Agent Notes / Reason</p>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">"{l.notes}"</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic bg-white rounded-xl p-4 border border-gray-200">No notes added by agent.</p>
                    )}
                  </div>

                  {/* Lead info grid */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Lead Details — Agent Filled</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Product / Service', val: l.productType?.replace(/_/g,' '), bold: true },
                        { label: 'Loan Amount',        val: l.loanAmountRequired ? `₹${l.loanAmountRequired.toLocaleString('en-IN')}` : null },
                        { label: 'Employment Type',    val: l.employmentType?.replace(/_/g,' ') },
                        { label: 'Company',            val: l.companyName },
                        { label: 'Monthly Salary',     val: l.monthlySalary ? `₹${l.monthlySalary.toLocaleString('en-IN')}` : null },
                        { label: 'CIBIL Score Range',  val: CIBIL_LABEL[l.cibilScoreRange] || l.cibilScoreRange },
                        { label: 'Existing EMI',       val: l.existingEMI ? `₹${l.existingEMI.toLocaleString('en-IN')}/mo` : null },
                        { label: 'Existing Bank',      val: l.existingBank },
                        { label: 'PAN',                val: l.pan },
                        { label: 'Date of Birth',      val: l.dob },
                        { label: 'City / State',       val: [l.city, l.state].filter(Boolean).join(', ') || null },
                        { label: 'Pincode',            val: l.pincode },
                      ].filter(r => r.val).map(({ label, val, bold }) => (
                        <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                          <p className="text-xs text-gray-400 font-medium">{label}</p>
                          <p className={`text-sm mt-0.5 ${bold ? 'font-bold text-[#065F36] capitalize' : 'font-semibold text-gray-700'}`}>{val}</p>
                        </div>
                      ))}
                    </div>
                    {l.existingLoans?.length > 0 && (
                      <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
                        <p className="text-xs text-gray-400 font-medium mb-1">Existing Loans</p>
                        <div className="flex flex-wrap gap-1.5">
                          {l.existingLoans.map((loan, i) => (
                            <span key={i} className="text-xs bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded-lg font-medium">{loan}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Original Imported Data (if lead came from Excel) ── */}
                  {l.sourceImportedLead && (() => {
                    const imp = l.sourceImportedLead;
                    return (
                      <div className="border-2 border-violet-200 bg-violet-50/40 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="p-1.5 bg-violet-100 rounded-lg"><Database className="h-4 w-4 text-violet-600" /></div>
                          <div>
                            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">Original Imported Data — Excel Source</p>
                            <p className="text-xs text-violet-500">Data from the uploaded Excel batch before agent worked this lead</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {[
                            { label: 'Total Outstanding', val: imp.totalOutstandingAmount, amber: true },
                            { label: 'Principal Outstanding', val: imp.principalOutstanding, amber: true },
                            { label: 'EMI Overdue',      val: imp.noOfInstallmentOverdue },
                            { label: 'CIBIL Score',      val: imp.cibilScore },
                            { label: 'CIBIL Date',       val: imp.cibilScoreDate },
                            { label: 'Loan Type',        val: imp.loanType },
                            { label: 'Bank Name',        val: imp.bankName },
                            { label: 'Amount Financed',  val: imp.amountFinanced },
                            { label: 'Disbursal Amount', val: imp.disbursalAmount },
                            { label: 'Sanction Date',    val: imp.sanctionDate },
                            { label: 'Expiry Status',    val: imp.expiryStatus },
                            { label: 'Expiry Date',      val: imp.expiryDate },
                            { label: 'Vintage',          val: imp.vintage },
                            { label: 'Employment',       val: imp.employment },
                            { label: 'Firm / Employer',  val: imp.firmEmployeeName },
                            { label: 'DOB / Age',        val: [imp.dateOfBirth, imp.age].filter(Boolean).join(' / ') || null },
                            { label: 'Live Loans',       val: imp.countOfLiveLoans },
                            { label: 'Residence Phone',  val: imp.residencePhoneNumber },
                            { label: 'Office Phone',     val: imp.officePhoneNumber },
                            { label: 'Residence Addr',   val: imp.residenceAddress },
                            { label: 'Office Addr',      val: imp.officeAddress },
                            { label: 'Asset',            val: imp.assetDescription },
                            { label: 'Make',             val: imp.make },
                            { label: 'Language',         val: imp.customerPreferredLanguage },
                          ].filter(r => r.val).map(({ label, val, amber }) => (
                            <div key={label} className={`rounded-xl p-2.5 ${amber ? 'bg-amber-100 border border-amber-200' : 'bg-white border border-violet-100'}`}>
                              <p className="text-xs text-gray-400 font-medium">{label}</p>
                              <p className={`text-sm font-semibold mt-0.5 ${amber ? 'text-amber-800' : 'text-gray-700'}`}>{val}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Timeline */}
                  <div className="flex items-center gap-6 text-xs text-gray-400 bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div><span className="font-semibold text-gray-600">Submitted:</span> {fmt(l.createdAt)}</div>
                    {l.updatedAt && l.updatedAt !== l.createdAt && (
                      <div><span className="font-semibold text-gray-600">Updated:</span> {fmt(l.updatedAt)}</div>
                    )}
                    {l.assignedTo?.name && (
                      <div><span className="font-semibold text-gray-600">Agent:</span> {l.assignedTo.name}</div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          );
        })()}

      </div>
    );
  })()}

  {superTab === 'web_leads' && (() => {
    const STATUS_META = {
      new:       { label: 'New',       cls: 'bg-orange-100 text-orange-800 border border-orange-200' },
      loaded:    { label: 'Loaded',    cls: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
      completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
      rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-800 border border-red-200' },
    };
    const fmtDate = (d) => d
      ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    return (
      <div className="min-h-screen bg-[#F0FFF8]">
        {/* Green breadcrumb bar */}
        <div className="bg-[#065F36] text-white px-6 py-2 flex items-center justify-between border-b border-[#054A2E]">
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3 w-3 text-white/60" />
            <button onClick={() => setSuperTab('main')} className="text-white/60 hover:text-white transition-colors">Super Admin Portal</button>
            <span className="text-white/30">›</span>
            <span className="text-white font-semibold flex items-center gap-1"><Globe className="h-3 w-3" /> Lead Monitor</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors">
            <LogOut className="h-3 w-3" /> Logout
          </button>
        </div>
        {/* White sticky header */}
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100">
          <div className="px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button onClick={() => setSuperTab('main')}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-[#065F36] border border-gray-200 hover:border-[#065F36]/30 rounded-xl px-3 py-2 transition-all">
                <ChevronLeft className="h-4 w-4" /> Dashboard
              </button>
              <div className="border-l border-gray-200 pl-3 flex items-center gap-2">
                <div className="p-1.5 bg-teal-100 rounded-lg"><Globe className="h-4 w-4 text-teal-600" /></div>
                <div>
                  <h1 className="text-gray-800 font-bold text-sm">Lead Monitor</h1>
                  <p className="text-gray-400 text-xs">All incoming website enquiries & assignments</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchWebLeads(webLeadsPage)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="px-6 py-5 space-y-5">

          {/* Service Type Breakdown */}
          {webServiceStats.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <div className="p-2 bg-[#E8FFF5] rounded-xl"><Globe className="h-5 w-5 text-[#065F36]" /></div>
                <div>
                  <h3 className="font-bold text-gray-800">Leads by Service Type</h3>
                  <p className="text-xs text-gray-400">Total website leads grouped by requested service</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-100">
                {webServiceStats.map((s) => (
                  <div key={s.type}
                    onClick={() => {
                      setWebProductFilter(s.type);
                      webProductRef.current = s.type;
                      fetchWebLeads(1);
                    }}
                    className="bg-white px-5 py-4 cursor-pointer hover:bg-[#E8FFF5] transition-colors group">
                    <p className="text-2xl font-black text-gray-800 group-hover:text-[#065F36]">{s.total}</p>
                    <p className="text-xs text-gray-500 mt-0.5 capitalize font-medium">{s.type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-[#065F36] font-semibold opacity-0 group-hover:opacity-100 mt-0.5">Click to filter →</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leads Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Bulk action bar — shown when rows are selected */}
            {webSelectedIds.size > 0 && (
              <div className="flex items-center justify-between px-6 py-3 bg-[#065F36] text-white">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{webSelectedIds.size} lead{webSelectedIds.size > 1 ? 's' : ''} selected</span>
                  <button
                    onClick={() => setWebSelectedIds(new Set())}
                    className="text-xs text-white/70 hover:text-white underline">
                    Clear
                  </button>
                </div>
                <button
                  onClick={() => setBulkAssignModal(true)}
                  className="flex items-center gap-2 bg-white text-[#065F36] text-sm font-bold px-4 py-1.5 rounded-xl hover:bg-[#E8FFF5] transition-colors shadow-sm">
                  <UserCheck2 className="h-4 w-4" /> Assign {webSelectedIds.size} Lead{webSelectedIds.size > 1 ? 's' : ''} to Agent
                </button>
              </div>
            )}
            {/* Filter bar — full set matching Disposition Allocation */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-100">
              {/* Search */}
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <input type="text" value={webSearch}
                  onChange={(e) => { setWebSearch(e.target.value); webSearchRef.current = e.target.value; }}
                  onKeyDown={(e) => e.key === 'Enter' && fetchWebLeads(1)}
                  placeholder="Search name, mobile, city…"
                  className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400" />
                {webSearch && <button onClick={() => { setWebSearch(''); webSearchRef.current=''; }} className="text-gray-300 hover:text-gray-500"><X className="h-3.5 w-3.5" /></button>}
              </div>
              {/* Status */}
              <select value={webStatusFilter}
                onChange={(e) => { setWebStatusFilter(e.target.value); webStatusRef.current = e.target.value; fetchWebLeads(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">All Statuses</option>
                <option value="new">⏳ New (Unclaimed)</option>
                <option value="loaded">📋 Loaded by Agent</option>
                <option value="completed">✅ Completed</option>
                <option value="rejected">❌ Rejected</option>
              </select>
              {/* Agent */}
              <select value={webAgentFilter}
                onChange={(e) => { setWebAgentFilter(e.target.value); webAgentRef.current = e.target.value; fetchWebLeads(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">👤 All Agents</option>
                {[...webAgents].sort((a,b) => a.name?.localeCompare(b.name)).map(a => (
                  <option key={a._id} value={a._id}>{a.name}</option>
                ))}
              </select>
              {/* Service */}
              <select value={webProductFilter}
                onChange={(e) => { setWebProductFilter(e.target.value); webProductRef.current = e.target.value; fetchWebLeads(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">All Services</option>
                <optgroup label="─ Loans ─">
                  <option value="personal_loan">Personal Loan</option>
                  <option value="home_loan">Home Loan</option>
                  <option value="car_loan">Car Loan</option>
                  <option value="business_loan">Business Loan</option>
                  <option value="loan_against_property">Loan Against Property</option>
                  <option value="education_loan">Education Loan</option>
                  <option value="gold_loan">Gold Loan</option>
                </optgroup>
                <optgroup label="─ Cards ─"><option value="credit_card">Credit Card</option></optgroup>
                <optgroup label="─ Insurance ─">
                  <option value="health_insurance">Health Insurance</option>
                  <option value="life_insurance">Life Insurance</option>
                  <option value="motor_insurance">Motor Insurance</option>
                  <option value="travel_insurance">Travel Insurance</option>
                </optgroup>
                <optgroup label="─ Investments ─">
                  <option value="mutual_fund">Mutual Fund</option>
                  <option value="sip">SIP</option>
                  <option value="demat">Demat Account</option>
                </optgroup>
              </select>
              {/* Search button */}
              <button onClick={() => fetchWebLeads(1)}
                className="flex items-center gap-2 text-sm bg-[#065F36] text-white px-4 py-2 rounded-xl hover:bg-[#054A2E] font-semibold">
                <Search className="h-4 w-4" /> Search
              </button>
              {/* Clear — always visible, red when active */}
              <button
                onClick={() => {
                  setWebStatusFilter(''); setWebProductFilter(''); setWebSearch(''); setWebAgentFilter('');
                  setWebDateFrom(''); setWebDateTo('');
                  webStatusRef.current=''; webProductRef.current=''; webSearchRef.current='';
                  webAgentRef.current=''; webDateFromRef.current=''; webDateToRef.current='';
                  fetchWebLeads(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                  (webStatusFilter || webProductFilter || webSearch || webAgentFilter || webDateFrom || webDateTo)
                    ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    : 'bg-gray-50 text-gray-300 border-gray-200 cursor-default'
                }`} title="Clear all filters">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
            {/* Date range row */}
            <div className="px-5 pb-3 flex items-center gap-2 flex-wrap border-b border-gray-100 bg-gray-50/50">
              <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-500">Date:</span>
              {[
                { l: 'Today',      f: localDateStr(),   t: localDateStr() },
                { l: 'This Week',  f: localDateStr(6),  t: localDateStr() },
                { l: 'This Month', f: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`, t: localDateStr() },
              ].map(p => (
                <button key={p.l}
                  onClick={() => { setWebDateFrom(p.f); setWebDateTo(p.t); webDateFromRef.current=p.f; webDateToRef.current=p.t; fetchWebLeads(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${webDateFrom===p.f && webDateTo===p.t ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400'}`}>
                  {p.l}
                </button>
              ))}
              <input type="date" value={webDateFrom}
                onChange={e => { setWebDateFrom(e.target.value); webDateFromRef.current=e.target.value; if(e.target.value && webDateToRef.current) fetchWebLeads(1); }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-500" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={webDateTo}
                onChange={e => { setWebDateTo(e.target.value); webDateToRef.current=e.target.value; if(e.target.value && webDateFromRef.current) fetchWebLeads(1); }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-500" />
              {(webDateFrom || webDateTo) && (
                <button onClick={() => { setWebDateFrom(''); setWebDateTo(''); webDateFromRef.current=''; webDateToRef.current=''; fetchWebLeads(1); }}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">Clear</button>
              )}
              {(webStatusFilter || webProductFilter || webSearch || webAgentFilter || webDateFrom || webDateTo) && (
                <span className="ml-auto text-xs text-gray-400">{webLeadsTotal} leads found</span>
              )}
            </div>
            {/* Stats bar */}
            <div className="flex items-center gap-4 px-6 py-2 bg-white border-b border-gray-100 text-xs text-gray-500">
              <span>Total: <strong className="text-gray-800">{webLeadsTotal}</strong></span>
              {webProductFilter && <span className="bg-[#E8FFF5] text-[#065F36] px-2 py-0.5 rounded-full font-semibold capitalize">{webProductFilter.replace(/_/g,' ')}</span>}
              {webStatusFilter  && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold capitalize">{webStatusFilter}</span>}
              {webAgentFilter && <span className="bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-semibold">{webAgents.find(a=>a._id===webAgentFilter)?.name || 'Agent'}</span>}
            </div>

            {/* Table */}
            {webLeadsLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <span className="w-8 h-8 border-2 border-gray-200 border-t-[#065F36] rounded-full animate-spin mb-3" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : webLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Globe className="h-12 w-12 text-gray-200 mb-3" />
                <p className="text-sm font-medium">No website leads found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-4 pr-2 py-3.5 text-center w-10">
                        <input type="checkbox"
                          className="rounded border-gray-300 accent-[#065F36]"
                          checked={webSelectedIds.size > 0 && webLeads.filter(l => l.status === 'new').every(l => webSelectedIds.has(l._id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setWebSelectedIds(new Set(webLeads.filter(l => l.status === 'new').map(l => l._id)));
                            } else {
                              setWebSelectedIds(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="pl-2 pr-3 py-3.5 text-left">Customer</th>
                      <th className="px-3 py-3.5 text-left">Mobile</th>
                      <th className="px-3 py-3.5 text-left">City</th>
                      <th className="px-3 py-3.5 text-left">Service</th>
                      <th className="px-3 py-3.5 text-left">Source</th>
                      <th className="px-3 py-3.5 text-left">Status</th>
                      <th className="px-3 py-3.5 text-left">Assigned To</th>
                      <th className="px-3 py-3.5 text-left">Received</th>
                      <th className="px-3 pr-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {webLeads.map((lead) => {
                      const sm        = STATUS_META[lead.status] || {};
                      const isNew     = lead.status === 'new';
                      const isChecked = webSelectedIds.has(lead._id);
                      return (
                        <tr key={lead._id} className={`hover:bg-[#E8FFF5]/50 transition-colors group ${isChecked ? 'bg-[#E8FFF5]/80' : ''}`}>
                          <td className="pl-4 pr-2 py-3.5 text-center">
                            {isNew ? (
                              <input type="checkbox"
                                className="rounded border-gray-300 accent-[#065F36]"
                                checked={isChecked}
                                onChange={(e) => {
                                  const next = new Set(webSelectedIds);
                                  e.target.checked ? next.add(lead._id) : next.delete(lead._id);
                                  setWebSelectedIds(next);
                                }}
                              />
                            ) : (
                              <span className="block w-4 h-4" />
                            )}
                          </td>
                          <td className="pl-2 pr-3 py-3.5">
                            <p className="font-semibold text-gray-800">{lead.name || '—'}</p>
                            {lead.pan && <p className="text-xs text-gray-400 font-mono">{lead.pan}</p>}
                          </td>
                          <td className="px-3 py-3.5 font-mono text-xs text-gray-600 tracking-wide">{lead.mobile || '—'}</td>
                          <td className="px-3 py-3.5 text-gray-500">{lead.city || '—'}</td>
                          <td className="px-3 py-3.5">
                            {lead.productType
                              ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{lead.productType.replace(/_/g,' ')}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700 border border-teal-200">
                              🌐 Website
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${sm.cls || 'bg-gray-100 text-gray-600'}`}>
                              {sm.label || lead.status}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-gray-600 text-sm">{lead.loadedBy?.name || <span className="text-orange-500 text-xs font-medium">Unclaimed</span>}</td>
                          <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(lead.createdAt)}</td>
                          <td className="px-3 pr-6 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                              {isNew && (
                                <button
                                  onClick={() => setWebAssignModal(lead)}
                                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#065F36] text-white hover:bg-[#054A2E] font-semibold shadow-sm">
                                  <UserCheck2 className="h-3.5 w-3.5" /> Assign
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {webLeadsTotal > 30 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>{webLeads.length} of {webLeadsTotal} leads</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => fetchWebLeads(webLeadsPage - 1)} disabled={webLeadsPage <= 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium">
                    ← Prev
                  </button>
                  <span className="text-xs font-semibold text-gray-700">Page {webLeadsPage}</span>
                  <button onClick={() => fetchWebLeads(webLeadsPage + 1)} disabled={webLeads.length < 30}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Bulk Assign Modal */}
        {bulkAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#065F36] to-[#00874A]">
                <div className="flex items-center gap-2">
                  <UserCheck2 className="h-5 w-5 text-white" />
                  <h3 className="text-white font-bold">Bulk Assign {webSelectedIds.size} Leads</h3>
                </div>
                <button onClick={() => setBulkAssignModal(false)} className="text-white/70 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-2xl font-black text-teal-700">{webSelectedIds.size}</span>
                  <div>
                    <p className="text-sm font-semibold text-teal-800">Website leads selected</p>
                    <p className="text-xs text-teal-600">All {webSelectedIds.size} leads will be assigned to the chosen agent</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Select Agent <span className="text-red-500">*</span>
                  </label>
                  {webAgents.filter(a => a.isActive).length === 0 ? (
                    <p className="text-sm text-gray-400">No active agents available.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {webAgents.filter(a => a.isActive).map((a) => (
                        <button key={a._id}
                          onClick={() => handleBulkAssign(a._id, a.name)}
                          disabled={webAssigning}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-[#E8FFF5] hover:border-[#D1FAE5] transition-colors text-left disabled:opacity-50">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#065F36] to-[#00A651] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {a.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-gray-800 text-sm">{a.name}</p>
                            <p className="text-xs text-gray-400">{a.email}</p>
                          </div>
                          <div className="text-right text-xs text-gray-400">
                            <p className="font-semibold text-[#065F36]">{a.leadsLoaded || 0} loaded</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setBulkAssignModal(false)}
                  className="w-full py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Single Assign Modal */}
        {webAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#065F36] to-[#00874A]">
                <div className="flex items-center gap-2">
                  <UserCheck2 className="h-5 w-5 text-white" />
                  <h3 className="text-white font-bold">Assign Lead to Agent</h3>
                </div>
                <button onClick={() => setWebAssignModal(null)} className="text-white/70 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-[#E8FFF5] rounded-xl px-4 py-3 border border-[#D1FAE5]">
                  <p className="text-sm font-semibold text-[#065F36]">{webAssignModal.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    🌐 Website · {webAssignModal.mobile}
                    {webAssignModal.productType && ` · ${webAssignModal.productType.replace(/_/g,' ')}`}
                    {webAssignModal.city && ` · ${webAssignModal.city}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Select Agent <span className="text-red-500">*</span>
                    <span className="ml-2 normal-case font-normal text-gray-400">— Sorted by performance</span>
                  </p>
                  {webAgents.filter(a => a.isActive).length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No active agents available.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {[...webAgents.filter(a => a.isActive)].sort((a, b) => getAgentTier(b).score - getAgentTier(a).score).map((a) => {
                        const tier    = getAgentTier(a);
                        const tierCls = SA_TIER_STYLES[tier.color] || SA_TIER_STYLES.gray;
                        const conv    = a.leadsLoaded > 0 ? Math.round((a.leadsCompleted / a.leadsLoaded) * 100) : 0;
                        return (
                          <button key={a._id}
                            onClick={() => handleAssignWebLead(webAssignModal._id, a._id, a.name)}
                            disabled={webAssigning}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left disabled:opacity-50 ${
                              tier.tier === 5 ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-gray-100 hover:bg-[#E8FFF5] hover:border-[#D1FAE5]'
                            }`}>
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                              tier.tier === 5 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                              tier.tier === 4 ? 'bg-gradient-to-br from-violet-500 to-purple-600' :
                              tier.tier === 3 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                              'bg-gradient-to-br from-[#065F36] to-[#00A651]'
                            }`}>
                              {a.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-gray-800 text-sm">{a.name}</p>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${tierCls}`}>
                                  {tier.emoji} {tier.label}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{conv}% conversion · {a.leadsLoaded || 0} loaded</p>
                            </div>
                            {tier.tier === 5 && (
                              <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded-lg flex-shrink-0">Best ✨</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button onClick={() => setWebAssignModal(null)}
                  className="w-full py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  })()}

  {superTab === 'import' && (() => {
    const fmtNum = (n) => (n || 0).toLocaleString('en-IN');
    return (
      <div className="min-h-screen bg-[#F0FFF8]">
        {/* Green breadcrumb bar */}
        <div className="bg-[#065F36] text-white px-6 py-2 flex items-center justify-between border-b border-[#054A2E]">
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3 w-3 text-white/60" />
            <button onClick={() => setSuperTab('main')} className="text-white/60 hover:text-white transition-colors">Super Admin Portal</button>
            <span className="text-white/30">›</span>
            <span className="text-white font-semibold flex items-center gap-1"><Upload className="h-3 w-3" /> Import & Distribute</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors">
            <LogOut className="h-3 w-3" /> Logout
          </button>
        </div>
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100">
          <div className="px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button onClick={() => setSuperTab('main')}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-[#065F36] border border-gray-200 hover:border-[#065F36]/30 rounded-xl px-3 py-2 transition-all">
                <ChevronLeft className="h-4 w-4" /> Dashboard
              </button>
              <div className="border-l border-gray-200 pl-3 flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 rounded-lg"><Upload className="h-4 w-4 text-blue-600" /></div>
                <div>
                  <h1 className="text-gray-800 font-bold text-sm">Import & Distribute</h1>
                  <p className="text-gray-400 text-xs">Upload Excel data & share batches to admins</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="px-6 py-5 space-y-5 max-w-5xl">
          {/* Upload Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="p-2.5 bg-[#E8FFF5] rounded-xl"><Upload className="h-5 w-5 text-[#065F36]" /></div>
              <div>
                <h3 className="font-bold text-gray-800">Import Excel / CSV</h3>
                <p className="text-xs text-gray-400 mt-0.5">Any Excel is accepted — 32 fields are auto-mapped. Missing columns are stored as blank, extra columns are ignored.</p>
              </div>
            </div>
            <form onSubmit={handleImportUpload} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Batch Name (optional)</label>
                <input
                  type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g. July 2025 Personal Loan Batch"
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#065F36]/30 focus:border-[#065F36]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Excel / CSV File <span className="text-red-500">*</span></label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-[#065F36]/40 transition-colors">
                  <input
                    type="file" accept=".xlsx,.xls,.csv"
                    onChange={(e) => setImportFile(e.target.files[0] || null)}
                    className="hidden" id="import-file"
                  />
                  <label htmlFor="import-file" className="cursor-pointer">
                    <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    {importFile
                      ? <p className="text-sm font-semibold text-[#065F36]">{importFile.name}</p>
                      : <p className="text-sm text-gray-400">Click to select or drag an Excel / CSV file</p>}
                    <p className="text-xs text-gray-300 mt-1">Max 10 MB</p>
                  </label>
                </div>
              </div>
              <button type="submit" disabled={uploading || !importFile}
                className="flex items-center gap-2 bg-[#065F36] text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-[#054A2E] disabled:opacity-40 shadow-sm transition-all">
                {uploading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing…</>
                  : <><Upload className="h-4 w-4" /> Import Leads</>}
              </button>
            </form>
          </div>

          {/* Last Import Result — field mapping summary */}
          {lastImportResult && (
            <div className={`rounded-2xl border-2 p-5 ${lastImportResult.missingFields.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${lastImportResult.missingFields.length > 0 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                    <Upload className={`h-5 w-5 ${lastImportResult.missingFields.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 text-sm">
                      Import Complete — {lastImportResult.count} leads imported
                      {lastImportResult.skippedRows > 0 && <span className="text-gray-500 font-normal"> · {lastImportResult.skippedRows} empty rows skipped</span>}
                    </p>
                    <p className="text-xs text-gray-500">{lastImportResult.batchName}</p>
                  </div>
                </div>
                <button onClick={() => setLastImportResult(null)} className="text-gray-400 hover:text-gray-600 p-1"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Found fields */}
                <div className="bg-white rounded-xl p-4 border border-emerald-200">
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {lastImportResult.foundFields.length} Fields Found & Mapped
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {lastImportResult.foundFields.map(f => (
                      <span key={f} className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">{f}</span>
                    ))}
                  </div>
                </div>
                {/* Missing fields */}
                <div className={`bg-white rounded-xl p-4 border ${lastImportResult.missingFields.length > 0 ? 'border-amber-200' : 'border-gray-100'}`}>
                  <p className={`text-xs font-bold uppercase tracking-wide mb-2.5 flex items-center gap-1.5 ${lastImportResult.missingFields.length > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                    <AlertCircle className="h-3.5 w-3.5" />
                    {lastImportResult.missingFields.length > 0 ? `${lastImportResult.missingFields.length} Fields Not Found (stored as blank)` : 'All Fields Found!'}
                  </p>
                  {lastImportResult.missingFields.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {lastImportResult.missingFields.map(f => (
                        <span key={f} className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">{f}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Every mapped column was present in the Excel.</p>
                  )}
                </div>
              </div>
              {lastImportResult.missingFields.length > 0 && (
                <p className="text-xs text-amber-700 mt-3 bg-amber-100 rounded-xl px-3 py-2 border border-amber-200">
                  💡 Tip: The missing fields will be blank for all {lastImportResult.count} leads. You can still assign and work these leads normally.
                </p>
              )}
            </div>
          )}

          {/* Batch List */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#E8FFF5] rounded-xl"><Database className="h-5 w-5 text-[#065F36]" /></div>
                <div>
                  <h3 className="font-bold text-gray-800">Import Batches</h3>
                  <p className="text-xs text-gray-400">Select a batch and share with admins</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Batch search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Search batch name…" value={batchSearch}
                    onChange={e => setBatchSearch(e.target.value)}
                    className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white w-44 focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]" />
                  {batchSearch && <button onClick={() => setBatchSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <button onClick={fetchBatches}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2">
                  <RefreshCw className="h-4 w-4" /> Refresh
                </button>
              </div>
            </div>

            {batchesLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <span className="w-8 h-8 border-2 border-gray-200 border-t-[#065F36] rounded-full animate-spin mb-3" />
                <span className="text-sm">Loading batches…</span>
              </div>
            ) : batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Database className="h-12 w-12 text-gray-200 mb-3" />
                <p className="text-sm font-medium">No import batches yet. Upload a file above.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {batches.filter(b => !batchSearch || (b.batchName || b._id)?.toLowerCase().includes(batchSearch.toLowerCase())).map((b) => (
                  <div key={b._id} className="px-6 py-4 flex items-center justify-between hover:bg-[#E8FFF5]/30 transition-colors">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="p-2.5 bg-gray-100 rounded-xl flex-shrink-0">
                        <Database className="h-5 w-5 text-gray-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{b.batchName || b._id}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' · '}{fmtNum(b.total)} leads
                          {' · '}<span className="text-emerald-600 font-medium">{fmtNum(b.sharedCount)} shared</span>
                          {' · '}<span className="text-blue-600 font-medium">{fmtNum(b.assigned)} assigned</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <button
                        onClick={() => { setBatchAssignModal({ batchId: b._id, batchName: b.batchName || b._id, total: b.total }); setBatchAssignAgentId(''); }}
                        className="flex items-center gap-1.5 text-sm bg-violet-600 text-white px-4 py-2 rounded-xl hover:bg-violet-700 font-semibold shadow-sm transition-all">
                        <Users className="h-4 w-4" /> Assign
                      </button>
                      <button
                        onClick={() => { setShareModal({ batchId: b._id, batchName: b.batchName || b._id }); setSelectedAdmins([]); }}
                        className="flex items-center gap-1.5 text-sm bg-[#065F36] text-white px-4 py-2 rounded-xl hover:bg-[#054A2E] font-semibold shadow-sm transition-all">
                        <Share2 className="h-4 w-4" /> Share
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ type: 'batch', batchId: b._id, name: b.batchName || b._id, totalLeads: b.total, successMsg: `Batch "${b.batchName || b._id}" and all its leads deleted.` })}
                        className="flex items-center gap-1 text-sm px-3 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                        title="Delete entire batch">
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Share Modal */}
        {shareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#065F36] to-[#00874A]">
                <div className="flex items-center gap-2">
                  <Share2 className="h-5 w-5 text-white" />
                  <h3 className="text-white font-bold">Share Batch with Admin(s)</h3>
                </div>
                <button onClick={() => setShareModal(null)} className="text-white/70 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-[#E8FFF5] rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-[#065F36]">{shareModal.batchName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">All unshared leads from this batch will be shared with the selected admin(s)</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Select Admin(s)</label>
                  {allAdmins.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No active admins found. Create an admin first.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {allAdmins.map((a) => (
                        <label key={a._id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-[#E8FFF5]/50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedAdmins.includes(a._id)}
                            onChange={(e) => {
                              setSelectedAdmins(prev =>
                                e.target.checked ? [...prev, a._id] : prev.filter(id => id !== a._id)
                              );
                            }}
                            className="w-4 h-4 accent-[#065F36]"
                          />
                          <div>
                            <p className="font-semibold text-gray-800 text-sm">{a.name}</p>
                            <p className="text-xs text-gray-400">{a.email}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShareModal(null)}
                    className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600">
                    Cancel
                  </button>
                  <button onClick={handleShare} disabled={sharing || selectedAdmins.length === 0}
                    className="flex-1 py-2.5 text-sm bg-[#065F36] text-white rounded-xl hover:bg-[#054A2E] disabled:opacity-40 font-bold shadow-sm flex items-center justify-center gap-2">
                    {sharing
                      ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sharing…</>
                      : <><Share2 className="h-4 w-4" /> Share</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  })()}

  {superTab === 'apikey' && (
    <div className="min-h-screen bg-[#F0FFF8]">
      {/* Green breadcrumb bar */}
      <div className="bg-[#065F36] text-white px-6 py-2 flex items-center justify-between border-b border-[#054A2E]">
        <div className="flex items-center gap-1.5 text-xs">
          <Shield className="h-3 w-3 text-white/60" />
          <button onClick={() => setSuperTab('main')} className="text-white/60 hover:text-white transition-colors">Super Admin Portal</button>
          <span className="text-white/30">›</span>
          <span className="text-white font-semibold flex items-center gap-1"><Key className="h-3 w-3" /> Integration Setup</span>
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors">
          <LogOut className="h-3 w-3" /> Logout
        </button>
      </div>
      <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-100">
        <div className="px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => setSuperTab('main')}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-[#065F36] border border-gray-200 hover:border-[#065F36]/30 rounded-xl px-3 py-2 transition-all">
              <ChevronLeft className="h-4 w-4" /> Dashboard
            </button>
            <div className="border-l border-gray-200 pl-3 flex items-center gap-2">
              <div className="p-1.5 bg-amber-100 rounded-lg"><Key className="h-4 w-4 text-amber-600" /></div>
              <div>
                <h1 className="text-gray-800 font-bold text-sm">Integration Setup</h1>
                <p className="text-gray-400 text-xs">API key for your website intake form</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="px-6 py-8 max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
            <div className="p-2.5 bg-[#E8FFF5] rounded-xl">
              <Key className="h-5 w-5 text-[#065F36]" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800">DOM_WEBSITE_API_KEY</h3>
              <p className="text-xs text-gray-400 mt-0.5">Used by the MyCashbridge backend to authenticate lead submissions</p>
            </div>
          </div>

          <div className="p-6">
            {apiKeyLoading ? (
              <div className="flex items-center gap-2 text-gray-400 py-6">
                <span className="w-5 h-5 border-2 border-gray-200 border-t-[#065F36] rounded-full animate-spin" /> Loading key…
              </div>
            ) : apiKey ? (
              <>
                <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-4 py-3">
                  <span className="flex-1 font-mono text-sm text-emerald-400 break-all leading-relaxed">
                    {apiKeyVisible ? apiKey : '•'.repeat(Math.min(apiKey.length, 48))}
                  </span>
                  <button onClick={() => setApiKeyVisible(!apiKeyVisible)}
                    className="text-gray-400 hover:text-white flex-shrink-0 p-1 rounded transition-colors" title={apiKeyVisible ? 'Hide' : 'Show'}>
                    {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(apiKey); toast.success('Copied to clipboard!'); }}
                    className="text-[#7CFC00] hover:text-white flex-shrink-0 p-1 rounded transition-colors" title="Copy">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <p className="text-sm font-bold text-amber-800">How to configure MyCashbridge</p>
                  </div>
                  <p className="text-sm text-amber-700 mb-3">Add these lines to the MyCashbridge backend <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">.env</code> file:</p>
                  <pre className="bg-amber-100 border border-amber-200 rounded-lg p-3 text-xs font-mono text-amber-900 overflow-x-auto whitespace-pre-wrap break-all">
{`DOMESTIC_LMS_URL=http://your-server:5009
DOMESTIC_LMS_API_KEY=${apiKeyVisible ? apiKey : '<show key above>'}`}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-10 text-gray-400">
                <Key className="h-10 w-10 text-gray-200 mb-3" />
                <p className="text-sm">API key not configured in server.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )}

  {/* ════ CHANNEL PARTNERS — MANUAL LEADS ════ */}
  {superTab === 'manual_leads' && (() => {
    const fmtDate = (d) => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

    const OUTCOME_CFG = {
      interested:     { label: 'Interested',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '✅', hdr: 'from-emerald-500 to-teal-600' },
      not_interested: { label: 'Not Interested', cls: 'bg-red-100 text-red-700 border-red-200',             icon: '❌', hdr: 'from-red-500 to-rose-600' },
      callback:       { label: 'Callback',       cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: '📞', hdr: 'from-amber-400 to-orange-500' },
      not_reachable:  { label: 'Not Reachable',  cls: 'bg-orange-100 text-orange-700 border-orange-200',    icon: '📵', hdr: 'from-orange-400 to-amber-500' },
      wrong_number:   { label: 'Wrong Number',   cls: 'bg-gray-100 text-gray-500 border-gray-200',          icon: '❓', hdr: 'from-gray-500 to-gray-600' },
    };

    const CIBIL_LABEL = { below_600:'< 600 (Poor)', '600_699':'600–699 (Fair)', '700_749':'700–749 (Good)', '750_800':'750–800 (Very Good)', above_800:'> 800 (Excellent)', unknown:'Unknown' };

    // Apply disposition + search filters
    const marked    = manualLeads.filter(l => l.callOutcome && l.callOutcome !== '');
    const notMarked = manualLeads.filter(l => !l.callOutcome || l.callOutcome === '');
    const byDisp    = manualFilter === 'marked' ? marked : manualFilter === 'not_marked' ? notMarked : manualLeads;
    const filtered  = !manualSearch ? byDisp : byDisp.filter(l =>
      (l.name || '').toLowerCase().includes(manualSearch.toLowerCase()) ||
      (l.mobile || '').includes(manualSearch) ||
      (l.assignedTo?.name || '').toLowerCase().includes(manualSearch.toLowerCase())
    );

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Page header */}
        <header className="bg-white shadow-sm sticky top-0 z-20 border-b border-gray-100">
          <div className="px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-amber-100 rounded-lg"><Briefcase className="h-4 w-4 text-amber-600" /></div>
              <div>
                <h1 className="text-gray-800 font-bold text-sm">Channel Partners — Manual Leads</h1>
                <p className="text-gray-400 text-xs">Leads filled manually by agents · click any row to see full details</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search manual leads */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Search name, mobile or agent…" value={manualSearch}
                  onChange={e => setManualSearch(e.target.value)}
                  className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white w-52 focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]" />
                {manualSearch && <button onClick={() => setManualSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <button onClick={fetchManualLeads} disabled={manualLeadsLoading}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 transition-all">
                <RefreshCw className={`h-4 w-4 ${manualLeadsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-6 py-5 space-y-4">

          {/* ── Filter tabs + stats ── */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { key: 'all',        label: 'All Leads',   count: manualLeads.length,  color: 'text-gray-700 border-gray-200 bg-white' },
              { key: 'marked',     label: '✅ Marked',    count: marked.length,       color: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
              { key: 'not_marked', label: '⭕ Not Marked', count: notMarked.length,    color: 'text-orange-700 border-orange-200 bg-orange-50' },
            ].map(f => (
              <button key={f.key} onClick={() => setManualFilter(f.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-all ${
                  manualFilter === f.key
                    ? 'ring-2 ring-offset-1 ring-[#065F36] bg-[#065F36] text-white border-[#065F36]'
                    : f.color + ' hover:shadow-sm'
                }`}>
                {f.label}
                <span className={`px-1.5 py-0.5 rounded-lg text-xs font-black ${manualFilter === f.key ? 'bg-white/20' : 'bg-black/8'}`}>
                  {f.count}
                </span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-xl">
                ✍️ Manual entry only · no Excel / website source
              </span>
            </div>
          </div>

          {manualLeadsLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-2xl border border-gray-100">
              <div className="w-10 h-10 border-4 border-gray-100 border-t-amber-500 rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Loading leads…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-5 bg-amber-100 rounded-3xl"><Briefcase className="h-12 w-12 text-amber-500" /></div>
              <div className="text-center">
                <p className="font-bold text-gray-700 text-lg">
                  {manualFilter === 'marked' ? 'No marked leads yet' : manualFilter === 'not_marked' ? 'All leads have been marked!' : 'No manual leads yet'}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {manualFilter === 'all' ? 'Agents create manual leads directly from their dashboard.' : 'Change the filter above to see other leads.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-6 pr-3 py-3.5 text-left">Lead ID</th>
                      <th className="px-3 py-3.5 text-left">Customer</th>
                      <th className="px-3 py-3.5 text-left">Mobile</th>
                      <th className="px-3 py-3.5 text-left">Product</th>
                      <th className="px-3 py-3.5 text-left">City / State</th>
                      <th className="px-3 py-3.5 text-left">Agent</th>
                      <th className="px-3 py-3.5 text-left">Disposition</th>
                      <th className="px-3 py-3.5 text-left">Status</th>
                      <th className="px-3 pr-6 py-3.5 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((l) => {
                      const oc = OUTCOME_CFG[l.callOutcome];
                      const isMarked = !!(l.callOutcome && l.callOutcome !== '');
                      return (
                        <tr key={l._id}
                          onClick={() => setManualLeadDetail(l)}
                          className={`cursor-pointer transition-colors border-l-4 group ${
                            isMarked ? 'border-l-emerald-400 hover:bg-emerald-50/30' : 'border-l-orange-300 hover:bg-orange-50/20'
                          }`}>
                          <td className="pl-6 pr-3 py-3.5">
                            {l.leadRef
                              ? <span className="font-mono text-xs font-bold bg-gray-900 text-emerald-400 px-1.5 py-0.5 rounded">{l.leadRef}</span>
                              : <span className="text-gray-300 text-xs italic">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isMarked ? 'bg-emerald-400' : 'bg-orange-400 animate-pulse'}`} />
                              <div>
                                <p className="font-semibold text-gray-800">{l.name || '—'}</p>
                                {l.email && <p className="text-xs text-gray-400">{l.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-gray-600 font-mono text-xs">
                            <div>{l.mobile || '—'}</div>
                            {l.alternateMobile && <div className="text-gray-400">{l.alternateMobile}</div>}
                          </td>
                          <td className="px-3 py-3.5">
                            {l.productType
                              ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{l.productType.replace(/_/g,' ')}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5 text-gray-500 text-xs">{[l.city, l.state].filter(Boolean).join(', ') || '—'}</td>
                          <td className="px-3 py-3.5 text-gray-600 text-sm">{l.assignedTo?.name || '—'}</td>
                          <td className="px-3 py-3.5">
                            {oc
                              ? <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border ${oc.cls}`}>{oc.icon} {oc.label}</span>
                              : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-orange-50 text-orange-600 border border-orange-200">⭕ Not Marked</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              l.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              l.status === 'rejected'  ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>{l.status}</span>
                          </td>
                          <td className="px-3 pr-6 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        {/* ── Full Lead Detail Modal ── */}
        {manualLeadDetail && (() => {
          const l = manualLeadDetail;
          const oc = OUTCOME_CFG[l.callOutcome];
          const isMarked = !!(l.callOutcome && l.callOutcome !== '');
          const hdrGrad  = oc?.hdr || 'from-[#065F36] to-[#00874A]';
          const fmtMoney = (v) => v ? `₹${Number(v).toLocaleString('en-IN')}` : null;

          const Section = ({ title, children }) => (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{children}</div>
            </div>
          );
          const Field = ({ label, val, highlight }) => val ? (
            <div className={`rounded-xl p-3 ${highlight ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'}`}>
              <p className="text-xs text-gray-400 font-medium">{label}</p>
              <p className={`text-sm font-semibold mt-0.5 capitalize ${highlight ? 'text-amber-800' : 'text-gray-700'}`}>{val}</p>
            </div>
          ) : null;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setManualLeadDetail(null)}>
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>

                {/* Modal header */}
                <div className={`px-6 py-5 rounded-t-3xl bg-gradient-to-r ${hdrGrad} text-white`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {oc ? <span className="text-xl">{oc.icon}</span> : <span className="text-xl">⭕</span>}
                        <span className="text-xl font-black">{l.name || '—'}</span>
                        {l.leadRef && <span className="font-mono text-xs font-bold bg-white/20 text-white px-2 py-0.5 rounded-lg tracking-widest">{l.leadRef}</span>}
                        <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-bold border border-white/30">✍️ Manual</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap text-sm text-white/80">
                        <span>{l.mobile || '—'}</span>
                        {l.alternateMobile && <span>· Alt: {l.alternateMobile}</span>}
                        {l.email && <span>· {l.email}</span>}
                        {(l.city || l.state) && <span>· {[l.city, l.state].filter(Boolean).join(', ')}</span>}
                      </div>
                    </div>
                    <button onClick={() => setManualLeadDetail(null)}
                      className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors flex-shrink-0 ml-3">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">

                  {/* Disposition block */}
                  <div className={`rounded-2xl border-2 p-4 ${
                    !isMarked                            ? 'border-orange-200 bg-orange-50' :
                    l.callOutcome === 'not_interested'   ? 'border-red-200 bg-red-50' :
                    l.callOutcome === 'interested'       ? 'border-emerald-200 bg-emerald-50' :
                    l.callOutcome === 'callback'         ? 'border-amber-200 bg-amber-50' :
                    l.callOutcome === 'not_reachable'    ? 'border-orange-200 bg-orange-50' :
                    'border-gray-200 bg-gray-50'
                  }`}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Disposition & Outcome</p>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      {isMarked ? (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border ${oc?.cls || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {oc?.icon} {oc?.label || l.callOutcome}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-orange-100 text-orange-700 border border-orange-300">
                          ⭕ Not Marked — No Disposition Set
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border ${
                        l.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                        l.status === 'rejected'  ? 'bg-red-100 text-red-700 border-red-300' :
                                                   'bg-blue-100 text-blue-700 border-blue-300'
                      }`}>
                        {l.status === 'completed' ? '✔ Completed' : l.status === 'rejected' ? '✖ Rejected' : '⏳ Pending'}
                      </span>
                      {l.callbackDate && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-violet-100 text-violet-700 border border-violet-300">
                          📅 Callback: {l.callbackDate}
                        </span>
                      )}
                    </div>
                    {l.notes
                      ? <div className="bg-white rounded-xl p-3 border border-gray-200">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Agent Notes / Reason</p>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">"{l.notes}"</p>
                        </div>
                      : <p className="text-xs text-gray-400 italic bg-white rounded-xl p-3 border border-gray-200">No notes added by agent.</p>}
                  </div>

                  {/* Personal details */}
                  <Section title="Personal Details">
                    <Field label="Date of Birth"  val={l.dob} />
                    <Field label="PAN"             val={l.pan} />
                    <Field label="Aadhaar"         val={l.aadhaar} />
                    <Field label="Address"         val={l.address} />
                    <Field label="City"            val={l.city} />
                    <Field label="State"           val={l.state} />
                    <Field label="Pincode"         val={l.pincode} />
                    <Field label="Email"           val={l.email} />
                    <Field label="Alt. Mobile"     val={l.alternateMobile} />
                  </Section>

                  {/* Loan / Product */}
                  <Section title="Loan & Service Details">
                    <Field label="Product / Service" val={l.productType?.replace(/_/g,' ')} highlight />
                    <Field label="Required Amount"   val={fmtMoney(l.loanAmountRequired)} highlight />
                    <Field label="Existing Bank"     val={l.existingBank} />
                    <Field label="Salary Bank"       val={l.salaryAccountBank} />
                  </Section>

                  {/* Employment */}
                  <Section title="Employment">
                    <Field label="Employment Type" val={l.employmentType?.replace(/_/g,' ')} />
                    <Field label="Company / Business" val={l.companyName} />
                    <Field label="Monthly Salary"  val={fmtMoney(l.monthlySalary)} />
                  </Section>

                  {/* Credit */}
                  <Section title="Credit Profile">
                    <Field label="CIBIL Score Range" val={CIBIL_LABEL[l.cibilScoreRange] || l.cibilScoreRange} />
                    <Field label="Monthly EMI"       val={fmtMoney(l.existingEMI)} />
                    {l.existingLoans?.length > 0 && (
                      <div className="col-span-2 bg-gray-50 border border-gray-100 rounded-xl p-3">
                        <p className="text-xs text-gray-400 font-medium mb-1.5">Existing Loans</p>
                        <div className="flex flex-wrap gap-1.5">
                          {l.existingLoans.map((loan, i) => (
                            <span key={i} className="text-xs bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded-lg font-medium">{loan}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Section>

                  {/* Timeline */}
                  <div className="flex items-center gap-5 text-xs text-gray-400 bg-gray-50 rounded-xl p-3 border border-gray-100 flex-wrap">
                    <div><span className="font-semibold text-gray-600">Submitted:</span> {fmtDate(l.createdAt)}</div>
                    {l.updatedAt && l.updatedAt !== l.createdAt && (
                      <div><span className="font-semibold text-gray-600">Updated:</span> {fmtDate(l.updatedAt)}</div>
                    )}
                    {l.assignedTo?.name && (
                      <div><span className="font-semibold text-gray-600">Agent:</span> {l.assignedTo.name}</div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  })()}

    {/* ── Global Delete Confirmation Modal (works on ALL tabs) ── */}
    {deleteConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => setDeleteConfirm(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🗑️</span>
              <h3 className="text-white font-bold text-base">Confirm Delete</h3>
            </div>
          </div>
          <div className="p-6">
            <p className="text-gray-700 text-sm mb-1 font-semibold">You are about to permanently delete:</p>
            <p className="text-gray-500 text-sm bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-4">
              {deleteConfirm.name}
              {deleteConfirm.type === 'batch' && <span className="block text-xs text-orange-600 font-semibold mt-1">⚠️ This will delete all {deleteConfirm.totalLeads ? `${deleteConfirm.totalLeads} ` : ''}leads in the entire batch.</span>}
            </p>
            <p className="text-red-600 text-xs font-semibold mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold transition-colors shadow-sm">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Batch Assign to Agent Modal ── */}
    {batchAssignModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => setBatchAssignModal(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-base">Assign Batch to Agent</h3>
              <p className="text-white/70 text-xs mt-0.5">{batchAssignModal.batchName} · {batchAssignModal.total} leads</p>
            </div>
            <button onClick={() => setBatchAssignModal(null)} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
              All unassigned leads in this batch will be directly assigned to the selected agent.
            </p>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Agent</p>
              <select value={batchAssignAgentId} onChange={e => setBatchAssignAgentId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-500">
                <option value="">— Choose an agent —</option>
                {users.filter(u => u.role === 'domagent' && u.isActive).map(u => (
                  <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
            <button onClick={() => setBatchAssignModal(null)}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 font-medium">
              Cancel
            </button>
            <button onClick={handleBatchAssign} disabled={!batchAssignAgentId || batchAssigning}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 rounded-xl shadow-sm transition-colors">
              {batchAssigning
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Assigning…</>
                : <><Database className="h-4 w-4" /> Assign All Leads</>}
            </button>
          </div>
        </div>
      </div>
    )}

      </div>
    </div>
  );
};

/* ── User Create / Edit Modal ── */
const UserFormModal = ({ title, user: existingUser, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name:     existingUser?.name  || '',
    email:    existingUser?.email || '',
    password: '',
    role:     existingUser?.role  || 'domagent',
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!existingUser;

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEdit && (!form.name || !form.email || !form.password)) {
      toast.error('Name, email, and password are required.'); return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const updates = {};
        if (form.name)     updates.name     = form.name;
        if (form.role)     updates.role     = form.role;
        if (form.password) updates.password = form.password;
        await api.patch(`/domestic-api/admin/users/${existingUser._id}`, updates);
        toast.success('User updated.');
      } else {
        await api.post('/domestic-api/admin/users', form);
        toast.success('User created.');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save user.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#065F36] to-[#00874A]">
          <div className="flex items-center gap-2">
            {isEdit ? <Users className="h-5 w-5 text-white" /> : <UserPlus className="h-5 w-5 text-white" />}
            <h3 className="text-white font-bold">{title}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Full Name {!isEdit && <span className="text-red-500">*</span>}
            </label>
            <input value={form.name} onChange={set('name')} autoFocus
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="e.g. Rajesh Kumar" />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" value={form.email} onChange={set('email')}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="agent@example.com" />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              {isEdit ? 'New Password (leave blank to keep current)' : <>Password <span className="text-red-500">*</span></>}
            </label>
            <input type="password" value={form.password} onChange={set('password')}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="Min 8 characters" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Role</label>
            <select value={form.role} onChange={set('role')}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white text-gray-700">
              <option value="domagent">Agent — can load and work leads</option>
              <option value="dom_admin">Admin — can view all leads + agents</option>
              <option value="dom_superadmin">Super Admin — full access</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 text-sm bg-violet-700 text-white rounded-xl hover:bg-violet-800 disabled:bg-violet-300 font-bold transition-colors shadow-sm">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DomSuperAdminDashboard;

