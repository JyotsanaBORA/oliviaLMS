import React, { useState, useEffect, useCallback } from 'react';
import {
  LogOut, Plus, Shield, Eye, EyeOff, X, RefreshCw, Key,
  Users, UserPlus, ChevronLeft, CheckCircle2, AlertCircle, Copy,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DomAdminDashboard from './DomAdminDashboard';
import api   from '../utils/axios';
import toast from 'react-hot-toast';

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

  useEffect(() => {
    if (superTab === 'users')  fetchUsers();
    if (superTab === 'apikey') fetchApiKey();
  }, [superTab, fetchUsers, fetchApiKey]);

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
              <img src="/mcb-logo.png" alt="MyCashBridge" className="h-8 object-contain" />
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
                <span className="text-sm">Loading users…text-gray-300">|</span>
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
                              {u._id === user._id && <span className="text-xs text-[#065F36] font-medium">(You)text-gray-300">|</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-gray-500 text-xs">{u.email}</td>
                        <td className="px-3 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role]}`}>
                            {ROLE_LABELS[u.role] || u.role}
                          text-gray-300">|</span>
                        </td>
                        <td className="px-3 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            u.isActive ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700 border border-red-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-red-400'}`} />
                            {u.isActive ? 'Active' : 'Inactive'}
                          text-gray-300">|</span>
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

  /* ── API Key tab ── */
  return (
    <div className="min-h-screen bg-[#F0FFF8]">
      <header className="bg-white shadow-sm sticky top-0 z-30 border-b-2 border-[#E8FFF5]">
        <div className="px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <img src="/mcb-logo.png" alt="MyCashBridge" className="h-8 object-contain" />
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
                  text-gray-300">|</span>
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
              Full Name {!isEdit && <span className="text-red-500">*text-gray-300">|</span>}
            </label>
            <input value={form.name} onChange={set('name')} autoFocus
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="e.g. Rajesh Kumar" />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Email <span className="text-red-500">*text-gray-300">|</span>
              </label>
              <input type="email" value={form.email} onChange={set('email')}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="agent@example.com" />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              {isEdit ? 'New Password (leave blank to keep current)' : <>Password <span className="text-red-500">*text-gray-300">|</span></>}
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

