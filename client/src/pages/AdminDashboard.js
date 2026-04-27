import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  BarChart3, 
  Users, 
  Calendar,
  Target,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
  Search,
  Edit3,
  Save,
  X,
  Download,
  UserCheck,
  TrendingUp
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import AgentManagement from '../components/AgentManagement';
import SuperUserManagement from '../components/SuperUserManagement';
import OrganizationManagement from './OrganizationManagement';
import LeadReassignModal from '../components/LeadReassignModal';
import AdminUploadShareModal from '../components/AdminUploadShareModal';
import WebsiteLeadsModal from '../components/WebsiteLeadsModal';
import Pagination from '../components/Pagination';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { scrollToTop } from '../utils/scrollUtils';
import { 
  formatEasternTimeForDisplay, 
  getEasternNow,
  formatDateAsDDMMYYYY
} from '../utils/dateUtils';

const AdminDashboard = () => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { registerRefreshCallback, unregisterRefreshCallback } = useRefresh();
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(getEasternNow());
  const [showLeadsSection, setShowLeadsSection] = useState(false);

  // ── People Search floating PiP panel ─────────────────────────────
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [searchMinimized, setSearchMinimized] = useState(false);
  const [panelPos, setPanelPos] = useState({ x: 24, y: 120 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const handlePanelDragStart = (e) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - panelPos.x, y: e.clientY - panelPos.y };
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      setPanelPos({ x: Math.max(0, e.clientX - dragOffset.current.x), y: Math.max(0, e.clientY - dragOffset.current.y) });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);
  // ── Collapsible section toggles ─────────────────────────────────
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [orgMgmtOpen, setOrgMgmtOpen] = useState(false);
  // ───────────────────────────────────────────────────────────────
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0
  });

  // Search functionality
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Edit modal states
  const [isEditing, setIsEditing] = useState(false);
  const [editedLead, setEditedLead] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Date filtering state - ONLY FOR ADMIN
  const [dateFilter, setDateFilter] = useState({
    startDate: '',
    endDate: '',
    filterType: 'all' // 'all', 'today', 'week', 'month', 'custom'
  });

  // Add qualification status filter
  const [qualificationFilter, setQualificationFilter] = useState('all'); // 'all', 'qualified', 'not-qualified', 'pending'
  
  // Add duplicate status filter
  const [duplicateFilter, setDuplicateFilter] = useState('all'); // 'all', 'duplicates', 'non-duplicates'
  const [progressFilter, setProgressFilter] = useState('all'); // 'all', 'sale', 'callback'
  
  // Add organization filter
  const [organizationFilter, setOrganizationFilter] = useState('all'); // 'all' or specific organization ID
  const [organizations, setOrganizations] = useState([]); // List of all organizations
  
  // Lead update modal states - REMOVED (Admin is now read-only)
  const [selectedLead, setSelectedLead] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  
  // Lead reassignment modal states
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [leadToReassign, setLeadToReassign] = useState(null);

  // ── Call Report (Inbound / Outbound) ──────────────────────────────────────
  const [callReport, setCallReport] = useState(null);
  const [callReportLoading, setCallReportLoading] = useState(false);
  const [callReportDate, setCallReportDate] = useState(() => {
    // Default to today in YYYY-MM-DD
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [callReportDid, setCallReportDid] = useState('');
  const [showCallReport, setShowCallReport] = useState(false);

  const fetchCallReport = useCallback(async (date, did) => {
    setCallReportLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (did && did.trim()) params.append('did', did.trim());
      const res = await axios.get(`/api/leads/call-report?${params.toString()}`);
      if (res.data?.success) setCallReport(res.data.data);
    } catch (err) {
      console.error('Call report fetch error:', err);
      toast.error('Failed to fetch call report');
    } finally {
      setCallReportLoading(false);
    }
  }, []);

  // Admin upload share modal
  const [showShareModal, setShowShareModal] = useState(false);

  // Website leads modal (Reddington admin only)
  const [showWebsiteLeads, setShowWebsiteLeads] = useState(false);
  const [websiteLeadsBadge, setWebsiteLeadsBadge] = useState(0);
  
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

  const formatDraftDate = (dateValue) => formatDateAsDDMMYYYY(dateValue) || '—';

  const formatDisposedByLabel = (disposedBy) => {
    if (!disposedBy) return '—';
    if (typeof disposedBy === 'string') return disposedBy;
    if (disposedBy.name) return disposedBy.name;
    if (disposedBy.email) return disposedBy.email;
    if (disposedBy._id) return disposedBy._id;
    return '—';
  };

  // NOTE: Date filtering is now handled by the backend for better performance and accuracy
  // The frontend only handles search filtering for immediate user feedback
  // This function is kept for reference but is no longer used
  /*
  const getDateFilteredLeads = (leadsToFilter) => {
    if (!dateFilter || dateFilter.filterType === 'all') {
      return leadsToFilter;
    }

    const now = getEasternNow();
    let startDate, endDate;

    switch (dateFilter.filterType) {
      case 'today':
        startDate = getEasternStartOfDay();
        endDate = getEasternEndOfDay();
        break;
      case 'week':
        startDate = now.clone().subtract(7, 'days').startOf('day');
        endDate = now.clone().endOf('day');
        break;
      case 'month':
        startDate = now.clone().subtract(1, 'month').startOf('day');
        endDate = now.clone().endOf('day');
        break;
      case 'custom':
        if (dateFilter.startDate) {
          startDate = getEasternStartOfDay(dateFilter.startDate);
        } else {
          startDate = now.clone().startOf('day');
        }
        if (dateFilter.endDate) {
          endDate = getEasternEndOfDay(dateFilter.endDate);
        } else {
          endDate = now.clone().endOf('day');
        }
        break;
      default:
        return leadsToFilter;
    }

    return leadsToFilter.filter(lead => {
      const leadDate = toEasternTime(lead.createdAt || lead.dateCreated);
      return leadDate.isBetween(startDate, endDate, null, '[]');
    });
  };
  */

  const handleDateFilterChange = (filterType, startDate = '', endDate = '') => {
    setDateFilter({
      filterType,
      startDate,
      endDate
    });
    resetPaginationAndFetch();
  };







  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
    }
    
    try {
      const response = await axios.get('/api/leads/dashboard/stats');
      // Handle the nested response structure
      const statsData = response.data?.data || response.data;
      setStats(statsData);
    } catch (error) {
      console.error('Error fetching stats:', error);
      if (!silent) {
        toast.error('Failed to fetch dashboard stats');
      }
    } finally {
      if (!silent) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, []);

  // Request deduplication - prevent multiple identical API calls
  const pendingRequestsRef = useRef(new Map());
  
  // Use refs to hold current filter values to avoid recreating fetchLeads
  const paginationRef = useRef(pagination);
  const filtersRef = useRef({ qualificationFilter, duplicateFilter, organizationFilter, dateFilter, progressFilter });
  
  // Update refs when values change
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);
  
  useEffect(() => {
    filtersRef.current = { qualificationFilter, duplicateFilter, organizationFilter, dateFilter, progressFilter };
  }, [qualificationFilter, duplicateFilter, organizationFilter, dateFilter, progressFilter]);

  const fetchLeads = useCallback(async (silent = false, page = null) => {
    try {
      const currentPage = page ?? paginationRef.current.page;
      const currentLimit = paginationRef.current.limit;
      const filters = filtersRef.current;
      
      const timestamp = new Date().getTime();
      let url = `/api/leads?page=${currentPage}&limit=${currentLimit}&_t=${timestamp}`;
      
      // Add qualification filter if selected
      if (filters.qualificationFilter && filters.qualificationFilter !== 'all') {
        url += `&qualificationStatus=${filters.qualificationFilter}`;
      }
      
      // Add duplicate filter if selected
      if (filters.duplicateFilter && filters.duplicateFilter !== 'all') {
        url += `&duplicateStatus=${filters.duplicateFilter}`;
      }
      
      // Add organization filter if selected
      if (filters.organizationFilter && filters.organizationFilter !== 'all') {
        url += `&organization=${filters.organizationFilter}`;
      }
      
      // Add progress status filter if selected
      if (filters.progressFilter && filters.progressFilter !== 'all') {
        url += `&progressStatus=${filters.progressFilter}`;
      }
      
      // Add date filtering parameters
      if (filters.dateFilter.filterType && filters.dateFilter.filterType !== 'all') {
        url += `&dateFilterType=${filters.dateFilter.filterType}`;
        if (filters.dateFilter.filterType === 'custom' && filters.dateFilter.startDate && filters.dateFilter.endDate) {
          url += `&startDate=${filters.dateFilter.startDate}&endDate=${filters.dateFilter.endDate}`;
        }
      }
      
      // Generate a unique key for this request (excluding timestamp)
      const requestKey = url.split('&_t=')[0];
      
      // If same request is already pending, return the existing promise
      if (pendingRequestsRef.current.has(requestKey)) {
        console.log('Request deduplication: Reusing pending request');
        return pendingRequestsRef.current.get(requestKey);
      }
      
      // Create new request promise
      const requestPromise = (async () => {
        try {
          const response = await axios.get(url);
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
          
          return { success: true };
        } catch (error) {
          console.error('Error fetching leads:', error);
          if (!silent) {
            toast.error('Failed to fetch leads');
          }
          setLeads([]);
          return { success: false, error };
        } finally {
          // Remove from pending requests after completion
          pendingRequestsRef.current.delete(requestKey);
        }
      })();
      
      // Store the promise
      pendingRequestsRef.current.set(requestKey, requestPromise);
      
      return requestPromise;
    } catch (error) {
      console.error('Unexpected error in fetchLeads:', error);
      return { success: false, error };
    }
  }, []); // No dependencies - uses refs for current values

  // Initial data fetching
  useEffect(() => {
    const initializeData = async () => {
      // Fetch stats and organizations in parallel for faster startup
      await Promise.all([fetchStats(), fetchOrganizations()]);
      
      if (showLeadsSection) {
        fetchLeads();
      }
    };

    initializeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLeadsSection, qualificationFilter, duplicateFilter, organizationFilter, dateFilter, progressFilter]);

  // Handle refresh functionality
  const handleDashboardRefresh = useCallback(() => {
    // Scroll to top using utility function
    scrollToTop();
    
    // Reset filters and pagination
    setSearchTerm('');
    setQualificationFilter('all');
    setDuplicateFilter('all');
    setOrganizationFilter('all');
    setProgressFilter('all');
    setDateFilter({
      startDate: '',
      endDate: '',
      filterType: 'all'
    });
    setPagination(prev => ({ ...prev, page: 1 }));
    
    // Refetch data
    setRefreshing(true);
    const refreshData = async () => {
      try {
        await fetchStats();
        if (showLeadsSection) {
          await fetchLeads(false, 1);
        }
        setLastUpdated(getEasternNow());
      } catch (error) {
        console.error('Error refreshing dashboard:', error);
        toast.error('Failed to refresh dashboard');
      } finally {
        setRefreshing(false);
      }
    };
    refreshData();
  }, [fetchStats, fetchLeads, showLeadsSection]);

  // Register refresh callback
  useEffect(() => {
    registerRefreshCallback('admin', handleDashboardRefresh);
    return () => {
      unregisterRefreshCallback('admin');
    };
  }, [registerRefreshCallback, unregisterRefreshCallback, handleDashboardRefresh]);

  // Pagination handler
  const handlePageChange = async (newPage) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setPagination(prev => ({ ...prev, page: newPage }));
      await fetchLeads(false, newPage);
    }
  };

  // Reset pagination when filters change
  const resetPaginationAndFetch = useCallback(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchLeads(false, 1);
  }, [fetchLeads]);

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get('/api/organizations');
      setOrganizations(response.data?.data || response.data || []);
    } catch (error) {
      console.error('Error fetching organizations:', error);
      setOrganizations([]);
    }
  };

  // Export leads function for AdminDashboard
  const handleExportLeads = async () => {
    try {
      const params = new URLSearchParams();
      
      // Add current filters as query parameters
      if (searchTerm) params.append('search', searchTerm);
      
      // Handle date filters based on type - send dateFilterType for backend processing
      if (dateFilter.filterType !== 'all') {
        params.append('dateFilterType', dateFilter.filterType);
        
        // For custom dates, also send start and end dates
        if (dateFilter.filterType === 'custom') {
          if (dateFilter.startDate) params.append('startDate', dateFilter.startDate);
          if (dateFilter.endDate) params.append('endDate', dateFilter.endDate);
        }
      }
      
      // Add qualification filter
      if (qualificationFilter !== 'all') {
        params.append('qualificationStatus', qualificationFilter);
      }
      
      // Add duplicate filter - match backend parameter name
      if (duplicateFilter !== 'all') {
        params.append('duplicateStatus', duplicateFilter);
      }
      
      // Add organization filter
      if (organizationFilter !== 'all') {
        params.append('organization', organizationFilter);
      }

      console.log('Export parameters:', params.toString());

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

  const openViewModal = (lead) => {
    setSelectedLead(lead);
    setEditedLead({ ...lead }); // Initialize edit state
    setIsEditing(false);
    setShowViewModal(true);
  };

  const closeViewModal = () => {
    setShowViewModal(false);
    setSelectedLead(null);
    setEditedLead(null);
    setIsEditing(false);
    setIsUpdating(false);
  };

  // Reassignment modal functions
  const openReassignModal = (lead) => {
    setLeadToReassign(lead);
    setShowReassignModal(true);
  };

  const closeReassignModal = () => {
    setShowReassignModal(false);
    setLeadToReassign(null);
  };

  const handleLeadReassigned = (updatedLead) => {
    // Update the lead in the leads array
    setLeads(prevLeads => 
      prevLeads.map(lead => 
        lead._id === updatedLead._id ? updatedLead : lead
      )
    );
    
    // Update search results if they exist
    setSearchResults(prevResults => 
      prevResults.map(lead => 
        lead._id === updatedLead._id ? updatedLead : lead
      )
    );
    
    // Close modal
    closeReassignModal();
  };

  // Check if user is from REDDINGTON GLOBAL CONSULTANCY
  // Use useMemo instead of useCallback to calculate once per render
  const isReddingtonAdmin = useMemo(() => {
    // Case-insensitive, trim-safe name check
    const orgName = (user?.organization?.name || '').trim().toUpperCase();
    const isReddingtonByName = orgName === 'REDDINGTON GLOBAL CONSULTANCY';
    const isReddingtonById = user?.organization === '68b9c76d2c29dac1220cb81c' || user?.organization?._id === '68b9c76d2c29dac1220cb81c';

    return isReddingtonByName || isReddingtonById;
  }, [user]);

  // Periodic stats refresh — every 30 s ensures cards stay in sync with DB
  // even if a socket event is missed (e.g. connection drop, batch import)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Socket.IO event listeners for real-time updates with debouncing
  useEffect(() => {
    if (socket) {
      console.log('Admin Dashboard: Setting up socket listeners');
      
      // Debounce timeout references
      const socketDebounceRef = { timeout: null };
      
      const debouncedRefresh = () => {
        // Clear existing timeout
        if (socketDebounceRef.timeout) {
          clearTimeout(socketDebounceRef.timeout);
        }
        
        // Debounce refreshes to prevent excessive API calls
        socketDebounceRef.timeout = setTimeout(() => {
          fetchStats(true);
          if (showLeadsSection) {
            fetchLeads(true);
          }
          setLastUpdated(getEasternNow());
        }, 1000); // Wait 1 second before refreshing
      };
      
      const handleLeadUpdated = (data) => {
        console.log('Lead updated via socket:', data);
        // Only show notifications to main organization (REDDINGTON) admins
        if (isReddingtonAdmin) {
          toast.success(`Lead updated by ${data.updatedBy}`, {
            duration: 2000,
            icon: '🔄'
          });
        }
        debouncedRefresh();
      };

      const handleLeadCreated = (data) => {
        console.log('New lead created via socket:', data);
        // Only show notifications to main organization (REDDINGTON) admins
        if (isReddingtonAdmin) {
          toast.success(`New lead created by ${data.createdBy}`, {
            duration: 2000,
            icon: '✅'
          });
        }
        debouncedRefresh();
      };

      const handleLeadDeleted = (data) => {
        console.log('Lead deleted via socket:', data);
        // Only show notifications to main organization (REDDINGTON) admins
        if (isReddingtonAdmin) {
          toast.success(`Lead deleted by ${data.deletedBy}`, {
            duration: 2000,
            icon: '🗑️'
          });
        }
        debouncedRefresh();
      };

      const handleNewWebsiteLead = (data) => {
        if (isReddingtonAdmin) {
          setWebsiteLeadsBadge(n => n + 1);
          toast.success(`New website lead: ${data.name}`, { duration: 4000, icon: '🌐' });
        }
      };

      socket.on('leadUpdated', handleLeadUpdated);
      socket.on('leadCreated', handleLeadCreated);
      socket.on('leadDeleted', handleLeadDeleted);
      socket.on('newWebsiteLead', handleNewWebsiteLead);

      // Cleanup socket listeners and timeout
      return () => {
        if (socketDebounceRef.timeout) {
          clearTimeout(socketDebounceRef.timeout);
        }
        socket.off('leadUpdated', handleLeadUpdated);
        socket.off('leadCreated', handleLeadCreated);
        socket.off('leadDeleted', handleLeadDeleted);
        socket.off('newWebsiteLead', handleNewWebsiteLead);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, showLeadsSection, stats]);

  // Search functionality with debouncing to prevent excessive filtering
  const searchTimeoutRef = useRef(null);
  
  const performSearch = useCallback((term) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }

    const filtered = leads.filter(lead => {
      const searchLower = term.toLowerCase();
      return (
        lead.name?.toLowerCase().includes(searchLower) ||
        lead.phone?.includes(term) ||
        lead.alternatePhone?.includes(term) ||
        lead.email?.toLowerCase().includes(searchLower) ||
        lead._id?.toLowerCase().includes(searchLower) ||
        lead.leadId?.toLowerCase().includes(searchLower) ||
        lead.clientId?.toLowerCase().includes(searchLower) ||
        lead.gtiPrimaryPhone?.includes(term)
      );
    });
    setSearchResults(filtered);
  }, [leads]);

  const handleSearch = useCallback((term) => {
    setSearchTerm(term);
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // If search is empty, clear immediately
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    
    // Debounce the actual search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(term);
    }, 300);
  }, [performSearch]);

  // Update search results when leads change
  useEffect(() => {
    if (searchTerm.trim()) {
      performSearch(searchTerm);
    }
  }, [leads, performSearch, searchTerm]);

  // Lead update functionality
  const handleEditToggle = () => {
    if (isEditing) {
      setEditedLead({ ...selectedLead }); // Reset changes
    }
    setIsEditing(!isEditing);
  };

  const handleCancelEdit = () => {
    setEditedLead({ ...selectedLead }); // Reset changes
    setIsEditing(false);
  };

  const handleInputChange = (field, value) => {
    setEditedLead(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Enhanced lead update with proper data types
  const handleLeadUpdate = async () => {
    if (!editedLead || !isReddingtonAdmin) return;

    setIsUpdating(true);
    try {
      console.log('Frontend: Attempting to update lead with ID:', editedLead._id);
      console.log('Frontend: Original lead data:', selectedLead);
      console.log('Frontend: Edited lead data:', editedLead);
      
      // Prepare the update data with proper data types
      const updateData = {
        ...editedLead,
        totalDebtAmount: editedLead.totalDebtAmount ? parseInt(editedLead.totalDebtAmount) : undefined,
        numberOfCreditors: editedLead.numberOfCreditors ? parseInt(editedLead.numberOfCreditors) : undefined,
        monthlyDebtPayment: editedLead.monthlyDebtPayment ? parseInt(editedLead.monthlyDebtPayment) : undefined,
        conversionValue: editedLead.conversionValue ? parseInt(editedLead.conversionValue) : undefined,
        completionPercentage: editedLead.completionPercentage ? parseInt(editedLead.completionPercentage) : undefined,
      };

      console.log('Frontend: Sending update data:', updateData);
      console.log('Frontend: Making PUT request to:', `/api/leads/${editedLead._id}`);

      const response = await axios.put(`/api/leads/${editedLead._id}`, updateData);
      
      console.log('Frontend: Update response:', response.data);
      
      if (response.data) {
        // Update the lead in our local state
        setLeads(prevLeads => 
          prevLeads.map(lead => 
            lead._id === editedLead._id ? response.data.data.lead : lead
          )
        );
        
        // Update selected lead
        setSelectedLead(response.data.data.lead);
        setEditedLead(response.data.data.lead);
        setIsEditing(false);
        
        toast.success('Lead updated successfully');
        
        // Refresh stats and search results
        fetchStats(true);
        if (searchTerm.trim()) {
          handleSearch(searchTerm);
        }
      }
    } catch (error) {
      console.error('Frontend: Error updating lead:', error);
      console.error('Frontend: Error response:', error.response?.data);
      toast.error(error.response?.data?.message || 'Failed to update lead');
    } finally {
      setIsUpdating(false);
    }
  };

  // Lead progress status options
  const leadProgressOptions = [
    'SALE',
    'Callback Needed',
    'Existing Client',
    'Unacceptable Creditors',
    'Not Serviceable State',
    'Sale Long Play',
    'DO NOT CALL - Litigator',
    'DO NOT CALL',
    'Hang-up',
    'Not Interested',
    'No Answer',
    'AIP Client',
    'Not Qualified',
    'Affordability',
    'Others'
  ];

  const getCategoryBadge = (category, completionPercentage = 0) => {
    const badges = {
      hot: 'bg-red-100 text-red-800 border-red-200',
      warm: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
      cold: 'bg-blue-100 text-blue-800 border-blue-200'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badges[category]}`}>
        {category.charAt(0).toUpperCase() + category.slice(1)} ({completionPercentage}%)
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : '';
    const badges = {
      new: 'bg-gray-100 text-gray-800',
      interested: 'bg-green-100 text-green-800',
      'not-interested': 'bg-red-100 text-red-800',
      successful: 'bg-emerald-100 text-emerald-800',
      'follow-up': 'bg-blue-100 text-blue-800',
      dead: 'bg-rose-100 text-rose-800'
    };

    const icons = {
      new: AlertCircle,
      interested: CheckCircle,
      'not-interested': XCircle,
      successful: CheckCircle,
      'follow-up': Clock,
      dead: XCircle
    };

    const Icon = icons[normalizedStatus] || AlertCircle; // Added fallback to prevent undefined
    const readableStatus = status
      ? status.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
      : 'Unknown';

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badges[normalizedStatus] || 'bg-gray-100 text-gray-800'}`}>
        <Icon className="w-3 h-3 mr-1" />
        {readableStatus}
      </span>
    );
  };

  const getQualificationBadge = (qualificationStatus) => {
    const badges = {
      qualified: 'bg-green-100 text-green-800 border-green-200',
      'not-qualified': 'bg-red-100 text-red-800 border-red-200',
      'disqualified': 'bg-red-100 text-red-800 border-red-200',
      'unqualified': 'bg-red-100 text-red-800 border-red-200',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200'
    };

    const icons = {
      qualified: CheckCircle,
      'not-qualified': XCircle,
      'disqualified': XCircle,
      'unqualified': XCircle,
      pending: Clock
    };

    const Icon = icons[qualificationStatus] || Clock;

    const labels = {
      qualified: 'Qualified',
      'not-qualified': 'Not - Qualified',
      'disqualified': 'Not - Qualified', // Display as "Not - Qualified" for consistency
      'unqualified': 'Not - Qualified', // Display as "Not - Qualified" for consistency
      pending: 'Pending'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badges[qualificationStatus] || badges.pending}`}>
        <Icon className="w-3 h-3 mr-1" />
        {labels[qualificationStatus] || 'Pending'}
      </span>
    );
  };

  const handleRefresh = () => {
    fetchStats(true);
  };

  // Stats are computed server-side. Derive qualificationRate from server values.
  const calculateRealTimeStats = useCallback(() => {
    if (!stats) return { qualificationRate: 0, conversionRate: 0 };
    const q = stats.qualifiedLeads || 0;
    const nq = stats.notQualifiedLeads || 0;
    const qualificationRate = (q + nq) > 0
      ? parseFloat(((q / (q + nq)) * 100).toFixed(1)) : 0;
    return {
      ...stats,
      qualificationRate,
      pendingLeads: stats.pendingLeads || 0,
      immediateEnrollmentLeads: stats.immediateEnrollmentLeads || 0
    };
  }, [stats]);

  // Get real-time stats - Memoized to prevent recalculation on every render
  // Must be called before any early returns (React Hooks rule)
  const realTimeStats = useMemo(() => {
    if (!stats) {
      return { qualificationRate: 0, conversionRate: 0 };
    }
    return calculateRealTimeStats();
  }, [calculateRealTimeStats, stats]);
  
  const qualificationRate = parseFloat(realTimeStats?.qualificationRate) || 0;

  // Apply search filter only (backend handles date/qualification/duplicate/org filters)
  // Search is client-side for immediate feedback as user types
  // Memoized to prevent recalculation when props don't change
  const displayLeads = useMemo(() => {
    return searchTerm.trim() ? searchResults : leads;
  }, [searchTerm, searchResults, leads]);

  if (loading) {
    return <LoadingSpinner message="Loading admin dashboard..." />;
  }

  if (!stats) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Unable to load dashboard data</p>
        <button 
          onClick={() => fetchStats()}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-4 px-3">
      <div className="w-full space-y-3">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 backdrop-blur-sm bg-opacity-95">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-lg">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
                  Admin Dashboard
                </h1>
                <p className="text-gray-600 text-xs">
                  Real-time lead management 
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Read-only
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Last Updated</p>
                <p className="text-xs font-semibold text-gray-700">
                  {formatEasternTimeForDisplay(lastUpdated, { includeTimezone: true })}
                </p>
              </div>
              {/* Website Leads button — Reddington org only */}
              {isReddingtonAdmin && (
                <button
                  onClick={() => { setShowWebsiteLeads(true); setWebsiteLeadsBadge(0); }}
                  className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md"
                  style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', boxShadow: '0 4px 12px rgba(8,145,178,0.4)' }}
                  title="View website form submissions"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                  </svg>
                  Website Leads
                  {websiteLeadsBadge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                      {websiteLeadsBadge > 99 ? '99+' : websiteLeadsBadge}
                    </span>
                  )}
                </button>
              )}
              {/* People Search PiP launcher — Reddington org only */}
              {isReddingtonAdmin && (
                <button
                  onClick={() => { setShowSearchPanel(true); setSearchMinimized(false); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md"
                  style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', boxShadow: '0 4px 12px rgba(239,68,68,0.4)' }}
                  title="Open US People Search panel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  People Search
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 group text-sm"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : 'group-hover:rotate-180'} transition-transform duration-500`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Total Leads Card */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 group-hover:from-blue-500 group-hover:to-blue-600 transition-all duration-300">
                <BarChart3 className="h-5 w-5 text-blue-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</p>
                <p className="text-xl font-bold text-gray-900">{realTimeStats.totalLeads}</p>
              </div>
            </div>
          </div>

          {/* Qualified Card */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-200 group-hover:from-emerald-500 group-hover:to-emerald-600 transition-all duration-300">
                <CheckCircle className="h-5 w-5 text-emerald-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Qualified</p>
                <div className="flex items-end gap-1">
                  <p className="text-xl font-bold text-gray-900">{realTimeStats.qualifiedLeads || 0}</p>
                  <span className="text-xs font-bold text-emerald-600">{qualificationRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Not Qualified Card */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-red-100 to-red-200 group-hover:from-red-500 group-hover:to-red-600 transition-all duration-300">
                <XCircle className="h-5 w-5 text-red-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Not Qualified</p>
                <p className="text-xl font-bold text-gray-900">{realTimeStats.notQualifiedLeads || 0}</p>
              </div>
            </div>
          </div>

          {/* Pending Card */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-100 to-amber-200 group-hover:from-amber-500 group-hover:to-amber-600 transition-all duration-300">
                <Clock className="h-5 w-5 text-amber-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending</p>
                <p className="text-xl font-bold text-gray-900">{realTimeStats.pendingLeads || 0}</p>
              </div>
            </div>
          </div>

          {/* Sale Card */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-green-100 to-green-200 group-hover:from-green-500 group-hover:to-green-600 transition-all duration-300">
                <TrendingUp className="h-5 w-5 text-green-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sale</p>
                <p className="text-xl font-bold text-gray-900">{realTimeStats.immediateEnrollmentLeads || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Inbound / Outbound Call Report ────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
          {/* Header / toggle */}
          <button
            onClick={() => {
              const next = !showCallReport;
              setShowCallReport(next);
              if (next && !callReport) fetchCallReport(callReportDate, callReportDid);
            }}
            className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-violet-50 to-purple-50 hover:from-violet-100 hover:to-purple-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg shadow">
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-800">Inbound / Outbound Call Report</p>
                <p className="text-xs text-gray-500">Daily breakdown — leads formed, transferred &amp; disposed</p>
              </div>
            </div>
            <svg className={`h-5 w-5 text-gray-400 transition-transform duration-300 ${showCallReport ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showCallReport && (
            <div className="p-5 space-y-4">
              {/* Controls */}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                  <input
                    type="date"
                    value={callReportDate}
                    onChange={e => setCallReportDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Search by DID / Phone</label>
                  <input
                    type="text"
                    value={callReportDid}
                    onChange={e => setCallReportDid(e.target.value)}
                    placeholder="e.g. 12092130555"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
                <button
                  onClick={() => fetchCallReport(callReportDate, callReportDid)}
                  disabled={callReportLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg disabled:opacity-50 transition-all"
                >
                  <RefreshCw className={`h-4 w-4 ${callReportLoading ? 'animate-spin' : ''}`} />
                  {callReportLoading ? 'Loading…' : 'Run Report'}
                </button>
              </div>

              {/* Results */}
              {callReport && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 font-medium">Report for: <span className="text-gray-800 font-semibold">{callReport.date}</span></p>

                  {/* Summary grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Inbound */}
                    <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">📥</span>
                        <span className="text-sm font-bold text-red-700">Inbound (GTI)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                          <p className="text-2xl font-bold text-red-600">{callReport.inbound.total}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Leads Formed</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                          <p className="text-2xl font-bold text-orange-500">{callReport.inbound.transferred}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Transferred</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                          <p className="text-2xl font-bold text-gray-600">{callReport.inbound.disposed}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Disposed</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                          <p className="text-2xl font-bold text-green-600">{callReport.inbound.sale}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Sale</p>
                        </div>
                      </div>
                    </div>

                    {/* Outbound */}
                    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">📤</span>
                        <span className="text-sm font-bold text-blue-700">Outbound / Manual</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                          <p className="text-2xl font-bold text-blue-600">{callReport.outbound.total}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Leads Formed</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                          <p className="text-2xl font-bold text-orange-500">{callReport.outbound.transferred}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Transferred</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                          <p className="text-2xl font-bold text-gray-600">{callReport.outbound.disposed}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Disposed</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 text-center shadow-sm">
                          <p className="text-2xl font-bold text-green-600">{callReport.outbound.sale}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Sale</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top DIDs table */}
                  {callReport.topDids && callReport.topDids.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-700 mb-2">Top Inbound DIDs (by volume)</p>
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">DID / Phone</th>
                              <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Leads</th>
                              <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Disposed</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {callReport.topDids.map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-mono text-gray-800">{row._id}</td>
                                <td className="px-4 py-2 text-center font-bold text-red-600">{row.count}</td>
                                <td className="px-4 py-2 text-center text-gray-600">{row.disposed}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!callReport && !callReportLoading && (
                <p className="text-sm text-gray-400 text-center py-4">Click "Run Report" to load data.</p>
              )}
            </div>
          )}
        </div>

        {/* Lead Management Toggle */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden backdrop-blur-sm bg-opacity-95">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 backdrop-blur-sm rounded-lg">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Lead Management</h3>
                  <p className="text-xs text-blue-100">
                    View all leads and agent actions
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white backdrop-blur-sm">
                      Read-only
                    </span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLeadsSection(!showLeadsSection)}
                className="px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-2 group text-sm"
              >
                <span>{showLeadsSection ? 'Hide Leads' : 'Show Leads'}</span>
                <svg 
                  className={`h-4 w-4 transition-transform duration-300 ${showLeadsSection ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar - Only for REDDINGTON GLOBAL CONSULTANCY admins */}
        {showLeadsSection && (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 backdrop-blur-sm bg-opacity-95">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg">
                <Search className="h-4 w-4 text-purple-600" />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search leads by name, phone, email, lead ID, or client ID..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 text-sm placeholder-gray-400"
                />
              </div>
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSearchResults([]);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {searchTerm && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-blue-500"></div>
                <p className="text-xs text-gray-600">
                  Found <span className="font-semibold text-blue-600">{searchResults.length}</span> lead{searchResults.length !== 1 ? 's' : ''} matching <span className="font-medium">"{searchTerm}"</span>
                </p>
              </div>
            )}
          </div>
        )}

      {/* Compact Filter Controls - ONLY FOR ADMIN */}
      {showLeadsSection && (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 backdrop-blur-sm bg-opacity-95 space-y-3">
          {/* Date Filter Row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <span className="text-xs font-semibold text-gray-700">Date:</span>
            </div>
            
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleDateFilterChange('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  dateFilter.filterType === 'all' 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                }`}
              >
                All
              </button>
              <button
                onClick={() => handleDateFilterChange('today')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  dateFilter.filterType === 'today' 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => handleDateFilterChange('week')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  dateFilter.filterType === 'week' 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => handleDateFilterChange('month')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  dateFilter.filterType === 'month' 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                }`}
              >
                30 Days
              </button>
            </div>

            <div className="flex items-center gap-2 ml-2 bg-gray-50 rounded-lg px-3 py-1.5">
              <span className="text-xs font-semibold text-gray-600">Custom:</span>
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) => handleDateFilterChange('custom', e.target.value, dateFilter.endDate)}
                className="px-2 py-1 text-xs border-2 border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              />
              <span className="text-xs text-gray-400 font-medium">to</span>
              <input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) => handleDateFilterChange('custom', dateFilter.startDate, e.target.value)}
                className="px-2 py-1 text-xs border-2 border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              />
            </div>
          </div>
          
          {/* Other Filters Row */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Qualification Filter */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-lg">
                <Target className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <span className="text-xs font-semibold text-gray-700">Qualification:</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setQualificationFilter('all');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    qualificationFilter === 'all' 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setQualificationFilter('qualified');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    qualificationFilter === 'qualified' 
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  Qualified
                </button>
                <button
                  onClick={() => {
                    setQualificationFilter('not-qualified');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    qualificationFilter === 'not-qualified' 
                      ? 'bg-gradient-to-r from-red-600 to-red-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  Not Qualified
                </button>
                <button
                  onClick={() => {
                    setQualificationFilter('pending');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    qualificationFilter === 'pending' 
                      ? 'bg-gradient-to-r from-amber-600 to-amber-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  Pending
                </button>
              </div>
            </div>
            
            {/* Progress Status Filter */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-green-100 to-green-200 rounded-lg">
                <TrendingUp className="h-3.5 w-3.5 text-green-600" />
              </div>
              <span className="text-xs font-semibold text-gray-700">Progress:</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setProgressFilter('all');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    progressFilter === 'all'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setProgressFilter('sale');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    progressFilter === 'sale'
                      ? 'bg-gradient-to-r from-green-600 to-green-600 text-white shadow-md scale-105'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  Sale
                </button>
                <button
                  onClick={() => {
                    setProgressFilter('callback');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    progressFilter === 'callback'
                      ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white shadow-md scale-105'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  Callback Needed
                </button>
              </div>
            </div>

            {/* Duplicate Status Filter */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-amber-100 to-amber-200 rounded-lg">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <span className="text-xs font-semibold text-gray-700">Dups:</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setDuplicateFilter('all');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    duplicateFilter === 'all' 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setDuplicateFilter('duplicates');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    duplicateFilter === 'duplicates' 
                      ? 'bg-gradient-to-r from-amber-600 to-amber-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  Dups Only
                </button>
                <button
                  onClick={() => {
                    setDuplicateFilter('non-duplicates');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    duplicateFilter === 'non-duplicates' 
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  Original
                </button>
              </div>
            </div>
            
            {/* Organization Filter */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg">
                <Users className="h-3.5 w-3.5 text-purple-600" />
              </div>
              <span className="text-xs font-semibold text-gray-700">Org:</span>
              <div className="flex gap-1.5 items-center">
                <button
                  onClick={() => {
                    setOrganizationFilter('all');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all duration-200 ${
                    organizationFilter === 'all' 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  All
                </button>
                {organizations.slice(0, 2).map((org) => (
                  <button
                    key={org._id}
                    onClick={() => {
                      setOrganizationFilter(org._id);
                      resetPaginationAndFetch();
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all duration-200 ${
                      organizationFilter === org._id 
                        ? 'bg-gradient-to-r from-purple-600 to-purple-600 text-white shadow-md scale-105' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                    }`}
                    title={org.name}
                  >
                    {org.name.length > 10 ? org.name.substring(0, 10) + '...' : org.name}
                  </button>
                ))}
                {organizations.length > 2 && (
                  <select
                    value={organizationFilter}
                    onChange={(e) => {
                      setOrganizationFilter(e.target.value);
                      resetPaginationAndFetch();
                    }}
                    className="px-2 py-1.5 text-xs font-semibold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                  >
                    <option value="all">All Orgs</option>
                    {organizations.map((org) => (
                      <option key={org._id} value={org._id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            
            {/* Export & Share Buttons - Only for Reddington Admin */}
            {isReddingtonAdmin && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setShowShareModal(true)}
                  className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold rounded-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-1.5"
                >
                  <Users size={14} />
                  <span>Share Data</span>
                </button>
                <button
                  onClick={handleExportLeads}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-600 text-white text-xs font-semibold rounded-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-1.5"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
              </div>
            )}
          </div>
          
          {/* Filter Summary */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <div className="text-xs font-semibold text-gray-700">
              Showing <span className="text-blue-600">{displayLeads.length}</span> of <span className="text-blue-600">{pagination.total}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {searchTerm && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  Search: "{searchTerm}"
                </span>
              )}
              {qualificationFilter !== 'all' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {qualificationFilter.charAt(0).toUpperCase() + qualificationFilter.slice(1)}
                </span>
              )}
              {duplicateFilter !== 'all' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  {duplicateFilter === 'duplicates' ? 'Dups Only' : 'Original Only'}
                </span>
              )}
              {organizationFilter !== 'all' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  {organizations.find(org => org._id === organizationFilter)?.name || 'Unknown'}
                </span>
              )}
              {dateFilter.filterType !== 'all' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                  {dateFilter.filterType === 'today' ? 'Today' :
                   dateFilter.filterType === 'week' ? '7 Days' :
                   dateFilter.filterType === 'month' ? '30 Days' :
                   dateFilter.filterType === 'custom' ? `${dateFilter.startDate} to ${dateFilter.endDate}` :
                   'All Time'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leads Section */}
      {showLeadsSection && (
        <div className="space-y-3 mb-4">
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden backdrop-blur-sm bg-opacity-95">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-3">
              <h3 className="text-lg font-bold text-white">All Leads</h3>
              <p className="text-xs text-indigo-100">Comprehensive view from Agent1 & Agent2</p>
            </div>
            
            {/* Optimized Card-Based Layout */}
            <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {displayLeads.map((lead) => (
                <div key={lead.leadId || lead._id} className={`group rounded-lg border transition-all duration-200 hover:shadow-lg ${!!(lead.vicidialDid && lead.vicidialDid.trim()) ? 'bg-gradient-to-r from-red-50 to-white border-red-200 border-l-4 border-l-red-500 hover:border-red-300' : 'bg-gradient-to-r from-blue-50 to-white border-blue-200 border-l-4 border-l-blue-500 hover:border-blue-300'}`}>
                  <div className="p-2.5">
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      {/* Lead Info - 2 columns */}
                      <div className="col-span-2">
                        <div className="flex items-center space-x-2">
                          <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow group-hover:scale-110 transition-transform duration-200">
                            <span className="text-white font-bold text-xs">
                              {lead.name ? lead.name.charAt(0).toUpperCase() : 'L'}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-900 truncate">{lead.name}</p>
                            {lead.leadId && (
                              <span className="inline-flex text-xs text-blue-600 font-mono bg-blue-50 px-1 rounded">
                                {lead.leadId}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* DID column - 1 column */}
                      <div className="col-span-1">
                        {!!(lead.vicidialDid && lead.vicidialDid.trim()) ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold border border-red-300">
                              📥 Inbound
                            </span>
                            <div className="font-mono text-[10px] text-red-600 truncate" title={`DID: ${lead.vicidialDid}`}>
                              {lead.vicidialDid}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-300" title="Outbound / Manual">
                            📤 Outbound
                          </span>
                        )}
                      </div>

                      {/* Contact - 2 columns */}
                      <div className="col-span-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-gray-700 truncate">
                            <svg className="h-3 w-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span className="truncate">{maskEmail(lead.email)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-600">
                            <svg className="h-3 w-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span>{maskPhone(lead.phone)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Org & Date - 2 columns */}
                      <div className="col-span-2">
                        <div className="space-y-1">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold truncate text-xs" title={lead.organization?.name || 'Unknown'}>
                            {lead.organization?.name ? 
                              (lead.organization.name.length > 8 ? lead.organization.name.substring(0, 8) + '...' : lead.organization.name) 
                              : 'Unknown'}
                          </span>
                          <div className="flex items-center gap-1 text-gray-500">
                            <Calendar className="h-3 w-3" />
                            <span>{formatEasternTimeForDisplay(lead.createdAt, { includeTime: false })}</span>
                          </div>
                        </div>
                      </div>

                      {/* Category & Status - 2.5 columns */}
                      <div className="col-span-3">
                        <div className="space-y-1">
                          {getCategoryBadge(lead.category, lead.completionPercentage)}
                          {getQualificationBadge(lead.qualificationStatus)}
                          {lead.isDuplicate ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                              ⚠️ Dup
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                              ✓ Orig
                            </span>
                          )}
                          {lead.isDisposed && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700">
                              Disposed
                            </span>
                          )}
                          {lead.disposition1 && (
                            <div className="text-xs text-rose-600 truncate" title={`Disposition: ${lead.disposition1}`}>
                              Reason: {lead.disposition1}
                            </div>
                          )}
                          {(lead.disposedBy || lead.draftDate) && (
                            <div className="text-[11px] text-gray-500 space-y-0.5">
                              {lead.disposedBy && (
                                <div title={`Disposed by ${formatDisposedByLabel(lead.disposedBy)}`}>
                                  By {formatDisposedByLabel(lead.disposedBy)}
                                </div>
                              )}
                              {lead.draftDate && (
                                <div>
                                  Draft Date: {formatDraftDate(lead.draftDate)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Agent Status - 2 columns */}
                      <div className="col-span-2">
                        {lead.leadProgressStatus ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-teal-100 to-teal-200 text-teal-800 truncate" title={lead.leadProgressStatus}>
                            {lead.leadProgressStatus.length > 12 ? lead.leadProgressStatus.substring(0, 12) + '...' : lead.leadProgressStatus}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-xs">No status</span>
                        )}
                        {lead.clientId && (
                          <div className="mt-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-mono text-xs truncate" title={`Client ID: ${lead.clientId}`}>
                              ID: {lead.clientId}
                            </span>
                          </div>
                        )}
                        {isReddingtonAdmin && lead.lastUpdatedBy && (
                          <div className="text-xs text-gray-500 truncate">
                            by {lead.lastUpdatedBy}
                          </div>
                        )}
                      </div>

                      {/* Actions - 1.5 columns */}
                      <div className="col-span-1">
                        <div className="flex flex-col space-y-1">
                          <button
                            onClick={() => openViewModal(lead)}
                            className="w-full text-blue-600 hover:text-white bg-blue-50 hover:bg-gradient-to-r hover:from-blue-600 hover:to-indigo-600 px-2 py-1 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1"
                          >
                            {isReddingtonAdmin ? (
                              <>
                                <Edit3 className="h-3 w-3" />
                                Edit
                              </>
                            ) : (
                              'View'
                            )}
                          </button>
                          
                          {isReddingtonAdmin && (
                            <button
                              onClick={() => openReassignModal(lead)}
                              className="w-full text-purple-600 hover:text-white bg-purple-50 hover:bg-gradient-to-r hover:from-purple-600 hover:to-purple-600 px-2 py-1 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1"
                              title="Reassign"
                            >
                              <UserCheck className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {displayLeads.length === 0 && (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                  <div className="text-gray-500">
                    <div className="mx-auto h-16 w-16 text-gray-300 mb-4">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-xl font-bold text-gray-900 mb-2">No leads found</p>
                    <p className="text-gray-500">No leads match your current filter criteria.</p>
                  </div>
                </div>
              )}
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
        </div>
      )}

      {/* View Lead Details Modal */}
      {showViewModal && selectedLead && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div 
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={closeViewModal}
              ></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      {isReddingtonAdmin && isEditing ? 'Edit Lead' : 'Lead Details'}: {selectedLead.name}
                    </h3>
                    <p className="text-blue-100 text-sm">
                      {isReddingtonAdmin && isEditing ? 'Modify lead information and status' : 'Complete lead information and tracking'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isReddingtonAdmin && (
                      <>
                        {isEditing ? (
                          <>
                            <button
                              onClick={handleLeadUpdate}
                              disabled={isUpdating}
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                              {isUpdating ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={handleEditToggle}
                            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                          >
                            <Edit3 className="h-4 w-4" />
                            Edit
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={closeViewModal}
                      className="text-white hover:text-blue-200 transition-colors"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white px-6 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Personal Information */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-5 rounded-xl border border-gray-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-blue-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Personal Information</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Name:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="text"
                            value={editedLead.name || ''}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            className="text-sm text-gray-900 font-medium text-right border border-gray-300 rounded px-2 py-1 w-32"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 font-medium text-right">{selectedLead.name || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Email:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="email"
                            value={editedLead.email || ''}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-40"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right break-all">{selectedLead.email || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Phone:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="tel"
                            value={editedLead.phone || ''}
                            onChange={(e) => handleInputChange('phone', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.phone || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Alt. Phone:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="tel"
                            value={editedLead.alternatePhone || ''}
                            onChange={(e) => handleInputChange('alternatePhone', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.alternatePhone || '—'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Address Information */}
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-xl border border-green-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-green-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Address Information</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Address:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <textarea
                            value={editedLead.address || ''}
                            onChange={(e) => handleInputChange('address', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-40 h-16 resize-none"
                            placeholder="Enter address"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right max-w-xs">{selectedLead.address || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">City:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="text"
                            value={editedLead.city || ''}
                            onChange={(e) => handleInputChange('city', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="Enter city"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.city || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">State:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="text"
                            value={editedLead.state || ''}
                            onChange={(e) => handleInputChange('state', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-24"
                            placeholder="Enter state"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.state || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Zipcode:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="text"
                            value={editedLead.zipcode || ''}
                            onChange={(e) => handleInputChange('zipcode', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-24"
                            placeholder="Enter zipcode"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.zipcode || '—'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Debt Information */}
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-xl border border-purple-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-purple-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Debt Information</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Category:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <select
                            value={editedLead.debtCategory || editedLead.category || ''}
                            onChange={(e) => handleInputChange('debtCategory', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-24"
                          >
                            <option value="">Select</option>
                            <option value="hot">Hot</option>
                            <option value="warm">Warm</option>
                            <option value="cold">Cold</option>
                          </select>
                        ) : (
                          <span className="text-sm text-gray-900 text-right capitalize">{selectedLead.debtCategory || selectedLead.category || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Source:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="text"
                            value={editedLead.source || ''}
                            onChange={(e) => handleInputChange('source', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="Lead source"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.source || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Total Amount:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="number"
                            value={editedLead.totalDebtAmount || ''}
                            onChange={(e) => handleInputChange('totalDebtAmount', parseInt(e.target.value) || 0)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right font-semibold">
                            {selectedLead.totalDebtAmount ? `$${selectedLead.totalDebtAmount.toLocaleString()}` : '—'}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Creditors:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="number"
                            value={editedLead.numberOfCreditors || ''}
                            onChange={(e) => handleInputChange('numberOfCreditors', parseInt(e.target.value) || 0)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-20"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.numberOfCreditors || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Monthly Payment:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="number"
                            value={editedLead.monthlyDebtPayment || ''}
                            onChange={(e) => handleInputChange('monthlyDebtPayment', parseInt(e.target.value) || 0)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">
                            {selectedLead.monthlyDebtPayment ? `$${selectedLead.monthlyDebtPayment.toLocaleString()}` : '—'}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Credit Score:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <select
                            value={editedLead.creditScoreRange || ''}
                            onChange={(e) => handleInputChange('creditScoreRange', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                          >
                            <option value="">Select Range</option>
                            <option value="Poor (300-579)">Poor (300-579)</option>
                            <option value="Fair (580-669)">Fair (580-669)</option>
                            <option value="Good (670-739)">Good (670-739)</option>
                            <option value="Very Good (740-799)">Very Good (740-799)</option>
                            <option value="Excellent (800-850)">Excellent (800-850)</option>
                          </select>
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.creditScoreRange || '—'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-gradient-to-br from-indigo-50 to-indigo-100 p-5 rounded-xl border border-indigo-200">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">GTI Workflow Snapshot</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-600">Disposition Status:</span>
                      <p className={`mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${selectedLead.isDisposed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {selectedLead.isDisposed ? 'Disposed' : 'Active'}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">Disposition Reason:</span>
                      <p className="mt-1 text-sm text-gray-900 break-words">{selectedLead.disposition1 || '—'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">Disposed By:</span>
                      <p className="mt-1 text-sm text-gray-900">{formatDisposedByLabel(selectedLead.disposedBy)}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">Draft Date:</span>
                      <p className="mt-1 text-sm text-gray-900">{formatDraftDate(selectedLead.draftDate)}</p>
                    </div>
                  </div>
                </div>

                {/* Management & Status Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  {/* Management Information */}
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-5 rounded-xl border border-orange-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-orange-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Management Info</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Created By:</span>
                        <span className="text-sm text-gray-900 text-right font-medium">{selectedLead.createdBy?.name || '—'}</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Created At:</span>
                        <span className="text-sm text-gray-900 text-right">
                          {selectedLead.createdAt ? new Date(selectedLead.createdAt).toLocaleDateString() : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Category:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <select
                            value={editedLead.category || ''}
                            onChange={(e) => handleInputChange('category', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-24"
                          >
                            <option value="">Select</option>
                            <option value="hot">Hot</option>
                            <option value="warm">Warm</option>
                            <option value="cold">Cold</option>
                          </select>
                        ) : (
                          <div className="text-right">{getCategoryBadge(selectedLead.category, selectedLead.completionPercentage)}</div>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Qualification:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <div className="text-right">
                            <select
                              value={editedLead.qualificationStatus || ''}
                              onChange={(e) => handleInputChange('qualificationStatus', e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                            >
                              <option value="">Select Status</option>
                              <option value="qualified">Qualified</option>
                              <option value="not-qualified">Not - Qualified</option>
                              <option value="pending">Pending</option>
                            </select>
                            <div className="text-xs text-blue-600 italic mt-1">Independent from Lead Progress</div>
                          </div>
                        ) : (
                          <div className="text-right">{getQualificationBadge(selectedLead.qualificationStatus)}</div>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Status:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <select
                            value={editedLead.status || ''}
                            onChange={(e) => handleInputChange('status', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                          >
                            {/* <option value="">Select Status</option>
                            <option value="new">New</option>
                            <option value="interested">Interested</option>
                            <option value="not-interested">Not Interested</option>
                            <option value="successful">Successful</option>
                            <option value="follow-up">Follow-up</option> */}
                          </select>
                        ) : (
                          <div className="text-right">{getStatusBadge(selectedLead.status)}</div>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        {/* <span className="text-sm font-medium text-gray-600">Company:</span> */}
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="text"
                            value={editedLead.company || ''}
                            onChange={(e) => handleInputChange('company', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="Company name"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.company || ''}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        {/* <span className="text-sm font-medium text-gray-600">Completion %:</span> */}
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            // type="number"
                            // min="0"
                            // max="100"
                            // value={editedLead.completionPercentage || ''}
                            // onChange={(e) => handleInputChange('completionPercentage', parseInt(e.target.value) || 0)}
                            // className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-20"
                            // placeholder=""
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right"></span>
                        )}
                      </div>
                      {isReddingtonAdmin && selectedLead.lastUpdatedBy && (
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-600">Updated By:</span>
                          <span className="text-sm text-green-700 text-right font-medium">{selectedLead.lastUpdatedBy}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Agent2 Status Tracking */}
                  <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-5 rounded-xl border border-teal-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-teal-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Agent2 Actions & Status</h4>
                      {isReddingtonAdmin && isEditing && (
                        <p className="text-xs text-blue-600 italic">Note: Lead Progress Status and Qualification Status are independent fields</p>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="bg-white p-3 rounded-lg border border-teal-200">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-600">Lead Progress Status:</span>
                          {isReddingtonAdmin && isEditing ? (
                            <select
                              value={editedLead.leadProgressStatus || ''}
                              onChange={(e) => handleInputChange('leadProgressStatus', e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 w-48"
                            >
                              <option value="">Select Status</option>
                              {leadProgressOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            selectedLead.leadProgressStatus ? (
                              <span className="text-sm bg-teal-100 text-teal-800 px-2 py-1 rounded-full font-medium text-right max-w-xs">
                                {selectedLead.leadProgressStatus}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500 italic">No status update yet</span>
                            )
                          )}
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Follow-up Date:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="date"
                            value={editedLead.followUpDate ? new Date(editedLead.followUpDate).toISOString().split('T')[0] : ''}
                            onChange={(e) => handleInputChange('followUpDate', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">
                            {selectedLead.followUpDate ? new Date(selectedLead.followUpDate).toLocaleDateString() : '—'}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Follow-up Time:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="time"
                            value={editedLead.followUpTime || ''}
                            onChange={(e) => handleInputChange('followUpTime', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">
                            {selectedLead.followUpTime || '—'}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Client ID:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="text"
                            value={editedLead.clientId || ''}
                            onChange={(e) => handleInputChange('clientId', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-40 font-mono"
                            placeholder="e.g. ABC123"
                          />
                        ) : (
                          <span className="text-sm text-green-700 font-mono font-semibold text-right">
                            {selectedLead.clientId || '—'}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Conversion Value:</span>
                        {isReddingtonAdmin && isEditing ? (
                          <input
                            type="number"
                            value={editedLead.conversionValue || ''}
                            onChange={(e) => handleInputChange('conversionValue', parseInt(e.target.value) || 0)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-sm text-green-600 text-right font-semibold">
                            {selectedLead.conversionValue ? `$${selectedLead.conversionValue.toLocaleString()}` : '—'}
                          </span>
                        )}
                      </div>
                      
                      {isReddingtonAdmin && selectedLead.lastUpdatedBy && (
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-600">Last Updated By:</span>
                          <span className="text-sm text-teal-700 text-right font-medium">{selectedLead.lastUpdatedBy}</span>
                        </div>
                      )}
                      
                      {selectedLead.lastUpdatedAt && (
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-600">Last Updated At:</span>
                          <span className="text-sm text-gray-900 text-right">
                            {formatEasternTimeForDisplay(selectedLead.lastUpdatedAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes & Comments Section */}
                <div className="mt-6">
                  <div className="bg-gradient-to-r from-gray-100 to-gray-200 p-4 rounded-xl">
                    <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <svg className="h-5 w-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Notes & Comments
                    </h4>
                    
                    <div className="space-y-4">
                      {/* Agent1 Notes */}
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <div className="flex items-center mb-2">
                          <span className="text-sm font-semibold text-blue-800">Agent1 Notes:</span>
                        </div>
                        {isReddingtonAdmin && isEditing ? (
                          <textarea
                            value={editedLead.notes || ''}
                            onChange={(e) => handleInputChange('notes', e.target.value)}
                            className="w-full text-sm text-gray-900 border border-blue-300 rounded px-3 py-2 h-20 resize-none"
                            placeholder="Enter Agent1 notes..."
                          />
                        ) : (
                          <p className="text-sm text-gray-900 leading-relaxed">{selectedLead.notes || 'No notes available'}</p>
                        )}
                      </div>
                      
                      {/* Assignment Notes */}
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <div className="flex items-center mb-2">
                          <span className="text-sm font-semibold text-purple-800">Assignment Notes:</span>
                        </div>
                        {isReddingtonAdmin && isEditing ? (
                          <textarea
                            value={editedLead.assignmentNotes || ''}
                            onChange={(e) => handleInputChange('assignmentNotes', e.target.value)}
                            className="w-full text-sm text-gray-900 border border-purple-300 rounded px-3 py-2 h-20 resize-none"
                            placeholder="Enter assignment notes..."
                          />
                        ) : (
                          <p className="text-sm text-gray-900 leading-relaxed">{selectedLead.assignmentNotes || 'No assignment notes available'}</p>
                        )}
                      </div>
                      
                      {/* Agent2 Follow-up Notes */}
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <div className="flex items-center mb-2">
                          <span className="text-sm font-semibold text-green-800">Agent2 Follow-up Notes:</span>
                        </div>
                        {isReddingtonAdmin && isEditing ? (
                          <textarea
                            value={editedLead.followUpNotes || ''}
                            onChange={(e) => handleInputChange('followUpNotes', e.target.value)}
                            className="w-full text-sm text-gray-900 border border-green-300 rounded px-3 py-2 h-20 resize-none"
                            placeholder="Enter follow-up notes..."
                          />
                        ) : (
                          <p className="text-sm text-gray-900 leading-relaxed">{selectedLead.followUpNotes || 'No follow-up notes available'}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-3 flex justify-end">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lead Reassignment Modal */}
      <LeadReassignModal
        isOpen={showReassignModal}
        onClose={closeReassignModal}
        lead={leadToReassign}
        onLeadReassigned={handleLeadReassigned}
      />

      {/* User Management — Reddington admin only, collapsible */}
      {isReddingtonAdmin && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Accordion header */}
          <button
            onClick={() => setUserMgmtOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-50 to-white hover:from-indigo-100 transition-colors duration-200 border-b border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="text-left">
                <h2 className="text-base font-bold text-gray-900">User Management</h2>
                <p className="text-xs text-gray-500">{isReddingtonAdmin ? 'Super control — all organisations' : 'Manage agent accounts and permissions'}</p>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${userMgmtOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {/* Collapsible body */}
          {userMgmtOpen && (
            <div className="p-5">
              {isReddingtonAdmin ? <SuperUserManagement /> : <AgentManagement />}
            </div>
          )}
        </div>
      )}

      {/* Organisation Management — Reddington admin only, collapsible */}
      {isReddingtonAdmin && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Accordion header */}
          <button
            onClick={() => setOrgMgmtOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-50 to-white hover:from-blue-100 transition-colors duration-200 border-b border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-blue-600">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="text-left">
                <h2 className="text-base font-bold text-gray-900">Organisation Management</h2>
                <p className="text-xs text-gray-500">Create, edit and manage all organisations</p>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${orgMgmtOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {/* Collapsible body */}
          {orgMgmtOpen && (
            <div className="p-5">
              <OrganizationManagement />
            </div>
          )}
        </div>
      )}

      {/* Admin Upload Share Modal */}
      <AdminUploadShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />

      {/* Website Leads Modal — Reddington admin only */}
      {isReddingtonAdmin && showWebsiteLeads && (
        <WebsiteLeadsModal onClose={() => setShowWebsiteLeads(false)} />
      )}
      </div>

      {/* Floating People Search PiP Panel — Reddington org only */}
      {isReddingtonAdmin && showSearchPanel && (
        <div className="fixed z-[9999] rounded-xl overflow-hidden shadow-2xl border border-gray-300 flex flex-col" style={{ left: panelPos.x, top: panelPos.y, width: 480, height: searchMinimized ? 'auto' : 520 }}>
          <div onMouseDown={handlePanelDragStart} className="flex items-center justify-between px-3 py-2 text-white text-sm font-bold select-none cursor-move flex-shrink-0" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
              US People Search
              <span className="text-[10px] font-normal opacity-75">(drag to move)</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setSearchMinimized(p => !p)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 transition-colors" title={searchMinimized ? 'Expand' : 'Minimise'}>
                {searchMinimized ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>}
              </button>
              <a href="https://uspeoplesearch.net/" target="_blank" rel="noopener noreferrer" className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 transition-colors" title="Open in full tab">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
              <button onClick={() => setShowSearchPanel(false)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 transition-colors" title="Close">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          {!searchMinimized && (
            <iframe src="https://uspeoplesearch.net/" title="US People Search" className="flex-1 w-full bg-white" style={{ border: 'none', height: 472 }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

