import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import {
  LogOut, Bell, User, RefreshCw, FileText, CheckCircle,
  Clock, PlusCircle, Wifi, WifiOff, ChevronRight, Inbox, Database,
  Coffee, CheckCircle2, XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationPanel       from '../components/NotificationPanel';
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
  const [tab, setTab] = useState('notifications');
  const [modalOpen,       setModalOpen]       = useState(false);
  const [selectedWLead,   setSelectedWLead]   = useState(null);
  const [selectedDomLead, setSelectedDomLead] = useState(null);
  const [notifCount, setNotifCount] = useState(0);

  const [assignedLeads,        setAssignedLeads]        = useState([]);
  const [assignedLeadsLoading, setAssignedLeadsLoading] = useState(false);
  const [selectedImportedLead, setSelectedImportedLead] = useState(null);
  const [importedLeadDomLead,  setImportedLeadDomLead]  = useState(null);
  const [importedModalOpen,    setImportedModalOpen]    = useState(false);
  const [detailModalOpen,      setDetailModalOpen]      = useState(false); // shows all imported data first

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
    socket.on('new_website_lead', () => setNotifCount((p) => p + 1));
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

  // Fetch initial notification count from dedicated count field — avoids double-fetching full list
  const fetchNotifCount = useCallback(async () => {
    try {
      const res = await api.get('/domestic-api/notifications?countOnly=1');
      setNotifCount(res.data?.count || 0);
    } catch {}
  }, []);

  useEffect(() => { fetchMyLeads(); fetchNotifCount(); fetchMyStatus(); }, [fetchMyLeads, fetchNotifCount, fetchMyStatus]);

  useEffect(() => {
    if (tab === 'assigned_leads') fetchAssignedLeads();
  }, [tab, fetchAssignedLeads]);

  const handleLeadLoaded = useCallback((newWebsiteLead) => {
    fetchMyLeads(true);
    setNotifCount((p) => Math.max(0, p - 1));
    setTab('my_leads');
    setSelectedWLead(newWebsiteLead);
    setSelectedDomLead(null);
    setModalOpen(true);
  }, [fetchMyLeads]);

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
    available:   { label: 'Available',   dot: 'bg-emerald-500', activeBg: 'bg-emerald-500 text-white shadow-emerald-200', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-300' },
    break:       { label: 'On Break',    dot: 'bg-amber-400',   activeBg: 'bg-amber-400 text-white shadow-amber-200',   badge: 'bg-amber-100 text-amber-700 border border-amber-300' },
    unavailable: { label: 'Unavailable', dot: 'bg-red-500',     activeBg: 'bg-red-500 text-white shadow-red-200',       badge: 'bg-red-100 text-red-700 border border-red-300' },
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-[#F0FFF8] to-emerald-50/30">
      {/* â”€â”€ Header â”€â”€ */}
      <header className="bg-white/95 backdrop-blur-sm shadow-sm sticky top-0 z-30 border-b border-gray-100">
        <div className="px-5 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MyCashBridge" className="h-8 object-contain" />
            <div className="border-l border-gray-200 pl-3 hidden sm:block">
              <h1 className="text-[#065F36] font-bold text-sm leading-tight">Domestic LMS</h1>
              <p className="text-gray-400 text-xs">Agent Portal</p>
            </div>
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ml-1 ${
              connected
                ? 'bg-[#E8FFF5] border-[#D1FAE5] text-[#065F36]'
                : 'bg-amber-50 border-amber-200 text-amber-600 animate-pulse'
            }`}>
              {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {connected ? 'Live' : 'Connecting'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Status toggle — desktop */}
            <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <button key={key}
                  onClick={() => handleStatusChange(key)}
                  disabled={statusUpdating}
                  title={cfg.label}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    agentStatus === key
                      ? `${cfg.activeBg} shadow-sm`
                      : 'text-gray-500 hover:bg-gray-200'
                  }`}>
                  <span className={`w-2 h-2 rounded-full ${agentStatus === key ? 'bg-white/80' : cfg.dot}`} />
                  {cfg.label}
                </button>
              ))}
            </div>

            {/* Name with status dot */}
            <div className="hidden md:flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5">
              <div className="relative">
                <div className="w-7 h-7 rounded-full bg-[#E8FFF5] flex items-center justify-center text-[#065F36] font-bold text-xs border border-[#D1FAE5]">
                  {user.name?.charAt(0)?.toUpperCase()}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${STATUS_CONFIG[agentStatus]?.dot || 'bg-emerald-500'}`} />
              </div>
              <span className="text-sm font-medium text-gray-700">{user.name}</span>
            </div>

            <button onClick={() => { logout(); if (socketRef.current) socketRef.current.disconnect(); }}
              className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-1.5 rounded-lg transition-colors border border-red-100 font-semibold">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>

        {/* Status toggle — mobile */}
        <div className="sm:hidden flex items-center gap-1 px-4 pb-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button key={key}
              onClick={() => handleStatusChange(key)}
              disabled={statusUpdating}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                agentStatus === key ? `${cfg.activeBg} shadow-sm` : 'bg-gray-100 text-gray-500'
              }`}>
              <span className={`w-2 h-2 rounded-full ${agentStatus === key ? 'bg-white/80' : cfg.dot}`} />
              {cfg.label}
            </button>
          ))}
        </div>
      </header>

      {/* â”€â”€ Stats strip + Tabs â”€â”€ */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 shadow-sm sticky top-16 z-20">
        <div className="px-5 flex items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-2 py-3 overflow-x-auto">
            <StatChip icon={<Clock className="h-3.5 w-3.5" />}   label="Pending" value={pendingCount} color="red" />
            <StatChip icon={<CheckCircle className="h-3.5 w-3.5"/>} label="Worked" value={workedCount} color="blue" />
            <StatChip icon={<FileText className="h-3.5 w-3.5" />} label="Manual" value={manualCount} color="purple" />
            
            <StatChip icon={<Database className="h-3.5 w-3.5" />} label="Pool" value={assignedLeads.length} color="blue" />
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-shrink-0">
            <TabBtn active={tab === 'notifications'} onClick={() => { setTab('notifications'); fetchNotifCount(); }} badge={notifCount}>
              <Bell className="h-3.5 w-3.5" /> New Leads
            </TabBtn>
            <TabBtn active={tab === 'my_leads'} onClick={() => setTab('my_leads')}>
              <FileText className="h-3.5 w-3.5" /> My Leads
            </TabBtn>
            <TabBtn active={tab === 'assigned_leads'} onClick={() => setTab('assigned_leads')}>
              <Database className="h-3.5 w-3.5" /> Assigned
            </TabBtn>
          </div>
        </div>
      </div>

      {/* â”€â”€ Main Panel â”€â”€ */}
      <main className="px-5 py-5 space-y-5">

        {/* New Leads Tab */}
        {tab === 'notifications' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-[#065F36] to-[#00874A] rounded-xl shadow-sm"><Bell className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-800 text-base">Incoming Website Leads</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Click <span className="font-semibold text-[#065F36]">Load</span> to claim a lead and start working it</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              <NotificationPanel socket={socketRef.current} onLeadLoaded={handleLeadLoaded} />
            </div>
          </div>
        )}

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
                <span className="text-sm text-gray-400">Loading your leadsâ€¦</span>
              </div>
            ) : myLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Inbox className="h-14 w-14 text-gray-200 mb-4" />
                <p className="font-semibold text-gray-500 text-base">No leads yet</p>
                <p className="text-sm mt-1 text-gray-400">Go to <strong className="text-[#065F36]">New Leads</strong> to claim a website lead, or add a manual one.</p>
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
                          <td className="px-3 py-3.5 text-gray-600 font-mono text-xs tracking-wide">{lead.mobile || 'â€”'}</td>
                          <td className="px-3 py-3.5 text-gray-500 text-sm">{lead.city || 'â€”'}</td>
                          <td className="px-3 py-3.5">
                            {lead.productType
                              ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{lead.productType.replace(/_/g,' ')}</span>
                              : <span className="text-gray-300 text-xs">â€”</span>}
                          </td>
                          <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                            {date ? new Date(date).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : 'â€”'}
                          </td>
                          <td className="px-3 py-3.5">
                            {outcome
                              ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${outcome.cls}`}>{outcome.label}</span>
                              : <span className="text-gray-300 text-xs">â€”</span>}
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
                              ? <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg">₹{lead.totalOutstandingAmount}</span>
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
      </main>

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



