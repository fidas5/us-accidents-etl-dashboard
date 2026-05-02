// src/pages/PredictPage.tsx
import React, { useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import {
  BrainCircuit, AlertCircle, TrendingUp,
  AlertTriangle, Info, MapPin,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  // Road infrastructure
  amenity: boolean;
  bump: boolean;
  crossing: boolean;
  give_way: boolean;
  junction: boolean;
  no_exit: boolean;
  railway: boolean;
  roundabout: boolean;
  station: boolean;
  stop: boolean;
  traffic_calming: boolean;
  traffic_signal: boolean;
  turning_loop: boolean;
}

interface PredictResult {
  predicted_severity: number;
  severity_label: string;
  confidence_percentage: number;
  confidence_level: string;
  // API returns string keys: {"1": 0.04, "2": 0.31, "3": 0.52, "4": 0.13}
  probability: Record<string, number>;
}

// ── Static data ───────────────────────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const WEATHER_CONDITIONS = [
  "Clear","Fair","Cloudy","Mostly Cloudy","Partly Cloudy",
  "Rain","Heavy Rain","Light Rain","Snow","Heavy Snow",
  "Fog","Mist","Haze","Thunderstorm","Windy","Unknown",
];

const SEASONS    = ["Spring","Summer","Fall","Winter"];
const TIME_OF_DAY = ["Morning","Afternoon","Evening","Night"];
const DAYS       = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const MONTHS     = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  name: new Date(2000, i, 1).toLocaleString("en-US", { month: "long" }),
}));

const ROAD_FLAGS: { key: keyof PredictForm; label: string; tip: string }[] = [
  { key: "traffic_signal", label: "Traffic Signal", tip: "Accident occurred at a traffic signal" },
  { key: "junction",       label: "Junction",       tip: "Accident occurred at a road junction" },
  { key: "crossing",       label: "Crossing",       tip: "Pedestrian or road crossing nearby" },
  { key: "stop",           label: "Stop Sign",      tip: "Stop sign present at location" },
  { key: "railway",        label: "Railway",        tip: "Railway crossing nearby" },
  { key: "station",        label: "Station",        tip: "Transit station nearby" },
  { key: "amenity",        label: "Amenity",        tip: "Nearby amenity (shop, restaurant, etc.)" },
  { key: "give_way",       label: "Give Way",       tip: "Give way / yield sign present" },
  { key: "no_exit",        label: "No Exit",        tip: "Dead-end road / no exit" },
  { key: "bump",           label: "Speed Bump",     tip: "Speed bump on road" },
  { key: "roundabout",     label: "Roundabout",     tip: "Roundabout intersection" },
  { key: "traffic_calming",label: "Traffic Calming",tip: "Traffic calming measure present" },
  { key: "turning_loop",   label: "Turning Loop",   tip: "Turning loop at location" },
];

const SEV_META: Record<number, { label: string; color: string; bg: string; desc: string; icon: React.ReactNode }> = {
  1: { label: "Low",      color: "#60a5fa", bg: "rgba(59,130,246,0.10)",  desc: "Minor accident. No or very minor injuries.",                                    icon: <Info size={14} /> },
  2: { label: "Moderate", color: "#fbbf24", bg: "rgba(251,191,36,0.10)",  desc: "Possible injuries. May cause traffic delays.",                                  icon: <AlertTriangle size={14} /> },
  3: { label: "High",     color: "#fb923c", bg: "rgba(251,146,60,0.10)",  desc: "Confirmed injuries. Significant traffic disruption.",                           icon: <AlertTriangle size={14} /> },
  4: { label: "Critical", color: "#f87171", bg: "rgba(248,113,113,0.10)", desc: "Major injuries or fatalities. Complete road closure.",                          icon: <AlertTriangle size={14} /> },
};

const CONF_COLOR: Record<string, string> = {
  High: "#22c55e", Moderate: "#eab308", Low: "#f97316",
};

