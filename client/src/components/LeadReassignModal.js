import React, { useState, useEffect } from 'react';
import { X, UserCheck, AlertCircle, Users } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from './LoadingSpinner';

const LeadReassignModal = ({ 
  isOpen, 
  onClose, 
  lead, 
  onLeadReassigned 
}) => {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingAgents, setFetchingAgents] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAgent2Users();
      // Reset form when modal opens
      setSelectedAgent('');
      setAssignmentNotes('');
    }
  }, [isOpen]);

  const fetchAgent2Users = async () => {
    setFetchingAgents(true);
    try {
      const response = await axios.get('/api/auth/agents');
      // Filter only agent2 users
      const agent2Users = response.data.data.filter(agent => 
        agent.role === 'agent2' && agent.isActive
      );
      setAgents(agent2Users);
    } catch (error) {
      const message = error.response?.data?.message || 'Error fetching agents';
      toast.error(message);
      console.error('Fetch agents error:', error);
    } finally {
      setFetchingAgents(false);
    }
  };

  const handleReassign = async () => {
    if (!selectedAgent) {
      toast.error('Please select an agent to reassign the lead to');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.put(`/api/leads/${lead._id}/reassign`, {
        assignedTo: selectedAgent,
        assignmentNotes: assignmentNotes.trim()
      });

      if (response.data.success) {
        toast.success('Lead reassigned successfully!');
        onLeadReassigned(response.data.lead);
        onClose();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Error reassigning lead';
      toast.error(message);
      console.error('Reassign lead error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <UserCheck className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Reassign Lead
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Lead Information */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h3 className="font-medium text-gray-900">Lead Information</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <div><span className="font-medium">Name:</span> {lead?.name}</div>
              <div><span className="font-medium">Lead ID:</span> {lead?.leadId || lead?._id}</div>
              <div><span className="font-medium">Current Status:</span> {lead?.status || 'New'}</div>
              {lead?.assignedTo && (
                <div><span className="font-medium">Currently Assigned To:</span> {lead.assignedTo.name || lead.assignedTo.email}</div>
              )}
            </div>
          </div>

          {/* Agent Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign to Agent 2 <span className="text-red-500">*</span>
            </label>
            
            {fetchingAgents ? (
              <div className="flex items-center justify-center p-4">
                <LoadingSpinner size="sm" />
                <span className="ml-2 text-sm text-gray-600">Loading agents...</span>
              </div>
            ) : agents.length === 0 ? (
              <div className="flex items-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
                <span className="text-sm text-yellow-700">No active Agent 2 users found</span>
              </div>
            ) : (
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select an Agent 2</option>
                {agents.map(agent => (
                  <option key={agent._id} value={agent._id}>
                    {agent.name} ({agent.email})
                    {agent.organization?.name && ` - ${agent.organization.name}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Assignment Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assignment Notes (Optional)
            </label>
            <textarea
              value={assignmentNotes}
              onChange={(e) => setAssignmentNotes(e.target.value)}
              placeholder="Add any notes about this reassignment..."
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
            <div className="text-xs text-gray-500 mt-1">
              {assignmentNotes.length}/500 characters
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleReassign}
            disabled={loading || !selectedAgent || fetchingAgents}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Reassigning...</span>
              </>
            ) : (
              <>
                <Users className="h-4 w-4" />
                <span>Reassign Lead</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeadReassignModal;
