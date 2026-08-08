import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage              from './pages/LoginPage';
import DomAgentDashboard      from './pages/DomAgentDashboard';
import DomAdminDashboard      from './pages/DomAdminDashboard';
import DomSuperAdminDashboard from './pages/DomSuperAdminDashboard';

// Route guard
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, bootstrapping } = useAuth();
  if (bootstrapping) return null; // wait for hash token to be processed
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const AppRoutes = () => {
  const { isAuthenticated, user, bootstrapping } = useAuth();

  if (bootstrapping) return null; // don't render routes until auth is resolved

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to={
                user.role === 'dom_superadmin' ? '/superadmin' :
                user.role === 'dom_admin'      ? '/admin'      : '/agent'
              } replace />
            : <LoginPage />
        }
      />

      <Route
        path="/agent"
        element={
          <ProtectedRoute allowedRoles={['domagent']}>
            <DomAgentDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['dom_admin']}>
            <DomAdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superadmin"
        element={
          <ProtectedRoute allowedRoles={['dom_superadmin']}>
            <DomSuperAdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

const App = () => (
  <BrowserRouter basename={process.env.PUBLIC_URL || ''}>
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { fontSize: '14px' },
        }}
      />
      <AppRoutes />
    </AuthProvider>
  </BrowserRouter>
);

export default App;