const DEFAULT_FORM: PredictForm = {
  state: "CA", weather_condition: "Clear",
  temperature_c: 20, visibility_km: 10,
  season: "Summer", time_of_day: "Afternoon",
  hour: 14, month: 6, day_of_week: 2, is_weekend: false,
  amenity: false, bump: false, crossing: false, give_way: false,
  junction: false, no_exit: false, railway: false, roundabout: false,
  station: false, stop: false, traffic_calming: false,
  traffic_signal: false, turning_loop: false,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PredictPage() {
  const { token } = useAuth();
  const [form, setForm]       = useState<PredictForm>(DEFAULT_FORM);
  const [result, setResult]   = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<any>(null);

  const set = (k: keyof PredictForm, v: any) =>
    setForm(f => ({ ...f, [k]: v }));

  // Load model info once
  React.useEffect(() => {
    if (!token) return;
    axios
      .get("http://127.0.0.1:5050/api/predict/model-info", {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(r => setModelInfo(r.data))
      .catch(() => {});
  }, [token]);

  const handlePredict = async () => {
    if (!token) { setError("Authentication required. Please log in."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await axios.post<{ success: boolean; prediction: PredictResult }>(
        "http://127.0.0.1:5050/api/predict/severity",
        form,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      if (res.data.success && res.data.prediction) {
        setResult(res.data.prediction);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (e: any) {
      if (e.response?.status === 401) setError("Authentication failed. Please log in again.");
      else if (e.response?.status === 503) setError("Model not trained yet. Run train_model.py first.");
      else setError(e.response?.data?.error ?? e.message ?? "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  const sev = result ? SEV_META[result.predicted_severity] : null;
  const activeRoadFlags = ROAD_FLAGS.filter(f => form[f.key]);

  return (
    <>
      <style>{`
        /* ── Layout ─────────────────────────────────────────── */
        .pr-title { font-size: 22px; font-weight: 500; color: var(--text-main); margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
        .pr-sub   { font-size: 12px; color: var(--text-muted); font-family: var(--mono); margin: 0 0 28px; }
        .pr-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .pr-layout { grid-template-columns: 1fr; } }

        /* ── Cards ──────────────────────────────────────────── */
        .pr-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 22px; }
        .pr-card-title { font-size: 13px; font-weight: 500; color: #93c5fd; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 16px; display: flex; align-items: center; gap: 6px; }
        .pr-section { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border); }
        .pr-section-title { font-size: 11px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }

        /* ── Fields ─────────────────────────────────────────── */
        .pr-field { margin-bottom: 16px; }
        .pr-label { display: block; font-size: 11px; color: var(--text-muted); font-family: var(--mono); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
        .pr-row2  { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pr-input, .pr-select { width: 100%; height: 36px; padding: 0 12px; box-sizing: border-box; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text-main); font-size: 13px; font-family: inherit; transition: border-color .15s; }
        .pr-input:focus, .pr-select:focus { outline: none; border-color: var(--primary-color); }
        .pr-select option { background: var(--bg-surface-alt); color: var(--text-main); }

        /* ── Sliders ────────────────────────────────────────── */
        .pr-slider-wrap { display: flex; align-items: center; gap: 10px; }
        .pr-slider { flex: 1; accent-color: var(--primary-color); }
        .pr-slider-val { font-size: 13px; color: #93c5fd; font-family: var(--mono); min-width: 60px; text-align: right; }

        /* ── Pill button grids (hour / month / day) ─────────── */
        .pr-pill-grid { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
        .pr-pill { height: 28px; padding: 0 9px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 11px; cursor: pointer; font-family: var(--mono); transition: all .1s; white-space: nowrap; }
        .pr-pill:hover  { background: var(--primary-color-soft); color: #93c5fd; }
        .pr-pill.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }

        /* ── Road flags grid ────────────────────────────────── */
        .pr-road-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 6px; }
        .pr-road-flag {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 10px; border-radius: 8px;
          border: 1px solid var(--border);
          background: transparent; cursor: pointer;
          font-size: 12px; font-family: inherit;
          color: var(--text-muted);
          transition: all .12s; text-align: left;
        }
        .pr-road-flag:hover { border-color: #3b82f6; color: var(--text-main); }
        .pr-road-flag.active { border-color: #3b82f6; background: rgba(59,130,246,0.12); color: #93c5fd; }
        .pr-road-dot { width: 8px; height: 8px; border-radius: 50%; border: 2px solid currentColor; flex-shrink: 0; transition: all .12s; }
        .pr-road-flag.active .pr-road-dot { background: #3b82f6; border-color: #3b82f6; }
        .pr-road-hint { font-size: 10px; color: var(--text-muted); margin-top: 8px; font-family: var(--mono); }

        /* ── Weekend toggle ─────────────────────────────────── */
        .pr-toggle-row { display: flex; align-items: center; gap: 8px; }
        .pr-toggle-btn { padding: 4px 14px; border-radius: 20px; border: 1px solid var(--border); background: transparent; cursor: pointer; font-size: 11px; color: var(--text-muted); transition: all .1s; font-family: inherit; }
        .pr-toggle-btn.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }

        /* ── Predict button ─────────────────────────────────── */
        .pr-predict-btn { width: 100%; height: 42px; border-radius: 10px; border: none; background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; font-size: 14px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity .15s; margin-top: 20px; }
        .pr-predict-btn:hover    { opacity: .88; }
        .pr-predict-btn:disabled { opacity: .45; cursor: not-allowed; }

        /* ── Model info bar ─────────────────────────────────── */
        .pr-model-bar { margin-top: 12px; padding: 9px 12px; background: var(--surface2); border-radius: 8px; font-size: 11px; color: var(--text-muted); font-family: var(--mono); text-align: center; }

        /* ── Result card ────────────────────────────────────── */
        .pr-result-wrap { border-radius: 12px; padding: 22px; border: 1px solid var(--border); margin-bottom: 16px; }
        .pr-result-top  { text-align: center; margin-bottom: 20px; }
        .pr-result-eyebrow { font-size: 11px; color: var(--text-muted); font-family: var(--mono); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
        .pr-result-num    { font-size: 72px; font-weight: 500; line-height: 1; margin-bottom: 8px; }
        .pr-result-badge  { display: inline-block; padding: 4px 16px; border-radius: 99px; font-size: 13px; font-weight: 500; margin-bottom: 8px; }
        .pr-result-desc   { font-size: 13px; color: var(--text-muted); }
        .pr-result-conf   { font-size: 13px; color: var(--text-muted); margin-top: 6px; }

        /* ── Probability bars ───────────────────────────────── */
        .pr-proba-label-row { font-size: 11px; color: var(--text-muted); font-family: var(--mono); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
        .pr-proba-grid { display: flex; flex-direction: column; gap: 10px; }
        .pr-proba-row  { display: flex; align-items: center; gap: 10px; }
        .pr-proba-sev  { font-size: 12px; font-family: var(--mono); width: 60px; flex-shrink: 0; font-weight: 500; }
        .pr-proba-track { flex: 1; height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
        .pr-proba-fill  { height: 100%; border-radius: 4px; transition: width .6s ease; }
        .pr-proba-pct   { font-size: 12px; font-family: var(--mono); color: var(--text-muted); width: 45px; text-align: right; flex-shrink: 0; font-weight: 500; }

        /* ── Input summary ──────────────────────────────────── */
        .pr-summary { display: flex; flex-direction: column; gap: 0; margin-top: 16px; }
        .pr-summary-row { display: flex; justify-content: space-between; font-size: 12px; padding: 7px 0; border-bottom: 1px solid var(--border); }
        .pr-summary-row:last-child { border-bottom: none; }
        .pr-summary-key { color: var(--text-muted); font-family: var(--mono); }
        .pr-summary-val { color: var(--text-main); font-weight: 500; }
        .pr-road-active-list { display: flex; flex-wrap: wrap; gap: 4px; }
        .pr-road-chip { font-size: 10px; padding: 2px 7px; border-radius: 10px; background: rgba(59,130,246,0.15); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); font-family: var(--mono); }

        /* ── Idle / loading / error states ─────────────────── */
        .pr-idle    { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 56px 24px; text-align: center; gap: 12px; }
        .pr-idle-txt { font-size: 13px; color: var(--text-muted); font-family: var(--mono); }
        .pr-error   { padding: 14px; border-radius: 10px; background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.2); color: #f87171; font-size: 13px; font-family: var(--mono); display: flex; gap: 8px; align-items: flex-start; }
        .pr-loading { display: flex; align-items: center; justify-content: center; padding: 56px; color: var(--text-muted); font-size: 13px; font-family: var(--mono); gap: 10px; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; display: inline-block; }
      `}</style>

      {/* Header */}
      <div>
        <h1 className="pr-title"><BrainCircuit size={24} /> Severity Prediction</h1>
        <p className="pr-sub">
          Random Forest 
          · 1 = Low → 4 = Critical
        </p>
      </div>

      <div className="pr-layout">

        {/* ── LEFT: Input form ───────────────────────────────── */}
        <div className="pr-card">
          <div className="pr-card-title"><TrendingUp size={14} /> Input features</div>

          {/* Location & weather */}
          <div className="pr-row2">
            <div className="pr-field">
              <label className="pr-label">State *</label>
              <select className="pr-select" value={form.state} onChange={e => set("state", e.target.value)}>
                {US_STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="pr-field">
              <label className="pr-label">Season</label>
              <select className="pr-select" value={form.season} onChange={e => set("season", e.target.value)}>
                {SEASONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="pr-row2">
            <div className="pr-field">
              <label className="pr-label">Weather *</label>
              <select className="pr-select" value={form.weather_condition} onChange={e => set("weather_condition", e.target.value)}>
                {WEATHER_CONDITIONS.map(w => <option key={w}>{w}</option>)}
              </select>
            </div>
            <div className="pr-field">
              <label className="pr-label">Time of day</label>
              <select className="pr-select" value={form.time_of_day} onChange={e => set("time_of_day", e.target.value)}>
                {TIME_OF_DAY.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Sliders */}
          <div className="pr-field">
            <label className="pr-label">Temperature — {form.temperature_c}°C</label>
            <div className="pr-slider-wrap">
              <input type="range" className="pr-slider" min={-30} max={50} step={1}
                value={form.temperature_c} onChange={e => set("temperature_c", Number(e.target.value))} />
              <span className="pr-slider-val">{form.temperature_c}°C</span>
            </div>
          </div>

          <div className="pr-field">
            <label className="pr-label">Visibility — {form.visibility_km} km</label>
            <div className="pr-slider-wrap">
              <input type="range" className="pr-slider" min={0} max={50} step={0.5}
                value={form.visibility_km} onChange={e => set("visibility_km", Number(e.target.value))} />
              <span className="pr-slider-val">{form.visibility_km} km</span>
            </div>
          </div>

          {/* Hour */}
          <div className="pr-field">
            <label className="pr-label">Hour — {String(form.hour).padStart(2, "0")}:00</label>
            <div className="pr-pill-grid">
              {Array.from({ length: 24 }, (_, h) => (
                <button key={h} className={`pr-pill ${form.hour === h ? "active" : ""}`}
                  onClick={() => set("hour", h)}>
                  {String(h).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>

          {/* Month */}
          <div className="pr-field">
            <label className="pr-label">Month — {MONTHS.find(m => m.value === form.month)?.name}</label>
            <div className="pr-pill-grid">
              {MONTHS.map(m => (
                <button key={m.value} className={`pr-pill ${form.month === m.value ? "active" : ""}`}
                  onClick={() => set("month", m.value)}>
                  {m.name.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Day */}
          <div className="pr-field">
            <label className="pr-label">Day — {DAYS[form.day_of_week]}</label>
            <div className="pr-pill-grid">
              {DAYS.map((d, i) => (
                <button key={i} className={`pr-pill ${form.day_of_week === i ? "active" : ""}`}
                  onClick={() => set("day_of_week", i)}>
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Weekend */}
          <div className="pr-field">
            <label className="pr-label">Weekend</label>
            <div className="pr-toggle-row">
              {[false, true].map(v => (
                <button key={String(v)} className={`pr-toggle-btn ${form.is_weekend === v ? "active" : ""}`}
                  onClick={() => set("is_weekend", v)}>
                  {v ? "Weekend" : "Weekday"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Road Infrastructure ─────────────────────────── */}
          <div className="pr-section">
            <div className="pr-section-title">
              <MapPin size={12} /> Road Infrastructure
            </div>
            <div className="pr-road-grid">
              {ROAD_FLAGS.map(({ key, label, tip }) => (
                <button key={key} title={tip}
                  className={`pr-road-flag ${form[key] ? "active" : ""}`}
                  onClick={() => set(key, !form[key])}>
                  <span className="pr-road-dot" />
                  {label}
                </button>
              ))}
            </div>
            <p className="pr-road-hint">
              Toggle features present at the accident location.
              These are among the top predictors in the model.
            </p>
          </div>

          {/* Predict */}
          <button className="pr-predict-btn" onClick={handlePredict} disabled={loading}>
            {loading
              ? <><span className="spin">⟳</span> Predicting…</>
              : <><BrainCircuit size={16} /> Predict severity</>}
          </button>

          {modelInfo && (
            <div className="pr-model-bar">
              RF · {modelInfo.n_estimators} trees · depth {modelInfo.max_depth} ·
              OOB {(modelInfo.oob_score * 100).toFixed(1)}% ·
              thresholds t1={modelInfo.calibrated_thresholds?.[1]}
              &nbsp;t3={modelInfo.calibrated_thresholds?.[3]}
              &nbsp;t4={modelInfo.calibrated_thresholds?.[4]}
            </div>
          )}
        </div>

        {/* ── RIGHT: Result panel ────────────────────────────── */}
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
              <BrainCircuit size={52} color="var(--border2)" />
              <span className="pr-idle-txt">Fill in the form and click Predict</span>
            </div>
          )}

          {!error && !loading && result && sev && (() => {
            // ── FIX: API returns string keys → access with String(severity)
            const proba = (s: number) =>
              result.probability[String(s)] ?? result.probability[s as any] ?? 0;

            return (
              <>
                <div className="pr-result-wrap" style={{ background: sev.bg }}>
                  <div className="pr-result-top">
                    <div className="pr-result-eyebrow">Predicted severity</div>
                    <div className="pr-result-num" style={{ color: sev.color }}>
                      {result.predicted_severity}
                    </div>
                    <div className="pr-result-badge"
                      style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.color}` }}>
                      {sev.label}
                    </div>
                    <div className="pr-result-desc">{sev.desc}</div>
                    <div className="pr-result-conf">
                      Confidence:{" "}
                      <span style={{ color: CONF_COLOR[result.confidence_level] ?? "#f97316", fontWeight: 500 }}>
                        {result.confidence_percentage.toFixed(1)}% ({result.confidence_level})
                      </span>
                    </div>
                  </div>

                  <div className="pr-proba-label-row">Probability distribution</div>
                  <div className="pr-proba-grid">
                    {[1, 2, 3, 4].map(s => {
                      const p   = proba(s);
                      const m   = SEV_META[s];
                      const pct = (p * 100).toFixed(1);
                      return (
                        <div key={s} className="pr-proba-row">
                          <span className="pr-proba-sev" style={{ color: m.color }}>
                            Sev {s}
                          </span>
                          <div className="pr-proba-track">
                            <div className="pr-proba-fill"
                              style={{ width: `${p * 100}%`, background: m.color, opacity: p > 0.1 ? 1 : 0.35 }} />
                          </div>
                          <span className="pr-proba-pct">{pct}%</span>
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
                    <span className="pr-summary-val">
                      {String(form.hour).padStart(2, "0")}:00 · {form.time_of_day}
                    </span>
                  </div>
                  <div className="pr-summary-row">
                    <span className="pr-summary-key">Date</span>
                    <span className="pr-summary-val">
                      {MONTHS.find(m => m.value === form.month)?.name} · {DAYS[form.day_of_week]}
                      {form.is_weekend ? " (Weekend)" : ""}
                    </span>
                  </div>
                  <div className="pr-summary-row">
                    <span className="pr-summary-key">Road flags</span>
                    <span className="pr-summary-val">
                      {activeRoadFlags.length === 0
                        ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>None</span>
                        : (
                          <div className="pr-road-active-list">
                            {activeRoadFlags.map(f => (
                              <span key={f.key} className="pr-road-chip">{f.label}</span>
                            ))}
                          </div>
                        )}
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}