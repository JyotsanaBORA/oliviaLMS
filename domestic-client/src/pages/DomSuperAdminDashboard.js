import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LogOut, Plus, Shield, Eye, EyeOff, X, RefreshCw, Key,
  Users, UserPlus, ChevronLeft, CheckCircle2, AlertCircle, Copy,
  Upload, Database, Share2, Globe, Search, UserCheck2,
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

const fmtShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never';

const DomSuperAdminDashboard = () => {
  const { user, logout } = useAuth();
  const [superTab, setSuperTab] = useState('main');

  const [users,           setUsers]           = useState([]);
  const [usersLoading,    setUsersLoading]    = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser,        setEditUser]        = useState(null);

  const [apiKey,         setApiKey]        = useState(null);
  const [apiKeyVisible,  setApiKeyVisible]  = useState(false);
  const [apiKeyLoading,  setApiKeyLoading]  = useState(false);

  // Import & Share state
  const [batches,         setBatches]         = useState([]);
  const [batchesLoading,  setBatchesLoading]  = useState(false);
  const [importFile,      setImportFile]      = useState(null);
  const [batchName,       setBatchName]       = useState('');
  const [uploading,       setUploading]       = useState(false);
  const [allAdmins,       setAllAdmins]       = useState([]);
  const [shareModal,      setShareModal]      = useState(null);
  const [selectedAdmins,  setSelectedAdmins]  = useState([]);
  const [sharing,         setSharing]         = useState(false);

  // Website Leads management state
  const [webLeads,           setWebLeads]           = useState([]);
  const [webLeadsTotal,      setWebLeadsTotal]       = useState(0);
  const [webLeadsPage,       setWebLeadsPage]        = useState(1);
  const [webLeadsLoading,    setWebLeadsLoading]     = useState(false);
  const [webStatusFilter,    setWebStatusFilter]     = useState('');
  const [webProductFilter,   setWebProductFilter]    = useState('');
  const [webSearch,          setWebSearch]           = useState('');
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

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await api.get('/domestic-api/admin/users');
      setUsers(res.data?.data || []);
    } catch { toast.error('Failed to load users.'); }
    finally { setUsersLoading(false); }
  }, []);

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
      const q = new URLSearchParams({ page, limit: 30 });
      if (webStatusRef.current)  q.set('status',      webStatusRef.current);
      if (webProductRef.current) q.set('productType', webProductRef.current);
      if (webSearchRef.current.trim()) q.set('search', webSearchRef.current.trim());
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

  useEffect(() => {
    if (superTab === 'users')     fetchUsers();
    if (superTab === 'apikey')    fetchApiKey();
    if (superTab === 'import')    { fetchBatches(); fetchAdmins(); }
    if (superTab === 'web_leads') { fetchWebLeads(1); fetchWebProductTypes(); fetchWebAgents(); fetchWebServiceStats(); }
  }, [superTab, fetchUsers, fetchApiKey, fetchBatches, fetchAdmins, fetchWebLeads, fetchWebProductTypes, fetchWebAgents, fetchWebServiceStats]);

  const handleToggleActive = async (u) => {
    try {
      await api.patch(`/domestic-api/admin/users/${u._id}`, { isActive: !u.isActive });
      toast.success(`${u.name} ${u.isActive ? 'deactivated' : 'activated'}.`);
      fetchUsers();
    } catch { toast.error('Failed to update user.'); }
  };

  /* ── Main: renders Admin Dashboard + sticky super-admin bar ── */
  if (superTab === 'main') {
    return (
      <div>
        {/* Purple super-admin banner at top */}
        <div className="bg-[#065F36] text-white px-5 py-2 flex items-center justify-between shadow-md z-40 relative">
          <div className="flex items-center gap-2.5">
            <div className="p-1 bg-white/20 rounded-lg">
              <Shield className="h-4 w-4 text-white/80" />
            </div>
            <div>
              <span className="text-sm font-bold">Super Admin Mode</span>
              <span className="text-white/70 text-xs ml-2">Full access to all features</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSuperTab('users')}
              className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors font-semibold border border-white/20">
              <Users className="h-3.5 w-3.5" /> User Management
            </button>
            <button onClick={() => setSuperTab('web_leads')}
              className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors font-semibold border border-white/20">
              <Globe className="h-3.5 w-3.5" /> Website Leads
            </button>
            <button onClick={() => setSuperTab('import')}
              className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors font-semibold border border-white/20">
              <Upload className="h-3.5 w-3.5" /> Import & Share
            </button>
            <button onClick={() => setSuperTab('apikey')}
              className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors font-semibold border border-white/20">
              <Key className="h-3.5 w-3.5" /> API Key
            </button>
            <button onClick={logout}
              className="flex items-center gap-1.5 text-xs bg-red-600/30 hover:bg-red-600/50 px-3 py-1.5 rounded-lg transition-colors border border-white/10">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>
        <DomAdminDashboard />
      </div>
    );
  }

  /* ── User Management ── */
  if (superTab === 'users') {
    const activeCount   = users.filter(u => u.isActive).length;
    const agentCount    = users.filter(u => u.role === 'domagent').length;
    const adminCount    = users.filter(u => u.role === 'dom_admin' || u.role === 'dom_superadmin').length;

    return (
      <div className="min-h-screen bg-[#F0FFF8]">
        {/* Header */}
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b-2 border-[#E8FFF5]">
          <div className="px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MyCashBridge" className="h-8 object-contain" />
              <div className="border-l border-gray-200 pl-3 hidden sm:flex items-center gap-2">
                <Users className="h-4 w-4 text-[#065F36]/70" />
                <h1 className="text-[#065F36] font-bold text-sm">User Management</h1>
              </div>
              <button onClick={() => setSuperTab('main')}
                className="flex items-center gap-1 text-gray-500 hover:text-[#065F36] text-sm font-medium transition-colors border border-gray-200 rounded-lg px-2.5 py-1.5 ml-2">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 bg-[#065F36] text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-[#054A2E] shadow-sm transition-all">
                <UserPlus className="h-4 w-4" /> Add User
              </button>
              <button onClick={logout}
                className="flex items-center gap-1 text-gray-500 hover:text-red-600 text-sm transition-colors px-2">
                <LogOut className="h-4 w-4" />
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
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">All Domestic LMS Users</h3>
                <p className="text-xs text-gray-400 mt-0.5">Manage agents, admins, and super admins</p>
              </div>
              <button onClick={fetchUsers} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
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
                    {users.map((u) => (
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
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-12 text-gray-400">No users found.</td></tr>
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
      </div>
    );
  }

  /* ── Website Leads tab ── */
  if (superTab === 'web_leads') {
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
        {/* Header */}
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b-2 border-[#E8FFF5]">
          <div className="px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MyCashBridge" className="h-8 object-contain" />
              <div className="border-l border-gray-200 pl-3 hidden sm:flex items-center gap-2">
                <Globe className="h-4 w-4 text-[#065F36]/70" />
                <h1 className="text-[#065F36] font-bold text-sm">Website Lead Management</h1>
              </div>
              <button onClick={() => setSuperTab('main')}
                className="flex items-center gap-1 text-gray-500 hover:text-[#065F36] text-sm font-medium transition-colors border border-gray-200 rounded-lg px-2.5 py-1.5 ml-2">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchWebLeads(webLeadsPage)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button onClick={logout}
                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-1.5 rounded-lg transition-colors border border-red-100">
                <LogOut className="h-3.5 w-3.5" /> Logout
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
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={webSearch}
                  onChange={(e) => { setWebSearch(e.target.value); webSearchRef.current = e.target.value; }}
                  onKeyDown={(e) => e.key === 'Enter' && fetchWebLeads(1)}
                  placeholder="Search by name, mobile, city…"
                  className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
                />
              </div>
              <select value={webStatusFilter}
                onChange={(e) => { setWebStatusFilter(e.target.value); webStatusRef.current = e.target.value; }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700">
                <option value="">All Statuses</option>
                <option value="new">New (Unclaimed)</option>
                <option value="loaded">Loaded by Agent</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
              <select value={webProductFilter}
                onChange={(e) => { setWebProductFilter(e.target.value); webProductRef.current = e.target.value; }}
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
              <button onClick={() => fetchWebLeads(1)}
                className="flex items-center gap-2 text-sm bg-[#065F36] text-white px-4 py-2 rounded-xl hover:bg-[#054A2E] font-semibold">
                <Search className="h-4 w-4" /> Search
              </button>
              {(webStatusFilter || webProductFilter || webSearch) && (
                <button onClick={() => {
                  setWebStatusFilter(''); setWebProductFilter(''); setWebSearch('');
                  webStatusRef.current = ''; webProductRef.current = ''; webSearchRef.current = '';
                  fetchWebLeads(1);
                }} className="text-xs text-gray-400 hover:text-red-500 font-medium px-2 py-1 rounded-lg border border-gray-200 hover:border-red-200 transition-colors">
                  Clear filters
                </button>
              )}
            </div>

            {/* Stats bar */}
            <div className="flex items-center gap-4 px-6 py-2 bg-white border-b border-gray-100 text-xs text-gray-500">
              <span>Total: <strong className="text-gray-800">{webLeadsTotal}</strong></span>
              {webProductFilter && <span className="bg-[#E8FFF5] text-[#065F36] px-2 py-0.5 rounded-full font-semibold capitalize">{webProductFilter.replace(/_/g,' ')}</span>}
              {webStatusFilter  && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold capitalize">{webStatusFilter}</span>}
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
  }

  /* ── Import & Share tab ── */
  if (superTab === 'import') {
    const fmtNum = (n) => (n || 0).toLocaleString('en-IN');
    return (
      <div className="min-h-screen bg-[#F0FFF8]">
        <header className="bg-white shadow-sm sticky top-0 z-30 border-b-2 border-[#E8FFF5]">
          <div className="px-6 flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MyCashBridge" className="h-8 object-contain" />
              <div className="border-l border-gray-200 pl-3 hidden sm:flex items-center gap-2">
                <Upload className="h-4 w-4 text-[#065F36]/70" />
                <h1 className="text-[#065F36] font-bold text-sm">Import & Share Leads</h1>
              </div>
              <button onClick={() => setSuperTab('main')}
                className="flex items-center gap-1 text-gray-500 hover:text-[#065F36] text-sm font-medium transition-colors border border-gray-200 rounded-lg px-2.5 py-1.5 ml-2">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            </div>
            <button onClick={logout}
              className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-1.5 rounded-lg transition-colors border border-red-100">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </header>

        <main className="px-6 py-5 space-y-5 max-w-5xl">
          {/* Upload Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="p-2.5 bg-[#E8FFF5] rounded-xl"><Upload className="h-5 w-5 text-[#065F36]" /></div>
              <div>
                <h3 className="font-bold text-gray-800">Import Excel / CSV</h3>
                <p className="text-xs text-gray-400 mt-0.5">Upload a file with columns: Name, Mobile, Email, City, Product Type, Monthly Income, Loan Amount, etc.</p>
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
              <button onClick={fetchBatches}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#065F36] border border-gray-200 rounded-xl px-3 py-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
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
                {batches.map((b) => (
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
                    <button
                      onClick={() => { setShareModal({ batchId: b._id, batchName: b.batchName || b._id }); setSelectedAdmins([]); }}
                      className="flex-shrink-0 flex items-center gap-1.5 text-sm bg-[#065F36] text-white px-4 py-2 rounded-xl hover:bg-[#054A2E] font-semibold shadow-sm ml-4 transition-all">
                      <Share2 className="h-4 w-4" /> Share with Admin
                    </button>
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
  }

  /* ── API Key tab ── */
  return (
    <div className="min-h-screen bg-[#F0FFF8]">
      <header className="bg-white shadow-sm sticky top-0 z-30 border-b-2 border-[#E8FFF5]">
        <div className="px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <img src={`${process.env.PUBLIC_URL}/mcb-logo.png`} alt="MyCashBridge" className="h-8 object-contain" />
            <div className="border-l border-gray-200 pl-3 hidden sm:flex items-center gap-2">
              <Key className="h-4 w-4 text-[#065F36]/70" />
              <h1 className="text-[#065F36] font-bold text-sm">Website Intake API Key</h1>
            </div>
            <button onClick={() => setSuperTab('main')}
              className="flex items-center gap-1 text-gray-500 hover:text-[#065F36] text-sm font-medium transition-colors border border-gray-200 rounded-lg px-2.5 py-1.5 ml-2">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
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

