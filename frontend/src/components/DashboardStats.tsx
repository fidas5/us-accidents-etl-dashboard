import React, { useEffect, useState } from "react";
import axios from "axios";

// Types
interface TimeRange { min_date: string | null; max_date: string | null; }
interface Summary { total_accidents: number; total_cities: number; time_range: TimeRange; }
interface SeverityRow { severity: number; count: number; }
interface HourRow { hour: number; count: number; }
interface StateRow { state: string; count: number; }
interface DashboardStatsProps { token: string; }

// CSS injecté une seule fois
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap');

.ds-root {
  --bg: #0a0b0f;
  --surface: #111318;
  --surface2: #181b23;
  --border: rgba(255,255,255,0.07);
  --border2: rgba(255,255,255,0.13);
  --text: #e8eaf0;
  --muted: #6b7080;
  --accent:  #e84b3a;
  --accent2: #f97316;
  --accent3: #3b82f6;
  --accent4: #8b5cf6;
  --green: #22c55e;
  --mono: 'DM Mono', monospace;
  --sans: 'Syne', sans-serif;
  background: transparent;
  color: var(--text);
  font-family: var(--sans);
  padding: 0;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.ds-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 0 24px 0;
}
.ds-title {
  font-size: 24px; font-weight: 800; letter-spacing: -0.5px;
  display: flex; align-items: center; gap: 10px;
  margin: 0;
}
.ds-live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--green); box-shadow: 0 0 8px var(--green);
  animation: ds-pulse 2s infinite;
  flex-shrink: 0;
}
@keyframes ds-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
.ds-sub {
  font-size: 13px; color: var(--muted);
  font-family: var(--mono); letter-spacing: 0.04em; margin-top: 6px;
}
.ds-controls { display: flex; align-items: center; gap: 12px; }
.ds-select {
  background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(148, 163, 184, 0.3);
  color: var(--text); font-family: var(--mono); font-size: 12px;
  padding: 8px 14px; border-radius: 8px; outline: none; cursor: pointer;
  letter-spacing: 0.04em; transition: border-color .2s;
}
.ds-select:hover { border-color: #3b82f6; }
.ds-btn {
  background: transparent; border: 1px solid rgba(148, 163, 184, 0.3);
  color: var(--muted); font-family: var(--mono); font-size: 12px;
  padding: 8px 16px; border-radius: 8px; cursor: pointer;
  letter-spacing: 0.04em; transition: all .2s;
}
.ds-btn:hover, .ds-btn.active {
  border-color: #3b82f6; color: #3b82f6;
  background: rgba(59,130,246,.08);
}

/* KPI strip */
.ds-kpi-strip {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 16px; padding: 0 0 16px 0;
}
.ds-kpi {
  background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 12px; padding: 24px;
  position: relative; overflow: hidden;
  transition: border-color .2s, transform .2s;
  backdrop-filter: blur(12px);
}
.ds-kpi:hover { border-color: rgba(148, 163, 184, 0.3); transform: translateY(-2px); }
.ds-kpi::before {
  content: ''; position: absolute; top:0; left:0; right:0; height:3px;
  border-radius: 12px 12px 0 0;
}
.ds-kpi.k1::before { background: linear-gradient(90deg,var(--accent),var(--accent2)); }
.ds-kpi.k2::before { background: linear-gradient(90deg,var(--accent3),var(--accent4)); }
.ds-kpi.k3::before { background: linear-gradient(90deg,var(--green),#14b8a6); }
.ds-kpi-label {
  font-size: 11px; font-family: var(--mono); color: var(--muted);
  letter-spacing: .1em; text-transform: uppercase; margin-bottom: 12px;
}
.ds-kpi-value { font-size: 36px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
.ds-kpi-sub { font-size: 12px; color: var(--muted); font-family: var(--mono); margin-top: 8px; }

/* Vars panel */
.ds-vars {
  margin: 0 0 16px 0;
  background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 12px; padding: 24px;
  display: flex; gap: 32px;
  backdrop-filter: blur(12px);
}
.ds-vars-col { flex: 1; }
.ds-vars-title {
  font-size: 11px; font-family: var(--mono); color: var(--muted);
  letter-spacing: .1em; text-transform: uppercase; margin-bottom: 12px;
}
.ds-vars-list { list-style: none; display: flex; flex-direction: column; gap: 6px; padding: 0; margin: 0; }
.ds-vars-list li {
  font-size: 13px; font-family: var(--mono); color: var(--text);
  padding: 6px 12px; background: rgba(15, 23, 42, 0.5);
  border-radius: 6px; border-left: 3px solid var(--accent3);
}
.ds-vars-list.qual li { border-left-color: var(--accent4); }

/* Charts grid */
.ds-charts {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 16px; padding: 0;
}
.ds-chart-card {
  background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 12px; padding: 24px;
  transition: border-color .2s;
  backdrop-filter: blur(12px);
}
.ds-chart-card:hover { border-color: rgba(148, 163, 184, 0.3); }
.ds-chart-card.wide { grid-column: 1 / -1; }
.ds-chart-header {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 24px;
}
.ds-chart-title { font-size: 15px; font-weight: 700; letter-spacing: -0.2px; margin: 0; }
.ds-chart-badge {
  font-size: 11px; font-family: var(--mono); color: var(--muted);
  background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(148, 163, 184, 0.15);
  padding: 4px 10px; border-radius: 20px; letter-spacing: .06em;
}

/* Severity bars */
.ds-sev-chart { display: flex; align-items: flex-end; gap: 8px; height: 140px; }
.ds-sev-wrap {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; gap: 6px; height: 100%; justify-content: flex-end;
}
.ds-sev-val { font-size: 9px; font-family: var(--mono); color: var(--muted); }
.ds-sev-bar {
  width: 100%; border-radius: 5px 5px 0 0;
  transition: opacity .2s; cursor: pointer;
}
.ds-sev-bar:hover { opacity: .75; }
.ds-sev-labels { display: flex; gap: 8px; margin-top: 10px; }
.ds-sev-lbl { flex: 1; text-align: center; font-size: 10px; font-family: var(--mono); }

/* Hour bars */
.ds-hour-chart { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
.ds-hour-wrap {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; gap: 4px; height: 100%; justify-content: flex-end;
}
.ds-hour-bar { width: 100%; border-radius: 3px 3px 0 0; cursor: pointer; transition: opacity .2s; }
.ds-hour-bar:hover { opacity: .7; }
.ds-hour-axis {
  display: flex; justify-content: space-between; margin-top: 6px; padding: 0 1px;
}
.ds-hour-tick { font-size: 9px; font-family: var(--mono); color: var(--muted); }

/* State bars */
.ds-state-chart { display: flex; flex-direction: column; gap: 8px; }
.ds-state-row { display: flex; align-items: center; gap: 10px; }
.ds-state-name { font-size: 11px; font-family: var(--mono); color: var(--text); width: 28px; flex-shrink: 0; }
.ds-state-track {
  flex: 1; height: 20px; background: var(--surface2);
  border-radius: 4px; overflow: hidden; cursor: pointer;
}
.ds-state-fill { height: 100%; border-radius: 4px; transition: width .9s cubic-bezier(.16,1,.3,1); }
.ds-state-count { font-size: 10px; font-family: var(--mono); color: var(--muted); width: 52px; text-align: right; flex-shrink: 0; }

/* Tooltip */
.ds-tooltip {
  position: fixed; pointer-events: none;
  background: #1e2130; border: 1px solid var(--border2);
  color: var(--text); font-family: var(--mono); font-size: 11px;
  padding: 6px 10px; border-radius: 7px; z-index: 9999;
  box-shadow: 0 8px 32px rgba(0,0,0,.5);
  transition: opacity .1s;
}

/* Loading / error */
.ds-loading {
  display: flex; align-items: center; justify-content: center;
  min-height: 300px; color: var(--muted);
  font-family: var(--mono); font-size: 13px; letter-spacing: .05em;
}
.ds-error { color: var(--accent); }

@media (max-width: 768px) {
  .ds-kpi-strip { grid-template-columns: 1fr; }
  .ds-charts { grid-template-columns: 1fr; }
  .ds-chart-card.wide { grid-column: 1; }
  .ds-header { flex-direction: column; gap: 14px; align-items: flex-start; }
  .ds-vars { flex-direction: column; gap: 16px; }
}
`;

const SEV_COLORS = ["#3b82f6", "#f97316", "#e84b3a", "#8b5cf6"];
const STATE_COLORS = ["#e84b3a","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#6366f1"];

function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

const DashboardStats: React.FC<DashboardStatsProps> = ({ token }) => {
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [bySeverity, setBySeverity] = useState<SeverityRow[]>([]);
  const [byHour, setByHour]         = useState<HourRow[]>([]);
  const [byState, setByState]       = useState<StateRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showVars, setShowVars]     = useState(false);
  const [minSeverity, setMinSeverity] = useState<number | null>(null);

  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [stateVisible, setStateVisible] = useState(false);

  // Inject CSS
  useEffect(() => {
    if (!document.getElementById("ds-styles")) {
      const s = document.createElement("style");
      s.id = "ds-styles";
      s.textContent = CSS;
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setError("Missing auth token");
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        setStateVisible(false);
        const headers = { Authorization: `Bearer ${token}` };
        const params = minSeverity ? { min_severity: minSeverity } : undefined;

        const [summaryRes, severityRes, hourRes, stateRes] = await Promise.all([
          axios.get("http://127.0.0.1:5050/api/stats/summary", { headers }),
          axios.get("http://127.0.0.1:5050/api/stats/by-severity", { headers }),
          axios.get("http://127.0.0.1:5050/api/stats/by-hour", { headers, params }),
          axios
            .get("http://127.0.0.1:5050/api/stats/by-state", { headers, params })
            .catch(() => ({ data: { data: [] } })),
        ]);

        setSummary(summaryRes.data.data);
        setBySeverity(severityRes.data.data);
        setByHour(hourRes.data.data);
        setByState(stateRes.data.data || []);
        setTimeout(() => setStateVisible(true), 100);
      } catch (err: any) {
        setError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            "Failed to load stats"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [token, minSeverity]);

  const showTip = (e: React.MouseEvent, text: string) =>
    setTip({ x: e.clientX + 14, y: e.clientY - 32, text });
  const moveTip = (e: React.MouseEvent) =>
    setTip((t) => (t ? { ...t, x: e.clientX + 14, y: e.clientY - 32 } : null));
  const hideTip = () => setTip(null);

  if (loading) {
    return (
      <div className="ds-root">
        <div className="ds-loading">Loading dashboard…</div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="ds-root">
        <div className="ds-loading ds-error">Error: {error || "No data"}</div>
      </div>
    );
  }

  const sevMax   = Math.max(...bySeverity.map((d) => d.count), 1);
  const hourMax  = Math.max(...byHour.map((d) => d.count), 1);
  const stateMax = byState.length > 0 ? byState[0].count : 1;

  const RUSH_AM = [6, 7, 8, 9];
  const RUSH_PM = [15, 16, 17, 18, 19];

  return (
    <div className="ds-root">
      {tip && (
        <div className="ds-tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}

      <div className="ds-header">
        <div>
          <div className="ds-title">
            <span className="ds-live-dot" />
            US Accidents Analytics
          </div>
          <div className="ds-sub">
            {summary.time_range.min_date} → {summary.time_range.max_date}
            &nbsp;·&nbsp;{summary.total_accidents.toLocaleString()} records
            &nbsp;·&nbsp;live
          </div>
        </div>
        <div className="ds-controls">
          <select
            className="ds-select"
            value={minSeverity ?? ""}
            onChange={(e) =>
              setMinSeverity(
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          >
            <option value="">All severities</option>
            <option value="1">Severity ≥ 1</option>
            <option value="2">Severity ≥ 2</option>
            <option value="3">Severity ≥ 3</option>
            <option value="4">Severity ≥ 4</option>
          </select>
          <button
            className={`ds-btn${showVars ? " active" : ""}`}
            onClick={() => setShowVars((v) => !v)}
          >
            Variables
          </button>
        </div>
      </div>

      <div className="ds-kpi-strip">
        <div className="ds-kpi k1">
          <div className="ds-kpi-label">Total accidents</div>
          <div className="ds-kpi-value">
            {summary.total_accidents.toLocaleString()}
          </div>
          <div className="ds-kpi-sub">Across all US states</div>
        </div>
        <div className="ds-kpi k2">
          <div className="ds-kpi-label">Cities covered</div>
          <div className="ds-kpi-value">
            {summary.total_cities.toLocaleString()}
          </div>
          <div className="ds-kpi-sub">Unique locations</div>
        </div>
        <div className="ds-kpi k3">
          <div className="ds-kpi-label">Data period</div>
          <div className="ds-kpi-value">
            {summary.time_range.min_date?.slice(0, 4)} –{" "}
            {summary.time_range.max_date?.slice(0, 4)}
          </div>
          <div className="ds-kpi-sub">
            {summary.time_range.min_date} → {summary.time_range.max_date}
          </div>
        </div>
      </div>

      {showVars && (
        <div className="ds-vars">
          <div className="ds-vars-col">
            <div className="ds-vars-title">Quantitative (5)</div>
            <ul className="ds-vars-list">
              {["severity", "temperature", "visibility", "latitude", "longitude"].map(
                (v) => (
                  <li key={v}>{v}</li>
                )
              )}
            </ul>
          </div>
          <div className="ds-vars-col">
            <div className="ds-vars-title">Qualitative (4)</div>
            <ul className="ds-vars-list qual">
              {["city", "state", "weather_condition", "accident_id"].map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="ds-charts">
        <div className="ds-chart-card">
          <div className="ds-chart-header">
            <div className="ds-chart-title">Accidents by severity</div>
            <div className="ds-chart-badge">4 levels</div>
          </div>
          <div className="ds-sev-chart">
            {bySeverity.map((d, i) => (
              <div key={d.severity} className="ds-sev-wrap">
                <div className="ds-sev-val">{fmtK(d.count)}</div>
                <div
                  className="ds-sev-bar"
                  style={{
                    height: `${(d.count / sevMax) * 100}%`,
                    background: SEV_COLORS[i],
                  }}
                  onMouseEnter={(e) =>
                    showTip(
                      e,
                      `Severity ${d.severity}: ${d.count.toLocaleString()}`
                    )
                  }
                  onMouseMove={moveTip}
                  onMouseLeave={hideTip}
                />
              </div>
            ))}
          </div>
          <div className="ds-sev-labels">
            {bySeverity.map((d, i) => (
              <div
                key={d.severity}
                className="ds-sev-lbl"
                style={{ color: SEV_COLORS[i] }}
              >
                S{d.severity}
              </div>
            ))}
          </div>
        </div>

        <div className="ds-chart-card">
          <div className="ds-chart-header">
            <div className="ds-chart-title">Top 10 states</div>
            <div className="ds-chart-badge">by accident count</div>
          </div>
          <div className="ds-state-chart">
            {byState.slice(0, 10).map((d, i) => (
              <div key={d.state} className="ds-state-row">
                <div className="ds-state-name">{d.state}</div>
                <div
                  className="ds-state-track"
                  onMouseEnter={(e) =>
                    showTip(e, `${d.state}: ${d.count.toLocaleString()}`)
                  }
                  onMouseMove={moveTip}
                  onMouseLeave={hideTip}
                >
                  <div
                    className="ds-state-fill"
                    style={{
                      width: stateVisible
                        ? `${(d.count / stateMax) * 100}%`
                        : "0%",
                      background: STATE_COLORS[i % STATE_COLORS.length],
                    }}
                  />
                </div>
                <div className="ds-state-count">{fmtK(d.count)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="ds-chart-card wide">
          <div className="ds-chart-header">
            <div className="ds-chart-title">Accidents by hour of day</div>
            <div className="ds-chart-badge">24h distribution</div>
          </div>
          <div className="ds-hour-chart">
            {byHour.map((d) => {
              let color = "rgba(59,130,246,0.3)";
              if (RUSH_AM.includes(d.hour)) color = "#f97316";
              else if (RUSH_PM.includes(d.hour)) color = "#e84b3a";
              else if (d.count > hourMax * 0.6) color = "#3b82f6";
              return (
                <div key={d.hour} className="ds-hour-wrap">
                  <div
                    className="ds-hour-bar"
                    style={{
                      height: `${(d.count / hourMax) * 100}%`,
                      background: color,
                    }}
                    onMouseEnter={(e) =>
                      showTip(
                        e,
                        `${String(d.hour).padStart(2, "0")}:00 — ${d.count.toLocaleString()}`
                      )
                    }
                    onMouseMove={moveTip}
                    onMouseLeave={hideTip}
                  />
                </div>
              );
            })}
          </div>
          <div className="ds-hour-axis">
            {["00:00", "06:00", "12:00", "18:00", "23:00"].map((t) => (
              <span key={t} className="ds-hour-tick">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;