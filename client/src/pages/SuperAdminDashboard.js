import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { scrollToTop } from '../utils/scrollUtils';
import { 
  Shield, 
  Users, 
  UserCheck, 
  Plus,
  Trash2,
  Building2,
  BarChart3,
  FileText,
  Search,
  Calendar,
  Edit,
  Trash,
  Filter,
  Download
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import OrganizationManagement from './OrganizationManagement';
import SuperAdminUserManagement from '../components/SuperAdminUserManagement';
import Pagination from '../components/Pagination';
import { formatEasternTimeForDisplay, formatEasternTime, getEasternNow } from '../utils/dateUtils';

const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const { registerRefreshCallback, unregisterRefreshCallback } = useRefresh();
  const [admins, setAdmins] = useState([]);
  const [agents, setAgents] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Pagination state for leads
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 500,
    total: 0,
    pages: 0
  });
  
  // Lead tracking filters
  const [leadFilters, setLeadFilters] = useState({
    search: '',
    leadId: '',
    startDate: '',
    endDate: '',
    status: '',
    category: '',
    qualificationStatus: '',
    assignedTo: '',
    duplicateStatus: '',
    organization: ''
  });

  // Admin and Agent filters
  const [adminFilters, setAdminFilters] = useState({
    search: '',
    organization: '',
    status: ''
  });

  const [agentFilters, setAgentFilters] = useState({
    search: '',
    organization: '',
    status: ''
  });

  // Keep latest filters handy without recreating callbacks
  const adminFiltersRef = useRef(adminFilters);
  const agentFiltersRef = useRef(agentFilters);

  useEffect(() => {
    adminFiltersRef.current = adminFilters;
  }, [adminFilters]);

  useEffect(() => {
    agentFiltersRef.current = agentFilters;
  }, [agentFilters]);

  // Lead form data for create/edit
  const [leadFormData, setLeadFormData] = useState({
    name: '',
    email: '',
    phone: '',
    alternatePhone: '',
    debtCategory: 'unsecured',
    debtTypes: [],
    totalDebtAmount: '',
    numberOfCreditors: '',
    monthlyDebtPayment: '',
    creditScore: '',
    creditScoreRange: '',
    address: '',
    city: '',
    state: '',
    zipcode: '',
    notes: '',
    requirements: ''
  });

  const fetchAdmins = useCallback(async (filters = adminFiltersRef.current) => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.organization) params.append('organization', filters.organization);
      if (filters.status) params.append('status', filters.status);

      const response = await axios.get(`/api/auth/admins?${params.toString()}`);
      const adminsData = Array.isArray(response.data?.data) ? response.data.data : [];
      setAdmins(adminsData);
    } catch (error) {
      console.error('Error fetching admins:', error);
      toast.error('Failed to load admins');
      setAdmins([]);
    }
  }, []);

  const fetchAgents = useCallback(async (filters = agentFiltersRef.current) => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.organization) params.append('organization', filters.organization);
      if (filters.status) params.append('status', filters.status);

      const response = await axios.get(`/api/auth/agents?${params.toString()}`);
      const agentsData = Array.isArray(response.data?.data) ? response.data.data : [];
      setAgents(agentsData);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to load agents');
      setAgents([]);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const organizationsResponse = await axios.get('/api/organizations');
      const organizationsData = Array.isArray(organizationsResponse.data?.data) ? organizationsResponse.data.data : [];
      setOrganizations(organizationsData);
      
      // Fetch admins and agents with their respective filters
      await Promise.all([fetchAdmins(), fetchAgents()]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load dashboard data');
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [fetchAdmins, fetchAgents]);

  // Lead tracking functions
  const fetchLeads = useCallback(async (page = pagination.page) => {
    try {
      setLeadsLoading(true);
      const params = new URLSearchParams();
      
      // Add pagination parameters
      params.append('page', page.toString());
      params.append('limit', pagination.limit.toString());
      
      // Add filters to params
      if (leadFilters.search) params.append('search', leadFilters.search);
      if (leadFilters.leadId) params.append('leadId', leadFilters.leadId);
      if (leadFilters.startDate) params.append('startDate', leadFilters.startDate);
      if (leadFilters.endDate) params.append('endDate', leadFilters.endDate);
      if (leadFilters.status) params.append('status', leadFilters.status);
      if (leadFilters.category) params.append('category', leadFilters.category);
      if (leadFilters.qualificationStatus) params.append('qualificationStatus', leadFilters.qualificationStatus);
      if (leadFilters.assignedTo) params.append('assignedTo', leadFilters.assignedTo);
      if (leadFilters.duplicateStatus) params.append('duplicateStatus', leadFilters.duplicateStatus);
      if (leadFilters.organization) params.append('organization', leadFilters.organization);

      const response = await axios.get(`/api/leads?${params.toString()}`);
      const responseData = response.data?.data;
      const leadsData = responseData?.leads;
      const paginationData = responseData?.pagination;
      
      setLeads(leadsData || []);
      
      // Update pagination state if we have pagination data
      if (paginationData) {
        setPagination({
          page: paginationData.page,
          limit: paginationData.limit,
          total: paginationData.total,
          pages: paginationData.pages
        });
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast.error('Failed to load leads');
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  }, [
    pagination.page,
    pagination.limit,
    leadFilters.search,
    leadFilters.leadId,
    leadFilters.startDate,
    leadFilters.endDate,
    leadFilters.status,
    leadFilters.category,
    leadFilters.qualificationStatus,
    leadFilters.assignedTo,
    leadFilters.duplicateStatus,
    leadFilters.organization
  ]);

  // Handle refresh functionality
  const handleDashboardRefresh = useCallback(() => {
    // Scroll to top using utility function
    scrollToTop();
    
    // Close all modals and reset form states
    setShowLeadModal(false);
    setShowEditLeadModal(false);
    setSelectedLead(null);
    
    // Reset to overview tab
    setActiveTab('overview');
    
    // Reset pagination
    setPagination(prev => ({ ...prev, page: 1 }));
    
    // Refetch all data
    fetchData();
    if (activeTab === 'leads') {
      fetchLeads(1);
    }
    toast.success('Dashboard refreshed!');
  }, [fetchData, fetchLeads, activeTab]);

  // Register refresh callback
  useEffect(() => {
    registerRefreshCallback('superadmin', handleDashboardRefresh);
    return () => {
      unregisterRefreshCallback('superadmin');
    };
  }, [registerRefreshCallback, unregisterRefreshCallback, handleDashboardRefresh]);

  // Main effect to fetch initial data
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch admins when admin filters change
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchAdmins(adminFilters);
    }
  }, [adminFilters.search, adminFilters.organization, adminFilters.status, activeTab, fetchAdmins]);

  // Refetch agents when agent filters change
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchAgents(agentFilters);
    }
  }, [agentFilters.search, agentFilters.organization, agentFilters.status, activeTab, fetchAgents]);

  const handleDeleteAdmin = async (adminId, adminName) => {
    if (window.confirm(`Are you sure you want to delete admin "${adminName}"? This action cannot be undone.`)) {
      try {
        await axios.delete(`/api/auth/admins/${adminId}`);
        toast.success('Admin deleted successfully');
        fetchAdmins();
      } catch (error) {
        console.error('Error deleting admin:', error);
        toast.error(error.response?.data?.message || 'Failed to delete admin');
      }
    }
  };

  const handleToggleAdminStatus = async (adminId, currentStatus) => {
    try {
      await axios.put(`/api/auth/admins/${adminId}/status`, { 
        isActive: !currentStatus 
      });
      toast.success(`Admin ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchAdmins();
    } catch (error) {
      console.error('Error updating admin status:', error);
      toast.error(error.response?.data?.message || 'Failed to update admin status');
    }
  };

  const handleToggleAgentStatus = async (agentId, currentStatus) => {
    try {
      await axios.put(`/api/auth/agents/${agentId}/status`, { 
        isActive: !currentStatus 
      });
      toast.success(`Agent ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchAgents();
    } catch (error) {
      console.error('Error updating agent status:', error);
      toast.error(error.response?.data?.message || 'Failed to update agent status');
    }
  };

  const handleDeleteAgent = async (agentId, agentName) => {
    if (window.confirm(`Are you sure you want to delete agent "${agentName}"? This action cannot be undone.`)) {
      try {
        await axios.delete(`/api/auth/agents/${agentId}`);
        toast.success('Agent deleted successfully');
        fetchAgents();
      } catch (error) {
        console.error('Error deleting agent:', error);
        toast.error(error.response?.data?.message || 'Failed to delete agent');
      }
    }
  };

  // Pagination handler for leads
  const handlePageChange = async (newPage) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setPagination(prev => ({ ...prev, page: newPage }));
      await fetchLeads(newPage);
    }
  };

  // Reset pagination when filters change
  const resetPaginationAndFetchLeads = useCallback(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchLeads(1);
  }, [fetchLeads]);

  // Reset pagination when lead filters change
  useEffect(() => {
    if (activeTab === 'leads') {
      resetPaginationAndFetchLeads();
    }
  }, [
    leadFilters.search,
    leadFilters.leadId,
    leadFilters.startDate,
    leadFilters.endDate,
    leadFilters.status,
    leadFilters.category,
    leadFilters.qualificationStatus,
    leadFilters.assignedTo,
    leadFilters.duplicateStatus,
    leadFilters.organization,
    resetPaginationAndFetchLeads,
    activeTab
  ]);

  const handleCreateLead = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const cleanData = {
        name: leadFormData.name.trim()
      };

      // Add optional fields if they have values
      if (leadFormData.email) cleanData.email = leadFormData.email.trim();
      if (leadFormData.phone) {
        const cleaned = leadFormData.phone.replace(/\D/g, '');
        cleanData.phone = `+${cleaned}`;
      }
      if (leadFormData.alternatePhone) {
        const cleaned = leadFormData.alternatePhone.replace(/\D/g, '');
        cleanData.alternatePhone = `+${cleaned}`;
      }

      cleanData.debtCategory = leadFormData.debtCategory;
      cleanData.debtTypes = leadFormData.debtTypes;

      if (leadFormData.totalDebtAmount) cleanData.totalDebtAmount = parseFloat(leadFormData.totalDebtAmount);
      if (leadFormData.numberOfCreditors) cleanData.numberOfCreditors = parseInt(leadFormData.numberOfCreditors);
      if (leadFormData.monthlyDebtPayment) cleanData.monthlyDebtPayment = parseFloat(leadFormData.monthlyDebtPayment);
      if (leadFormData.creditScore) cleanData.creditScore = parseInt(leadFormData.creditScore);
      if (leadFormData.creditScoreRange) cleanData.creditScoreRange = leadFormData.creditScoreRange;

      if (leadFormData.address) cleanData.address = leadFormData.address.trim();
      if (leadFormData.city) cleanData.city = leadFormData.city.trim();
      if (leadFormData.state) cleanData.state = leadFormData.state.trim();
      if (leadFormData.zipcode) cleanData.zipcode = leadFormData.zipcode.trim();
      if (leadFormData.notes) cleanData.notes = leadFormData.notes.trim();
      if (leadFormData.requirements) cleanData.requirements = leadFormData.requirements.trim();

      // Add creator information
      cleanData.lastUpdatedBy = user?.name || 'SuperAdmin';

      await axios.post('/api/leads', cleanData);
      toast.success('Lead created successfully!');
      
      // Reset form
      setLeadFormData({
        name: '',
        email: '',
        phone: '',
        alternatePhone: '',
        debtCategory: 'unsecured',
        debtTypes: [],
        totalDebtAmount: '',
        numberOfCreditors: '',
        monthlyDebtPayment: '',
        creditScore: '',
        creditScoreRange: '',
        address: '',
        city: '',
        state: '',
        zipcode: '',
        notes: '',
        requirements: ''
      });
      
      setShowLeadModal(false);
      fetchLeads();
    } catch (error) {
      console.error('Error creating lead:', error);
      toast.error(error.response?.data?.message || 'Failed to create lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateLead = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const cleanData = {
        name: leadFormData.name.trim()
      };

      // Add optional fields if they have values
      if (leadFormData.email) cleanData.email = leadFormData.email.trim();
      if (leadFormData.phone) {
        const cleaned = leadFormData.phone.replace(/\D/g, '');
        cleanData.phone = `+${cleaned}`;
      }
      if (leadFormData.alternatePhone) {
        const cleaned = leadFormData.alternatePhone.replace(/\D/g, '');
        cleanData.alternatePhone = `+${cleaned}`;
      }

      cleanData.debtCategory = leadFormData.debtCategory;
      cleanData.debtTypes = leadFormData.debtTypes;

      if (leadFormData.totalDebtAmount) cleanData.totalDebtAmount = parseFloat(leadFormData.totalDebtAmount);
      if (leadFormData.numberOfCreditors) cleanData.numberOfCreditors = parseInt(leadFormData.numberOfCreditors);
      if (leadFormData.monthlyDebtPayment) cleanData.monthlyDebtPayment = parseFloat(leadFormData.monthlyDebtPayment);
      if (leadFormData.creditScore) cleanData.creditScore = parseInt(leadFormData.creditScore);
      if (leadFormData.creditScoreRange) cleanData.creditScoreRange = leadFormData.creditScoreRange;

      if (leadFormData.address) cleanData.address = leadFormData.address.trim();
      if (leadFormData.city) cleanData.city = leadFormData.city.trim();
      if (leadFormData.state) cleanData.state = leadFormData.state.trim();
      if (leadFormData.zipcode) cleanData.zipcode = leadFormData.zipcode.trim();
      if (leadFormData.notes) cleanData.notes = leadFormData.notes.trim();
      if (leadFormData.requirements) cleanData.requirements = leadFormData.requirements.trim();

      cleanData.lastUpdatedBy = user?.name || 'SuperAdmin';
      cleanData.lastUpdatedAt = formatEasternTime(getEasternNow());

      await axios.put(`/api/leads/${selectedLead.leadId || selectedLead._id}`, cleanData);
      toast.success('Lead updated successfully!');
      
      setShowEditLeadModal(false);
      setSelectedLead(null);
      fetchLeads();
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error(error.response?.data?.message || 'Failed to update lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLead = async (leadId, leadName) => {
    if (window.confirm(`Are you sure you want to delete lead "${leadName}"? This action cannot be undone.`)) {
      try {
        await axios.delete(`/api/leads/${leadId}`);
        toast.success('Lead deleted successfully');
        fetchLeads();
      } catch (error) {
        console.error('Error deleting lead:', error);
        toast.error(error.response?.data?.message || 'Failed to delete lead');
      }
    }
  };

  const openEditLeadModal = (lead) => {
    setSelectedLead(lead);
    setLeadFormData({
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      alternatePhone: lead.alternatePhone || '',
      debtCategory: lead.debtCategory || 'unsecured',
      debtTypes: Array.isArray(lead.debtTypes) ? lead.debtTypes : [],
      totalDebtAmount: lead.totalDebtAmount || '',
      numberOfCreditors: lead.numberOfCreditors || '',
      monthlyDebtPayment: lead.monthlyDebtPayment || '',
      creditScore: lead.creditScore || '',
      creditScoreRange: lead.creditScoreRange || '',
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      zipcode: lead.zipcode || '',
      notes: lead.notes || '',
      requirements: lead.requirements || ''
    });
    setShowEditLeadModal(true);
  };

  // Load leads when tab is selected
  useEffect(() => {
    if (activeTab === 'lead-tracking') {
      fetchLeads();
    }
  }, [activeTab, fetchLeads]);

  // Simple refresh listener for socket events
  useEffect(() => {
    const handleRefreshLeads = () => {
      if (activeTab === 'lead-tracking') {
        fetchLeads();
      }
    };

    // Listen for the custom event dispatched by SocketContext
    window.addEventListener('refreshLeads', handleRefreshLeads);

    return () => {
      window.removeEventListener('refreshLeads', handleRefreshLeads);
    };
  }, [activeTab, fetchLeads]);

  // Export leads function
  const handleExportLeads = async () => {
    try {
      const params = new URLSearchParams();
      
      // Add all current filters as query parameters
      if (leadFilters.search) params.append('search', leadFilters.search);
      if (leadFilters.leadId) params.append('leadId', leadFilters.leadId);
      if (leadFilters.startDate) params.append('startDate', leadFilters.startDate);
      if (leadFilters.endDate) params.append('endDate', leadFilters.endDate);
      if (leadFilters.status) params.append('status', leadFilters.status);
      if (leadFilters.category) params.append('category', leadFilters.category);
      if (leadFilters.qualificationStatus) params.append('qualificationStatus', leadFilters.qualificationStatus);
      if (leadFilters.assignedTo) params.append('assignedTo', leadFilters.assignedTo);
      if (leadFilters.duplicateStatus) params.append('duplicateStatus', leadFilters.duplicateStatus);
      if (leadFilters.organization) params.append('organization', leadFilters.organization);

      const response = await axios.get(`/api/leads/export?${params.toString()}`, {
        responseType: 'blob'
      });

      // Create blob and download
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      link.download = `leads-export-${dateStr}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Leads exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export leads');
    }
  };

  // Debt types mapping
  const DEBT_TYPES_BY_CATEGORY = {
    secured: [
      'Mortgage Loans',
      'Auto Loans',
      'Secured Personal Loans',
      'Home Equity Loans',
      'Title Loans'
    ],
    unsecured: [
      'Credit Cards',
      'Instalment Loans (Unsecured)',
      'Medical Bills',
      'Utility Bills',
      'Payday Loans',
      'Student Loans (private loan)',
      'Store/Charge Cards',
      'Overdraft Balances',
      'Business Loans (unsecured)',
      'Collection Accounts'
    ]
  };

  const CREDIT_SCORE_RANGES = ['300-549', '550-649', '650-699', '700-749', '750-850'];

  if (loading) {
    return <LoadingSpinner message="Loading SuperAdmin dashboard..." />;
  }

  const activeUsers = (Array.isArray(admins) ? admins.filter(admin => admin.isActive).length : 0) + 
                     (Array.isArray(agents) ? agents.filter(agent => agent.isActive).length : 0);
  const totalOrganizations = Array.isArray(organizations) ? organizations.length : 0;
  const activeOrganizations = Array.isArray(organizations) ? organizations.filter(org => org.isActive).length : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Shield className="h-8 w-8 text-purple-600 mr-3" />
            SuperAdmin Dashboard
          </h1>
          <p className="text-gray-600">Manage organizations, administrators and system users</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BarChart3 className="h-4 w-4 inline mr-2" />
            System Overview
          </button>
          <button
            onClick={() => setActiveTab('lead-tracking')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'lead-tracking'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="h-4 w-4 inline mr-2" />
            Lead Tracking
          </button>
          <button
            onClick={() => setActiveTab('organizations')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'organizations'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Building2 className="h-4 w-4 inline mr-2" />
            Organizations
          </button>
          <button
            onClick={() => setActiveTab('user-management')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'user-management'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="h-4 w-4 inline mr-2" />
            User Management
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Organizations</p>
                  <p className="text-2xl font-bold text-gray-900">{totalOrganizations}</p>
                  <p className="text-xs text-green-600">{activeOrganizations} active</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-purple-100">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Admins</p>
                  <p className="text-2xl font-bold text-gray-900">{Array.isArray(admins) ? admins.length : 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Agents</p>
                  <p className="text-2xl font-bold text-gray-900">{Array.isArray(agents) ? agents.length : 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100">
                  <UserCheck className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Users</p>
                  <p className="text-2xl font-bold text-gray-900">{activeUsers}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Admins Management */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Administrator Management</h3>
              </div>
              
              {/* Admin Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search admins by name or email..."
                    value={adminFilters.search}
                    onChange={(e) => setAdminFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <select
                    value={adminFilters.organization}
                    onChange={(e) => setAdminFilters(prev => ({ ...prev, organization: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Organizations</option>
                    {organizations.map(org => (
                      <option key={org._id} value={org._id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={adminFilters.status}
                    onChange={(e) => setAdminFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                      S.No
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Admin Info
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.isArray(admins) && admins.map((admin, index) => (
                    <tr key={admin._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{admin.name}</div>
                          <div className="text-sm text-gray-500">{admin.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          admin.role === 'restricted_admin' ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {admin.role === 'restricted_admin' ? 'Restricted Admin' : 'Admin'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          admin.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {admin.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatEasternTimeForDisplay(admin.createdAt, { includeTime: false })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-3">
                          {/* Slider Toggle */}
                          <div className="flex items-center">
                            <label className="inline-flex relative items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={admin.isActive}
                                onChange={() => handleToggleAdminStatus(admin._id, admin.isActive)}
                                className="sr-only peer"
                              />
                              <div className={`relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer ${
                                admin.isActive 
                                  ? 'peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600' 
                                  : 'after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all bg-gray-200'
                              }`}>
                              </div>
                              <span className={`ml-2 text-xs font-medium ${admin.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                                {admin.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </label>
                          </div>

                          <button
                            onClick={() => handleDeleteAdmin(admin._id, admin.name)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!Array.isArray(admins) || admins.length === 0) && (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                        No administrators found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Agents Overview */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Agents Overview</h3>
              </div>
              
              {/* Agent Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search agents by name or email..."
                    value={agentFilters.search}
                    onChange={(e) => setAgentFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <select
                    value={agentFilters.organization}
                    onChange={(e) => setAgentFilters(prev => ({ ...prev, organization: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Organizations</option>
                    {organizations.map(org => (
                      <option key={org._id} value={org._id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={agentFilters.status}
                    onChange={(e) => setAgentFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                      S.No
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agent Info
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.isArray(agents) && agents.map((agent, index) => (
                    <tr key={agent._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                          <div className="text-sm text-gray-500">{agent.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          agent.role === 'agent1' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {agent.role === 'agent1' ? 'Agent 1' : 'Agent 2'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          agent.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {agent.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(agent.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-3">
                          {/* Slider Toggle */}
                          <div className="flex items-center">
                            <label className="inline-flex relative items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={agent.isActive}
                                onChange={() => handleToggleAgentStatus(agent._id, agent.isActive)}
                                className="sr-only peer"
                              />
                              <div className={`relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer ${
                                agent.isActive 
                                  ? 'peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600' 
                                  : 'after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all bg-gray-200'
                              }`}>
                              </div>
                              <span className={`ml-2 text-xs font-medium ${agent.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                                {agent.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </label>
                          </div>

                          <button
                            onClick={() => handleDeleteAgent(agent._id, agent.name)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!Array.isArray(agents) || agents.length === 0) && (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                        No agents found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Organizations Tab */}
      {activeTab === 'organizations' && (
        <OrganizationManagement />
      )}

      {/* User Management Tab */}
      {activeTab === 'user-management' && (
        <SuperAdminUserManagement />
      )}

      {/* Lead Tracking Tab Content */}
      {activeTab === 'lead-tracking' && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center space-x-2">
                <FileText className="w-6 h-6 text-indigo-600" />
                <h2 className="text-xl font-semibold text-gray-900">Lead Tracking</h2>
              </div>
              <button
                onClick={() => setShowLeadModal(true)}
                className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create Lead</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          
          {/* Duplicate Status Filter Buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setLeadFilters({...leadFilters, duplicateStatus: ''})}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                leadFilters.duplicateStatus === '' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              All Leads
            </button>
            <button
              onClick={() => setLeadFilters({...leadFilters, duplicateStatus: 'duplicates'})}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                leadFilters.duplicateStatus === 'duplicates' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              🔄 Duplicate Leads
            </button>
            <button
              onClick={() => setLeadFilters({...leadFilters, duplicateStatus: 'non-duplicates'})}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                leadFilters.duplicateStatus === 'non-duplicates' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              ✅ Unique Leads
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search leads..."
                value={leadFilters.search}
                onChange={(e) => setLeadFilters({...leadFilters, search: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </div>

            {/* Lead ID Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Lead ID..."
                value={leadFilters.leadId}
                onChange={(e) => setLeadFilters({...leadFilters, leadId: e.target.value})}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </div>

            {/* Date Range */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="date"
                placeholder="Start Date"
                value={leadFilters.startDate}
                onChange={(e) => setLeadFilters({...leadFilters, startDate: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </div>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="date"
                placeholder="End Date"
                value={leadFilters.endDate}
                onChange={(e) => setLeadFilters({...leadFilters, endDate: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={leadFilters.status}
                onChange={(e) => setLeadFilters({...leadFilters, status: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              >
                <option value="">All Status</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="converted">Converted</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* Qualification Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={leadFilters.qualificationStatus}
                onChange={(e) => setLeadFilters({...leadFilters, qualificationStatus: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              >
                <option value="">All Qualification</option>
                <option value="qualified">Qualified</option>
                <option value="not-qualified">Not - Qualified</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            {/* Organization Filter */}
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={leadFilters.organization}
                onChange={(e) => setLeadFilters({...leadFilters, organization: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              >
                <option value="">All Organizations</option>
                {organizations.map(org => (
                  <option key={org._id} value={org._id}>{org.name}</option>
                ))}
              </select>
            </div>

            {/* Clear Filters and Export */}
            <div className="flex space-x-2">
              <button
                onClick={() => setLeadFilters({
                  search: '',
                  leadId: '',
                  startDate: '',
                  endDate: '',
                  status: '',
                  category: '',
                  qualificationStatus: '',
                  assignedTo: '',
                  duplicateStatus: '',
                  organization: ''
                })}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Clear Filters
              </button>
              
              <button
                onClick={handleExportLeads}
                className="px-4 py-2 bg-green-600 text-white border border-green-600 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
              >
                <Download size={16} />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Leads Table */}
          <div className="overflow-x-auto">
            {leadsLoading ? (
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner />
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead Info</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Debt Details</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duplicate Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                        No leads found
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => (
                      <tr key={lead._id || lead.leadId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{lead.name}</div>
                            <div className="text-sm text-gray-500">ID: {lead.leadId}</div>
                            {lead.assignedAgent && (
                              <div className="text-xs text-indigo-600">Agent: {lead.assignedAgent}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {lead.email && <div>{lead.email}</div>}
                            {lead.phone && <div>{lead.phone}</div>}
                            {lead.city && lead.state && (
                              <div className="text-xs text-gray-500">{lead.city}, {lead.state}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {lead.organization?.name || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            <div>{lead.debtCategory || 'N/A'}</div>
                            {lead.totalDebtAmount && (
                              <div className="text-xs text-gray-600">
                                ${Number(lead.totalDebtAmount).toLocaleString()}
                              </div>
                            )}
                            {lead.creditScoreRange && (
                              <div className="text-xs text-gray-500">
                                Credit: {lead.creditScoreRange}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            lead.status === 'new' ? 'bg-blue-100 text-blue-800' :
                            lead.status === 'contacted' ? 'bg-yellow-100 text-yellow-800' :
                            lead.status === 'qualified' ? 'bg-purple-100 text-purple-800' :
                            lead.status === 'converted' ? 'bg-green-100 text-green-800' :
                            lead.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {lead.status || 'new'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {lead.isDuplicate ? (
                            <div>
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                🔄 Duplicate
                              </span>
                              {lead.duplicateReason && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Phone Match
                                </div>
                              )}
                              {lead.duplicateOf && (
                                <div className="text-xs text-blue-600 mt-1">
                                  Original: {lead.duplicateOf.leadId || lead.duplicateOf}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              ✅ Unique
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{formatEasternTimeForDisplay(lead.createdAt, { includeTime: false })}</div>
                          <div className="text-xs text-gray-400">
                            {formatEasternTimeForDisplay(lead.createdAt, { includeTime: true, timeOnly: true })}
                          </div>
                          {lead.lastUpdatedBy && (
                            <div className="text-xs text-gray-400 mt-1">
                              Updated by: {lead.lastUpdatedBy}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openEditLeadModal(lead)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteLead(lead.leadId || lead._id, lead.name)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          
          {/* Pagination for leads */}
          {pagination.total > 0 && (
            <div className="mt-6 px-6 pb-6">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.pages}
                totalItems={pagination.total}
                itemsPerPage={pagination.limit}
                onPageChange={handlePageChange}
                className="border-t border-gray-200 pt-4"
              />
            </div>
          )}
        </div>
      )}

      {/* Create Lead Modal */}
      {showLeadModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div 
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setShowLeadModal(false)}
              ></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <form onSubmit={handleCreateLead}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Create New Lead</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Information */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900 border-b pb-2">Personal Information</h4>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Full Name *</label>
                        <input
                          type="text"
                          required
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.name}
                          onChange={(e) => setLeadFormData({...leadFormData, name: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                          type="email"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.email}
                          onChange={(e) => setLeadFormData({...leadFormData, email: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Phone</label>
                        <input
                          type="tel"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.phone}
                          onChange={(e) => setLeadFormData({...leadFormData, phone: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Alternate Phone</label>
                        <input
                          type="tel"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.alternatePhone}
                          onChange={(e) => setLeadFormData({...leadFormData, alternatePhone: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <textarea
                          rows={3}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.address}
                          onChange={(e) => setLeadFormData({...leadFormData, address: e.target.value})}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">City</label>
                          <input
                            type="text"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            value={leadFormData.city}
                            onChange={(e) => setLeadFormData({...leadFormData, city: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">State</label>
                          <input
                            type="text"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            value={leadFormData.state}
                            onChange={(e) => setLeadFormData({...leadFormData, state: e.target.value})}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
                        <input
                          type="text"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.zipcode}
                          onChange={(e) => setLeadFormData({...leadFormData, zipcode: e.target.value})}
                        />
                      </div>
                    </div>

                    {/* Debt Information */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900 border-b pb-2">Debt Information</h4>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Debt Category</label>
                        <select
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.debtCategory}
                          onChange={(e) => setLeadFormData({...leadFormData, debtCategory: e.target.value, debtTypes: []})}
                        >
                          <option value="unsecured">Unsecured</option>
                          <option value="secured">Secured</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Debt Types</label>
                        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3">
                          {DEBT_TYPES_BY_CATEGORY[leadFormData.debtCategory].map((type) => (
                            <label key={type} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={leadFormData.debtTypes.includes(type)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setLeadFormData({
                                      ...leadFormData,
                                      debtTypes: [...leadFormData.debtTypes, type]
                                    });
                                  } else {
                                    setLeadFormData({
                                      ...leadFormData,
                                      debtTypes: leadFormData.debtTypes.filter(t => t !== type)
                                    });
                                  }
                                }}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              />
                              <span className="ml-2 text-sm text-gray-700">{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Total Debt Amount ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.totalDebtAmount}
                          onChange={(e) => setLeadFormData({...leadFormData, totalDebtAmount: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Number of Creditors</label>
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.numberOfCreditors}
                          onChange={(e) => setLeadFormData({...leadFormData, numberOfCreditors: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Monthly Debt Payment ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.monthlyDebtPayment}
                          onChange={(e) => setLeadFormData({...leadFormData, monthlyDebtPayment: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Credit Score Range</label>
                        <select
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.creditScoreRange}
                          onChange={(e) => setLeadFormData({...leadFormData, creditScoreRange: e.target.value})}
                        >
                          <option value="">Select Credit Score Range</option>
                          {CREDIT_SCORE_RANGES.map((range) => (
                            <option key={range} value={range}>{range}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                        <textarea
                          rows={3}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.notes}
                          onChange={(e) => setLeadFormData({...leadFormData, notes: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Creating...' : 'Create Lead'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => setShowLeadModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Lead Modal */}
      {showEditLeadModal && selectedLead && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div 
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setShowEditLeadModal(false)}
              ></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <form onSubmit={handleUpdateLead}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Edit Lead - {selectedLead.name}</h3>
                    <p className="text-sm text-gray-500">Lead ID: {selectedLead.leadId}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Information */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900 border-b pb-2">Personal Information</h4>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Full Name *</label>
                        <input
                          type="text"
                          required
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.name}
                          onChange={(e) => setLeadFormData({...leadFormData, name: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                          type="email"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.email}
                          onChange={(e) => setLeadFormData({...leadFormData, email: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Phone</label>
                        <input
                          type="tel"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.phone}
                          onChange={(e) => setLeadFormData({...leadFormData, phone: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Alternate Phone</label>
                        <input
                          type="tel"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.alternatePhone}
                          onChange={(e) => setLeadFormData({...leadFormData, alternatePhone: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <textarea
                          rows={3}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.address}
                          onChange={(e) => setLeadFormData({...leadFormData, address: e.target.value})}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">City</label>
                          <input
                            type="text"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            value={leadFormData.city}
                            onChange={(e) => setLeadFormData({...leadFormData, city: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">State</label>
                          <input
                            type="text"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            value={leadFormData.state}
                            onChange={(e) => setLeadFormData({...leadFormData, state: e.target.value})}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
                        <input
                          type="text"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.zipcode}
                          onChange={(e) => setLeadFormData({...leadFormData, zipcode: e.target.value})}
                        />
                      </div>
                    </div>

                    {/* Debt Information */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900 border-b pb-2">Debt Information</h4>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Debt Category</label>
                        <select
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.debtCategory}
                          onChange={(e) => setLeadFormData({...leadFormData, debtCategory: e.target.value, debtTypes: []})}
                        >
                          <option value="unsecured">Unsecured</option>
                          <option value="secured">Secured</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Debt Types</label>
                        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3">
                          {DEBT_TYPES_BY_CATEGORY[leadFormData.debtCategory].map((type) => (
                            <label key={type} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={leadFormData.debtTypes.includes(type)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setLeadFormData({
                                      ...leadFormData,
                                      debtTypes: [...leadFormData.debtTypes, type]
                                    });
                                  } else {
                                    setLeadFormData({
                                      ...leadFormData,
                                      debtTypes: leadFormData.debtTypes.filter(t => t !== type)
                                    });
                                  }
                                }}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              />
                              <span className="ml-2 text-sm text-gray-700">{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Total Debt Amount ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.totalDebtAmount}
                          onChange={(e) => setLeadFormData({...leadFormData, totalDebtAmount: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Number of Creditors</label>
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.numberOfCreditors}
                          onChange={(e) => setLeadFormData({...leadFormData, numberOfCreditors: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Monthly Debt Payment ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.monthlyDebtPayment}
                          onChange={(e) => setLeadFormData({...leadFormData, monthlyDebtPayment: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Credit Score Range</label>
                        <select
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.creditScoreRange}
                          onChange={(e) => setLeadFormData({...leadFormData, creditScoreRange: e.target.value})}
                        >
                          <option value="">Select Credit Score Range</option>
                          {CREDIT_SCORE_RANGES.map((range) => (
                            <option key={range} value={range}>{range}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                        <textarea
                          rows={3}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.notes}
                          onChange={(e) => setLeadFormData({...leadFormData, notes: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Updating...' : 'Update Lead'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => {
                      setShowEditLeadModal(false);
                      setSelectedLead(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
