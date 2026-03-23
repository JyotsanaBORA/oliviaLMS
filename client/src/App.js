import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { RefreshProvider } from './contexts/RefreshContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Agent1Dashboard from './pages/Agent1Dashboard';
import Agent2Dashboard from './pages/Agent2Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import RestrictedAdminDashboard from './pages/RestrictedAdminDashboard';
import Profile from './pages/Profile';

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <RefreshProvider>
          <SocketProvider>
          <Router>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: '#4ade80',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 5000,
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff',
                  },
                },
              }}
            />
            
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              
              {/* Protected Routes */}
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                {/* Default redirect based on role */}
                <Route index element={<Navigate to="/dashboard" replace />} />
                
                {/* Role-specific dashboards */}
                <Route path="dashboard" element={
                  <ProtectedRoute roles={['agent1']}>
                    <Agent1Dashboard />
                  </ProtectedRoute>
                } />
                
                <Route path="leads" element={
                  <ProtectedRoute roles={['agent2', 'admin', 'superadmin']}>
                    <Agent2Dashboard />
                  </ProtectedRoute>
                } />
                
                <Route path="admin" element={
                  <ProtectedRoute roles={['admin', 'superadmin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                
                <Route path="superadmin" element={
                  <ProtectedRoute roles={['superadmin']}>
                    <SuperAdminDashboard />
                  </ProtectedRoute>
                } />
                
                <Route path="profile" element={
                  <ProtectedRoute roles={['admin', 'superadmin', 'agent1']}>
                    <Profile />
                  </ProtectedRoute>
                } />

                <Route path="restricted-dashboard" element={
                  <ProtectedRoute roles={['restricted_admin', 'superadmin']}>
                    <RestrictedAdminDashboard />
                  </ProtectedRoute>
                } />
              </Route>
              
              {/* Catch all route */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </SocketProvider>
        </RefreshProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
