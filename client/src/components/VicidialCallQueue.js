import React, { useState, useEffect, useCallback } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, X, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import { useSocket } from '../contexts/SocketContext';

/**
 * VicidialCallQueue — shows pending Vicidial calls for the logged-in agent.
 * 
 * Props:
 *   onLoadCallData(callData) — called when agent clicks "Load" on a queued call.
 *                               The parent (Agent1Dashboard) opens the Add Lead form
 *                               with pre-populated data.
 *   isFormActive — boolean indicating if the Add Lead form is currently open.
 *                  Prevents auto-opening multiple forms simultaneously.
 */
const VicidialCallQueue = ({ onLoadCallData, isFormActive }) => {
  const [queue, setQueue] = useState([]);
  const [queueCount, setQueueCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { onEvent, offEvent } = useSocket();

  // Fetch pending calls from API
  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/vicidial/queue');
      if (response.data?.success) {
        setQueue(response.data.data.calls || []);
        setQueueCount(response.data.data.count || 0);
      }
    } catch (error) {
      console.error('Error fetching vicidial queue:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch count only (lightweight)
  const fetchQueueCount = useCallback(async () => {
    try {
      const response = await axios.get('/api/vicidial/queue/count');
      if (response.data?.success) {
        setQueueCount(response.data.data.count || 0);
      }
    } catch (error) {
      console.error('Error fetching vicidial queue count:', error);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchQueueCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for real-time vicidial call data
  useEffect(() => {
    console.log('🔌 Setting up ViciDial socket listeners (REAL-TIME mode)...');
    
    const handleNewCall = (callData) => {
      console.log('📞 ViciDial REAL-TIME call received:', callData);
      console.log('🎯 ViciDial workflow: Agent answered call → Data sent to LMS → Auto-opening form');
      
      // Build form-compatible data
      const autoFormData = {
        name: callData.callerName || [callData.firstName, callData.lastName].filter(Boolean).join(' ') || '',
        phone: callData.phoneNumber || '',
        email: callData.email || '',
        address: callData.address || '',
        city: callData.city || '',
        state: callData.state || '',
        zipcode: callData.zipcode || '',
        _vicidialCallId: callData._id,
        _vicidialCallType: callData.callType,
        _vicidialCampaign: callData.campaignName,
        _vicidialDid: callData.did || '',
      };

      // ALWAYS auto-open when ViciDial sends data
      // Reason: ViciDial only sends data for the call the agent is currently on
      // Agent can only be on 1 call at a time. If previous form is open, this is a new call.
      console.log('✅ Auto-opening form with live call data (agent is on call NOW)');
      
      toast(`📞 Live call from ${callData.callerName || callData.phoneNumber || 'Unknown'} – loading form…`, {
        duration: 4000,
        icon: callData.callType === 'inbound' ? '📥' : '📤',
      });

      // Mark the call as active in the backend (non-blocking)
      if (callData._id) {
        axios.put(`/api/vicidial/queue/${callData._id}/activate`).catch(err =>
          console.error('Failed to activate vicidial call:', err)
        );
      }

      // Auto-open the Add Lead form in the parent with pre-filled data
      // This will replace any existing form since agent can only be on 1 call at a time
      if (onLoadCallData) {
        onLoadCallData(autoFormData);
      } else {
        console.warn('⚠️ onLoadCallData callback not provided, adding to queue');
        // Fallback: add to queue so agent can load manually
        setQueue(prev => {
          const updated = [...prev, callData];
          updated.sort((a, b) => {
            if (a.priority === 'high' && b.priority !== 'high') return -1;
            if (a.priority !== 'high' && b.priority === 'high') return 1;
            return new Date(a.receivedAt) - new Date(b.receivedAt);
          });
          return updated;
        });
        setQueueCount(prev => prev + 1);
        setExpanded(true);
      }
    };

    const handleQueueUpdate = (data) => {
      console.log('📊 Queue update received:', data);
      setQueueCount(data.count || 0);
      // Refetch to sync
      fetchQueue();
    };

    if (onEvent) {
      onEvent('vicidialCallData', handleNewCall);
      onEvent('vicidialQueueUpdate', handleQueueUpdate);
      console.log('✅ Socket listeners registered for ViciDial events');
    }

    return () => {
      if (offEvent) {
        offEvent('vicidialCallData', handleNewCall);
        offEvent('vicidialQueueUpdate', handleQueueUpdate);
      }
    };
  }, [onEvent, offEvent, fetchQueue, onLoadCallData]);

  // When user expands the panel, fetch fresh data
  useEffect(() => {
    if (expanded) {
      fetchQueue();
    }
  }, [expanded, fetchQueue]);

  // Load call data into the Add Lead form
  const handleLoadCall = async (call) => {
    try {
      // Mark as active in backend
      await axios.put(`/api/vicidial/queue/${call._id}/activate`);

      // Build form-compatible data
      const formData = {
        name: call.callerName || [call.firstName, call.lastName].filter(Boolean).join(' ') || '',
        phone: call.phoneNumber || '',
        email: call.email || '',
        address: call.address || '',
        city: call.city || '',
        state: call.state || '',
        zipcode: call.zipcode || '',
        // Pass the vicidial call ID so we can mark complete after form submit
        _vicidialCallId: call._id,
        _vicidialCallType: call.callType,
        _vicidialCampaign: call.campaignName,
        _vicidialDid: call.did || '',
      };

      // Remove from local queue
      setQueue(prev => prev.filter(c => c._id !== call._id));
      setQueueCount(prev => Math.max(0, prev - 1));

      // Notify parent component
      onLoadCallData(formData);
    } catch (error) {
      console.error('Error activating call:', error);
      toast.error('Failed to load call data');
    }
  };

  // Skip/dismiss a call
  const handleSkipCall = async (call, e) => {
    e.stopPropagation();
    try {
      await axios.put(`/api/vicidial/queue/${call._id}/skip`);
      setQueue(prev => prev.filter(c => c._id !== call._id));
      setQueueCount(prev => Math.max(0, prev - 1));
      toast.success('Call skipped');
    } catch (error) {
      console.error('Error skipping call:', error);
      toast.error('Failed to skip call');
    }
  };

  // Format time
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  // Always show the panel header so agents know the feature exists.
  // When queue is empty, it shows "0 pending calls" in a collapsed state.

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Phone className="h-5 w-5 text-blue-600" />
            {queueCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold animate-pulse">
                {queueCount}
              </span>
            )}
          </div>
          <span className="font-semibold text-gray-800">
            Vicidial Call Queue
          </span>
          <span className={`text-sm font-medium ${queueCount > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
            {queueCount} pending {queueCount === 1 ? 'call' : 'calls'}
          </span>
        </div>
        <ChevronRight
          className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {/* Expanded queue list */}
      {expanded && (
        <div className="border-t border-gray-200">
          {loading && queue.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading queue...
            </div>
          ) : queue.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-gray-400">
              <AlertCircle className="h-5 w-5 mr-2" />
              No pending calls in queue
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {queue.map((call) => (
                <li
                  key={call._id}
                  className={`flex items-center justify-between px-4 py-3 transition-colors cursor-pointer border-l-4 ${
                    call.callType === 'inbound' 
                      ? 'border-l-red-500 bg-red-50 hover:bg-red-100' 
                      : 'border-l-blue-500 bg-blue-50 hover:bg-blue-100'
                  }`}
                  onClick={() => handleLoadCall(call)}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    {/* Call type icon with color coding */}
                    {call.callType === 'inbound' ? (
                      <div className="flex items-center space-x-1">
                        <PhoneIncoming className="h-4 w-4 text-red-600 flex-shrink-0" />
                        {call.did && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-300">
                            DID
                          </span>
                        )}
                      </div>
                    ) : (
                      <PhoneOutgoing className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    )}

                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        call.callType === 'inbound' ? 'text-red-700' : 'text-blue-700'
                      }`}>
                        {call.callerName || call.firstName || 'Unknown Caller'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {call.phoneNumber || 'No phone'} 
                        {call.did ? ` • DID: ${call.did}` : ''}
                        {call.campaignName ? ` • ${call.campaignName}` : ''}
                        {call.receivedAt ? ` • ${formatTime(call.receivedAt)}` : ''}
                      </p>
                    </div>

                    {/* Priority badge */}
                    {call.priority === 'high' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 flex-shrink-0">
                        LIVE
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                    <button
                      onClick={(e) => handleSkipCall(call, e)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Skip call"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadCall(call);
                      }}
                      className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                    >
                      Load
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default VicidialCallQueue;
