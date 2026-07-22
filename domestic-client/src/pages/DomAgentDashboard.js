import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import {
  LogOut, RefreshCw, FileText, CheckCircle,
  Clock, PlusCircle, Wifi, WifiOff, ChevronRight, Inbox, Database,
  Coffee, CheckCircle2, XCircle, Phone, AlertCircle, Calendar,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LeadFormModal           from '../components/LeadFormModal';
import ImportedLeadDetailModal from '../components/ImportedLeadDetailModal';
import api   from '../utils/axios';
import toast from 'react-hot-toast';

const OUTCOME_MAP = {
  interested:     { label: 'Interested',     cls: 'bg-emerald-100 text-emerald-700' },
  not_interested: { label: 'Not Interested', cls: 'bg-red-100 text-red-700' },
  callback:       { label: 'Callback',       cls: 'bg-amber-100 text-amber-700' },
  not_reachable:  { label: 'Not Reachable',  cls: 'bg-orange-100 text-orange-700' },
  wrong_number:   { label: 'Wrong Number',   cls: 'bg-gray-100 text-gray-600' },
};

const DomAgentDashboard = () => {
  const { user, logout } = useAuth();

  const socketRef      = useRef(null);
  const [connected, setConnected] = useState(false);
  const [myLeads,   setMyLeads]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [tab, setTab] = useState('my_leads');
  const [modalOpen,       setModalOpen]       = useState(false);
  const [selectedWLead,   setSelectedWLead]   = useState(null);
  const [selectedDomLead, setSelectedDomLead] = useState(null);

  const [assignedLeads,        setAssignedLeads]        = useState([]);
  const [assignedLeadsLoading, setAssignedLeadsLoading] = useState(false);
  const [importedModalOpen,    setImportedModalOpen]    = useState(false);
  const [detailModalOpen,      setDetailModalOpen]      = useState(false); // shows all imported data first

  // Follow-up queue
  const [followups,        setFollowups]        = useState([]);
  const [followupsLoading, setFollowupsLoading] = useState(false);

  // Agent availability status
  const [agentStatus,        setAgentStatus]        = useState('available');
  const [statusUpdating,     setStatusUpdating]     = useState(false);

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
    socket.on('lead_assigned_to_you', (data) => {
      // Only act if the socket message is for this agent
      if (data.agentId === socket.auth?.token) return; // id check happens server-side
      toast.success(`Lead assigned to you: ${data.leadName || data.mobile || 'new lead'}`, { icon: '📋' });
      fetchMyLeads(true);
    });
    return () => socket.disconnect();
  }, [user.role]);

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
      const res = await api.get('/domestic-api/import-leads?limit=200');
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
      const labels = { available: 'Available ✅', break: 'On Break ☕', unavailable: 'Unavailable 🔴' };
      toast.success(`Status set to: ${labels[newStatus]}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    } finally { setStatusUpdating(false); }
  }, [agentStatus, statusUpdating]);

  const handleOpenImportedLead = useCallback(async (lead) => {
    setSelectedImportedLead(lead);
    setImportedLeadDomLead(null);
    if (lead.domLeadId) {
      try {
        const r = await api.get(`/domestic-api/leads/${lead.domLeadId}`);
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

  useEffect(() => { fetchMyLeads(); fetchMyStatus(); }, [fetchMyLeads, fetchMyStatus]);

  useEffect(() => {
    if (tab === 'assigned_leads') fetchAssignedLeads();
    if (tab === 'followups')      fetchFollowups();
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

  const STATUS_CONFIG = {
    available:   { label: 'Available',   dot: 'bg-emerald-500', activeBg: 'bg-emerald-500 text-white', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-300' },
    break:       { label: 'On Break',    dot: 'bg-amber-400',   activeBg: 'bg-amber-400 text-white',   badge: 'bg-amber-100 text-amber-700 border border-amber-300' },
    unavailable: { label: 'Unavailable', dot: 'bg-red-500',     activeBg: 'bg-red-500 text-white',     badge: 'bg-red-100 text-red-700 border border-red-300' },
  };
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* AGENT SIDEBAR */}
      <aside className="w-[210px] flex-shrink-0 flex flex-col h-screen bg-white border-r border-gray-200 shadow-sm">
        {/* Brand strip */}
        <div className="bg-[#065F36] px-4 py-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
              <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MCB" className="h-5 w-auto object-contain brightness-0 invert" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-[13px] leading-none">MyCashBridge</p>
              <p className="text-white/60 text-[9px] font-medium tracking-wider uppercase mt-1">Agent Portal</p>
            </div>
          </div>
        </div>

        {/* User + status */}
        <div className="px-3 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#f0faf5] border border-[#d1fae5]">
            <div className="relative flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-[#065F36] flex items-center justify-center font-bold text-white text-xs shadow-sm">
                {user.name?.charAt(0)?.toUpperCase()}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] border-white ${STATUS_CONFIG[agentStatus]?.dot || 'bg-emerald-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 font-semibold text-[11px] leading-none truncate">{user.name}</p>
              <div className="flex items-center gap-1 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[agentStatus]?.dot || 'bg-emerald-500'}`} />
                <p className="text-[#065F36]/70 text-[9px] font-medium">{STATUS_CONFIG[agentStatus]?.label || 'Available'}</p>
                {connected && <span className="ml-auto text-emerald-600 text-[8px] font-bold">LIVE</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 pt-3 pb-2 overflow-y-auto min-h-0">
          {/* Mini stats */}
          <div className="flex items-center gap-1.5 px-2 mb-3 flex-wrap">
            {[
              { label: 'Pending', val: pendingCount, color: 'text-orange-500 bg-orange-50' },
              { label: 'Worked',  val: workedCount,  color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Pool',    val: assignedLeads.length, color: 'text-violet-600 bg-violet-50' },
            ].map(s => (
              <div key={s.label} className={`flex items-center gap-1 px-2 py-1 rounded-lg ${s.color}`}>
                <span className="text-[11px] font-black">{s.val}</span>
                <span className="text-[9px] opacity-70">{s.label}</span>
              </div>
            ))}
          </div>

          <p className="text-gray-400 text-[9px] font-extrabold uppercase tracking-[0.14em] px-2 mb-1.5">LEADS</p>
          {[
            { key: 'my_leads',       Icon: FileText, label: 'My Leads',   sub: 'Assigned by admin'  },
            { key: 'assigned_leads', Icon: Database, label: 'Assigned',   sub: 'Pool leads'         },
            { key: 'followups',      Icon: Phone,    label: 'Follow-ups', sub: 'Callbacks & retry',  badge: followups.length || null },
          ].map(({ key, Icon, label, sub, badge }) => {
            const isActive = tab === key;
            return (
              <button key={key} onClick={() => { setTab(key); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left relative group mb-0.5 ${
                  isActive ? 'bg-[#e8f5ed] text-[#065F36]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}>
                {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#065F36] rounded-r-full" />}
                <Icon className={`h-[14px] w-[14px] flex-shrink-0 ${isActive ? 'text-[#065F36]' : 'text-gray-400 group-hover:text-gray-600'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-semibold leading-none ${isActive ? 'text-[#065F36]' : 'text-gray-600 group-hover:text-gray-800'}`}>{label}</p>
                  <p className={`text-[10px] mt-1 ${isActive ? 'text-[#065F36]/60' : 'text-gray-400'}`}>{sub}</p>
                </div>
                {badge > 0 && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    isActive ? 'bg-[#065F36]/20 text-[#065F36]' : 'bg-red-500 text-white'
                  }`}>{badge}</span>
                )}
              </button>
            );
          })}

          {/* Status toggle */}
          <p className="text-gray-400 text-[9px] font-extrabold uppercase tracking-[0.14em] px-2 mt-3 mb-1.5">MY STATUS</p>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button key={key} onClick={() => handleStatusChange(key)} disabled={statusUpdating}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left mb-0.5 ${
                agentStatus === key
                  ? 'bg-[#e8f5ed] border border-[#d1fae5]'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`}>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
              <span className={`text-[11px] font-semibold ${agentStatus === key ? 'text-gray-700' : ''}`}>{cfg.label}</span>
              {agentStatus === key && <span className="ml-auto text-[9px] text-[#065F36] font-bold">Active</span>}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="flex-shrink-0 px-2 pb-3 pt-2 border-t border-gray-100">
          <button onClick={() => { logout(); if (socketRef.current) socketRef.current.disconnect(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all text-left">
            <LogOut className="h-[14px] w-[14px] flex-shrink-0" />
            <span className="text-[12px] font-semibold">Sign out</span>
          </button>
        </div>
      </aside>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto min-w-0">
      <main className="px-5 py-5 space-y-5">

        {/* My Leads Tab */}
        {tab === 'my_leads' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-[#065F36] to-[#00874A] rounded-xl shadow-sm"><FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-800 text-base">My Leads</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className="inline-flex items-center gap-1 mr-3">
                      <span className="w-2 h-2 rounded-full bg-red-400 inline-block animate-pulse" /> Pending (form not filled)
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#065F36] inline-block" /> Worked (form submitted)
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setSelectedWLead(null); setSelectedDomLead(null); setModalOpen(true); }}
                  className="flex items-center gap-1.5 text-sm bg-[#065F36] hover:bg-[#054A2E] text-white px-4 py-2 rounded-xl font-semibold shadow-sm transition-all">
                  <PlusCircle className="h-4 w-4" /> Add Manual Lead
                </button>
                <button onClick={() => fetchMyLeads(true)} disabled={refreshing}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 transition-colors bg-white">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                <span className="w-8 h-8 border-3 border-gray-200 border-t-[#065F36] rounded-full animate-spin mb-3" />
                <span className="text-sm text-gray-400">Loading your leads…</span>
              </div>
            ) : myLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Inbox className="h-14 w-14 text-gray-200 mb-4" />
                <p className="font-semibold text-gray-500 text-base">No leads yet</p>
                <p className="text-sm mt-1 text-gray-400">Your admin will assign website leads to you. Use <strong className="text-[#065F36]">Add Manual Lead</strong> to enter a lead directly.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-6 pr-3 py-3.5 w-8">#</th>
                      <th className="px-3 py-3.5">Lead ID</th>
                      <th className="px-3 py-3.5">Source</th>
                      <th className="px-3 py-3.5">Customer</th>
                      <th className="px-3 py-3.5">Mobile</th>
                      <th className="px-3 py-3.5">City</th>
                      <th className="px-3 py-3.5">Service</th>
                      <th className="px-3 py-3.5">Date</th>
                      <th className="px-3 py-3.5">Outcome</th>
                      <th className="px-3 py-3.5">Status</th>
                      <th className="px-3 pr-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {myLeads.map((lead, idx) => {
                      const isWorked = lead.isWorked;
                      const outcomeKey = lead.domLead?.callOutcome || lead.callOutcome || '';
                      const outcome    = OUTCOME_MAP[outcomeKey];
                      const date       = lead.loadedAt || lead.createdAt;
                      return (
                        <tr key={lead._id}
                          className="hover:bg-[#E8FFF5]/70 transition-colors cursor-pointer group"
                          onClick={() => handleOpenLead(lead)}>
                          <td className="pl-6 pr-3 py-3.5 text-gray-300 text-xs font-mono">{idx + 1}</td>
                          <td className="px-3 py-3.5">
                            {lead.domLead?.leadRef
                              ? <span className="font-mono text-xs font-bold bg-[#065F36] text-[#7CFF7C] px-2 py-1 rounded-md tracking-wider border border-[#054A2E]">{lead.domLead.leadRef}</span>
                              : <span className="text-gray-300 text-xs italic">Not started</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            {lead.isManual
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">✍️ Manual</span>
                              : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700 border border-teal-200">🌐 Website</span>
                            }
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isWorked ? 'bg-[#065F36]' : 'bg-red-400 animate-pulse'}`} />
                              <p className="font-semibold text-gray-800 leading-tight">{lead.name || '—'}</p>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-gray-600 font-mono text-xs tracking-wide">{lead.mobile || '—'}</td>
                          <td className="px-3 py-3.5 text-gray-500 text-sm">{lead.city || '—'}</td>
                          <td className="px-3 py-3.5">
                            {lead.productType
                              ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{lead.productType.replace(/_/g,' ')}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                            {date ? new Date(date).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—'}
                          </td>
                          <td className="px-3 py-3.5">
                            {outcome
                              ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${outcome.cls}`}>{outcome.label}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold border ${
                              isWorked
                                ? 'bg-[#E8FFF5] text-[#065F36] border-[#D1FAE5]'
                                : 'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              {isWorked ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                              {isWorked ? 'Worked' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-3 pr-6 py-3.5 text-right">
                            <button onClick={(e) => { e.stopPropagation(); handleOpenLead(lead); }}
                              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#065F36] text-white hover:bg-[#054A2E] font-semibold opacity-0 group-hover:opacity-100 transition-all shadow-sm">
                              Open <ChevronRight className="h-3 w-3" />
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

        {/* Assigned Leads Tab */}
        {tab === 'assigned_leads' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#E8FFF5] rounded-xl">
                  <Database className="h-5 w-5 text-[#065F36]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-gray-800 text-base">Assigned Leads</h2>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200">
                      📊 Excel Import
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Click any row to open the full work form and record your call outcome</p>
                </div>
              </div>
              <button onClick={fetchAssignedLeads} disabled={assignedLeadsLoading}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2 transition-colors bg-white">
                <RefreshCw className={`h-4 w-4 ${assignedLeadsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {assignedLeadsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                <span className="w-8 h-8 border-2 border-gray-200 border-t-[#065F36] rounded-full animate-spin mb-3" />
                <span className="text-sm text-gray-400">Loading assigned leads…</span>
              </div>
            ) : assignedLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Database className="h-14 w-14 text-gray-200 mb-4" />
                <p className="font-semibold text-gray-500 text-base">No assigned leads yet</p>
                <p className="text-sm mt-1 text-gray-400">Your admin will assign leads from the shared pool to you.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-6 pr-3 py-3.5 w-8">#</th>
                      <th className="px-3 py-3.5">Customer</th>
                      <th className="px-3 py-3.5">Mobile</th>
                      <th className="px-3 py-3.5">Loan Type</th>
                      <th className="px-3 py-3.5">Outstanding</th>
                      <th className="px-3 py-3.5">Overdue</th>
                      <th className="px-3 py-3.5">CIBIL</th>
                      <th className="px-3 py-3.5">Status</th>
                      <th className="px-3 pr-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {assignedLeads.map((lead, idx) => {
                      const ws = lead.workStatus || 'new';
                      const WORK_STATUS = {
                        new:           { label: 'New',           cls: 'bg-orange-100 text-orange-700 border-orange-200' },
                        in_progress:   { label: 'In Progress',   cls: 'bg-blue-100 text-blue-700 border-blue-200' },
                        interested:    { label: 'Interested',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                        not_interested:{ label: 'Not Interested',cls: 'bg-red-100 text-red-700 border-red-200' },
                        closed:        { label: 'Closed',        cls: 'bg-gray-100 text-gray-600 border-gray-200' },
                      };
                      const wsInfo   = WORK_STATUS[ws] || WORK_STATUS.new;
                      const isWorked = !!lead.domLeadId;
                      const overdue  = parseInt(lead.noOfInstallmentOverdue, 10) || 0;
                      return (
                        <tr key={lead._id}
                          className="hover:bg-violet-50/50 transition-colors cursor-pointer group"
                          onClick={() => handleOpenImportedLead(lead)}>
                          <td className="pl-6 pr-3 py-3.5 text-gray-300 text-xs font-mono">{idx + 1}</td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isWorked ? 'bg-violet-500' : 'bg-orange-400 animate-pulse'}`} />
                              <div>
                                <p className="font-semibold text-gray-800 leading-tight">{lead.name || '—'}</p>
                                <p className="text-xs text-gray-400">{lead.state || lead.city || ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-gray-600 font-mono text-xs tracking-wide">{lead.mobile || '—'}</td>
                          <td className="px-3 py-3.5">
                            {(lead.loanType || lead.productType)
                              ? <span className="bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full text-xs font-medium capitalize">
                                  {(lead.loanType || lead.productType).replace(/_/g,' ')}
                                </span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            {lead.totalOutstandingAmount
                              ? <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg">?{lead.totalOutstandingAmount}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            {overdue > 0
                              ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${overdue > 3 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {overdue} EMI
                                </span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            {lead.cibilScore
                              ? <span className={`text-xs font-bold ${
                                  parseInt(lead.cibilScore) >= 700 ? 'text-emerald-600' :
                                  parseInt(lead.cibilScore) >= 600 ? 'text-amber-600' : 'text-red-600'
                                }`}>{lead.cibilScore}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${wsInfo.cls}`}>
                              {wsInfo.label}
                            </span>
                          </td>
                          <td className="px-3 pr-6 py-3.5 text-right">
                            <button onClick={(e) => { e.stopPropagation(); handleOpenImportedLead(lead); }}
                              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 font-semibold opacity-0 group-hover:opacity-100 transition-all shadow-sm">
                              View <ChevronRight className="h-3 w-3" />
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

      {/* -- Follow-up Queue -- */}}
      {tab === 'followups' && (() => {
        const today     = new Date(); today.setHours(0,0,0,0);
        const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);

        const parseDate = (d) => { if (!d) return null; const p = new Date(d); return isNaN(p) ? null : p; };

        const overdue   = followups.filter(f => { const d = parseDate(f.callbackDate); return d && d < today; });
        const todayList = followups.filter(f => { const d = parseDate(f.callbackDate); return d && d >= today && d < tomorrow; });
        const upcoming  = followups.filter(f => { const d = parseDate(f.callbackDate); return d && d >= tomorrow; });
        const noDate    = followups.filter(f => !parseDate(f.callbackDate));

        const FollowupCard = ({ f }) => {
          const outcomeColors = {
            callback:      'bg-amber-100 text-amber-700 border-amber-200',
            not_reachable: 'bg-orange-100 text-orange-700 border-orange-200',
            wrong_number:  'bg-gray-100 text-gray-600 border-gray-200',
          };
          const outcomeLabels = {
            callback:      '📞 Callback',
            not_reachable: '📵 Not Reachable',
            wrong_number:  '? Wrong Number',
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
                    <span className="font-bold text-gray-800">{f.name || '—'}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${outcomeColors[f.callOutcome] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {outcomeLabels[f.callOutcome] || f.callOutcome}
                    </span>
                    {f.leadRef && (
                      <span className="font-mono text-xs font-bold bg-gray-900 text-emerald-400 px-1.5 py-0.5 rounded">{f.leadRef}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500 flex-wrap">
                    <span className="font-mono font-semibold text-gray-700">{f.mobile || '—'}</span>
                    {f.productType && <span className="text-xs bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full capitalize">{f.productType.replace(/_/g,' ')}</span>}
                    {callbackD && (
                      <span className={`flex items-center gap-1 text-xs font-semibold ${isOverdue ? 'text-red-600' : isToday ? 'text-amber-600' : 'text-gray-500'}`}>
                        <Calendar className="h-3 w-3" />
                        {isOverdue ? '⚠️ Overdue · ' : isToday ? '🔔 Today · ' : ''}
                        {callbackD.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
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
          <div className="px-5 py-5 space-y-4">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-sm">
                    <Phone className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-800 text-base">Follow-up Queue</h2>
                    <p className="text-xs text-gray-400">Leads waiting for your call — sorted by urgency</p>
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
            </div>

            {followupsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-10 h-10 border-4 border-gray-100 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Loading follow-ups…</p>
              </div>
            ) : followups.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-20 gap-4">
                <div className="p-5 bg-emerald-100 rounded-3xl"><CheckCircle2 className="h-12 w-12 text-emerald-500" /></div>
                <div className="text-center">
                  <p className="font-bold text-gray-700 text-lg">All clear! 🎉</p>
                  <p className="text-gray-400 text-sm mt-1">No pending callbacks or unreached leads.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <Section title="Overdue Callbacks" color="bg-red-100 text-red-800"   icon="🔴" items={overdue} />
                <Section title="Call Today"         color="bg-amber-100 text-amber-800" icon="🟡" items={todayList} />
                <Section title="Upcoming"           color="bg-emerald-100 text-emerald-800" icon="🟢" items={upcoming} />
                <Section title="Not Scheduled"      color="bg-gray-100 text-gray-700"  icon="📋" items={noDate} />
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

      {/* Step 1: Show all imported lead data — agent reviews before calling */}
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

      {/* Step 2: Full work form — agent fills in call outcome, uploads docs, etc. */}
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



