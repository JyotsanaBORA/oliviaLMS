import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import {
  LogOut, Bell, User, RefreshCw, FileText, CheckCircle,
  Clock, PlusCircle, Wifi, WifiOff, ChevronRight, Inbox,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationPanel from '../components/NotificationPanel';
import LeadFormModal     from '../components/LeadFormModal';
import api               from '../utils/axios';
import toast             from 'react-hot-toast';

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

  // Fetch initial notification count from dedicated count field — avoids double-fetching full list
  const fetchNotifCount = useCallback(async () => {
    try {
      const res = await api.get('/domestic-api/notifications?countOnly=1');
      setNotifCount(res.data?.count || 0);
    } catch {}
  }, []);

  useEffect(() => { fetchMyLeads(); fetchNotifCount(); }, [fetchMyLeads, fetchNotifCount]);

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

  return (
    <div className="min-h-screen bg-[#F0FFF8]">
      {/* â”€â”€ Header â”€â”€ */}
      <header className="bg-white shadow-sm sticky top-0 z-30 border-b-2 border-[#E8FFF5]">
        <div className="px-5 py-0 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <img src="/mcb-logo.png" alt="MyCashBridge" className="h-8 object-contain" />
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
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-gray-600 text-sm">
              <div className="w-7 h-7 rounded-full bg-[#E8FFF5] flex items-center justify-center text-[#065F36] font-bold text-xs border border-[#D1FAE5]">
                {user.name?.charAt(0)?.toUpperCase()}
              </div>
              <span className="text-sm">{user.name}</span>
            </div>
            <button onClick={() => { logout(); if (socketRef.current) socketRef.current.disconnect(); }}
              className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-1.5 rounded-lg transition-colors border border-red-100">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* â”€â”€ Stats strip + Tabs â”€â”€ */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 py-3 overflow-x-auto">
            <StatChip icon={<Clock className="h-3.5 w-3.5" />}   label="Pending" value={pendingCount} color="red" />
            <StatChip icon={<CheckCircle className="h-3.5 w-3.5"/>} label="Worked" value={workedCount} color="blue" />
            <StatChip icon={<FileText className="h-3.5 w-3.5" />} label="Manual" value={manualCount} color="purple" />
            <StatChip icon={<User className="h-3.5 w-3.5" />}    label="Total"   value={myLeads.length} color="gray" />
          </div>
          <div className="flex gap-1 bg-[#E8FFF5] p-1 rounded-xl flex-shrink-0">
            <TabBtn active={tab === 'notifications'} onClick={() => { setTab('notifications'); fetchNotifCount(); }} badge={notifCount}>
              <Bell className="h-3.5 w-3.5" /> New Leads
            </TabBtn>
            <TabBtn active={tab === 'my_leads'} onClick={() => setTab('my_leads')}>
              <FileText className="h-3.5 w-3.5" /> My Leads
            </TabBtn>
          </div>
        </div>
      </div>

      {/* â”€â”€ Main Panel â”€â”€ */}
      <main className="px-5 py-5">

        {/* New Leads Tab */}
        {tab === 'notifications' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#E8FFF5] rounded-xl">
                  <Bell className="h-5 w-5 text-[#065F36]" />
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
                <div className="p-2.5 bg-[#E8FFF5] rounded-xl">
                  <FileText className="h-5 w-5 text-[#065F36]" />
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
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isWorked ? 'bg-[#065F36]' : 'bg-red-400 animate-pulse'}`} />
                              <div>
                                <p className="font-semibold text-gray-800 leading-tight">{lead.name || 'â€”'}</p>
                                {lead.isManual && (
                                  <span className="text-xs bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-1.5 py-px rounded font-medium">Manual</span>
                                )}
                              </div>
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
      </main>

      {modalOpen && (
        <LeadFormModal
          websiteLead={selectedWLead}
          existingDomLead={selectedDomLead}
          onClose={() => { setModalOpen(false); setSelectedWLead(null); setSelectedDomLead(null); }}
          onSaved={() => fetchMyLeads(true)}
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
      active ? 'bg-[#065F36] text-white shadow-sm' : 'text-[#065F36]/70 hover:text-[#065F36]'
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



