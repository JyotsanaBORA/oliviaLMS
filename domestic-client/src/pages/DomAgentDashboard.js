import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import {
  LogOut, RefreshCw, FileText, CheckCircle,
  Clock, PlusCircle, ChevronRight, Database,
  CheckCircle2, Phone, AlertCircle, Calendar,
  Search, Menu, ChevronLeft, X, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LeadFormModal           from '../components/LeadFormModal';
import ImportedLeadDetailModal from '../components/ImportedLeadDetailModal';
import CibilCheckModal         from '../components/CibilCheckModal';
import api   from '../utils/axios';
import toast from 'react-hot-toast';

const OUTCOME_MAP = {
  interested:     { label: 'Interested',     cls: 'bg-emerald-100 text-emerald-700' },
  not_interested: { label: 'Not Interested', cls: 'bg-red-100 text-red-700' },
  not_eligible:   { label: 'Not Eligible',   cls: 'bg-rose-100 text-rose-700' },
  callback:       { label: 'Callback',       cls: 'bg-amber-100 text-amber-700' },
  not_reachable:  { label: 'Not Reachable',  cls: 'bg-orange-100 text-orange-700' },
  not_answering:  { label: 'Not Answering',  cls: 'bg-slate-100 text-slate-700' },
  wrong_number:   { label: 'Wrong Number',   cls: 'bg-gray-100 text-gray-600' },
  other:          { label: 'Other',          cls: 'bg-purple-100 text-purple-700' },
};

const CORE_DOCS_A     = ['aadhaar_front', 'aadhaar_back', 'pan_card'];
const FINANCIAL_DOCS_A= ['salary_slip_1', 'bank_statement', 'itr', 'form_16', 'business_proof'];
const getDocStatusA = (docs = []) => {
  if (!docs || docs.length === 0) return { status: 'none',    count: 0, label: 'No Docs',   cls: 'bg-gray-100 text-gray-400 border-gray-200',   emoji: '' };
  const types = docs.map(d => d.docType);
  const coreCount = CORE_DOCS_A.filter(t => types.includes(t)).length;
  const hasFinancial = FINANCIAL_DOCS_A.some(t => types.includes(t));
  if (coreCount >= 2 && hasFinancial) return { status: 'full',    count: docs.length, label: `Full (${docs.length})`,    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', emoji: '' };
  return                                      { status: 'partial', count: docs.length, label: `Partial (${docs.length})`, cls: 'bg-amber-100  text-amber-700  border-amber-200',   emoji: '' };
};

const IST_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30  India has no DST
/** Returns today's date in IST as YYYY-MM-DD. offsetDays > 0 = days ago */
const todayIST = (offsetDays = 0) => {
  const ist = new Date(Date.now() + IST_MS - offsetDays * 86400000);
  return ist.toISOString().slice(0, 10);
};
/** Convert any date value to IST YYYY-MM-DD for comparisons */
const toISTDateStr = (d) => {
  if (!d) return '';
  const ist = new Date(new Date(d).getTime() + IST_MS);
  return ist.toISOString().slice(0, 10);
};

/** Maps a numeric cibilScore string (e.g. "745") to a range key */
const cibilScoreToRange = (score) => {
  const n = parseInt(score, 10);
  if (!n || isNaN(n)) return 'unknown';
  if (n < 600) return 'below_600';
  if (n < 700) return '600_699';
  if (n < 750) return '700_749';
  if (n <= 800) return '750_800';
  return 'above_800';
};

const DomAgentDashboard = () => {
  const { user, logout } = useAuth();

  const socketRef      = useRef(null);
  const [connected, setConnected] = useState(false);
  const [myLeads,   setMyLeads]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [tab, setTab] = useState('assigned');
  const [modalOpen,       setModalOpen]       = useState(false);
  const [selectedWLead,   setSelectedWLead]   = useState(null);
  const [selectedDomLead, setSelectedDomLead] = useState(null);

  const [assignedLeads,        setAssignedLeads]        = useState([]);
  const [assignedLeadsLoading, setAssignedLeadsLoading] = useState(false);
  const [importedModalOpen,    setImportedModalOpen]    = useState(false);
  const [detailModalOpen,      setDetailModalOpen]      = useState(false); // shows all imported data first
  const [cibilModalOpen,       setCibilModalOpen]       = useState(false);

  // Follow-up queue
  const [followups,        setFollowups]        = useState([]);
  const [followupsLoading, setFollowupsLoading] = useState(false);

  // Agent availability status
  const [agentStatus,        setAgentStatus]        = useState('available');
  const [statusUpdating,     setStatusUpdating]     = useState(false);

  // Imported lead detail
  const [selectedImportedLead, setSelectedImportedLead] = useState(null);
  const [importedLeadDomLead,  setImportedLeadDomLead]  = useState(null);

  // UI state
  const [sidebarOpen,        setSidebarOpen]        = useState(true);
  const [searchQuery,        setSearchQuery]        = useState('');
  const [dateFilter,         setDateFilter]         = useState(''); // '' = show all dates by default
  const [followupDateFilter, setFollowupDateFilter] = useState(todayIST); // default = today in IST
  const [docFilter,          setDocFilter]          = useState('all'); // 'all'|'none'|'partial'|'full'
  const [cibilFilter,        setCibilFilter]        = useState(''); // '' = all CIBIL ranges (Assigned to Work + Worked tabs)
  const [dispositionFilter,  setDispositionFilter]  = useState(''); // '' = all outcomes (Worked tab)
  const [followupCibilFilter,setFollowupCibilFilter]= useState(''); // '' = all CIBIL ranges (Follow-ups tab only)
  const [followupDispositionFilter, setFollowupDispositionFilter] = useState(''); // '' = all outcomes (Follow-ups tab)

  useEffect(() => {
    const serverUrl = process.env.REACT_APP_DOM_API_URL || 'http://localhost:5009';
    const token     = localStorage.getItem('dom_token');
    const socket    = io(serverUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.on('connect',    () => { setConnected(true); socket.emit('join_room', user.role); });
    socket.on('disconnect', () => setConnected(false));

    // New pool leads assigned to this agent via batch
    socket.on('pool_batch_assigned', (data) => {
      if (data.agentId && data.agentId !== user._id?.toString()) return; // not for this agent (double-check on client)
      toast.success(data.message || `New batch leads assigned to you!`, { icon: '', duration: 6000 });
      fetchAssignedLeads();
    });

    // A batch was deleted  refresh to remove cleared leads
    socket.on('pool_batch_deleted', (data) => {
      toast(`${data.message || 'A batch was removed from your queue.'}`, { icon: '', duration: 5000 });
      fetchAssignedLeads();
    });

    // Single website lead assigned
    socket.on('lead_assigned_to_you', (data) => {
      if (data.agentId === socket.auth?.token) return;
      toast.success(`Lead assigned to you: ${data.leadName || data.mobile || 'new lead'}`, { icon: '' });
      fetchMyLeads(true);
    });
    return () => socket.disconnect();
  }, [user.role, user._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMyLeads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await api.get('/domestic-api/website-leads/my');
      setMyLeads(res.data?.data || []);
    } catch { toast.error('Failed to load your leads.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchAssignedLeads = useCallback(async () => {
    setAssignedLeadsLoading(true);
    try {
      const res = await api.get('/domestic-api/import-leads?limit=5000');
      setAssignedLeads(res.data?.data || []);
    } catch { toast.error('Failed to load assigned leads.'); }
    finally { setAssignedLeadsLoading(false); }
  }, []);

  const fetchFollowups = useCallback(async () => {
    setFollowupsLoading(true);
    try {
      const res = await api.get('/domestic-api/leads/followups');
      setFollowups(res.data?.data || []);
    } catch { toast.error('Failed to load follow-ups.'); }
    finally { setFollowupsLoading(false); }
  }, []);

  // Fetch agent's own current status on mount
  const fetchMyStatus = useCallback(async () => {
    try {
      const res = await api.get('/domestic-api/auth/me');
      setAgentStatus(res.data?.user?.agentStatus || 'available');
    } catch {}
  }, []);

  const handleStatusChange = useCallback(async (newStatus) => {
    if (newStatus === agentStatus || statusUpdating) return;
    setStatusUpdating(true);
    try {
      await api.patch('/domestic-api/auth/status', { agentStatus: newStatus });
      setAgentStatus(newStatus);
      const labels = { available: 'Available ', break: 'On Break ', unavailable: 'Unavailable ' };
      toast.success(`Status set to: ${labels[newStatus]}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    } finally { setStatusUpdating(false); }
  }, [agentStatus, statusUpdating]);

  const handleOpenImportedLead = useCallback(async (lead) => {
    setSelectedImportedLead(lead);
    setImportedLeadDomLead(null);
    // domLeadId may be a populated object or a plain ObjectId string
    const domLeadId = lead.domLeadId?._id || lead.domLeadId;
    if (domLeadId) {
      try {
        const r = await api.get(`/domestic-api/leads/${domLeadId}`);
        setImportedLeadDomLead(r.data?.data || null);
      } catch { /* open fresh form */ }
    }
    // Show the detail modal first (shows all imported data)
    setDetailModalOpen(true);
  }, []);

  // Called from the detail modal's "Work This Lead" button
  const handleWorkImportedLead = useCallback((lead) => {
    setDetailModalOpen(false);
    setImportedModalOpen(true);
  }, []);

  useEffect(() => { fetchMyLeads(); fetchMyStatus(); fetchAssignedLeads(); }, [fetchMyLeads, fetchMyStatus, fetchAssignedLeads]);

  // Auto-refresh pool leads every 60 seconds so agents always see fresh batch data
  useEffect(() => {
    const timer = setInterval(() => fetchAssignedLeads(), 60000);
    return () => clearInterval(timer);
  }, [fetchAssignedLeads]);

  useEffect(() => {
    if (tab === 'followups') fetchFollowups();
  }, [tab, fetchAssignedLeads]);

  const handleOpenLead = useCallback(async (lead) => {
    const domLeadId = lead.domLead?._id || lead.domLead;
    if (lead.isManual) {
      setSelectedWLead(null);
      if (domLeadId) {
        try { const r = await api.get(`/domestic-api/leads/${domLeadId}`); setSelectedDomLead(r.data?.data || null); }
        catch { setSelectedDomLead(null); }
      } else { setSelectedDomLead(null); }
      setModalOpen(true);
      return;
    }
    setSelectedWLead(lead);
    if (domLeadId) {
      try { const r = await api.get(`/domestic-api/leads/${domLeadId}`); setSelectedDomLead(r.data?.data || null); }
      catch { setSelectedDomLead(null); }
    } else { setSelectedDomLead(null); }
    setModalOpen(true);
  }, []);

  const { pendingCount, workedCount, manualCount } = useMemo(() => ({
    pendingCount: myLeads.filter((l) => !l.isWorked).length,
    workedCount:  myLeads.filter((l) =>  l.isWorked).length,
    manualCount:  myLeads.filter((l) =>  l.isManual).length,
  }), [myLeads]);

  // Combined views
  const toWorkLeads  = useMemo(() => [
    ...myLeads.filter(l => !l.isWorked).map(l => ({ ...l, _src: 'website' })),
    ...assignedLeads.filter(l => (l.workStatus || 'new') === 'new').map(l => ({ ...l, _src: 'pool' })),
  ].sort((a,b) => new Date(b.loadedAt || b.createdAt) - new Date(a.loadedAt || a.createdAt)), [myLeads, assignedLeads]);

  const workedLeads = useMemo(() => [
    ...myLeads.filter(l => l.isWorked).map(l => ({ ...l, _src: 'website' })),
    ...assignedLeads.filter(l => (l.domLeadId || (l.workStatus && l.workStatus !== 'new'))).map(l => ({ ...l, _src: 'pool' })),
  ].sort((a,b) => {
    const timeA = new Date(a.workedAt || a.completedAt || a.domLeadId?.createdAt || a.loadedAt || a.createdAt).getTime();
    const timeB = new Date(b.workedAt || b.completedAt || b.domLeadId?.createdAt || b.loadedAt || b.createdAt).getTime();
    return timeB - timeA;
  }), [myLeads, assignedLeads]);

  const filteredToWork = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return toWorkLeads.filter(l => {
      const d = l._src === 'website'
        ? (l.loadedAt   || l.createdAt)
        : (l.assignedAt || l.createdAt);
      const dateOk   = !dateFilter  || (d && toISTDateStr(d) === dateFilter);
      const searchOk = !q || (l.name||'').toLowerCase().includes(q) || (l.mobile||'').includes(q) || (l.city||'').toLowerCase().includes(q);
      // CIBIL filter: pool leads use cibilScore (text); website leads have no score  pass through
      const cibilOk  = !cibilFilter || l._src === 'website' ||
        cibilScoreToRange(l.cibilScore) === cibilFilter;
      return dateOk && searchOk && cibilOk;
    });
  }, [toWorkLeads, dateFilter, searchQuery, cibilFilter]);

  const filteredWorked = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return workedLeads.filter(l => {
      // Use the date the agent actually worked the lead
      const d = l._src === 'website'
        ? (l.completedAt || l.domLead?.createdAt || l.updatedAt)
        : (l.workedAt    || l.domLeadId?.createdAt || (l.workStatus !== 'new' ? l.updatedAt : null));
      const dateOk = !dateFilter || (d && toISTDateStr(d) === dateFilter);
      const searchOk = !q || (l.name||'').toLowerCase().includes(q) || (l.mobile||'').includes(q);
      const docList = l._src === 'website' ? (l.domLead?.documents || []) : (l.domLeadId?.documents || []);
      const ds = getDocStatusA(docList);
      const docOk = docFilter === 'all' || ds.status === docFilter;
      const leadCibil = l._src === 'website' ? (l.domLead?.cibilScoreRange || '') : (l.domLeadId?.cibilScoreRange || '');
      const cibilOk = !cibilFilter || leadCibil === cibilFilter;
      const leadDisposition = l._src === 'website'
        ? (l.domLead?.callOutcome || '')
        : (l.callOutcome || l.workStatus || '');
      const dispositionOk = !dispositionFilter || leadDisposition === dispositionFilter;
      return dateOk && searchOk && docOk && cibilOk && dispositionOk;
    });
  }, [workedLeads, dateFilter, searchQuery, docFilter, cibilFilter, dispositionFilter]);

  const filteredFollowups = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return followups.filter(f => {
      const dateOk   = !followupDateFilter || (f.callbackDate && toISTDateStr(f.callbackDate) === followupDateFilter);
      const searchOk = !q || (f.name||'').toLowerCase().includes(q) || (f.mobile||'').includes(q);
      const cibilOk  = !followupCibilFilter || (f.cibilScoreRange || 'unknown') === followupCibilFilter;
      const dispositionOk = !followupDispositionFilter || (f.callOutcome || '') === followupDispositionFilter;
      return dateOk && searchOk && cibilOk && dispositionOk;
    });
  }, [followups, followupDateFilter, searchQuery, followupCibilFilter, followupDispositionFilter]);

  const STATUS_CONFIG = {
    available:   { label: 'Available',   dot: 'bg-emerald-500', activeBg: 'bg-emerald-500 text-white', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-300' },
    break:       { label: 'On Break',    dot: 'bg-amber-400',   activeBg: 'bg-amber-400 text-white',   badge: 'bg-amber-100 text-amber-700 border border-amber-300' },
    unavailable: { label: 'Unavailable', dot: 'bg-red-500',     activeBg: 'bg-red-500 text-white',     badge: 'bg-red-100 text-red-700 border border-red-300' },
  };
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* AGENT SIDEBAR */}
      <aside className={`${sidebarOpen ? 'w-[210px]' : 'w-14'} flex-shrink-0 flex flex-col h-screen bg-white border-r border-gray-200 shadow-sm transition-all duration-300 overflow-hidden`}>

        {/* Brand strip */}
        <div className="bg-[#065F36] px-3 py-3 flex-shrink-0 flex items-center gap-2 overflow-hidden">
          {sidebarOpen ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MCB" className="h-4 w-auto object-contain brightness-0 invert" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-[12px] leading-none">MyCashBridge</p>
                <p className="text-white/60 text-[9px] font-medium tracking-wider uppercase mt-0.5">Agent Portal</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
              <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MCB" className="h-4 w-auto object-contain brightness-0 invert" />
            </div>
          )}
          {/* Toggle button  white on green, clearly visible */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-sm hover:bg-gray-100 active:scale-95 transition-all">
            {sidebarOpen
              ? <ChevronLeft className="h-4 w-4 text-[#065F36]" />
              : <ChevronRight className="h-4 w-4 text-[#065F36]" />}
          </button>
        </div>

        {/* User + status */}
        <div className="px-2 py-2 border-b border-gray-100 flex-shrink-0">
          <div className={`flex items-center ${sidebarOpen ? 'gap-2 px-2' : 'justify-center px-1'} py-2 rounded-xl bg-[#f0faf5] border border-[#d1fae5]`}>
            <div className="relative flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-[#065F36] flex items-center justify-center font-bold text-white text-xs shadow-sm">
                {user.name?.charAt(0)?.toUpperCase()}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] border-white ${STATUS_CONFIG[agentStatus]?.dot || 'bg-emerald-500'}`} />
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 font-semibold text-[11px] leading-none truncate">{user.name}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[agentStatus]?.dot || 'bg-emerald-500'}`} />
                  <p className="text-[#065F36]/70 text-[9px] font-medium">{STATUS_CONFIG[agentStatus]?.label || 'Available'}</p>
                  {connected && <span className="ml-auto text-emerald-600 text-[8px] font-bold">LIVE</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 pt-3 pb-2 overflow-y-auto min-h-0">
          {/* Mini stats  only when expanded */}
          {sidebarOpen && (
            <div className="flex items-center gap-1 px-1 mb-3 flex-wrap">
              {[
                { label: 'To Work',  val: toWorkLeads.length,  color: 'text-orange-500 bg-orange-50' },
                { label: 'Worked',   val: workedLeads.length,  color: 'text-emerald-600 bg-emerald-50' },
                { label: 'F/U',      val: followups.length,    color: 'text-amber-600 bg-amber-50' },
              ].map(s => (
                <div key={s.label} className={`flex items-center gap-1 px-2 py-1 rounded-lg ${s.color}`}>
                  <span className="text-[11px] font-black">{s.val}</span>
                  <span className="text-[9px] opacity-70">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {sidebarOpen && <p className="text-gray-400 text-[9px] font-extrabold uppercase tracking-[0.14em] px-2 mb-1.5">LEADS</p>}
          {[
            { key: 'assigned',  Icon: Database,     label: 'Assigned to Work', sub: 'Leads waiting for you', badge: toWorkLeads.length || null },
            { key: 'worked',    Icon: CheckCircle,  label: 'Worked Leads',     sub: 'Leads you worked',      badge: null },
            { key: 'followups', Icon: Phone,        label: 'Follow-ups',        sub: 'Callbacks & retry',    badge: followups.length || null },
          ].map(({ key, Icon, label, sub, badge }) => {
            const isActive = tab === key;
            return (
              <button key={key} onClick={() => setTab(key)} title={!sidebarOpen ? label : undefined}
                className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0 py-2.5'} py-2 rounded-lg transition-all text-left relative group mb-0.5 ${
                  isActive ? 'bg-[#e8f5ed] text-[#065F36]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}>
                {isActive && sidebarOpen && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#065F36] rounded-r-full" />}
                <div className="relative flex-shrink-0">
                  <Icon className={`h-[15px] w-[15px] ${isActive ? 'text-[#065F36]' : 'text-gray-400 group-hover:text-gray-600'}`} />
                  {badge > 0 && !sidebarOpen && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
                </div>
                {sidebarOpen && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-semibold leading-none ${isActive ? 'text-[#065F36]' : 'text-gray-600 group-hover:text-gray-800'}`}>{label}</p>
                      <p className={`text-[10px] mt-1 ${isActive ? 'text-[#065F36]/60' : 'text-gray-400'}`}>{sub}</p>
                    </div>
                    {badge > 0 && (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        isActive ? 'bg-[#065F36]/20 text-[#065F36]' : 'bg-red-500 text-white'
                      }`}>{badge}</span>
                    )}
                  </>
                )}
              </button>
            );
          })}

          {/* CIBIL Check tool */}
          {sidebarOpen && <p className="text-gray-400 text-[9px] font-extrabold uppercase tracking-[0.14em] px-2 mt-3 mb-1.5">TOOLS</p>}
          {!sidebarOpen && <div className="border-t border-gray-100 my-2 mx-1" />}
          <button
            type="button"
            onClick={() => setCibilModalOpen(true)}
            title={!sidebarOpen ? 'CIBIL Check' : undefined}
            className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0 py-2.5'} py-2 rounded-lg transition-all text-left mb-2 text-indigo-600 hover:bg-indigo-50`}>
            <ShieldCheck className="h-[15px] w-[15px] flex-shrink-0" />
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold leading-none">CIBIL Check</p>
                <p className="text-[10px] mt-1 text-indigo-400">Live credit score</p>
              </div>
            )}
          </button>

          {/* Status toggle */}
          {sidebarOpen && <p className="text-gray-400 text-[9px] font-extrabold uppercase tracking-[0.14em] px-2 mt-3 mb-1.5">MY STATUS</p>}
          {!sidebarOpen && <div className="border-t border-gray-100 my-2 mx-1" />}
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button key={key} onClick={() => handleStatusChange(key)} disabled={statusUpdating}
              title={!sidebarOpen ? cfg.label : undefined}
              className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0 py-2'} py-2 rounded-lg transition-all text-left mb-0.5 ${
                agentStatus === key ? 'bg-[#e8f5ed] border border-[#d1fae5]' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`}>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
              {sidebarOpen && <span className={`text-[11px] font-semibold ${agentStatus === key ? 'text-gray-700' : ''}`}>{cfg.label}</span>}
              {sidebarOpen && agentStatus === key && <span className="ml-auto text-[9px] text-[#065F36] font-bold">Active</span>}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="flex-shrink-0 px-2 pb-3 pt-2 border-t border-gray-100">
          <button onClick={() => { logout(); if (socketRef.current) socketRef.current.disconnect(); }}
            title={!sidebarOpen ? 'Sign out' : undefined}
            className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0'} py-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all`}>
            <LogOut className="h-[14px] w-[14px] flex-shrink-0" />
            {sidebarOpen && <span className="text-[12px] font-semibold">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 scrollbar-app">
      <main className="px-4 sm:px-5 xl:px-7 py-4 xl:py-5 space-y-4 xl:space-y-5 min-w-0">

        {/*  ASSIGNED TO WORK  */}
        {tab === 'assigned' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-100 rounded-xl"><Database className="h-5 w-5 text-orange-600" /></div>
                  <div>
                    <h2 className="font-bold text-gray-800 text-base">Assigned to Work</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Leads waiting for you  call and fill the form</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-xl font-bold">
                    {filteredToWork.length} pending
                  </span>
                  <button onClick={() => { fetchMyLeads(true); fetchAssignedLeads(); }} disabled={loading || assignedLeadsLoading}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 transition-colors bg-white">
                    <RefreshCw className={`h-4 w-4 ${(loading || assignedLeadsLoading) ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Filter bar */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Search name, mobile, city" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white w-52 focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]" />
                  {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="flex items-center gap-2">
                  <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                    className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]" />
                  {dateFilter && (
                    <button onClick={() => setDateFilter('')} className="text-xs text-gray-400 hover:text-red-500 px-2.5 py-2 rounded-xl border border-gray-200 hover:border-red-200 bg-white transition-colors whitespace-nowrap">
                      All dates
                    </button>
                  )}
                </div>
                <select value={cibilFilter} onChange={e => setCibilFilter(e.target.value)}
                  className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]">
                  <option value=""> All CIBIL</option>
                  <option value="below_600">&lt; 600 (Poor)</option>
                  <option value="600_699">600699 (Fair)</option>
                  <option value="700_749">700749 (Good)</option>
                  <option value="750_800">750800 (Very Good)</option>
                  <option value="above_800">&gt; 800 (Excellent)</option>
                  <option value="unknown">Unknown</option>
                </select>
                <button
                  onClick={() => { setSearchQuery(''); setDateFilter(''); setCibilFilter(''); }}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    (searchQuery || dateFilter || cibilFilter) ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-gray-50 text-gray-300 border-gray-200 cursor-default'
                  }`} title="Clear all filters">
                  <X className="h-3.5 w-3.5" /> Clear
                </button>
                {(searchQuery || dateFilter || cibilFilter) && (
                  <span className="text-xs text-gray-400">{filteredToWork.length} of {toWorkLeads.length} shown</span>
                )}
              </div>

              {/* Results count bar */}
              {(searchQuery || dateFilter || cibilFilter) && !(loading || assignedLeadsLoading) && filteredToWork.length > 0 && (
                <div className="px-5 py-2.5 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                  <span className="text-sm font-bold text-orange-700">{filteredToWork.length} lead{filteredToWork.length !== 1 ? 's' : ''} found</span>
                  <span className="text-xs text-orange-400 ml-1">of {toWorkLeads.length} total</span>
                </div>
              )}

              {(loading || assignedLeadsLoading) ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <span className="w-8 h-8 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
                  <span className="text-sm text-gray-400">Loading</span>
                </div>
              ) : filteredToWork.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                  <CheckCircle2 className="h-12 w-12 text-emerald-200" />
                  <p className="font-semibold text-gray-500">{toWorkLeads.length === 0 ? 'All caught up!' : 'No results'}</p>
                  <p className="text-sm">{toWorkLeads.length === 0 ? 'No pending leads. Check back later.' : 'Try adjusting the date or search filter.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                        <th className="pl-6 pr-3 py-3.5">Source</th>
                        <th className="px-3 py-3.5">Customer</th>
                        <th className="px-3 py-3.5">Mobile</th>
                        <th className="px-3 py-3.5">Service / Loan</th>
                        <th className="px-3 py-3.5">Assigned</th>
                        <th className="px-3 pr-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredToWork.map((lead) => {
                        const isWebsite = lead._src === 'website';
                        const date = lead.loadedAt || lead.assignedAt || lead.createdAt;
                        const product = isWebsite ? lead.productType : (lead.loanType || lead.productType);
                        return (
                          <tr key={lead._id}
                            className={`cursor-pointer transition-colors group border-l-4 ${isWebsite ? 'border-l-teal-400 hover:bg-teal-50/30' : 'border-l-violet-400 hover:bg-violet-50/30'}`}
                            onClick={() => isWebsite ? handleOpenLead(lead) : handleOpenImportedLead(lead)}>
                            <td className="pl-6 pr-3 py-3.5">
                              <div className="flex flex-col items-start gap-1">
                                {isWebsite
                                  ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500 text-white"> Meta</span>
                                  : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200"> Imported</span>}
                                {isWebsite && lead.source === 'meta' && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#1877F2] text-white">f Meta Ads</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
                                <div>
                                  <p className="font-semibold text-gray-800">{lead.name || ''}</p>
                                  <p className="text-xs text-gray-400">{lead.city || lead.state || ''}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3.5 font-mono text-xs text-gray-600">{lead.mobile || ''}</td>
                            <td className="px-3 py-3.5">
                              {product
                                ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{product.replace(/_/g,' ')}</span>
                                : <span className="text-gray-300 text-xs"></span>}
                            </td>
                            <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                              {date ? new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}
                            </td>
                            <td className="px-3 pr-6 py-3.5 text-right">
                              <button onClick={(e) => { e.stopPropagation(); isWebsite ? handleOpenLead(lead) : handleOpenImportedLead(lead); }}
                                className="inline-flex items-center gap-1 text-xs px-4 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 font-semibold shadow-sm transition-all">
                                Work Now <ChevronRight className="h-3 w-3" />
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
            {/* Add manual lead button */}
            <button onClick={() => { setSelectedWLead(null); setSelectedDomLead(null); setModalOpen(true); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-[#065F36] hover:text-[#065F36] hover:bg-[#E8FFF5]/50 transition-all font-semibold text-sm">
              <PlusCircle className="h-4 w-4" /> Add Manual Lead
            </button>
          </div>
        )}

        {/*  WORKED LEADS  */}
        {tab === 'worked' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 rounded-xl"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>
                <div>
                  <h2 className="font-bold text-gray-800 text-base">Worked Leads</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Leads you have already called and filled the form for</p>
                </div>
              </div>
              <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold">
                {filteredWorked.length} worked
              </span>
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Search name or mobile" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white w-52 focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <div className="flex items-center gap-2">
                <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                  className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]" />
                {dateFilter && (
                  <button onClick={() => setDateFilter('')} className="text-xs text-gray-400 hover:text-red-500 px-2.5 py-2 rounded-xl border border-gray-200 hover:border-red-200 bg-white transition-colors whitespace-nowrap">
                    All dates
                  </button>
                )}
              </div>
              <select value={docFilter} onChange={e => setDocFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]">
                <option value="all"> All Docs</option>
                <option value="none"> No Docs</option>
                <option value="partial"> Partial Docs</option>
                <option value="full"> Full Docs</option>
              </select>
              <select value={cibilFilter} onChange={e => setCibilFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]">
                <option value=""> All CIBIL</option>
                <option value="below_600">&lt; 600 (Poor)</option>
                <option value="600_699">600699 (Fair)</option>
                <option value="700_749">700749 (Good)</option>
                <option value="750_800">750800 (Very Good)</option>
                <option value="above_800">&gt; 800 (Excellent)</option>
                <option value="unknown">Unknown</option>
              </select>
              <select value={dispositionFilter} onChange={e => setDispositionFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#065F36]/20 focus:border-[#065F36]">
                <option value=""> All Dispositions</option>
                <option value="interested">Interested</option>
                <option value="not_interested">Not Interested</option>
                <option value="not_eligible">Not Eligible</option>
                <option value="callback">Callback</option>
                <option value="not_reachable">Not Reachable</option>
                <option value="not_answering">Not Answering</option>
                <option value="wrong_number">Wrong Number</option>
                <option value="other">Other</option>
                <option value="in_progress">In Progress</option>
                <option value="closed">Closed</option>
              </select>
              <button
                onClick={() => { setSearchQuery(''); setDateFilter(''); setDocFilter('all'); setCibilFilter(''); setDispositionFilter(''); }}
                className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                  (searchQuery || dateFilter || docFilter !== 'all' || cibilFilter || dispositionFilter) ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-gray-50 text-gray-300 border-gray-200 cursor-default'
                }`} title="Clear all filters">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
              {(searchQuery || dateFilter || docFilter !== 'all' || cibilFilter || dispositionFilter) && (
                <span className="text-xs text-gray-400">{filteredWorked.length} of {workedLeads.length} shown</span>
              )}
            </div>

            {/* Results count bar */}
            {(searchQuery || dateFilter || docFilter !== 'all' || cibilFilter || dispositionFilter) && filteredWorked.length > 0 && (
              <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm font-bold text-emerald-700">{filteredWorked.length} lead{filteredWorked.length !== 1 ? 's' : ''} found</span>
                <span className="text-xs text-emerald-400 ml-1">of {workedLeads.length} total</span>
              </div>
            )}
            {filteredWorked.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                <FileText className="h-12 w-12 text-gray-200" />
                <p className="font-semibold text-gray-500">{workedLeads.length === 0 ? 'No worked leads yet' : 'No results'}</p>
                <p className="text-sm">{workedLeads.length === 0 ? 'Go to "Assigned to Work" to start working leads.' : 'Try adjusting the date, search, or doc filter.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-6 pr-3 py-3.5">Source</th>
                      <th className="px-3 py-3.5">Lead ID</th>
                      <th className="px-3 py-3.5">Customer</th>
                      <th className="px-3 py-3.5">Mobile</th>
                      <th className="px-3 py-3.5">Disposition</th>
                      <th className="px-3 py-3.5">Tracker</th>
                      <th className="px-3 py-3.5">Docs</th>
                      <th className="px-3 py-3.5">Status</th>
                      <th className="px-3 pr-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredWorked.map((lead) => {
                      const isWebsite = lead._src === 'website';
                      const outcomeKey = isWebsite ? (lead.domLead?.callOutcome || '') : (lead.callOutcome || '');
                      const outcome = OUTCOME_MAP[outcomeKey];
                      const wsInfo = !isWebsite && lead.workStatus ? { interested:'bg-emerald-100 text-emerald-700', not_interested:'bg-red-100 text-red-700', callback:'bg-amber-100 text-amber-700', not_reachable:'bg-orange-100 text-orange-700', closed:'bg-gray-100 text-gray-500', in_progress:'bg-blue-100 text-blue-700' }[lead.workStatus] : null;
                      const docList = isWebsite ? (lead.domLead?.documents || []) : (lead.domLeadId?.documents || []);
                      const docSt = getDocStatusA(docList);
                      return (
                        <tr key={lead._id}
                          className={`cursor-pointer transition-colors group border-l-4 ${isWebsite ? 'border-l-teal-400 hover:bg-teal-50/30' : 'border-l-violet-400 hover:bg-violet-50/30'}`}
                          onClick={() => isWebsite ? handleOpenLead(lead) : handleOpenImportedLead(lead)}>
                          <td className="pl-6 pr-3 py-3.5">
                            <div className="flex flex-col items-start gap-1">
                              {isWebsite
                                ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500 text-white"> Meta</span>
                                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200"> Imported</span>}
                              {isWebsite && lead.source === 'meta' && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#1877F2] text-white">f Meta Ads</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            {(() => {
                              const ref = isWebsite ? lead.domLead?.leadRef : (lead.domLeadId?.leadRef || lead.leadRef);
                              return ref ? (
                                <span className="font-mono text-xs font-bold bg-gray-900 text-emerald-400 px-1.5 py-0.5 rounded">{ref}</span>
                              ) : (
                                <span className="text-gray-300 text-xs italic"></span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                              <p className="font-semibold text-gray-800">{lead.name || ''}</p>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 font-mono text-xs text-gray-600">{lead.mobile || ''}</td>
                          <td className="px-3 py-3.5">
                            {outcome
                              ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${outcome.cls}`}>{outcome.label}</span>
                              : wsInfo
                                ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${wsInfo}`}>{lead.workStatus?.replace(/_/g,' ')}</span>
                                : <span className="text-gray-300 text-xs"></span>}
                          </td>
                          <td className="px-3 py-3.5">
                            {(() => {
                              const dl = isWebsite ? lead.domLead : lead.domLeadId;
                              return (
                                <div className="flex flex-col gap-1">
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap" title="Times called">
                                     {dl?.callCount || 0}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap" title="Times updated">
                                     {dl?.updateCount || 0}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-3.5">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border ${docSt.cls}`}>
                              {docSt.emoji} {docSt.label}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <CheckCircle className="h-3 w-3" /> Worked
                            </span>
                          </td>
                          <td className="px-3 pr-6 py-3.5 text-right">
                            <button onClick={(e) => { e.stopPropagation(); isWebsite ? handleOpenLead(lead) : handleOpenImportedLead(lead); }}
                              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-[#E8FFF5] hover:text-[#065F36] font-semibold opacity-0 group-hover:opacity-100 transition-all">
                              Edit <ChevronRight className="h-3 w-3" />
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
        )}

      {/* -- Follow-up Queue -- */}
      {tab === 'followups' && (() => {
        const today    = new Date(todayIST() + 'T00:00:00+05:30'); // IST midnight
        const tomorrow = new Date(today.getTime() + 86400000);

        const parseDate = (d) => { if (!d) return null; const p = new Date(d); return isNaN(p) ? null : p; };

        const overdue   = filteredFollowups.filter(f => { const d = parseDate(f.callbackDate); return d && d < today; });
        const todayList = filteredFollowups.filter(f => { const d = parseDate(f.callbackDate); return d && d >= today && d < tomorrow; });
        const upcoming  = filteredFollowups.filter(f => { const d = parseDate(f.callbackDate); return d && d >= tomorrow; });
        const noDate    = filteredFollowups.filter(f => !parseDate(f.callbackDate));

        const FollowupCard = ({ f }) => {
          const outcomeColors = {
            callback:      'bg-amber-100 text-amber-700 border-amber-200',
            not_reachable: 'bg-orange-100 text-orange-700 border-orange-200',
            wrong_number:  'bg-gray-100 text-gray-600 border-gray-200',
          };
          const outcomeLabels = {
            callback:      ' Callback',
            not_reachable: ' Not Reachable',
            wrong_number:  '? Wrong Number',
            not_eligible:  ' Not Eligible',
          };
          const callbackD = parseDate(f.callbackDate);
          const isOverdue = callbackD && callbackD < today;
          const isToday   = callbackD && callbackD >= today && callbackD < tomorrow;

          return (
            <div className={`bg-white border-2 rounded-2xl p-4 transition-all hover:shadow-md ${
              isOverdue ? 'border-red-200 bg-red-50/20' : isToday ? 'border-amber-200 bg-amber-50/20' : 'border-gray-100'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800">{f.name || ''}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${outcomeColors[f.callOutcome] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {outcomeLabels[f.callOutcome] || f.callOutcome}
                    </span>
                    {f.leadRef && (
                      <span className="font-mono text-xs font-bold bg-gray-900 text-emerald-400 px-1.5 py-0.5 rounded">{f.leadRef}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500 flex-wrap">
                    <span className="font-mono font-semibold text-gray-700">{f.mobile || ''}</span>
                    {f.productType && <span className="text-xs bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full capitalize">{f.productType.replace(/_/g,' ')}</span>}
                    {callbackD && (
                      <span className={`flex items-center gap-1 text-xs font-semibold ${isOverdue ? 'text-red-600' : isToday ? 'text-amber-600' : 'text-gray-500'}`}>
                        <Calendar className="h-3 w-3" />
                        {isOverdue ? ' Overdue  ' : isToday ? ' Today  ' : ''}
                        {callbackD.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {f.notes && <p className="text-xs text-gray-400 mt-1.5 line-clamp-1 italic">"{f.notes}"</p>}
                </div>
                <button
                  onClick={() => {
                    setSelectedDomLead(f);
                    setSelectedWLead(null);
                    setModalOpen(true);
                  }}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${
                    isOverdue ? 'bg-red-600 hover:bg-red-700 text-white' :
                    isToday   ? 'bg-amber-500 hover:bg-amber-600 text-white' :
                                'bg-[#065F36] hover:bg-[#054A2E] text-white'
                  }`}>
                  <Phone className="h-3.5 w-3.5" /> Call Now
                </button>
              </div>
            </div>
          );
        };

        const Section = ({ title, color, items, icon }) => items.length === 0 ? null : (
          <div className="space-y-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${color}`}>
              <span className="text-lg">{icon}</span>
              <span className="font-bold text-sm">{title}</span>
              <span className="ml-auto font-black text-sm">{items.length}</span>
            </div>
            {items.map(f => <FollowupCard key={f._id} f={f} />)}
          </div>
        );

        return (
          <div className="px-4 sm:px-5 xl:px-7 py-4 xl:py-5 space-y-4 min-w-0">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-sm">
                    <Phone className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-800 text-base">Follow-up Queue</h2>
                    <p className="text-xs text-gray-400">Leads waiting for your call  sorted by urgency</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Summary chips */}
                  {overdue.length   > 0 && <span className="flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold"><AlertCircle className="h-3.5 w-3.5" /> {overdue.length} Overdue</span>}
                  {todayList.length > 0 && <span className="flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-bold"><Clock className="h-3.5 w-3.5" /> {todayList.length} Today</span>}
                  <button onClick={fetchFollowups} disabled={followupsLoading}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 transition-all">
                    <RefreshCw className={`h-4 w-4 ${followupsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              {/* Filter bar */}
              <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Search name or mobile" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white w-52 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                  {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <input type="date" value={followupDateFilter} onChange={e => setFollowupDateFilter(e.target.value)}
                    className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                  {followupDateFilter && (
                    <button onClick={() => setFollowupDateFilter('')} className="text-xs text-gray-400 hover:text-red-500 px-2.5 py-2 rounded-xl border border-gray-200 hover:border-red-200 bg-white transition-colors whitespace-nowrap">
                      All dates
                    </button>
                  )}
                </div>
                {(searchQuery || followupDateFilter || followupCibilFilter || followupDispositionFilter) && (
                  <span className="text-xs text-gray-400">{filteredFollowups.length} of {followups.length} shown</span>
                )}
                <select value={followupDispositionFilter} onChange={e => setFollowupDispositionFilter(e.target.value)}
                  className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400">
                  <option value=""> All Dispositions</option>
                  <option value="callback">Callback</option>
                  <option value="not_reachable">Not Reachable</option>
                  <option value="not_answering">Not Answering</option>
                  <option value="wrong_number">Wrong Number</option>
                  <option value="interested">Interested</option>
                  <option value="not_interested">Not Interested</option>
                  <option value="not_eligible">Not Eligible</option>
                  <option value="other">Other</option>
                </select>
                <select value={followupCibilFilter} onChange={e => setFollowupCibilFilter(e.target.value)}
                  className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400">
                  <option value=""> All CIBIL</option>
                  <option value="below_600">&lt; 600 (Poor)</option>
                  <option value="600_699">600699 (Fair)</option>
                  <option value="700_749">700749 (Good)</option>
                  <option value="750_800">750800 (Very Good)</option>
                  <option value="above_800">&gt; 800 (Excellent)</option>
                  <option value="unknown">Unknown</option>
                </select>
                <button
                  onClick={() => { setSearchQuery(''); setFollowupDateFilter(''); setFollowupCibilFilter(''); setFollowupDispositionFilter(''); }}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    (searchQuery || followupDateFilter || followupCibilFilter || followupDispositionFilter) ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-gray-50 text-gray-300 border-gray-200 cursor-default'
                  }`} title="Clear all filters">
                  <X className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
            </div>

            {followupsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-10 h-10 border-4 border-gray-100 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Loading follow-ups</p>
              </div>
            ) : followups.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-20 gap-4">
                <div className="p-5 bg-emerald-100 rounded-3xl"><CheckCircle2 className="h-12 w-12 text-emerald-500" /></div>
                <div className="text-center">
                  <p className="font-bold text-gray-700 text-lg">All clear! </p>
                  <p className="text-gray-400 text-sm mt-1">No pending callbacks or unreached leads.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Results count bar */}
                {(searchQuery || followupDateFilter || followupCibilFilter || followupDispositionFilter) && filteredFollowups.length > 0 && (
                  <div className="px-5 py-2.5 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2">
                    <Search className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-bold text-amber-700">{filteredFollowups.length} follow-up{filteredFollowups.length !== 1 ? 's' : ''} found</span>
                    <span className="text-xs text-amber-400 ml-1">of {followups.length} total</span>
                  </div>
                )}
                <Section title="Overdue Callbacks" color="bg-red-100 text-red-800"   icon="" items={overdue} />
                <Section title="Call Today"         color="bg-amber-100 text-amber-800" icon="" items={todayList} />
                <Section title="Upcoming"           color="bg-emerald-100 text-emerald-800" icon="" items={upcoming} />
                <Section title="Not Scheduled"      color="bg-gray-100 text-gray-700"  icon="" items={noDate} />
              </div>
            )}
          </div>
        );
      })()}

      {modalOpen && (
        <LeadFormModal
          websiteLead={selectedWLead}
          existingDomLead={selectedDomLead}
          onClose={() => { setModalOpen(false); setSelectedWLead(null); setSelectedDomLead(null); }}
          onSaved={() => fetchMyLeads(true)}
        />
      )}

      {/* Step 1: Show all imported lead data  agent reviews before calling */}
      {detailModalOpen && selectedImportedLead && (
        <ImportedLeadDetailModal
          lead={selectedImportedLead}
          onClose={() => {
            setDetailModalOpen(false);
            setSelectedImportedLead(null);
            setImportedLeadDomLead(null);
          }}
          onWorkLead={handleWorkImportedLead}
        />
      )}

      {/* Step 2: Full work form  agent fills in call outcome, uploads docs, etc. */}
      {importedModalOpen && (
        <LeadFormModal
          importedLead={selectedImportedLead}
          existingDomLead={importedLeadDomLead}
          onClose={() => {
            setImportedModalOpen(false);
            setSelectedImportedLead(null);
            setImportedLeadDomLead(null);
          }}
          onSaved={() => { fetchAssignedLeads(); }}
        />
      )}

      {cibilModalOpen && (
        <CibilCheckModal onClose={() => setCibilModalOpen(false)} />
      )}
      </main>
      </div>
    </div>
  );
};

const StatChip = ({ icon, label, value, color }) => {
  const styles = {
    red:    'bg-red-50 text-red-700 border-red-200',
    blue:   'bg-[#E8FFF5] text-[#065F36] border-[#D1FAE5]',
    purple: 'bg-[#E8FFF5] text-[#065F36] border-[#D1FAE5]',
    gray:   'bg-gray-100 text-gray-700 border-gray-200',
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium min-w-max ${styles[color]}`}>
      {icon}
      <span className="font-bold text-base leading-none">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
};

const TabBtn = ({ active, onClick, badge, children }) => (
  <button onClick={onClick}
    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
      active ? 'bg-gradient-to-r from-[#065F36] to-[#00874A] text-white shadow-sm' : 'text-gray-600 hover:text-[#065F36] hover:bg-white'
    }`}>
    {children}
    {badge > 0 && (
      <span className="ml-0.5 bg-red-500 text-white text-xs font-bold rounded-full w-4.5 h-4.5 min-w-[18px] min-h-[18px] flex items-center justify-center px-1">
        {badge > 9 ? '9+' : badge}
      </span>
    )}
  </button>
);

export default DomAgentDashboard;




