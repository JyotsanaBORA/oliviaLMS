import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LogOut, RefreshCw, Users, TrendingUp, BarChart2, Search,
  Eye, X, Hash, Globe, Briefcase, CheckCircle2, Clock,
  AlertCircle, UserCheck, Calendar, ChevronLeft, ChevronRight,
  Inbox, Award, Download, FileDown, ExternalLink, FileText,
  Image as ImageIcon, File, Database, UserCheck2, Send, Menu,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api   from '../utils/axios';
import toast from 'react-hot-toast';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never';

/** Returns LOCAL date string YYYY-MM-DD — avoids UTC offset issues in IST */
const localDateStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

/** Compute document completeness from a DomLead's documents array */
const CORE_DOCS     = ['aadhaar_front', 'aadhaar_back', 'pan_card'];
const FINANCIAL_DOCS= ['salary_slip_1', 'bank_statement', 'itr', 'form_16', 'business_proof'];
const getDocStatus = (docs = []) => {
  if (!docs || docs.length === 0) return { status: 'none',    count: 0, label: 'No Docs',   cls: 'bg-gray-100 text-gray-400 border-gray-200' };
  const types = docs.map(d => d.docType);
  const coreCount = CORE_DOCS.filter(t => types.includes(t)).length;
  const hasFinancial = FINANCIAL_DOCS.some(t => types.includes(t));
  if (coreCount >= 2 && hasFinancial) return { status: 'full',    count: docs.length, label: `Full (${docs.length})`,    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  return                                    { status: 'partial', count: docs.length, label: `Partial (${docs.length})`, cls: 'bg-amber-100  text-amber-700  border-amber-200'  };
};

// ── Lead Source colour system ── applied consistently everywhere
const SOURCE_META = {
  website:  { label: 'Website',  emoji: '🌐', badge: 'bg-teal-100 text-teal-700 border border-teal-300',     dot: 'bg-teal-500',   borderL: 'border-l-4 border-l-teal-500',   rowHover: 'hover:bg-teal-50/40'   },
  imported: { label: 'Imported', emoji: '📊', badge: 'bg-violet-100 text-violet-700 border border-violet-300', dot: 'bg-violet-500', borderL: 'border-l-4 border-l-violet-500', rowHover: 'hover:bg-violet-50/40' },
  manual:   { label: 'Manual',   emoji: '✍️', badge: 'bg-gray-100 text-gray-600 border border-gray-300',       dot: 'bg-gray-400',   borderL: 'border-l-4 border-l-gray-300',   rowHover: 'hover:bg-gray-50/40'   },
};
const getSourceMeta = (lead) =>
  lead?.sourceWebsiteLead  ? SOURCE_META.website  :
  lead?.sourceImportedLead ? SOURCE_META.imported :
                             SOURCE_META.manual;

const SourceBadge = ({ lead, size = 'sm' }) => {
  const src = getSourceMeta(lead);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold border ${src.badge} ${size === 'xs' ? 'text-xs' : 'text-xs'}`}>
      {src.emoji} {src.label}
    </span>
  );
};

const STATUS_META = {
  new:       { label: 'New',       cls: 'bg-orange-100 text-orange-800 border border-orange-200' },
  loaded:    { label: 'Loaded',    cls: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
  rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-800 border border-red-200' },
  pending:   { label: 'Pending',   cls: 'bg-blue-100 text-blue-800 border border-blue-200' },
};

const OUTCOME_META = {
  interested:     { label: 'Interested',     cls: 'bg-emerald-100 text-emerald-700' },
  not_interested: { label: 'Not Interested', cls: 'bg-red-100 text-red-700' },
  callback:       { label: 'Callback',       cls: 'bg-amber-100 text-amber-700' },
  not_reachable:  { label: 'Not Reachable',  cls: 'bg-orange-100 text-orange-700' },
  wrong_number:   { label: 'Wrong Number',   cls: 'bg-gray-100 text-gray-600' },
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status];
  return m
    ? <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${m.cls}`}>{m.label}</span>
    : <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">{status || '—'}</span>;
};

const LeadRefBadge = ({ code }) =>
  code
    ? <span className="font-mono text-xs font-bold bg-gray-900 text-emerald-400 px-2 py-0.5 rounded-md tracking-wider whitespace-nowrap border border-gray-700">{code}</span>
    : <span className="text-gray-300 text-xs italic">—</span>;

const TABS = ['overview', 'website_leads', 'dom_leads', 'agents', 'lead_pool', 'assigned_leads'];
const TAB_META = {
  overview:      { label: 'Dashboard',           sub: 'Stats & Pipeline',           Icon: BarChart2, color: 'indigo' },
  website_leads: { label: 'Meta Allocation',      sub: 'Leads from website',         Icon: Globe,     color: 'blue'   },
  dom_leads:     { label: 'Disposition Allocation',    sub: 'Agent submitted leads',      Icon: Briefcase, color: 'purple' },
  agents:        { label: 'Agent Allocation',     sub: 'Rankings & activity',        Icon: Users,     color: 'teal'   },
  lead_pool:     { label: 'Data Pool',            sub: 'Import & assign to agents',  Icon: Database,  color: 'green'  },
  assigned_leads:{ label: 'Assigned Leads',        sub: 'Leads assigned to agents',   Icon: UserCheck, color: 'amber'  },
};

