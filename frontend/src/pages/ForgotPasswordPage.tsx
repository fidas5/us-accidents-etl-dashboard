// src/pages/ForgotPasswordPage.tsx
import React, { useState } from "react";
import { Mail, ArrowRight, AlertCircle, CheckCircle2, Layers, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import authService from "../services/authService";

type Step = "request" | "verify";

const ForgotPasswordPage: React.FC = () => {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [resetCode, setResetCode] = useState(["", "", "", "", "", ""]);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { theme } = useTheme();
  const navigate = useNavigate();

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newCode = [...resetCode];
    newCode[index] = digit;
    setResetCode(newCode);

    // Auto-focus next input
    if (digit && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !resetCode[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      await authService.forgotPassword(email);
      setMessage({ text: "Code de réinitialisation envoyé à votre email!", type: "success" });
      setStep("verify");
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || "Échec de l'envoi du code de réinitialisation", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    const code = resetCode.join("");
    if (code.length !== 6) {
      setMessage({ text: "Veuillez entrer le code à 6 chiffres", type: "error" });
      setLoading(false);
      return;
    }

    try {
      await authService.verifyResetCode(email, code);
      // Redirect to reset password page with email in state
      navigate("/reset-password", { state: { email } });
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || "Code de vérification invalide", type: "error" });
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
      background: theme === "dark"
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
      top: 0,
      left: 0,
      right: 0,
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
    backLink: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      background: "transparent",
      border: "none",
      color: "var(--text-muted)",
      fontSize: 12,
      marginBottom: 20,
      cursor: "pointer",
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
      marginBottom: 16,
    },
    alertSuccess: {
      background: "rgba(34,197,94,0.08)",
      border: "1px solid rgba(34,197,94,0.2)",
      color: "#22c55e",
    },
    alertError: {
      color: "#ef4444",
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
    otpRow: {
      display: "flex",
      gap: 8,
      justifyContent: "center",
    },
    otpBox: {
      width: 50,
      height: 50,
      textAlign: "center",
      fontSize: 20,
      fontWeight: 600,
      background: "var(--bg-input)",
      border: "1px solid var(--border-subtle)",
      borderRadius: 10,
      outline: "none",
      color: "var(--text-main)",
    },
    otpBoxFocused: {
      borderColor: "var(--primary-color)",
      boxShadow: "0 0 0 3px var(--primary-color-soft)",
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

        <button onClick={() => navigate("/login")} style={styles.backLink}>
          <ArrowLeft size={14} />
          Retour à la page de connexion
        </button>

        {step === "request" && (
          <>
            <h1 style={styles.heading}>Mot de passe oublié ?</h1>
            <p style={styles.subheading}>
              Saisissez votre adresse e-mail pour recevoir un code de réinitialisation
            </p>

            <form onSubmit={handleRequestCode} style={styles.form}>
              {message && (
                <div
                  style={{
                    ...styles.alert,
                    ...(message.type === "success" ? styles.alertSuccess : styles.alertError),
                  }}
                >
                  {message.type === "error" ? (
                    <AlertCircle size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  <span>{message.text}</span>
                </div>
              )}

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>Email</label>
                <div
                  style={{
                    ...styles.inputRow,
                    ...(focusedField === "email" ? styles.inputRowFocused : {}),
                  }}
                >
                  <Mail size={15} color="var(--text-muted)" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="exemple@exemple.com"
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
                {loading ? "Sending..." : "Send reset code"}
                {!loading && <ArrowRight size={16} />}
              </button>
            </form>
          </>
        )}

        {step === "verify" && (
          <>
            <h1 style={styles.heading}>Consultez votre boîte mail</h1>
            <p style={styles.subheading}>
              Saisissez le code à 6 chiffres envoyé à {email}
            </p>

            <form onSubmit={handleVerifyCode} style={styles.form}>
              {message && (
                <div
                  style={{
                    ...styles.alert,
                    ...(message.type === "success" ? styles.alertSuccess : styles.alertError),
                  }}
                >
                  {message.type === "error" ? (
                    <AlertCircle size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  <span>{message.text}</span>
                </div>
              )}

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>code de Verification</label>
                <div style={styles.otpRow}>
                  {resetCode.map((digit, index) => (
                    <input
                      key={index}
                      id={`code-${index}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onFocus={() => setFocusedField(`code-${index}`)}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        ...styles.otpBox,
                        ...(focusedField === `code-${index}` ? styles.otpBoxFocused : {}),
                      }}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || resetCode.join("").length !== 6}
                style={{
                  ...styles.submitBtn,
                  opacity: loading || resetCode.join("").length !== 6 ? 0.7 : 1,
                  cursor: loading || resetCode.join("").length !== 6 ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "vérification..." : "Verifier le code"}
                {!loading && <ArrowRight size={16} />}
              </button>
            </form>

            <p style={styles.footerText}>
              Vous n'avez pas reçu le code ?{" "}
              <button
                onClick={handleRequestCode}
                style={{
                  ...styles.footerLink,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Renvoyer →
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;