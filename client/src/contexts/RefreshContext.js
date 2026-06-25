import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';

const RefreshContext = createContext();

export const useRefresh = () => {
  const context = useContext(RefreshContext);
  if (!context) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return context;
};

export const RefreshProvider = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refreshCallbacksRef = useRef({});

  // Register a refresh callback for a specific dashboard
  const registerRefreshCallback = useCallback((dashboardType, callback) => {
    refreshCallbacksRef.current[dashboardType] = callback;
  }, []);

  // Unregister refresh callback
  const unregisterRefreshCallback = useCallback((dashboardType) => {
    if (!refreshCallbacksRef.current[dashboardType]) return;
    delete refreshCallbacksRef.current[dashboardType];
  }, []);

  // Trigger refresh for a specific dashboard
  const triggerRefresh = useCallback((dashboardType) => {
    const cb = refreshCallbacksRef.current[dashboardType];
    if (cb) {
      cb();
    }
    // Also increment the general refresh trigger
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // General refresh trigger for components that watch refreshTrigger
  const triggerGeneralRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const value = useMemo(() => ({
    refreshTrigger,
    registerRefreshCallback,
    unregisterRefreshCallback,
    triggerRefresh,
    triggerGeneralRefresh
  }), [refreshTrigger, registerRefreshCallback, unregisterRefreshCallback, triggerRefresh, triggerGeneralRefresh]);

  return (
    <RefreshContext.Provider value={value}>
      {children}
    </RefreshContext.Provider>
  );
};