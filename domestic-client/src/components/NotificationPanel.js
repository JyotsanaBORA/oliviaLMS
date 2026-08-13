import React, { useEffect, useState, useCallback } from 'react';
import { Bell, Phone, MapPin, Briefcase, Download } from 'lucide-react';
import api from '../utils/axios';
import toast from 'react-hot-toast';

const fmtTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * NotificationPanel
 * Shows unread website lead notifications for the logged-in agent.
 * Real-time updates via Socket.io (socket prop passed from parent).
 * Each card has a "Load" button  clicking it claims the lead exclusively.
 */
const NotificationPanel = ({ socket, onLeadLoaded }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [claiming, setClaiming]           = useState(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/domestic-api/notifications');
      setNotifications(res.data?.data || []);
    } catch (err) {
      console.error('[Notifications]', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Socket.io listeners
  useEffect(() => {
    if (!socket) return;

    // New lead arrived  add to notification list
    socket.on('new_website_lead', (lead) => {
      setNotifications((prev) => [{
        _id:       `socket-${lead.leadId}`,
        websiteLead: {
          _id:         lead.leadId,
          name:        lead.name,
          mobile:      lead.mobile,
          productType: lead.productType,
          city:        lead.city,
          createdAt:   lead.createdAt,
          status:      'new',
        },
        createdAt: new Date().toISOString(),
      }, ...prev]);

      toast(`New lead: ${lead.name}  ${lead.productType}`, {
        icon: '',
        duration: 6000,
        style: { fontWeight: 'bold' },
      });
    });

    // Lead was loaded by someone  remove from all panels
    socket.on('lead_loaded', ({ leadId }) => {
      setNotifications((prev) =>
        prev.filter((n) => n.websiteLead?._id?.toString() !== leadId.toString())
      );
    });

    return () => {
      socket.off('new_website_lead');
      socket.off('lead_loaded');
    };
  }, [socket]);

  const handleLoad = async (notification) => {
    const leadId = notification.websiteLead?._id;
    if (!leadId) return;
    setClaiming(leadId);
    try {
      const res = await api.post(`/domestic-api/website-leads/${leadId}/load`);
      if (res.data?.success) {
        // Remove from notifications locally  socket will also fire
        setNotifications((prev) =>
          prev.filter((n) => n.websiteLead?._id?.toString() !== leadId.toString())
        );
        toast.success('Lead loaded! It appears in your My Leads list.');
        onLeadLoaded && onLeadLoaded(res.data.data);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not load lead.';
      toast.error(msg);
      // Refresh to get latest state
      fetchNotifications();
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <span className="w-5 h-5 border-2 border-gray-300 border-t-[#065F36] rounded-full animate-spin mr-2" />
        Loading notifications
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center">
          <Bell className="h-7 w-7 text-gray-300" />
        </div>
        <div className="text-center">
          <p className="text-gray-600 font-semibold text-sm">All caught up!</p>
          <p className="text-gray-400 text-xs mt-1">New leads will appear here in real-time</p>
        </div>
      </div>
    );
  }

  // Map product type to a color theme
  const getLeadColor = (productType) => {
    const t = (productType || '').toLowerCase();
    if (t.includes('personal')) return { bg: 'from-blue-500 to-blue-600', light: 'bg-blue-50 border-blue-200' };
    if (t.includes('home'))     return { bg: 'from-emerald-500 to-teal-600', light: 'bg-emerald-50 border-emerald-200' };
    if (t.includes('car'))      return { bg: 'from-orange-400 to-orange-500', light: 'bg-orange-50 border-orange-200' };
    if (t.includes('business')) return { bg: 'from-violet-500 to-purple-600', light: 'bg-violet-50 border-violet-200' };
    if (t.includes('credit'))   return { bg: 'from-pink-500 to-rose-500', light: 'bg-pink-50 border-pink-200' };
    if (t.includes('insurance'))return { bg: 'from-indigo-500 to-blue-600', light: 'bg-indigo-50 border-indigo-200' };
    return { bg: 'from-[#065F36] to-[#00A651]', light: 'bg-[#E8FFF5] border-[#D1FAE5]' };
  };

  return (
    <div className="space-y-3">
      {notifications.map((notif) => {
        const lead      = notif.websiteLead || {};
        const isLoading = claiming === lead._id?.toString();
        const colors    = getLeadColor(lead.productType);

        return (
          <div
            key={notif._id}
            className={`relative overflow-hidden flex items-center justify-between gap-3 p-4 rounded-2xl border ${colors.light} hover:shadow-md transition-all`}
          >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${colors.bg} rounded-l-2xl`} />
            
            <div className="flex items-center gap-3 min-w-0 pl-2">
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center text-white font-black text-sm shadow-sm flex-shrink-0`}>
                {lead.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800 truncate">{lead.name || ''}</p>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse flex-shrink-0" />
                  {lead.source === 'meta' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#1877F2] text-white leading-none">f Meta Ads</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="text-xs text-gray-500 font-mono">{lead.mobile}</span>
                  {lead.city && <span className="text-xs text-gray-400">{lead.city}</span>}
                  {lead.productType && (
                    <span className="text-xs font-semibold text-gray-600 capitalize">{lead.productType.replace(/_/g,' ')}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{fmtTime(lead.createdAt)}</p>
              </div>
            </div>

            <button
              onClick={() => handleLoad(notif)}
              disabled={isLoading}
              className={`flex-shrink-0 flex items-center gap-1.5 bg-gradient-to-r ${colors.bg} disabled:from-gray-300 disabled:to-gray-400 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition-all hover:shadow-md hover:scale-105 active:scale-95`}
            >
              {isLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {isLoading ? 'Loading' : 'Load Lead'}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default NotificationPanel;


