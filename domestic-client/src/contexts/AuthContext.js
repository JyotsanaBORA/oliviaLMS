import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../utils/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('dom_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  // true only while we're processing the URL hash token on first load
  const [bootstrapping, setBootstrapping] = useState(
    () => window.location.hash.startsWith('#token=')
  );

  // Bootstrap from token passed in URL hash (e.g. #token=xxx&user=yyy)
  // This handles the cross-origin redirect from port 3000 login
  useEffect(() => {
    if (window.location.hash && window.location.hash.startsWith('#token=')) {
      try {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const token = params.get('token');
        const userStr = params.get('user');
        if (token && userStr) {
          const userData = JSON.parse(decodeURIComponent(userStr));
          localStorage.setItem('dom_token', token);
          localStorage.setItem('dom_user', JSON.stringify(userData));
          setUser(userData);
          // Clean the hash from the URL
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch { /* ignore parse errors */ }
    }
    setBootstrapping(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/domestic-api/auth/login', { email, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('dom_token', token);
    localStorage.setItem('dom_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('dom_token');
    localStorage.removeItem('dom_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, bootstrapping }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
