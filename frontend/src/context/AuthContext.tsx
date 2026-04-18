import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import axios from "axios";

interface User {
  email: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (token: string, email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "access_token";
const EMAIL_KEY = "user_email";
const EXPIRES_KEY = "expires_at";
const SESSION_DURATION = 60 * 60 * 1000; // 1 hour in ms

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  };

  // Auto-reconnect on reload + check expiry
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedEmail = localStorage.getItem(EMAIL_KEY);
    const expiresAt = localStorage.getItem(EXPIRES_KEY);

    if (storedToken && storedEmail && expiresAt) {
      if (Date.now() > Number(expiresAt)) {
        // Token expired while away
        logout();
      } else {
        setToken(storedToken);
        setUser({ email: storedEmail });
      }
    }
  }, []);

  // Auto-logout timer — fires exactly when session expires
  useEffect(() => {
    if (!token) return;
    const expiresAt = Number(localStorage.getItem(EXPIRES_KEY));
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { logout(); return; }

    const timer = setTimeout(() => {
      logout();
    }, remaining);

    return () => clearTimeout(timer);
  }, [token]);

  // Axios interceptor — catches 401 from any API call
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  const login = (accessToken: string, email: string) => {
    const expiresAt = Date.now() + SESSION_DURATION;
    setToken(accessToken);
    setUser({ email });
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(EXPIRES_KEY, String(expiresAt));
  };

  const value: AuthContextValue = { user, token, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}