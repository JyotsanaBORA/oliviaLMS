import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, ToggleLeft, ToggleRight, Trash2, Edit3, Save, X,
  Search, RefreshCw, Shield, ChevronDown
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from './LoadingSpinner';
import CreateAgentModal from './CreateAgentModal';

// ─────────────────────────────────────────────────────────────────────────────
// SuperUserManagement – cross-org user management for Reddington admin only
// ─────────────────────────────────────────────────────────────────────────────
const SuperUserManagement = () => {
  const [organizations, setOrganizations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(''); // '' = all
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'active' | 'inactive'
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit state
  const [editingAgent, setEditingAgent] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '', vicidialAgentId: '' });
  const [isUpdating, setIsUpdating] = useState(false);

  // ── fetch orgs ────────────────────────────────────────────────────────────
  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await axios.get('/api/organizations');
      const list = res.data.data || res.data || [];
      setOrganizations(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Could not load organizations');
    }
  }, []);

  // ── fetch agents (all orgs, or filtered) ─────────────────────────────────
  const fetchAgents = useCallback(async (orgId = selectedOrg) => {
    try {
      const params = {};
      if (orgId) params.organization = orgId;
      const res = await axios.get('/api/auth/agents', { params });
      setAgents(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error fetching users');
      setAgents([]);
    }
  }, [selectedOrg]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchOrganizations(), fetchAgents('')]);
      setLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAgents(selectedOrg);
    setRefreshing(false);
  };

  const handleOrgFilter = (orgId) => {
    setSelectedOrg(orgId);
    setSelectedAgents([]);
    fetchAgents(orgId);
  };

  // ── create ────────────────────────────────────────────────────────────────
  const handleAgentCreated = (newAgent) => {
    setAgents(prev => [newAgent, ...prev]);
    toast.success('User created successfully!');
  };

  // ── toggle active ─────────────────────────────────────────────────────────
  const toggleAgentStatus = async (agentId, current) => {
    try {
      await axios.put(`/api/auth/agents/${agentId}/status`, { isActive: !current });
      setAgents(prev => prev.map(a => a._id === agentId ? { ...a, isActive: !current } : a));
      toast.success(`User ${!current ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error updating status');
    }
  };

  // ── edit inline ───────────────────────────────────────────────────────────
  const startEdit = (agent) => {
    setEditingAgent(agent._id);
    setEditFormData({ name: agent.name, email: agent.email, vicidialAgentId: agent.vicidialAgentId || '' });
  };

  const cancelEdit = () => { setEditingAgent(null); };

  const saveEdit = async (agentId) => {
    if (!editFormData.name.trim() || !editFormData.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setIsUpdating(true);
    try {
      await axios.put(`/api/auth/agents/${agentId}`, {
        name: editFormData.name.trim(),
        email: editFormData.email.trim(),
        vicidialAgentId: editFormData.vicidialAgentId.trim()
      });
      setAgents(prev => prev.map(a =>
        a._id === agentId
          ? { ...a, name: editFormData.name.trim(), email: editFormData.email.trim(), vicidialAgentId: editFormData.vicidialAgentId.trim() }
          : a
      ));
      setEditingAgent(null);
      toast.success('User updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error updating user');
    } finally {
      setIsUpdating(false);
    }
  };

  // ── delete single ─────────────────────────────────────────────────────────
  const deleteAgent = async (agentId, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/auth/agents/${agentId}`);
      setAgents(prev => prev.filter(a => a._id !== agentId));
      setSelectedAgents(prev => prev.filter(id => id !== agentId));
      toast.success('User deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error deleting user');
    }
  };

  // ── bulk delete ───────────────────────────────────────────────────────────
  const deleteSelected = async () => {
    if (!selectedAgents.length) return;
    const names = agents.filter(a => selectedAgents.includes(a._id)).map(a => a.name).join(', ');
    if (!window.confirm(`Delete ${selectedAgents.length} user(s)?\n\n${names}\n\nThis cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      await Promise.all(selectedAgents.map(id => axios.delete(`/api/auth/agents/${id}`)));
      setAgents(prev => prev.filter(a => !selectedAgents.includes(a._id)));
      setSelectedAgents([]);
      toast.success(`Deleted ${selectedAgents.length} user(s)`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error deleting users');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = (id) =>
    setSelectedAgents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectAll = (checked) =>
    setSelectedAgents(checked ? filteredAgents.map(a => a._id) : []);

  // ── local filter (search + status) ───────────────────────────────────────
  const filteredAgents = agents.filter(a => {
    const matchSearch =
      !searchTerm ||
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.vicidialAgentId || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus =
      !statusFilter ||
      (statusFilter === 'active' ? a.isActive : !a.isActive);
    return matchSearch && matchStatus;
  });

  // ── helpers ───────────────────────────────────────────────────────────────
  const roleColor = (role) => {
    const map = { agent1: 'bg-blue-100 text-blue-800', agent2: 'bg-green-100 text-green-800', admin: 'bg-purple-100 text-purple-800' };
    return map[role] || 'bg-gray-100 text-gray-800';
  };

  const orgName = (agent) => agent.organization?.name || '—';
  const orgColor = (name) => {
    if (!name) return 'bg-gray-100 text-gray-600';
    const hash = [...name].reduce((h, c) => h * 31 + c.charCodeAt(0), 0);
    const palette = [
      'bg-amber-100 text-amber-800', 'bg-cyan-100 text-cyan-800',
      'bg-pink-100 text-pink-800', 'bg-indigo-100 text-indigo-800',
      'bg-teal-100 text-teal-800', 'bg-orange-100 text-orange-800',
    ];
    return palette[Math.abs(hash) % palette.length];
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">User Management</h2>
              <p className="text-xs text-gray-500">Super admin control — all organisations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all active:scale-95 shadow-md"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
            >
              <UserPlus className="w-4 h-4" />
              Create User
            </button>
          </div>
        </div>
      </div>

      {/* ─── Filters ────────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-3 items-center">
        {/* Org tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => handleOrgFilter('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${selectedOrg === '' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
          >
            All Orgs
            <span className="ml-1 opacity-70">({agents.length})</span>
          </button>
          {organizations.map(org => {
            const count = agents.filter(a => (a.organization?._id || a.organization) === org._id).length;
            const active = selectedOrg === org._id;
            return (
              <button
                key={org._id}
                onClick={() => handleOrgFilter(org._id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${active ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
              >
                {org.name.length > 20 ? org.name.slice(0, 20) + '…' : org.name}
                <span className="ml-1 opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-[160px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, email, ViciID…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div className="relative">
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* ─── Bulk action bar ─────────────────────────────────────────────────── */}
      {selectedAgents.length > 0 && (
        <div className="px-5 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
          <span className="text-sm font-medium text-indigo-800">
            {selectedAgents.length} user{selectedAgents.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedAgents([])} className="text-xs text-indigo-600 hover:text-indigo-800">Clear</button>
            <button
              onClick={deleteSelected}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isDeleting ? 'Deleting…' : 'Delete Selected'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Table ──────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        {filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium">No users found</p>
            <p className="text-xs mt-1">Try adjusting filters or create a new user</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={filteredAgents.length > 0 && selectedAgents.length === filteredAgents.length}
                    onChange={e => selectAll(e.target.checked)}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Organisation</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Vicidial ID</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAgents.map(agent => {
                const isEditing = editingAgent === agent._id;
                const oName = orgName(agent);
                return (
                  <tr key={agent._id} className={`transition-colors ${isEditing ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                    {/* checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedAgents.includes(agent._id)}
                        onChange={() => toggleSelect(agent._id)}
                        className="rounded"
                      />
                    </td>

                    {/* User */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="space-y-1">
                          <input
                            value={editFormData.name}
                            onChange={e => setEditFormData(p => ({ ...p, name: e.target.value }))}
                            className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            placeholder="Full name"
                          />
                          <input
                            value={editFormData.email}
                            onChange={e => setEditFormData(p => ({ ...p, email: e.target.value }))}
                            className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            placeholder="Email"
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-gray-900">{agent.name}</p>
                          <p className="text-xs text-gray-500">{agent.email}</p>
                        </div>
                      )}
                    </td>

                    {/* Org */}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${orgColor(oName)}`}>
                        {oName.length > 22 ? oName.slice(0, 22) + '…' : oName}
                      </span>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${roleColor(agent.role)}`}>
                        {agent.role === 'agent1' ? 'Agent 1' : agent.role === 'agent2' ? 'Agent 2' : agent.role}
                      </span>
                    </td>

                    {/* Vicidial ID */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          value={editFormData.vicidialAgentId}
                          onChange={e => setEditFormData(p => ({ ...p, vicidialAgentId: e.target.value }))}
                          className="w-full border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          placeholder="Vicidial ID"
                        />
                      ) : (
                        <span className="text-gray-600 font-mono text-xs">
                          {agent.vicidialAgentId || <span className="text-gray-300 italic">none</span>}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleAgentStatus(agent._id, agent.isActive)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${agent.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                      >
                        {agent.isActive
                          ? <><ToggleRight className="w-3.5 h-3.5" /> Active</>
                          : <><ToggleLeft className="w-3.5 h-3.5" /> Inactive</>
                        }
                      </button>
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(agent.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(agent._id)}
                              disabled={isUpdating}
                              className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 transition-colors"
                              title="Save"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(agent)}
                              className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteAgent(agent._id, agent.name)}
                              className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Footer count ────────────────────────────────────────────────────── */}
      {filteredAgents.length > 0 && (
        <div className="px-5 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          Showing {filteredAgents.length} of {agents.length} users
          {selectedOrg && organizations.find(o => o._id === selectedOrg) && (
            <span className="ml-1">
              in <strong>{organizations.find(o => o._id === selectedOrg)?.name}</strong>
            </span>
          )}
        </div>
      )}

      {/* ─── Create Modal ────────────────────────────────────────────────────── */}
      <CreateAgentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onAgentCreated={handleAgentCreated}
        organizations={organizations}
      />
    </div>
  );
};

export default SuperUserManagement;
