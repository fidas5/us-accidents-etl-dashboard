import React, { useState } from "react";
import axios from "axios";
import { Mail, Lock, ArrowRight, AlertCircle, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

type LoginPageProps = {
  onLoggedIn: (token: string, email: string) => void;
};

type LoginResponse = {
  access_token?: string;
  message?: string;
};

const LoginPage: React.FC<LoginPageProps> = ({ onLoggedIn }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { theme } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await axios.post<LoginResponse>(
        "http://127.0.0.1:5050/auth/login",
        { email, password }
      );

      if (res.data.access_token) {
        onLoggedIn(res.data.access_token, email);
      } else {
        setMessage(res.data.message || "Unexpected response from server.");
      }
    } catch (err: any) {
      setMessage(
        err.response?.data?.message ||
          "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    wrapper: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "24px",
      background: "var(--bg-app)",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Syne', system-ui, sans-serif",
    },

    glowTop: {
      position: "absolute",
      width: 600,
      height: 600,
      borderRadius: "50%",
      background:
        theme === "dark"
          ? "radial-gradient(circle, rgba(59,130,246,0.14), transparent 70%)"
          : "radial-gradient(circle, rgba(59,130,246,0.06), transparent 70%)",
      top: -200,
      left: -100,
      pointerEvents: "none",
    },

    glowBottom: {
      position: "absolute",
      width: 500,
      height: 500,
      borderRadius: "50%",
      background:
        theme === "dark"
          ? "radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)"
          : "radial-gradient(circle, rgba(139,92,246,0.05), transparent 70%)",
      bottom: -150,
      right: -80,
      pointerEvents: "none",
    },

    card: {
      position: "relative",
      width: "100%",
      maxWidth: 400,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 20,
      padding: "32px 28px 28px",
      boxShadow:
        theme === "dark"
          ? "0 32px 80px rgba(0,0,0,0.5)"
          : "0 20px 40px rgba(0,0,0,0.08)",
      overflow: "hidden",
    },

    shimmer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      background:
        "linear-gradient(90deg, transparent, var(--primary-color), transparent)",
    },

    brandRow: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 28,
    },

    brandIcon: {
      width: 34,
      height: 34,
      background: "var(--primary-color)",
      borderRadius: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
    },

    brandName: {
      fontSize: 15,
      fontWeight: 800,
      color: "var(--text-main)",
    },

    heading: {
      fontSize: 24,
      fontWeight: 800,
      color: "var(--text)",
      margin: "0 0 4px",
    },

    subheading: {
      fontSize: 12,
      color: "var(--text-muted)",
      margin: "0 0 24px",
    },

    form: {
      display: "flex",
      flexDirection: "column",
    },

    alert: {
      display: "flex",
      gap: 8,
      alignItems: "flex-start",
      background: "rgba(239,68,68,0.08)",
      border: "1px solid rgba(239,68,68,0.2)",
      borderRadius: 10,
      padding: "10px 12px",
      fontSize: 12,
      color: "var(--accent)",
      marginBottom: 16,
    },

    fieldGroup: { marginBottom: 16 },

    fieldLabel: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--text-muted)",
      marginBottom: 7,
      textTransform: "uppercase",
    },

    inputRow: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: "var(--bg-input)",
      border: "1px solid var(--border-subtle)",
      borderRadius: 10,
      padding: "0 14px",
    },

    inputRowFocused: {
      borderColor: "var(--primary-color)",
      background: "var(--surface)",
      boxShadow: "0 0 0 3px var(--primary-color-soft)",
    },

    input: {
      flex: 1,
      height: 44,
      background: "transparent",
      border: "none",
      outline: "none",
      color: "var(--text-main)",
      fontSize: 13,
    },

    submitBtn: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      width: "100%",
      height: 46,
      marginTop: 8,
      background: "var(--primary-color)",
      border: "none",
      borderRadius: 10,
      color: "white",
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
    },

    btnArrow: {
      width: 20,
      height: 20,
      background: "rgba(255,255,255,0.2)",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },

    footerText: {
      textAlign: "center",
      fontSize: 12,
      color: "var(--text-muted)",
      marginTop: 20,
    },

    footerLink: {
      color: "var(--primary-color)",
      textDecoration: "none",
    },
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.glowTop} />
      <div style={styles.glowBottom} />

      <div style={styles.card}>
        <div style={styles.shimmer} />

        <div style={styles.brandRow}>
          <div style={styles.brandIcon}>
            <Layers size={16} />
          </div>
          <span style={styles.brandName}>
            Plateforme ETL & Dashboard Accidents Routiers
          </span>
        </div>

        <h1 style={styles.heading}>Welcome back</h1>
        <p style={styles.subheading}>
          sign in to continue to your dashboard
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {message && (
            <div style={styles.alert}>
              <AlertCircle size={14} />
              <span>{message}</span>
            </div>
          )}

          <div style={styles.fieldGroup}>
            <label style={styles.fieldLabel}>Email</label>
            <div
              style={{
                ...styles.inputRow,
                ...(focusedField === "email"
                  ? styles.inputRowFocused
                  : {}),
              }}
            >
              <Mail size={15} color="var(--text-muted)" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                placeholder="you@example.com"
                required
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.fieldLabel}>Password</label>
            <div
              style={{
                ...styles.inputRow,
                ...(focusedField === "password"
                  ? styles.inputRowFocused
                  : {}),
              }}
            >
              <Lock size={15} color="var(--text-muted)" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                placeholder="••••••••"
                required
                style={styles.input}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitBtn,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
            {!loading && (
              <span style={styles.btnArrow}>
                <ArrowRight size={12} color="white" />
              </span>
            )}
          </button>
        </form>

        <p style={styles.footerText}>
          No account?{" "}
          <Link to="/register" style={styles.footerLink}>
            Create one →
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;