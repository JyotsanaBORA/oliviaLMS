import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

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
  const [refreshCallbacks, setRefreshCallbacks] = useState({});

  // Register a refresh callback for a specific dashboard
  const registerRefreshCallback = useCallback((dashboardType, callback) => {
    setRefreshCallbacks(prev => {
      // Avoid unnecessary state updates that can cause render loops.
      if (prev[dashboardType] === callback) return prev;
      return {
        ...prev,
        [dashboardType]: callback
      };
    });
  }, []);

  // Unregister refresh callback
  const unregisterRefreshCallback = useCallback((dashboardType) => {
    setRefreshCallbacks(prev => {
      if (!prev[dashboardType]) return prev;
      const { [dashboardType]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  // Trigger refresh for a specific dashboard
  const triggerRefresh = useCallback((dashboardType) => {
    if (refreshCallbacks[dashboardType]) {
      refreshCallbacks[dashboardType]();
    }
    // Also increment the general refresh trigger
    setRefreshTrigger(prev => prev + 1);
  }, [refreshCallbacks]);

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