// src/pages/PredictPage.tsx
import React, { useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { BrainCircuit, AlertCircle, TrendingUp, AlertTriangle, Info } from "lucide-react";

interface PredictForm {
  state: string;
  weather_condition: string;
  temperature_c: number;
  visibility_km: number;
  season: string;
  time_of_day: string;
  hour: number;
  month: number;
  day_of_week: number;
  is_weekend: boolean;
}

interface PredictResult {
  predicted_severity: number;
  severity_label: string;
  confidence_percentage: number;
  confidence_level: string;
  probability: Record<string, number>;
}

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

const WEATHER_CONDITIONS = [
  "Fair", "Clear", "Cloudy", "Mostly Cloudy", "Partly Cloudy",
  "Rain", "Heavy Rain", "Light Rain", "Snow", "Heavy Snow",
  "Fog", "Mist", "Haze", "Thunderstorm", "Windy", "Unknown"
];

const SEASONS = ["Spring", "Summer", "Fall", "Winter"];
const TIME_OF_DAY = ["Morning", "Afternoon", "Evening", "Night"];

const SEV_META: Record<number, { label: string; color: string; bg: string; desc: string; icon: JSX.Element }> = {
  1: { 
    label: "Low", 
    color: "#60a5fa", 
    bg: "rgba(59,130,246,0.12)", 
    desc: "Minor accident with minimal damage. Usually no injuries.",
    icon: <Info size={16} />
  },
  2: { 
    label: "Moderate", 
    color: "#fbbf24", 
    bg: "rgba(251,191,36,0.12)", 
    desc: "Medium severity accident with possible injuries. May cause traffic delays.",
    icon: <AlertTriangle size={16} />
  },
  3: { 
    label: "High", 
    color: "#fb923c", 
    bg: "rgba(251,146,60,0.12)", 
    desc: "Serious accident with confirmed injuries. Significant traffic disruption.",
    icon: <AlertTriangle size={16} />
  },
  4: { 
    label: "Critical", 
    color: "#f87171", 
    bg: "rgba(248,113,113,0.12)", 
    desc: "Severe accident with major injuries or fatalities. Complete road closure.",
    icon: <AlertTriangle size={16} />
  },
};

const HOUR_PRESETS = [0, 3, 6, 7, 8, 9, 12, 15, 16, 17, 18, 21, 22, 23];
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, name: new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' }) }));
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function PredictPage() {
  const { token } = useAuth();
  const [form, setForm] = useState<PredictForm>({
    state: "CA",
    weather_condition: "Fair",
    temperature_c: 20,
    visibility_km: 16,
    season: "Summer",
    time_of_day: "Afternoon",
    hour: 14,
    month: 6,
    day_of_week: 2,
    is_weekend: false,
  });
  const [result, setResult] = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFormField = (k: keyof PredictForm, v: any) =>
    setForm(f => ({ ...f, [k]: v }));

  const handlePredict = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.post(
        "http://127.0.0.1:5050/api/predict/severity",
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResult(res.data.prediction);
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  const sev = result ? SEV_META[result.predicted_severity] : null;
  const getConfidenceColor = (level: string) => {
    switch(level) {
      case "High": return "#22c55e";
      case "Moderate": return "#eab308";
      default: return "#f97316";
    }
  };

  return (
    <>
      <style>{`
        .pr-title { font-size: 22px; font-weight: 500; color: var(--text-main); margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
        .pr-sub   { font-size: 12px; color: var(--text-muted); font-family: var(--mono); margin: 0 0 28px; }

        .pr-layout {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 16px; align-items: start;
        }

        .pr-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px; padding: 22px;
        }
        .pr-card-title {
          font-size: 13px; font-weight: 500; color: #93c5fd;
          text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 16px;
          display: flex; align-items: center; gap: 6px;
        }

        .pr-field { margin-bottom: 16px; }
        .pr-label {
          display: block; font-size: 11px; color: var(--text-muted);
          font-family: var(--mono); text-transform: uppercase;
          letter-spacing: 0.06em; margin-bottom: 6px;
        }

        .pr-input, .pr-select {
          width: 100%; height: 36px; padding: 0 12px; box-sizing: border-box;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-main);
          font-size: 13px; font-family: inherit;
          transition: border-color 0.15s;
        }
        .pr-input:focus, .pr-select:focus {
          outline: none; border-color: var(--primary-color);
        }
        .pr-select option {
          background: var(--bg-surface-alt);
          color: var(--text-main);
        }

        .pr-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        .pr-slider-wrap { display: flex; align-items: center; gap: 10px; }
        .pr-slider { flex: 1; accent-color: var(--primary-color); }
        .pr-slider-val {
          font-size: 13px; color: #93c5fd;
          font-family: var(--mono); min-width: 60px; text-align: right;
        }

        .pr-hour-grid, .pr-month-grid, .pr-day-grid {
          display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;
        }
        .pr-hour-btn, .pr-month-btn, .pr-day-btn {
          height: 28px; padding: 0 10px; border-radius: 6px;
          border: 1px solid var(--border);
          background: transparent; color: var(--text-muted);
          font-size: 11px; cursor: pointer;
          font-family: var(--mono); transition: all 0.1s;
        }
        .pr-hour-btn:hover, .pr-month-btn:hover, .pr-day-btn:hover {
          background: var(--primary-color-soft); color: #93c5fd;
        }
        .pr-hour-btn.active, .pr-month-btn.active, .pr-day-btn.active {
          background: var(--primary-color); color: white; border-color: var(--primary-color);
        }

        .pr-weekend-row {
          display: flex; align-items: center; gap: 12px; margin-top: 8px;
        }
        .pr-weekend-label {
          font-size: 12px; color: var(--text-muted);
        }
        .pr-weekend-btn {
          padding: 4px 12px; border-radius: 20px;
          border: 1px solid var(--border);
          background: transparent;
          cursor: pointer;
          font-size: 11px;
          transition: all 0.1s;
        }
        .pr-weekend-btn.active {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }

        .pr-predict-btn {
          width: 100%; height: 42px; border-radius: 10px; border: none;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          color: white; font-size: 14px; font-weight: 500; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: opacity 0.15s; margin-top: 20px;
        }
        .pr-predict-btn:hover    { opacity: 0.88; }
        .pr-predict-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .pr-result-card { border-radius: 12px; padding: 24px; border: 1px solid var(--border); margin-bottom: 16px; }
        .pr-result-top  { text-align: center; margin-bottom: 20px; }
        .pr-result-label {
          font-size: 11px; color: var(--text-muted);
          font-family: var(--mono); text-transform: uppercase;
          letter-spacing: 0.06em; margin-bottom: 10px;
        }
        .pr-result-num    { font-size: 72px; font-weight: 500; line-height: 1; margin-bottom: 8px; }
        .pr-result-badge  { display: inline-block; padding: 4px 16px; border-radius: 99px; font-size: 13px; font-weight: 500; margin-bottom: 8px; }
        .pr-result-desc   { font-size: 13px; color: var(--text-muted); }
        .pr-confidence    { font-size: 13px; color: var(--text-muted); margin-top: 6px; }

        .pr-proba-section-label {
          font-size: 11px; color: var(--text-muted); font-family: var(--mono);
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px;
        }
        .pr-proba-grid  { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
        .pr-proba-row   { display: flex; align-items: center; gap: 10px; }
        .pr-proba-label { font-size: 12px; font-family: var(--mono); color: var(--text-muted); width: 20px; flex-shrink: 0; }
        .pr-proba-track { flex: 1; height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
        .pr-proba-fill  { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
        .pr-proba-pct   { font-size: 12px; font-family: var(--mono); color: var(--text-muted); width: 38px; text-align: right; flex-shrink: 0; }

        .pr-summary { display: flex; flex-direction: column; gap: 10px; }
        .pr-summary-row {
          display: flex; justify-content: space-between;
          font-size: 12px; padding: 6px 0;
          border-bottom: 1px solid var(--border);
        }
        .pr-summary-row:last-child { border-bottom: none; }
        .pr-summary-key { color: var(--text-muted); font-family: var(--mono); }
        .pr-summary-val { color: var(--text-main); font-weight: 500; }

        .pr-idle {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 56px 24px; text-align: center; gap: 12px;
        }
        .pr-idle-text { font-size: 13px; color: var(--text-muted); font-family: var(--mono); }

        .pr-error {
          padding: 14px; border-radius: 10px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          color: #f87171; font-size: 13px; font-family: var(--mono);
          display: flex; gap: 8px; align-items: flex-start;
        }

        .pr-loading {
          display: flex; align-items: center; justify-content: center;
          padding: 56px; color: var(--text-muted);
          font-size: 13px; font-family: var(--mono); gap: 10px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; display: inline-block; }

        @media (max-width: 768px) {
          .pr-layout { grid-template-columns: 1fr; }
          .pr-hour-grid { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      <div>
        <h1 className="pr-title">
          <BrainCircuit size={24} /> Severity Prediction
        </h1>
        <p className="pr-sub">Predict accident severity using Random Forest model</p>
      </div>

      <div className="pr-layout">

        {/* Input form */}
        <div className="pr-card">
          <div className="pr-card-title">
            <TrendingUp size={14} /> Input features
          </div>

          <div className="pr-row2">
            <div className="pr-field">
              <label className="pr-label">State</label>
              <select className="pr-select" value={form.state} onChange={e => setFormField("state", e.target.value)}>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="pr-field">
              <label className="pr-label">Season</label>
              <select className="pr-select" value={form.season} onChange={e => setFormField("season", e.target.value)}>
                {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="pr-row2">
            <div className="pr-field">
              <label className="pr-label">Weather condition</label>
              <select className="pr-select" value={form.weather_condition} onChange={e => setFormField("weather_condition", e.target.value)}>
                {WEATHER_CONDITIONS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div className="pr-field">
              <label className="pr-label">Time of day</label>
              <select className="pr-select" value={form.time_of_day} onChange={e => setFormField("time_of_day", e.target.value)}>
                {TIME_OF_DAY.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Temperature — {form.temperature_c}°C</label>
            <div className="pr-slider-wrap">
              <input type="range" className="pr-slider" min={-30} max={50} step={1}
                value={form.temperature_c}
                onChange={e => setFormField("temperature_c", Number(e.target.value))} />
              <span className="pr-slider-val">{form.temperature_c}°C</span>
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Visibility — {form.visibility_km} km</label>
            <div className="pr-slider-wrap">
              <input type="range" className="pr-slider" min={0} max={50} step={0.5}
                value={form.visibility_km}
                onChange={e => setFormField("visibility_km", Number(e.target.value))} />
              <span className="pr-slider-val">{form.visibility_km} km</span>
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Hour of day — {String(form.hour).padStart(2, "0")}:00</label>
            <div className="pr-hour-grid">
              {HOUR_PRESETS.map(h => (
                <button key={h}
                  className={`pr-hour-btn ${form.hour === h ? "active" : ""}`}
                  onClick={() => setFormField("hour", h)}
                >
                  {String(h).padStart(2, "0")}:00
                </button>
              ))}
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Month — {MONTHS.find(m => m.value === form.month)?.name}</label>
            <div className="pr-month-grid">
              {MONTHS.slice(0, 6).map(m => (
                <button key={m.value}
                  className={`pr-month-btn ${form.month === m.value ? "active" : ""}`}
                  onClick={() => setFormField("month", m.value)}
                >
                  {m.name.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="pr-month-grid" style={{ marginTop: '4px' }}>
              {MONTHS.slice(6, 12).map(m => (
                <button key={m.value}
                  className={`pr-month-btn ${form.month === m.value ? "active" : ""}`}
                  onClick={() => setFormField("month", m.value)}
                >
                  {m.name.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Day of week — {DAYS[form.day_of_week]}</label>
            <div className="pr-day-grid">
              {DAYS.map((d, idx) => (
                <button key={idx}
                  className={`pr-day-btn ${form.day_of_week === idx ? "active" : ""}`}
                  onClick={() => setFormField("day_of_week", idx)}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Weekend</label>
            <div className="pr-weekend-row">
              <button
                className={`pr-weekend-btn ${!form.is_weekend ? "active" : ""}`}
                onClick={() => setFormField("is_weekend", false)}
              >
                Weekday
              </button>
              <button
                className={`pr-weekend-btn ${form.is_weekend ? "active" : ""}`}
                onClick={() => setFormField("is_weekend", true)}
              >
                Weekend
              </button>
            </div>
          </div>

          <button className="pr-predict-btn" onClick={handlePredict} disabled={loading}>
            {loading
              ? <><span className="spin">⟳</span> Predicting…</>
              : <><BrainCircuit size={16} /> Predict severity</>}
          </button>
        </div>

        {/* Result panel */}
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
              <span className="spin" style={{ fontSize: 20 }}>⟳</span> Running model...
            </div>
          )}

          {!error && !loading && !result && (
            <div className="pr-idle">
              <BrainCircuit size={52} color="var(--border2)" />
              <span className="pr-idle-text">Fill in the form and click predict</span>
            </div>
          )}

          {!error && !loading && result && sev && (
            <>
              <div className="pr-result-card" style={{ background: sev.bg }}>
                <div className="pr-result-top">
                  <div className="pr-result-label">Predicted severity</div>
                  <div className="pr-result-num" style={{ color: sev.color }}>{result.predicted_severity}</div>
                  <div className="pr-result-badge"
                    style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.color}` }}>
                    {sev.label}
                  </div>
                  <div className="pr-result-desc">{sev.desc}</div>
                  <div className="pr-confidence">
                    Confidence: <span style={{ color: getConfidenceColor(result.confidence_level), fontWeight: 500 }}>
                      {result.confidence_percentage}% ({result.confidence_level})
                    </span>
                  </div>
                </div>

                <div className="pr-proba-section-label">Probability distribution</div>
                <div className="pr-proba-grid">
                  {Object.entries(result.probability).map(([cls, pct]) => {
                    const m = SEV_META[Number(cls)];
                    return (
                      <div key={cls} className="pr-proba-row">
                        <span className="pr-proba-label" style={{ color: m?.color }}>S{cls}</span>
                        <div className="pr-proba-track">
                          <div className="pr-proba-fill"
                            style={{ width: `${pct * 100}%`, background: m?.color ?? "var(--text-muted)" }} />
                        </div>
                        <span className="pr-proba-pct">{(pct * 100).toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Input summary */}
              <div className="pr-summary">
                <div className="pr-summary-row">
                  <span className="pr-summary-key">State</span>
                  <span className="pr-summary-val">{form.state}</span>
                </div>
                <div className="pr-summary-row">
                  <span className="pr-summary-key">Weather</span>
                  <span className="pr-summary-val">{form.weather_condition}</span>
                </div>
                <div className="pr-summary-row">
                  <span className="pr-summary-key">Temperature</span>
                  <span className="pr-summary-val">{form.temperature_c}°C</span>
                </div>
                <div className="pr-summary-row">
                  <span className="pr-summary-key">Visibility</span>
                  <span className="pr-summary-val">{form.visibility_km} km</span>
                </div>
                <div className="pr-summary-row">
                  <span className="pr-summary-key">Time</span>
                  <span className="pr-summary-val">{String(form.hour).padStart(2, "0")}:00 ({form.time_of_day})</span>
                </div>
                <div className="pr-summary-row">
                  <span className="pr-summary-key">Date</span>
                  <span className="pr-summary-val">{MONTHS.find(m => m.value === form.month)?.name}, {DAYS[form.day_of_week]}{form.is_weekend ? " (Weekend)" : ""}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}