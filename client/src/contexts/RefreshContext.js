import React, { createContext, useContext, useState } from 'react';

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
  const registerRefreshCallback = (dashboardType, callback) => {
    setRefreshCallbacks(prev => ({
      ...prev,
      [dashboardType]: callback
    }));
  };

  // Unregister refresh callback
  const unregisterRefreshCallback = (dashboardType) => {
    setRefreshCallbacks(prev => {
      const { [dashboardType]: removed, ...rest } = prev;
      return rest;
    });
  };

  // Trigger refresh for a specific dashboard
  const triggerRefresh = (dashboardType) => {
    if (refreshCallbacks[dashboardType]) {
      refreshCallbacks[dashboardType]();
    }
    // Also increment the general refresh trigger
    setRefreshTrigger(prev => prev + 1);
  };

  // General refresh trigger for components that watch refreshTrigger
  const triggerGeneralRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const value = {
    refreshTrigger,
    registerRefreshCallback,
    unregisterRefreshCallback,
    triggerRefresh,
    triggerGeneralRefresh
  };

  return (
    <RefreshContext.Provider value={value}>
      {children}
    </RefreshContext.Provider>
  );
};