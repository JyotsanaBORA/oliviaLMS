import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './SocketContext';

const InboundCallContext = createContext();

/**
 * InboundCallContext — global LMS-wide tracker for active inbound ViciDial calls.
 *
 * When ViciDial pushes a call with a DID (inbound), every connected user sees a
 * pulsing red banner in the Layout regardless of which page they are on.
 * The banner is cleared when Agent1 finishes/disposes the call, or after a
 * 45-minute safety timeout.
 */
export const InboundCallProvider = ({ children }) => {
  const [activeInbound, setActiveInbound] = useState({
    isActive: false,
    did: '',
    callerName: '',
    callType: '',
  });
  const { onEvent, offEvent } = useSocket();
  const clearTimerRef = useRef(null);

  const setActiveInboundCall = useCallback((did, callerName = '', callType = 'inbound') => {
    setActiveInbound({ isActive: true, did, callerName, callType });
    // Safety auto-clear after 45 minutes
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      setActiveInbound({ isActive: false, did: '', callerName: '', callType: '' });
    }, 45 * 60 * 1000);
  }, []);

  const clearActiveInboundCall = useCallback(() => {
    setActiveInbound({ isActive: false, did: '', callerName: '', callType: '' });
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  // Listen to the ViciDial socket event — fired for inbound AND outbound, but we only
  // trigger the red banner when a DID is present (= inbound).
  useEffect(() => {
    const handleCallData = (callData) => {
      const did = (callData.did || '').toString().trim();
      const callType = callData.callType || 'inbound';
      if (did) {
        setActiveInboundCall(
          did,
          callData.callerName || [callData.firstName, callData.lastName].filter(Boolean).join(' ') || '',
          callType
        );
      }
    };

    if (onEvent) onEvent('vicidialCallData', handleCallData);
    return () => {
      if (offEvent) offEvent('vicidialCallData', handleCallData);
    };
  }, [onEvent, offEvent, setActiveInboundCall]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  return (
    <InboundCallContext.Provider value={{ activeInbound, setActiveInboundCall, clearActiveInboundCall }}>
      {children}
    </InboundCallContext.Provider>
  );
};

export const useInboundCall = () => {
  const context = useContext(InboundCallContext);
  if (!context) throw new Error('useInboundCall must be used within InboundCallProvider');
  return context;
};
