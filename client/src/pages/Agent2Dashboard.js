import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useRefresh } from '../contexts/RefreshContext';
import { scrollToTop } from '../utils/scrollUtils';
import { 
  Plus,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  BarChart3,
  TrendingUp
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { isGtiOrganization } from '../config/constants';
import { 
  formatEasternTimeForDisplay, 
  getEasternNow, 
  getEasternStartOfDay, 
  getEasternEndOfDay,
  formatDateAsDDMMYYYY,
  isValidDDMMYYYY,
  parseDDMMYYYYToISO
} from '../utils/dateUtils';

// Unified Lead Progress Status options for Agent 2
const agent2LeadProgressOptions = [
  "SALE",
  "Callback Needed",
  "Existing Client",
  "Unacceptable Creditors",
  "Not Serviceable State",
  "Sale Long Play",
  "Request for Loan",
  "DO NOT CALL - Litigator",
  "DO NOT CALL",
  "Hang-up",
  "Not Interested",
  "No Answer",
  "AIP Client",
  "Not Qualified",
  "Affordability",
  "Others"
];

// Debt types by category mapping (same as Agent1)
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

// Credit score ranges
const CREDIT_SCORE_RANGES = [
  '300-549',
  '550-649', 
  '650-699',
  '700-749',
  '750-850'
];

const Agent2Dashboard = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { registerRefreshCallback, unregisterRefreshCallback } = useRefresh();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [todayAdminStats, setTodayAdminStats] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);  // New lead creation form
  const [updating, setUpdating] = useState(false);
  const [submitting, setSubmitting] = useState(false);  // For lead creation
  
  // Persistent leads state
  const [pendingQualificationLeads, setPendingQualificationLeads] = useState([]);
  const [callbackNeededLeads, setCallbackNeededLeads] = useState([]);
  const [persistentLeadsLoading, setPersistentLeadsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('today'); // 'today', 'pending-qualification', 'callback-needed'

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0
  });

  // Form data for comprehensive lead editing
  const [editFormData, setEditFormData] = useState({
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

  // Form data for creating new leads (same structure as Agent 1)
  const [createFormData, setCreateFormData] = useState({
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
    notes: ''
  });

  // Form errors for validation
  const [formErrors, setFormErrors] = useState({
    phone: '',
    alternatePhone: '',
    email: ''
  });

  const getLeadOrganizationName = (lead) => {
    if (!lead) return '';
    if (lead.organization && typeof lead.organization === 'object') {
      return lead.organization.name || '';
    }
    if (typeof lead.organization === 'string') {
      return lead.organization;
    }
    if (lead.organizationName) {
      return lead.organizationName;
    }
    return '';
  };

  const isLeadGti = (lead) => isGtiOrganization(getLeadOrganizationName(lead));

  const autoFormatDraftDateInput = (value = '') => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const handleDraftDateChange = (value) => {
    setDraftDateDirty(true);
    const formatted = autoFormatDraftDateInput(value || '');
    setUpdateData((prev) => ({ ...prev, draftDate: formatted }));

    if (!formatted) {
      setDraftDateError('');
      return;
    }

    if (formatted.length === 10) {
      setDraftDateError(isValidDDMMYYYY(formatted) ? '' : 'Draft date must be a valid dd/mm/yyyy value');
    } else {
      setDraftDateError('');
    }
  };

  const handleRequestedLoanAmountChange = (value = '') => {
    const digitsOnly = value.replace(/[^0-9]/g, '');
    setUpdateData((prev) => ({
      ...prev,
      requestedLoanAmount: digitsOnly
    }));
  };

  // Utility functions to mask sensitive data
  const maskEmail = (email) => {
    if (!email) return '—';
    const [username, domain] = email.split('@');
    if (username.length <= 2) return `${username}***@${domain}`;
    return `${username.substring(0, 2)}***@${domain}`;
  };

  const maskPhone = (phone) => {
    if (!phone) return '—';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length <= 4) return '***-****';
    return `***-***-${cleaned.slice(-4)}`;
  };

  const maskAmount = (amount) => {
    if (!amount) return '—';
    const amountStr = amount.toString();
    if (amountStr.length <= 3) return '$***';
    return `$${amountStr.substring(0, 1)}***`;
  };

  
  const [filters, setFilters] = useState({
    status: '',
    category: '',
    search: '',
    duplicateStatus: '',
    progressStatus: ''
  });



  const [updateData, setUpdateData] = useState({
    leadProgressStatus: '',
    followUpDate: '',
    followUpTime: '',
    followUpNotes: '',
    conversionValue: '',
    qualificationStatus: '',
    draftDate: '',
    requestedLoanAmount: '',
    clientId: ''
  });

  const [draftDateError, setDraftDateError] = useState('');
  const [draftDateDirty, setDraftDateDirty] = useState(false);

  // State for handling "Others" custom disposition
  const [customDisposition, setCustomDisposition] = useState('');
  const [showCustomDisposition, setShowCustomDisposition] = useState(false);

  const fetchTodayAdminStats = useCallback(async () => {
    try {
      const response = await axios.get('/api/leads/today-stats');
      if (response.data?.success) {
        setTodayAdminStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching today admin stats:', error);
    }
  }, []);

  // Fetch today stats on mount and on interval for admin/superadmin
  useEffect(() => {
    if (user.role === 'admin' || user.role === 'superadmin') {
      fetchTodayAdminStats();
      const interval = setInterval(fetchTodayAdminStats, 60000);
      return () => clearInterval(interval);
    }
  }, [fetchTodayAdminStats, user.role]);

  const fetchLeads = useCallback(async (page = 1) => {
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', pagination.limit.toString());
      
      if (filters.status) params.append('status', filters.status);
      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);
      if (filters.duplicateStatus) params.append('duplicateStatus', filters.duplicateStatus);
      if (filters.qualificationStatus) params.append('qualificationStatus', filters.qualificationStatus);
      if (filters.progressStatus) params.append('progressStatus', filters.progressStatus);

      // Agent2 always shows today's leads only - no date filter parameters sent to server

      const response = await axios.get(`/api/leads?${params.toString()}`);
      const responseData = response.data?.data;
      const leadsData = responseData?.leads;
      const paginationData = responseData?.pagination;
      
      setLeads(Array.isArray(leadsData) ? leadsData : []);
      
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
      toast.error('Failed to fetch leads');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, filters]);

  // useEffect for fetching leads and setting up socket listeners
  useEffect(() => {
    fetchLeads(pagination.page);
    
    // Listen for real-time updates
    const handleRefresh = () => fetchLeads(pagination.page);
    window.addEventListener('refreshLeads', handleRefresh);

    // Socket.IO event listeners with debounce — prevents full reload on every event
    if (socket) {
      const socketDebounce = { timeout: null };

      const debouncedFetch = () => {
        clearTimeout(socketDebounce.timeout);
        socketDebounce.timeout = setTimeout(() => {
          fetchLeads(pagination.page);
          if (user.role === 'admin' || user.role === 'superadmin') {
            fetchTodayAdminStats();
          }
        }, 800);
      };

      const handleLeadUpdated = (data) => {
        console.log('Lead updated via socket in Agent2:', data);
        debouncedFetch();
      };

      const handleLeadCreated = (data) => {
        console.log('New lead created via socket in Agent2:', data);
        debouncedFetch();
      };

      socket.on('leadUpdated', handleLeadUpdated);
      socket.on('leadCreated', handleLeadCreated);

      // Cleanup socket listeners and pending debounce
      return () => {
        clearTimeout(socketDebounce.timeout);
        window.removeEventListener('refreshLeads', handleRefresh);
        socket.off('leadUpdated', handleLeadUpdated);
        socket.off('leadCreated', handleLeadCreated);
      };
    }
    
    return () => {
      window.removeEventListener('refreshLeads', handleRefresh);
    };
  }, [fetchLeads, pagination.page, socket, fetchTodayAdminStats, user.role]);

  // Fetch persistent leads for Agent2 dashboard
  const fetchPersistentLeads = useCallback(async () => {
    try {
      console.log('Fetching persistent leads...');
      setPersistentLeadsLoading(true);
      
      // Fetch leads assigned to this Agent2 user
      const response = await axios.get('/api/leads/assigned-to-me');
      console.log('Persistent leads response:', response.data);
      const leads = response.data?.data?.leads || [];
      
      // Filter leads by status - these persist regardless of creation date
      const pendingQualification = leads.filter(lead => 
        lead.qualificationStatus === 'pending'
      );
      
      const callbackNeeded = leads.filter(lead => 
        lead.leadProgressStatus === 'Callback Needed'
      );
      
      console.log('Filtered leads:', { pendingQualification: pendingQualification.length, callbackNeeded: callbackNeeded.length });
      
      setPendingQualificationLeads(pendingQualification);
      setCallbackNeededLeads(callbackNeeded);
    } catch (error) {
      console.error('Error fetching persistent leads:', error);
      toast.error('Failed to fetch persistent leads');
    } finally {
      setPersistentLeadsLoading(false);
    }
  }, []);

  // Remove unused functions that were replaced by standard action buttons
  // handleUpdateQualificationStatus and handleUpdateProgressStatus no longer needed

  // Pagination handler
  const handlePageChange = async (newPage) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setPagination(prev => ({ ...prev, page: newPage }));
      await fetchLeads(newPage);
    }
  };

  // Handle refresh functionality
  const handleDashboardRefresh = useCallback(() => {
    // Scroll to top using utility function
    scrollToTop();
    
    // Close all modals and reset form states
    setShowUpdateModal(false);
    setShowViewModal(false);
    setShowEditModal(false);
    setShowCreateForm(false);
    setSelectedLead(null);
    
    // Reset filters and pagination
    setFilters({
      status: 'all',
      qualification: 'all',
      search: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
    
    // Refetch leads
    fetchLeads(1);
    // Only fetch persistent leads for Agent2 users
    if (user.role === 'agent2') {
      fetchPersistentLeads();
    }
    toast.success('Dashboard refreshed!');
  }, [fetchLeads, fetchPersistentLeads, user.role]);

  // Register refresh callback
  useEffect(() => {
    registerRefreshCallback('agent2', handleDashboardRefresh);
    return () => {
      unregisterRefreshCallback('agent2');
    };
  }, [registerRefreshCallback, unregisterRefreshCallback, handleDashboardRefresh]);

  // Fetch persistent leads on component mount - Only for Agent2
  useEffect(() => {
    if (user.role === 'agent2') {
      fetchPersistentLeads();
    }
  }, [fetchPersistentLeads, user.role]); // Add fetchPersistentLeads to dependency array

  // Reset pagination when filters change
  const resetPaginationAndFetch = useCallback(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchLeads(1);
  }, [fetchLeads]);

  // Debounced filter watcher — waits 400ms after last filter change before fetching
  // Prevents an API call on every keystroke in the search box
  useEffect(() => {
    const debounce = setTimeout(() => {
      resetPaginationAndFetch();
    }, 400);
    return () => clearTimeout(debounce);
  }, [filters, resetPaginationAndFetch]);

  const handleUpdateLead = async (e) => {
    e.preventDefault();
    setUpdating(true);
    const isSelectedLeadGti = isLeadGti(selectedLead);

    try {
      console.log('Form submission - updateData:', updateData);
      console.log('Form submission - customDisposition:', customDisposition);
      console.log('Form submission - showCustomDisposition:', showCustomDisposition);
      
      // Clean the update data to remove empty strings
      const cleanUpdateData = {};
      
      if (updateData.leadProgressStatus && updateData.leadProgressStatus !== '') {
        console.log('Processing leadProgressStatus:', updateData.leadProgressStatus);
        
        // Handle "Others" option with custom text
        if (updateData.leadProgressStatus === 'Others') {
          console.log('Others selected, customDisposition value:', `"${customDisposition}"`);
          console.log('customDisposition length:', customDisposition?.length);
          console.log('customDisposition trimmed:', `"${customDisposition?.trim()}"`);
          
          if (!customDisposition || customDisposition.trim() === '') {
            console.log('Validation failed: Custom disposition is empty');
            toast.error('Please enter a custom disposition when selecting "Others"');
            setUpdating(false);
            return;
          }
          cleanUpdateData.leadProgressStatus = customDisposition.trim();
          console.log('Using custom disposition:', customDisposition.trim());
        } else {
          cleanUpdateData.leadProgressStatus = updateData.leadProgressStatus;
          console.log('Using standard disposition:', updateData.leadProgressStatus);
        }
        // Add metadata for admin tracking
        cleanUpdateData.agent2LastAction = updateData.leadProgressStatus === 'Others' ? customDisposition.trim() : updateData.leadProgressStatus;

        if (updateData.leadProgressStatus === 'Request for Loan') {
          const rawAmount = (updateData.requestedLoanAmount || '').trim();
          if (!rawAmount) {
            toast.error('Requested loan amount is required for this status');
            setUpdating(false);
            return;
          }

          const parsedAmount = parseInt(rawAmount, 10);
          if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
            toast.error('Requested loan amount must be a positive whole number');
            setUpdating(false);
            return;
          }

          cleanUpdateData.requestedLoanAmount = parsedAmount;
        } else if (selectedLead && (selectedLead.requestedLoanAmount || updateData.requestedLoanAmount)) {
          cleanUpdateData.requestedLoanAmount = null;
        }
      }

      // Add qualification status - independent from leadProgressStatus
      if (updateData.qualificationStatus && updateData.qualificationStatus !== '') {
        cleanUpdateData.qualificationStatus = updateData.qualificationStatus;
      }
      
      // Only add optional fields if they have values
      if (updateData.followUpDate && updateData.followUpDate !== '') {
        cleanUpdateData.followUpDate = updateData.followUpDate;
      }
      if (updateData.followUpTime && updateData.followUpTime !== '') {
        cleanUpdateData.followUpTime = updateData.followUpTime;
      }
      if (updateData.followUpNotes && updateData.followUpNotes !== '') {
        cleanUpdateData.followUpNotes = updateData.followUpNotes;
      }
      if (updateData.conversionValue && updateData.conversionValue !== '') {
        cleanUpdateData.conversionValue = parseFloat(updateData.conversionValue);
      }
      if (updateData.clientId && updateData.clientId.trim() !== '') {
        cleanUpdateData.clientId = updateData.clientId.trim();
      }

      if (isSelectedLeadGti && draftDateDirty) {
        const trimmedDraft = (updateData.draftDate || '').trim();
        if (!trimmedDraft) {
          cleanUpdateData.draftDate = null;
          setDraftDateError('');
        } else if (!isValidDDMMYYYY(trimmedDraft)) {
          setDraftDateError('Draft date must be a valid dd/mm/yyyy value');
          toast.error('Draft date must follow dd/mm/yyyy format');
          setUpdating(false);
          return;
        } else {
          cleanUpdateData.draftDate = trimmedDraft;
          setDraftDateError('');
        }
      }
      
      console.log('Update form data:', updateData);
      console.log('Sending update request with cleaned data:', cleanUpdateData);
      console.log('Selected lead ID:', selectedLead.leadId);
      console.log('Selected lead _id:', selectedLead._id);
      
      // Check if we have any data to update
      if (Object.keys(cleanUpdateData).length === 0) {
        toast.error('Please select at least one field to update');
        return;
      }

      if (!cleanUpdateData.lastUpdatedBy) {
        cleanUpdateData.lastUpdatedBy = user?.name || 'Agent2';
      }
      if (!cleanUpdateData.lastUpdatedAt) {
        cleanUpdateData.lastUpdatedAt = getEasternNow().toISOString();
      }
      
      // Use MongoDB _id instead of leadId for consistency with backend
      const leadIdToUse = selectedLead._id || selectedLead.leadId;
      console.log('Using lead ID for API call:', leadIdToUse);
      
      const response = await axios.put(`/api/leads/${leadIdToUse}`, cleanUpdateData);
      console.log('Update response:', response.data);
      
      toast.success('Lead updated successfully!');
      
      // Refresh leads data first
      await fetchLeads(pagination.page);
      
      // Update the selected lead with new data to show immediately in view modal
      const updatedLead = { ...selectedLead, ...cleanUpdateData };
      if (cleanUpdateData.draftDate !== undefined) {
        updatedLead.draftDate = cleanUpdateData.draftDate ? parseDDMMYYYYToISO(cleanUpdateData.draftDate) : null;
      }
      setSelectedLead(updatedLead);
      
      // Close modal after a short delay to ensure data is refreshed
      setTimeout(() => {
        closeUpdateModal();
        setUpdateData({
          leadProgressStatus: '',
          followUpDate: '',
          followUpTime: '',
          followUpNotes: '',
          conversionValue: '',
          qualificationStatus: '',
          draftDate: '',
          requestedLoanAmount: '',
          clientId: ''
        });
      }, 500);
    } catch (error) {
      console.error('Error updating lead:', error);
      console.error('Error response:', error.response);
      toast.error(error.response?.data?.message || 'Failed to update lead');
    } finally {
      setUpdating(false);
    }
  };

  // Phone number validation function
  const validatePhone = (phone, fieldName) => {
    if (!phone || phone.trim() === '') {
      return ''; // Empty is valid
    }

    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length !== 11 || !cleaned.startsWith('1')) {
      return `${fieldName} must be in format +1 followed by 10 digits`;
    }

    return '';
  };

  // Email validation function
  const validateEmail = (email) => {
    if (!email || email.trim() === '') {
      return '';
    }

    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }

    return '';
  };

  // Open comprehensive edit modal
  const openEditModal = (lead) => {
    setSelectedLead(lead);
    
    // Populate form with existing lead data
    setEditFormData({
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
      requirements: lead.requirements || '',
      clientId: lead.clientId || ''
    });

    // Clear any existing errors
    setFormErrors({
      phone: '',
      alternatePhone: '',
      email: ''
    });

    setShowEditModal(true);
  };

  // Handle comprehensive lead update
  const handleComprehensiveEdit = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    const errors = {};
    
    if (!editFormData.name.trim()) {
      toast.error('Lead name is required');
      return;
    }

    // Validate phone numbers
    if (editFormData.phone) {
      const phoneError = validatePhone(editFormData.phone, 'Phone');
      if (phoneError) {
        errors.phone = phoneError;
      }
    }

    if (editFormData.alternatePhone) {
      const altPhoneError = validatePhone(editFormData.alternatePhone, 'Alternate phone');
      if (altPhoneError) {
        errors.alternatePhone = altPhoneError;
      }
    }

    // Validate email
    if (editFormData.email) {
      const emailError = validateEmail(editFormData.email);
      if (emailError) {
        errors.email = emailError;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setUpdating(true);

    try {
      // Prepare clean data
      const cleanUpdateData = {
        name: editFormData.name.trim()
      };

      // Add optional fields if they have values
      if (editFormData.email && editFormData.email.trim()) {
        cleanUpdateData.email = editFormData.email.trim();
      }
      
      if (editFormData.phone && editFormData.phone.trim()) {
        // Format phone number
        const cleaned = editFormData.phone.replace(/\D/g, '');
        cleanUpdateData.phone = `+${cleaned}`;
      }
      
      if (editFormData.alternatePhone && editFormData.alternatePhone.trim()) {
        // Format alternate phone number
        const cleaned = editFormData.alternatePhone.replace(/\D/g, '');
        cleanUpdateData.alternatePhone = `+${cleaned}`;
      }

      // Add debt information
      cleanUpdateData.debtCategory = editFormData.debtCategory;
      cleanUpdateData.debtTypes = editFormData.debtTypes;

      if (editFormData.totalDebtAmount && !isNaN(editFormData.totalDebtAmount)) {
        cleanUpdateData.totalDebtAmount = parseFloat(editFormData.totalDebtAmount);
      }

      if (editFormData.numberOfCreditors && !isNaN(editFormData.numberOfCreditors)) {
        cleanUpdateData.numberOfCreditors = parseInt(editFormData.numberOfCreditors, 10);
      }

      if (editFormData.monthlyDebtPayment && !isNaN(editFormData.monthlyDebtPayment)) {
        cleanUpdateData.monthlyDebtPayment = parseFloat(editFormData.monthlyDebtPayment);
      }

      if (editFormData.creditScore && !isNaN(editFormData.creditScore)) {
        cleanUpdateData.creditScore = parseInt(editFormData.creditScore, 10);
      }

      if (editFormData.creditScoreRange) {
        cleanUpdateData.creditScoreRange = editFormData.creditScoreRange;
      }

      // Add address information
      if (editFormData.address && editFormData.address.trim()) {
        cleanUpdateData.address = editFormData.address.trim();
      }
      if (editFormData.city && editFormData.city.trim()) {
        cleanUpdateData.city = editFormData.city.trim();
      }
      if (editFormData.state && editFormData.state.trim()) {
        cleanUpdateData.state = editFormData.state.trim();
      }
      if (editFormData.zipcode && editFormData.zipcode.trim()) {
        cleanUpdateData.zipcode = editFormData.zipcode.trim();
      }

      // Add notes
      if (editFormData.notes && editFormData.notes.trim()) {
        cleanUpdateData.notes = editFormData.notes.trim();
      }
      if (editFormData.requirements && editFormData.requirements.trim()) {
        cleanUpdateData.requirements = editFormData.requirements.trim();
      }

      if (editFormData.clientId && editFormData.clientId.trim()) {
        cleanUpdateData.clientId = editFormData.clientId.trim();
      }

      // Add tracking info
      cleanUpdateData.lastUpdatedBy = user?.name || 'Agent2';
      cleanUpdateData.lastUpdatedAt = getEasternNow().toISOString();

      console.log('Sending comprehensive update:', cleanUpdateData);

      const response = await axios.put(`/api/leads/${selectedLead.leadId}`, cleanUpdateData);
      console.log('Edit response:', response.data);

      toast.success('Lead details updated successfully!');
      
      // Refresh leads data
      await fetchLeads(pagination.page);
      
      // Close modal
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error(error.response?.data?.message || 'Failed to update lead details');
    } finally {
      setUpdating(false);
    }
  };

  const openUpdateModal = (lead) => {
    setSelectedLead(lead);
    
    const currentStatus = lead.leadProgressStatus || lead.agent2LastAction || '';
    const leadDraftDate = isLeadGti(lead) ? formatDateAsDDMMYYYY(lead.draftDate) : '';
    
    setUpdateData({
      leadProgressStatus: currentStatus,
      followUpDate: lead.followUpDate ? new Date(lead.followUpDate).toISOString().split('T')[0] : '',
      followUpTime: lead.followUpTime || '',
      followUpNotes: lead.followUpNotes || '',
      conversionValue: lead.conversionValue || '',
      qualificationStatus: lead.qualificationStatus || '',
      draftDate: leadDraftDate,
      requestedLoanAmount: lead.requestedLoanAmount ? String(lead.requestedLoanAmount) : '',
      clientId: lead.clientId || ''
    });

    setDraftDateDirty(false);
    setDraftDateError('');
    
    // Initialize custom disposition states based on current status
    if (currentStatus === 'Others') {
      // If current status is Others, we need to check if there's a custom value
      // For now, initialize with empty and let user enter new value
      setCustomDisposition('');
      setShowCustomDisposition(true);
    } else if (currentStatus && !agent2LeadProgressOptions.includes(currentStatus)) {
      // If current status is not in the predefined options, treat it as a custom "Others" value
      setUpdateData(prev => ({...prev, leadProgressStatus: 'Others'}));
      setCustomDisposition(currentStatus);
      setShowCustomDisposition(true);
    } else {
      setCustomDisposition('');
      setShowCustomDisposition(false);
    }
    
    setShowUpdateModal(true);
  };

  const closeUpdateModal = () => {
    setShowUpdateModal(false);
    setCustomDisposition('');
    setShowCustomDisposition(false);
    setSelectedLead(null);
    setDraftDateDirty(false);
    setDraftDateError('');
    setUpdateData({
      leadProgressStatus: '',
      followUpDate: '',
      followUpTime: '',
      followUpNotes: '',
      conversionValue: '',
      qualificationStatus: '',
      draftDate: '',
      requestedLoanAmount: ''
    });
  };

  const openViewModal = (lead) => {
    setSelectedLead(lead);
    setShowViewModal(true);
    // Log the lead data to debug
    console.log('Opening view modal for lead:', lead);
    console.log('Lead Progress Status:', lead.leadProgressStatus);
    console.log('Agent2 Last Action:', lead.agent2LastAction);
  };

  const getCategoryBadge = (category, completionPercentage) => {
    if (!category) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-800 border-gray-200">
          N/A (0%)
        </span>
      );
    }

    const badges = {
      hot: 'bg-red-100 text-red-800 border-red-200',
      warm: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      cold: 'bg-blue-100 text-blue-800 border-blue-200'
    };

    const percentage = completionPercentage || 0;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badges[category] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
        {category.charAt(0).toUpperCase() + category.slice(1)} ({percentage}%)
      </span>
    );
  };

  const getStatusBadge = (status) => {
    if (!status) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          <AlertCircle className="w-3 h-3 mr-1" />
          Unknown
        </span>
      );
    }

    const badges = {
      new: 'bg-gray-100 text-gray-800',
      interested: 'bg-green-100 text-green-800',
      'not-interested': 'bg-red-100 text-red-800',
      successful: 'bg-emerald-100 text-emerald-800',
      'follow-up': 'bg-blue-100 text-blue-800'
    };

    const icons = {
      new: AlertCircle,
      interested: CheckCircle,
      'not-interested': XCircle,
      successful: CheckCircle,
      'follow-up': Clock
    };

    const Icon = icons[status] || AlertCircle;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badges[status] || 'bg-gray-100 text-gray-800'}`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </span>
    );
  };

  // Render persistent leads table
  const renderPersistentLeadsTable = (leads, type, title, description) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">{title} ({leads.length})</h3>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </div>
      
      {persistentLeadsLoading ? (
        <div className="px-6 py-8 text-center">
          <LoadingSpinner message="Loading persistent leads..." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lead Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Debt Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Debt Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duplicate Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qualification Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leads.map((lead) => (
                <tr key={lead.leadId || lead._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{lead.name}</div>
                      <div className="text-sm text-gray-500">
                        {lead.debtCategory ? `${lead.debtCategory.charAt(0).toUpperCase() + lead.debtCategory.slice(1)} Debt` : 'N/A'}
                      </div>
                      {lead.leadId && (
                        <div className="text-xs text-primary-600 font-mono">ID: {lead.leadId}</div>
                      )}
                      <div className="text-xs text-gray-400">
                        Created by: {lead.createdBy?.name}
                      </div>
                      {lead.lastUpdatedBy && (
                        <div className="text-xs text-green-600">
                          Updated by: {lead.lastUpdatedBy}
                        </div>
                      )}
                      {lead.assignmentNotes && (
                        <div className="text-xs text-gray-500 mt-1">
                          Note: {lead.assignmentNotes}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{maskEmail(lead.email)}</div>
                    <div className="text-sm text-gray-500">{maskPhone(lead.phone)}</div>
                    {lead.alternatePhone && (
                      <div className="text-xs text-gray-400">Alt: {maskPhone(lead.alternatePhone)}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getCategoryBadge(lead.category, lead.completionPercentage)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {lead.totalDebtAmount ? maskAmount(lead.totalDebtAmount) : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {Array.isArray(lead.debtTypes) && lead.debtTypes.length > 0 
                      ? (
                        <div className="space-y-1">
                          {lead.debtTypes.map((debtType, index) => (
                            <div key={index} className="text-sm text-gray-900">
                              {debtType}
                            </div>
                          ))}
                        </div>
                      )
                      : (lead.source || 'N/A')}
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      lead.qualificationStatus === 'qualified' ? 'bg-green-100 text-green-800' :
                      (lead.qualificationStatus === 'not-qualified' || lead.qualificationStatus === 'disqualified' || lead.qualificationStatus === 'unqualified') ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {lead.qualificationStatus === 'qualified' ? '✅ Qualified' :
                       (lead.qualificationStatus === 'not-qualified' || lead.qualificationStatus === 'disqualified' || lead.qualificationStatus === 'unqualified') ? '❌ Not - Qualified' :
                       '⏳ Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      {formatEasternTimeForDisplay(lead.createdAt, { includeTime: false })}
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatEasternTimeForDisplay(lead.createdAt, { includeTime: true, timeOnly: true })}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => openViewModal(lead)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => openEditModal(lead)}
                      className="text-green-600 hover:text-green-900 mr-3"
                    >
                      Edit Details
                    </button>
                    <button
                      onClick={() => openUpdateModal(lead)}
                      className="text-primary-600 hover:text-primary-900 mr-3"
                    >
                      Update Status
                    </button>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan="9" className="px-6 py-8 text-center text-gray-500">
                    No {type === 'qualification' ? 'pending qualification' : 'callback needed'} leads assigned to you.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );


  const getLeadStats = () => {
    // For Agent2, always show only today's assigned leads
    const todayStart = getEasternStartOfDay();
    const todayEnd = getEasternEndOfDay();
    
    const filteredLeads = leads.filter(lead => {
      const leadDate = new Date(lead.assignedAt || lead.createdAt);
      return leadDate >= todayStart && leadDate <= todayEnd;
    });
    
    const total = filteredLeads.length;
    const newLeads = filteredLeads.filter(lead => lead.status === 'new').length;
    const interested = filteredLeads.filter(lead => lead.status === 'interested').length;
    const successful = filteredLeads.filter(lead => lead.status === 'successful').length;
    const followUp = filteredLeads.filter(lead => lead.status === 'follow-up').length;

    return { 
      total, 
      newLeads, 
      interested, 
      successful, 
      followUp, 
      todaysLeads: filteredLeads,
      // Add persistent leads counts
      pendingQualificationCount: pendingQualificationLeads.length,
      callbackNeededCount: callbackNeededLeads.length
    };
  };

  const stats = getLeadStats();

  // Lead creation form handlers (same as Agent 1)
  const handleCreateFormChange = (e) => {
    setCreateFormData({
      ...createFormData,
      [e.target.name]: e.target.value
    });
  };

  // Handle phone number input with automatic +1 prefix and validation
  const handleCreatePhoneInputChange = (e) => {
    const { name, value } = e.target;
    // Remove all non-digits
    let cleanValue = value.replace(/\D/g, '');
    
    // Clear any existing errors for this field
    setFormErrors(prev => ({
      ...prev,
      [name]: ''
    }));
    
    // Validate phone number length
    if (cleanValue.length > 10) {
      cleanValue = cleanValue.slice(0, 10);
    }
    
    // Show error if phone number is incomplete (less than 10 digits) and field is not empty
    if (cleanValue.length > 0 && cleanValue.length < 10) {
      setFormErrors(prev => ({
        ...prev,
        [name]: 'Phone number must be exactly 10 digits'
      }));
    }
    
    // Store as +1 + 10 digits for backend, but display only the 10 digits
    const formattedValue = cleanValue.length > 0 ? `+1${cleanValue}` : '';
    
    setCreateFormData(prev => ({
      ...prev,
      [name]: formattedValue
    }));
  };

  // Display phone number without +1 prefix for user input
  const getCreateDisplayPhone = (phoneValue) => {
    if (!phoneValue) return '';
    if (phoneValue.startsWith('+1')) {
      return phoneValue.slice(2); // Remove +1 prefix for display
    }
    return phoneValue.replace(/\D/g, ''); // Remove non-digits if any
  };

  // Handle debt type selection
  const handleCreateDebtTypeChange = (type) => {
    setCreateFormData(prev => {
      const debtTypes = prev.debtTypes || [];
      return {
        ...prev,
        debtTypes: debtTypes.includes(type)
          ? debtTypes.filter(t => t !== type)
          : [...debtTypes, type]
      };
    });
  };

  // Validate create form before submission
  const validateCreateForm = () => {
    const errors = {};
    
    if (!createFormData.name.trim()) {
      errors.name = 'Name is required';
    }

    // Validate phone numbers
    if (createFormData.phone) {
      const phoneError = validatePhone(createFormData.phone, 'Phone');
      if (phoneError) {
        errors.phone = phoneError;
      }
    }

    if (createFormData.alternatePhone) {
      const altPhoneError = validatePhone(createFormData.alternatePhone, 'Alternate phone');
      if (altPhoneError) {
        errors.alternatePhone = altPhoneError;
      }
    }

    // Validate email
    if (createFormData.email) {
      const emailError = validateEmail(createFormData.email);
      if (emailError) {
        errors.email = emailError;
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle create form submission
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form before submission
    if (!validateCreateForm()) {
      toast.error('Please fix the validation errors before submitting');
      return;
    }
    
    setSubmitting(true);

    try {
      console.log('Agent2 Lead creation started');
      console.log('Form data:', createFormData);
      
      // Build complete form data (same structure as Agent 1)
      const cleanFormData = {
        name: createFormData.name.trim(),
        assignedTo: user._id  // Auto-assign to current Agent2 user
      };

      // Include category and selected types
      if (createFormData.debtCategory) {
        cleanFormData.debtCategory = createFormData.debtCategory;
      }
      if (Array.isArray(createFormData.debtTypes) && createFormData.debtTypes.length > 0) {
        cleanFormData.debtTypes = createFormData.debtTypes;
        
        // Map debt types to valid source values
        const debtTypeToSource = {
          'Credit Cards': 'Credit Card Debt',
          'Mortgage Loans': 'Mortgage Debt',
          'Auto Loans': 'Auto Loans',
          'Student Loans (private loan)': 'Student Loans',
          'Medical Bills': 'Medical Debt',
          'Personal Loans': 'Personal Loans',
          'Payday Loans': 'Payday Loans',
          'Secured Personal Loans': 'Secured Debt',
          'Home Equity Loans': 'Home Equity Loans (HELOCs)',
          'Title Loans': 'Secured Debt',
          'Instalment Loans (Unsecured)': 'Installment Debt',
          'Utility Bills': 'Personal Debt',
          'Store/Charge Cards': 'Credit Card Debt',
          'Overdraft Balances': 'Personal Debt',
          'Business Loans (unsecured)': 'Personal Debt',
          'Collection Accounts': 'Personal Debt'
        };
        
        const firstDebtType = createFormData.debtTypes[0];
        cleanFormData.source = debtTypeToSource[firstDebtType] || 'Personal Debt';
      } else {
        cleanFormData.source = {
          secured: 'Secured Debt',
          unsecured: 'Unsecured Debt'
        }[createFormData.debtCategory] || 'Personal Debt';
      }

      // Add contact information
      if (createFormData.email && createFormData.email.trim() !== '') {
        cleanFormData.email = createFormData.email.trim();
      }
      if (createFormData.phone && createFormData.phone.trim() !== '') {
        cleanFormData.phone = createFormData.phone.trim();
      }
      if (createFormData.alternatePhone && createFormData.alternatePhone.trim() !== '') {
        cleanFormData.alternatePhone = createFormData.alternatePhone.trim();
      }

      // Add debt information
      if (createFormData.totalDebtAmount && createFormData.totalDebtAmount !== '' && !isNaN(createFormData.totalDebtAmount)) {
        cleanFormData.totalDebtAmount = parseFloat(createFormData.totalDebtAmount);
      }
      if (createFormData.numberOfCreditors && createFormData.numberOfCreditors !== '' && !isNaN(createFormData.numberOfCreditors)) {
        cleanFormData.numberOfCreditors = parseInt(createFormData.numberOfCreditors, 10);
      }
      if (createFormData.monthlyDebtPayment && createFormData.monthlyDebtPayment !== '' && !isNaN(createFormData.monthlyDebtPayment)) {
        cleanFormData.monthlyDebtPayment = parseFloat(createFormData.monthlyDebtPayment);
      }
      if (createFormData.creditScore && createFormData.creditScore !== '' && !isNaN(createFormData.creditScore)) {
        cleanFormData.creditScore = parseInt(createFormData.creditScore, 10);
      }
      if (createFormData.creditScoreRange && createFormData.creditScoreRange !== '') {
        cleanFormData.creditScoreRange = createFormData.creditScoreRange;
      }

      // Add address information
      if (createFormData.address && createFormData.address.trim() !== '') {
        cleanFormData.address = createFormData.address.trim();
      }
      if (createFormData.city && createFormData.city.trim() !== '') {
        cleanFormData.city = createFormData.city.trim();
      }
      if (createFormData.state && createFormData.state.trim() !== '') {
        cleanFormData.state = createFormData.state.trim();
      }
      if (createFormData.zipcode && createFormData.zipcode.trim() !== '') {
        cleanFormData.zipcode = createFormData.zipcode.trim();
      }

      // Add notes
      if (createFormData.notes && createFormData.notes.trim() !== '') {
        cleanFormData.notes = createFormData.notes.trim();
      }

      console.log('Submitting clean form data:', cleanFormData);

      const response = await axios.post('/api/leads', cleanFormData);
      console.log('Agent2 Lead creation response:', response.data);

      if (response.data && response.data.success) {
        toast.success('Lead created and assigned successfully!');
        
        // Reset form
        setCreateFormData({
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
          notes: ''
        });
        
        // Clear form errors
        setFormErrors({});
        
        // Close form and refresh leads
        setShowCreateForm(false);
        fetchLeads(1);
      }
    } catch (error) {
      console.error('Agent2 Lead creation error:', error);
      console.error('Error response data:', error.response?.data);
      
      const errorMessage = error.response?.data?.message || 'Failed to create lead';
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading leads..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Management</h1>
          <p className="text-gray-600">Follow up on leads and update their status</p>
        </div>
        {/* Create Lead Button - Only for Agent2 */}
        {user.role === 'agent2' && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Lead
          </button>
        )}
      </div>

      {/* Today's Real-Time Stat Cards - Only for Admin/SuperAdmin */}
      {(user.role === 'admin' || user.role === 'superadmin') && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Total Today */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 group-hover:from-blue-500 group-hover:to-blue-600 transition-all duration-300">
                <BarChart3 className="h-5 w-5 text-blue-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</p>
                <p className="text-xl font-bold text-gray-900">
                  {todayAdminStats ? todayAdminStats.total : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Qualified Today */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-200 group-hover:from-emerald-500 group-hover:to-emerald-600 transition-all duration-300">
                <CheckCircle className="h-5 w-5 text-emerald-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Qualified</p>
                <div className="flex items-end gap-1">
                  <p className="text-xl font-bold text-gray-900">
                    {todayAdminStats ? todayAdminStats.qualified : '—'}
                  </p>
                  {todayAdminStats && (
                    <span className="text-xs font-bold text-emerald-600 mb-0.5">
                      {todayAdminStats.qualificationRate}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Not Qualified Today */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-red-100 to-red-200 group-hover:from-red-500 group-hover:to-red-600 transition-all duration-300">
                <XCircle className="h-5 w-5 text-red-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Not Qualified</p>
                <p className="text-xl font-bold text-gray-900">
                  {todayAdminStats ? todayAdminStats.notQualified : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Pending Today */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-100 to-amber-200 group-hover:from-amber-500 group-hover:to-amber-600 transition-all duration-300">
                <Clock className="h-5 w-5 text-amber-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending</p>
                <p className="text-xl font-bold text-gray-900">
                  {todayAdminStats ? todayAdminStats.pending : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Sale Today */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-green-100 to-green-200 group-hover:from-green-500 group-hover:to-green-600 transition-all duration-300">
                <TrendingUp className="h-5 w-5 text-green-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sale</p>
                <p className="text-xl font-bold text-gray-900">
                  {todayAdminStats ? todayAdminStats.sale : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent2 Dashboard Summary - Only for Agent2 */}
      {user.role === 'agent2' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Today's Assigned Leads */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Today's Assigned</h3>
                <div className="text-2xl font-bold text-green-600">
                  {stats.todaysLeads?.length || 0}
                </div>
                <p className="text-sm text-gray-600">leads assigned today</p>
              </div>
            </div>

            {/* Pending Qualification */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Pending Qualification</h3>
                <div className="text-2xl font-bold text-yellow-600">
                  {stats.pendingQualificationCount || 0}
                </div>
                <p className="text-sm text-gray-600">leads need qualification</p>
              </div>
            </div>

            {/* Callback Needed */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Callback Needed</h3>
                <div className="text-2xl font-bold text-orange-600">
                  {stats.callbackNeededCount || 0}
                </div>
                <p className="text-sm text-gray-600">leads need callback</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Today's Assigned</p>
                  <p className="text-xl font-bold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-yellow-100">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Pending Qualification</p>
                  <p className="text-xl font-bold text-gray-900">{stats.pendingQualificationCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-orange-100">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Callback Needed</p>
                  <p className="text-xl font-bold text-gray-900">{stats.callbackNeededCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Follow Up</p>
                  <p className="text-xl font-bold text-gray-900">{stats.followUp}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-emerald-100">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Successful</p>
                  <p className="text-xl font-bold text-gray-900">{stats.successful}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tabs Navigation - Only for Agent2 */}
      {user.role === 'agent2' && (
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('today')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'today'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Today's Leads ({stats.todaysLeads?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('pending-qualification')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'pending-qualification'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pending Qualification ({stats.pendingQualificationCount || 0})
            </button>
            <button
              onClick={() => setActiveTab('callback-needed')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'callback-needed'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Callback Needed ({stats.callbackNeededCount || 0})
            </button>
          </nav>
        </div>
      )}

      {/* Filters - Only show for today's leads tab */}
      {activeTab === 'today' && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        {/* Duplicate Status Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilters({...filters, duplicateStatus: ''})}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.duplicateStatus === '' 
                ? 'bg-indigo-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            All Leads
          </button>
          <button
            onClick={() => setFilters({...filters, duplicateStatus: 'duplicates'})}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.duplicateStatus === 'duplicates' 
                ? 'bg-red-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            🔄 Duplicate Leads
          </button>
          <button
            onClick={() => setFilters({...filters, duplicateStatus: 'non-duplicates'})}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.duplicateStatus === 'non-duplicates' 
                ? 'bg-green-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            ✅ Unique Leads
          </button>
        </div>

        {/* Progress Status Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1.5 mr-1">
            <div className="p-1.5 bg-gradient-to-br from-green-100 to-green-200 rounded-lg">
              <TrendingUp className="h-3.5 w-3.5 text-green-600" />
            </div>
            <span className="text-xs font-semibold text-gray-700">Progress:</span>
          </div>
          <button
            onClick={() => setFilters({...filters, progressStatus: ''})}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.progressStatus === ''
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilters({...filters, progressStatus: 'sale'})}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.progressStatus === 'sale'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Sale
          </button>
          <button
            onClick={() => setFilters({...filters, progressStatus: 'callback'})}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.progressStatus === 'callback'
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Callback Needed
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search leads..."
                className="pl-10 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
          </div>
{/* 
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
            </select>
          </div> */}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qualification Status</label>
            <select
              className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              value={filters.qualificationStatus}
              onChange={(e) => setFilters({ ...filters, qualificationStatus: e.target.value })}
            >
              <option value="">All Qualification</option>
              <option value="qualified">Qualified</option>
              <option value="not-qualified">Not - Qualified</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setFilters({ status: '', category: '', search: '', duplicateStatus: '', qualificationStatus: '', progressStatus: '' });
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors duration-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'today' && (
          <>
            {/* Today's Leads Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Today's Assigned Leads ({stats.todaysLeads?.length || 0})</h3>
                <p className="text-sm text-gray-600 mt-1">Leads assigned to you today</p>
              </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lead Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Debt Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Debt Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duplicate Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qualification Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.todaysLeads?.map((lead) => (
                <tr key={lead.leadId || lead._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{lead.name}</div>
                      <div className="text-sm text-gray-500">
                        {lead.debtCategory ? `${lead.debtCategory.charAt(0).toUpperCase() + lead.debtCategory.slice(1)} Debt` : 'N/A'}
                      </div>
                      {lead.leadId && (
                        <div className="text-xs text-primary-600 font-mono">ID: {lead.leadId}</div>
                      )}
                      <div className="text-xs text-gray-400">
                        Created by: {lead.createdBy?.name}
                      </div>
                      {lead.lastUpdatedBy && (
                        <div className="text-xs text-green-600">
                          Updated by: {lead.lastUpdatedBy}
                        </div>
                      )}
                      {lead.assignmentNotes && (
                        <div className="text-xs text-gray-500 mt-1">
                          Note: {lead.assignmentNotes}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{maskEmail(lead.email)}</div>
                    <div className="text-sm text-gray-500">{maskPhone(lead.phone)}</div>
                    {lead.alternatePhone && (
                      <div className="text-xs text-gray-400">Alt: {maskPhone(lead.alternatePhone)}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getCategoryBadge(lead.category, lead.completionPercentage)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {lead.totalDebtAmount ? maskAmount(lead.totalDebtAmount) : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {Array.isArray(lead.debtTypes) && lead.debtTypes.length > 0 
                      ? (
                        <div className="space-y-1">
                          {lead.debtTypes.map((debtType, index) => (
                            <div key={index} className="text-sm text-gray-900">
                              {debtType}
                            </div>
                          ))}
                        </div>
                      )
                      : (lead.source || 'N/A')}
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      lead.qualificationStatus === 'qualified' ? 'bg-green-100 text-green-800' :
                      (lead.qualificationStatus === 'not-qualified' || lead.qualificationStatus === 'disqualified' || lead.qualificationStatus === 'unqualified') ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {lead.qualificationStatus === 'qualified' ? '✅ Qualified' :
                       (lead.qualificationStatus === 'not-qualified' || lead.qualificationStatus === 'disqualified' || lead.qualificationStatus === 'unqualified') ? '❌ Not - Qualified' :
                       '⏳ Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      {formatEasternTimeForDisplay(lead.createdAt, { includeTime: false })}
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatEasternTimeForDisplay(lead.createdAt, { includeTime: true, timeOnly: true })}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => openViewModal(lead)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => openEditModal(lead)}
                      className="text-green-600 hover:text-green-900 mr-3"
                    >
                      Edit Details
                    </button>
                    <button
                      onClick={() => openUpdateModal(lead)}
                      className="text-primary-600 hover:text-primary-900 mr-3"
                    >
                      Update Status
                    </button>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    No leads found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
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
      </>
      )}

      {/* Pending Qualification Tab */}
      {activeTab === 'pending-qualification' && (
        renderPersistentLeadsTable(
          pendingQualificationLeads,
          'qualification',
          'Pending Qualification Leads',
          'These leads remain here until you update their qualification status'
        )
      )}

      {/* Callback Needed Tab */}
      {activeTab === 'callback-needed' && (
        renderPersistentLeadsTable(
          callbackNeededLeads,
          'callback',
          'Callback Needed Leads',
          'These leads remain here until you update their progress status'
        )
      )}
      </div>

      {/* View Lead Details Modal */}
      {showViewModal && selectedLead && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div 
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setShowViewModal(false)}
              ></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-6 pt-6 pb-4">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Lead Details: {selectedLead.name}</h3>
                    <p className="text-sm text-gray-500">Complete lead information</p>
                  </div>
                  <button
                    onClick={() => setShowViewModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Personal Information */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Personal Information</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium text-gray-600">Name:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Email:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.email || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Phone:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.phone || 'N/A'}</span>
                      </div>
                      {selectedLead.alternatePhone && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Alternate Phone:</span>
                          <span className="ml-2 text-sm text-gray-900">{selectedLead.alternatePhone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Address Information */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Address Information</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium text-gray-600">Address:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.address || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">City:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.city || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">State:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.state || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Zipcode:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.zipcode || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Location:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.location || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Debt Information */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Debt Information</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium text-gray-600">Debt Category:</span>
                        <span className="ml-2 text-sm text-gray-900 capitalize">
                          {selectedLead.debtCategory || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Debt Types:</span>
                        <div className="ml-2 text-sm text-gray-900">
                          {Array.isArray(selectedLead.debtTypes) && selectedLead.debtTypes.length > 0 
                            ? (
                              <div className="space-y-1">
                                {selectedLead.debtTypes.map((debtType, index) => (
                                  <div key={index}>
                                    {debtType}
                                  </div>
                                ))}
                              </div>
                            )
                            : selectedLead.source || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Total Debt Amount:</span>
                        <span className="ml-2 text-sm text-gray-900">
                          {selectedLead.totalDebtAmount ? `$${selectedLead.totalDebtAmount.toLocaleString()}` : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Number of Creditors:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.numberOfCreditors || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Monthly Debt Payment:</span>
                        <span className="ml-2 text-sm text-gray-900">
                          {selectedLead.monthlyDebtPayment ? `$${selectedLead.monthlyDebtPayment.toLocaleString()}` : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Credit Score Range:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.creditScoreRange || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Category:</span>
                        <span className="ml-2">{getCategoryBadge(selectedLead.category, selectedLead.completionPercentage)}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Status:</span>
                        <span className="ml-2">{getStatusBadge(selectedLead.status)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Additional Information */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Additional Information</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium text-gray-600">Created By:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedLead.createdBy?.name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Created At:</span>
                        <span className="ml-2 text-sm text-gray-900">
                          {selectedLead.createdAt ? formatEasternTimeForDisplay(selectedLead.createdAt, { includeTime: false }) : 'N/A'}
                        </span>
                      </div>
                      {selectedLead.lastUpdatedBy && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Last Updated By:</span>
                          <span className="ml-2 text-sm text-gray-900">{selectedLead.lastUpdatedBy}</span>
                        </div>
                      )}
                      {selectedLead.lastUpdatedAt && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Last Updated:</span>
                          <span className="ml-2 text-sm text-gray-900">
                            {formatEasternTimeForDisplay(selectedLead.lastUpdatedAt)}
                          </span>
                        </div>
                      )}
                      {selectedLead.agent2LastAction && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Agent 2 Last Action:</span>
                          <span className="ml-2 text-sm font-semibold text-blue-700">
                            {selectedLead.agent2LastAction}
                          </span>
                        </div>
                      )}
                      {selectedLead.followUpDate && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Follow-up Date:</span>
                          <span className="ml-2 text-sm text-gray-900">
                            {formatEasternTimeForDisplay(selectedLead.followUpDate, { includeTime: false })}
                            {selectedLead.followUpTime && ` at ${selectedLead.followUpTime}`}
                          </span>
                        </div>
                      )}
                      {selectedLead.conversionValue && (
                        <div>
                          <span className="text-sm font-medium text-gray-600">Conversion Value:</span>
                          <span className="ml-2 text-sm text-gray-900">
                            ${selectedLead.conversionValue.toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium text-gray-600">Client ID:</span>
                        <span className="ml-2 text-sm font-mono font-semibold text-green-700">
                          {selectedLead.clientId || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lead Progress Status - Prominent Display for Agent 2 */}
                {selectedLead.leadProgressStatus && (
                  <div className="mt-6">
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Current Lead Progress Status</h4>
                    <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <CheckCircle className="h-5 w-5 text-blue-400" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-blue-800">
                            Status: <span className="font-bold">{selectedLead.leadProgressStatus}</span>
                          </p>
                          {selectedLead.lastUpdatedAt && (
                            <p className="text-xs text-blue-600 mt-1">
                              Updated: {formatEasternTimeForDisplay(selectedLead.lastUpdatedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Agent2 Status Fields */}
                {(selectedLead.leadProgressStatus || selectedLead.leadStatus || selectedLead.contactStatus || selectedLead.qualificationOutcome || 
                  selectedLead.callDisposition || selectedLead.engagementOutcome || selectedLead.disqualification) && (
                  <div className="mt-6">
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Agent Status Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedLead.leadProgressStatus && (
                        <div className="bg-blue-50 p-3 rounded-lg col-span-2">
                          <span className="text-sm font-medium text-gray-600">Lead Progress Status:</span>
                          <span className="ml-2 text-sm text-gray-900 font-semibold">
                            {selectedLead.leadProgressStatus}
                          </span>
                        </div>
                      )}
                      {selectedLead.leadStatus && (
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <span className="text-sm font-medium text-gray-600">Lead Status:</span>
                          <span className="ml-2 text-sm text-gray-900 capitalize">
                            {selectedLead.leadStatus.replace('-', ' ')}
                          </span>
                        </div>
                      )}
                      {selectedLead.contactStatus && (
                        <div className="bg-green-50 p-3 rounded-lg">
                          <span className="text-sm font-medium text-gray-600">Contact Status:</span>
                          <span className="ml-2 text-sm text-gray-900 capitalize">
                            {selectedLead.contactStatus.replace('-', ' ')}
                          </span>
                        </div>
                      )}
                      {selectedLead.qualificationOutcome && (
                        <div className="bg-yellow-50 p-3 rounded-lg">
                          <span className="text-sm font-medium text-gray-600">Qualification:</span>
                          <span className="ml-2 text-sm text-gray-900 capitalize">
                            {selectedLead.qualificationOutcome.replace('-', ' ')}
                          </span>
                        </div>
                      )}
                      {selectedLead.callDisposition && (
                        <div className="bg-purple-50 p-3 rounded-lg">
                          <span className="text-sm font-medium text-gray-600">Call Disposition:</span>
                          <span className="ml-2 text-sm text-gray-900 capitalize">
                            {selectedLead.callDisposition.replace('-', ' ')}
                          </span>
                        </div>
                      )}
                      {selectedLead.engagementOutcome && (
                        <div className="bg-indigo-50 p-3 rounded-lg">
                          <span className="text-sm font-medium text-gray-600">Engagement:</span>
                          <span className="ml-2 text-sm text-gray-900 capitalize">
                            {selectedLead.engagementOutcome.replace('-', ' ')}
                          </span>
                        </div>
                      )}
                      {selectedLead.disqualification && (
                        <div className="bg-red-50 p-3 rounded-lg">
                          <span className="text-sm font-medium text-gray-600">Disqualification:</span>
                          <span className="ml-2 text-sm text-gray-900 capitalize">
                            {selectedLead.disqualification.replace('-', ' ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes Section */}
                {(selectedLead.requirements || selectedLead.followUpNotes) && (
                  <div className="mt-6">
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Notes</h4>
                    {selectedLead.requirements && (
                      <div className="bg-gray-50 p-4 rounded-lg mb-3">
                        <span className="text-sm font-medium text-gray-600 block mb-1">Initial Notes:</span>
                        <p className="text-sm text-gray-900">{selectedLead.requirements}</p>
                      </div>
                    )}
                    {selectedLead.followUpNotes && (
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <span className="text-sm font-medium text-gray-600 block mb-1">Follow-up Notes:</span>
                        <p className="text-sm text-gray-900">{selectedLead.followUpNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 px-6 py-3 sm:flex sm:flex-row-reverse">
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    openEditModal(selectedLead);
                  }}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Edit Lead Details
                </button>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    openUpdateModal(selectedLead);
                  }}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Update Status
                </button>
                <button
                  onClick={async () => {
                    // Single fetch — reuse the already-loaded leads list to find fresh lead data
                    await fetchLeads(pagination.page);
                    const freshLead = leads.find(l => (l.leadId || l._id) === (selectedLead.leadId || selectedLead._id));
                    if (freshLead) {
                      setSelectedLead(freshLead);
                    }
                  }}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Lead Modal */}
      {showUpdateModal && selectedLead && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div 
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => closeUpdateModal()}
              ></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleUpdateLead}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Update Lead: {selectedLead.name}</h3>
                    <p className="text-sm text-gray-500">{selectedLead.company}</p>
                  </div>

                  {/* Current Lead Status Information */}
                  {selectedLead.leadProgressStatus && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Current Status Information</h4>
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="font-medium text-gray-700">Progress Status:</span>{' '}
                          <span className="text-indigo-600">{selectedLead.leadProgressStatus}</span>
                        </div>
                        {selectedLead.qualificationStatus && (
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Qualification:</span>{' '}
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              selectedLead.qualificationStatus === 'qualified' ? 'bg-green-100 text-green-800' :
                              (selectedLead.qualificationStatus === 'not-qualified' || selectedLead.qualificationStatus === 'disqualified' || selectedLead.qualificationStatus === 'unqualified') ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {selectedLead.qualificationStatus === 'qualified' ? 'Qualified' :
                               (selectedLead.qualificationStatus === 'not-qualified' || selectedLead.qualificationStatus === 'disqualified' || selectedLead.qualificationStatus === 'unqualified') ? 'Not - Qualified' :
                               'Pending'}
                            </span>
                          </div>
                        )}
                        {selectedLead.followUpDate && (
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Follow-up Date:</span>{' '}
                            <span className="text-gray-600">{formatEasternTimeForDisplay(selectedLead.followUpDate, { includeTime: false })}</span>
                            {selectedLead.followUpTime && (
                              <span className="text-gray-600"> at {selectedLead.followUpTime}</span>
                            )}
                          </div>
                        )}
                        {selectedLead.requestedLoanAmount && Number(selectedLead.requestedLoanAmount) > 0 && (
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Requested Loan Amount:</span>{' '}
                            <span className="text-gray-600">${Number(selectedLead.requestedLoanAmount).toLocaleString()}</span>
                          </div>
                        )}
                        {selectedLead.followUpNotes && (
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Last Notes:</span>{' '}
                            <span className="text-gray-600">{selectedLead.followUpNotes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Unified Lead Progress Status Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Lead Progress Status *</label>
                      <select
                        name="leadProgressStatus"
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        value={updateData.leadProgressStatus}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setUpdateData((prev) => ({
                            ...prev,
                            leadProgressStatus: newValue,
                            requestedLoanAmount: newValue === 'Request for Loan' ? (prev.requestedLoanAmount || '') : ''
                          }));
                          setShowCustomDisposition(newValue === 'Others');
                          if (newValue !== 'Others') {
                            setCustomDisposition('');
                          }
                        }}
                      >
                        <option value="">Select Lead Progress Status</option>
                        {agent2LeadProgressOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>

                    {/* Custom Disposition Text Input (show only when Others is selected) */}
                    {showCustomDisposition && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Custom Disposition <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Enter custom disposition..."
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={customDisposition}
                          onChange={(e) => setCustomDisposition(e.target.value)}
                        />
                        {showCustomDisposition && !customDisposition.trim() && (
                          <p className="mt-1 text-sm text-red-500">Custom disposition is required when "Others" is selected</p>
                        )}
                      </div>
                    )}

                    {updateData.leadProgressStatus === 'Request for Loan' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Requested Loan Amount <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={updateData.requestedLoanAmount}
                          onChange={(e) => handleRequestedLoanAmountChange(e.target.value)}
                          placeholder="Enter amount in whole dollars"
                        />
                        <p className="mt-1 text-xs text-gray-500">Whole numbers only (no decimals or symbols).</p>
                      </div>
                    )}

                    {/* Qualification Status Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Qualification Status</label>
                      <select
                        name="qualificationStatus"
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        value={updateData.qualificationStatus}
                        onChange={(e) => setUpdateData({ ...updateData, qualificationStatus: e.target.value })}
                      >
                        <option value="">Select Qualification Status</option>
                        <option value="qualified">Qualified</option>
                        <option value="not-qualified">Not - Qualified</option>
                        {/* <option value="pending">Not Interested</option> */}
                      </select>
                    </div>

                    {/* Follow-up Date (show only if status requires follow-up) */}
                    {(updateData.leadProgressStatus === 'Callback Needed' || updateData.leadProgressStatus === 'Nurture – Not Ready') && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Follow-up Date</label>
                          <input
                            type="date"
                            name="followUpDate"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                            value={updateData.followUpDate}
                            onChange={(e) => setUpdateData({ ...updateData, followUpDate: e.target.value })}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Follow-up Time</label>
                          <input
                            type="time"
                            name="followUpTime"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                            value={updateData.followUpTime}
                            onChange={(e) => setUpdateData({ ...updateData, followUpTime: e.target.value })}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Follow-up Notes</label>
                          <textarea
                            name="followUpNotes"
                            rows="3"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                            value={updateData.followUpNotes}
                            onChange={(e) => setUpdateData({ ...updateData, followUpNotes: e.target.value })}
                            placeholder="Add notes for follow-up..."
                          ></textarea>
                        </div>
                      </>
                    )}

                    {/* Client ID and Conversion Value (show only when SALE) */}
                    {updateData.leadProgressStatus === 'SALE' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Client ID</label>
                          <input
                            type="text"
                            name="clientId"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                            value={updateData.clientId}
                            onChange={(e) => setUpdateData({ ...updateData, clientId: e.target.value })}
                            placeholder="Enter client ID (alphanumeric)"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Conversion Value</label>
                          <div className="mt-1 relative rounded-md">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span className="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input
                              type="number"
                              name="conversionValue"
                              min="0"
                              className="block w-full pl-7 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                              value={updateData.conversionValue}
                              onChange={(e) => setUpdateData({ ...updateData, conversionValue: e.target.value })}
                              placeholder="Enter conversion value"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {selectedLead && isLeadGti(selectedLead) && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Draft Date </label>
                        <input
                          type="text"
                          name="draftDate"
                          placeholder="dd/mm/yyyy"
                          className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${draftDateError ? 'border-red-500' : 'border-gray-300'}`}
                          value={updateData.draftDate}
                          onChange={(e) => handleDraftDateChange(e.target.value)}
                        />
                        {draftDateError ? (
                          <p className="mt-1 text-sm text-red-500">{draftDateError}</p>
                        ) : (
                          <p className="mt-1 text-xs text-gray-500">Format: dd/mm/yyyy. Leave blank to clear.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={updating}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {updating ? 'Updating...' : 'Update Lead'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => closeUpdateModal()}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Lead Edit Modal */}
      {showEditModal && selectedLead && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div 
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setShowEditModal(false)}
              ></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <form onSubmit={handleComprehensiveEdit}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="mb-6">
                    <h3 className="text-lg font-medium text-gray-900">Edit Lead Details: {selectedLead.name}</h3>
                    <p className="text-sm text-gray-500">Update all lead information as needed after contact</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Information Section */}
                    <div className="space-y-4">
                      <h4 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">
                        Personal Information
                      </h4>
                      
                      {/* Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Name *</label>
                        <input
                          type="text"
                          required
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.name}
                          onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                          placeholder="Full name"
                        />
                      </div>

                      {/* Email */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                          type="email"
                          className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                            formErrors.email ? 'border-red-500' : 'border-gray-300'
                          }`}
                          value={editFormData.email}
                          onChange={(e) => {
                            setEditFormData({ ...editFormData, email: e.target.value });
                            if (formErrors.email) {
                              setFormErrors({ ...formErrors, email: '' });
                            }
                          }}
                          placeholder="email@example.com"
                        />
                        {formErrors.email && (
                          <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>
                        )}
                      </div>

                      {/* Phone */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Phone</label>
                        <input
                          type="tel"
                          className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                            formErrors.phone ? 'border-red-500' : 'border-gray-300'
                          }`}
                          value={editFormData.phone}
                          onChange={(e) => {
                            setEditFormData({ ...editFormData, phone: e.target.value });
                            if (formErrors.phone) {
                              setFormErrors({ ...formErrors, phone: '' });
                            }
                          }}
                          placeholder="+12345678901"
                        />
                        {formErrors.phone && (
                          <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>
                        )}
                      </div>

                      {/* Alternate Phone */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Alternate Phone</label>
                        <input
                          type="tel"
                          className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                            formErrors.alternatePhone ? 'border-red-500' : 'border-gray-300'
                          }`}
                          value={editFormData.alternatePhone}
                          onChange={(e) => {
                            setEditFormData({ ...editFormData, alternatePhone: e.target.value });
                            if (formErrors.alternatePhone) {
                              setFormErrors({ ...formErrors, alternatePhone: '' });
                            }
                          }}
                          placeholder="+12345678901"
                        />
                        {formErrors.alternatePhone && (
                          <p className="text-red-500 text-sm mt-1">{formErrors.alternatePhone}</p>
                        )}
                      </div>
                    </div>

                    {/* Address Information Section */}
                    <div className="space-y-4">
                      <h4 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">
                        Address Information
                      </h4>

                      {/* Address */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <input
                          type="text"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.address}
                          onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                          placeholder="Street address"
                        />
                      </div>

                      {/* City */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">City</label>
                        <input
                          type="text"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.city}
                          onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                          placeholder="City"
                        />
                      </div>

                      {/* State */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">State</label>
                        <input
                          type="text"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.state}
                          onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                          placeholder="State"
                        />
                      </div>

                      {/* Zipcode */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Zipcode</label>
                        <input
                          type="text"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.zipcode}
                          onChange={(e) => setEditFormData({ ...editFormData, zipcode: e.target.value })}
                          placeholder="12345"
                        />
                      </div>
                    </div>

                    {/* Debt Information Section */}
                    <div className="space-y-4">
                      <h4 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">
                        Debt Information
                      </h4>

                      {/* Debt Category */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Debt Category</label>
                        <select
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.debtCategory}
                          onChange={(e) => {
                            setEditFormData({ ...editFormData, debtCategory: e.target.value, debtTypes: [] });
                          }}
                        >
                          <option value="unsecured">Unsecured</option>
                          <option value="secured">Secured</option>
                        </select>
                      </div>

                      {/* Debt Types */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Debt Types</label>
                        <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-300 rounded-md p-2">
                          {(DEBT_TYPES_BY_CATEGORY[editFormData.debtCategory] || []).map((type) => (
                            <label key={type} className="flex items-center">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                                checked={editFormData.debtTypes && editFormData.debtTypes.includes(type)}
                                onChange={(e) => {
                                  const debtTypes = editFormData.debtTypes || [];
                                  if (e.target.checked) {
                                    setEditFormData({
                                      ...editFormData,
                                      debtTypes: [...debtTypes, type]
                                    });
                                  } else {
                                    setEditFormData({
                                      ...editFormData,
                                      debtTypes: debtTypes.filter(t => t !== type)
                                    });
                                  }
                                }}
                              />
                              <span className="ml-2 text-sm text-gray-700">{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Total Debt Amount */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Total Debt Amount</label>
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.totalDebtAmount}
                          onChange={(e) => setEditFormData({ ...editFormData, totalDebtAmount: e.target.value })}
                          placeholder="50000"
                        />
                      </div>

                      {/* Number of Creditors */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Number of Creditors</label>
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.numberOfCreditors}
                          onChange={(e) => setEditFormData({ ...editFormData, numberOfCreditors: e.target.value })}
                          placeholder="5"
                        />
                      </div>
                    </div>

                    {/* Financial Information Section */}
                    <div className="space-y-4">
                      <h4 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">
                        Financial Information
                      </h4>

                      {/* Monthly Debt Payment */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Monthly Debt Payment</label>
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.monthlyDebtPayment}
                          onChange={(e) => setEditFormData({ ...editFormData, monthlyDebtPayment: e.target.value })}
                          placeholder="1200"
                        />
                      </div>

                      {/* Credit Score */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Credit Score</label>
                        <input
                          type="number"
                          min="300"
                          max="850"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.creditScore}
                          onChange={(e) => setEditFormData({ ...editFormData, creditScore: e.target.value })}
                          placeholder="650"
                        />
                      </div>

                      {/* Credit Score Range */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Credit Score Range</label>
                        <select
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.creditScoreRange}
                          onChange={(e) => setEditFormData({ ...editFormData, creditScoreRange: e.target.value })}
                        >
                          <option value="">Select range</option>
                          {CREDIT_SCORE_RANGES.map(range => (
                            <option key={range} value={range}>{range}</option>
                          ))}
                        </select>
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                        <textarea
                          rows="3"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.notes}
                          onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                          placeholder="Additional notes about the lead..."
                        />
                      </div>

                      {/* Requirements */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Requirements</label>
                        <textarea
                          rows="3"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          value={editFormData.requirements}
                          onChange={(e) => setEditFormData({ ...editFormData, requirements: e.target.value })}
                          placeholder="Specific requirements or preferences..."
                        />
                      </div>

                      {/* Client ID (for SALE leads) */}
                      {selectedLead?.leadProgressStatus === 'SALE' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Client ID</label>
                          <input
                            type="text"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                            value={editFormData.clientId}
                            onChange={(e) => setEditFormData({ ...editFormData, clientId: e.target.value })}
                            placeholder="Enter client ID (alphanumeric)"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={updating}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {updating ? 'Updating...' : 'Update Lead Details'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => setShowEditModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Lead Form Modal - Only for Agent2 */}
      {user.role === 'agent2' && showCreateForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Create New Lead</h3>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h4 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">Basic Information</h4>
                  
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name *</label>
                    <input
                      type="text"
                      name="name"
                      required
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      value={createFormData.name}
                      onChange={handleCreateFormChange}
                      placeholder="Enter full name"
                    />
                    {formErrors.name && <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      value={createFormData.email}
                      onChange={handleCreateFormChange}
                      placeholder="Enter email address"
                    />
                    {formErrors.email && <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>}
                  </div>

                  {/* Phone Numbers */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Primary Phone *</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">+1</span>
                        </div>
                        <input
                          type="tel"
                          name="phone"
                          required
                          className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white ${
                            formErrors.phone 
                              ? 'border-red-300 focus:ring-red-500' 
                              : 'border-gray-200 focus:ring-primary-500'
                          }`}
                          value={getCreateDisplayPhone(createFormData.phone)}
                          onChange={handleCreatePhoneInputChange}
                          placeholder="Enter 10 digits (e.g. 2345678901)"
                          maxLength="10"
                        />
                      </div>
                      {formErrors.phone && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.phone}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Alternate Phone</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">+1</span>
                        </div>
                        <input
                          type="tel"
                          name="alternatePhone"
                          className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white ${
                            formErrors.alternatePhone 
                              ? 'border-red-300 focus:ring-red-500' 
                              : 'border-gray-200 focus:ring-primary-500'
                          }`}
                          value={getCreateDisplayPhone(createFormData.alternatePhone)}
                          onChange={handleCreatePhoneInputChange}
                          placeholder="Enter 10 digits (optional)"
                          maxLength="10"
                        />
                      </div>
                      {formErrors.alternatePhone && (
                        <p className="mt-1 text-sm text-red-600">{formErrors.alternatePhone}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Debt Information */}
                <div className="space-y-4">
                  <h4 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">Debt Information</h4>
                  
                  {/* Debt Category */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Debt Category</label>
                    <div className="flex space-x-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="debtCategory"
                          value="unsecured"
                          checked={createFormData.debtCategory === 'unsecured'}
                          onChange={handleCreateFormChange}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-700">Unsecured Debt</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="debtCategory"
                          value="secured"
                          checked={createFormData.debtCategory === 'secured'}
                          onChange={handleCreateFormChange}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-700">Secured Debt</span>
                      </label>
                    </div>
                  </div>

                  {/* Debt Types */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Select Debt Types</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50">
                      {(DEBT_TYPES_BY_CATEGORY[createFormData.debtCategory] || []).map((type) => (
                        <label key={type} className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={createFormData.debtTypes && createFormData.debtTypes.includes(type)}
                            onChange={() => handleCreateDebtTypeChange(type)}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          />
                          <span className="text-sm text-gray-700">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Financial Details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Total Debt Amount ($)</label>
                      <input
                        type="number"
                        name="totalDebtAmount"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        value={createFormData.totalDebtAmount}
                        onChange={handleCreateFormChange}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Creditors</label>
                      <input
                        type="number"
                        name="numberOfCreditors"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        value={createFormData.numberOfCreditors}
                        onChange={handleCreateFormChange}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Monthly Payment ($)</label>
                      <input
                        type="number"
                        name="monthlyDebtPayment"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        value={createFormData.monthlyDebtPayment}
                        onChange={handleCreateFormChange}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Credit Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Credit Score</label>
                      <input
                        type="number"
                        name="creditScore"
                        min="300"
                        max="850"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        value={createFormData.creditScore}
                        onChange={handleCreateFormChange}
                        placeholder="Enter credit score"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Credit Score Range</label>
                      <select
                        name="creditScoreRange"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        value={createFormData.creditScoreRange}
                        onChange={handleCreateFormChange}
                      >
                        <option value="">Select credit score range</option>
                        {CREDIT_SCORE_RANGES.map((range) => (
                          <option key={range} value={range}>{range}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Address Information */}
                <div className="space-y-4">
                  <h4 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">Address Information</h4>
                  
                  {/* Address */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Street Address</label>
                    <input
                      type="text"
                      name="address"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      value={createFormData.address}
                      onChange={handleCreateFormChange}
                      placeholder="Enter street address"
                    />
                  </div>

                  {/* City, State, Zipcode */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
                      <input
                        type="text"
                        name="city"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        value={createFormData.city}
                        onChange={handleCreateFormChange}
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
                      <input
                        type="text"
                        name="state"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        value={createFormData.state}
                        onChange={handleCreateFormChange}
                        placeholder="State"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Zipcode</label>
                      <input
                        type="text"
                        name="zipcode"
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                        value={createFormData.zipcode}
                        onChange={handleCreateFormChange}
                        placeholder="Zipcode"
                      />
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div className="space-y-4">
                  <h4 className="text-md font-semibold text-gray-900 border-b border-gray-200 pb-2">Additional Information</h4>
                  
                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                    <textarea
                      name="notes"
                      rows="4"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white resize-vertical"
                      value={createFormData.notes}
                      onChange={handleCreateFormChange}
                      placeholder="Additional notes about the lead..."
                    />
                  </div>

                  {/* Requirements */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Requirements</label>
                    <textarea
                      name="requirements"
                      rows="4"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white resize-vertical"
                      value={createFormData.requirements}
                      onChange={handleCreateFormChange}
                      placeholder="Specific requirements or preferences..."
                    />
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-primary-700 border border-transparent rounded-lg shadow-sm hover:from-primary-700 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
                  >
                    {submitting ? (
                      <>
                        <LoadingSpinner size="small" />
                        <span>Creating Lead...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        <span>Create Lead</span>
                      </>
                    )}
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

export default Agent2Dashboard;
