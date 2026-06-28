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
      localStorage.removeItem('rezzy_role');
      window.location.href = '/login';
    }
    const detail = err.response?.data?.detail;
    const msg =
      Array.isArray(detail) && detail[0]?.msg
        ? String(detail[0].msg).replace(/^Value error, /, '')
        : detail ??
      err.response?.data?.message ??
      err.message ??
      'Unknown error';
    return Promise.reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)));
  }
);

export default client;
