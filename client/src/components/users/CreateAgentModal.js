import React, { useState, useEffect, useMemo } from 'react';
import { X, User, Mail, Lock, Shield, Phone, Building2, CheckSquare } from 'lucide-react';
import axios from '../../utils/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { getDidAlias } from '../../utils/didUtils';

const CreateAgentModal = ({ isOpen, onClose, onAgentCreated, organizations = [] }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';
  const isReddingtonAdmin = user?.organization?.name === 'REDDINGTON GLOBAL CONSULTANCY';
  const canPickOrg = isSuperAdmin || isReddingtonAdmin;

  const [orgList, setOrgList] = useState(organizations);

  useEffect(() => {
    if (organizations && organizations.length > 0) {
      setOrgList(organizations);
    } else if (isOpen) {
      axios.get('/api/organizations')
        .then(res => setOrgList(Array.isArray(res.data?.data) ? res.data.data : []))
        .catch(err => console.error('Failed to fetch orgs in modal', err));
    }
  }, [organizations, isOpen]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'agent1',
    vicidialAgentId: '',
    organization: '',
    assignedDids: []
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // affiliate_admin does not belong to an organisation — derived from formData
  const isAffiliateRole = formData.role === 'affiliate_admin';

  // Selected organization object to derive available DIDs
  const selectedOrgId = formData.organization || user?.organization?._id || user?.organization;
  const selectedOrgObj = useMemo(() => {
    return orgList.find(o => String(o._id) === String(selectedOrgId));
  }, [orgList, selectedOrgId]);

  const availableOrgDids = useMemo(() => {
    if (!selectedOrgObj) return [];
    const dids = [
      ...(Array.isArray(selectedOrgObj.inboundDids) ? selectedOrgObj.inboundDids : []),
      ...(Array.isArray(selectedOrgObj.liveTransferDids) ? selectedOrgObj.liveTransferDids : []),
      ...(Array.isArray(selectedOrgObj.inboundCallsDids) ? selectedOrgObj.inboundCallsDids : []),
      ...(Array.isArray(selectedOrgObj.loanFlipDids) ? selectedOrgObj.loanFlipDids : []),
      selectedOrgObj.inboundCallsDid,
      selectedOrgObj.liveTransferDid,
      selectedOrgObj.loanFlipDid
    ].filter(Boolean);
    return Array.from(new Set(dids.map(d => String(d).trim()))).filter(Boolean);
  }, [selectedOrgObj]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Reset assigned DIDs if organization changes
      ...(name === 'organization' ? { assignedDids: [] } : {})
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleToggleDid = (did) => {
    setFormData(prev => {
      const exists = prev.assignedDids.includes(did);
      return {
        ...prev,
        assignedDids: exists ? prev.assignedDids.filter(d => d !== did) : [...prev.assignedDids, did]
      };
    });
    if (errors.assignedDids) {
      setErrors(prev => ({ ...prev, assignedDids: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (canPickOrg && !formData.organization && !isAffiliateRole) {
      newErrors.organization = 'Organization is required';
    }

    if (formData.role === 'sub_agent' && formData.assignedDids.length === 0) {
      newErrors.assignedDids = 'Please select at least one DID to assign to this sub-agent';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one lowercase letter, one uppercase letter, and one number';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      // affiliate_admin uses a dedicated endpoint; no org field
      const isAffiliate = formData.role === 'affiliate_admin';
      const endpoint = isAffiliate ? '/api/auth/create-affiliate-admin' : '/api/auth/create-agent';

      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        // Do NOT send role for affiliate endpoint — it is hardcoded on the backend
        ...(isAffiliate ? {} : { 
          role: formData.role, 
          vicidialAgentId: formData.vicidialAgentId.trim() || undefined,
          assignedDids: formData.role === 'sub_agent' ? formData.assignedDids : undefined
        }),
      };
      if (!isAffiliate && canPickOrg && formData.organization) {
        payload.organization = formData.organization;
      }
      const response = await axios.post(endpoint, payload);

      toast.success(response.data.message);
      onAgentCreated(response.data.data.user);
      
      // Reset form
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'agent1',
        vicidialAgentId: '',
        organization: '',
        assignedDids: []
      });
      onClose();

    } catch (error) {
      const message = error.response?.data?.message || 'Error creating agent';
      toast.error(message);
      console.error('Create agent error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 w-full max-w-md my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            {isAffiliateRole ? 'Create Affiliate Admin Account' : 'Create Agent Account'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter full name"
              />
            </div>
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter email address"
              />
            </div>
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Organization Field — SuperAdmin and Reddington admin (hidden for affiliate_admin) */}
          {canPickOrg && !isAffiliateRole && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <select
                  name="organization"
                  value={formData.organization}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.organization ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select organization...</option>
                  {orgList.map(org => (
                    <option key={org._id} value={org._id}>{org.name}</option>
                  ))}
                </select>
              </div>
              {errors.organization && <p className="text-red-500 text-xs mt-1">{errors.organization}</p>}
            </div>
          )}

          {/* Role Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isAffiliateRole ? 'Role' : 'Agent Role'}
            </label>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="agent1">Agent 1 (Lead Generation &amp; Qualification)</option>
                <option value="agent2">Agent 2 (Follow-up &amp; Conversion)</option>
                <option value="sub_agent">Sub-Agent / Vendor Agent (DID-Scoped)</option>
                {isSuperAdmin && (
                  <option value="affiliate_admin">Affiliate Admin (Campaign Dashboard)</option>
                )}
              </select>
            </div>
          </div>

          {/* Sub-Agent Assigned DIDs Field */}
          {formData.role === 'sub_agent' && (
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckSquare size={16} className="text-indigo-600" />
                <label className="text-xs font-bold text-indigo-900 uppercase tracking-wide">
                  Assign DIDs to Sub-Agent <span className="text-red-500">*</span>
                </label>
              </div>
              {availableOrgDids.length === 0 ? (
                <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                  {formData.organization || !canPickOrg
                    ? 'No DIDs configured for this organization yet. Please add inbound DIDs to the organization settings first.'
                    : 'Please select an organization above to view its available DIDs.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {availableOrgDids.map(did => {
                    const alias = getDidAlias(did, selectedOrgObj?.didAliases);
                    const isLt = (selectedOrgObj?.liveTransferDids || []).includes(did) || selectedOrgObj?.liveTransferDid === did;
                    const isIn = (selectedOrgObj?.inboundCallsDids || []).includes(did) || selectedOrgObj?.inboundCallsDid === did;
                    const isLf = (selectedOrgObj?.loanFlipDids || []).includes(did) || selectedOrgObj?.loanFlipDid === did;
                    return (
                      <label key={did} className="flex items-center gap-2.5 p-2 bg-white rounded-md border border-indigo-100 hover:bg-indigo-100/50 cursor-pointer text-xs transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.assignedDids.includes(did)}
                          onChange={() => handleToggleDid(did)}
                          className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        />
                        <div className="flex flex-col">
                          {alias && (
                            <span className="font-sans font-bold text-xs text-indigo-950 tracking-tight leading-tight">
                              {alias}
                            </span>
                          )}
                          <span className="font-mono text-gray-700 text-[11px]">{did}</span>
                        </div>
                        {isLt && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold ml-auto">Live Transfer</span>
                        )}
                        {isIn && (
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-semibold ml-auto">Inbound</span>
                        )}
                        {isLf && (
                          <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-semibold ml-auto">Loan Flip</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
              {errors.assignedDids && <p className="text-red-500 text-xs mt-1.5">{errors.assignedDids}</p>}
            </div>
          )}

          {/* Vicidial Agent ID Field — not shown for affiliate_admin */}
          {!isAffiliateRole && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vicidial Agent ID <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                name="vicidialAgentId"
                value={formData.vicidialAgentId}
                onChange={handleChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. AGENT001"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Maps this agent to a Vicidial agent for real-time call data</p>
          </div>
          )}

          {/* Password Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter password"
              />
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>

          {/* Confirm Password Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Confirm password"
              />
            </div>
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
          </div>

          {/* Submit Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : isAffiliateRole ? 'Create Affiliate Admin' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAgentModal;
