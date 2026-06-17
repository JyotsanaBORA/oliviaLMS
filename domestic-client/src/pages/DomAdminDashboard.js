import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LogOut, RefreshCw, Users, TrendingUp, BarChart2, Search,
  Eye, X, Hash, Globe, Briefcase, CheckCircle2, Clock,
  AlertCircle, UserCheck, Calendar, ChevronLeft, ChevronRight,
  Inbox, Award, Download, FileDown, ExternalLink, FileText,
  Image as ImageIcon, File,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api   from '../utils/axios';
import toast from 'react-hot-toast';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never';

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

const TABS = ['overview', 'website_leads', 'dom_leads', 'agents'];
const TAB_META = {
  overview:      { label: 'Overview',      Icon: BarChart2, color: 'indigo' },
  website_leads: { label: 'Website Leads', Icon: Globe,     color: 'blue'   },
  dom_leads:     { label: 'Worked Leads',  Icon: Briefcase, color: 'purple' },
  agents:        { label: 'Agents',        Icon: Users,     color: 'teal'   },
};

const DomAdminDashboard = () => {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('overview');

  const [stats,    setStats]    = useState(null);
  const [pipeline, setPipeline] = useState([]);

  const [leads,        setLeads]        = useState([]);
  const [leadsTotal,   setLeadsTotal]   = useState(0);
  const [leadsPage,    setLeadsPage]    = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search,       setSearch]       = useState('');
  const [leadsLoading, setLeadsLoading] = useState(false);

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

  // Refs hold current filter values so callbacks stay stable (no re-creation on every keystroke)
  const searchRef          = useRef('');
  const statusFilterRef    = useRef('');
  const domSearchRef       = useRef('');
  const domStatusRef       = useRef('');
  const domProductRef      = useRef('');

  const statsLoadedRef = useRef(false);

  const fetchStats = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api.get('/domestic-api/admin/stats'),
        api.get('/domestic-api/admin/pipeline'),
      ]);
      setStats(s.data?.stats);
      setPipeline(p.data?.pipeline || []);
      statsLoadedRef.current = true;
    } catch { toast.error('Failed to load stats.'); }
  }, []);

  // Stable callbacks — read filter values from refs, not from closure state
  const fetchLeads = useCallback(async (page = 1) => {
    setLeadsLoading(true);
    try {
      const q = new URLSearchParams({ page, limit: 30 });
      if (statusFilterRef.current)       q.set('status', statusFilterRef.current);
      if (searchRef.current.trim())      q.set('search', searchRef.current.trim());
      const res = await api.get(`/domestic-api/website-leads?${q}`);
      setLeads(res.data?.data || []);
      setLeadsTotal(res.data?.pagination?.total || 0);
      setLeadsPage(page);
    } catch { toast.error('Failed to load leads.'); }
    finally { setLeadsLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDomLeads = useCallback(async (page = 1) => {
    setDomLeadsLoading(true);
    try {
      const q = new URLSearchParams({ page, limit: 30 });
      if (domSearchRef.current.trim())   q.set('search',      domSearchRef.current.trim());
      if (domStatusRef.current)          q.set('status',      domStatusRef.current);
      if (domProductRef.current)         q.set('productType', domProductRef.current);
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

  // Load stats once on mount
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Load tab data only on tab switch — not on filter changes
  useEffect(() => {
    if (tab === 'website_leads') fetchLeads(1);
    if (tab === 'dom_leads')     fetchDomLeads(1);
    if (tab === 'agents')        fetchAgents();
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

  const handleExportExcel = useCallback(async () => {
    try {
      toast.loading('Exporting Excel…', { id: 'csv' });
      const q = new URLSearchParams();
      if (domSearchRef.current.trim())  q.set('search',      domSearchRef.current.trim());
      if (domStatusRef.current)         q.set('status',      domStatusRef.current);
      if (domProductRef.current)        q.set('productType', domProductRef.current);
      const token = localStorage.getItem('dom_token');
      const res   = await fetch(`/domestic-api/leads/export?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `domestic-leads-${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
      const token = localStorage.getItem('dom_token');
      const res   = await fetch(`/domestic-api/leads/export-zip?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `domestic-leads-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('ZIP downloaded!', { id: 'exzip' });
    } catch (err) { toast.error(`Export failed: ${err.message}`, { id: 'exzip' }); }
  }, []);

  const maxPipeline = useMemo(
    () => pipeline.length ? Math.max(...pipeline.map(p => p.count), 1) : 1,
    [pipeline]
  );

  return (
    <div className="min-h-screen bg-[#F0FFF8]">

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30 border-b-2 border-[#E8FFF5]">
        <div className="px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MyCashBridge" className="h-8 object-contain" />
            <div className="border-l border-gray-200 pl-3 hidden sm:block">
              <h1 className="text-[#065F36] font-bold text-sm leading-tight">Domestic LMS</h1>
              <p className="text-gray-400 text-xs">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-gray-600 text-sm">
              <div className="w-7 h-7 rounded-full bg-[#E8FFF5] flex items-center justify-center text-[#065F36] font-bold text-xs border border-[#D1FAE5]">
                {user.name?.charAt(0)?.toUpperCase()}
              </div>
              {user.name}
            </div>
            <button onClick={logout}
              className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-1.5 rounded-lg transition-colors border border-red-100">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tab nav */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 flex gap-1 py-2 overflow-x-auto">
          {TABS.map((t) => {
            const { label, Icon } = TAB_META[t];
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  tab === t ? 'bg-[#065F36] text-white shadow-sm' : 'text-gray-700 hover:bg-[#E8FFF5]'
                }`}>
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="px-6 py-5 space-y-5">

        {/* OVERVIEW */}
        {tab === 'overview' && stats && (
          <>
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
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#E8FFF5] rounded-xl"><TrendingUp className="h-5 w-5 text-[#065F36]" /></div>
                  <div>
                    <h3 className="font-bold text-gray-800">Lead Pipeline</h3>
                    <p className="text-xs text-gray-400">How leads progress through each stage</p>
                  </div>
                </div>
                <button onClick={fetchStats} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#065F36] border border-gray-200 rounded-lg px-3 py-1.5">
                  <RefreshCw className="h-4 w-4" /> Refresh
                </button>
              </div>
              <div className="space-y-4">
                {pipeline.map((stage) => (
                  <div key={stage.stage} className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 w-36 flex-shrink-0 font-medium">{stage.stage}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                      <div className="h-7 bg-gradient-to-r from-[#065F36] to-[#00A651] rounded-full flex items-center justify-end pr-3 transition-all duration-700"
                        style={{ width: `${Math.max((stage.count / maxPipeline) * 100, 3)}%` }}>
                        <span className="text-white text-xs font-bold">{stage.count}</span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-700 w-8 text-right">{stage.count}</span>
                  </div>
                ))}
                {pipeline.length === 0 && <Empty label="No pipeline data yet." />}
              </div>
            </div>
          </>
        )}

        {/* WEBSITE LEADS */}
        {tab === 'website_leads' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl"><Globe className="h-5 w-5 text-blue-600" /></div>
              <div>
                <h2 className="font-bold text-gray-800">Website Leads</h2>
                <p className="text-xs text-gray-400">Leads that arrived from the MyCashbridge website</p>
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
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); statusFilterRef.current = e.target.value; }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">All Statuses</option>
                <option value="new">New (Unclaimed)</option>
                <option value="loaded">Loaded by Agent</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
              <button onClick={() => fetchLeads(1)}
                className="flex items-center gap-2 text-sm bg-[#065F36] text-white px-4 py-2 rounded-xl hover:bg-[#054A2E] font-semibold">
                <Search className="h-4 w-4" /> Search
              </button>
            </div>

            {leadsLoading ? <Spinner /> : leads.length === 0 ? <Empty label="No website leads found." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-6 pr-3 py-3.5 text-left">Customer</th>
                      <th className="px-3 py-3.5 text-left">Mobile</th>
                      <th className="px-3 py-3.5 text-left">City</th>
                      <th className="px-3 py-3.5 text-left">Service Needed</th>
                      <th className="px-3 py-3.5 text-left">Status</th>
                      <th className="px-3 py-3.5 text-left">Claimed By</th>
                      <th className="px-3 py-3.5 text-left">Received On</th>
                      <th className="px-3 pr-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {leads.map((lead) => (
                      <tr key={lead._id} className="hover:bg-[#E8FFF5]/60 transition-colors group">
                        <td className="pl-6 pr-3 py-3.5 font-semibold text-gray-800">{lead.name || '—'}</td>
                        <td className="px-3 py-3.5 font-mono text-xs text-gray-600 tracking-wide">{lead.mobile || '—'}</td>
                        <td className="px-3 py-3.5 text-gray-500">{lead.city || '—'}</td>
                        <td className="px-3 py-3.5">
                          {lead.productType
                            ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{lead.productType.replace(/_/g,' ')}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3.5"><StatusBadge status={lead.status} /></td>
                        <td className="px-3 py-3.5 text-gray-600 text-sm">{lead.loadedBy?.name || <span className="text-orange-500 text-xs font-medium">Unclaimed</span>}</td>
                        <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(lead.createdAt)}</td>
                        <td className="px-3 pr-6 py-3.5 text-right">
                          <button onClick={() => handleViewLead(lead)}
                            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#065F36] text-white hover:bg-[#054A2E] font-semibold opacity-0 group-hover:opacity-100 transition-all">
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination total={leadsTotal} page={leadsPage} perPage={30} count={leads.length}
              onPrev={() => fetchLeads(leadsPage - 1)} onNext={() => fetchLeads(leadsPage + 1)} />
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
              <select value={domStatusFilter} onChange={(e) => { setDomStatusFilter(e.target.value); domStatusRef.current = e.target.value; }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
              <select value={domProductFilter} onChange={(e) => { setDomProductFilter(e.target.value); domProductRef.current = e.target.value; }}
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
              <button onClick={handleExportExcel}
                className="flex items-center gap-2 text-sm bg-white border border-[#D1FAE5] text-[#065F36] px-4 py-2 rounded-xl hover:bg-[#E8FFF5] font-semibold transition-colors">
                <FileDown className="h-4 w-4" /> Export Excel
              </button>
              <button onClick={handleExportWithDocs}
                className="flex items-center gap-2 text-sm bg-white border border-blue-200 text-blue-700 px-4 py-2 rounded-xl hover:bg-blue-50 font-semibold transition-colors">
                <Download className="h-4 w-4" /> Export with Docs
              </button>
            </div>

            {domLeadsLoading ? <Spinner /> : domLeads.length === 0 ? <Empty label="No worked leads found. Try adjusting the filters." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-6 pr-3 py-3.5 text-left">Lead ID</th>
                      <th className="px-3 py-3.5 text-left">Customer</th>
                      <th className="px-3 py-3.5 text-left">Mobile</th>
                      <th className="px-3 py-3.5 text-left">City</th>
                      <th className="px-3 py-3.5 text-left">Service</th>
                      <th className="px-3 py-3.5 text-left">Handled By</th>
                      <th className="px-3 py-3.5 text-left">Call Outcome</th>
                      <th className="px-3 py-3.5 text-left">Status</th>
                      <th className="px-3 py-3.5 text-left">Created</th>
                      <th className="px-3 pr-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {domLeads.map((dl) => {
                      const outcome = OUTCOME_META[dl.callOutcome];
                      return (
                        <tr key={dl._id} className="hover:bg-[#E8FFF5]/40 transition-colors group">
                          <td className="pl-6 pr-3 py-3.5"><LeadRefBadge code={dl.leadRef} /></td>
                          <td className="px-3 py-3.5 font-semibold text-gray-800">{dl.name || '—'}</td>
                          <td className="px-3 py-3.5 font-mono text-xs text-gray-600 tracking-wide">{dl.mobile || '—'}</td>
                          <td className="px-3 py-3.5 text-gray-500">{dl.city || '—'}</td>
                          <td className="px-3 py-3.5">
                            {dl.productType
                              ? <span className="bg-[#E8FFF5] text-[#065F36] border border-[#D1FAE5] px-2 py-0.5 rounded-full text-xs font-medium capitalize">{dl.productType.replace(/_/g,' ')}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3.5 text-gray-700 text-sm">{dl.assignedTo?.name || '—'}</td>
                          <td className="px-3 py-3.5">
                            {outcome
                              ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${outcome.cls}`}>{outcome.label}</span>
                              : <span className="text-gray-300 text-xs">Not called</span>}
                          </td>
                          <td className="px-3 py-3.5"><StatusBadge status={dl.status} /></td>
                          <td className="px-3 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(dl.createdAt)}</td>
                          <td className="px-3 pr-6 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => setViewDL(dl)}
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#065F36] text-white hover:bg-[#054A2E] font-semibold shadow-sm">
                                <Eye className="h-3.5 w-3.5" /> View
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDownloadZip(dl._id, dl.leadRef); }}
                                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold shadow-sm">
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination total={domLeadsTotal} page={domLeadsPage} perPage={30} count={domLeads.length}
              onPrev={() => fetchDomLeads(domLeadsPage - 1)} onNext={() => fetchDomLeads(domLeadsPage + 1)} />
          </div>
        )}

        {/* AGENTS */}
        {tab === 'agents' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#E8FFF5] rounded-xl"><Users className="h-5 w-5 text-[#065F36]" /></div>
                <div>
                  <h2 className="font-bold text-gray-800">Agent Performance</h2>
                  <p className="text-xs text-gray-400">Track how each agent is handling leads</p>
                </div>
              </div>
              <button onClick={fetchAgents}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>

            {agentsLoading ? <Spinner /> : agents.length === 0 ? <Empty label="No agents found." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                      <th className="pl-6 pr-3 py-3.5 text-left">Agent</th>
                      <th className="px-3 py-3.5 text-left">Email</th>
                      <th className="px-3 py-3.5 text-center">Leads Loaded</th>
                      <th className="px-3 py-3.5 text-center">Completed</th>
                      <th className="px-3 py-3.5 text-center">Worked Leads</th>
                      <th className="px-3 py-3.5 text-left">Last Login</th>
                      <th className="px-3 pr-6 py-3.5 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {agents.map((a) => (
                      <tr key={a._id} className="hover:bg-[#E8FFF5]/40 transition-colors">
                        <td className="pl-6 pr-3 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#065F36] to-[#00A651] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                              {a.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <span className="font-semibold text-gray-800">{a.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-gray-500 text-xs">{a.email}</td>
                        <td className="px-3 py-4 text-center"><span className="font-bold text-blue-700 text-base">{a.leadsLoaded}</span></td>
                        <td className="px-3 py-4 text-center"><span className="font-bold text-emerald-700 text-base">{a.leadsCompleted}</span></td>
                        <td className="px-3 py-4 text-center">
                          <span className="inline-flex items-center gap-1 font-bold text-[#065F36] text-base">
                            <Award className="h-3.5 w-3.5" />{a.domLeadsCreated}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-gray-400 text-xs">{fmtShort(a.lastLogin)}</td>
                        <td className="px-3 pr-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            a.isActive ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700 border border-red-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${a.isActive ? 'bg-emerald-500' : 'bg-red-400'}`} />
                            {a.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

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
              <button onClick={() => handleDownloadZip(viewDomLead._id, viewDomLead.leadRef)}
                className="flex items-center gap-1.5 text-sm bg-[#065F36] text-white px-3 py-1.5 rounded-xl hover:bg-[#054A2E] font-semibold transition-all">
                <Download className="h-3.5 w-3.5" /> Download ZIP
              </button>
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
          subtitle={<span className="flex items-center gap-2 flex-wrap">Agent: {viewDL.assignedTo?.name || '—'} <LeadRefBadge code={viewDL.leadRef} /></span>}
          onClose={() => setViewDL(null)} color="purple" size="xl">
          {/* Download strip */}
          <div className="px-6 py-3 bg-[#F0FFF8] border-b border-[#D1FAE5] flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {viewDL.documents?.length ? `${viewDL.documents.length} document(s) attached` : 'No documents'}
            </span>
            <button onClick={() => handleDownloadZip(viewDL._id, viewDL.leadRef)}
              className="flex items-center gap-2 text-sm bg-[#065F36] text-white px-4 py-2 rounded-xl hover:bg-[#054A2E] font-semibold transition-all shadow-sm">
              <Download className="h-4 w-4" /> Download ZIP (Lead + Docs)
            </button>
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
  );
};

/* ── Shared UI sub-components ── */

const KpiCard = ({ icon, label, value, color }) => {
  const accent = {
    blue:   { border: 'border-l-blue-500',     iconBg: 'bg-blue-100 text-blue-600'    },
    orange: { border: 'border-l-orange-500',   iconBg: 'bg-orange-100 text-orange-600'},
    green:  { border: 'border-l-[#00A651]',    iconBg: 'bg-[#E8FFF5] text-[#065F36]' },
    violet: { border: 'border-l-violet-500',   iconBg: 'bg-violet-100 text-violet-600'},
    sky:    { border: 'border-l-sky-500',      iconBg: 'bg-sky-100 text-sky-600'     },
    amber:  { border: 'border-l-amber-500',    iconBg: 'bg-amber-100 text-amber-600' },
    indigo: { border: 'border-l-[#065F36]',    iconBg: 'bg-[#E8FFF5] text-[#065F36]' },
    teal:   { border: 'border-l-[#00A651]',    iconBg: 'bg-[#E8FFF5] text-[#065F36]' },
  }[color] || { border: 'border-l-[#065F36]', iconBg: 'bg-[#E8FFF5] text-[#065F36]' };
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 border-l-4 ${accent.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-xl ${accent.iconBg}`}>{icon}</div>
      </div>
      <p className="text-3xl font-black leading-none text-gray-800">{value}</p>
      <p className="text-xs text-gray-500 mt-1.5 font-medium">{label}</p>
    </div>
  );
};

const Spinner = () => (
  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
    <span className="w-8 h-8 border-2 border-gray-200 border-t-[#065F36] rounded-full animate-spin mb-3" />
    <span className="text-sm">Loading…</span>
  </div>
);

const Empty = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-20">
    <Inbox className="h-14 w-14 text-gray-200 mb-4" />
    <p className="text-gray-400 text-sm">{label}</p>
  </div>
);

const Pagination = ({ total, page, perPage, count, onPrev, onNext }) => {
  if (total <= perPage) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
      <span className="text-sm text-gray-500">{total} total records</span>
      <div className="flex items-center gap-2">
        <button onClick={onPrev} disabled={page === 1}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>
        <span className="px-3 py-1.5 text-sm text-gray-600 font-semibold">Page {page}</span>
        <button onClick={onNext} disabled={count < perPage}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">
          Next <ChevronRight className="h-4 w-4" />
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

