// src/pages/PredictPage.tsx
import React, { useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { BrainCircuit, AlertCircle } from "lucide-react";

interface PredictForm {
  latitude: number;
  longitude: number;
  hour: number;
  temperature: number;
  visibility: number;
  weather_condition: string;
}

interface PredictResult {
  severity: number;
  confidence: number;
  probabilities: Record<string, number>;
}

const WEATHER_CONDITIONS = [
  "Clear", "Cloudy", "Overcast", "Rain", "Heavy Rain",
  "Snow", "Fog", "Haze", "Thunderstorm", "Windy", "Other",
];

const SEV_META: Record<number, { label: string; color: string; bg: string; desc: string }> = {
  1: { label: "Low",      color: "#185fa5", bg: "rgba(59,130,246,0.12)",  desc: "Minor impact on traffic" },
  2: { label: "Moderate", color: "#854f0b", bg: "rgba(249,115,22,0.12)",  desc: "Some traffic disruption expected" },
  3: { label: "High",     color: "#993c1d", bg: "rgba(239,68,68,0.12)",   desc: "Significant traffic impact" },
  4: { label: "Critical", color: "#a32d2d", bg: "rgba(220,38,38,0.15)",   desc: "Major road disruption — avoid area" },
};

const HOUR_PRESETS = [0, 3, 6, 7, 8, 9, 12, 15, 16, 17, 18, 21];

export default function PredictPage() {
  const { token } = useAuth();
  const [form, setForm] = useState<PredictForm>({
    latitude: 34.05, longitude: -118.24,
    hour: 8, temperature: 65,
    visibility: 10, weather_condition: "Clear",
  });
  const [result, setResult]   = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const set = (k: keyof PredictForm, v: any) =>
    setForm(f => ({ ...f, [k]: v }));

  const handlePredict = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.post(
        "http://127.0.0.1:5050/api/predict",
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResult(res.data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  const sev = result ? SEV_META[result.severity] : null;

  return (
    <>
      <style>{`
        .pr-title { font-size:22px; font-weight:500; color:#e5e7eb; margin:0 0 4px; }
        .pr-sub   { font-size:12px; color:#6b7280; font-family:ui-monospace,monospace; margin:0 0 28px; }
        .pr-layout { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
        .pr-card {
          background:rgba(15,23,42,0.7); border:1px solid rgba(30,58,138,0.25);
          border-radius:12px; padding:22px;
        }
        .pr-card-title { font-size:13px; font-weight:500; color:#93c5fd; text-transform:uppercase; letter-spacing:0.06em; margin:0 0 16px; }
        .pr-field { margin-bottom:14px; }
        .pr-label { display:block; font-size:11px; color:#6b7280; font-family:ui-monospace,monospace; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px; }
        .pr-input, .pr-select {
          width:100%; height:36px; padding:0 12px; box-sizing:border-box;
          background:rgba(7,14,31,0.6); border:1px solid rgba(30,58,138,0.3);
          border-radius:8px; color:#e5e7eb; font-size:13px; transition:border-color 0.15s;
        }
        .pr-input:focus, .pr-select:focus { outline:none; border-color:rgba(59,130,246,0.5); }
        .pr-row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .pr-slider-wrap { display:flex; align-items:center; gap:10px; }
        .pr-slider { flex:1; }
        .pr-slider-val { font-size:13px; color:#93c5fd; font-family:ui-monospace,monospace; min-width:48px; text-align:right; }
        .pr-hour-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:4px; }
        .pr-hour-btn {
          height:28px; border-radius:6px; border:1px solid rgba(30,58,138,0.25);
          background:transparent; color:#6b7280; font-size:11px; cursor:pointer;
          font-family:ui-monospace,monospace; transition:all 0.1s;
        }
        .pr-hour-btn:hover  { background:rgba(59,130,246,0.1); color:#93c5fd; }
        .pr-hour-btn.active { background:#3b82f6; color:white; border-color:#3b82f6; }
        .pr-predict-btn {
          width:100%; height:42px; border-radius:10px; border:none;
          background:linear-gradient(135deg,#3b82f6,#6366f1); color:white;
          font-size:14px; font-weight:500; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:opacity 0.15s; margin-top:20px;
        }
        .pr-predict-btn:hover    { opacity:0.88; }
        .pr-predict-btn:disabled { opacity:0.45; cursor:not-allowed; }
        .pr-result-card { border-radius:12px; padding:24px; border:1px solid rgba(30,58,138,0.2); }
        .pr-result-top  { text-align:center; margin-bottom:20px; }
        .pr-result-label { font-size:11px; color:#6b7280; font-family:ui-monospace,monospace; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:10px; }
        .pr-result-num  { font-size:72px; font-weight:500; line-height:1; margin-bottom:8px; }
        .pr-result-badge { display:inline-block; padding:4px 16px; border-radius:99px; font-size:13px; font-weight:500; margin-bottom:8px; }
        .pr-result-desc { font-size:13px; color:#9ca3af; }
        .pr-confidence  { font-size:13px; color:#6b7280; margin-top:6px; }
        .pr-proba-grid  { display:flex; flex-direction:column; gap:8px; margin-top:20px; }
        .pr-proba-row   { display:flex; align-items:center; gap:10px; }
        .pr-proba-label { font-size:12px; font-family:ui-monospace,monospace; color:#6b7280; width:20px; flex-shrink:0; }
        .pr-proba-track { flex:1; height:6px; background:rgba(30,58,138,0.2); border-radius:3px; overflow:hidden; }
        .pr-proba-fill  { height:100%; border-radius:3px; transition:width 0.6s ease; }
        .pr-proba-pct   { font-size:12px; font-family:ui-monospace,monospace; color:#9ca3af; width:38px; text-align:right; flex-shrink:0; }
        .pr-summary     { display:flex; flex-direction:column; gap:0; margin-top:20px; border-top:1px solid rgba(30,58,138,0.15); padding-top:16px; }
        .pr-summary-row { display:flex; justify-content:space-between; font-size:12px; padding:5px 0; border-bottom:1px solid rgba(30,58,138,0.1); }
        .pr-summary-row:last-child { border-bottom:none; }
        .pr-idle {
          display:flex; flex-direction:column; align-items:center;
          justify-content:center; padding:56px 24px; text-align:center; gap:12px;
        }
        .pr-idle-text { font-size:13px; color:#4b5563; font-family:ui-monospace,monospace; }
        .pr-error {
          padding:14px; border-radius:10px; background:rgba(239,68,68,0.08);
          border:1px solid rgba(239,68,68,0.2); color:#f87171;
          font-size:13px; font-family:ui-monospace,monospace;
          display:flex; gap:8px; align-items:flex-start;
        }
        .pr-loading { display:flex; align-items:center; justify-content:center; padding:56px; color:#6b7280; font-size:13px; font-family:ui-monospace,monospace; gap:10px; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .spin { animation:spin 1s linear infinite; display:inline-block; }
      `}</style>

      <h1 className="pr-title">Severity Prediction</h1>
      <p className="pr-sub">Predict accident severity · Random Forest · 79% accuracy</p>

      <div className="pr-layout">

        {/* ── Input form ── */}
        <div className="pr-card">
          <div className="pr-card-title">Input features</div>

          <div className="pr-row2">
            <div className="pr-field">
              <label className="pr-label">Latitude</label>
              <input className="pr-input" type="number" step="0.0001"
                placeholder="e.g. 34.0522"
                value={form.latitude}
                onChange={e => set("latitude", Number(e.target.value))} />
            </div>
            <div className="pr-field">
              <label className="pr-label">Longitude</label>
              <input className="pr-input" type="number" step="0.0001"
                placeholder="e.g. -118.2437"
                value={form.longitude}
                onChange={e => set("longitude", Number(e.target.value))} />
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Hour of day</label>
            <div className="pr-hour-grid">
              {HOUR_PRESETS.map(h => (
                <button key={h}
                  className={`pr-hour-btn ${form.hour === h ? "active" : ""}`}
                  onClick={() => set("hour", h)}
                >
                  {String(h).padStart(2, "0")}:00
                </button>
              ))}
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Temperature — {form.temperature}°F</label>
            <div className="pr-slider-wrap">
              <input type="range" className="pr-slider" min={-20} max={120} step={1}
                value={form.temperature}
                onChange={e => set("temperature", Number(e.target.value))} />
              <span className="pr-slider-val">{form.temperature}°F</span>
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Visibility — {form.visibility} mi</label>
            <div className="pr-slider-wrap">
              <input type="range" className="pr-slider" min={0} max={10} step={0.5}
                value={form.visibility}
                onChange={e => set("visibility", Number(e.target.value))} />
              <span className="pr-slider-val">{form.visibility} mi</span>
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Weather condition</label>
            <select className="pr-select" value={form.weather_condition}
              onChange={e => set("weather_condition", e.target.value)}>
              {WEATHER_CONDITIONS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          <button className="pr-predict-btn" onClick={handlePredict} disabled={loading}>
            {loading
              ? <><span className="spin">⟳</span> Predicting…</>
              : <><BrainCircuit size={16} /> Predict severity</>}
          </button>
        </div>

        {/* ── Result panel ── */}
        <div className="pr-card">
          <div className="pr-card-title">Prediction result</div>

          {error && (
            <div className="pr-error">
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {!error && loading && (
            <div className="pr-loading">
              <span className="spin" style={{ fontSize: 20 }}>⟳</span> Running model…
            </div>
          )}

          {!error && !loading && !result && (
            <div className="pr-idle">
              <BrainCircuit size={52} color="#1e3a5f" />
              <span className="pr-idle-text">Fill in the form and click predict</span>
            </div>
          )}

          {!error && !loading && result && sev && (
            <>
              <div className="pr-result-card" style={{ background: sev.bg }}>
                <div className="pr-result-top">
                  <div className="pr-result-label">Predicted severity</div>
                  <div className="pr-result-num" style={{ color: sev.color }}>{result.severity}</div>
                  <div className="pr-result-badge"
                    style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.color}` }}>
                    {sev.label}
                  </div>
                  <div className="pr-result-desc">{sev.desc}</div>
                  <div className="pr-confidence">
                    Confidence: <span style={{ color: sev.color, fontWeight: 500 }}>{result.confidence}%</span>
                  </div>
                </div>

                {/* Probability bars */}
                <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "ui-monospace,monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Class probabilities
                </div>
                <div className="pr-proba-grid">
                  {Object.entries(result.probabilities).map(([cls, pct]) => {
                    const m = SEV_META[Number(cls)];
                    return (
                      <div key={cls} className="pr-proba-row">
                        <span className="pr-proba-label" style={{ color: m?.color }}>S{cls}</span>
                        <div className="pr-proba-track">
                          <div className="pr-proba-fill"
                            style={{ width: `${pct}%`, background: m?.color ?? "#6b7280" }} />
                        </div>
                        <span className="pr-proba-pct">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Input summary */}
              <div className="pr-summary">
                {([
                  ["Latitude",    form.latitude],
                  ["Longitude",   form.longitude],
                  ["Hour",        `${String(form.hour).padStart(2,"0")}:00`],
                  ["Temperature", `${form.temperature}°F`],
                  ["Visibility",  `${form.visibility} mi`],
                  ["Weather",     form.weather_condition],
                ] as [string, any][]).map(([k, v]) => (
                  <div key={k} className="pr-summary-row">
                    <span style={{ color: "#6b7280", fontFamily: "ui-monospace,monospace" }}>{k}</span>
                    <span style={{ color: "#e5e7eb" }}>{v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}