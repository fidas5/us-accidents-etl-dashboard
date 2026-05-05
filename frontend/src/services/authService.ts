// src/services/authService.ts
import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:5050";

// ✅ Export des interfaces
export interface User {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  is_verified: boolean;
}

export interface LoginResponse {
  access_token: string;
  user: User;
  message?: string;
}

export interface RegisterResponse {
  message: string;
  email?: string;
}

export interface VerifyResponse {
  access_token: string;
  user: User;
  message: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface VerifyResetCodeResponse {
  message: string;
  reset_token: string;
}

export interface ResetPasswordResponse {
  message: string;
}

class AuthService {
  private baseURL: string;

  constructor() {
    this.baseURL = `${API_BASE_URL}/auth`;
  }

  async register(userData: {
    nom: string;
    prenom: string;
    email: string;
    password: string;
  }): Promise<RegisterResponse> {
    const response = await axios.post<RegisterResponse>(
      `${this.baseURL}/register`,
      userData
    );
    return response.data;
  }

  async verifyEmail(email: string, code: string): Promise<VerifyResponse> {
    const response = await axios.post<VerifyResponse>(
      `${this.baseURL}/verify-email`,
      { email, code }
    );
    
    // Store token if provided
    if (response.data.access_token) {
      this.setSession(response.data.access_token, response.data.user);
    }
    
    return response.data;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await axios.post<LoginResponse>(
      `${this.baseURL}/login`,
      { email, password }
    );
    
    // Store token and user data
    if (response.data.access_token && response.data.user) {
      this.setSession(response.data.access_token, response.data.user);
    }
    
    return response.data;
  }

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const response = await axios.post<ForgotPasswordResponse>(
      `${this.baseURL}/forgot-password`,
      { email }
    );
    return response.data;
  }

  async verifyResetCode(email: string, code: string): Promise<VerifyResetCodeResponse> {
    const response = await axios.post<VerifyResetCodeResponse>(
      `${this.baseURL}/verify-reset-code`,
      { email, code }
    );
    
    // Store reset token temporarily
    if (response.data.reset_token) {
      sessionStorage.setItem("reset_token", response.data.reset_token);
    }
    
    return response.data;
  }

  async resetPassword(newPassword: string, resetToken: string): Promise<ResetPasswordResponse> {
    const response = await axios.post<ResetPasswordResponse>(
      `${this.baseURL}/reset-password`,
      { new_password: newPassword, reset_token: resetToken }
    );
    
    // Clear reset token
    sessionStorage.removeItem("reset_token");
    
    return response.data;
  }

  private setSession(token: string, user: User): void {
    localStorage.setItem("access_token", token);
    localStorage.setItem("user", JSON.stringify(user));
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  }

  logout(): void {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    delete axios.defaults.headers.common["Authorization"];
  }

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        return JSON.parse(userStr) as User;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  getToken(): string | null {
    return localStorage.getItem("access_token");
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

// ✅ Export default de l'instance
const authService = new AuthService();
export default authService;