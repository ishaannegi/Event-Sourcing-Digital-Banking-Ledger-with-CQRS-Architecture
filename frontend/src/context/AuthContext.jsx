import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginApi, setAuthToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({
    token: null,
    username: null,
    role: null,
    isAuthenticated: false,
  });

  useEffect(() => {
    setAuthToken(auth.token);
  }, [auth.token]);

  const login = async (username, password) => {
    try {
      const data = await loginApi(username, password);
      // data contains { token, username, role }
      setAuthToken(data.token);
      setAuth({
        token: data.token,
        username: data.username,
        role: data.role,
        isAuthenticated: true,
      });
      return { success: true, user: data };
    } catch (error) {
      setAuthToken(null);
      setAuth({
        token: null,
        username: null,
        role: null,
        isAuthenticated: false,
      });
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Invalid credentials or login failed';
      return { success: false, error: errorMessage, status: error.response?.status };
    }
  };

  const logout = () => {
    setAuthToken(null);
    setAuth({
      token: null,
      username: null,
      role: null,
      isAuthenticated: false,
    });
  };

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
