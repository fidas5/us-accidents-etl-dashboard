// src/pages/ResetPasswordPage.tsx
import React, { useState, useEffect } from "react";
import { Lock, ArrowRight, AlertCircle, CheckCircle2, Layers, ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
/**
 *react-router-dom c’est quoi ?
 * 
 * C’est une bibliothèque qui permet de :
 * changer de page sans recharger le site
 * gérer les routes (/home, /login, etc.)
 *
Link : remplace les balises <a> classiques.
useNavigate :Permet de changer de page dans le code (ex: après un login réussi). :navigation par clic utilisateur
useLocation : Permet d’accéder à l’URL actuelle et aux données passées entre les pages (ex: email pour reset password). : navigation automatique via code
 */
import { useTheme } from "../context/ThemeContext";
import authService from "../services/authService";

const ResetPasswordPage: React.FC = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;

  useEffect(() => {
    if (!email) {
      navigate("/forgot-password");
    }
  }, [email, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ text: "Les mots de passe ne correspondent pas.", type: "error" });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ text: "Le mot de passe doit contenir au moins 6 caractères.", type: "error" });
      return;
    }

    setLoading(true);

    try {
      const resetToken = sessionStorage.getItem("reset_token");
      if (!resetToken) {
        throw new Error("La session de réinitialisation a expiré. Veuillez demander un nouveau code.");
      }

      await authService.resetPassword(newPassword, resetToken);
      setMessage({ text: "Mot de passe réinitialisé avec succès! Redirection vers la page de connexion...", type: "success" });
      
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || "Échec de la réinitialisation du mot de passe", type: "error" });
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
    infoBox: {
      background: "rgba(59,130,246,0.08)",
      border: "1px solid var(--primary-color-soft)",
      borderRadius: 10,
      padding: "12px",
      marginBottom: 20,
      fontSize: 12,
      color: "var(--text-muted)",
      textAlign: "center",
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

        <button onClick={() => navigate("/forgot-password")} style={styles.backLink}>
          <ArrowLeft size={14} />
          Retour
        </button>

        <h1 style={styles.heading}>Créer un nouveau mot de passe</h1>
        <p style={styles.subheading}>
          Saisissez votre nouveau mot de passe ci-dessous
        </p>

        {email && (
          <div style={styles.infoBox}>
            Réinitialisation du mot de passe pour: <strong>{email}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
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
            <label style={styles.fieldLabel}>nouveau mot de passe</label>
            <div
              style={{
                ...styles.inputRow,
                ...(focusedField === "password" ? styles.inputRowFocused : {}),
              }}
            >
              <Lock size={15} color="var(--text-muted)" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                placeholder="•••••••• (min 6 characters)"
                required
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.fieldLabel}>Confirmer le mot de passe</label>
            <div
              style={{
                ...styles.inputRow,
                ...(focusedField === "confirm" ? styles.inputRowFocused : {}),
              }}
            >
              <Lock size={15} color="var(--text-muted)" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setFocusedField("confirm")}
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
            {loading ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;