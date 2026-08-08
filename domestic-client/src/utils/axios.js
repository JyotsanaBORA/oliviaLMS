import axios from 'axios';

const instance = axios.create({
  baseURL: process.env.REACT_APP_DOM_API_URL || '',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer token to every request
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('dom_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// On 401, clear auth and redirect to login
instance.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('dom_token');
      localStorage.removeItem('dom_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default instance;
