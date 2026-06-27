import { createContext } from 'react';

export interface AuthContextValue {
  token: string | null;
  username: string | null;
  role: 'admin' | 'user' | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
