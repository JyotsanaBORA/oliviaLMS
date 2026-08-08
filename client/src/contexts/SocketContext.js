import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { apiBaseURL } from '../utils/axios';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const SocketContext = createContext();

// Socket.IO connection target — bypasses CRA dev proxy (which is unreliable for
// WebSocket upgrades) by connecting directly to the backend in development.
// Priority: REACT_APP_SOCKET_URL → REACT_APP_API_URL → http://localhost:5000 (dev) → window.origin (prod)
const resolveSocketUrl = () => {
  const explicit = (process.env.REACT_APP_SOCKET_URL || '').trim();
  if (explicit) return explicit;
  if (apiBaseURL) return apiBaseURL;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:5000';
  }
  return undefined; // same-origin
};
const socketUrl = resolveSocketUrl();

export const SocketProvider = ({ children }) => {
  const socket = useRef(null);
  const { user, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      try {
        console.log('[SocketContext] Connecting to socket server:', socketUrl || '(same-origin)');
        // Initialize socket connection with better error handling
        socket.current = io(socketUrl, {
          transports: ['websocket', 'polling'],
          upgrade: true,
          timeout: 20000,
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
          maxReconnectionAttempts: 5,
          forceNew: false, // Don't force new connection
          auth: {
            userId: user._id,
            userRole: user.role,
            organizationId: user.organization || user.organizationId || undefined
          }
        });

        // Join user-specific room
        socket.current.emit('join-room', `user-${user._id}`);
        socket.current.emit('join-room', user.role);

      // Socket event listeners
      socket.current.on('connect', () => {
        console.log('Socket connected to server');
        setIsConnected(true);
      });

      socket.current.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
      });

      socket.current.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setIsConnected(false);
      });

      // Lead events
      socket.current.on('leadCreated', (data) => {
        try {
          if (user.role === 'agent2' || user.role === 'admin') {
            toast.success(`New lead added by ${data.createdBy}`);
          }
          // Trigger refresh of leads list
          window.dispatchEvent(new CustomEvent('refreshLeads'));
        } catch (error) {
          console.error('Error handling leadCreated event:', error);
        }
      });

      socket.current.on('leadUpdated', (data) => {
        try {
          if (user.role === 'agent1' || user.role === 'admin') {
            toast.success(`Lead updated by ${data.updatedBy}`);
          }
          // Trigger refresh of leads list
          window.dispatchEvent(new CustomEvent('refreshLeads'));
        } catch (error) {
          console.error('Error handling leadUpdated event:', error);
        }
      });

      socket.current.on('leadReassigned', (data) => {
        try {
          // Show notification to relevant users
          if (user.role === 'admin' || user.role === 'agent2') {
            toast.success(`Lead reassigned from ${data.previousAgent} to ${data.newAgent} by ${data.reassignedBy}`);
          }
          // Trigger refresh of leads list
          window.dispatchEvent(new CustomEvent('refreshLeads'));
        } catch (error) {
          console.error('Error handling leadReassigned event:', error);
        }
      });

      socket.current.on('leadDeleted', (data) => {
        try {
          // Only show toast for non-admin/non-superadmin users to avoid conflicts
          if (user.role === 'agent1' || user.role === 'agent2') {
            toast.info(`A lead was removed by ${data.deletedBy}`);
          }
          // Trigger refresh of leads list
          window.dispatchEvent(new CustomEvent('refreshLeads'));
        } catch (error) {
          console.error('Error handling leadDeleted event:', error);
        }
      });

      // Admin dashboard real-time updates
      if (user.role === 'admin') {
        socket.current.on('statsUpdated', (data) => {
          // Trigger dashboard stats refresh
          window.dispatchEvent(new CustomEvent('refreshStats', { detail: data }));
        });
      }

      // Vicidial call data — dispatch window event so agent dashboards can auto-fill
      socket.current.on('vicidialCallData', (data) => {
        try {
          console.log('[SocketContext] 📡 vicidialCallData received from server', {
            userRole: user.role,
            userId: user._id,
            data,
          });
          if (user.role === 'agent1' || user.role === 'agent2') {
            console.log('[SocketContext] ✅ Dispatching vicidialCallReceived window event');
            window.dispatchEvent(new CustomEvent('vicidialCallReceived', { detail: data }));
          } else {
            console.warn('[SocketContext] ⚠️ User role not agent1/agent2 — skipping dispatch. role =', user.role);
          }
        } catch (error) {
          console.error('[SocketContext] ❌ Error handling vicidialCallData event:', error);
        }
      });

        return () => {
          if (socket.current) {
            socket.current.disconnect();
          }
          setIsConnected(false);
        };
      } catch (error) {
        console.error('Error initializing socket connection:', error);
      }
    }
  }, [isAuthenticated, user]);

  // Socket methods — useCallback with isConnected dep ensures consumers
  // re-run their effects once the socket is actually connected.
  const emitEvent = useCallback((event, data) => {
    if (socket.current) {
      socket.current.emit(event, data);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const onEvent = useCallback((event, callback) => {
    if (socket.current) {
      socket.current.on(event, callback);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const offEvent = useCallback((event, callback) => {
    if (socket.current) {
      socket.current.off(event, callback);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const value = {
    socket: socket.current,
    isConnected,
    emitEvent,
    onEvent,
    offEvent
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  
  return context;
};

export default SocketContext;
