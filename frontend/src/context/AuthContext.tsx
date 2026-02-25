import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import client from '../api/client';

interface AuthContextValue {
  token: string | null;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'rezzy_token';
const USER_KEY = 'rezzy_username';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USER_KEY));

  const login = useCallback(async (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);

    const res = await client.post<{ access_token: string }>(
      '/auth/login',
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const tok = res.data.access_token;
    localStorage.setItem(TOKEN_KEY, tok);
    localStorage.setItem(USER_KEY, username);
    setToken(tok);
    setUsername(username);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUsername(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
