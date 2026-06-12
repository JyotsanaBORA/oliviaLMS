import React, { useEffect, useState, useCallback } from 'react';
import { Bell, Phone, MapPin, Briefcase, Download } from 'lucide-react';
import api from '../utils/axios';
import toast from 'react-hot-toast';

const fmtTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * NotificationPanel
 * Shows unread website lead notifications for the logged-in agent.
 * Real-time updates via Socket.io (socket prop passed from parent).
 * Each card has a "Load" button — clicking it claims the lead exclusively.
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

    // New lead arrived — add to notification list
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

      toast(`New lead: ${lead.name} — ${lead.productType}`, {
        icon: '🔔',
        duration: 6000,
        style: { fontWeight: 'bold' },
      });
    });

    // Lead was loaded by someone — remove from all panels
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
        // Remove from notifications locally — socket will also fire
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
        Loading notifications…
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No new leads — you are all caught up!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notifications.map((notif) => {
        const lead      = notif.websiteLead || {};
        const isLoading = claiming === lead._id?.toString();

        return (
          <div
            key={notif._id}
            className="flex items-start justify-between gap-3 p-4 bg-[#F0FFF8] border border-[#D1FAE5] rounded-xl hover:bg-[#E8FFF5] transition-colors"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 w-2.5 h-2.5 bg-[#00A651] rounded-full animate-pulse flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 truncate">{lead.name || '—'}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {lead.mobile}
                  </span>
                  {lead.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {lead.city}
                    </span>
                  )}
                  {lead.productType && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {lead.productType}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">{fmtTime(lead.createdAt)}</p>
              </div>
            </div>

            <button
              onClick={() => handleLoad(notif)}
              disabled={isLoading}
              className="flex-shrink-0 flex items-center gap-1.5 bg-[#065F36] hover:bg-[#054A2E] disabled:bg-gray-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              {isLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {isLoading ? 'Loading…' : 'Load'}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default NotificationPanel;

