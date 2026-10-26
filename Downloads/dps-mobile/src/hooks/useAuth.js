import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getMe, logoutBackend } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hard 10-second safety net — never let a stale token hang the app forever
    const safety = setTimeout(() => setLoading(false), 10000);
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
        clearTimeout(safety);
        setLoading(false);
      }
    })();
  }, []);

  const login = async (token, userData) => {
    await SecureStore.setItemAsync('dps_token', token);
    setUser(userData);
  };

  const logout = async () => {
    try { await logoutBackend(); } catch {}
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
