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
const SESSION_DURATION = 60 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  // ✅ Lazy init — reads localStorage synchronously before first render
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

  // ✅ Auto-logout timer — fires exactly when session expires
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

  // ✅ Axios interceptor — catches 401 from any API call
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) logout();
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [logout]);

  const login = useCallback((accessToken: string, email: string) => {
    const expiresAt = Date.now() + SESSION_DURATION;
    setToken(accessToken);
    setUser({ email });
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(EXPIRES_KEY, String(expiresAt));
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