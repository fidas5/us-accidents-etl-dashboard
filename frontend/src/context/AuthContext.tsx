/**
 * 🎭 CONTEXTE D'AUTHENTIFICATION - État réactif pour React
 * 
 * Ce contexte fournit l'état d'authentification à toute l'application React.
 * Il sert de pont entre authService (stockage) et les composants (UI réactive).
 * 
 * 🎯 Objectifs :
 * - Exposer l'état utilisateur/token à tous les composants
 * - Déclencher des re-rendus automatiques quand l'auth change
 * - Intercepter les erreurs 401 pour déconnecter automatiquement
 * - Centraliser les opérations d'auth (login/logout/update)
 * 
 * 🔧 Rôle par rapport à authService :
 * - authService = Stockage persistant + logique API
 * - AuthContext = État React réactif + distribution aux composants
 * 
 * 🏗️ Architecture :
 * - AuthProvider : Enveloppe l'application (dans main.tsx)
 * - useAuth() : Hook personnalisé pour accéder au contexte
 * - Intercepteurs axios : Gestion auto des sessions expirées
 * 
 * 🔄 Flux de données :
 * 1. Login appelé → authService stocke → useState mis à jour → re-rendu global
 * 2. Composants utilisant useAuth() se mettent à jour automatiquement
 * 3. Erreur 401 → intercepteur → logout() → redirection login
 * 
 * @example
 * // Dans le composant racine
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * 
 * // Dans n'importe quel composant
 * const { user, login, logout } = useAuth();
 * 
 * // Redirection conditionnelle
 * if (!user) return <Navigate to="/login" />;
 */


import React, { createContext, // Crée un contexte pour partager des données dans toute l'app 
  useContext, // Hook pour consommer le contexte dans n'importe quel composant
   useEffect, 
   useState, 
   useCallback, // Mémoïse les fonctions pour éviter des re-rendus inutiles :Garder la même fonction en mémoire pour éviter des re-rendus inutiles
   ReactNode // Type TypeScript pour les enfants du provider (string, number, JSX, etc.) :Tout ce qui peut être affiché à l'écran (texte, nombre, composant, etc.)
  } from "react";
import axios from "axios";
// ✅ Correction de l'import - authService est default, User est nommé
import authService from "../services/authService";
import type { User } from "../services/authService";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => authService.getToken());
  const [user, setUser] = useState<User | null>(() => authService.getCurrentUser());

  const logout = useCallback(() => {
    authService.logout();
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback((accessToken: string, userData: User) => {
    // Store in service
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("user", JSON.stringify(userData));
    axios.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
    
    // Update state
    setToken(accessToken);
    setUser(userData);
  }, []);

  const updateUser = useCallback((userData: User) => {
    setUser(userData);
    localStorage.setItem("user", JSON.stringify(userData));
  }, []);

  // Setup axios interceptors
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const currentToken = authService.getToken();
        if (currentToken) {
          config.headers.Authorization = `Bearer ${currentToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}