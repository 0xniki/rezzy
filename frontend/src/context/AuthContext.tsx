import { useState, useCallback, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { AuthContext } from './AuthContextState';

const TOKEN_KEY = 'rezzy_token';
const USER_KEY = 'rezzy_username';
const ROLE_KEY = 'rezzy_role';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USER_KEY));
  const [role, setRole] = useState<'admin' | 'user' | null>(() => {
    const stored = localStorage.getItem(ROLE_KEY);
    return stored === 'admin' || stored === 'user' ? stored : null;
  });

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    const tok = res.access_token;
    localStorage.setItem(TOKEN_KEY, tok);
    localStorage.setItem(USER_KEY, res.user.username);
    localStorage.setItem(ROLE_KEY, res.user.role);
    setToken(tok);
    setUsername(res.user.username);
    setRole(res.user.role);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
    setToken(null);
    setUsername(null);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
