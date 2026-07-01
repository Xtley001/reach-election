import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, tokenStore } from '../lib/api';
import { wipeAllOfflineData } from '../lib/offline';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = tokenStore.get();
    if (token) {
      try {
        const me = await api.getMe();
        setUser(me);
        setLoading(false);
        return;
      } catch {
        // fall through to refresh attempt below
      }
    }
    // No (or stale) in-memory access token — try to recover a session via
    // the httpOnly refresh cookie before giving up. This is the only path
    // available after a full page reload now that the access token lives
    // in memory only (audit 6.1), and on every browser restart even before
    // that, since the refresh cookie outlives sessionStorage (audit 6.5).
    try {
      await api.refresh();
      const me = await api.getMe();
      setUser(me);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  useEffect(() => {
    const handler = () => { setUser(null); tokenStore.clear(); };
    window.addEventListener('reach:logout', handler);
    return () => window.removeEventListener('reach:logout', handler);
  }, []);

  const login = useCallback((userData, token) => {
    tokenStore.set(token);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch {}
    tokenStore.clear();
    setUser(null);
    try { await wipeAllOfflineData(); } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, reload: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
