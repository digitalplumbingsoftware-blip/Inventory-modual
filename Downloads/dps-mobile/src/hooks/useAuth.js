import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getMe } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('dps_token');
        if (token) {
          const me = await getMe();
          setUser(me);
        }
      } catch {
        await SecureStore.deleteItemAsync('dps_token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (token, userData) => {
    await SecureStore.setItemAsync('dps_token', token);
    setUser(userData);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('dps_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
