import React, { useState, useRef } from "react";
import axios from "axios";
import { Mail, Lock, AlertCircle, CheckCircle2, Layers, Phone, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import "./RegisterPage.css"; // Import the CSS file

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
      setMessage({ text: err.response?.data?.message || "L'inscription a échoué. Veuillez réessayer..", type: "error" });
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
        setMessage({ text: res.data.message || "La vérification a échoué.", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || "La vérification a échoué. Veuillez réessayer.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-wrapper">
      <div className={`register-glow-top ${theme}`} />
      <div className={`register-glow-bottom ${theme}`} />

      <div className={`register-card ${theme}`}>
        <div className="register-shimmer" />

        {/* Brand */}
        <div className="register-brand-row">
          <div className="register-brand-icon">
            <Layers size={16} />
          </div>
          <span className="register-brand-name">Plateforme ETL & Dashboard Accidents Routiers</span>
        </div>

        {/* Step pills */}
        <div className="register-step-row">
          <div className={`register-step-pill ${step === "form" || step === "verify" ? "register-step-pill-active" : ""}`} />
          <div className={`register-step-pill ${step === "verify" ? "register-step-pill-active" : ""}`} />
        </div>

        {/* ── STEP 1 – Registration form ── */}
        {step === "form" && (
          <>
            <h1 className="register-heading">Créer un compte</h1>
            <p className="register-subheading">rejoignez-nous pour accéder au dashboard</p>

            <form onSubmit={handleRegister} className="register-form">
              {message && (
                <div className={`register-alert ${message.type === "success" ? "register-alert-success" : ""}`}>
                  {message.type === "error"
                    ? <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    : <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span>{message.text}</span>
                </div>
              )}
              
              {/* Nom and Prénom on the same line */}
              <div className="register-row">
                <div className="register-half-field-group">
                  <label className="register-field-label">Nom</label>
                  <div className={`register-input-row ${focusedField === "nom" ? "register-input-row-focused" : ""}`}>
                    <User size={15} color="var(--text-muted)" />
                    <input
                      type="text"
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      onFocus={() => setFocusedField("nom")}
                      onBlur={() => setFocusedField(null)}
                      required
                      className="register-input"
                    />
                  </div>
                </div>

                <div className="register-half-field-group">
                  <label className="register-field-label">Prénom</label>
                  <div className={`register-input-row ${focusedField === "prenom" ? "register-input-row-focused" : ""}`}>
                    <User size={15} color="var(--text-muted)" />
                    <input
                      type="text"
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      onFocus={() => setFocusedField("prenom")}
                      onBlur={() => setFocusedField(null)}
                      required
                      className="register-input"
                    />
                  </div>
                </div>
              </div>

              <div className="register-field-group">
                <label className="register-field-label">Email</label>
                <div className={`register-input-row ${focusedField === "email" ? "register-input-row-focused" : ""}`}>
                  <Mail size={15} color="var(--text-muted)" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="exemple@exemple.com"
                    required
                    className="register-input"
                  />
                </div>
              </div>

              <div className="register-field-group">
                <label className="register-field-label">Mot de passe</label>
                <div className={`register-input-row ${focusedField === "password" ? "register-input-row-focused" : ""}`}>
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
                    className="register-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="register-submit-btn"
              >
                {loading ? "Création du compte…" : "Créer un compte"}
              </button>
            </form>

            <p className="register-footer-text">
              Vous avez déjà un compte ?{" "}
              <Link to="/login" className="register-footer-link">Se connecter →</Link>
            </p>
          </>
        )}

        {/* ── STEP 2 – Verify email ── */}
        {step === "verify" && (
          <>
            <div className="register-verify-icon-wrap">
              <Phone size={20} color="var(--primary-color)" />
            </div>

            <h1 className="register-heading">Vérifiez votre boîte de réception</h1>
            <p className="register-subheading">vérifiez votre email pour activer votre compte</p>

            <form onSubmit={handleVerify} className="register-form">
              {message && (
                <div className={`register-alert ${message.type === "success" ? "register-alert-success" : ""}`}>
                  {message.type === "error"
                    ? <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    : <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span>{message.text}</span>
                </div>
              )}

              <div className="register-field-group">
                <label className="register-field-label">Code 6 digits</label>
                <div className="register-otp-row">
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
                      className={`register-otp-box ${digit ? "register-otp-box-filled" : ""} ${focusedField === `d${i}` ? "register-otp-box-active" : ""}`}
                    />
                  ))}
                </div>
              </div>

              <div className="register-notice-chip">
                <AlertCircle size={12} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <span className="register-notice-text">
                  Code envoyé à <strong style={{ color: "var(--primary-color)" }}>{email}</strong>
                </span>
              </div>

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="register-submit-btn"
                style={{ marginTop: 16 }}
              >
                {loading ? "Vérification…" : "Vérifier l'email"}
              </button>
            </form>

            <p className="register-footer-text">
              Je n'ai pas compris?{" "}
              <span
                className="register-footer-link"
                onClick={() => { setStep("form"); setCodeDigits(["","","","","",""]); setMessage(null); }}
              >
                Renvoyer le code →
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;