import React, { useState, useEffect } from 'react';
import { Users, UserPlus, ToggleLeft, ToggleRight, Eye, EyeOff, Trash2, Edit3, Save, X, Phone } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from './LoadingSpinner';
import CreateAgentModal from './CreateAgentModal';
import { useAuth } from '../contexts/AuthContext';

const AgentManagement = () => {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Edit agent states
  const [editingAgent, setEditingAgent] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '', vicidialAgentId: '' });
  const [isUpdating, setIsUpdating] = useState(false);

  // Check if user can create agents (only REDDINGTON GLOBAL CONSULTANCY admins or superadmins)
  const canCreateAgents = user?.role === 'superadmin' || user?.organization?.name === 'REDDINGTON GLOBAL CONSULTANCY';

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const response = await axios.get('/api/auth/agents');
      // Fix: API returns { success, count, data: agents } structure
      setAgents(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      const message = error.response?.data?.message || 'Error fetching agents';
      toast.error(message);
      console.error('Fetch agents error:', error);
      // Set empty array on error to prevent length errors
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAgentCreated = (newAgent) => {
    setAgents(prev => [...prev, newAgent]);
    toast.success('Agent created successfully!');
  };

  const toggleAgentStatus = async (agentId, currentStatus) => {
    try {
      const response = await axios.put(`/api/auth/agents/${agentId}/status`, {
        isActive: !currentStatus
      });

      setAgents(prev => prev.map(agent =>
        agent._id === agentId
          ? { ...agent, isActive: !currentStatus }
          : agent
      ));

      toast.success(response.data.message);
    } catch (error) {
      const message = error.response?.data?.message || 'Error updating agent status';
      toast.error(message);
      console.error('Toggle agent status error:', error);
    }
  };

  // Edit agent functions
  const startEditAgent = (agent) => {
    setEditingAgent(agent._id);
    setEditFormData({
      name: agent.name,
      email: agent.email,
      vicidialAgentId: agent.vicidialAgentId || ''
    });
  };

  const cancelEditAgent = () => {
    setEditingAgent(null);
    setEditFormData({ name: '', email: '', vicidialAgentId: '' });
  };

  const saveAgentChanges = async (agentId) => {
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

      // Update local state
      setAgents(prev => prev.map(agent =>
        agent._id === agentId
          ? { ...agent, name: editFormData.name.trim(), email: editFormData.email.trim(), vicidialAgentId: editFormData.vicidialAgentId.trim() }
          : agent
      ));

      setEditingAgent(null);
      setEditFormData({ name: '', email: '', vicidialAgentId: '' });
      toast.success('Agent information updated successfully');
    } catch (error) {
      const message = error.response?.data?.message || 'Error updating agent information';
      toast.error(message);
      console.error('Update agent error:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteAgent = async (agentId, agentName) => {
    if (!window.confirm(`Are you sure you want to delete agent "${agentName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`/api/auth/agents/${agentId}`);
      
      setAgents(prev => prev.filter(agent => agent._id !== agentId));
      toast.success('Agent deleted successfully');
    } catch (error) {
      const message = error.response?.data?.message || 'Error deleting agent';
      toast.error(message);
      console.error('Delete agent error:', error);
    }
  };

  // Bulk deletion functions
  const handleSelectAgent = (agentId) => {
    setSelectedAgents(prev => 
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      // Select all agent IDs
      setSelectedAgents(agents.map(agent => agent._id));
    } else {
      // Deselect all
      setSelectedAgents([]);
    }
  };

  const deleteSelectedAgents = async () => {
    if (selectedAgents.length === 0) {
      toast.error('Please select agents to delete');
      return;
    }

    const selectedAgentNames = agents
      .filter(agent => selectedAgents.includes(agent._id))
      .map(agent => agent.name);

    const confirmMessage = `Are you sure you want to delete ${selectedAgents.length} agent(s)?\n\n${selectedAgentNames.join(', ')}\n\nThis action cannot be undone.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    try {
      // Delete agents in parallel for better performance
      const deletePromises = selectedAgents.map(agentId =>
        axios.delete(`/api/auth/agents/${agentId}`)
      );

      await Promise.all(deletePromises);

      // Remove deleted agents from the list
      setAgents(prev => prev.filter(agent => !selectedAgents.includes(agent._id)));
      setSelectedAgents([]);
      toast.success(`Successfully deleted ${selectedAgents.length} agent(s)`);
    } catch (error) {
      const message = error.response?.data?.message || 'Error deleting selected agents';
      toast.error(message);
      console.error('Bulk delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'agent1':
        return 'bg-blue-100 text-blue-800';
      case 'agent2':
        return 'bg-green-100 text-green-800';
      case 'admin':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleDescription = (role) => {
    switch (role) {
      case 'agent1':
        return 'Lead Generation & Qualification';
      case 'agent2':
        return 'Follow-up & Conversion';
      case 'admin':
        return 'Full Access';
      default:
        return 'Unknown Role';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Users className="text-blue-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Agent Management</h2>
              <p className="text-sm text-gray-600">Manage agent accounts and permissions</p>
            </div>
          </div>
          {canCreateAgents && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <UserPlus size={20} className="mr-2" />
              Create Agent
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {agents.length === 0 ? (
          <div className="text-center py-8">
            <Users className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No agents found</h3>
            <p className="text-gray-600 mb-4">
              {canCreateAgents ? "Create your first agent account to get started" : "No agent accounts available"}
            </p>
            {canCreateAgents && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Agent
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bulk Actions */}
            {selectedAgents.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-blue-900">
                      {selectedAgents.length} agent{selectedAgents.length > 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={() => setSelectedAgents([])}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Clear selection
                    </button>
                  </div>
                  <button
                    onClick={deleteSelectedAgents}
                    disabled={isDeleting}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{isDeleting ? 'Deleting...' : 'Delete Selected'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-900">
                    <input
                      type="checkbox"
                      checked={agents.length > 0 && selectedAgents.length === agents.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Agent</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Vicidial ID</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Role</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Last Login</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Created</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4">
                      <input
                        type="checkbox"
                        checked={selectedAgents.includes(agent._id)}
                        onChange={() => handleSelectAgent(agent._id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="py-4 px-4">
                      {editingAgent === agent._id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Agent name"
                          />
                          <input
                            type="email"
                            value={editFormData.email}
                            onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Agent email"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-gray-900">{agent.name}</div>
                          <div className="text-sm text-gray-600">{agent.email}</div>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {editingAgent === agent._id ? (
                        <input
                          type="text"
                          value={editFormData.vicidialAgentId}
                          onChange={(e) => setEditFormData({ ...editFormData, vicidialAgentId: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Vicidial Agent ID"
                        />
                      ) : (
                        <div className="flex items-center">
                          {agent.vicidialAgentId ? (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                              <Phone size={12} className="mr-1" />
                              {agent.vicidialAgentId}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Not mapped</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div>
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(agent.role)}`}>
                          {agent.role.toUpperCase()}
                        </span>
                        <div className="text-xs text-gray-600 mt-1">
                          {getRoleDescription(agent.role)}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center">
                        {agent.isActive ? (
                          <Eye className="text-green-500 mr-2" size={16} />
                        ) : (
                          <EyeOff className="text-red-500 mr-2" size={16} />
                        )}
                        <span className={`text-sm font-medium ${
                          agent.isActive ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {agent.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-sm text-gray-600">
                        {agent.lastLogin ? formatDate(agent.lastLogin) : 'Never'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-sm text-gray-600">
                        {formatDate(agent.createdAt)}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        {editingAgent === agent._id ? (
                          <>
                            <button
                              onClick={() => saveAgentChanges(agent._id)}
                              disabled={isUpdating}
                              className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                              title="Save Changes"
                            >
                              <Save size={20} />
                            </button>
                            <button
                              onClick={cancelEditAgent}
                              disabled={isUpdating}
                              className="p-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                              title="Cancel Edit"
                            >
                              <X size={20} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEditAgent(agent)}
                              className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit Agent"
                            >
                              <Edit3 size={20} />
                            </button>
                            <button
                              onClick={() => toggleAgentStatus(agent._id, agent.isActive)}
                              className={`p-2 rounded-lg transition-colors ${
                                agent.isActive
                                  ? 'text-red-600 hover:bg-red-50'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                              title={agent.isActive ? 'Deactivate Agent' : 'Activate Agent'}
                            >
                              {agent.isActive ? (
                                <ToggleRight size={20} />
                              ) : (
                                <ToggleLeft size={20} />
                              )}
                            </button>
                            <button
                              onClick={() => deleteAgent(agent._id, agent.name)}
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete Agent"
                            >
                              <Trash2 size={20} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {canCreateAgents && (
        <CreateAgentModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onAgentCreated={handleAgentCreated}
        />
      )}
    </div>
  );
};

export default AgentManagement;
