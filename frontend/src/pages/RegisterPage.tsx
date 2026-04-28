import React, { useState, useRef } from "react";
import axios from "axios";
import { Mail, Lock, AlertCircle, CheckCircle2, Layers, Phone, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

type RegisterPageProps = {
  onLoggedIn: (token: string, email: string) => void;
};

type RegisterResponse = { message: string };
type VerifyResponse = { message?: string; access_token?: string };
type Step = "form" | "verify";

const RegisterPage: React.FC<RegisterPageProps> = ({ onLoggedIn }) => {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [password, setPassword] = useState("");
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""]);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { theme } = useTheme();
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = codeDigits.join("");

  const handleDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...codeDigits];
    next[index] = digit;
    setCodeDigits(next);
    if (digit && index < 5) digitRefs.current[index + 1]?.focus();
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await axios.post<RegisterResponse>("http://127.0.0.1:5050/auth/register", { nom, prenom, email, password });
      setMessage({ text: res.data.message, type: "success" });
      setStep("verify");
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || "Registration failed. Please try again.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await axios.post<VerifyResponse>("http://127.0.0.1:5050/auth/verify-email", { email, code });
      if (res.data.access_token) {
        onLoggedIn(res.data.access_token, email);
      } else {
        setMessage({ text: res.data.message || "Verification failed.", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || "Verification failed. Please try again.", type: "error" });
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
      width: 600, height: 600,
      borderRadius: "50%",
      background: theme === "dark"
        ? "radial-gradient(circle, rgba(59,130,246,0.14), transparent 70%)"
        : "radial-gradient(circle, rgba(59,130,246,0.06), transparent 70%)",
      top: -200,
      left: -100,
      pointerEvents: "none",
    },
    glowBottom: {
      position: "absolute",
      width: 500, height: 500,
      borderRadius: "50%",
      background: theme === "dark"
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
      boxShadow: theme === "dark"
        ? "0 32px 80px rgba(0,0,0,0.5)"
        : "0 20px 40px rgba(0,0,0,0.08)",
      overflow: "hidden",
    },
    shimmer: {
      position: "absolute",
      top: 0, left: 0, right: 0,
      height: 1,
      background: "linear-gradient(90deg, transparent, var(--primary-color), transparent)",
    },
    brandRow: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 28,
    },
    brandIcon: {
      width: 34, height: 34,
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
    stepRow: {
      display: "flex",
      gap: 6,
      marginBottom: 20,
    },
    stepPill: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      background: "var(--border-subtle)",
      transition: "background 0.3s",
    },
    stepPillActive: {
      background: "var(--primary-color)",
    },
    verifyIconWrap: {
      width: 48, height: 48,
      background: "var(--primary-color-soft)",
      border: "1px solid var(--primary-color-soft)",
      borderRadius: 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    heading: {
      fontSize: 24,
      fontWeight: 800,
      color: "var(--text)",
      letterSpacing: "-0.5px",
      margin: "0 0 4px",
    },
    subheading: {
      fontSize: 12,
      color: "var(--text-muted)",
      fontFamily: "'DM Mono', monospace",
      letterSpacing: "0.03em",
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
    alertSuccess: {
      background: "rgba(34,197,94,0.08)",
      border: "1px solid rgba(34,197,94,0.2)",
      color: "var(--success)",
    },
    row: {
      display: "flex",
      gap: 12,
      marginBottom: 16,
    },
    fieldGroup: { 
      marginBottom: 16 
    },
    halfFieldGroup: { 
      flex: 1,
      minWidth: 0,      
      marginBottom: 0,
    },
    fieldLabel: {
      display: "block",
      fontSize: 11,
      fontWeight: 600,
      color: "var(--text-muted)",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      marginBottom: 7,
      fontFamily: "'DM Mono', monospace",
    },
    inputRow: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: "var(--bg-input)",
      border: "1px solid var(--border-subtle)",
      borderRadius: 10,
      padding: "0 14px",
      transition: "border-color 0.2s, box-shadow 0.2s",
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
      fontFamily: "'DM Mono', monospace",
      letterSpacing: "0.02em",
    },
    otpRow: {
      display: "flex",
      gap: 6,
      width: "100%",
    },
    otpBox: {
      flex: 1,
      height: 48,
      minWidth: 0,
      background: "var(--bg-input)",
      border: "1px solid var(--border-subtle)",
      borderRadius: 10,
      textAlign: "center",
      fontSize: 18,
      fontWeight: 600,
      fontFamily: "'DM Mono', monospace",
      color: "var(--text-muted)",
      outline: "none",
      transition: "border-color 0.2s, box-shadow 0.2s, color 0.2s",
    },
    otpBoxFilled: {
      color: "var(--primary-color)",
      borderColor: "var(--primary-color-soft)",
    },
    otpBoxActive: {
      borderColor: "var(--primary-color)",
      boxShadow: "0 0 0 3px var(--primary-color-soft)",
      background: "var(--surface)",
    },
    noticeChip: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      background: "var(--bg-input)",
      border: "1px solid var(--border-subtle)",
      borderRadius: 8,
      padding: "8px 12px",
      marginTop: 4,
    },
    noticeText: {
      fontSize: 11,
      color: "var(--text-muted)",
      fontFamily: "'DM Mono', monospace",
      letterSpacing: "0.02em",
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
      fontFamily: "'Syne', sans-serif",
      letterSpacing: "0.02em",
      transition: "opacity 0.2s",
      cursor: "pointer",
    },
    footerText: {
      textAlign: "center",
      fontSize: 12,
      color: "var(--text-muted)",
      fontFamily: "'DM Mono', monospace",
      margin: "20px 0 0",
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

        {/* Brand */}
        <div style={styles.brandRow}>
          <div style={styles.brandIcon}>
            <Layers size={16} />
          </div>
          <span style={styles.brandName}>Plateforme ETL & Dashboard Accidents Routiers</span>
        </div>

        {/* Step pills */}
        <div style={styles.stepRow}>
          <div style={{ ...styles.stepPill, ...(step === "form" || step === "verify" ? styles.stepPillActive : {}) }} />
          <div style={{ ...styles.stepPill, ...(step === "verify" ? styles.stepPillActive : {}) }} />
        </div>

        {/* ── STEP 1 – Registration form ── */}
        {step === "form" && (
          <>
            <h1 style={styles.heading}>Create account</h1>
            <p style={styles.subheading}>join us to access the dashboard</p>

            <form onSubmit={handleRegister} style={styles.form}>
              {message && (
                <div style={{ ...styles.alert, ...(message.type === "success" ? styles.alertSuccess : {}) }}>
                  {message.type === "error"
                    ? <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    : <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span>{message.text}</span>
                </div>
              )}
              
              {/* Nom and Prénom on the same line */}
              <div style={styles.row}>
                <div style={styles.halfFieldGroup}>
                  <label style={styles.fieldLabel}>Nom</label>
                  <div style={{ ...styles.inputRow, ...(focusedField === "nom" ? styles.inputRowFocused : {}) }}>
                    <User size={15} color="var(--text-muted)" />
                    <input
                      type="text"
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      onFocus={() => setFocusedField("nom")}
                      onBlur={() => setFocusedField(null)}
                      required
                      style={styles.input}
                    />
                  </div>
                </div>

                <div style={styles.halfFieldGroup}>
                  <label style={styles.fieldLabel}>Prénom</label>
                  <div style={{ ...styles.inputRow, ...(focusedField === "prenom" ? styles.inputRowFocused : {}) }}>
                    <User size={15} color="var(--text-muted)" />
                    <input
                      type="text"
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      onFocus={() => setFocusedField("prenom")}
                      onBlur={() => setFocusedField(null)}
                      required
                      style={styles.input}
                    />
                  </div>
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Email</label>
                <div style={{ ...styles.inputRow, ...(focusedField === "email" ? styles.inputRowFocused : {}) }}>
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
                <div style={{ ...styles.inputRow, ...(focusedField === "password" ? styles.inputRowFocused : {}) }}>
                  <Lock size={15} color="var(--text-muted)" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    style={styles.input}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>

            <p style={styles.footerText}>
              Already have an account?{" "}
              <Link to="/login" style={styles.footerLink}>Sign in →</Link>
            </p>
          </>
        )}

        {/* ── STEP 2 – Verify email ── */}
        {step === "verify" && (
          <>
            <div style={styles.verifyIconWrap}>
              <Phone size={20} color="var(--primary-color)" />
            </div>

            <h1 style={styles.heading}>Check your inbox</h1>
            <p style={styles.subheading}>verify your email to activate your account</p>

            <form onSubmit={handleVerify} style={styles.form}>
              {message && (
                <div style={{ ...styles.alert, ...(message.type === "success" ? styles.alertSuccess : {}) }}>
                  {message.type === "error"
                    ? <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    : <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span>{message.text}</span>
                </div>
              )}

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>6-digit code</label>
                <div style={styles.otpRow}>
                  {codeDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (digitRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigit(i, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(i, e)}
                      onFocus={() => setFocusedField(`d${i}`)}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...styles.otpBox,
                        ...(digit ? styles.otpBoxFilled : {}),
                        ...(focusedField === `d${i}` ? styles.otpBoxActive : {}),
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={styles.noticeChip}>
                <AlertCircle size={12} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <span style={styles.noticeText}>
                  Code sent to <strong style={{ color: "var(--primary-color)" }}>{email}</strong>
                </span>
              </div>

              <button
                type="submit"
                disabled={loading || code.length < 6}
                style={{
                  ...styles.submitBtn,
                  marginTop: 16,
                  opacity: loading || code.length < 6 ? 0.55 : 1,
                  cursor: loading || code.length < 6 ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Verifying…" : "Verify email"}
              </button>
            </form>

            <p style={styles.footerText}>
              Didn't get it?{" "}
              <span
                style={{ ...styles.footerLink, cursor: "pointer" }}
                onClick={() => { setStep("form"); setCodeDigits(["","","","","",""]); setMessage(null); }}
              >
                Resend code →
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;