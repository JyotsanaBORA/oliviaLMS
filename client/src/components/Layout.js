import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { scrollToTop } from '../utils/scrollUtils';
import axios from 'axios';
import { 
  Home, 
  Users, 
  BarChart3, 
  User, 
  LogOut, 
  Menu, 
  X,
  Bell,
  Settings,
  Shield,
  Database,
  MessageSquare,
  Download,
  KeyRound,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';

const Layout = ({ onDashboardRefresh }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, loading } = useAuth();
  const { triggerRefresh } = useRefresh();
  const location = useLocation();
  const navigate = useNavigate();

  // ── Notification state ───────────────────────────────────────
  const [notifications, setNotifications]   = useState([]);
  const [unreadCount, setUnreadCount]       = useState(0);
  const [notifOpen, setNotifOpen]           = useState(false);
  const [notifLoading, setNotifLoading]     = useState(false);
  const notifRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    // Only roles that get notifications
    if (!['superadmin', 'admin'].includes(user.role)) return;
    try {
      setNotifLoading(true);
      const res = await axios.get('/api/notifications');
      if (res.data.success) {
        setNotifications(res.data.data || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (_) {
      // silently fail — notifications are non-critical
    } finally {
      setNotifLoading(false);
    }
  }, [user]);

  // Fetch on mount + every 60 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenNotifPanel = async () => {
    setNotifOpen((prev) => !prev);
    if (!notifOpen && unreadCount > 0) {
      // Mark all as read when opening
      try {
        await axios.patch('/api/notifications/mark-all-read');
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      } catch (_) {}
    }
  };

  const handleDeleteNotif = async (id, e) => {
    e.stopPropagation();
    try {
      await axios.delete(`/api/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch (_) {}
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'lead_download_alert':   return <Download size={14} className="text-amber-500 shrink-0" />;
      case 'lead_download_confirm': return <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />;
      case 'password_change_alert': return <KeyRound size={14} className="text-red-500 shrink-0" />;
      case 'password_change_confirm': return <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />;
      default: return <Bell size={14} className="text-gray-400 shrink-0" />;
    }
  };

  const formatNotifTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString();
  };
  // ── End notification state ────────────────────────────────────

  // Prevent copying FROM the dashboard for restricted roles.
  // Paste INTO the dashboard is intentionally allowed.
  // Main org admins (isMainOrgAdmin) are exempt from copy restriction.
  useEffect(() => {
    const restrictedRoles = ['admin', 'agent1', 'agent2', 'restricted_admin'];
    if (!user || !restrictedRoles.includes(user.role) || user.isMainOrgAdmin) return;

    const block = (e) => e.preventDefault();

    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('contextmenu', block);

    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('contextmenu', block);
    };
  }, [user]);

  // Show loading if user data is still being fetched
  if (loading || !user) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Handle double-click on Dashboard to refresh
  const handleDashboardDoubleClick = (item) => {
    if (item.name === 'Dashboard' || item.name === 'SuperAdmin') {
      // Only refresh if we're already on the dashboard
      if (isActive(item.href)) {
        // Scroll to top using utility function
        scrollToTop();
        
        toast.success('Dashboard refreshed!');
        
        // Determine dashboard type based on user role and current path
        let dashboardType = 'admin';
        if (user.role === 'superadmin') {
          dashboardType = 'superadmin';
        } else if (user.role === 'agent1') {
          dashboardType = 'agent1';
        } else if (user.role === 'agent2') {
          dashboardType = 'agent2';
        }
        
        // Trigger refresh through context
        triggerRefresh(dashboardType);
        
        // Also trigger callback if provided
        if (onDashboardRefresh) {
          onDashboardRefresh();
        }
      }
    }
  };

  // Navigation items based on user role
  const getNavItems = () => {
    const baseItems = [];

    // Add Profile for admin, superadmin, and agent1 (agent1 can manage their Vicidial ID)
    if (['admin', 'superadmin', 'agent1'].includes(user.role)) {
      baseItems.push({ name: 'Profile', href: '/profile', icon: User });
    }

    if (user.role === 'superadmin') {
      return [
        { name: 'SuperAdmin', href: '/superadmin', icon: Shield },
        { name: 'Today Leads', href: '/leads', icon: Users },
        { name: 'Chat', href: '/chat', icon: MessageSquare },
        ...baseItems
      ];
    } else if (user.role === 'admin') {
      return [
        { name: 'Dashboard', href: '/admin', icon: BarChart3 },
        { name: 'Today Leads', href: '/leads', icon: Users },
        { name: 'Chat', href: '/chat', icon: MessageSquare },
        ...baseItems
      ];
    } else if (user.role === 'agent2') {
      return [
        { name: 'Leads', href: '/leads', icon: Users },
        { name: 'Chat', href: '/chat', icon: MessageSquare },
      ];
    } else if (user.role === 'restricted_admin') {
      return [
        { name: 'Dashboard', href: '/restricted-dashboard', icon: Database }
      ];
    } else if (user.role === 'affiliate_admin') {
      return [
        { name: 'Dashboard', href: '/affiliate', icon: Database }
      ];
    } else if (user.role === 'data_vendor') {
      return [
        { name: 'Dashboard', href: '/vendor-dashboard', icon: BarChart3 }
      ];
    } else {
      return [
        { name: 'Dashboard', href: '/dashboard', icon: Home },
        { name: 'Chat', href: '/chat', icon: MessageSquare },
        ...baseItems
      ];
    }
  };

  const navItems = getNavItems();

  const isActive = (href) => location.pathname === href;

  const isRestricted = user && ['admin', 'agent2'].includes(user.role) && !user.isMainOrgAdmin;

  return (
    <div className={`flex h-screen bg-gray-100${isRestricted ? ' select-none' : ''}`}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 flex z-40 md:hidden">
          <div 
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setSidebarOpen(false)}
          ></div>
        </div>
      )}

      {/* Sidebar */}
      <div className={`${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:inset-0`}>
        
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-16 px-6 bg-primary-600">
          <h1 className="text-xl font-bold text-white">LMS</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-white md:hidden"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* User info */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-white font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500 capitalize">
                {user.role === 'agent1' ? 'Lead Generator' : 
                 user.role === 'agent2' ? 'Lead Follower' : 
                 user.role === 'admin' ? 'Administrator' : 
                 user.role === 'restricted_admin' ? 'Restricted Admin' :
                 user.role === 'affiliate_admin' ? 'Affiliate Admin' :
                 user.role === 'data_vendor' ? 'Data Vendor' : 'Super Administrator'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isDashboardItem = item.name === 'Dashboard' || item.name === 'SuperAdmin';
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`${
                    isActive(item.href)
                      ? 'bg-primary-100 text-primary-900 border-r-2 border-primary-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  } group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200`}
                  onClick={() => setSidebarOpen(false)}
                  onDoubleClick={() => isDashboardItem && handleDashboardDoubleClick(item)}
                  title={isDashboardItem ? 'Double-click to refresh dashboard and scroll to top' : ''}
                >
                  <Icon
                    className={`${
                      isActive(item.href) ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500'
                    } mr-3 h-5 w-5`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Logout button */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 transition-colors duration-200"
          >
            <LogOut className="mr-3 h-5 w-5 text-gray-400" />
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top navigation */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-6">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-gray-500 hover:text-gray-700 md:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              
              <div className="ml-4 md:ml-0">
                <h2 className="text-xl font-semibold text-gray-900">
                  {user.role === 'admin' ? 'Admin Dashboard' :
                   user.role === 'agent2' ? 'Leads Management' :
                   user.role === 'restricted_admin' ? 'Restricted Admin Dashboard' : 'Lead Generator'}
                </h2>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Notifications Bell — only for admin and superadmin */}
              {['superadmin', 'admin'].includes(user.role) && (
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={handleOpenNotifPanel}
                    className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Dropdown panel */}
                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <span className="text-sm font-semibold text-gray-800">Notifications</span>
                        <button
                          onClick={() => setNotifOpen(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      {/* List */}
                      <div className="overflow-y-auto flex-1">
                        {notifLoading && notifications.length === 0 ? (
                          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
                        ) : notifications.length === 0 ? (
                          <div className="py-10 text-center">
                            <Bell size={28} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-400">No notifications yet</p>
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n._id}
                              className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                                !n.isRead ? 'bg-blue-50' : ''
                              }`}
                            >
                              <div className="mt-0.5">{getNotifIcon(n.type)}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-800 leading-snug">{n.message}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{formatNotifTime(n.createdAt)}</p>
                              </div>
                              <button
                                onClick={(e) => handleDeleteNotif(n._id, e)}
                                className="shrink-0 text-gray-300 hover:text-red-400 transition-colors mt-0.5"
                                title="Dismiss"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Footer */}
                      {notifications.length > 0 && (
                        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                          <button
                            onClick={async () => {
                              try {
                                await Promise.all(
                                  notifications.map((n) => axios.delete(`/api/notifications/${n._id}`))
                                );
                                setNotifications([]);
                                setUnreadCount(0);
                              } catch (_) {}
                            }}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                          >
                            Clear all
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Settings */}
              <button className="p-2 text-gray-400 hover:text-gray-500">
                <Settings className="h-5 w-5" />
              </button>

              {/* User avatar */}
              <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
