import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080';

let inMemoryToken = null;

export const setAuthToken = (token) => {
  inMemoryToken = token;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    if (inMemoryToken) {
      config.headers.Authorization = `Bearer ${inMemoryToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const loginApi = async (username, password) => {
  const response = await api.post('/auth/login', { username, password });
  return response.data;
};

export const registerApi = async (username, password, role = 'CUSTOMER') => {
  const response = await api.post('/auth/register', { username, password, role });
  return response.data;
};

export const getAccountApi = async (accountId) => {
  const response = await api.get(`/accounts/${accountId}`);
  return response.data;
};

export const getBalanceViewApi = async (accountId) => {
  const response = await api.get(`/accounts/${accountId}/balance-view`);
  return response.data;
};

export const openAccountApi = async (ownerName, initialBalance) => {
  const response = await api.post('/accounts', { ownerName, initialBalance });
  return response.data;
};

export const depositApi = async (accountId, amount) => {
  const response = await api.post(`/accounts/${accountId}/deposit`, { amount });
  return response.data;
};

export const withdrawApi = async (accountId, amount) => {
  const response = await api.post(`/accounts/${accountId}/withdraw`, { amount });
  return response.data;
};

export const transferApi = async (fromAccountId, toAccountId, amount) => {
  const response = await api.post('/accounts/transfer', { fromAccountId, toAccountId, amount });
  return response.data;
};

export const getAccountEventsApi = async (accountId) => {
  const response = await api.get(`/accounts/${accountId}/events`);
  return response.data;
};

export const getHistoricalBalanceApi = async (accountId, timestamp) => {
  const response = await api.get(`/audit/accounts/${accountId}/balance-at`, {
    params: { timestamp }
  });
  return response.data;
};

export const getRegulatoryReportApi = async (from, to) => {
  const response = await api.get('/audit/report', {
    params: { from, to }
  });
  return response.data;
};

export default api;
