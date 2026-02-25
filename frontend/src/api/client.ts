import axios from 'axios';

const TOKEN_KEY = 'rezzy_token';

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Clear stale token and bounce to login
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('rezzy_username');
      window.location.href = '/login';
    }
    const msg =
      err.response?.data?.detail ??
      err.response?.data?.message ??
      err.message ??
      'Unknown error';
    return Promise.reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)));
  }
);

export default client;
