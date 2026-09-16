import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { RefreshProvider } from './contexts/RefreshContext';
import { InboundCallProvider } from './contexts/InboundCallContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/common/LoadingSpinner';

// Lazy-loaded route components for high-performance code splitting
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Agent1Dashboard = lazy(() => import('./pages/Agent1Dashboard'));
const Agent2Dashboard = lazy(() => import('./pages/Agent2Dashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const RestrictedAdminDashboard = lazy(() => import('./pages/RestrictedAdminDashboard'));
const AffiliateDashboard = lazy(() => import('./pages/AffiliateDashboard'));
const DataVendorDashboard = lazy(() => import('./pages/DataVendorDashboard'));
const PaymentStatus = lazy(() => import('./pages/PaymentStatus'));
const Profile = lazy(() => import('./pages/Profile'));
const Chat = lazy(() => import('./pages/Chat'));

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <RefreshProvider>
          <SocketProvider>
          <InboundCallProvider>
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
            
            <Suspense fallback={
              <div className="flex h-screen w-full items-center justify-center bg-gray-50">
                <LoadingSpinner size="lg" text="Loading LMS..." />
              </div>
            }>
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
                  <ProtectedRoute roles={['admin', 'superadmin', 'sub_agent', 'vendor_agent']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                
                <Route path="superadmin" element={
                  <ProtectedRoute roles={['superadmin']}>
                    <SuperAdminDashboard />
                  </ProtectedRoute>
                } />
                
                <Route path="profile" element={
                  <ProtectedRoute roles={['admin', 'superadmin', 'agent1', 'agent2', 'sub_agent', 'vendor_agent']}>
                    <Profile />
                  </ProtectedRoute>
                } />

                <Route path="restricted-dashboard" element={
                  <ProtectedRoute roles={['restricted_admin', 'superadmin']}>
                    <RestrictedAdminDashboard />
                  </ProtectedRoute>
                } />

                <Route path="affiliate" element={
                  <ProtectedRoute roles={['affiliate_admin', 'superadmin']}>
                    <AffiliateDashboard />
                  </ProtectedRoute>
                } />

                <Route path="vendor-dashboard" element={
                  <ProtectedRoute roles={['data_vendor', 'superadmin', 'admin']}>
                    <DataVendorDashboard />
                  </ProtectedRoute>
                } />

                <Route path="vendor-payment-status" element={
                  <ProtectedRoute roles={['data_vendor', 'superadmin', 'admin']}>
                    <DataVendorDashboard />
                  </ProtectedRoute>
                } />

                <Route path="payment-status" element={
                  <ProtectedRoute roles={['admin', 'superadmin']}>
                    <PaymentStatus />
                  </ProtectedRoute>
                } />

                <Route path="chat" element={
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                } />
              </Route>
              
              {/* Catch all route */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </Router>
          </InboundCallProvider>
        </SocketProvider>
        </RefreshProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
