import axios from 'axios';

// Resolve a safe API base URL
const resolveApiBaseUrl = () => {
  const envUrl = process.env.REACT_APP_API_URL;
  const fallback = 'http://localhost:5000';

  if (!envUrl || envUrl.trim() === '') return fallback;

  // If starts with ':' or missing protocol/host, use fallback
  const trimmed = envUrl.trim();
  const looksInvalid = trimmed.startsWith(':') || !/^https?:\/\//i.test(trimmed);
  if (looksInvalid) return fallback;

  try {
    // Validate URL parsing
    const u = new URL(trimmed);
    return `${u.protocol}//${u.host}`;
  } catch (_) {
    return fallback;
  }
};

export const apiBaseURL = resolveApiBaseUrl();

// Create axios instance with base configuration
const axiosInstance = axios.create({
  baseURL: apiBaseURL,
  timeout: 30000, // Increased to 30s for production data loads
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't automatically redirect on 401 - let AuthContext handle it
    // Just pass the error through
    return Promise.reject(error);
  }
);

export default axiosInstance;
