import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

const api = axios.create({ baseURL: BASE_URL });

// ── Request: attach JWT ───────────────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('dps_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: refresh expired JWT, retry once ────────────────────────────────
let _refreshing = false;
let _refreshQueue = [];

async function processRefreshQueue(newToken, error) {
  _refreshQueue.forEach((cb) => (error ? cb.reject(error) : cb.resolve(newToken)));
  _refreshQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }

    if (_refreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    _refreshing = true;

    try {
      const resp = await api.post('/api/auth/refresh');
      const { token } = resp.data;
      await SecureStore.setItemAsync('dps_token', token);
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      processRefreshQueue(token, null);
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshErr) {
      processRefreshQueue(null, refreshErr);
      await SecureStore.deleteItemAsync('dps_token');
      return Promise.reject(refreshErr);
    } finally {
      _refreshing = false;
    }
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const loginWithPin = async (techId, pin) => {
  const res = await api.post('/api/auth/pin-login', { techId, pin });
  return res.data;
};

export const loginWithPassword = async (email, password) => {
  const res = await api.post('/api/auth/login', { email, password });
  return res.data;
};

export const getMe = async () => {
  const res = await api.get('/api/auth/me');
  return res.data;
};

export const getTechs = async () => {
  const res = await api.get('/api/technicians');
  return res.data;
};

// ── Jobs ──────────────────────────────────────────────────────────────────────
export const getMyJobs = async (date) => {
  const params = date ? { date } : {};
  const res = await api.get('/api/jobs', { params });
  return res.data;
};

export const getJob = async (id) => {
  const res = await api.get(`/api/jobs/${id}`);
  return res.data;
};

export const updateJobStatus = async (id, status) => {
  const res = await api.patch(`/api/jobs/${id}`, { status });
  return res.data;
};

export const addJobNote = async (id, note) => {
  const res = await api.patch(`/api/jobs/${id}`, { notes: note });
  return res.data;
};

export const getJobPhotos = async (id) => {
  const res = await api.get(`/api/jobs/${id}/photos`);
  return res.data;
};

export const uploadJobPhoto = async (jobId, uri, mimeType = 'image/jpeg') => {
  const filename = uri.split('/').pop();
  const formData = new FormData();
  formData.append('photo', { uri, name: filename, type: mimeType });
  const res = await api.post(`/api/jobs/${jobId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

// ── GPS ───────────────────────────────────────────────────────────────────────
export const pingGps = async (lat, lng, onDuty = true) => {
  const res = await api.post('/api/gps/ping', { lat, lng, on_duty: onDuty });
  return res.data;
};

// ── Customers ─────────────────────────────────────────────────────────────────
export const getCustomer = async (id) => {
  const res = await api.get(`/api/customers/${id}`);
  return res.data;
};

// ── Payments ──────────────────────────────────────────────────────────────────
export const createPaymentIntent = async (jobId, amountCents) => {
  const res = await api.post('/api/square/payment-intent', { jobId, amount: amountCents });
  return res.data;
};

export default api;
