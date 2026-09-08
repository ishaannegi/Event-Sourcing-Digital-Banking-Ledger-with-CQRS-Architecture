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
      config.headers['Authorization'] = `Bearer ${inMemoryToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const loginApi = async (username, password) => {
  const response = await api.post('/auth/login', { username, password });
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

export default api;
