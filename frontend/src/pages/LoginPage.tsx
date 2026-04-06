import React, { useState } from "react";
import axios from "axios";
import { Mail, Lock, ArrowRight, AlertCircle } from "lucide-react";

type LoginPageProps = {
  onLoggedIn: (token: string) => void;
};

type LoginResponse = {
  access_token?: string;
  message?: string;
};

const LoginPage: React.FC<LoginPageProps> = ({ onLoggedIn }) => {
  const [email, setEmail] = useState("student@example.com");
  const [password, setPassword] = useState("test1234");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await axios.post<LoginResponse>("http://127.0.0.1:5050/auth/login", {
        email,
        password,
      });

      if (res.data.access_token) {
        onLoggedIn(res.data.access_token);
      } else {
        setMessage(res.data.message || "Unexpected response from server.");
      }
    } catch (err: any) {
      const backendMessage = err.response?.data?.message;
      setMessage(backendMessage || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card-wrapper">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Welcome back</h2>
          <p className="text-muted">Enter your details to access your account</p>
        </div>

        <form onSubmit={handleSubmit} className="card-body">
          {message && (
            <div className="alert alert-danger">
              <AlertCircle size={16} style={{ marginTop: "2px", flexShrink: 0 }} />
              <span>{message}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email address</label>
            <div className="input-wrapper">
              <div className="input-icon">
                <Mail size={18} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-control"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-wrapper">
              <div className="input-icon">
                <Lock size={18} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-control"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full mt-2"
          >
            {loading ? "Signing in..." : "Sign in"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;