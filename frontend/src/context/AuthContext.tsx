// src/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import axios from "axios";

interface User {
  email: string;
  id?: number;
  nom?: string;
  prenom?: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (token: string, email: string, userData?: any) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "access_token";
const EMAIL_KEY = "user_email";
const EXPIRES_KEY = "expires_at";
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const expiresAt = localStorage.getItem(EXPIRES_KEY);
    if (storedToken && expiresAt && Date.now() < Number(expiresAt)) {
      return storedToken;
    }
    return null;
  });

  const [user, setUser] = useState<User | null>(() => {
    const storedEmail = localStorage.getItem(EMAIL_KEY);
    const expiresAt = localStorage.getItem(EXPIRES_KEY);
    if (storedEmail && expiresAt && Date.now() < Number(expiresAt)) {
      return { email: storedEmail };
    }
    return null;
  });

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  }, []);

  useEffect(() => {
    if (!token) return;
    const expiresAt = Number(localStorage.getItem(EXPIRES_KEY));
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      logout();
      return;
    }
    const timer = setTimeout(logout, remaining);
    return () => clearTimeout(timer);
  }, [token, logout]);

  // ✅ Fix: Better interceptor that checks for valid token
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.log("401 detected - logging out");
          logout();
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [logout]);

  // ✅ Add request interceptor to ensure token is always included
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const currentToken = localStorage.getItem(TOKEN_KEY);
        if (currentToken) {
          config.headers.Authorization = `Bearer ${currentToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    return () => axios.interceptors.request.eject(requestInterceptor);
  }, []);

  const login = useCallback((accessToken: string, email: string, userData?: any) => {
    const expiresAt = Date.now() + SESSION_DURATION;
    setToken(accessToken);
    setUser({ email, ...userData });
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(EXPIRES_KEY, String(expiresAt));
    
    // Set default Authorization header for all future requests
    axios.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}