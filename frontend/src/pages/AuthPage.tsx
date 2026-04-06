import React, { useState } from "react";
import axios from "axios";
import { Car, Lock, Mail, AlertCircle, UserPlus, ArrowRight } from "lucide-react";

type AuthPageProps = {
  onLoggedIn: (token: string) => void;
};

type LoginResponse = {
  access_token: string;
  message?: string;
};

type RegisterResponse = {
  access_token?: string;
  message: string;
};

const API_BASE_URL = "http://127.0.0.1:5050";

const AuthPage: React.FC<AuthPageProps> = ({ onLoggedIn }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("student@example.com");
  const [password, setPassword] = useState("test1234");
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      if (isLogin) {
        // LOGIN
        const res = await axios.post<LoginResponse>(`${API_BASE_URL}/auth/login`, {
          email,
          password,
        });
        onLoggedIn(res.data.access_token);
      } else {
        // REGISTER
        const res = await axios.post<RegisterResponse>(`${API_BASE_URL}/auth/register`, {
          email,
          password,
        });

        setMessage({ text: res.data.message, type: "success" });

        if (res.data.access_token) {
          setTimeout(() => {
            onLoggedIn(res.data.access_token!);
          }, 800);
        }
      }
    } catch (err: any) {
      const backendMessage = err.response?.data?.message || err.response?.data?.error;
      setMessage({
        text: backendMessage || (isLogin ? "Login failed" : "Registration failed"),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Header avec icône Car */}
      <div className="login-header">
        <div className="login-icon">
          <Car size={32} />
        </div>
        <h2 className="card-title">US Accidents Analytics</h2>
        <p className="text-muted">
          {isLogin ? "Welcome back! Sign in to your account" : "Create a new account"}
        </p>
      </div>

      {/* Card principale */}
      <div className="card login-card">
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            {/* Message d'erreur/succès */}
            {message && (
              <div
                className={`alert ${
                  message.type === "error" ? "alert-danger" : "alert-success"
                } d-flex align-items-center mb-4`}
                role="alert"
              >
                <AlertCircle className="me-2" size={20} />
                <div>{message.text}</div>
              </div>
            )}

            {/* Email */}
            <div className="form-group mb-4">
              <label className="form-label">Email address</label>
              <div className="input-group">
                <span className="input-group-icon">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-control"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group mb-4">
              <label className="form-label">Password</label>
              <div className="input-group">
                <span className="input-group-icon">
                  <Lock size={18} />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-control"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>

            {/* Bouton Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full d-flex align-items-center justify-content-center"
            >
              {loading ? (
                "Processing..."
              ) : isLogin ? (
                <>
                  Sign in <ArrowRight size={18} className="ms-2" />
                </>
              ) : (
                <>
                  Create account <UserPlus size={18} className="ms-2" />
                </>
              )}
            </button>
          </form>

          {/* Séparateur */}
          <div
            className="divider"
            style={{ margin: "1.5rem 0", borderTop: "1px solid var(--border-color)" }}
          ></div>

          {/* Toggle Login/Register */}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setMessage(null);
            }}
            className="btn btn-outline w-full d-flex align-items-center justify-content-center"
          >
            {isLogin ? (
              <>
                <UserPlus size={18} className="me-2" />
                Create an account
              </>
            ) : (
              <>
                <ArrowRight size={18} className="me-2" />
                Sign in to existing account
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;