import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { scrollToTop } from '../utils/scrollUtils';
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
  Database
} from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';

const Layout = ({ onDashboardRefresh }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, loading } = useAuth();
  const { triggerRefresh } = useRefresh();
  const location = useLocation();
  const navigate = useNavigate();

  // Prevent copying FROM the dashboard for all non-superadmin roles.
  // Paste INTO the dashboard is intentionally allowed.
  useEffect(() => {
    const restrictedRoles = ['admin', 'agent1', 'agent2', 'restricted_admin'];
    if (!user || !restrictedRoles.includes(user.role)) return;

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
        ...baseItems
      ];
    } else if (user.role === 'admin') {
      return [
        { name: 'Dashboard', href: '/admin', icon: BarChart3 },
        { name: 'Today Leads', href: '/leads', icon: Users },
        ...baseItems
      ];
    } else if (user.role === 'agent2') {
      return [
        { name: 'Leads', href: '/leads', icon: Users }
      ];
    } else if (user.role === 'restricted_admin') {
      return [
        { name: 'Dashboard', href: '/restricted-dashboard', icon: Database }
      ];
    } else {
      return [
        { name: 'Dashboard', href: '/dashboard', icon: Home },
        ...baseItems
      ];
    }
  };

  const navItems = getNavItems();

  const isActive = (href) => location.pathname === href;

  const isRestricted = user && ['admin', 'agent1', 'agent2'].includes(user.role);

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
                 user.role === 'restricted_admin' ? 'Restricted Admin' : 'Super Administrator'}
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
              {/* Notifications */}
              <button className="p-2 text-gray-400 hover:text-gray-500">
                <Bell className="h-5 w-5" />
              </button>
              
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