const DomAdminDashboard = ({ initialTab } = {}) => {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState(initialTab || 'overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [stats,    setStats]    = useState(null);
  const [pipeline, setPipeline] = useState([]);

  const [leads,           setLeads]           = useState([]);
  const [leadsTotal,      setLeadsTotal]      = useState(0);
  const [leadsPage,       setLeadsPage]       = useState(1);
  const [statusFilter,    setStatusFilter]    = useState('');
  const [search,          setSearch]          = useState('');
  const [leadsLoading,    setLeadsLoading]    = useState(false);
  const [productTypeFilter, setProductTypeFilter] = useState('');
  const [productTypes,    setProductTypes]    = useState([]);

  // Assign website lead to agent
  const [assignLeadModal,   setAssignLeadModal]   = useState(null); // websiteLead being assigned
  const [assigningWebLead,  setAssigningWebLead]  = useState(false);

  const [domLeads,         setDomLeads]         = useState([]);
  const [domLeadsTotal,    setDomLeadsTotal]     = useState(0);
  const [domLeadsPage,     setDomLeadsPage]      = useState(1);
  const [domSearch,        setDomSearch]         = useState('');
  const [domStatusFilter,  setDomStatusFilter]   = useState('');
  const [domProductFilter, setDomProductFilter]  = useState('');
  const [domLeadsLoading,  setDomLeadsLoading]   = useState(false);

  const [agents,        setAgents]        = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  const [viewLead,    setViewLead]    = useState(null);
  const [viewDomLead, setViewDomLead] = useState(null);
  const [viewDL,      setViewDL]      = useState(null);

  // Lead Pool state (import-leads feature)
  const [poolStats,        setPoolStats]        = useState(null);
  const [poolLeads,        setPoolLeads]        = useState([]);
  const [poolLeadsTotal,   setPoolLeadsTotal]   = useState(0);
  const [poolPage,         setPoolPage]         = useState(1);
  const [poolLoading,      setPoolLoading]      = useState(false);
  const [assignCounts,     setAssignCounts]     = useState({});
  const [assigning,        setAssigning]        = useState(null);
  const [poolStatusFilter, setPoolStatusFilter] = useState('');

  // Assigned Leads tab
  const [assignedLeadsData,       setAssignedLeadsData]       = useState([]);
  const [assignedLeadsTotal,      setAssignedLeadsTotal]      = useState(0);
  const [assignedLeadsPage,       setAssignedLeadsPage]       = useState(1);
  const [assignedLeadsLoading,    setAssignedLeadsLoading]    = useState(false);
  const [assignedSearch,          setAssignedSearch]          = useState('');
  const [assignedDateFrom,        setAssignedDateFrom]        = useState('');
  const [assignedDateTo,          setAssignedDateTo]          = useState('');
  const [assignedSourceType,      setAssignedSourceType]      = useState('all');
  const [assignedDocFilter,       setAssignedDocFilter]       = useState('all'); // 'all'|'none'|'partial'|'full'

  // Date filters for Disposition Allocation tab
  const [domDateFrom,  setDomDateFrom]  = useState('');
  const [domDateTo,    setDomDateTo]    = useState('');
  const [domDocFilter, setDomDocFilter] = useState('all'); // 'all'|'none'|'partial'|'full'
  const [domOutcomeFilter, setDomOutcomeFilter] = useState(''); // '' = all outcomes
  const [domAgentFilter,  setDomAgentFilter]  = useState(''); // '' = all agents

  // Bulk select — website leads
  const [webSelectedIds,  setWebSelectedIds]  = useState(new Set());
  const [webDateFrom,     setWebDateFrom]     = useState('');
  const [webDateTo,       setWebDateTo]       = useState('');
  const [webBulkModal,    setWebBulkModal]    = useState(false);

  // Bulk select — imported / pool leads
  const [poolSelectedIds, setPoolSelectedIds] = useState(new Set());
  const [poolBulkModal,   setPoolBulkModal]   = useState(false);

  // Reassign a single imported lead to a different agent
  const [reassignModal,   setReassignModal]   = useState(null); // the lead being reassigned
  const [reassigning,     setReassigning]     = useState(false);

  // Drag & drop state
  const [dragItem,  setDragItem]  = useState(null); // { id, type: 'website' | 'pool', name }
  const [dropAgent, setDropAgent] = useState(null); // agentId being hovered during drag

  // Agent activity tracker (admin click-to-inspect)
  const [selectedAgent,         setSelectedAgent]         = useState(null);
  const [agentActivity,         setAgentActivity]         = useState({ workedLeads: [], poolLeads: [] });
  const [agentActivityLoading,  setAgentActivityLoading]  = useState(false);
  const [agentLeadDetail,       setAgentLeadDetail]       = useState(null);
  const [agentSearch,           setAgentSearch]           = useState('');

  // Transfer leads modal
  const [transferModal,    setTransferModal]    = useState(false);
  const [transferToAgent,  setTransferToAgent]  = useState('');
  const [transferTypes,    setTransferTypes]    = useState({ website: true, pool: true, worked: false });
  const [transferring,     setTransferring]     = useState(false);

  // Refs hold current filter values so callbacks stay stable (no re-creation on every keystroke)
  const searchRef          = useRef('');
  const statusFilterRef    = useRef('');
  const productTypeRef     = useRef('');
  const domSearchRef       = useRef('');
  const domStatusRef       = useRef('');
  const domProductRef      = useRef('');
  const webDateFromRef     = useRef('');
  const webDateToRef       = useRef('');
  const domDateFromRef     = useRef('');
  const domDateToRef       = useRef('');
  const domDocFilterRef    = useRef('all');
  const domOutcomeRef      = useRef('');
  const domAgentRef        = useRef('');
  const assignedDocFilterRef = useRef('all');

  const statsLoadedRef = useRef(false);
  const [statsLastUpdated, setStatsLastUpdated] = useState(null);
  const [statsRefreshing, setStatsRefreshing] = useState(false);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setStatsRefreshing(true);
    try {
      const [s, p] = await Promise.all([
        api.get('/domestic-api/admin/stats'),
        api.get('/domestic-api/admin/pipeline'),
      ]);
      setStats(s.data?.stats);
      setPipeline(p.data?.pipeline || []);
      statsLoadedRef.current = true;
      setStatsLastUpdated(new Date());
    } catch { if (!silent) toast.error('Failed to load stats.'); }
    finally { setStatsRefreshing(false); }
  }, []);

  // Stable callbacks — read filter values from refs, not from closure state
  const fetchLeads = useCallback(async (page = 1) => {
    setLeadsLoading(true);
    try {
      // When any filter is active, fetch all results so pagination doesn't hide matches
      const anyFilter = searchRef.current.trim() || statusFilterRef.current || productTypeRef.current || webDateFromRef.current || webDateToRef.current;
      const limit = anyFilter ? 500 : 30;
      const q = new URLSearchParams({ page, limit });
      if (statusFilterRef.current)       q.set('status',      statusFilterRef.current);
      if (searchRef.current.trim())      q.set('search',      searchRef.current.trim());
      if (productTypeRef.current)        q.set('productType', productTypeRef.current);
      if (webDateFromRef.current)        q.set('dateFrom',    webDateFromRef.current);
      if (webDateToRef.current)          q.set('dateTo',      webDateToRef.current);
      const res = await api.get(`/domestic-api/website-leads?${q}`);
      setLeads(res.data?.data || []);
      setLeadsTotal(res.data?.pagination?.total || 0);
      setLeadsPage(page);
    } catch { toast.error('Failed to load leads.'); }
    finally { setLeadsLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProductTypes = useCallback(async () => {
    try {
      const res = await api.get('/domestic-api/website-leads/product-types');
      setProductTypes(res.data?.data || []);
    } catch { /* silent */ }
  }, []);

  const fetchDomLeads = useCallback(async (page = 1) => {
    setDomLeadsLoading(true);
    try {
      // When any filter is active, fetch all results so pagination doesn't hide matches
      const anyFilter = domSearchRef.current.trim() || domStatusRef.current || domProductRef.current || domDateFromRef.current || domDateToRef.current || domDocFilterRef.current !== 'all' || domOutcomeRef.current || domAgentRef.current;
      const limit = anyFilter ? 500 : 30;
      const q = new URLSearchParams({ page, limit });
      if (domSearchRef.current.trim())   q.set('search',      domSearchRef.current.trim());
      if (domStatusRef.current)          q.set('status',      domStatusRef.current);
      if (domProductRef.current)         q.set('productType', domProductRef.current);
      if (domDateFromRef.current)        q.set('dateFrom',    domDateFromRef.current);
      if (domDateToRef.current)          q.set('dateTo',      domDateToRef.current);
      if (domOutcomeRef.current)         q.set('callOutcome', domOutcomeRef.current);
      if (domAgentRef.current)           q.set('agentId',     domAgentRef.current);
      const res = await api.get(`/domestic-api/leads?${q}`);
      setDomLeads(res.data?.data || []);
      setDomLeadsTotal(res.data?.pagination?.total || 0);
      setDomLeadsPage(page);
    } catch { toast.error('Failed to load worked leads.'); }
    finally { setDomLeadsLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const res = await api.get('/domestic-api/admin/agents');
      setAgents(res.data?.data || []);
    } catch { toast.error('Failed to load agents.'); }
    finally { setAgentsLoading(false); }
  }, []);

  const handleSelectAgent = useCallback(async (agent) => {
    setSelectedAgent(agent);
    setAgentActivityLoading(true);
    setAgentActivity({ workedLeads: [], poolLeads: [] });
    try {
      const [workedRes, poolRes] = await Promise.all([
        api.get(`/domestic-api/leads?agentId=${agent._id}&limit=15`),
        api.get(`/domestic-api/import-leads?agentId=${agent._id}&limit=15`).catch(() => ({ data: { data: [] } })),
      ]);
      setAgentActivity({
        workedLeads: workedRes.data?.data || [],
        poolLeads:   poolRes.data?.data   || [],
      });
    } catch { toast.error('Failed to load agent activity.'); }
    finally { setAgentActivityLoading(false); }
  }, []);

  const handleTransferLeads = useCallback(async () => {
    if (!transferToAgent) { toast.error('Please select a target agent.'); return; }
    const types = Object.entries(transferTypes).filter(([,v]) => v).map(([k]) => k);
    if (types.length === 0) { toast.error('Select at least one lead type to transfer.'); return; }
    setTransferring(true);
    try {
      const res = await api.post('/domestic-api/admin/agents/transfer-leads', {
        fromAgentId: selectedAgent._id,
        toAgentId:   transferToAgent,
        types,
      });
      toast.success(res.data.message);
      setTransferModal(false);
      setTransferToAgent('');
      setTransferTypes({ website: true, pool: true, worked: false });
      handleSelectAgent(selectedAgent); // refresh activity
      fetchAgents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed.');
    } finally { setTransferring(false); }
  }, [selectedAgent, transferToAgent, transferTypes, handleSelectAgent]);

  const fetchPoolStats = useCallback(async () => {
    try {
      const res = await api.get('/domestic-api/import-leads/pool-stats');
      setPoolStats(res.data || null);
    } catch { /* silent */ }
  }, []);

  const fetchPoolLeads = useCallback(async (page = 1, statusF = '') => {
    setPoolLoading(true);
    try {
      const q = new URLSearchParams({ page, limit: 50 });
      if (statusF) q.set('status', statusF);
      const res = await api.get(`/domestic-api/import-leads?${q}`);
      setPoolLeads(res.data?.data || []);
      setPoolLeadsTotal(res.data?.pagination?.total || 0);
      setPoolPage(page);
    } catch { toast.error('Failed to load lead pool.'); }
    finally { setPoolLoading(false); }
  }, []);

  const handleAssignLeads = useCallback(async (agentId, agentName) => {
    const count = parseInt(assignCounts[agentId], 10);
    if (!count || count < 1) { toast.error('Enter at least 1 lead to assign.'); return; }
    setAssigning(agentId);
    try {
      const res = await api.post('/domestic-api/import-leads/assign', { agentId, count });
      toast.success(res.data.message);
      setAssignCounts((prev) => ({ ...prev, [agentId]: '' }));
      fetchPoolStats();
      fetchPoolLeads(poolPage, poolStatusFilter);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign leads.');
    } finally { setAssigning(null); }
  }, [assignCounts, fetchPoolStats, fetchPoolLeads, poolPage, poolStatusFilter]);

  // Load stats on mount + auto-refresh every 60 seconds
  useEffect(() => {
    fetchStats();
    const timer = setInterval(() => fetchStats(true), 60000); // silent refresh every 60s
    return () => clearInterval(timer);
  }, [fetchStats]);

  // Escape cancels drag
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setDragItem(null); setDropAgent(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetchAssignedLeadsData = useCallback(async (page = 1, search = '', dateFrom = '', dateTo = '', sourceType = 'all') => {
    setAssignedLeadsLoading(true);
    try {
      const promises = [];
      // When any filter is active, fetch all results — no pagination needed
      const anyFilter = search.trim() || dateFrom || dateTo || sourceType !== 'all' || assignedDocFilterRef.current !== 'all';
      const limit = anyFilter ? 500 : 50;

      // Website leads (assigned = status 'loaded' or 'completed')
      if (sourceType === 'all' || sourceType === 'website') {
        const wq = new URLSearchParams({ page, limit, status: 'loaded' });
        if (search.trim()) wq.set('search', search.trim());
        if (dateFrom) wq.set('dateFrom', dateFrom);
        if (dateTo)   wq.set('dateTo', dateTo);
        promises.push(api.get(`/domestic-api/website-leads?${wq}`).then(r =>
          (r.data?.data || []).map(l => ({ ...l, _sourceType: 'website' }))
        ));
      } else {
        promises.push(Promise.resolve([]));
      }

      // Imported leads (assigned = status 'assigned')
      if (sourceType === 'all' || sourceType === 'imported') {
        const iq = new URLSearchParams({ page, limit, status: 'assigned' });
        if (search.trim()) iq.set('search', search.trim());
        if (dateFrom) iq.set('dateFrom', dateFrom);
        if (dateTo)   iq.set('dateTo', dateTo);
        promises.push(api.get(`/domestic-api/import-leads?${iq}`).then(r =>
          (r.data?.data || []).map(l => ({ ...l, _sourceType: 'imported' }))
        ));
      } else {
        promises.push(Promise.resolve([]));
      }

      const [websiteLeads, importedLeads] = await Promise.all(promises);
      const combined = [...websiteLeads, ...importedLeads]
        .sort((a, b) => new Date(b.assignedAt || b.loadedAt || b.createdAt) - new Date(a.assignedAt || a.loadedAt || a.createdAt));

      setAssignedLeadsData(combined);
      setAssignedLeadsTotal(combined.length);
      setAssignedLeadsPage(1);
    } catch { toast.error('Failed to load assigned leads.'); }
    finally { setAssignedLeadsLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load tab data only on tab switch — not on filter changes
  useEffect(() => {
    if (tab === 'website_leads') { fetchLeads(1); fetchProductTypes(); fetchAgents(); }
    if (tab === 'dom_leads')     fetchDomLeads(1);
    if (tab === 'agents')        fetchAgents();
    if (tab === 'lead_pool')     { fetchPoolStats(); fetchPoolLeads(1); fetchAgents(); }
    if (tab === 'assigned_leads') fetchAssignedLeadsData(1);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewLead = useCallback(async (lead) => {
    setViewLead(lead);
    if (lead.domLeadId) {
      try { const r = await api.get(`/domestic-api/leads/${lead.domLeadId}`); setViewDomLead(r.data?.data || null); }
      catch { setViewDomLead(null); }
    } else { setViewDomLead(null); }
  }, []);

  const handleDownloadZip = useCallback(async (leadId, leadRef) => {
    try {
      toast.loading('Preparing download…', { id: 'dl' });
      const token = localStorage.getItem('dom_token');
      const res   = await fetch(`/domestic-api/leads/${leadId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${leadRef || leadId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download ready!', { id: 'dl' });
    } catch (err) { toast.error(`Download failed: ${err.message}`, { id: 'dl' }); }
  }, []);

  const handleAssignWebLead = useCallback(async (leadId, agentId, agentName) => {
    setAssigningWebLead(true);
    try {
      await api.post(`/domestic-api/website-leads/${leadId}/assign`, { agentId });
      toast.success(`Lead assigned to ${agentName}.`);
      setAssignLeadModal(null);
      fetchLeads(leadsPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign lead.');
    } finally { setAssigningWebLead(false); }
  }, [fetchLeads, leadsPage]);

  // Bulk-assign website leads
  const handleWebBulkAssign = useCallback(async (agentId, agentName) => {
    const leadIds = [...webSelectedIds];
    if (!leadIds.length) return;
    setAssigningWebLead(true);
    try {
      const res = await api.post('/domestic-api/website-leads/bulk-assign', { leadIds, agentId });
      toast.success(res.data.message);
      setWebSelectedIds(new Set());
      setWebBulkModal(false);
      fetchLeads(leadsPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk assign failed.');
    } finally { setAssigningWebLead(false); }
  }, [webSelectedIds, fetchLeads, leadsPage]);

  // Bulk-assign pool / imported leads
  const handlePoolBulkAssign = useCallback(async (agentId, agentName) => {
    const leadIds = [...poolSelectedIds];
    if (!leadIds.length) return;
    setAssigning(agentId);
    try {
      const res = await api.post('/domestic-api/import-leads/assign', { agentId, leadIds });
      toast.success(res.data.message);
      setPoolSelectedIds(new Set());
      setPoolBulkModal(false);
      fetchPoolStats();
      fetchPoolLeads(poolPage, poolStatusFilter);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk assign failed.');
    } finally { setAssigning(null); }
  }, [poolSelectedIds, fetchPoolStats, fetchPoolLeads, poolPage, poolStatusFilter]);

  // Reassign a single imported lead to a different agent
  const handleReassign = useCallback(async (agentId, agentName) => {
    if (!reassignModal) return;
    setReassigning(true);
    try {
      const res = await api.patch(`/domestic-api/import-leads/${reassignModal._id}/reassign`, { agentId });
      toast.success(res.data.message);
      setReassignModal(null);
      fetchPoolLeads(poolPage, poolStatusFilter);
      fetchPoolStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reassign failed.');
    } finally { setReassigning(false); }
  }, [reassignModal, fetchPoolLeads, poolPage, poolStatusFilter, fetchPoolStats]);

  // Drag & drop — drop a lead onto an agent
  const handleDrop = useCallback(async (agentId, agentName) => {
    if (!dragItem) return;
    setDropAgent(null);
    const item = dragItem;
    setDragItem(null);
    try {
      if (item.type === 'website') {
        await api.post(`/domestic-api/website-leads/${item.id}/assign`, { agentId });
        toast.success(`"${item.name}" → ${agentName}`);
        fetchLeads(leadsPage);
      } else {
        const res = await api.post('/domestic-api/import-leads/assign', { agentId, leadIds: [item.id] });
        toast.success(res.data.message);
        fetchPoolStats();
        fetchPoolLeads(poolPage, poolStatusFilter);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Assign failed.');
    }
  }, [dragItem, fetchLeads, leadsPage, fetchPoolStats, fetchPoolLeads, poolPage, poolStatusFilter]);

  // Admin marks a worked lead as completed / pending / rejected
  const handleLeadStatusChange = useCallback(async (leadId, newStatus, currentStatus) => {
    if (newStatus === currentStatus) return;
    try {
      await api.patch(`/domestic-api/leads/${leadId}/status`, { status: newStatus });
      const labels = { completed: 'Completed ✅', pending: 'Pending', rejected: 'Rejected ❌' };
      toast.success(`Lead marked as ${labels[newStatus]}`);
      fetchDomLeads(domLeadsPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    }
  }, [fetchDomLeads, domLeadsPage]);

  const handleExportExcel = useCallback(async () => {
    try {
      toast.loading('Exporting Excel…', { id: 'csv' });
      const q = new URLSearchParams();
      if (domSearchRef.current.trim())  q.set('search',      domSearchRef.current.trim());
      if (domStatusRef.current)         q.set('status',      domStatusRef.current);
      if (domProductRef.current)        q.set('productType', domProductRef.current);
      if (domDateFromRef.current)       q.set('dateFrom',    domDateFromRef.current);
      if (domDateToRef.current)         q.set('dateTo',      domDateToRef.current);
      if (domOutcomeRef.current)        q.set('callOutcome', domOutcomeRef.current);
      if (domDocFilterRef.current !== 'all') q.set('docStatus', domDocFilterRef.current);
      if (domAgentRef.current)            q.set('agentId',    domAgentRef.current);
      const token = localStorage.getItem('dom_token');
      const res   = await fetch(`/domestic-api/leads/export?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const agentName = domAgentRef.current ? agents.find(ag => ag._id === domAgentRef.current)?.name?.replace(/\s+/g, '_') : '';
      const suffix = agentName ? `_${agentName}` : domOutcomeRef.current ? `_${domOutcomeRef.current}` : domStatusRef.current ? `_${domStatusRef.current}` : '';
      a.download = `leads${suffix}-${localDateStr()}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Excel exported!', { id: 'csv' });
    } catch (err) { toast.error(`Export failed: ${err.message}`, { id: 'csv' }); }
  }, []);

  const handleExportWithDocs = useCallback(async () => {
    try {
      toast.loading('Building ZIP with documents… This may take a moment.', { id: 'exzip' });
      const q = new URLSearchParams();
      if (domSearchRef.current.trim())  q.set('search',      domSearchRef.current.trim());
      if (domStatusRef.current)         q.set('status',      domStatusRef.current);
      if (domProductRef.current)        q.set('productType', domProductRef.current);
      if (domDateFromRef.current)       q.set('dateFrom',    domDateFromRef.current);
      if (domDateToRef.current)         q.set('dateTo',      domDateToRef.current);
      if (domOutcomeRef.current)        q.set('callOutcome', domOutcomeRef.current);
      if (domDocFilterRef.current !== 'all') q.set('docStatus', domDocFilterRef.current);
      if (domAgentRef.current)            q.set('agentId',    domAgentRef.current);
      const token = localStorage.getItem('dom_token');
      const res   = await fetch(`/domestic-api/leads/export-zip?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `leads-with-docs${domDocFilterRef.current !== 'all' ? `-${domDocFilterRef.current}` : ''}-${localDateStr()}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('ZIP downloaded!', { id: 'exzip' });
    } catch (err) { toast.error(`Export failed: ${err.message}`, { id: 'exzip' }); }
  }, []);

  // Client-side CSV export helper — used for website leads and assigned leads
  const downloadCSV = useCallback((rows, filename) => {
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleExportWebLeads = useCallback(() => {
    if (!leads.length) { toast.error('No leads to export.'); return; }
    const headers = ['Name', 'Mobile', 'City', 'State', 'Product / Service', 'Status', 'PAN', 'Assigned To', 'Date'];
    const rows = leads.map(l => [
      l.name || '', l.mobile || '', l.city || '', l.state || '',
      (l.productType || '').replace(/_/g, ' '), l.status || '', l.pan || '',
      l.loadedBy?.name || 'Unassigned',
      l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-IN') : '',
    ]);
    const suffix = statusFilter ? `_${statusFilter}` : '';
    downloadCSV([headers, ...rows], `meta-leads${suffix}-${localDateStr()}.csv`);
    toast.success(`Exported ${leads.length} leads`);
  }, [leads, statusFilter, downloadCSV]);

  const handleExportAssignedLeads = useCallback(() => {
    if (!assignedLeadsData.length) { toast.error('No assigned leads to export.'); return; }
    const headers = ['Source', 'Name', 'Mobile', 'City', 'Product', 'Assigned To', 'Assigned On', 'Disposition', 'Doc Status'];
    const filtered = assignedDocFilter === 'all' ? assignedLeadsData : assignedLeadsData.filter(l => {
      const isW = l._sourceType === 'website';
      const dList = isW ? (l.domLead?.documents || l.domLeadId?.documents || []) : (l.domLeadId?.documents || []);
      return getDocStatus(dList).status === assignedDocFilter;
    });
    const rows = filtered.map(l => {
      const isW = l._sourceType === 'website';
      const dList = isW ? (l.domLead?.documents || l.domLeadId?.documents || []) : (l.domLeadId?.documents || []);
      return [
        isW ? 'Website/Meta' : 'Imported Pool',
        l.name || '', l.mobile || '', (l.city || l.state || ''),
        ((isW ? l.productType : (l.loanType || l.productType)) || '').replace(/_/g, ' '),
        isW ? (l.loadedBy?.name || '') : (l.assignedTo?.name || ''),
        l.assignedAt || l.loadedAt ? new Date(l.assignedAt || l.loadedAt).toLocaleDateString('en-IN') : '',
        (l.callOutcome || l.workStatus || '').replace(/_/g, ' '),
        getDocStatus(dList).label,
      ];
    });
    downloadCSV([headers, ...rows], `assigned-leads-${localDateStr()}.csv`);
    toast.success(`Exported ${rows.length} leads`);
  }, [assignedLeadsData, assignedDocFilter, downloadCSV]);

  const maxPipeline = useMemo(
    () => pipeline.length ? Math.max(...pipeline.map(p => p.count), 1) : 1,
    [pipeline]
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ════ ADMIN SIDEBAR ════ */}
      <aside className={`${sidebarOpen ? 'w-[210px]' : 'w-14'} flex-shrink-0 flex flex-col h-screen bg-white border-r border-gray-200 shadow-sm transition-all duration-300 overflow-hidden`}>
        {/* Brand strip */}
        <div className="bg-[#065F36] px-3 py-3 flex-shrink-0 flex items-center gap-2">
          {sidebarOpen ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MCB" className="h-4 w-auto object-contain brightness-0 invert" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-[12px] leading-none">MyCashBridge</p>
                <p className="text-white/60 text-[9px] font-medium tracking-wider uppercase mt-0.5">Admin Portal</p>
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

        {/* User pill */}
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
                <p className="text-[#065F36]/70 text-[9px] font-medium mt-1">{user.role === 'dom_admin' ? 'Admin' : 'Super Admin'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 pt-3 pb-2 overflow-y-auto min-h-0">
          {sidebarOpen && <p className="text-gray-400 text-[9px] font-extrabold uppercase tracking-[0.14em] px-2 mb-1.5">OVERVIEW</p>}
          {[{ key: 'overview', Icon: BarChart2, label: 'Dashboard', sub: 'Stats & pipeline' }].map(({ key, Icon, label, sub }) => {
            const isActive = tab === key;
            return (
              <button key={key} onClick={() => setTab(key)} title={!sidebarOpen ? label : undefined}
                className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0 py-2.5'} py-2 rounded-lg transition-all text-left relative group mb-0.5 ${
                  isActive ? 'bg-[#e8f5ed] text-[#065F36]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}>
                {isActive && sidebarOpen && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#065F36] rounded-r-full" />}
                <Icon className={`h-[14px] w-[14px] flex-shrink-0 ${isActive ? 'text-[#065F36]' : 'text-gray-400 group-hover:text-gray-600'}`} />
                {sidebarOpen && (
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold leading-none ${isActive ? 'text-[#065F36]' : 'text-gray-600 group-hover:text-gray-800'}`}>{label}</p>
                    <p className={`text-[10px] mt-1 ${isActive ? 'text-[#065F36]/60' : 'text-gray-400'}`}>{sub}</p>
                  </div>
                )}
              </button>
            );
          })}

          {sidebarOpen && <p className="text-gray-400 text-[9px] font-extrabold uppercase tracking-[0.14em] px-2 mt-3 mb-1.5">ALLOCATIONS</p>}
          {[
            { key: 'website_leads', Icon: Globe,     label: 'Meta Allocation',        sub: 'Website + meta leads'   },
            { key: 'dom_leads',     Icon: Briefcase, label: 'Disposition Allocation', sub: 'Agent submitted leads'  },
            { key: 'agents',        Icon: Users,     label: 'Agent Allocation',        sub: 'Performance & tracking' },
            { key: 'lead_pool',     Icon: Database,  label: 'Data Pool',               sub: 'Import & assign leads'  },
            { key: 'assigned_leads',Icon: UserCheck, label: 'Assigned Leads',          sub: 'Leads assigned to agents'},
          ].map(({ key, Icon, label, sub }) => {
            const isActive = tab === key;
            return (
              <button key={key} onClick={() => setTab(key)} title={!sidebarOpen ? label : undefined}
                className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0 py-2.5'} py-2 rounded-lg transition-all text-left relative group mb-0.5 ${
                  isActive ? 'bg-[#e8f5ed] text-[#065F36]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}>
                {isActive && sidebarOpen && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#065F36] rounded-r-full" />}
                <Icon className={`h-[14px] w-[14px] flex-shrink-0 ${isActive ? 'text-[#065F36]' : 'text-gray-400 group-hover:text-gray-600'}`} />
                {sidebarOpen && (
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold leading-none ${isActive ? 'text-[#065F36]' : 'text-gray-600 group-hover:text-gray-800'}`}>{label}</p>
                    <p className={`text-[10px] mt-1 ${isActive ? 'text-[#065F36]/60' : 'text-gray-400'}`}>{sub}</p>
                  </div>
                )}
              </button>
            );
          })}
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
        <main className="px-6 py-6 space-y-6">

        {/* OVERVIEW */}
        {tab === 'overview' && stats && (
          <>
            {/* Today's Activity Banner */}
            <div className="bg-gradient-to-r from-[#065F36] to-[#00874A] rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/15 rounded-xl"><Calendar className="h-5 w-5" /></div>
                  <div>
                    <p className="font-black text-lg">Today's Activity</p>
                    <p className="text-white/70 text-xs">{new Date().toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</p>
                    {statsLastUpdated && (
                      <p className="text-white/50 text-[10px] mt-0.5">Updated: {statsLastUpdated.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</p>
                    )}
                  </div>
                  <button onClick={() => fetchStats()} disabled={statsRefreshing}
                    className="p-2 bg-white/15 hover:bg-white/25 rounded-xl transition-colors ml-1" title="Refresh stats now">
                    <RefreshCw className={`h-4 w-4 ${statsRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { label: 'New Leads Today', val: stats.websiteLeads.today, color: 'bg-white/20' },
                    { label: 'Unclaimed', val: stats.websiteLeads.new, color: 'bg-amber-500/30' },
                    { label: 'Active Agents', val: stats.agents.active, color: 'bg-emerald-500/30' },
                  ].map(s => (
                    <div key={s.label} className={`${s.color} rounded-xl px-4 py-2.5 text-center min-w-[80px]`}>
                      <p className="text-2xl font-black">{s.val}</p>
                      <p className="text-white/70 text-xs font-medium">{s.label}</p>
                    </div>
                  ))}
                  <button onClick={() => setTab('website_leads')}
                    className="flex items-center gap-1.5 bg-white text-[#065F36] text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-[#E8FFF5] transition-colors shadow-sm">
                    View Leads →
                  </button>
                </div>
              </div>
            </div>

            {/* Assigned Leads Summary */}
            {stats.assigned && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                  <div className="p-3 bg-teal-100 rounded-xl flex-shrink-0"><Globe className="h-5 w-5 text-teal-600" /></div>
                  <div>
                    <p className="text-2xl font-black text-gray-800">{stats.assigned.websiteLeads}</p>
                    <p className="text-xs text-gray-500 font-medium">Website Leads Assigned</p>
                    <p className="text-xs text-teal-600 font-semibold mt-0.5">Currently with agents</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                  <div className="p-3 bg-violet-100 rounded-xl flex-shrink-0"><Database className="h-5 w-5 text-violet-600" /></div>
                  <div>
                    <p className="text-2xl font-black text-gray-800">{stats.assigned.importedLeads}</p>
                    <p className="text-xs text-gray-500 font-medium">Imported Leads Assigned</p>
                    <p className="text-xs text-violet-600 font-semibold mt-0.5">Currently with agents</p>
                  </div>
                </div>
                <div
                  onClick={() => setTab('assigned_leads')}
                  className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all shadow-sm">
                  <div className="p-3 bg-white/20 rounded-xl flex-shrink-0"><UserCheck className="h-5 w-5 text-white" /></div>
                  <div>
                    <p className="text-2xl font-black text-white">{stats.assigned.total}</p>
                    <p className="text-xs text-white/80 font-medium">Total Leads Assigned</p>
                    <p className="text-xs text-white/60 font-semibold mt-0.5">Click to view all →</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={<Globe className="h-5 w-5" />}      label="Total Website Leads"  value={stats.websiteLeads.total}     color="blue"   />
              <KpiCard icon={<AlertCircle className="h-5 w-5"/>} label="New (Unclaimed)"       value={stats.websiteLeads.new}       color="orange" />
              <KpiCard icon={<CheckCircle2 className="h-5 w-5"/>}label="Completed"             value={stats.websiteLeads.completed} color="green"  />
              <KpiCard icon={<TrendingUp className="h-5 w-5" />} label="Conversion Rate"       value={`${stats.conversionRate}%`}  color="violet" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={<Calendar className="h-5 w-5" />}  label="Today's Leads"    value={stats.websiteLeads.today}   color="sky"    />
              <KpiCard icon={<Clock className="h-5 w-5" />}     label="Loaded by Agents" value={stats.websiteLeads.loaded}  color="amber"  />
              <KpiCard icon={<Briefcase className="h-5 w-5" />} label="Worked Leads"     value={stats.domLeads.total}       color="indigo" />
              <KpiCard icon={<UserCheck className="h-5 w-5" />} label="Active Agents"    value={stats.agents.active}        color="teal"   />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-[#065F36] to-[#00A651] rounded-xl shadow-sm">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">Lead Pipeline</h3>
                    <p className="text-xs text-gray-400">Conversion funnel — how leads move through each stage</p>
                  </div>
                </div>
                <button onClick={fetchStats} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-1.5 hover:border-[#065F36] transition-all">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
              </div>
              <div className="space-y-5">
                {pipeline.map((stage, idx) => {
                  const pct = Math.max((stage.count / maxPipeline) * 100, 3);
                  const colors = ['from-blue-500 to-blue-600', 'from-amber-400 to-orange-500', 'from-[#065F36] to-[#00A651]', 'from-violet-500 to-purple-600'];
                  return (
                    <div key={stage.stage}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold text-gray-700">{stage.stage}</span>
                        <span className="text-sm font-black text-gray-800">{stage.count.toLocaleString()}</span>
                      </div>
                      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`absolute inset-y-0 left-0 bg-gradient-to-r ${colors[idx % colors.length]} rounded-full transition-all duration-1000`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      {idx < pipeline.length - 1 && stage.count > 0 && pipeline[idx + 1]?.count > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          {((pipeline[idx + 1].count / stage.count) * 100).toFixed(0)}% proceed to next stage
                        </p>
                      )}
                    </div>
                  );
                })}
                {pipeline.length === 0 && <Empty label="No pipeline data yet." />}
              </div>
            </div>
          </>
        )}

        {/* WEBSITE LEADS */}
        {tab === 'website_leads' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 rounded-xl"><Globe className="h-5 w-5 text-teal-600" /></div>
                <div>
                  <h2 className="font-bold text-gray-800">Meta Allocation</h2>
                  <p className="text-xs text-gray-400">Website + Meta leads — assign unassigned leads to agents</p>
                </div>
              </div>
              {/* Sub-tab toggle */}
              <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
                {[
                  { val: '',          label: 'All Leads',   dot: 'bg-gray-400'    },
                  { val: 'new',       label: 'Unassigned',  dot: 'bg-amber-400'   },
                  { val: 'loaded',    label: 'Assigned',    dot: 'bg-teal-500'    },
                  { val: 'completed', label: 'Completed',   dot: 'bg-emerald-500' },
                ].map(s => (
                  <button key={s.val}
                    onClick={() => { setStatusFilter(s.val); statusFilterRef.current = s.val; fetchLeads(1); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      statusFilter === s.val ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-gray-400" />
                <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); searchRef.current = e.target.value; }}
                  onKeyDown={(e) => e.key === 'Enter' && fetchLeads(1)}
                  placeholder="Search by name, mobile, city…"
                  className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400" />
              </div>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); statusFilterRef.current = e.target.value; fetchLeads(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">All Statuses</option>
                <option value="new">New (Unclaimed)</option>
                <option value="loaded">Loaded by Agent</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
              <select value={productTypeFilter}
                onChange={(e) => { setProductTypeFilter(e.target.value); productTypeRef.current = e.target.value; fetchLeads(1); }}
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
                <optgroup label="─ Cards ─">
                  <option value="credit_card">Credit Card</option>
                </optgroup>
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
              <button onClick={() => fetchLeads(1)}
                className="flex items-center gap-2 text-sm bg-[#065F36] text-white px-4 py-2 rounded-xl hover:bg-[#054A2E] font-semibold">
                <Search className="h-4 w-4" /> Search
              </button>
              {/* Clear all filters */}
              <button
                onClick={() => { setSearch(''); searchRef.current=''; setStatusFilter(''); statusFilterRef.current=''; setProductTypeFilter(''); productTypeRef.current=''; setWebDateFrom(''); webDateFromRef.current=''; setWebDateTo(''); webDateToRef.current=''; fetchLeads(1); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                  (search || statusFilter || productTypeFilter || webDateFrom || webDateTo)
                    ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    : 'bg-gray-50 text-gray-300 border-gray-200 cursor-default'
                }`}
                title="Clear all filters">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
              {/* Export filtered leads */}
              <button onClick={handleExportWebLeads}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                <Download className="h-3.5 w-3.5" /> Export CSV ({leads.length})
              </button>
            </div>
            {/* Date filter row */}
            <div className="px-5 pb-3 flex items-center gap-2 flex-wrap border-b border-gray-100">
              <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-500">Date:</span>
              {[
                { l: 'Today',      f: localDateStr(), t: localDateStr() },
                { l: 'This Week',  f: localDateStr(6), t: localDateStr() },
                { l: 'This Month', f: new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-01', t: localDateStr() },
              ].map(p => (
                <button key={p.l}
                  onClick={() => { setWebDateFrom(p.f); setWebDateTo(p.t); webDateFromRef.current = p.f; webDateToRef.current = p.t; fetchLeads(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${webDateFrom === p.f && webDateTo === p.t ? 'bg-teal-600 text-white border-teal-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-teal-400'}`}>
                  {p.l}
                </button>
              ))}
              <input type="date" value={webDateFrom}
                onChange={e => { setWebDateFrom(e.target.value); webDateFromRef.current = e.target.value; if (e.target.value && webDateToRef.current) fetchLeads(1); }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-500" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={webDateTo}
                onChange={e => { setWebDateTo(e.target.value); webDateToRef.current = e.target.value; if (e.target.value && webDateFromRef.current) fetchLeads(1); }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-500" />
              <button onClick={() => fetchLeads(1)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                Apply
              </button>
              {(webDateFrom || webDateTo) && (
                <button onClick={() => { setWebDateFrom(''); setWebDateTo(''); webDateFromRef.current = ''; webDateToRef.current = ''; fetchLeads(1); }}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Clear
                </button>
              )}
            </div>

            {leadsLoading ? <Spinner /> : leads.length === 0 ? <Empty label="No website leads found." /> : (
              <>
                {/* Bulk action bar */}
                {webSelectedIds.size > 0 && (
                  <div className="flex items-center justify-between px-6 py-3 bg-teal-600 text-white border-b border-teal-700">
                    <span className="text-sm font-bold">{webSelectedIds.size} lead{webSelectedIds.size > 1 ? 's' : ''} selected</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setWebBulkModal(true)}
                        className="flex items-center gap-2 bg-white text-teal-700 text-sm font-bold px-4 py-1.5 rounded-xl hover:bg-teal-50 transition-colors shadow-sm">
                        <UserCheck2 className="h-4 w-4" /> Assign {webSelectedIds.size} to Agent
                      </button>
                      <button onClick={() => setWebSelectedIds(new Set())}
                        className="text-xs text-white/70 hover:text-white px-2">Clear</button>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-4 pr-2 py-3.5 w-10 text-center">
                        <input type="checkbox" className="rounded border-gray-300 accent-teal-600"
                          checked={webSelectedIds.size > 0 && leads.filter(l => l.status === 'new').every(l => webSelectedIds.has(l._id))}
                          onChange={(e) => setWebSelectedIds(e.target.checked ? new Set(leads.filter(l => l.status === 'new').map(l => l._id)) : new Set())}
                        />
                      </th>
                      <th className="pl-2 pr-3 py-3.5 text-left">Customer</th>
                      <th className="px-3 py-3.5 text-left">Mobile</th>
                      <th className="px-3 py-3.5 text-left">City</th>
                      <th className="px-3 py-3.5 text-left">Service</th>
                      <th className="px-3 py-3.5 text-left">Source</th>
                      <th className="px-3 py-3.5 text-left">Status</th>
                      <th className="px-3 py-3.5 text-left">Claimed By</th>
                      <th className="px-3 py-3.5 text-left">Received On</th>
                      <th className="px-3 pr-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {leads.map((lead) => {
                      const isNew     = lead.status === 'new';
                      const isChecked = webSelectedIds.has(lead._id);
                      return (
                        <tr key={lead._id}
                          draggable={isNew}
                          onDragStart={() => isNew && setDragItem({ id: lead._id, type: 'website', name: lead.name || lead.mobile })}
                          onDragEnd={() => { setDragItem(null); setDropAgent(null); }}
                          className={`transition-colors group ${isNew ? 'cursor-grab active:cursor-grabbing' : ''} ${isChecked ? 'bg-teal-50' : 'hover:bg-[#E8FFF5]/60'}`}>
                          <td className="pl-4 pr-2 py-3.5 text-center">
                            {isNew ? (
                              <input type="checkbox" className="rounded border-gray-300 accent-teal-600"
                                checked={isChecked}
                                onChange={(e) => {
                                  const next = new Set(webSelectedIds);
                                  e.target.checked ? next.add(lead._id) : next.delete(lead._id);
                                  setWebSelectedIds(next);
                                }}
                              />
                            ) : <span className="block w-4 h-4" />}
                          </td>
                          <td className="pl-2 pr-3 py-3.5">
                            <div className="flex items-center gap-1.5">
                              {isNew && <span className="text-gray-300 cursor-grab text-base leading-none select-none" title="Drag to assign">⠿</span>}
                              <span className="font-semibold text-gray-800">{lead.name || '—'}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 font-mono text-xs text-gray-600 tracking-wide">{lead.mobile || '—'}</td>
                          <td className="px-3 py-3.5 text-gray-500">{lead.city || '—'}</td>
                          <td className="px-3 py-3.5">
                            {lead.productType
                              ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{lead.productType.replace(/_/g,' ')}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700 border border-teal-200">🌐 Website</span>
                          </td>
                          <td className="px-3 py-3.5"><StatusBadge status={lead.status} /></td>
                          <td className="px-3 py-3.5 text-gray-600 text-sm">{lead.loadedBy?.name || <span className="text-orange-500 text-xs font-medium">Unclaimed</span>}</td>
                          <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(lead.createdAt)}</td>
                          <td className="px-3 pr-6 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => handleViewLead(lead)}
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#065F36] text-white hover:bg-[#054A2E] font-semibold">
                                <Eye className="h-3.5 w-3.5" /> View
                              </button>
                              {isNew && (
                                <button onClick={() => setAssignLeadModal(lead)}
                                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 font-semibold">
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
              </>
            )}
            {(search || statusFilter || productTypeFilter || webDateFrom || webDateTo) ? (
              <div className="px-6 py-3 text-xs text-gray-500 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span>Showing all <strong>{leads.length}</strong> matching leads</span>
                <button className="text-teal-600 font-semibold hover:underline" onClick={() => {
                  setSearch(''); searchRef.current = '';
                  setStatusFilter(''); statusFilterRef.current = '';
                  setProductTypeFilter(''); productTypeRef.current = '';
                  setWebDateFrom(''); webDateFromRef.current = '';
                  setWebDateTo(''); webDateToRef.current = '';
                  fetchLeads(1);
                }}>Clear all filters</button>
              </div>
            ) : (
              <Pagination total={leadsTotal} page={leadsPage} perPage={30} count={leads.length}
                onPrev={() => fetchLeads(leadsPage - 1)} onNext={() => fetchLeads(leadsPage + 1)} />
            )}
          </div>
        )}

        {/* WORKED LEADS */}
        {tab === 'dom_leads' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="p-2 bg-[#E8FFF5] rounded-xl"><Briefcase className="h-5 w-5 text-[#065F36]" /></div>
              <div>
                <h2 className="font-bold text-gray-800">Worked Leads</h2>
                <p className="text-xs text-gray-400">
                  All leads processed by agents — searchable by Lead ID (e.g.{' '}
                  <span className="font-mono text-[#065F36] font-semibold">PL-260611-XXXX</span>)
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-[240px]">
                <Hash className="h-4 w-4 text-[#065F36]/50" />
                <input type="text" value={domSearch} onChange={(e) => { setDomSearch(e.target.value); domSearchRef.current = e.target.value; }}
                  onKeyDown={(e) => e.key === 'Enter' && fetchDomLeads(1)}
                  placeholder="Search by Lead ID, name, mobile, city…"
                  className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400" />
                {domSearch && (
                  <button onClick={() => { setDomSearch(''); domSearchRef.current = ''; }} className="text-gray-400 hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <select value={domStatusFilter} onChange={(e) => { setDomStatusFilter(e.target.value); domStatusRef.current = e.target.value; fetchDomLeads(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">All Statuses</option>
                <option value="pending">⏳ Pending</option>
                <option value="completed">✅ Completed</option>
                <option value="rejected">❌ Rejected</option>
              </select>
              {/* Disposition / Call Outcome filter */}
              <select value={domOutcomeFilter} onChange={(e) => { setDomOutcomeFilter(e.target.value); domOutcomeRef.current = e.target.value; fetchDomLeads(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 font-medium">
                <option value="">🗂 All Dispositions</option>
                <option value="none">— Not Called Yet</option>
                <option value="interested">✅ Interested</option>
                <option value="not_interested">❌ Not Interested</option>
                <option value="callback">📞 Callback</option>
                <option value="not_reachable">📵 Not Reachable</option>
                <option value="not_answering">🔕 Not Answering</option>
                <option value="wrong_number">❓ Wrong Number</option>
                <option value="other">✏️ Other</option>
              </select>
              {/* Agent filter */}
              <select value={domAgentFilter} onChange={(e) => { setDomAgentFilter(e.target.value); domAgentRef.current = e.target.value; fetchDomLeads(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">👤 All Agents</option>
                {[...agents].filter(a => a.isActive).sort((a,b) => a.name.localeCompare(b.name)).map(a => (
                  <option key={a._id} value={a._id}>{a.name}</option>
                ))}
              </select>
              <select value={domProductFilter} onChange={(e) => { setDomProductFilter(e.target.value); domProductRef.current = e.target.value; fetchDomLeads(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">All Services</option>
                <optgroup label="── Loans ──">
                  <option value="personal_loan">Personal Loan</option>
                  <option value="home_loan">Home Loan</option>
                  <option value="car_loan">Car Loan</option>
                  <option value="business_loan">Business Loan</option>
                  <option value="loan_against_property">Loan Against Property</option>
                  <option value="education_loan">Education Loan</option>
                  <option value="gold_loan">Gold Loan</option>
                </optgroup>
                <optgroup label="── Cards ──">
                  <option value="credit_card">Credit Card</option>
                </optgroup>
                <optgroup label="── Insurance ──">
                  <option value="health_insurance">Health Insurance</option>
                  <option value="life_insurance">Life Insurance</option>
                  <option value="motor_insurance">Motor Insurance</option>
                  <option value="travel_insurance">Travel Insurance</option>
                </optgroup>
                <optgroup label="── Investments ──">
                  <option value="mutual_fund">Mutual Fund</option>
                  <option value="sip">SIP</option>
                  <option value="demat">Demat Account</option>
                </optgroup>
              </select>
              <button onClick={() => fetchDomLeads(1)}
                className="flex items-center gap-2 text-sm bg-[#065F36] text-white px-4 py-2 rounded-xl hover:bg-[#054A2E] font-semibold">
                <Search className="h-4 w-4" /> Search
              </button>
              {/* Clear all filters */}
              <button
                onClick={() => { setDomSearch(''); domSearchRef.current=''; setDomStatusFilter(''); domStatusRef.current=''; setDomProductFilter(''); domProductRef.current=''; setDomDateFrom(''); domDateFromRef.current=''; setDomDateTo(''); domDateToRef.current=''; setDomOutcomeFilter(''); domOutcomeRef.current=''; setDomDocFilter('all'); domDocFilterRef.current='all'; setDomAgentFilter(''); domAgentRef.current=''; fetchDomLeads(1); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                  (domSearch || domStatusFilter || domProductFilter || domDateFrom || domDateTo || domOutcomeFilter || domDocFilter !== 'all' || domAgentFilter)
                    ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    : 'bg-gray-50 text-gray-300 border-gray-200 cursor-default'
                }`}
                title="Clear all filters">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
              {/* Doc status filter */}
              <select value={domDocFilter} onChange={e => { setDomDocFilter(e.target.value); domDocFilterRef.current = e.target.value; fetchDomLeads(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]">
                <option value="all">📁 All Docs</option>
                <option value="none">📄 No Docs</option>
                <option value="partial">📎 Partial Docs</option>
                <option value="full">✅ Full Docs</option>
              </select>
              {user.role === 'dom_superadmin' && (
                <>
                  <button onClick={handleExportExcel}
                    className="flex items-center gap-2 text-sm bg-white border border-[#D1FAE5] text-[#065F36] px-4 py-2 rounded-xl hover:bg-[#E8FFF5] font-semibold transition-colors">
                    <FileDown className="h-4 w-4" /> Export Excel
                  </button>
                  <button onClick={handleExportWithDocs}
                    className="flex items-center gap-2 text-sm bg-white border border-blue-200 text-blue-700 px-4 py-2 rounded-xl hover:bg-blue-50 font-semibold transition-colors">
                    <Download className="h-4 w-4" /> Export with Docs
                  </button>
                </>
              )}
            </div>
            {/* Date filter row */}
            <div className="px-5 pb-3 flex items-center gap-2 flex-wrap border-b border-gray-100">
              <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-500">Date:</span>
              {[
                { l: 'Today',      f: localDateStr(),                                                                                                to: localDateStr() },
                { l: 'This Week',  f: localDateStr(6),                                                                           to: localDateStr() },
                { l: 'This Month', f: new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-01',                                                  to: localDateStr() },
              ].map(p => (
                <button key={p.l}
                  onClick={() => { setDomDateFrom(p.f); setDomDateTo(p.to); domDateFromRef.current = p.f; domDateToRef.current = p.to; fetchDomLeads(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${domDateFrom === p.f && domDateTo === p.to ? 'bg-[#065F36] text-white border-[#065F36]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#065F36]/40'}`}>
                  {p.l}
                </button>
              ))}
              <input type="date" value={domDateFrom}
                onChange={e => { setDomDateFrom(e.target.value); domDateFromRef.current = e.target.value; if (e.target.value && domDateToRef.current) fetchDomLeads(1); }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#065F36]" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={domDateTo}
                onChange={e => { setDomDateTo(e.target.value); domDateToRef.current = e.target.value; if (e.target.value && domDateFromRef.current) fetchDomLeads(1); }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#065F36]" />
              <button onClick={() => fetchDomLeads(1)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#065F36] text-white hover:bg-[#054A2E] transition-colors">
                Apply
              </button>
              {(domDateFrom || domDateTo) && (
                <button onClick={() => { setDomDateFrom(''); setDomDateTo(''); domDateFromRef.current = ''; domDateToRef.current = ''; fetchDomLeads(1); }}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">
                  Clear
                </button>
              )}
            </div>

            {domLeadsLoading ? <Spinner /> : domLeads.length === 0 ? <Empty label="No worked leads found. Try adjusting the filters." /> : (
              <>
                {/* Source colour legend */}
                <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-4 flex-wrap">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Lead Source:</span>
                  {Object.values(SOURCE_META).map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{s.emoji} {s.label}</span>
                    </div>
                  ))}
                  <span className="text-xs text-gray-400 ml-auto">← left border colour = source type</span>
                </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-6 pr-3 py-3.5 text-left">Lead ID</th>
                      <th className="px-3 py-3.5 text-left">Customer</th>
                      <th className="px-3 py-3.5 text-left">Mobile</th>
                      <th className="px-3 py-3.5 text-left">City</th>
                      <th className="px-3 py-3.5 text-left">Service</th>
                      <th className="px-3 py-3.5 text-left">Source</th>
                      <th className="px-3 py-3.5 text-left">Handled By</th>
                      <th className="px-3 py-3.5 text-left">Call Outcome</th>
                      <th className="px-3 py-3.5 text-left">Docs</th>
                      <th className="px-3 py-3.5 text-left">Status</th>
                      <th className="px-3 py-3.5 text-left">Created</th>
                      <th className="px-3 pr-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {domLeads.filter(dl => {
                      if (domDocFilter === 'all') return true;
                      const ds = getDocStatus(dl.documents);
                      return ds.status === domDocFilter;
                    }).map((dl) => {
                      const outcome = OUTCOME_META[dl.callOutcome];
                      const statusNote =
                        dl.status === 'pending' && dl.callOutcome === 'interested'    ? 'Docs Pending' :
                        dl.status === 'pending' && dl.callOutcome === 'callback'      ? 'Callback Due' :
                        dl.status === 'pending' && dl.callOutcome === 'not_reachable' ? 'Try Again' :
                        dl.status === 'pending' && !dl.callOutcome                   ? 'Not Called' :
                        null;
                      const src = getSourceMeta(dl);
                      return (
                        <tr key={dl._id} className={`transition-colors group ${src.borderL} ${src.rowHover}`}>
                          <td className="pl-6 pr-3 py-3.5"><LeadRefBadge code={dl.leadRef} /></td>
                          <td className="px-3 py-3.5 font-semibold text-gray-800">{dl.name || '—'}</td>
                          <td className="px-3 py-3.5 font-mono text-xs text-gray-600 tracking-wide">{dl.mobile || '—'}</td>
                          <td className="px-3 py-3.5 text-gray-500">{dl.city || '—'}</td>
                          <td className="px-3 py-3.5">
                            {dl.productType
                              ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{dl.productType.replace(/_/g,' ')}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            <SourceBadge lead={dl} />
                          </td>
                          <td className="px-3 py-3.5 text-gray-700 text-sm">{dl.assignedTo?.name || '—'}</td>
                          <td className="px-3 py-3.5">
                            {outcome
                              ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${outcome.cls}`}>{outcome.label}</span>
                              : <span className="text-gray-300 text-xs">Not called</span>}
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            {(() => { const ds = getDocStatus(dl.documents); return (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border ${ds.cls}`}>
                                {ds.status === 'full' ? '✅' : ds.status === 'partial' ? '📎' : '📄'} {ds.label}
                              </span>
                            ); })()}
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex flex-col gap-0.5">
                              <StatusBadge status={dl.status} />
                              {statusNote && dl.status === 'pending' && (
                                <span className="text-xs text-gray-400 font-medium">{statusNote}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(dl.createdAt)}</td>
                          <td className="px-3 pr-6 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => setViewDL(dl)}
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#065F36] text-white hover:bg-[#054A2E] font-semibold shadow-sm">
                                <Eye className="h-3.5 w-3.5" /> View
                              </button>
                              {dl.status === 'pending' && dl.callOutcome === 'interested' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleLeadStatusChange(dl._id, 'completed', dl.status); }}
                                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-semibold shadow-sm"
                                  title="Mark as Completed — loan processed / case closed">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                                </button>
                              )}
                              {user.role === 'dom_superadmin' && (
                                <button onClick={(e) => { e.stopPropagation(); handleDownloadZip(dl._id, dl.leadRef); }}
                                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold shadow-sm">
                                  <Download className="h-3.5 w-3.5" />
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
              </>
            )}
            {domDocFilter === 'all' && !domSearch && !domStatusFilter && !domProductFilter && !domDateFrom && !domDateTo && !domOutcomeFilter && !domAgentFilter ? (
              <Pagination total={domLeadsTotal} page={domLeadsPage} perPage={30} count={domLeads.length}
                onPrev={() => fetchDomLeads(domLeadsPage - 1)} onNext={() => fetchDomLeads(domLeadsPage + 1)} />
            ) : (
              <div className="px-6 py-3 text-xs text-gray-500 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span>Showing all <strong>{domLeads.filter(dl => domDocFilter === 'all' || getDocStatus(dl.documents).status === domDocFilter).length}</strong> matching leads</span>
                <button className="text-[#065F36] font-semibold hover:underline" onClick={() => {
                  setDomSearch(''); domSearchRef.current = '';
                  setDomStatusFilter(''); domStatusRef.current = '';
                  setDomProductFilter(''); domProductRef.current = '';
                  setDomDateFrom(''); domDateFromRef.current = '';
                  setDomDateTo(''); domDateToRef.current = '';
                  setDomDocFilter('all'); domDocFilterRef.current = 'all';
                  setDomOutcomeFilter(''); domOutcomeRef.current = '';
                  fetchDomLeads(1);
                }}>Clear all filters</button>
              </div>
            )}
          </div>
        )}

        {/* AGENTS */}
        {tab === 'agents' && (
          <div className={selectedAgent ? 'flex gap-5 h-[calc(100vh-170px)]' : 'space-y-5'}>

            {/* ── LEFT: Rankings list ── */}
            <div className={`flex flex-col gap-5 overflow-y-auto ${selectedAgent ? 'w-80 flex-shrink-0' : 'flex-1'}`}>

              {/* Top 3 hero cards — only when no agent selected */}
              {!selectedAgent && !agentsLoading && agents.filter(a => a.isActive).length > 0 && (() => {
                const sorted = [...agents.filter(a => a.isActive)].sort((a, b) => getAgentTier(b).score - getAgentTier(a).score);
                const top3 = sorted.slice(0, 3);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {top3.map((a, i) => {
                      const tier = getAgentTier(a);
                      const conv = a.leadsLoaded > 0 ? Math.round((a.leadsCompleted / a.leadsLoaded) * 100) : 0;
                      const podium = ['🥇', '🥈', '🥉'][i];
                      const gradients = [
                        'from-amber-400 via-orange-400 to-amber-500',
                        'from-slate-400 via-gray-400 to-slate-500',
                        'from-orange-600 via-orange-700 to-amber-700',
                      ];
                      return (
                        <div key={a._id} onClick={() => handleSelectAgent(a)}
                          className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${gradients[i]} text-white shadow-xl cursor-pointer hover:scale-[1.02] transition-transform`}>
                          <div className="absolute top-3 right-3 text-3xl opacity-80">{podium}</div>
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-black text-xl shadow-inner">
                              {a.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-black text-base leading-tight">{a.name}</p>
                              <p className="text-white/70 text-xs">{tier.emoji} {tier.label}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center mb-3">
                            <div className="bg-white/15 rounded-xl py-2">
                              <p className="text-xl font-black">{a.leadsLoaded}</p>
                              <p className="text-white/70 text-xs">Loaded</p>
                            </div>
                            <div className="bg-white/15 rounded-xl py-2">
                              <p className="text-xl font-black">{a.leadsCompleted}</p>
                              <p className="text-white/70 text-xs">Done</p>
                            </div>
                            <div className="bg-white/15 rounded-xl py-2">
                              <p className="text-xl font-black">{a.domLeadsCreated}</p>
                              <p className="text-white/70 text-xs">Worked</p>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-white/70">
                              <span>Conversion Rate</span>
                              <span className="font-bold text-white">{conv}%</span>
                            </div>
                            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                              <div className="h-full bg-white rounded-full transition-all duration-1000"
                                style={{ width: `${conv}%` }} />
                            </div>
                          </div>
                          <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Full agent list */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl shadow-sm">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-800">All Agents — Performance Ranking</h2>
                      <p className="text-xs text-gray-400">Search, inspect, and export agent activity</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Search agents */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search agent name or email…"
                        value={agentSearch}
                        onChange={e => setAgentSearch(e.target.value)}
                        className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white w-52 focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]"
                      />
                      {agentSearch && (
                        <button onClick={() => setAgentSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {/* Export agents CSV */}
                    <button
                      onClick={() => {
                        const filtered = [...agents]
                          .filter(a => !agentSearch || a.name?.toLowerCase().includes(agentSearch.toLowerCase()) || a.email?.toLowerCase().includes(agentSearch.toLowerCase()))
                          .sort((a, b) => getAgentTier(b).score - getAgentTier(a).score);
                        const headers = ['Rank', 'Name', 'Email', 'Status', 'Active', 'Last Login',
                          'Website Leads Loaded', 'Website Leads Completed',
                          'Forms Filled (Total Worked)', 'Pool Leads Assigned', 'Pool Leads Worked',
                          'Interested', 'Callbacks', 'Conversion Rate %'];
                        const rows = filtered.map((a, i) => [
                          i + 1, a.name || '', a.email || '',
                          a.agentStatus || 'available', a.isActive ? 'Yes' : 'No',
                          a.lastLogin ? new Date(a.lastLogin).toLocaleDateString('en-IN') : 'Never',
                          a.leadsLoaded || 0, a.leadsCompleted || 0,
                          a.domLeadsCreated || 0, a.poolAssigned || 0, a.poolWorked || 0,
                          a.interestedCount || 0, a.callbackCount || 0,
                          `${a.conversionRate || 0}%`,
                        ]);
                        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = `agents-${localDateStr()}.csv`;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast.success(`Exported ${filtered.length} agents`);
                      }}
                      className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl px-3 py-2 font-semibold transition-colors">
                      <Download className="h-4 w-4" /> Export CSV
                    </button>
                    <button onClick={fetchAgents}
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 hover:border-[#065F36] transition-all">
                      <RefreshCw className="h-4 w-4" /> Refresh
                    </button>
                  </div>
                </div>

                {agentsLoading ? <Spinner /> : agents.length === 0 ? <Empty label="No agents found." /> : (
                  <div className="divide-y divide-gray-50">
                    {(() => {
                      const filtered = [...agents]
                        .filter(a => !agentSearch || a.name?.toLowerCase().includes(agentSearch.toLowerCase()) || a.email?.toLowerCase().includes(agentSearch.toLowerCase()))
                        .sort((a, b) => getAgentTier(b).score - getAgentTier(a).score);
                      if (filtered.length === 0) return (
                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
                          <Search className="h-8 w-8 text-gray-200" />
                          <p className="text-sm font-medium">No agents match "{agentSearch}"</p>
                          <button onClick={() => setAgentSearch('')} className="text-xs text-[#065F36] hover:underline">Clear search</button>
                        </div>
                      );
                      return filtered.map((a, idx) => {
                      const tier = getAgentTier(a);
                      const conv = a.leadsLoaded > 0 ? Math.round((a.leadsCompleted / a.leadsLoaded) * 100) : 0;
                      const tierStyle = TIER_STYLES[tier.color] || TIER_STYLES.gray;
                      const isSelected = selectedAgent?._id === a._id;
                      return (
                        <div key={a._id}
                          onClick={() => handleSelectAgent(a)}
                          className={`px-6 py-4 cursor-pointer transition-colors border-l-4 ${
                            isSelected ? 'bg-[#E8FFF5] border-l-[#065F36]' :
                            tier.tier === 5 ? 'hover:bg-amber-50/40 border-l-amber-400' :
                            tier.tier === 4 ? 'hover:bg-violet-50/40 border-l-violet-400' :
                            tier.tier === 3 ? 'hover:bg-emerald-50/40 border-l-emerald-400' :
                            tier.tier === 2 ? 'hover:bg-teal-50/40 border-l-teal-300' : 'hover:bg-gray-50/50 border-l-gray-200'
                          }`}>
                          <div className="flex items-center gap-4">
                            {/* Rank + Avatar */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="text-xs font-bold text-gray-300 w-5 text-center">#{idx + 1}</span>
                              <div className="relative">
                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-md ${
                                  tier.tier === 5 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                                  tier.tier === 4 ? 'bg-gradient-to-br from-violet-500 to-purple-600' :
                                  tier.tier === 3 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                                  tier.tier === 1 ? 'bg-gradient-to-br from-sky-400 to-blue-500' :
                                  'bg-gradient-to-br from-[#065F36] to-[#00A651]'
                                }`}>
                                  {a.name?.charAt(0)?.toUpperCase()}
                                </div>
                                <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                                  !a.isActive ? 'bg-gray-300' :
                                  a.agentStatus === 'break'       ? 'bg-amber-400' :
                                  a.agentStatus === 'unavailable' ? 'bg-red-500' :
                                                                     'bg-emerald-500'
                                } ${a.isActive && a.agentStatus === 'available' ? 'animate-pulse' : ''}`} />
                              </div>
                            </div>

                            {/* Info + performance */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-gray-800">{a.name}</span>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${tierStyle}`}>
                                  {tier.emoji} {tier.label}
                                </span>
                                {a.isActive && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                                    a.agentStatus === 'break'       ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                    a.agentStatus === 'unavailable' ? 'bg-red-100 text-red-700 border-red-300' :
                                                                       'bg-emerald-100 text-emerald-700 border-emerald-300'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      a.agentStatus === 'break'       ? 'bg-amber-400 animate-pulse' :
                                      a.agentStatus === 'unavailable' ? 'bg-red-500' :
                                                                         'bg-emerald-500 animate-pulse'
                                    }`} />
                                    {a.agentStatus === 'break' ? '☕ Break' : a.agentStatus === 'unavailable' ? '🔴 Off' : '✅ Live'}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5 truncate">{a.email}</p>
                              {!selectedAgent && (
                                <div className="flex items-center gap-2 mt-2">
                                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-1000 ${
                                      conv >= 65 ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                                      conv >= 45 ? 'bg-gradient-to-r from-violet-500 to-purple-500' :
                                      conv >= 25 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' :
                                      'bg-gradient-to-r from-gray-300 to-gray-400'
                                    }`} style={{ width: `${conv}%` }} />
                                  </div>
                                  <span className={`text-xs font-black w-9 text-right ${
                                    conv >= 65 ? 'text-amber-600' : conv >= 45 ? 'text-violet-600' : conv >= 25 ? 'text-emerald-600' : 'text-gray-400'
                                  }`}>{conv}%</span>
                                  <span className="text-xs text-gray-400">conv.</span>
                                </div>
                              )}
                            </div>

                            {/* Stats row — full when not selected */}
                            {!selectedAgent && (
                              <div className="hidden sm:flex items-center gap-2 flex-shrink-0 flex-wrap">
                                <div className="text-center bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                                  <p className="text-lg font-black text-blue-600">{a.leadsLoaded}</p>
                                  <p className="text-[10px] text-gray-400">Website</p>
                                </div>
                                <div className="text-center bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                                  <p className="text-lg font-black text-emerald-600">{a.domLeadsCreated}</p>
                                  <p className="text-[10px] text-gray-400">Forms Filled</p>
                                </div>
                                <div className="text-center bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                                  <p className="text-lg font-black text-violet-600">{a.poolAssigned || 0}</p>
                                  <p className="text-[10px] text-gray-400">Pool</p>
                                </div>
                                <div className="text-center bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                  <p className="text-lg font-black text-amber-600">{a.interestedCount || 0}</p>
                                  <p className="text-[10px] text-gray-400">Interested</p>
                                </div>
                                <div className={`text-center rounded-xl px-3 py-2 ${conv >= 50 ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50 border border-gray-100'}`}>
                                  <p className={`text-lg font-black ${conv >= 50 ? 'text-emerald-600' : 'text-gray-500'}`}>{conv}%</p>
                                  <p className="text-[10px] text-gray-400">Conv.</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>

            {/* ── RIGHT: Agent Activity Panel ── */}
            {selectedAgent && (
              <div className="flex-1 overflow-y-auto space-y-5">
                {/* Agent header card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-md ${
                        getAgentTier(selectedAgent).tier === 5 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                        getAgentTier(selectedAgent).tier === 4 ? 'bg-gradient-to-br from-violet-500 to-purple-600' :
                        getAgentTier(selectedAgent).tier === 3 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                        'bg-gradient-to-br from-[#065F36] to-[#00A651]'
                      }`}>
                        {selectedAgent.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-gray-800">{selectedAgent.name}</h2>
                        <p className="text-sm text-gray-400">{selectedAgent.email}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${TIER_STYLES[getAgentTier(selectedAgent).color] || TIER_STYLES.gray}`}>
                            {getAgentTier(selectedAgent).emoji} {getAgentTier(selectedAgent).label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            selectedAgent.agentStatus === 'break'       ? 'bg-amber-100 text-amber-700 border-amber-300' :
                            selectedAgent.agentStatus === 'unavailable' ? 'bg-red-100 text-red-700 border-red-300' :
                                                                           'bg-emerald-100 text-emerald-700 border-emerald-300'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              selectedAgent.agentStatus === 'break'       ? 'bg-amber-400 animate-pulse' :
                              selectedAgent.agentStatus === 'unavailable' ? 'bg-red-500' :
                                                                             'bg-emerald-500 animate-pulse'
                            }`} />
                            {selectedAgent.agentStatus === 'break' ? '☕ On Break' : selectedAgent.agentStatus === 'unavailable' ? '🔴 Unavailable' : '✅ Available'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setTransferModal(true); setTransferToAgent(''); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-colors">
                        <Send className="h-3.5 w-3.5" /> Transfer Leads
                      </button>
                      <button onClick={() => { setSelectedAgent(null); setAgentActivity({ workedLeads: [], poolLeads: [] }); }}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="grid grid-cols-4 gap-3 mt-5">
                    {[
                      { label: 'Leads Loaded',  val: selectedAgent.leadsLoaded,     color: 'text-blue-600',    bg: 'bg-blue-50' },
                      { label: 'Completed',      val: selectedAgent.leadsCompleted,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
                      { label: 'Disposition Allocation', val: selectedAgent.domLeadsCreated, color: 'text-[#065F36]',   bg: 'bg-[#E8FFF5]' },
                      { label: 'Pool Assigned',  val: agentActivity.poolLeads.length, color: 'text-violet-600', bg: 'bg-violet-50' },
                    ].map(s => (
                      <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                        <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">Last login: {fmtShort(selectedAgent.lastLogin)}</p>
                </div>

                {agentActivityLoading ? (
                  <div className="flex items-center justify-center py-16 gap-3 bg-white rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 border-4 border-gray-100 border-t-[#065F36] rounded-full animate-spin" />
                    <span className="text-sm text-gray-400">Loading activity…</span>
                  </div>
                ) : (
                  <>
                    {/* Recent Disposition Allocation */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                        <div className="p-2 bg-[#E8FFF5] rounded-xl"><Briefcase className="h-4 w-4 text-[#065F36]" /></div>
                        <div>
                          <h3 className="font-bold text-gray-800 text-sm">Recent Disposition Allocation</h3>
                          <p className="text-xs text-gray-400">Leads this agent has filled the work form for</p>
                        </div>
                      </div>
                      {agentActivity.workedLeads.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">No worked cases yet.</p>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {agentActivity.workedLeads.map((l) => {
                            const src = getSourceMeta(l);
                            return (
                            <div key={l._id}
                              onClick={() => setAgentLeadDetail(l)}
                              className={`px-5 py-3 flex items-center justify-between cursor-pointer transition-colors ${src.borderL} ${src.rowHover}`}>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold bg-gray-900 text-emerald-400 px-1.5 py-0.5 rounded">{l.leadRef || '—'}</span>
                                  <span className="font-semibold text-sm text-gray-800">{l.name || '—'}</span>
                                  <SourceBadge lead={l} />
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">{l.mobile} · {l.productType?.replace(/_/g,' ')} · {fmtDate(l.createdAt)}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {l.callOutcome && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                    l.callOutcome === 'interested'     ? 'bg-emerald-100 text-emerald-700' :
                                    l.callOutcome === 'not_interested' ? 'bg-red-100 text-red-700' :
                                    l.callOutcome === 'callback'       ? 'bg-amber-100 text-amber-700' :
                                    l.callOutcome === 'not_reachable'  ? 'bg-orange-100 text-orange-700' :
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
                      {agentActivity.poolLeads.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">No pool leads assigned.</p>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {agentActivity.poolLeads.slice(0, 10).map((l) => (
                            <div key={l._id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                              <div>
                                <p className="font-semibold text-sm text-gray-800">{l.name || '—'}</p>
                                <p className="text-xs text-gray-400">{l.mobile} · {l.loanType || l.productType || '—'}</p>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                                l.workStatus === 'interested'     ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                l.workStatus === 'not_interested' ? 'bg-red-100 text-red-700 border-red-200' :
                                l.workStatus === 'in_progress'    ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                l.workStatus === 'closed'         ? 'bg-gray-100 text-gray-600 border-gray-200' :
                                'bg-orange-100 text-orange-700 border-orange-200'
                              }`}>{l.workStatus === 'new' ? 'Not Called' : (l.workStatus?.replace(/_/g,' ') || 'New')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Transfer Leads Modal ── */}
            {transferModal && selectedAgent && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-bold text-base">Transfer Leads</h3>
                      <p className="text-white/80 text-xs mt-0.5">Move leads from <strong>{selectedAgent.name}</strong> to another agent</p>
                    </div>
                    <button onClick={() => setTransferModal(false)} className="text-white/80 hover:text-white transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="p-6 space-y-5">
                    {/* From agent (read-only) */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">From Agent</p>
                      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-400 to-red-500 flex items-center justify-center text-white font-black text-sm">
                          {selectedAgent.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 text-sm">{selectedAgent.name}</p>
                          <p className="text-xs text-gray-500">{selectedAgent.email}</p>
                        </div>
                        <div className="ml-auto text-right">
                          <p className="text-xs font-bold text-red-600">{(agentActivity.poolLeads.length || 0) + (agentActivity.workedLeads.length || 0)} leads</p>
                          <p className="text-[10px] text-gray-400">visible</p>
                        </div>
                      </div>
                    </div>

                    {/* To agent (dropdown) */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Transfer To</p>
                      <select
                        value={transferToAgent}
                        onChange={e => setTransferToAgent(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400">
                        <option value="">— Select target agent —</option>
                        {agents.filter(a => a._id !== selectedAgent._id && a.isActive).map(a => (
                          <option key={a._id} value={a._id}>{a.name} ({a.email})</option>
                        ))}
                      </select>
                    </div>

                    {/* Lead types to transfer */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">What to Transfer</p>
                      <div className="space-y-2">
                        {[
                          { key: 'website', label: 'Website / Meta Leads', sub: 'Unworked website leads loaded by this agent', color: 'teal' },
                          { key: 'pool',    label: 'Pool / Imported Leads (Unworked)', sub: 'Imported data leads not yet called', color: 'violet' },
                          { key: 'worked',  label: 'Worked Cases (DomLeads)', sub: 'Already-filled lead forms — reassign ownership', color: 'orange' },
                        ].map(({ key, label, sub, color }) => (
                          <label key={key} className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                            transferTypes[key]
                              ? color === 'teal'   ? 'bg-teal-50 border-teal-300'
                              : color === 'violet' ? 'bg-violet-50 border-violet-300'
                              : 'bg-orange-50 border-orange-300'
                              : 'bg-gray-50 border-gray-200 opacity-70'
                          }`}>
                            <input type="checkbox" className="mt-0.5 accent-amber-500 w-4 h-4 flex-shrink-0"
                              checked={transferTypes[key]}
                              onChange={e => setTransferTypes(prev => ({ ...prev, [key]: e.target.checked }))} />
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

                  {/* Footer */}
                  <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
                    <button onClick={() => setTransferModal(false)}
                      className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleTransferLeads} disabled={!transferToAgent || transferring}
                      className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-sm transition-colors">
                      {transferring
                        ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Transferring…</>
                        : <><Send className="h-4 w-4" /> Confirm Transfer</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Lead Disposition Detail Modal ── */}
            {agentLeadDetail && (() => {
              const l = agentLeadDetail;
              const OUTCOME_CFG = {
                interested:     { label: 'Interested',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: '✅' },
                not_interested: { label: 'Not Interested', cls: 'bg-red-100 text-red-700 border-red-300',             icon: '❌' },
                callback:       { label: 'Callback',       cls: 'bg-amber-100 text-amber-700 border-amber-300',       icon: '📞' },
                not_reachable:  { label: 'Not Reachable',  cls: 'bg-orange-100 text-orange-700 border-orange-300',    icon: '📵' },
                not_answering:  { label: 'Not Answering',  cls: 'bg-slate-100 text-slate-700 border-slate-300',       icon: '🔕' },
                wrong_number:   { label: 'Wrong Number',   cls: 'bg-gray-100 text-gray-600 border-gray-300',          icon: '❓' },
                other:          { label: 'Other',          cls: 'bg-purple-100 text-purple-700 border-purple-300',    icon: '✏️' },
              };
              const oc  = OUTCOME_CFG[l.callOutcome] || { label: l.callOutcome || 'No Disposition', cls: 'bg-gray-100 text-gray-500 border-gray-200', icon: '—' };
              const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
              const CIBIL_LABEL = { below_600:'< 600 (Poor)', '600_699':'600–699 (Fair)', '700_749':'700–749 (Good)', '750_800':'750–800 (Very Good)', above_800:'> 800 (Excellent)', unknown:'Unknown' };

              return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                  onClick={() => setAgentLeadDetail(null)}>
                  <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                    onClick={e => e.stopPropagation()}>

                    {/* Header */}
                    <div className={`px-6 py-5 rounded-t-3xl ${
                      l.callOutcome === 'interested'     ? 'bg-gradient-to-r from-emerald-500 to-teal-600' :
                      l.callOutcome === 'not_interested' ? 'bg-gradient-to-r from-red-500 to-rose-600' :
                      l.callOutcome === 'callback'       ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                      l.callOutcome === 'not_reachable'  ? 'bg-gradient-to-r from-orange-400 to-amber-500' :
                      l.callOutcome === 'not_answering'  ? 'bg-gradient-to-r from-slate-400 to-slate-500' :
                      l.callOutcome === 'wrong_number'   ? 'bg-gradient-to-r from-gray-500 to-gray-600' :
                      l.callOutcome === 'other'          ? 'bg-gradient-to-r from-purple-500 to-violet-600' :
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
                            {(l.city || l.state) && <span className="text-white/60 text-xs">· {[l.city, l.state].filter(Boolean).join(', ')}</span>}
                            <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-bold border border-white/30">
                              {l.sourceWebsiteLead ? '🌐 Website' : l.sourceImportedLead ? '📊 Imported' : '✍️ Manual'}
                            </span>
                          </div>
                        </div>
                        <button onClick={() => setAgentLeadDetail(null)}
                          className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {/* Disposition & Notes */}
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
                        {l.notes ? (
                          <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Agent Notes / Reason</p>
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">"{l.notes}"</p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic bg-white rounded-xl p-4 border border-gray-200">No notes added by agent.</p>
                        )}
                      </div>

                      {/* Info grid */}
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
                            { label: 'City / State',       val: [l.city, l.state].filter(Boolean).join(', ') || null },
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

                      {/* ── Original Imported Data ── */}
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
                      <div className="flex items-center gap-6 text-xs text-gray-400 bg-gray-50 rounded-xl p-4 border border-gray-100 flex-wrap">
                        <div><span className="font-semibold text-gray-600">Submitted:</span> {fmt(l.createdAt)}</div>
                        {l.updatedAt !== l.createdAt && <div><span className="font-semibold text-gray-600">Updated:</span> {fmt(l.updatedAt)}</div>}
                        {l.assignedTo?.name && <div><span className="font-semibold text-gray-600">Agent:</span> {l.assignedTo.name}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* LEAD POOL */}
        {tab === 'lead_pool' && (
          <div className="space-y-5">
            {/* Pool Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="relative overflow-hidden bg-gradient-to-br from-[#065F36] to-[#00874A] rounded-2xl p-5 text-white shadow-lg shadow-green-200">
                <p className="text-sm font-semibold text-white/70">Total in Pool</p>
                <p className="text-4xl font-black mt-1">{poolStats?.stats?.total ?? '—'}</p>
                <p className="text-white/60 text-xs mt-1">All imported leads</p>
                <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
              </div>
              <div className="relative overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-5 text-white shadow-lg shadow-amber-200">
                <p className="text-sm font-semibold text-white/70">Available to Assign</p>
                <p className="text-4xl font-black mt-1">{poolStats?.stats?.available ?? '—'}</p>
                <p className="text-white/60 text-xs mt-1">Not yet assigned to any agent</p>
                <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
              </div>
              <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200">
                <p className="text-sm font-semibold text-white/70">Assigned to Agents</p>
                <p className="text-4xl font-black mt-1">{poolStats?.stats?.assigned ?? '—'}</p>
                <p className="text-white/60 text-xs mt-1">Total across ALL agents (cumulative)</p>
                <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
              </div>
            </div>

            {/* Per-Agent Breakdown */}
            {poolStats?.agentBreakdown?.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Database className="h-4 w-4 text-[#065F36]" />
                  <p className="font-bold text-gray-800 text-sm">Current Assignment per Agent</p>
                  <span className="ml-auto text-xs text-gray-400">These are TOTAL (all-time) leads assigned, not just today's</span>
                </div>
                <div className="flex flex-wrap gap-3 p-4">
                  {[...poolStats.agentBreakdown].sort((a,b) => b.count - a.count).map(b => (
                    <div key={b.agent?._id || b.agent} className="flex items-center gap-2.5 bg-[#f0faf5] border border-[#d1fae5] rounded-xl px-4 py-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#065F36] flex items-center justify-center text-white font-black text-xs flex-shrink-0">
                        {b.agent?.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-sm leading-tight">{b.agent?.name || 'Unknown'}</p>
                        <p className="text-xs text-[#065F36] font-bold">{b.count} leads assigned total</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assign to Agents */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-[#065F36] to-[#00874A] rounded-xl shadow-sm">
                  <Send className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-800">Assign Leads to Agents</h2>
                  <p className="text-xs text-gray-400">Based on agent performance — enter the number of leads to assign</p>
                </div>
              </div>
              {agentsLoading ? <Spinner /> : agents.filter(a => a.isActive).length === 0 ? (
                <Empty label="No active agents available." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                        <th className="pl-6 pr-3 py-3.5 text-left">Agent &amp; Tier</th>
                        <th className="px-3 py-3.5 text-center">Conv.</th>
                        <th className="px-3 py-3.5 text-center">Loaded</th>
                        <th className="px-3 py-3.5 text-center">Done</th>
                        <th className="px-3 py-3.5 text-center">Pool (Total)</th>
                        <th className="px-3 py-3.5 text-center">Assign #</th>
                        <th className="px-3 pr-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[...agents.filter(a => a.isActive)].sort((a, b) => getAgentTier(b).score - getAgentTier(a).score).map((a) => {
                        const tier     = getAgentTier(a);
                        const tierCls  = TIER_STYLES[tier.color] || TIER_STYLES.gray;
                        const conv     = a.leadsLoaded > 0 ? Math.round((a.leadsCompleted / a.leadsLoaded) * 100) : 0;
                        const agentPoolCount = poolStats?.agentBreakdown?.find(
                          b => b.agent?._id === a._id || b.agent === a._id
                        )?.count || 0;
                        const isDropTarget = dragItem && dropAgent === a._id;
                        return (
                          <tr key={a._id}
                            onDragOver={(e) => { if (dragItem) { e.preventDefault(); setDropAgent(a._id); } }}
                            onDragLeave={() => setDropAgent(null)}
                            onDrop={() => handleDrop(a._id, a.name)}
                            className={`transition-all ${isDropTarget ? 'bg-[#E8FFF5] ring-2 ring-inset ring-[#065F36]' : 'hover:bg-gray-50/70'}`}>
                            <td className="pl-6 pr-3 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm flex-shrink-0 ${isDropTarget ? 'scale-110 shadow-md' : ''} transition-transform ${
                                  tier.tier === 5 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                                  tier.tier === 4 ? 'bg-gradient-to-br from-violet-500 to-purple-600' :
                                  tier.tier === 3 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                                  'bg-gradient-to-br from-[#065F36] to-[#00A651]'
                                }`}>
                                  {a.name?.charAt(0)?.toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-gray-800">{a.name}</span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${tierCls}`}>
                                      {tier.emoji} {tier.label}
                                    </span>
                                    {tier.tier === 5 && <span className="text-xs text-amber-600 font-bold">✨ Recommended</span>}
                                  </div>
                                  {isDropTarget
                                    ? <p className="text-xs text-[#065F36] font-bold animate-pulse">Drop to assign!</p>
                                    : <p className="text-xs text-gray-400">{a.email}</p>
                                  }
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-4 text-center">
                              <span className={`text-sm font-black ${conv >= 65 ? 'text-amber-600' : conv >= 45 ? 'text-violet-600' : conv >= 25 ? 'text-emerald-600' : 'text-gray-400'}`}>{conv}%</span>
                            </td>
                            <td className="px-3 py-4 text-center"><span className="font-bold text-blue-700">{a.leadsLoaded}</span></td>
                            <td className="px-3 py-4 text-center"><span className="font-bold text-emerald-700">{a.leadsCompleted}</span></td>
                            <td className="px-3 py-4 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="inline-flex items-center gap-1 font-black text-[#065F36] text-sm">
                                  <Database className="h-3.5 w-3.5" />{agentPoolCount}
                                </span>
                                <span className="text-[10px] text-gray-400 font-medium">total</span>
                              </div>
                            </td>
                            <td className="px-3 py-4 text-center">
                              <input
                                type="number" min="1" max="500"
                                value={assignCounts[a._id] || ''}
                                onChange={(e) => setAssignCounts(prev => ({ ...prev, [a._id]: e.target.value }))}
                                placeholder="e.g. 25"
                                className="w-24 text-center text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#065F36]/30 focus:border-[#065F36]"
                              />
                            </td>
                            <td className="px-3 pr-6 py-4 text-right">
                              <button
                                onClick={() => handleAssignLeads(a._id, a.name)}
                                disabled={assigning === a._id || !assignCounts[a._id]}
                                className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl bg-[#065F36] text-white hover:bg-[#054A2E] font-semibold shadow-sm disabled:opacity-40 transition-all">
                                {assigning === a._id ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                Assign
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Shared Leads Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-100 rounded-xl"><Database className="h-5 w-5 text-violet-600" /></div>
                  <div>
                    <h2 className="font-bold text-gray-800">Import Allocation Pool</h2>
                    <p className="text-xs text-gray-400">Imported Excel leads — track unassigned vs assigned</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Sub-tab toggle */}
                  <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
                    {[
                      { val: '',         label: 'All',         dot: 'bg-gray-400',   count: poolStats?.stats?.total     },
                      { val: 'shared',   label: 'Unassigned',  dot: 'bg-amber-400',  count: poolStats?.stats?.available },
                      { val: 'assigned', label: 'Assigned',    dot: 'bg-violet-500', count: poolStats?.stats?.assigned  },
                    ].map(s => (
                      <button key={s.val}
                        onClick={() => { setPoolStatusFilter(s.val); fetchPoolLeads(1, s.val); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          poolStatusFilter === s.val ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                        {s.label}
                        {s.count !== undefined && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${poolStatusFilter === s.val ? 'bg-violet-100 text-violet-700' : 'bg-gray-200 text-gray-500'}`}>{s.count}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => fetchPoolLeads(poolPage, poolStatusFilter)}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {poolLoading ? <Spinner /> : poolLeads.length === 0 ? (
                <Empty label="No leads in pool. Ask the super admin to share a batch." />
              ) : (
                <>
                  {poolSelectedIds.size > 0 && (
                    <div className="flex items-center justify-between px-6 py-3 bg-violet-600 text-white border-b border-violet-700">
                      <span className="text-sm font-bold">{poolSelectedIds.size} lead{poolSelectedIds.size > 1 ? 's' : ''} selected</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPoolBulkModal(true)}
                          className="flex items-center gap-2 bg-white text-violet-700 text-sm font-bold px-4 py-1.5 rounded-xl hover:bg-violet-50 transition-colors shadow-sm">
                          <UserCheck2 className="h-4 w-4" /> Assign {poolSelectedIds.size} to Agent
                        </button>
                        <button onClick={() => setPoolSelectedIds(new Set())}
                          className="text-xs text-white/70 hover:text-white px-2">Clear</button>
                      </div>
                    </div>
                  )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                        <th className="pl-4 pr-2 py-3.5 w-10 text-center">
                          <input type="checkbox" className="rounded border-gray-300 accent-violet-600"
                            checked={poolSelectedIds.size > 0 && poolLeads.filter(l => !l.assignedTo).every(l => poolSelectedIds.has(l._id))}
                            onChange={(e) => setPoolSelectedIds(e.target.checked ? new Set(poolLeads.filter(l => !l.assignedTo).map(l => l._id)) : new Set())}
                          />
                        </th>
                        <th className="pl-2 pr-3 py-3.5 text-left">Customer</th>
                        <th className="px-3 py-3.5 text-left">Mobile</th>
                        <th className="px-3 py-3.5 text-left">City</th>
                        <th className="px-3 py-3.5 text-left">Product</th>
                        <th className="px-3 py-3.5 text-left">Source</th>
                        <th className="px-3 py-3.5 text-left">Income</th>
                        <th className="px-3 py-3.5 text-left">Assigned To</th>
                        <th className="px-3 py-3.5 text-left">Disposition</th>
                        <th className="px-3 pr-6 py-3.5 text-left">Pool Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {poolLeads.map((l) => {
                        const WS_META = {
                          new:            { label: 'New',            cls: 'bg-orange-100 text-orange-700 border-orange-200' },
                          in_progress:    { label: 'In Progress',    cls: 'bg-blue-100 text-blue-700 border-blue-200' },
                          interested:     { label: 'Interested',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                          not_interested: { label: 'Not Interested', cls: 'bg-red-100 text-red-700 border-red-200' },
                          closed:         { label: 'Closed',         cls: 'bg-gray-100 text-gray-600 border-gray-200' },
                        };
                        const wsInfo = WS_META[l.workStatus || 'new'] || WS_META.new;
                        const isUnassigned = !l.assignedTo;
                        const isChecked    = poolSelectedIds.has(l._id);
                        return (
                        <tr key={l._id}
                          draggable={isUnassigned}
                          onDragStart={() => isUnassigned && setDragItem({ id: l._id, type: 'pool', name: l.name || l.mobile })}
                          onDragEnd={() => { setDragItem(null); setDropAgent(null); }}
                          className={`transition-colors ${isUnassigned ? 'cursor-grab active:cursor-grabbing' : ''} ${isChecked ? 'bg-violet-50' : 'hover:bg-[#E8FFF5]/40'}`}>
                          <td className="pl-4 pr-2 py-3.5 text-center">
                            {isUnassigned ? (
                              <input type="checkbox" className="rounded border-gray-300 accent-violet-600"
                                checked={isChecked}
                                onChange={(e) => {
                                  const next = new Set(poolSelectedIds);
                                  e.target.checked ? next.add(l._id) : next.delete(l._id);
                                  setPoolSelectedIds(next);
                                }}
                              />
                            ) : <span className="block w-4 h-4" />}
                          </td>
                          <td className="pl-2 pr-3 py-3.5">
                            <div className="flex items-center gap-1.5">
                              {isUnassigned && <span className="text-gray-300 text-base leading-none select-none" title="Drag to assign">⠿</span>}
                              <span className="font-semibold text-gray-800">{l.name || '—'}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 font-mono text-xs text-gray-600 tracking-wide">{l.mobile || '—'}</td>
                          <td className="px-3 py-3.5 text-gray-500">{l.city || '—'}</td>
                          <td className="px-3 py-3.5">
                            {l.productType
                              ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{l.productType.replace(/_/g,' ')}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200">
                              📊 Import
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-gray-500 text-xs">{l.monthlyIncome || '—'}</td>
                          <td className="px-3 py-3.5 text-gray-700 text-sm">{l.assignedTo?.name || <span className="text-amber-500 text-xs font-medium">Unassigned</span>}</td>
                          <td className="px-3 py-3.5">
                            {/* Show actual callOutcome disposition — not the mapped workStatus */}
                            {l.callOutcome ? (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                l.callOutcome === 'interested'     ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                l.callOutcome === 'not_interested' ? 'bg-red-100 text-red-700 border-red-200' :
                                l.callOutcome === 'callback'       ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                l.callOutcome === 'not_reachable'  ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                l.callOutcome === 'not_answering'  ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                l.callOutcome === 'wrong_number'   ? 'bg-gray-100 text-gray-500 border-gray-200' :
                                l.callOutcome === 'other'          ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                'bg-gray-100 text-gray-400 border-gray-200'
                              }`}>
                                {l.callOutcome === 'interested'     ? '✅ Interested' :
                                 l.callOutcome === 'not_interested' ? '❌ Not Interested' :
                                 l.callOutcome === 'callback'       ? '📞 Callback' :
                                 l.callOutcome === 'not_reachable'  ? '📵 Not Reachable' :
                                 l.callOutcome === 'not_answering'  ? '🔕 Not Answering' :
                                 l.callOutcome === 'wrong_number'   ? '❓ Wrong No.' :
                                 l.callOutcome === 'other'          ? `✏️ ${l.customCallOutcome || 'Other'}` :
                                 l.callOutcome.replace(/_/g,' ')}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-0.5 rounded-full">Not Called</span>
                            )}
                          </td>
                          <td className="px-3 pr-6 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                l.status === 'assigned'
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-100 text-amber-700 border-amber-200'
                              }`}>
                                {l.status === 'assigned' ? 'Assigned' : 'Available'}
                              </span>
                              {/* Reassign button — only for already-assigned leads */}
                              {l.status === 'assigned' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setReassignModal(l); }}
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200 font-semibold transition-colors"
                                  title="Reassign to a different agent">
                                  <RefreshCw className="h-3 w-3" /> Reassign
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
                </>
              )}
              <Pagination
                total={poolLeadsTotal} page={poolPage} perPage={50} count={poolLeads.length}
                onPrev={() => fetchPoolLeads(poolPage - 1, poolStatusFilter)}
                onNext={() => fetchPoolLeads(poolPage + 1, poolStatusFilter)}
              />
            </div>
          </div>
        )}

        {/* ASSIGNED LEADS */}
        {tab === 'assigned_leads' && (
          <div className="space-y-4">
            {/* Header + filters */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-xl"><UserCheck className="h-5 w-5 text-amber-600" /></div>
                  <div>
                    <h2 className="font-bold text-gray-800">Assigned Leads Tracker</h2>
                    <p className="text-xs text-gray-400">All leads currently assigned to agents — website + imported</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Source type toggle */}
                  <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
                    {[
                      { val: 'all',      label: 'All',            dot: 'bg-gray-400'    },
                      { val: 'website',  label: '🌐 Meta Leads',  dot: 'bg-teal-500'    },
                      { val: 'imported', label: '📊 Imported',    dot: 'bg-violet-500'  },
                    ].map(s => (
                      <button key={s.val}
                        onClick={() => { setAssignedSourceType(s.val); fetchAssignedLeadsData(1, assignedSearch, assignedDateFrom, assignedDateTo, s.val); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          assignedSourceType === s.val ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl font-bold">
                    {assignedLeadsTotal} assigned
                  </span>
                  <button onClick={() => fetchAssignedLeadsData(1, assignedSearch, assignedDateFrom, assignedDateTo, assignedSourceType)} disabled={assignedLeadsLoading}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 transition-all">
                    <RefreshCw className={`h-4 w-4 ${assignedLeadsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Search + Date filter */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-[200px] max-w-xs">
                  <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <input type="text" placeholder="Search name or mobile…" value={assignedSearch}
                    onChange={e => setAssignedSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchAssignedLeadsData(1, assignedSearch, assignedDateFrom, assignedDateTo, assignedSourceType)}
                    className="flex-1 text-sm outline-none bg-transparent min-w-0" />
                </div>
                <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                {[
                  { l: 'Today',      from: localDateStr(), to: localDateStr() },
                  { l: 'This Week',  from: localDateStr(6), to: localDateStr() },
                  { l: 'This Month', from: new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-01', to: localDateStr() },
                ].map(p => (
                  <button key={p.l}
                    onClick={() => { setAssignedDateFrom(p.from); setAssignedDateTo(p.to); fetchAssignedLeadsData(1, assignedSearch, p.from, p.to, assignedSourceType); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${assignedDateFrom === p.from && assignedDateTo === p.to ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-400'}`}>
                    {p.l}
                  </button>
                ))}
                <input type="date" value={assignedDateFrom} onChange={e => { setAssignedDateFrom(e.target.value); if (e.target.value && assignedDateTo) fetchAssignedLeadsData(1, assignedSearch, e.target.value, assignedDateTo, assignedSourceType); }}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-400" />
                <span className="text-gray-400 text-xs">to</span>
                <input type="date" value={assignedDateTo} onChange={e => { setAssignedDateTo(e.target.value); if (e.target.value && assignedDateFrom) fetchAssignedLeadsData(1, assignedSearch, assignedDateFrom, e.target.value, assignedSourceType); }}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-400" />
                <button onClick={() => fetchAssignedLeadsData(1, assignedSearch, assignedDateFrom, assignedDateTo, assignedSourceType)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors">
                  Search
                </button>
                {/* Doc status filter */}
                <select value={assignedDocFilter} onChange={e => { setAssignedDocFilter(e.target.value); assignedDocFilterRef.current = e.target.value; fetchAssignedLeadsData(1, assignedSearch, assignedDateFrom, assignedDateTo, assignedSourceType); }}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400">
                  <option value="all">📁 All Docs</option>
                  <option value="none">📄 No Docs</option>
                  <option value="partial">📎 Partial</option>
                  <option value="full">✅ Full Docs</option>
                </select>
                {/* Clear all — always visible, red when active */}
                <button
                  onClick={() => { setAssignedSearch(''); setAssignedDateFrom(''); setAssignedDateTo(''); setAssignedDocFilter('all'); assignedDocFilterRef.current='all'; setAssignedSourceType('all'); fetchAssignedLeadsData(1); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    (assignedSearch || assignedDateFrom || assignedDateTo || assignedDocFilter !== 'all' || assignedSourceType !== 'all')
                      ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                      : 'bg-gray-50 text-gray-300 border-gray-200 cursor-default'
                  }`}
                  title="Clear all filters">
                  <X className="h-3 w-3" /> Clear
                </button>
                {/* Export filtered assigned leads */}
                <button onClick={handleExportAssignedLeads}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>

              {/* Table */}
              {assignedLeadsLoading ? <Spinner /> : assignedLeadsData.length === 0 ? (
                <Empty label={`No ${assignedSourceType === 'website' ? 'meta/website' : assignedSourceType === 'imported' ? 'imported' : ''} assigned leads found.`} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                        <th className="pl-6 pr-3 py-3.5 text-left">Source</th>
                        <th className="px-3 py-3.5 text-left">Customer</th>
                        <th className="px-3 py-3.5 text-left">Mobile</th>
                        <th className="px-3 py-3.5 text-left">Product / Loan</th>
                        <th className="px-3 py-3.5 text-left">Assigned To</th>
                        <th className="px-3 py-3.5 text-left">Assigned On</th>
                        <th className="px-3 py-3.5 text-left">Docs</th>
                        <th className="px-3 pr-6 py-3.5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {assignedLeadsData.filter(l => {
                        if (assignedDocFilter === 'all') return true;
                        const isWebsite = l._sourceType === 'website';
                        const docList = isWebsite ? (l.domLead?.documents || l.domLeadId?.documents || []) : (l.domLeadId?.documents || []);
                        return getDocStatus(docList).status === assignedDocFilter;
                      }).map((l) => {
                        const isWebsite = l._sourceType === 'website';
                        const agentName = isWebsite ? l.loadedBy?.name : l.assignedTo?.name;
                        const agentEmail = isWebsite ? l.loadedBy?.email : l.assignedTo?.email;
                        const assignedOn = isWebsite ? (l.loadedAt || l.createdAt) : (l.assignedAt || l.createdAt);
                        const product = isWebsite ? l.productType : (l.loanType || l.productType);
                        const statusLabel = isWebsite
                          ? (l.status === 'loaded' ? 'With Agent' : l.status === 'completed' ? 'Completed' : l.status)
                          : (l.callOutcome?.replace(/_/g,' ') || l.workStatus?.replace(/_/g,' ') || 'Not Called');
                        const statusCls = isWebsite
                          ? (l.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700')
                          : ({ interested:'bg-emerald-100 text-emerald-700', not_interested:'bg-red-100 text-red-700', callback:'bg-amber-100 text-amber-700', not_reachable:'bg-orange-100 text-orange-700' }[l.callOutcome] || 'bg-gray-100 text-gray-500');
                        // Doc status: for website leads use domLead docs, for imported use domLeadId docs
                        const docList = isWebsite ? (l.domLead?.documents || l.domLeadId?.documents || []) : (l.domLeadId?.documents || []);
                        const docStat = getDocStatus(docList);
                        return (
                          <tr key={l._id} className={`transition-colors border-l-4 ${isWebsite ? 'hover:bg-teal-50/30 border-l-teal-400' : 'hover:bg-violet-50/30 border-l-violet-400'}`}>
                            <td className="pl-6 pr-3 py-3.5">
                              {isWebsite
                                ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500 text-white">🌐 Meta</span>
                                : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200">📊 Imported</span>}
                            </td>
                            <td className="px-3 py-3.5">
                              <p className="font-semibold text-gray-800">{l.name || '—'}</p>
                              <p className="text-xs text-gray-400">{l.city || l.state || ''}</p>
                            </td>
                            <td className="px-3 py-3.5 font-mono text-xs text-gray-600">{l.mobile || '—'}</td>
                            <td className="px-3 py-3.5">
                              {product
                                ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize border ${isWebsite ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-violet-100 text-violet-700 border-violet-200'}`}>{product.replace(/_/g,' ')}</span>
                                : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-3 py-3.5">
                              {agentName ? (
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isWebsite ? 'bg-teal-600' : 'bg-[#065F36]'}`}>
                                    {agentName?.charAt(0)?.toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-gray-800">{agentName}</p>
                                    {agentEmail && <p className="text-xs text-gray-400">{agentEmail}</p>}
                                  </div>
                                </div>
                              ) : <span className="text-amber-500 text-xs font-medium">Unassigned</span>}
                            </td>
                            <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                              {assignedOn ? new Date(assignedOn).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                            </td>
                            <td className="px-3 py-3.5">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border ${docStat.cls}`}>
                                {docStat.status === 'full' ? '✅' : docStat.status === 'partial' ? '📎' : '📄'} {docStat.label}
                              </span>
                              {(l.callOutcome === 'interested' || l.workStatus === 'interested') && docStat.status === 'full' && (
                                <div className="mt-0.5 text-[10px] font-bold text-emerald-600">🔥 Ready</div>
                              )}
                              {(l.callOutcome === 'interested' || l.workStatus === 'interested') && docStat.status === 'partial' && (
                                <div className="mt-0.5 text-[10px] font-bold text-amber-600">⚠️ Docs needed</div>
                              )}
                            </td>
                            <td className="px-3 pr-6 py-3.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusCls}`}>
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {(assignedSearch || assignedDateFrom || assignedDateTo || assignedDocFilter !== 'all' || assignedSourceType !== 'all') ? (
              <div className="px-6 py-3 text-xs text-gray-500 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span>Showing all <strong>{assignedLeadsData.filter(l => {
                  if (assignedDocFilter === 'all') return true;
                  const isW = l._sourceType === 'website';
                  const dList = isW ? (l.domLead?.documents || l.domLeadId?.documents || []) : (l.domLeadId?.documents || []);
                  return getDocStatus(dList).status === assignedDocFilter;
                }).length}</strong> matching leads</span>
                <button className="text-amber-600 font-semibold hover:underline" onClick={() => {
                  setAssignedSearch('');
                  setAssignedDateFrom('');
                  setAssignedDateTo('');
                  setAssignedDocFilter('all'); assignedDocFilterRef.current = 'all';
                  setAssignedSourceType('all');
                  fetchAssignedLeadsData(1);
                }}>Clear all filters</button>
              </div>
            ) : (
              <Pagination total={assignedLeadsTotal} page={1} perPage={50} count={assignedLeadsData.length}
                onPrev={() => {}} onNext={() => {}} />
            )}
          </div>
        )}
      </main>

      {/* ── Floating drag-drop agent panel ──────────────────────────────── */}
      {dragItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none w-full max-w-2xl px-4">
          <div className="bg-gray-900/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/10 pointer-events-auto">
            <p className="text-xs text-white/60 font-semibold uppercase tracking-wide text-center mb-3">
              Drop onto an agent to assign <strong className="text-white">"{dragItem.name}"</strong>
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {agents.filter(a => a.isActive).map((a) => (
                <div key={a._id}
                  onDragOver={(e) => { e.preventDefault(); setDropAgent(a._id); }}
                  onDragLeave={() => setDropAgent(null)}
                  onDrop={() => handleDrop(a._id, a.name)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                    dropAgent === a._id
                      ? 'bg-[#065F36] border-[#00A651] text-white scale-105 shadow-lg shadow-green-500/30'
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                  }`}>
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#065F36] to-[#00A651] flex items-center justify-center text-white font-bold text-xs">
                    {a.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold">{a.name}</span>
                  {dropAgent === a._id && <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">Drop here</span>}
                </div>
              ))}
            </div>
            <button onMouseDown={() => setDragItem(null)}
              className="mt-3 block mx-auto text-xs text-white/40 hover:text-white/70 transition-colors">
              Cancel (Esc)
            </button>
          </div>
        </div>
      )}

      {/* ── Website Leads Bulk Assign Modal ──────────────────────────────── */}
      {webBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-teal-600 to-teal-700">
              <div className="flex items-center gap-2">
                <UserCheck2 className="h-5 w-5 text-white" />
                <h3 className="text-white font-bold">Bulk Assign {webSelectedIds.size} Website Leads</h3>
              </div>
              <button onClick={() => setWebBulkModal(false)} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-2xl font-black text-teal-700">{webSelectedIds.size}</span>
                <div>
                  <p className="text-sm font-semibold text-teal-800">🌐 Website leads selected</p>
                  <p className="text-xs text-teal-600">Pick an agent to assign all of them at once</p>
                </div>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {agents.filter(a => a.isActive).map((a) => (
                  <button key={a._id} onClick={() => handleWebBulkAssign(a._id, a.name)}
                    disabled={assigningWebLead}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-teal-50 hover:border-teal-200 transition-colors text-left disabled:opacity-50">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {a.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800 text-sm">{a.name}</p>
                      <p className="text-xs text-gray-400">{a.leadsLoaded || 0} loaded · {a.leadsCompleted || 0} done</p>
                    </div>
                    {assigningWebLead && <span className="w-4 h-4 border-2 border-teal-400 border-t-teal-700 rounded-full animate-spin" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setWebBulkModal(false)}
                className="w-full py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pool Leads Bulk Assign Modal ─────────────────────────────────── */}
      {poolBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-violet-600 to-purple-700">
              <div className="flex items-center gap-2">
                <UserCheck2 className="h-5 w-5 text-white" />
                <h3 className="text-white font-bold">Bulk Assign {poolSelectedIds.size} Import Leads</h3>
              </div>
              <button onClick={() => setPoolBulkModal(false)} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-2xl font-black text-violet-700">{poolSelectedIds.size}</span>
                <div>
                  <p className="text-sm font-semibold text-violet-800">📊 Imported leads selected</p>
                  <p className="text-xs text-violet-600">Pick an agent to assign all of them at once</p>
                </div>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {agents.filter(a => a.isActive).map((a) => (
                  <button key={a._id} onClick={() => handlePoolBulkAssign(a._id, a.name)}
                    disabled={!!assigning}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-violet-50 hover:border-violet-200 transition-colors text-left disabled:opacity-50">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {a.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800 text-sm">{a.name}</p>
                      <p className="text-xs text-gray-400">{a.leadsLoaded || 0} loaded · {a.leadsCompleted || 0} done</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setPoolBulkModal(false)}
                className="w-full py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reassign Imported Lead Modal ─────────────────────────────────── */}
      {reassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-orange-500 to-orange-600">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-white" />
                <h3 className="text-white font-bold">Reassign Lead to Different Agent</h3>
              </div>
              <button onClick={() => setReassignModal(null)} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Lead info */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-orange-900">{reassignModal.name || '—'}</p>
                <p className="text-xs text-orange-600 mt-0.5">
                  {reassignModal.mobile}
                  {reassignModal.loanType && ` · ${reassignModal.loanType}`}
                  {reassignModal.state && ` · ${reassignModal.state}`}
                </p>
                {reassignModal.assignedTo && (
                  <p className="text-xs text-orange-500 mt-1 font-medium">
                    Currently assigned to: <strong>{reassignModal.assignedTo?.name || reassignModal.assignedTo}</strong>
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Select New Agent <span className="text-red-500">*</span>
                  <span className="ml-2 normal-case font-normal text-gray-400">— Sorted by performance</span>
                </p>
                {agents.filter(a => a.isActive).length === 0 ? (
                  <p className="text-sm text-gray-400">No active agents available.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {[...agents.filter(a => a.isActive)].sort((a, b) => getAgentTier(b).score - getAgentTier(a).score).map((a) => {
                      const tier    = getAgentTier(a);
                      const tierCls = TIER_STYLES[tier.color] || TIER_STYLES.gray;
                      const conv    = a.leadsLoaded > 0 ? Math.round((a.leadsCompleted / a.leadsLoaded) * 100) : 0;
                      const isCurrent = reassignModal.assignedTo?._id === a._id || reassignModal.assignedTo === a._id;
                      return (
                        <button key={a._id}
                          onClick={() => !isCurrent && handleReassign(a._id, a.name)}
                          disabled={reassigning || isCurrent}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                            isCurrent
                              ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                              : tier.tier === 5
                                ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                                : 'border-gray-100 hover:bg-orange-50 hover:border-orange-200'
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
                              {isCurrent && <span className="text-xs text-gray-400 font-medium">(current)</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{conv}% conv · {a.leadsLoaded || 0} loaded</p>
                          </div>
                          {reassigning && <span className="w-4 h-4 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button onClick={() => setReassignModal(null)}
                className="w-full py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Website Lead Modal */}
      {assignLeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#065F36] to-[#00874A]">
              <div className="flex items-center gap-2">
                <UserCheck2 className="h-5 w-5 text-white" />
                <h3 className="text-white font-bold">Assign Lead to Agent</h3>
              </div>
              <button onClick={() => setAssignLeadModal(null)} className="text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[#E8FFF5] rounded-xl px-4 py-3 border border-[#D1FAE5]">
                <p className="text-sm font-semibold text-[#065F36]">{assignLeadModal.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  🌐 Website Lead · {assignLeadModal.mobile}
                  {assignLeadModal.productType && ` · ${assignLeadModal.productType.replace(/_/g,' ')}`}
                  {assignLeadModal.city && ` · ${assignLeadModal.city}`}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Select Agent <span className="text-red-500">*</span>
                  <span className="ml-2 normal-case font-normal text-gray-400">Sorted by performance</span>
                </p>
                {agents.filter(a => a.isActive).length === 0 ? (
                  <p className="text-sm text-gray-400">No active agents available.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {[...agents.filter(a => a.isActive)].sort((a, b) => getAgentTier(b).score - getAgentTier(a).score).map((a) => {
                      const tier    = getAgentTier(a);
                      const tierCls = TIER_STYLES[tier.color] || TIER_STYLES.gray;
                      const conv    = a.leadsLoaded > 0 ? Math.round((a.leadsCompleted / a.leadsLoaded) * 100) : 0;
                      return (
                        <button key={a._id}
                          onClick={() => handleAssignWebLead(assignLeadModal._id, a._id, a.name)}
                          disabled={assigningWebLead}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left disabled:opacity-50 ${
                            a.agentStatus === 'unavailable' ? 'border-red-100 bg-red-50/50 opacity-60' :
                            a.agentStatus === 'break'       ? 'border-amber-100 bg-amber-50/50' :
                            tier.tier === 5                 ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' :
                                                              'border-gray-100 hover:bg-[#E8FFF5] hover:border-[#D1FAE5]'
                          }`}>
                          <div className="relative">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                              tier.tier === 5 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                              tier.tier === 4 ? 'bg-gradient-to-br from-violet-500 to-purple-600' :
                              tier.tier === 3 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                              'bg-gradient-to-br from-[#065F36] to-[#00A651]'
                            }`}>
                              {a.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                              a.agentStatus === 'break'       ? 'bg-amber-400' :
                              a.agentStatus === 'unavailable' ? 'bg-red-500' :
                                                                 'bg-emerald-500'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-800 text-sm">{a.name}</p>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${tierCls}`}>
                                {tier.emoji} {tier.label}
                              </span>
                            </div>
                            <p className="text-xs mt-0.5">
                              <span className="text-gray-400">{conv}% conv · {a.leadsLoaded || 0} loaded</span>
                              {a.agentStatus !== 'available' && (
                                <span className={`ml-2 font-semibold ${a.agentStatus === 'break' ? 'text-amber-600' : 'text-red-600'}`}>
                                  {a.agentStatus === 'break' ? '☕ On Break' : '🔴 Unavailable'}
                                </span>
                              )}
                            </p>
                          </div>
                          {tier.tier === 5 && a.agentStatus === 'available' && (
                            <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded-lg flex-shrink-0">
                              Best ✨
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button onClick={() => setAssignLeadModal(null)}
                className="w-full py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Website Lead Modal */}
      {viewLead && (
        <Modal title="Website Lead Details" subtitle={`Received on ${fmtDate(viewLead.createdAt)}`}
          onClose={() => { setViewLead(null); setViewDomLead(null); }} color="blue"
          size={viewDomLead?.documents?.length ? 'xl' : 'lg'}>
          {viewDomLead && (
            <div className="px-6 py-3 bg-[#F0FFF8] border-b border-[#D1FAE5] flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-2">
                Lead ID: <LeadRefBadge code={viewDomLead.leadRef} />
                {viewDomLead.documents?.length ? ` · ${viewDomLead.documents.length} doc(s)` : ''}
              </span>
              {user.role === 'dom_superadmin' && (
                <button onClick={() => handleDownloadZip(viewDomLead._id, viewDomLead.leadRef)}
                  className="flex items-center gap-1.5 text-sm bg-[#065F36] text-white px-3 py-1.5 rounded-xl hover:bg-[#054A2E] font-semibold transition-all">
                  <Download className="h-3.5 w-3.5" /> Download ZIP
                </button>
              )}
            </div>
          )}
          <div className={viewDomLead?.documents?.length ? 'grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100' : ''}>
            <div>
              <Section label="Customer Information">
                <Row2 label="Full Name"      value={viewLead.name} />
                <Row2 label="Mobile"         value={viewLead.mobile} mono />
                <Row2 label="City"           value={viewLead.city} />
                <Row2 label="Employment"     value={viewLead.employment} />
                <Row2 label="Monthly Income" value={viewLead.monthlyIncome} />
                <Row2 label="PAN"            value={viewLead.pan} mono />
              </Section>
              <Section label="Lead Information">
                <Row2 label="Service Needed" value={viewLead.productType?.replace(/_/g,' ')} />
                <Row2 label="Source Page"    value={viewLead.sourcePage} />
                <Row2 label="Status"         value={<StatusBadge status={viewLead.status} />} />
                <Row2 label="Claimed By"     value={viewLead.loadedBy?.name || 'Unclaimed'} />
              </Section>
              {viewDomLead && (
                <Section label="Agent's Worked Lead Details">
                  <Row2 label="Call Outcome" value={viewDomLead.callOutcome?.replace(/_/g,' ')} />
                  <Row2 label="Service"      value={viewDomLead.productType?.replace(/_/g,' ')} />
                  <Row2 label="Loan Amount"  value={viewDomLead.loanAmountRequired ? `₹${viewDomLead.loanAmountRequired.toLocaleString('en-IN')}` : null} />
                  <Row2 label="Notes"        value={viewDomLead.notes} />
                </Section>
              )}
            </div>
            {viewDomLead?.documents?.length > 0 && (
              <div className="overflow-y-auto">
                <Section label={`Documents (${viewDomLead.documents.length})`}>
                  <DocumentsGrid documents={viewDomLead.documents} />
                </Section>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* DomLead Detail Modal */}
      {viewDL && (
        <Modal
          title="Worked Lead Details"
          subtitle={
            <span className="flex items-center gap-2 flex-wrap">
              Agent: {viewDL.assignedTo?.name || '—'}
              <LeadRefBadge code={viewDL.leadRef} />
              {/* Source badge in modal header */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                viewDL.sourceWebsiteLead  ? 'bg-teal-900/30 text-teal-200 border-teal-400' :
                viewDL.sourceImportedLead ? 'bg-violet-900/30 text-violet-200 border-violet-400' :
                                             'bg-gray-800/30 text-gray-200 border-gray-500'
              }`}>
                {viewDL.sourceWebsiteLead  ? '🌐 Website' :
                 viewDL.sourceImportedLead ? '📊 Imported' :
                                             '✍️ Manual'}
              </span>
            </span>
          }
          onClose={() => setViewDL(null)} color="purple" size="xl">
          {/* Download strip */}
          <div className="px-6 py-3 bg-[#F0FFF8] border-b border-[#D1FAE5] flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {viewDL.documents?.length ? `${viewDL.documents.length} document(s) attached` : 'No documents'}
            </span>
            {user.role === 'dom_superadmin' && (
              <button onClick={() => handleDownloadZip(viewDL._id, viewDL.leadRef)}
                className="flex items-center gap-2 text-sm bg-[#065F36] text-white px-4 py-2 rounded-xl hover:bg-[#054A2E] font-semibold transition-all shadow-sm">
                <Download className="h-4 w-4" /> Download ZIP (Lead + Docs)
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
            {/* Left: Lead info */}
            <div className="overflow-y-auto">
              <Section label="Customer Information">
                <Row2 label="Full Name" value={viewDL.name} />
                <Row2 label="Mobile"    value={viewDL.mobile} mono />
                <Row2 label="Email"     value={viewDL.email} />
                <Row2 label="DOB"       value={viewDL.dob} />
                <Row2 label="PAN"       value={viewDL.pan} mono />
                <Row2 label="Aadhaar"   value={viewDL.aadhaar} mono />
                <Row2 label="Address"   value={viewDL.address} />
                <Row2 label="City"      value={viewDL.city} />
                <Row2 label="State"     value={viewDL.state} />
                <Row2 label="Pincode"   value={viewDL.pincode} />
              </Section>
              <Section label="Financial Details">
                <Row2 label="Service"         value={viewDL.productType?.replace(/_/g,' ')} />
                <Row2 label="Employment"      value={viewDL.employmentType?.replace(/_/g,' ')} />
                <Row2 label="Company"         value={viewDL.companyName} />
                <Row2 label="Monthly Salary"  value={viewDL.monthlySalary ? `₹${viewDL.monthlySalary.toLocaleString('en-IN')}` : null} />
                <Row2 label="Loan Required"   value={viewDL.loanAmountRequired ? `₹${viewDL.loanAmountRequired.toLocaleString('en-IN')}` : null} />
                <Row2 label="Existing Bank"   value={viewDL.existingBank} />
                <Row2 label="Salary Bank"     value={viewDL.salaryAccountBank} />
                <Row2 label="CIBIL Range"     value={viewDL.cibilScoreRange?.replace(/_/g,' ')} />
                <Row2 label="Existing EMI"    value={viewDL.existingEMI ? `₹${viewDL.existingEMI.toLocaleString('en-IN')}` : null} />
              </Section>
              <Section label="Call & Status">
                <Row2 label="Call Outcome"  value={viewDL.callOutcome?.replace(/_/g,' ')} />
                <Row2 label="Callback Date" value={viewDL.callbackDate} />
                <Row2 label="Notes"         value={viewDL.notes} />
                <Row2 label="Status"        value={<StatusBadge status={viewDL.status} />} />
                <Row2 label="Created On"    value={fmtDate(viewDL.createdAt)} />
              </Section>
            </div>
            {/* Right: Documents */}
            <div className="overflow-y-auto">
              <Section label={`Documents (${viewDL.documents?.length || 0})`}>
                <DocumentsGrid documents={viewDL.documents} />
              </Section>
            </div>
          </div>
        </Modal>
      )}
      </div>
    </div>
  );
};

/* ── Shared UI sub-components ── */

/**
 * Performance tier calculator.
 * Returns a tier object with emoji, label, color class, and a numeric score
 * so lists can be sorted "best first".
 */
const getAgentTier = (agent) => {
  if (!agent.isActive) {
    return { tier: 0, emoji: '💤', label: 'Inactive',       color: 'gray',   score: -1, ring: 'border-gray-200',   bg: 'bg-gray-50' };
  }
  const loaded    = agent.leadsLoaded    || 0;
  const completed = agent.leadsCompleted || 0;
  const worked    = agent.domLeadsCreated || 0;
  const conv      = loaded > 0 ? (completed / loaded) * 100 : 0;
  // Composite score: conversion rate weighted 60%, worked leads weighted 40%
  const score     = (conv * 0.6) + (Math.min(worked, 60) * 0.8);

  if (loaded < 2) {
    return { tier: 1, emoji: '🆕', label: 'New Agent',       color: 'sky',    score, ring: 'border-sky-200',    bg: 'bg-sky-50/60' };
  }
  if (conv >= 65 && worked >= 5) {
    return { tier: 5, emoji: '🏆', label: 'Top Performer',   color: 'amber',  score, ring: 'border-amber-300',  bg: 'bg-amber-50' };
  }
  if (conv >= 45 || (conv >= 35 && worked >= 8)) {
    return { tier: 4, emoji: '⭐', label: 'Star Agent',       color: 'violet', score, ring: 'border-violet-300', bg: 'bg-violet-50/60' };
  }
  if (conv >= 25 || worked >= 5) {
    return { tier: 3, emoji: '👍', label: 'Good Agent',       color: 'emerald',score, ring: 'border-emerald-200',bg: 'bg-emerald-50/50' };
  }
  if (loaded >= 5 && conv < 15) {
    return { tier: 2, emoji: '⚠️', label: 'Needs Coaching',  color: 'orange', score, ring: 'border-orange-200', bg: 'bg-orange-50/50' };
  }
  return   { tier: 2, emoji: '✅', label: 'Active',           color: 'teal',   score, ring: 'border-teal-200',   bg: 'bg-teal-50/40' };
};

const TIER_STYLES = {
  amber:   'bg-amber-100 text-amber-800 border-amber-300',
  violet:  'bg-violet-100 text-violet-800 border-violet-300',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  teal:    'bg-teal-100 text-teal-800 border-teal-300',
  sky:     'bg-sky-100 text-sky-800 border-sky-300',
  orange:  'bg-orange-100 text-orange-700 border-orange-300',
  gray:    'bg-gray-100 text-gray-500 border-gray-300',
};

const AgentTierBadge = ({ agent, size = 'sm' }) => {
  const tier = getAgentTier(agent);
  const cls  = TIER_STYLES[tier.color] || TIER_STYLES.gray;
  const pad  = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold border ${pad} ${cls}`}>
      {tier.emoji} {tier.label}
    </span>
  );
};

const KpiCard = ({ icon, label, value, color, sub }) => {
  const styles = {
    blue:   { bg: 'from-blue-500 to-blue-600',          ring: 'shadow-blue-200'   },
    orange: { bg: 'from-orange-400 to-rose-500',        ring: 'shadow-orange-200' },
    green:  { bg: 'from-[#065F36] to-[#00A651]',        ring: 'shadow-green-200'  },
    violet: { bg: 'from-violet-500 to-purple-600',      ring: 'shadow-violet-200' },
    sky:    { bg: 'from-sky-400 to-cyan-500',            ring: 'shadow-sky-200'    },
    amber:  { bg: 'from-amber-400 to-orange-500',       ring: 'shadow-amber-200'  },
    indigo: { bg: 'from-indigo-500 to-blue-600',        ring: 'shadow-indigo-200' },
    teal:   { bg: 'from-teal-500 to-emerald-600',       ring: 'shadow-teal-200'   },
  }[color] || { bg: 'from-[#065F36] to-[#00A651]', ring: 'shadow-green-200' };
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${styles.bg} text-white shadow-lg ${styles.ring}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">{icon}</div>
      </div>
      <p className="text-3xl font-black leading-none tracking-tight">{value}</p>
      <p className="text-sm mt-1.5 font-semibold text-white/80">{label}</p>
      {sub && <p className="text-xs mt-0.5 text-white/60">{sub}</p>}
      <div className="absolute -right-5 -bottom-5 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute -right-1 -bottom-10 w-36 h-36 rounded-full bg-white/5" />
    </div>
  );
};

const Spinner = () => (
  <div className="flex flex-col items-center justify-center py-20 gap-3">
    <div className="relative w-12 h-12">
      <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
      <div className="absolute inset-0 rounded-full border-4 border-t-[#065F36] border-r-[#00A651] animate-spin" />
    </div>
    <span className="text-sm text-gray-400 font-medium">Loading data…</span>
  </div>
);

const Empty = ({ label, icon }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-3">
    <div className="w-16 h-16 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center">
      {icon || <Inbox className="h-7 w-7 text-gray-300" />}
    </div>
    <p className="text-gray-400 text-sm font-medium">{label}</p>
  </div>
);

const Pagination = ({ total, page, perPage, count, onPrev, onNext }) => {
  if (total <= perPage) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-gray-50/80">
      <span className="text-sm text-gray-500">
        Showing <strong className="text-gray-700">{((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)}</strong> of <strong className="text-gray-700">{total}</strong>
      </span>
      <div className="flex items-center gap-1.5">
        <button onClick={onPrev} disabled={page === 1}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-white hover:border-[#065F36] hover:text-[#065F36] transition-all">
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <span className="px-3 py-1.5 text-sm font-bold text-[#065F36] bg-[#E8FFF5] border border-[#D1FAE5] rounded-xl">{page}</span>
        <button onClick={onNext} disabled={count < perPage}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-white hover:border-[#065F36] hover:text-[#065F36] transition-all">
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

const Modal = ({ title, subtitle, onClose, color = 'indigo', size = 'lg', children }) => {
  const bg = { indigo: 'from-[#065F36] to-[#00874A]', blue: 'from-[#065F36] to-[#00874A]', purple: 'from-[#065F36] to-[#00874A]' }[color] || 'from-[#065F36] to-[#00874A]';
  const maxW = size === 'xl' ? 'max-w-3xl' : 'max-w-lg';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxW} max-h-[92vh] flex flex-col overflow-hidden`}>
        <div className={`flex items-start justify-between px-6 py-4 bg-gradient-to-r ${bg} flex-shrink-0`}>
          <div>
            <h3 className="text-white font-bold text-base">{title}</h3>
            {subtitle && <div className="text-white/70 text-xs mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white mt-0.5 transition-colors ml-4 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

const Section = ({ label, children }) => (
  <div className="px-6 py-4 border-b border-gray-100 last:border-0">
    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{label}</p>
    <div className="space-y-2.5">{children}</div>
  </div>
);

const Row2 = ({ label, value, mono = false }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start gap-3">
      <span className="text-gray-400 text-sm w-36 flex-shrink-0">{label}</span>
      <span className={`text-gray-800 text-sm font-medium flex-1 ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</span>
    </div>
  );
};

const DOC_LABELS = {
  aadhaar_front:  'Aadhaar Front',
  aadhaar_back:   'Aadhaar Back',
  pan_card:       'PAN Card',
  salary_slip_1:  'Salary Slip 1',
  salary_slip_2:  'Salary Slip 2',
  salary_slip_3:  'Salary Slip 3',
  bank_statement: 'Bank Statement',
  form_16:        'Form 16',
  itr:            'ITR',
  business_proof: 'Business Proof',
  other:          'Other',
};

const fmtSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DocumentsGrid = ({ documents }) => {
  if (!documents?.length) {
    return (
      <div className="flex flex-col items-center py-8 text-gray-400">
        <File className="h-10 w-10 text-gray-200 mb-2" />
        <p className="text-sm">No documents uploaded for this lead.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {documents.map((doc, i) => {
        const isImage = doc.mimetype?.startsWith('image/');
        const isPdf   = doc.mimetype === 'application/pdf';
        return (
          <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            {/* Preview area */}
            <div className="h-28 bg-gray-100 flex items-center justify-center overflow-hidden relative">
              {isImage ? (
                <img
                  src={doc.url}
                  alt={doc.originalName}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : isPdf ? (
                <div className="flex flex-col items-center gap-1 text-red-500">
                  <FileText className="h-10 w-10" />
                  <span className="text-xs font-semibold text-red-600">PDF</span>
                </div>
              ) : (
                <File className="h-10 w-10 text-gray-400" />
              )}
            </div>
            {/* Info */}
            <div className="px-3 py-2 flex-1 flex flex-col gap-1">
              <p className="text-xs font-bold text-gray-700 leading-tight">
                {DOC_LABELS[doc.docType] || doc.docType}
              </p>
              <p className="text-xs text-gray-400 truncate" title={doc.originalName}>{doc.originalName}</p>
              {doc.size > 0 && <p className="text-xs text-gray-400">{fmtSize(doc.size)}</p>}
            </div>
            {/* Actions */}
            <div className="px-3 pb-3 flex gap-2">
              <a href={doc.url} target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors">
                <ExternalLink className="h-3 w-3" /> View
              </a>
              <a href={doc.url} download={doc.originalName}
                className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg bg-[#E8FFF5] border border-[#D1FAE5] hover:bg-[#D1FAE5] text-[#065F36] font-semibold transition-colors">
                <Download className="h-3 w-3" /> Save
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DomAdminDashboard;

