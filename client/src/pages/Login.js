import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import axios from 'axios';

const DOMESTIC_URL = process.env.REACT_APP_DOMESTIC_URL || 'http://localhost:3004';

const Login = () => {
  const { login, isAuthenticated, loading, user, clearError } = useAuth();
  const location = useLocation();

  const [mode, setMode] = useState('international'); // 'international' | 'domestic'
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [domError, setDomError] = useState('');

  const getRedirectPath = (userRole) => {
    switch (userRole) {
      case 'superadmin':        return '/super-admin-dashboard';
      case 'admin':             return '/admin-dashboard';
      case 'restricted_admin':  return '/restricted-dashboard';
      case 'agent1':            return '/agent1-dashboard';
      case 'agent2':            return '/agent2-dashboard';
      default:                  return '/dashboard';
    }
  };

  useEffect(() => {
    clearError();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form + errors when switching modes
  const switchMode = (m) => {
    setMode(m);
    setFormData({ email: '', password: '' });
    setDomError('');
  };

  if (loading) return <LoadingSpinner message="Checking authentication..." />;

  if (isAuthenticated && user && mode === 'international') {
    const redirectPath = getRedirectPath(user.role);
    const from = location.state?.from?.pathname || redirectPath;
    return <Navigate to={from} replace />;
  }

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  // ── International submit ────────────────────────────────────────────────────
  const handleIntlSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await login(formData);
      if (!result.success) console.error('Login failed:', result.error);
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Domestic submit — login via proxy → /domestic-api/auth/login ───────────
  const handleDomSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setDomError('');
    try {
      const res = await axios.post('/domestic-api/auth/login', formData);
      const { token, user: domUser } = res.data;
      // Pass token + user in URL hash so the domestic client (different port)
      // can read and store them — localStorage is not shared across ports
      const hash = `#token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(domUser))}`;
      window.location.href = DOMESTIC_URL + hash;
    } catch (err) {
      setDomError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDomestic = mode === 'domestic';

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{
        backgroundImage: `url(/rgbg.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}
    >
      <div className="w-full max-w-md">
        <div className="relative bg-white/20 backdrop-blur-xl rounded-3xl shadow-2xl px-8 py-10 space-y-8 border border-white/30 transition-all duration-300 hover:shadow-blue-300">

          {/* Header */}
          <div className="flex flex-col items-center mb-4">
            <h1 className="text-3xl font-extrabold text-white tracking-wide drop-shadow-2xl" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.7)' }}>
              IMMERGIX
            </h1>
            <span className="text-xs text-white font-medium" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>A Reddington Global Consultancy Pvt. Ltd. Company</span>
          </div>

          {/* Avatar + Title */}
          <div className="flex flex-col items-center">
            <div className={`h-16 w-16 flex items-center justify-center rounded-full shadow-lg mb-2 animate-bounce bg-gradient-to-br ${isDomestic ? 'from-orange-500 to-red-600' : 'from-blue-600 to-purple-600'}`}>
              <User className="h-9 w-9 text-white" />
            </div>
            <h2 className="mt-2 text-center text-4xl font-extrabold text-white drop-shadow-2xl" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.7)' }}>
              Welcome Back
            </h2>
            <p className="text-sm text-white mt-1 font-medium" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
              {isDomestic ? 'Domestic Process — Sign in' : 'Sign in to your LMS account'}
            </p>
          </div>

          {/* Process toggle */}
          <div className="flex items-center gap-2 bg-white/10 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => switchMode('international')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${!isDomestic ? 'bg-white text-blue-800 shadow' : 'text-white/80 hover:bg-white/20'}`}
            >
              International Process
            </button>
            <button
              type="button"
              onClick={() => switchMode('domestic')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all ${isDomestic ? 'bg-orange-500 text-white shadow' : 'text-white/80 hover:bg-white/20'}`}
            >
              Domestic Process
            </button>
          </div>

          {/* Form */}
          <form className="space-y-6" onSubmit={isDomestic ? handleDomSubmit : handleIntlSubmit} autoComplete="off">
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-white" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
                  Email address
                </label>
                <div className="mt-1 relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="block w-full px-4 py-3 pl-12 rounded-xl bg-white/95 border border-white/50 placeholder-gray-400 text-gray-900 shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={handleChange}
                  />
                  <Mail className="h-5 w-5 text-blue-400 absolute left-4 top-3.5" />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-white" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
                  Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="block w-full px-4 py-3 pl-12 pr-12 rounded-xl bg-white/95 border border-white/50 placeholder-gray-400 text-gray-900 shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                  />
                  <Lock className="h-5 w-5 text-purple-400 absolute left-4 top-3.5" />
                  <button
                    type="button"
                    className="absolute right-4 top-3.5 text-gray-400 hover:text-blue-600 transition"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Domestic error */}
            {isDomestic && domError && (
              <div className="bg-red-500/80 text-white text-sm font-semibold rounded-xl px-4 py-2 text-center">
                {domError}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full flex justify-center items-center py-3 px-4 rounded-xl font-bold text-white shadow-lg hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${isDomestic ? 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 focus:ring-orange-500' : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:ring-blue-500'}`}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Signing in...
                  </>
                ) : (
                  `Sign in${isDomestic ? ' to Domestic LMS' : ''}`
                )}
              </button>
            </div>

            <div className="text-center mt-4">
              <div className="text-sm text-white font-semibold" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
                Demo Account:
              </div>
              {/* <div className="mt-2 space-y-1 text-xs text-gray-500">
                <div className="font-mono">SuperAdmin: <span className="text-blue-700">vishal@lms.com</span> / <span className="text-purple-700">@dm!n123</span></div>
                <div className="text-red-500 font-semibold">Note: SuperAdmin can create organizations and users</div>
              </div> */}
            </div>
          </form>
          <div className="mt-6 text-center text-xs text-white/80" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
            &copy; {new Date().getFullYear()} IMMERGIX LMS. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

