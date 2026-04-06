import React, { useState } from "react";
import axios from "axios";
import { Mail, Lock, AlertCircle, CheckCircle2, KeyRound } from "lucide-react";

type RegisterPageProps = {
  onLoggedIn: (token: string) => void;
};

type RegisterResponse = {
  message: string;
};

type VerifyResponse = {
  message?: string;
  access_token?: string;
};

type Step = "form" | "verify";

const RegisterPage: React.FC<RegisterPageProps> = ({ onLoggedIn }) => {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("newuser@example.com");
  const [password, setPassword] = useState("test1234");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await axios.post<RegisterResponse>("http://127.0.0.1:5050/auth/register", {
        email,
        password,
      });

      setMessage({ text: res.data.message, type: "success" });
      setStep("verify");
    } catch (err: any) {
      const backendMessage = err.response?.data?.message;
      setMessage({
        text: backendMessage || "Registration failed. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await axios.post<VerifyResponse>(
        "http://127.0.0.1:5050/auth/verify-email",
        {
          email,
          code,
        }
      );

      if (res.data.access_token) {
        setMessage({ text: res.data.message || "Email verified!", type: "success" });
        onLoggedIn(res.data.access_token);
      } else {
        setMessage({
          text: res.data.message || "Verification failed.",
          type: "error",
        });
      }
    } catch (err: any) {
      const backendMessage = err.response?.data?.message;
      setMessage({
        text: backendMessage || "Verification failed. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card-wrapper">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            {step === "form" ? "Create an account" : "Verify your email"}
          </h2>
          <p className="text-muted">
            {step === "form"
              ? "Join us to access the dashboard"
              : "Enter the 6-digit code sent to your email"}
          </p>
        </div>

        <form
          onSubmit={step === "form" ? handleRegister : handleVerify}
          className="card-body"
        >
          {message && (
            <div
              className={`alert ${
                message.type === "error" ? "alert-danger" : "alert-success"
              }`}
            >
              {message.type === "error" ? (
                <AlertCircle size={16} style={{ marginTop: "2px", flexShrink: 0 }} />
              ) : (
                <CheckCircle2 size={16} style={{ marginTop: "2px", flexShrink: 0 }} />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Step 1: email + password */}
          {step === "form" && (
            <>
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
                    minLength={6}
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 2: verification code */}
          {step === "verify" && (
            <div className="form-group">
              <label className="form-label">Verification code</label>
              <div className="input-wrapper">
                <div className="input-icon">
                  <KeyRound size={18} />
                </div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="form-control"
                  placeholder="6-digit code"
                  required
                />
              </div>
              <p className="text-muted" style={{ marginTop: "0.5rem" }}>
                We sent a code to <strong>{email}</strong>.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full mt-2"
          >
            {loading
              ? step === "form"
                ? "Creating account..."
                : "Verifying..."
              : step === "form"
              ? "Create account"
              : "Verify email"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;