// src/components/dashboard/PredictorForm.tsx
import React from "react";
import type { T } from "../../pages/themes/dashboard.themes";
import { ALL_STATES } from "../../pages/constants/dashboard.constants";

interface PredictorFormProps {
  form: any;
  onChange: (k: string, v: any) => void;
  onSubmit: () => void;
  result: any;
  loading: boolean;
  t: T;
}

export const PredictorForm: React.FC<PredictorFormProps> = ({ form, onChange, onSubmit, result, loading, t }) => {
  const inp: React.CSSProperties = {
    background: t.inputBg, 
    border: `1px solid ${t.border}`, 
    borderRadius: 8,
    color: t.textBase, 
    fontSize: 12, 
    padding: "6px 10px",
    fontFamily: "'IBM Plex Mono',monospace", 
    outline: "none",
    width: "100%", 
    boxSizing: "border-box",
  };
  
  const lbl: React.CSSProperties = {
    fontSize: 10, 
    textTransform: "uppercase", 
    letterSpacing: ".07em",
    color: t.textMuted, 
    marginBottom: 4, 
    display: "block",
  };
  
  const SEV_META: Record<number, { label: string; color: string; desc: string }> = {
    1: { label: "Low", color: "#34d399", desc: "Minor accident, minimal disruption." },
    2: { label: "Moderate", color: "#f59e0b", desc: "Possible injuries, traffic delays." },
    3: { label: "High", color: "#fb923c", desc: "Serious injuries, significant disruption." },
    4: { label: "Critical", color: "#f43f5e", desc: "Severe injuries/fatalities, road closure." },
  };
  
  const predicted = result?.predicted_severity;
  const meta = predicted ? SEV_META[predicted] : null;

  const ROAD_FEATURES = [
    "junction", "traffic_signal", "crossing", "railway", "stop", "roundabout",
    "bump", "no_exit", "amenity", "give_way", "station", "traffic_calming", "turning_loop"
  ];

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>Severity predictor</span>
        <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 5, background: t.inputBg, border: `1px solid ${t.border}`, color: t.textMuted }}>ML · Random Forest</span>
      </div>
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <label style={lbl}>State</label>
          <select value={form.state} onChange={e => onChange("state", e.target.value)} style={inp}>
            {ALL_STATES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Weather</label>
          <select value={form.weather_condition} onChange={e => onChange("weather_condition", e.target.value)} style={inp}>
            {["Clear", "Overcast", "Light Rain", "Heavy Rain", "Snow", "Fog", "Thunderstorm", "Hail", "Ice", "Freezing Rain"].map(w => <option key={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Season</label>
          <select value={form.season} onChange={e => onChange("season", e.target.value)} style={inp}>
            {["Spring", "Summer", "Fall", "Winter"].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Time of day</label>
          <select value={form.time_of_day} onChange={e => onChange("time_of_day", e.target.value)} style={inp}>
            {["Morning", "Afternoon", "Evening", "Night"].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Hour (0–23)</label>
          <input type="number" min={0} max={23} value={form.hour} onChange={e => onChange("hour", parseInt(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Month (1–12)</label>
          <input type="number" min={1} max={12} value={form.month} onChange={e => onChange("month", parseInt(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Temperature (°C)</label>
          <input type="number" value={form.temperature_c} onChange={e => onChange("temperature_c", parseFloat(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Visibility (km)</label>
          <input type="number" value={form.visibility_km} onChange={e => onChange("visibility_km", parseFloat(e.target.value))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Day of week</label>
          <select value={form.day_of_week} onChange={e => onChange("day_of_week", parseInt(e.target.value))} style={inp}>
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: t.accent, marginBottom: 10 }}>
          Road features present
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {ROAD_FEATURES.map(feat => (
            <button key={feat} onClick={() => onChange(feat, !form[feat])} style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer",
              fontFamily: "'IBM Plex Mono',monospace", transition: "all .15s",
              border: form[feat] ? `1px solid #fb923c` : `1px solid ${t.border}`,
              background: form[feat] ? `#fb923c28` : t.inputBg,
              color: form[feat] ? "#fb923c" : t.textMuted,
            }}>
              {feat.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <button onClick={onSubmit} disabled={loading} style={{
        width: "100%", height: 40, borderRadius: 8, border: "none",
        background: loading ? t.hoverBg : t.accent,
        color: loading ? t.textMuted : t.accentFg,
        fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace",
        cursor: loading ? "not-allowed" : "pointer", transition: "all .15s",
      }}>
        {loading ? "Predicting…" : "Predict severity →"}
      </button>

      {result && !result.error && meta && (
        <div style={{
          marginTop: 14, padding: "14px 18px", borderRadius: 10,
          background: `${meta.color}12`, border: `1px solid ${meta.color}44`,
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 10, flexShrink: 0,
            background: `${meta.color}22`, border: `2px solid ${meta.color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, color: meta.color,
          }}>{predicted}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 700, color: meta.color }}>
              Severity {predicted} — {meta.label}
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{meta.desc}</div>
            {result.probabilities && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {Object.entries(result.probabilities as Record<string, number>).map(([sev, prob]) => {
                  const sevColor = (s: number) => {
                    if (s < 1.75) return "#34d399";
                    if (s < 2.5) return "#f59e0b";
                    if (s < 3.25) return "#fb923c";
                    return "#f43f5e";
                  };
                  return (
                    <span key={sev} style={{
                      fontSize: 10, fontFamily: "monospace",
                      color: sevColor(parseInt(sev)),
                      background: `${sevColor(parseInt(sev))}14`,
                      border: `1px solid ${sevColor(parseInt(sev))}30`,
                      padding: "3px 8px", borderRadius: 5,
                    }}>
                      Sev {sev}: {(prob * 100).toFixed(1)}%
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {result?.error && (
        <div style={{
          marginTop: 12, padding: "10px 14px", borderRadius: 8,
          background: "rgba(244,63,94,.08)", border: "1px solid rgba(244,63,94,.2)",
          color: "#f43f5e", fontSize: 12, fontFamily: "monospace",
        }}>
          ⚠ {result.error}
        </div>
      )}
    </div>
  );
};