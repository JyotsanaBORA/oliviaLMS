import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  X,
  Download,
  UserCheck,
  TrendingUp,
  Database,
  Zap,
  PhoneCall,
  PhoneIncoming,
  Globe,
  Activity
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StatusBadge from '../components/common/StatusBadge';
import AgentManagement from '../components/users/AgentManagement';
import CrossOrgUserManagement from '../components/users/CrossOrgUserManagement';
import OrganizationManagement from './OrganizationManagement';
import LeadReassignModal from '../components/modals/LeadReassignModal';
import AdminUploadShareModal from '../components/modals/AdminUploadShareModal';
import DataVendorShareModal from '../components/modals/DataVendorShareModal';
import ManualSaleModal from '../components/modals/ManualSaleModal';
import WebsiteLeadsModal from '../components/modals/WebsiteLeadsModal';
import BenWebsiteLeadsModal from '../components/modals/BenWebsiteLeadsModal';
import LoopLeadsModal from '../components/modals/LoopLeadsModal';
import InboundDataModal from '../components/modals/InboundDataModal';
import LeadDetailsModal from '../components/modals/LeadDetailsModal';
import Pagination from '../components/common/Pagination';
import ClientPortalsDropdown from '../features/organization/components/ClientPortalsDropdown';
import DidBreakdownTable from '../features/organization/components/DidBreakdownTable';
import { hasOrgFeature } from '../features/organization/utils/orgPermissions';
import { getDidAliasMap, getDidAlias } from '../utils/didUtils';
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
  const navigate = useNavigate();
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

  // DID / Channel Segregation state for Jake / Team 1 and multi-DID orgs
  const [selectedDidTab, setSelectedDidTab] = useState('all');
  const didFilterRef = useRef('all');

  // Add organization filter
  const [organizationFilter, setOrganizationFilter] = useState('all'); // 'all' or specific organization ID
  const [organizations, setOrganizations] = useState([]); // List of all organizations
  
  // Add traffic type filter (inbound / outbound)
  const [trafficTypeFilter, setTrafficTypeFilter] = useState('all'); // 'all', 'inbound', 'outbound'
  
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
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showManualSaleModal, setShowManualSaleModal] = useState(false);

  // Website leads modal (Reddington admin only)
  const [showWebsiteLeads, setShowWebsiteLeads] = useState(false);
  const [websiteLeadsBadge, setWebsiteLeadsBadge] = useState(0);
  const [showWebsiteLeadPopup, setShowWebsiteLeadPopup] = useState(false);
  const [latestWebsiteLead, setLatestWebsiteLead] = useState(null);
  const websiteLeadTotalRef = useRef(null);
  const alertTimerRef = useRef(null);       // 10-min auto-clear timer
  const alertStartTimeRef = useRef(null);   // When the current alert epoch started

  // Ben Website Leads modal (any admin)
  const [showBenWebsiteLeads, setShowBenWebsiteLeads] = useState(false);
  const [benLeadsBadge, setBenLeadsBadge] = useState(0);
  const benLeadTotalRef = useRef(null);

  // TruClick Leads modal
  const [showTruClickLeads, setShowTruClickLeads] = useState(false);
  const [truClickBadge, setTruClickBadge] = useState(0);

  // Westlake Leads modal
  const [showWestlakeLeads, setShowWestlakeLeads] = useState(false);
  const [westlakeLeadsBadge, setWestlakeLeadsBadge] = useState(0);

  // Social Up Leads modal
  const [showSocialUpLeads, setShowSocialUpLeads] = useState(false);
  const [socialUpLeadsBadge, setSocialUpLeadsBadge] = useState(0);

  // Jake 2 Leads modal
  const [showJake2Leads, setShowJake2Leads] = useState(false);
  const [jake2Badge, setJake2Badge] = useState(0);

  // Dynamic Vendor Leads portal modal & badges
  const [activeVendorPortalOrg, setActiveVendorPortalOrg] = useState(null);
  const [portalBadges, setPortalBadges] = useState({});

  // Loop leads modal (orgs with showLoopLeads === true)
  const [showLoopLeads, setShowLoopLeads] = useState(false);
  const [loopLeadsBadge, setLoopLeadsBadge] = useState(0);

  // Inbound Calls modal (all admins)
  const [showInboundDataModal, setShowInboundDataModal] = useState(false);
  const [inboundCallsBadge, setInboundCallsBadge] = useState(0);
  
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
    if (disposedBy.name) {
      return disposedBy.role ? `${disposedBy.name} (${disposedBy.role})` : disposedBy.name;
    }
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







  const fetchStats = useCallback(async (silent = false, specificDid = null) => {
    if (!silent) {
      setRefreshing(true);
    }
    
    try {
      const activeDid = specificDid !== null ? specificDid : didFilterRef.current;
      let url = `/api/leads/dashboard/stats?_t=${Date.now()}`;
      if (activeDid && activeDid !== 'all') {
        url += `&did=${encodeURIComponent(activeDid)}`;
      }
      const response = await axios.get(url);
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
      }
      setLoading(false);
    }
  }, []);

  // Request deduplication - prevent multiple identical API calls
  const pendingRequestsRef = useRef(new Map());
  
  // Use refs to hold current filter values to avoid recreating fetchLeads
  const paginationRef = useRef(pagination);
  const filtersRef = useRef({ qualificationFilter, duplicateFilter, organizationFilter, dateFilter, progressFilter, searchTerm, did: selectedDidTab, trafficType: trafficTypeFilter });
  
  // Update refs when values change
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);
  
  useEffect(() => {
    filtersRef.current = { qualificationFilter, duplicateFilter, organizationFilter, dateFilter, progressFilter, searchTerm, did: selectedDidTab, trafficType: trafficTypeFilter };
  }, [qualificationFilter, duplicateFilter, organizationFilter, dateFilter, progressFilter, searchTerm, selectedDidTab, trafficTypeFilter]);

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

      // Add DID filter for channel segregation (Live Transfer vs Inbound Calls)
      if (filters.did && filters.did !== 'all') {
        url += `&did=${encodeURIComponent(filters.did)}`;
      }

      // Add traffic type filter (inbound / outbound)
      if (filters.trafficType && filters.trafficType !== 'all') {
        url += `&trafficType=${filters.trafficType}`;
      }

      // Add search query - backend searches across all leads in the database
      if (filters.searchTerm && filters.searchTerm.trim()) {
        url += `&search=${encodeURIComponent(filters.searchTerm.trim())}`;
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
      await Promise.all([fetchStats(false, selectedDidTab), fetchOrganizations()]);
      
      if (showLeadsSection) {
        fetchLeads();
      }
    };

    initializeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLeadsSection, qualificationFilter, duplicateFilter, organizationFilter, dateFilter, progressFilter, selectedDidTab]);

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

      // Add DID filter for channel-segregated export
      if (selectedDidTab && selectedDidTab !== 'all') {
        params.append('did', selectedDidTab);
      }

      // Add traffic type filter
      if (trafficTypeFilter !== 'all') {
        params.append('trafficType', trafficTypeFilter);
      }



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

  // True when the current user is an admin of Westlake Origination Center
  const isWestlakeAdmin = useMemo(() => {
    const orgName = (user?.organization?.name || '').trim().toLowerCase();
    const orgId = user?.organization?._id || user?.organization;
    return user?.role === 'admin' && (orgName.includes('westlake') || String(orgId) === '6a99733c2ea3d7d9c3927bf0');
  }, [user]);

  // True when the current user is an admin of Social Up Media LLC (Jake 1)
  const isSocialUpAdmin = useMemo(() => {
    const orgName = (user?.organization?.name || '').trim().toLowerCase();
    const orgId = String(user?.organization?._id || user?.organization || '');
    if (
      orgId === '6aa03313a396c53fdf24e16f' || orgId === '6aa825d0de03dd4a4e976381' || orgId === '6aa825f973457be744ec45ea' ||
      orgName.includes('2') || orgName.includes('3') || orgName.includes('4') ||
      orgName.includes('jake2') || orgName.includes('jake3') || orgName.includes('jake4')
    ) {
      return false;
    }
    return user?.role === 'admin' && (orgName === 'social up media llc' || orgName === 'social up media' || orgName === 'social up' || orgName === 'socialup media' || orgName === 'socialup' || orgId === '6a99ddd7cea428c97ea29bdb');
  }, [user]);

  // True when the current user is an admin of Socialupmedia 2 / Jake 2
  const isJake2Admin = useMemo(() => {
    const orgName = (user?.organization?.name || '').trim().toLowerCase();
    const orgId = String(user?.organization?._id || user?.organization || '');
    return user?.role === 'admin' && (orgName.includes('socialupmedia 2') || orgName.includes('social up media 2') || orgName.includes('socialup 2') || orgName.includes('jake2') || orgId === '6aa03313a396c53fdf24e16f');
  }, [user]);

  // True when the current user's organisation has showLoopLeads enabled
  const isLoopLeadsAdmin = useMemo(() => {
    if (user?.role === 'superadmin') return true;
    return user?.organization?.showLoopLeads === true;
  }, [user]);

  const isSubAgent = useMemo(() => {
    return user?.role === 'sub_agent' || user?.role === 'vendor_agent';
  }, [user]);

  // DID alias lookup map
  const didAliasMap = useMemo(() => {
    return getDidAliasMap(user?.organization?.didAliases);
  }, [user]);

  // DIDs assigned to the current admin's organisation, Jake 1, or Sub-Agent
  const orgDids = useMemo(() => {
    if (isSubAgent) {
      const assigned = Array.isArray(user?.assignedDids) ? user.assignedDids.map(d => String(d).trim()).filter(Boolean) : [];
      return {
        liveTransferDid: null,
        liveTransferDids: [],
        inboundCallsDid: null,
        inboundCallsDids: [],
        loanFlipDid: null,
        loanFlipDids: [],
        allDids: assigned,
        didAliases: didAliasMap,
        hasMultiple: assigned.length > 1
      };
    }
    const org = user?.organization;
    const isSocialUp = isSocialUpAdmin;

    const ltArr = Array.isArray(org?.liveTransferDids) && org.liveTransferDids.length > 0
      ? org.liveTransferDids
      : (org?.liveTransferDid ? [org.liveTransferDid] : (isSocialUp ? ['19162330004'] : []));
    const inArr = Array.isArray(org?.inboundCallsDids) && org.inboundCallsDids.length > 0
      ? org.inboundCallsDids
      : (org?.inboundCallsDid ? [org.inboundCallsDid] : (isSocialUp ? ['19162330139'] : []));
    const lfArr = Array.isArray(org?.loanFlipDids) && org.loanFlipDids.length > 0
      ? org.loanFlipDids
      : (org?.loanFlipDid ? [org.loanFlipDid] : []);

    const ltDid = ltArr[0] || null;
    const inDid = inArr[0] || null;
    const lfDid = lfArr[0] || null;

    const rawDids = [
      ...(isSocialUp ? ['19162330004', '19162330139'] : []),
      ...ltArr,
      ...inArr,
      ...lfArr,
      ...(Array.isArray(org?.inboundDids) ? org.inboundDids : [])
    ];
    const allDids = Array.from(new Set(rawDids.map(d => String(d).trim()))).filter(Boolean);

    return {
      liveTransferDid: ltDid,
      liveTransferDids: ltArr,
      inboundCallsDid: inDid,
      inboundCallsDids: inArr,
      loanFlipDid: lfDid,
      loanFlipDids: lfArr,
      allDids,
      didAliases: didAliasMap,
      hasMultiple: Boolean(isSocialUp || allDids.length > 1 || (ltDid && inDid) || lfDid)
    };
  }, [user, isSocialUpAdmin, isSubAgent, didAliasMap]);

  const handleDidTabChange = (tabValue) => {
    setSelectedDidTab(tabValue);
    didFilterRef.current = tabValue;
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchStats(false, tabValue);
    if (showLeadsSection) {
      // Trigger fetchLeads with updated tab
      setTimeout(() => fetchLeads(false, 1), 50);
    }
  };

  // MyDebt Review access: orgs with showLoopLeads OR main-organization admin.
  const canAccessLoopLeads = isLoopLeadsAdmin || isReddingtonAdmin;

  // Clear the alert state and cancel any running timer.
  const clearWebsiteLeadAlert = useCallback(() => {
    setWebsiteLeadsBadge(0);
    setShowWebsiteLeadPopup(false);
    if (alertTimerRef.current) {
      clearTimeout(alertTimerRef.current);
      alertTimerRef.current = null;
    }
    alertStartTimeRef.current = null;
  }, []);

  const openWebsiteLeadsModal = useCallback(() => {
    setShowWebsiteLeads(true);
    clearWebsiteLeadAlert();
  }, [clearWebsiteLeadAlert]);

  // Start (or extend) the 10-minute auto-dismiss timer whenever the badge becomes > 0.
  // The ONLY two ways the alert can clear are:
  //   1. Admin opens Website Leads (clearWebsiteLeadAlert via openWebsiteLeadsModal)
  //   2. 10 minutes elapse since the first unacknowledged lead arrived
  useEffect(() => {
    if (!isReddingtonAdmin || websiteLeadsBadge === 0) return;

    // If a timer is already running, leave it – don't reset to a later deadline.
    if (alertTimerRef.current) return;

    alertStartTimeRef.current = Date.now();
    alertTimerRef.current = setTimeout(() => {
      alertTimerRef.current = null;
      alertStartTimeRef.current = null;
      setWebsiteLeadsBadge(0);
      setShowWebsiteLeadPopup(false);
    }, 10 * 60 * 1000); // 10 minutes
  }, [isReddingtonAdmin, websiteLeadsBadge]);

  // Fallback detector: compare current website-lead total with last known total.
  // This guarantees alerts even if a socket event is missed.
  const syncWebsiteLeadsAlert = useCallback(async ({ silent = true } = {}) => {
    if (!isReddingtonAdmin) return;
    try {
      const res = await axios.get('/api/website-leads?page=1&limit=1');
      const nextTotal = Number(res.data?.summary?.total || 0);

      // First sync only sets baseline; no alert for historical leads.
      if (websiteLeadTotalRef.current === null) {
        websiteLeadTotalRef.current = nextTotal;
        return;
      }

      if (nextTotal > websiteLeadTotalRef.current) {
        const delta = nextTotal - websiteLeadTotalRef.current;
        setWebsiteLeadsBadge(n => n + delta);
        setLatestWebsiteLead({
          name: delta === 1 ? '1 new website lead' : `${delta} new website leads`,
          source: 'website'
        });
        setShowWebsiteLeadPopup(true);
        toast.success(`${delta} new website ${delta === 1 ? 'lead' : 'leads'} received`, {
          duration: 5000,
          icon: '🌐'
        });
      }

      websiteLeadTotalRef.current = nextTotal;
    } catch (err) {
      if (!silent) {
        console.error('Website leads summary sync failed:', err);
      }
    }
  }, [isReddingtonAdmin]);

  useEffect(() => {
    if (!isReddingtonAdmin) return;
    syncWebsiteLeadsAlert({ silent: true });
    const interval = setInterval(() => {
      syncWebsiteLeadsAlert({ silent: true });
    }, 15000);
    return () => clearInterval(interval);
  }, [isReddingtonAdmin, syncWebsiteLeadsAlert]);

  // Admin-only alert state for browser tab title + top header color in Layout.
  // Cycles through attention-grabbing tab titles while badge is non-zero.
  useEffect(() => {
    if (!isReddingtonAdmin) return;
    const hasUnread = websiteLeadsBadge > 0;
    if (!hasUnread) {
      document.title = 'Lead Management System';
      window.dispatchEvent(new CustomEvent('adminWebsiteLeadAlert', { detail: { active: false } }));
      return;
    }

    window.dispatchEvent(new CustomEvent('adminWebsiteLeadAlert', { detail: { active: true } }));

    const TITLES = [
      '🚨 NEW WEBSITE LEAD!',
      '⚠️ Lead Management System',
      '🔴 NEW WEBSITE LEAD!',
      '⚡ Lead Management System',
    ];
    let idx = 0;
    document.title = TITLES[0];
    const interval = setInterval(() => {
      idx = (idx + 1) % TITLES.length;
      document.title = TITLES[idx];
    }, 600);

    return () => {
      clearInterval(interval);
    };
  }, [isReddingtonAdmin, websiteLeadsBadge]);

  useEffect(() => {
    return () => {
      document.title = 'Lead Management System';
      window.dispatchEvent(new CustomEvent('adminWebsiteLeadAlert', {
        detail: { active: false }
      }));
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    };
  }, []);

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
        if (user?.role !== 'admin') return;
        const myOrgId = user?.organization?._id || user?.organization;
        const leadOrgId = data?.organizationId;
        const orgNameLower = (data?.organizationName || '').toLowerCase();
        const isWestlakeLead = orgNameLower.includes('westlake') || String(leadOrgId) === '6a99733c2ea3d7d9c3927bf0';
        const isSocialUpLead = (orgNameLower.includes('social up') || orgNameLower.includes('socialup') || String(leadOrgId) === '6a99ddd7cea428c97ea29bdb') && !(orgNameLower.includes('2') || String(leadOrgId) === '6aa03313a396c53fdf24e16f');

        if (isWestlakeLead) {
          const isMyOrg = String(leadOrgId) === String(myOrgId);
          if (isMyOrg || isReddingtonAdmin) {
            setWestlakeLeadsBadge(n => n + 1);
            if (isReddingtonAdmin) {
              toast.success(`New Westlake lead: ${data?.name || 'Unknown'}`, { duration: 5000, icon: '🌐' });
            }
          }
        } else if (isSocialUpLead) {
          const isMyOrg = String(leadOrgId) === String(myOrgId);
          if (isMyOrg || isReddingtonAdmin) {
            setSocialUpLeadsBadge(n => n + 1);
            if (isReddingtonAdmin) {
              toast.success(`New Social Up lead: ${data?.name || 'Unknown'}`, { duration: 5000, icon: '🌐' });
            }
          }
        } else {
          // Main Reddington website lead
          if (isReddingtonAdmin) {
            if (websiteLeadTotalRef.current !== null) {
              websiteLeadTotalRef.current += 1;
            }
            setWebsiteLeadsBadge(n => n + 1);
            setLatestWebsiteLead(data || null);
            setShowWebsiteLeadPopup(true);
            toast.success(`New website lead: ${data?.name || 'Unknown'}`, { duration: 5000, icon: '🌐' });
          }
        }
      };

      const handleNewBenWebsiteLead = (data) => {
        if (user?.role !== 'admin') return;
        // Notify this admin only if the lead belongs to their org, or they are Reddington admin
        const myOrgId = user?.organization?._id || user?.organization;
        const leadOrgId = data?.organizationId;
        const isMyLead = !leadOrgId || String(leadOrgId) === String(myOrgId);
        if (!isMyLead && !isReddingtonAdmin) return;
        if (benLeadTotalRef.current !== null) benLeadTotalRef.current += 1;
        
        if (leadOrgId) {
          const orgIdStr = String(leadOrgId);
          setPortalBadges(prev => ({
            ...prev,
            [orgIdStr]: (prev[orgIdStr] || 0) + 1,
            default: (prev.default || 0) + 1
          }));
        }

        const orgNameLower = (data?.organizationName || '').toLowerCase();
        if (orgNameLower.includes('socialupmedia 2') || orgNameLower.includes('social up media 2') || orgNameLower.includes('jake2') || String(leadOrgId) === '6aa03313a396c53fdf24e16f') {
          setJake2Badge(n => n + 1);
          if (isReddingtonAdmin) {
            toast.success(`New Jake 2 lead: ${data?.name || 'Unknown'}`, { duration: 5000, icon: '🟣' });
          }
        } else if (orgNameLower.includes('truclick') || orgNameLower.includes('tru click')) {
          setTruClickBadge(n => n + 1);
          if (isReddingtonAdmin) {
            toast.success(`New TruClick Media lead: ${data?.name || 'Unknown'}`, { duration: 5000, icon: '🔵' });
          }
        } else if (orgNameLower.includes('ben')) {
          setBenLeadsBadge(n => n + 1);
          if (isReddingtonAdmin) {
            toast.success(`New Ben website lead: ${data?.name || 'Unknown'}`, { duration: 5000, icon: '🟠' });
          }
        } else {
          setBenLeadsBadge(n => n + 1);
          if (isReddingtonAdmin) {
            const orgTag = data?.organizationName ? `${data.organizationName}: ` : '';
            toast.success(`New inbound lead: ${orgTag}${data?.name || 'Unknown'}`, { duration: 5000, icon: '🟠' });
          }
        }
      };

      const handleNewInboundData = (data) => {
        if (user?.role !== 'admin') return;
        setInboundCallsBadge(n => n + 1);
        if (isReddingtonAdmin) {
          toast.success(`New Inbound Call on DID ${data?.did || 'N/A'}: ${data?.phoneNumber || 'Unknown'}`, { duration: 5000, icon: '📞' });
        }
      };

      socket.on('leadUpdated', handleLeadUpdated);
      socket.on('leadCreated', handleLeadCreated);
      socket.on('leadDeleted', handleLeadDeleted);
      socket.on('newWebsiteLead', handleNewWebsiteLead);
      socket.on('newBenWebsiteLead', handleNewBenWebsiteLead);
      socket.on('newInboundData', handleNewInboundData);

      // Cleanup socket listeners and timeout
      return () => {
        if (socketDebounceRef.timeout) {
          clearTimeout(socketDebounceRef.timeout);
        }
        socket.off('leadUpdated', handleLeadUpdated);
        socket.off('leadCreated', handleLeadCreated);
        socket.off('leadDeleted', handleLeadDeleted);
        socket.off('newWebsiteLead', handleNewWebsiteLead);
        socket.off('newBenWebsiteLead', handleNewBenWebsiteLead);
        socket.off('newInboundData', handleNewInboundData);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, showLeadsSection, isReddingtonAdmin, fetchStats, fetchLeads]);

  // Search functionality with debouncing - triggers server-side search across all leads
  const searchTimeoutRef = useRef(null);

  const handleSearch = useCallback((term) => {
    setSearchTerm(term);
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounce the server-side fetch by 400ms
    searchTimeoutRef.current = setTimeout(() => {
      // Reset to page 1 and fetch with the new search term from the database
      setPagination(prev => ({ ...prev, page: 1 }));
      fetchLeads(false, 1);
    }, 400);
  }, [fetchLeads]);

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

  // Enhanced lead update with proper data types and sanitized fields
  const handleLeadUpdate = async () => {
    if (!editedLead || !isReddingtonAdmin) return;

    setIsUpdating(true);
    try {
      const cleanData = {};

      if (editedLead.name !== undefined) cleanData.name = editedLead.name?.trim() || '';
      if (editedLead.email !== undefined) cleanData.email = editedLead.email?.trim() || '';
      if (editedLead.phone !== undefined) cleanData.phone = editedLead.phone?.trim() || '';
      if (editedLead.alternatePhone !== undefined) cleanData.alternatePhone = editedLead.alternatePhone?.trim() || '';

      if (editedLead.address !== undefined) cleanData.address = editedLead.address?.trim() || '';
      if (editedLead.city !== undefined) cleanData.city = editedLead.city?.trim() || '';
      if (editedLead.state !== undefined) cleanData.state = editedLead.state?.trim() || '';
      if (editedLead.zipcode !== undefined) cleanData.zipcode = editedLead.zipcode?.trim() || '';

      if (editedLead.debtCategory) cleanData.debtCategory = editedLead.debtCategory;
      if (editedLead.source !== undefined) cleanData.source = editedLead.source?.trim() || '';
      if (editedLead.totalDebtAmount !== undefined && editedLead.totalDebtAmount !== '' && editedLead.totalDebtAmount !== null) {
        cleanData.totalDebtAmount = parseFloat(editedLead.totalDebtAmount) || 0;
      }
      if (editedLead.numberOfCreditors !== undefined && editedLead.numberOfCreditors !== '' && editedLead.numberOfCreditors !== null) {
        cleanData.numberOfCreditors = parseInt(editedLead.numberOfCreditors, 10) || 0;
      }
      if (editedLead.monthlyDebtPayment !== undefined && editedLead.monthlyDebtPayment !== '' && editedLead.monthlyDebtPayment !== null) {
        cleanData.monthlyDebtPayment = parseFloat(editedLead.monthlyDebtPayment) || 0;
      }
      if (editedLead.creditScoreRange) cleanData.creditScoreRange = editedLead.creditScoreRange;

      if (editedLead.category) cleanData.category = editedLead.category;
      if (editedLead.qualificationStatus) cleanData.qualificationStatus = editedLead.qualificationStatus;
      if (editedLead.status) cleanData.status = editedLead.status;
      if (editedLead.company !== undefined) cleanData.company = editedLead.company?.trim() || '';

      if (editedLead.leadProgressStatus) cleanData.leadProgressStatus = editedLead.leadProgressStatus;
      if (editedLead.followUpDate) cleanData.followUpDate = editedLead.followUpDate;
      if (editedLead.followUpTime) cleanData.followUpTime = editedLead.followUpTime;
      if (editedLead.clientId !== undefined) cleanData.clientId = editedLead.clientId?.trim() || '';
      if (editedLead.conversionValue !== undefined && editedLead.conversionValue !== '' && editedLead.conversionValue !== null) {
        cleanData.conversionValue = parseFloat(editedLead.conversionValue) || 0;
      }

      if (editedLead.notes !== undefined) cleanData.notes = editedLead.notes?.trim() || '';
      if (editedLead.assignmentNotes !== undefined) cleanData.assignmentNotes = editedLead.assignmentNotes?.trim() || '';
      if (editedLead.followUpNotes !== undefined) cleanData.followUpNotes = editedLead.followUpNotes?.trim() || '';

      cleanData.lastUpdatedBy = user?.name || 'Admin';
      cleanData.lastUpdatedAt = getEasternNow().toISOString();

      const leadIdToUse = editedLead._id || editedLead.leadId;
      const response = await axios.put(`/api/leads/${leadIdToUse}`, cleanData);
      
      if (response.data) {
        // Update the lead in our local state
        setLeads(prevLeads => 
          prevLeads.map(lead => 
            (lead._id === editedLead._id || lead.leadId === editedLead.leadId) ? response.data.data.lead : lead
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

  const getQualificationBadge = (qualificationStatus) => (
    <StatusBadge
      status={qualificationStatus}
      label={qualificationStatus === 'not-qualified' || qualificationStatus === 'disqualified' || qualificationStatus === 'unqualified' ? 'Not - Qualified' : undefined}
    />
  );

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
      disposedLeads: stats.disposedLeads || 0,
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

  // Backend handles all filtering including search - just display current page leads
  const displayLeads = leads;

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
        <div className="relative z-30 bg-white rounded-xl shadow-lg border border-gray-100 p-4 backdrop-blur-sm bg-opacity-95">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-lg">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
                    Admin Dashboard
                  </h1>
                  {isReddingtonAdmin ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Full Access
                    </span>
                  ) : isSubAgent ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                      Sub-Agent (DID Scoped - Read Only)
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Read-only
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                  <span>Real-time lead management</span>
                  <span>•</span>
                  <span>Last updated: {formatEasternTimeForDisplay(lastUpdated, { includeTimezone: true })}</span>
                </div>

                {/* Display Assigned DIDs for tenant admins */}
                {!isReddingtonAdmin && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      <PhoneIncoming className="w-3.5 h-3.5 text-indigo-600" />
                      Assigned DID{orgDids.allDids.length > 1 ? 's' : ''}:
                    </span>
                    {orgDids.allDids.length > 0 ? (
                      orgDids.allDids.map((did) => {
                        const isLt = (orgDids.liveTransferDids || []).includes(did) || did === orgDids.liveTransferDid;
                        const isIn = (orgDids.inboundCallsDids || []).includes(did) || did === orgDids.inboundCallsDid;
                        const isLf = (orgDids.loanFlipDids || []).includes(did) || did === orgDids.loanFlipDid;
                        const alias = didAliasMap[did];
                        return (
                          <span
                            key={did}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold font-mono tracking-tight shadow-sm border ${
                              isLt
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : isIn
                                ? 'bg-blue-50 text-blue-900 border-blue-300'
                                : isLf
                                ? 'bg-purple-50 text-purple-900 border-purple-300'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                            }`}
                          >
                            <span className="text-[11px] font-sans font-semibold text-gray-600">
                              {isLt ? '⚡ Live Transfer:' : isIn ? '📞 Inbound:' : isLf ? '🔄 Loan Flip:' : '📞 Line:'}
                            </span>
                            {alias ? (
                              <span className="font-sans font-bold text-gray-900">
                                {alias} <span className="font-mono text-[11px] font-normal text-gray-600">({did})</span>
                              </span>
                            ) : (
                              did
                            )}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs italic text-gray-400">
                        No DIDs assigned to this organisation
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Bar: Consolidated Client Portals & System Tools */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Consolidated Client & Vendor Lead Portals */}
              <ClientPortalsDropdown
                user={user}
                isReddingtonAdmin={isReddingtonAdmin}
                organizations={organizations}
                portalBadges={portalBadges}
                websiteLeadsBadge={websiteLeadsBadge}
                westlakeLeadsBadge={westlakeLeadsBadge}
                socialUpLeadsBadge={socialUpLeadsBadge}
                benLeadsBadge={benLeadsBadge}
                loopLeadsBadge={loopLeadsBadge}
                canAccessLoopLeads={canAccessLoopLeads}
                isWestlakeAdmin={isWestlakeAdmin}
                isSocialUpAdmin={isSocialUpAdmin}
                onOpenWebsiteLeads={openWebsiteLeadsModal}
                onOpenWestlakeLeads={() => { setShowWestlakeLeads(true); setWestlakeLeadsBadge(0); }}
                onOpenSocialUpLeads={() => { setShowSocialUpLeads(true); setSocialUpLeadsBadge(0); }}
                onOpenBenLeads={() => { setShowBenWebsiteLeads(true); setBenLeadsBadge(0); }}
                onOpenLoopLeads={() => { setShowLoopLeads(true); setLoopLeadsBadge(0); }}
                onOpenVendorPortal={(org) => {
                  setActiveVendorPortalOrg(org);
                  const orgIdStr = String(org._id || org.id);
                  setPortalBadges(prev => ({ ...prev, [orgIdStr]: 0, default: 0 }));
                  if (org.name?.toLowerCase().includes('truclick')) setTruClickBadge(0);
                  if (org.name?.toLowerCase().includes('2')) setJake2Badge(0);
                }}
              />

              {/* Inbound Calls button — all admins & sub-agents (scoped for tenant admins and sub-agents, full access for Reddington admin) */}
              {['admin', 'sub_agent', 'vendor_agent'].includes(user?.role) && (
                <button
                  onClick={() => { setShowInboundDataModal(true); setInboundCallsBadge(0); }}
                  className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md"
                  style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)', boxShadow: '0 4px 12px rgba(49,46,129,0.4)' }}
                  title="View Real-Time Inbound Calls & DID Traffic"
                >
                  <PhoneCall className="w-4 h-4" />
                  Inbound Calls
                  {inboundCallsBadge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 animate-pulse">
                      {inboundCallsBadge > 99 ? '99+' : inboundCallsBadge}
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
                  <Search className="w-4 h-4" />
                  People Search
                </button>
              )}

              {/* Data Vendor Portal button */}
              {isReddingtonAdmin && (
                <button
                  onClick={() => navigate('/vendor-dashboard')}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 active:scale-95 shadow-md"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#9333ea)', boxShadow: '0 4px 12px rgba(147,51,234,0.4)' }}
                  title="Open Data Vendor Portal, Lists & Sales Tracker"
                >
                  <Database className="w-4 h-4" />
                  Vendor Data
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

        {/* Feature / DID Segregated Dashboard Switcher (Dynamic based on hasDualDidSwitcher or multi-DID setup) */}
        {(hasOrgFeature(user?.organization, 'hasDualDidSwitcher') || (isSocialUpAdmin || orgDids.hasMultiple)) && (
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 rounded-2xl shadow-xl border border-indigo-500/30 text-white mb-1 transition-all duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 ring-2 ring-white/20">
                  <Activity className="h-5 w-5 text-white animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold tracking-wide uppercase bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                      {isSocialUpAdmin ? 'Jake / Team 1 Segregated Dashboards' : 'Channel & DID Dashboards'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/30 text-indigo-300 border border-indigo-400/40">
                      LIVE DUAL-DID
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200/80 mt-0.5">
                    Click to toggle between <span className="text-amber-300 font-semibold">Live Transfers</span>, <span className="text-cyan-300 font-semibold">Inbound Calls</span>, and individual DIDs to view segregated metrics, call counts, and leads.
                  </p>
                </div>
              </div>

              {/* Sliding Segregated Pills */}
              <div className="flex flex-wrap items-center bg-black/40 p-1.5 rounded-xl border border-white/10 backdrop-blur-md shadow-inner gap-1">
                {/* All Data Pill */}
                <button
                  type="button"
                  onClick={() => handleDidTabChange('all')}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                    selectedDidTab === 'all'
                      ? 'bg-gradient-to-r from-slate-700 to-slate-600 text-white shadow-lg ring-1 ring-white/30 scale-100'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Globe className={`h-3.5 w-3.5 ${selectedDidTab === 'all' ? 'text-cyan-300' : 'text-gray-400'}`} />
                  <span>All Calls</span>
                </button>

                {/* Dynamically Render a Pill for Every Assigned DID */}
                {orgDids.allDids.map((did) => {
                  const isLt = (orgDids.liveTransferDids || []).includes(did) || did === orgDids.liveTransferDid;
                  const isIn = (orgDids.inboundCallsDids || []).includes(did) || did === orgDids.inboundCallsDid;
                  const isLf = (orgDids.loanFlipDids || []).includes(did) || did === orgDids.loanFlipDid;
                  const isSelected = selectedDidTab === did ||
                    (isLt && (selectedDidTab === 'live_transfer' || selectedDidTab === 'live-transfer')) ||
                    (isIn && (selectedDidTab === 'inbound' || selectedDidTab === 'inbound-call')) ||
                    (isLf && (selectedDidTab === 'loan_flip' || selectedDidTab === 'loan-flip'));

                  const didStat = Array.isArray(stats?.byDid) ? stats.byDid.find(b => String(b._id) === String(did)) : null;
                  const didTotal = didStat?.total;
                  const alias = didAliasMap[did];

                  let label = alias || `DID ${did.slice(-4)}`;
                  let activeStyle = 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-lg shadow-teal-500/40 ring-2 ring-emerald-300/50 scale-105 z-10';
                  let IconComp = PhoneIncoming;
                  let iconClass = isSelected ? 'text-emerald-200' : 'text-emerald-400';

                  if (isLt) {
                    if (!alias) {
                      label = (orgDids.liveTransferDids || []).length > 1 ? `Live Transfer (${did.slice(-4)})` : 'Live Transfers';
                    }
                    activeStyle = 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/40 ring-2 ring-amber-300/50 scale-105 z-10';
                    IconComp = Zap;
                    iconClass = isSelected ? 'text-amber-200 animate-bounce' : 'text-amber-400';
                  } else if (isIn) {
                    if (!alias) {
                      label = (orgDids.inboundCallsDids || []).length > 1 ? `Inbound (${did.slice(-4)})` : 'Inbound Calls';
                    }
                    activeStyle = 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/40 ring-2 ring-indigo-300/50 scale-105 z-10';
                    IconComp = PhoneCall;
                    iconClass = isSelected ? 'text-blue-200' : 'text-blue-400';
                  } else if (isLf) {
                    if (!alias) {
                      label = (orgDids.loanFlipDids || []).length > 1 ? `Loan Flip (${did.slice(-4)})` : 'Loan Flip';
                    }
                    activeStyle = 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/40 ring-2 ring-purple-300/50 scale-105 z-10';
                    IconComp = RefreshCw;
                    iconClass = isSelected ? 'text-purple-200' : 'text-purple-400';
                  }

                  return (
                    <button
                      key={did}
                      type="button"
                      onClick={() => handleDidTabChange(did)}
                      className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                        isSelected ? activeStyle : 'text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <IconComp className={`h-4 w-4 ${iconClass}`} />
                      <span>{label}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono tracking-tight ${
                        isSelected
                          ? 'bg-black/30 text-white border border-white/20'
                          : 'bg-white/10 text-gray-300'
                      }`}>
                        {did}
                      </span>
                      {typeof didTotal === 'number' && didTotal > 0 && (
                        <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                          isSelected ? 'bg-white text-gray-900' : 'bg-indigo-500/40 text-indigo-200'
                        }`}>
                          {didTotal}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sub-banner showing active filter status */}
            <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Active View:</span>
                {selectedDidTab === 'all' ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-gray-200">
                    🌐 Combined Overview (All DIDs)
                  </span>
                ) : (orgDids.liveTransferDids || []).includes(selectedDidTab) || selectedDidTab === orgDids.liveTransferDid || selectedDidTab === 'live_transfer' ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                    ⚡ Live Transfers Mode (DID: {didAliasMap[selectedDidTab] ? `${didAliasMap[selectedDidTab]} (${selectedDidTab})` : selectedDidTab})
                  </span>
                ) : (orgDids.inboundCallsDids || []).includes(selectedDidTab) || selectedDidTab === orgDids.inboundCallsDid || selectedDidTab === 'inbound' ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-cyan-300">
                    📞 Inbound Calls Mode (DID: {didAliasMap[selectedDidTab] ? `${didAliasMap[selectedDidTab]} (${selectedDidTab})` : selectedDidTab})
                  </span>
                ) : (orgDids.loanFlipDids || []).includes(selectedDidTab) || selectedDidTab === orgDids.loanFlipDid || selectedDidTab === 'loan_flip' ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-purple-300">
                    🔄 Loan Flip Mode (DID: {didAliasMap[selectedDidTab] ? `${didAliasMap[selectedDidTab]} (${selectedDidTab})` : selectedDidTab})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                    📞 Inbound Line Mode (DID: {didAliasMap[selectedDidTab] ? `${didAliasMap[selectedDidTab]} (${selectedDidTab})` : selectedDidTab})
                  </span>
                )}
              </div>
              <div className="text-[11px] text-gray-400">
                Data, stats counters, tables, and exports are dynamically scoped to this channel.
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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

          {/* Disposed Card */}
          <div className="group bg-white p-4 rounded-xl shadow-md hover:shadow-xl border border-gray-100 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 group-hover:from-orange-500 group-hover:to-orange-600 transition-all duration-300">
                <AlertCircle className="h-5 w-5 text-orange-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Disposed</p>
                <p className="text-xl font-bold text-gray-900">{realTimeStats.disposedLeads || 0}</p>
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

        {/* ── Inbound / Outbound Call Report — main org admin only ────── */}
        {isReddingtonAdmin && (
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
        )} {/* end isReddingtonAdmin call report */}

        {/* Multi-DID Performance Breakdown Table (Shown when All Calls is selected & multiple DIDs exist) */}
        {selectedDidTab === 'all' && orgDids.hasMultiple && (
          <DidBreakdownTable
            dids={orgDids.allDids}
            didAliases={didAliasMap}
            liveTransferDid={orgDids.liveTransferDid}
            liveTransferDids={orgDids.liveTransferDids}
            inboundCallsDid={orgDids.inboundCallsDid}
            inboundCallsDids={orgDids.inboundCallsDids}
            loanFlipDid={orgDids.loanFlipDid}
            loanFlipDids={orgDids.loanFlipDids}
            byDidStats={stats?.byDid || []}
            onSelectDid={handleDidTabChange}
          />
        )}

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
                    {isReddingtonAdmin ? (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/30 text-emerald-100 border border-emerald-400/40">
                        Full Access
                      </span>
                    ) : (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white backdrop-blur-sm">
                        Read-only
                      </span>
                    )}
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
                    setPagination(prev => ({ ...prev, page: 1 }));
                    fetchLeads(false, 1);
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
                  Found <span className="font-semibold text-blue-600">{pagination.total}</span> lead{pagination.total !== 1 ? 's' : ''} matching <span className="font-medium">"{searchTerm}"</span>
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
                {[
                  { id: 'all', label: 'All', activeColor: 'from-blue-600 to-indigo-600' },
                  { id: 'qualified', label: 'Qualified', activeColor: 'from-emerald-600 to-emerald-600' },
                  { id: 'not-qualified', label: 'Not Qualified', activeColor: 'from-red-600 to-red-600' },
                  { id: 'pending', label: 'Pending', activeColor: 'from-amber-600 to-amber-600' }
                ].map(({ id, label, activeColor }) => (
                  <button
                    key={id}
                    onClick={() => {
                      setQualificationFilter(id);
                      resetPaginationAndFetch();
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                      qualificationFilter === id
                        ? `bg-gradient-to-r ${activeColor} text-white shadow-md scale-105`
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                    }`}
                  >
                    {label}
                  </button>
                ))}
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

            {/* Traffic Type Filter (Inbound / Outbound) */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-lg">
                <PhoneCall className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <span className="text-xs font-semibold text-gray-700">Type:</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setTrafficTypeFilter('all');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    trafficTypeFilter === 'all' 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setTrafficTypeFilter('inbound');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    trafficTypeFilter === 'inbound' 
                      ? 'bg-gradient-to-r from-indigo-700 to-purple-800 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  Inbound
                </button>
                <button
                  onClick={() => {
                    setTrafficTypeFilter('outbound');
                    resetPaginationAndFetch();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    trafficTypeFilter === 'outbound' 
                      ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  }`}
                >
                  Outbound
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
            
            {/* Export & Share Buttons */}
            {isReddingtonAdmin ? (
              /* Reddington admin: full action bar — Vendor Data, Share Data, Export CSV */
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setShowManualSaleModal(true)}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold rounded-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-1.5"
                >
                  <TrendingUp size={14} />
                  <span>Manual Sale</span>
                </button>
                <button
                  onClick={() => setShowVendorModal(true)}
                  className="px-4 py-1.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-semibold rounded-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-1.5"
                >
                  <Database size={14} />
                  <span>Vendor Data</span>
                </button>
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
            ) : user?.canDownloadLeads ? (
              /* Other org admin with download permission: Export CSV only (own org leads) */
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleExportLeads}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-600 text-white text-xs font-semibold rounded-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-1.5"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
              </div>
            ) : null}
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
              {trafficTypeFilter !== 'all' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  {trafficTypeFilter === 'inbound' ? '📞 Inbound' : '📤 Outbound'}
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
                            {didAliasMap[lead.vicidialDid.trim()] ? (
                              <div className="truncate" title={`DID: ${lead.vicidialDid} (${didAliasMap[lead.vicidialDid.trim()]})`}>
                                <div className="text-[10px] font-bold text-gray-900 truncate">
                                  {didAliasMap[lead.vicidialDid.trim()]}
                                </div>
                                <div className="font-mono text-[9px] text-red-600 font-normal">
                                  {lead.vicidialDid}
                                </div>
                              </div>
                            ) : (
                              <div className="font-mono text-[10px] text-red-600 truncate" title={`DID: ${lead.vicidialDid}`}>
                                {lead.vicidialDid}
                              </div>
                            )}
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

                      {/* Category & Status - 2 columns */}
                      <div className="col-span-2">
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
                          {((lead.disposedBy || lead.agent2LastAction || lead.agentLastAction || lead.lastUpdatedBy) || lead.draftDate) && (
                            <div className="text-[11px] text-gray-500 space-y-0.5">
                              {(lead.disposedBy || lead.agent2LastAction || lead.agentLastAction || lead.lastUpdatedBy) && (
                                <div className="text-[11px] text-purple-700 font-medium truncate" title={`Disposed by ${formatDisposedByLabel(lead.disposedBy || lead.agent2LastAction || lead.agentLastAction || lead.lastUpdatedBy)}`}>
                                  by {formatDisposedByLabel(lead.disposedBy || lead.agent2LastAction || lead.agentLastAction || lead.lastUpdatedBy)}
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

                      {/* Disposition / Action - 2 columns */}
                      <div className="col-span-2">
                        {lead.leadProgressStatus || lead.disposition1 ? (
                          <span className="inline-block text-xs font-semibold px-2 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200 truncate max-w-[160px]" title={lead.leadProgressStatus || lead.disposition1}>
                            {lead.leadProgressStatus || lead.disposition1}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No disposition</span>
                        )}
                        {(lead.agent2LastAction || lead.agentLastAction || lead.disposedBy || lead.lastUpdatedBy) && (
                          <div className="text-[11px] text-gray-500 truncate mt-0.5" title={typeof lead.disposedBy === 'object' && lead.disposedBy?.name ? formatDisposedByLabel(lead.disposedBy) : (lead.agent2LastAction || lead.agentLastAction || lead.disposedBy || lead.lastUpdatedBy)}>
                            by {typeof lead.disposedBy === 'object' && lead.disposedBy?.name ? formatDisposedByLabel(lead.disposedBy) : (lead.agent2LastAction || lead.agentLastAction || lead.disposedBy || lead.lastUpdatedBy)}
                          </div>
                        )}
                        {lead.clientId && (
                          <div className="mt-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-mono text-xs truncate" title={`Client ID: ${lead.clientId}`}>
                              ID: {lead.clientId}
                            </span>
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
      <LeadDetailsModal
        isOpen={showViewModal}
        onClose={closeViewModal}
        selectedLead={selectedLead}
        isReddingtonAdmin={isReddingtonAdmin}
        isEditing={isEditing}
        isUpdating={isUpdating}
        editedLead={editedLead}
        onEditToggle={handleEditToggle}
        onCancelEdit={handleCancelEdit}
        onSave={handleLeadUpdate}
        onInputChange={handleInputChange}
        leadProgressOptions={leadProgressOptions}
        formatDisposedByLabel={formatDisposedByLabel}
        formatDraftDate={formatDraftDate}
        getCategoryBadge={getCategoryBadge}
        getQualificationBadge={getQualificationBadge}
        getStatusBadge={getStatusBadge}
        formatEasternTimeForDisplay={formatEasternTimeForDisplay}
      />

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
              {isReddingtonAdmin ? <CrossOrgUserManagement /> : <AgentManagement />}
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

      {/* Data Vendor Upload Modal */}
      <DataVendorShareModal
        isOpen={showVendorModal}
        onClose={() => setShowVendorModal(false)}
      />

      {/* Manual Sale Modal */}
      <ManualSaleModal
        isOpen={showManualSaleModal}
        onClose={() => setShowManualSaleModal(false)}
      />

      {/* Website Leads Modal — Reddington admin only */}
      {isReddingtonAdmin && showWebsiteLeads && (
        <WebsiteLeadsModal onClose={() => setShowWebsiteLeads(false)} />
      )}

      {/* Westlake Leads Modal */}
      {showWestlakeLeads && (
        <WebsiteLeadsModal
          targetOrgName={isReddingtonAdmin ? 'Westlake' : undefined}
          title="Westlake Leads"
          onClose={() => setShowWestlakeLeads(false)}
        />
      )}

      {/* Social Up Media Leads Modal */}
      {showSocialUpLeads && (
        <WebsiteLeadsModal
          targetOrgName={isReddingtonAdmin ? 'Social Up' : undefined}
          title="Social Up Leads"
          onClose={() => setShowSocialUpLeads(false)}
        />
      )}

      {/* Ben Website Leads Modal */}
      {showBenWebsiteLeads && (
        <BenWebsiteLeadsModal
          targetOrgName={isReddingtonAdmin ? 'Ben' : undefined}
          title="Ben Website Leads"
          onClose={() => setShowBenWebsiteLeads(false)}
        />
      )}

      {/* TruClick Media Leads Modal */}
      {showTruClickLeads && (
        <BenWebsiteLeadsModal
          targetOrgName={isReddingtonAdmin ? 'TruClick' : undefined}
          title="TruClick Media Leads"
          onClose={() => setShowTruClickLeads(false)}
        />
      )}

      {/* Jake 2 Leads Modal */}
      {showJake2Leads && (
        <BenWebsiteLeadsModal
          targetOrgName={isReddingtonAdmin ? 'Socialupmedia 2' : undefined}
          title="Jake 2 Leads"
          onClose={() => setShowJake2Leads(false)}
        />
      )}

      {/* Dynamic Vendor Leads Portal Modal */}
      {activeVendorPortalOrg && (
        <BenWebsiteLeadsModal
          targetOrgName={isReddingtonAdmin ? activeVendorPortalOrg.name : undefined}
          title={`${activeVendorPortalOrg.name} Leads`}
          onClose={() => setActiveVendorPortalOrg(null)}
        />
      )}

      {/* Inbound Calls Modal */}
      {showInboundDataModal && (
        <InboundDataModal
          title="Inbound Calls"
          onClose={() => setShowInboundDataModal(false)}
        />
      )}

      {/* New Website Lead Popup — admin dashboard only */}
      {isReddingtonAdmin && showWebsiteLeadPopup && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-red-100 overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-red-600 to-rose-600 text-white">
              <h3 className="text-lg font-bold">New Website Lead Received</h3>
              <p className="text-xs text-red-100 mt-0.5">Immediate review recommended</p>
            </div>

            <div className="px-5 py-4 space-y-2">
              <p className="text-sm text-gray-800"><span className="font-semibold">Name:</span> {latestWebsiteLead?.name || 'Unknown'}</p>
              <p className="text-sm text-gray-800"><span className="font-semibold">Email:</span> {latestWebsiteLead?.email || '—'}</p>
              <p className="text-sm text-gray-800"><span className="font-semibold">Phone:</span> {latestWebsiteLead?.phone || '—'}</p>
              <p className="text-xs text-gray-500 pt-1">A red alert will stay active in the top header until you open Website Leads.</p>
            </div>

            <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowWebsiteLeadPopup(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={openWebsiteLeadsModal}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Open Website Leads
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loop Leads Modal — orgs with showLoopLeads or main-org admin */}
      {canAccessLoopLeads && showLoopLeads && (
        <LoopLeadsModal onClose={() => setShowLoopLeads(false)} />
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

