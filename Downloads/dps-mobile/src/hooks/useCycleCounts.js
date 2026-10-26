import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { getMyCountBlocks } from '../services/api';

// Open cycle counts assigned to the signed-in tech. Drives the Inventory
// tab badge and the "count due" banner; refreshes every minute and on resume.
const CycleCountContext = createContext({ blocks: [], refresh: () => {} });

const POLL_MS = 60000;

export function CycleCountProvider({ children }) {
  const [blocks, setBlocks] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const rows = await getMyCountBlocks();
      setBlocks(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.warn('cycle counts load error:', e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [refresh]);

  return (
    <CycleCountContext.Provider value={{ blocks, refresh }}>
      {children}
    </CycleCountContext.Provider>
  );
}

export const useCycleCounts = () => useContext(CycleCountContext);
