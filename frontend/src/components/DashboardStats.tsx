// src/components/DashboardStats.tsx
import React, { useEffect, useState } from "react";
import axios from "axios";

// ── Types ──────────────────────────────────────────────────────────────────
interface TimeRange { min_date: string | null; max_date: string | null; }
interface Summary { total_accidents: number; total_cities: number; time_range: TimeRange; }
interface SeverityRow { severity: number; count: number; }
interface HourRow { hour: number; count: number; }
interface StateRow { state: string; count: number; }
interface DashboardStatsProps { token: string; }

// ── Color palettes ─────────────────────────────────────────────────────────
const SEV_COLORS   = ["#3b82f6", "#f97316", "#e84b3a", "#8b5cf6"];
const STATE_COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e",
  "#3b82f6","#8b5cf6","#ec4899","#14b8a6",
  "#f59e0b","#6366f1",
];

const MONTHS = [
  { value: 1,  label: "January" },
  { value: 2,  label: "February" },
  { value: 3,  label: "March" },
  { value: 4,  label: "April" },
  { value: 5,  label: "May" },
  { value: 6,  label: "June" },
  { value: 7,  label: "July" },
  { value: 8,  label: "August" },
  { value: 9,  label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

// ── Component ──────────────────────────────────────────────────────────────
const DashboardStats: React.FC<DashboardStatsProps> = ({ token }) => {
  const [summary,     setSummary]     = useState<Summary | null>(null);
  const [bySeverity,  setBySeverity]  = useState<SeverityRow[]>([]);
  const [byHour,      setByHour]      = useState<HourRow[]>([]);
  const [byState,     setByState]     = useState<StateRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [showVars,    setShowVars]    = useState(false);
  const [minSeverity, setMinSeverity] = useState<number | null>(null);
  const [month,       setMonth]       = useState<number | null>(null);
  const [stateAnim,   setStateAnim]   = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Fetch data
  useEffect(() => {
    if (!token) {
      setError("Missing auth token");
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      try {
        setLoading(true);
        setError(null);
        setStateAnim(false);

        const headers = { Authorization: `Bearer ${token}` };

        // Build shared filter params (month + severity)
        const filterParams: Record<string, any> = {};
        if (minSeverity != null) filterParams.min_severity = minSeverity;
        if (month != null)       filterParams.month        = month;

        const [sumRes, sevRes, hourRes, stateRes] = await Promise.all([
          axios.get("http://127.0.0.1:5050/api/stats/summary",     { headers }),
          axios.get("http://127.0.0.1:5050/api/stats/by-severity", { headers, params: filterParams }),
          axios.get("http://127.0.0.1:5050/api/stats/by-hour",     { headers, params: filterParams }),
          axios.get("http://127.0.0.1:5050/api/stats/by-state",    { headers, params: filterParams })
               .catch(() => ({ data: { data: [] } })),
        ]);

        setSummary(sumRes.data.data);
        setBySeverity(sevRes.data.data ?? []);
        setByHour(hourRes.data.data ?? []);
        setByState(stateRes.data.data ?? []);

        requestAnimationFrame(() => setTimeout(() => setStateAnim(true), 80));
      } catch (err: any) {
        setError(
          err.response?.data?.message ??
          err.response?.data?.error ??
          "Failed to load statistics"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [token, minSeverity, month]);

  const showTip = (e: React.MouseEvent, text: string) =>
    setTip({ x: e.clientX + 14, y: e.clientY - 36, text });
  const moveTip = (e: React.MouseEvent) =>
    setTip((t) => t ? { ...t, x: e.clientX + 14, y: e.clientY - 36 } : null);
  const hideTip = () => setTip(null);

  const activeFilterCount = [minSeverity, month].filter(v => v != null).length;

  const handleReset = () => {
    setMinSeverity(null);
    setMonth(null);
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="ds-root">
        <div className="ds-loading">
          <div className="ds-loading-spinner" />
          Loading dashboard…
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !summary) {
    return (
      <div className="ds-root">
        <div className="ds-loading ds-error">
          {error === "Missing auth token" && <>You are not authenticated. Please log in again.</>}
          {error && error !== "Missing auth token" && <>Backend error: {error}</>}
          {!error && !summary && <>Error: No data returned from API.</>}
        </div>
      </div>
    );
  }

  const sevMax   = Math.max(...bySeverity.map((d) => d.count), 1);
  const hourMax  = Math.max(...byHour.map((d)     => d.count), 1);
  const stateMax = byState.length > 0 ? byState[0].count : 1;

  const RUSH_AM = new Set([6, 7, 8, 9]);
  const RUSH_PM = new Set([15, 16, 17, 18, 19]);

  function hourColor(d: HourRow) {
    if (RUSH_AM.has(d.hour)) return "#f97316";
    if (RUSH_PM.has(d.hour)) return "#ef4444";
    if (d.count > hourMax * 0.55) return "#3b82f6";
    return "rgba(59,130,246,0.28)";
  }

  const selectedMonthLabel = MONTHS.find(m => m.value === month)?.label ?? null;

  return (
    <div className="ds-root">
      {/* Tooltip */}
      {tip && (
        <div className="ds-tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}

      {/* ── Header ── */}
      <div className="ds-header">
        <div>
          <h1 className="ds-title">
            <span className="ds-live-dot" />
            US Accidents Analytics
          </h1>
          <div className="ds-sub">
            {summary.time_range.min_date} → {summary.time_range.max_date}
            &nbsp;·&nbsp;{summary.total_accidents.toLocaleString()} records
            {selectedMonthLabel && (
              <>&nbsp;·&nbsp;<span style={{ color: "var(--accent3)" }}>{selectedMonthLabel}</span></>
            )}
          </div>
        </div>

        <div className="ds-controls">
          {/* Month filter */}
          <select
            className="ds-select"
            value={month ?? ""}
            onChange={(e) => setMonth(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">All months</option>
            {MONTHS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          {/* Severity filter */}
          <select
            className="ds-select"
            value={minSeverity ?? ""}
            onChange={(e) => setMinSeverity(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">All severities</option>
            <option value="1">Severity ≥ 1</option>
            <option value="2">Severity ≥ 2</option>
            <option value="3">Severity ≥ 3</option>
            <option value="4">Severity ≥ 4</option>
          </select>

          {/* Reset button — only shown when a filter is active */}
          {activeFilterCount > 0 && (
            <button className="ds-btn" onClick={handleReset} title="Clear all filters">
              ✕ Reset
            </button>
          )}

          <button
            className={`ds-btn${showVars ? " active" : ""}`}
            onClick={() => setShowVars((v) => !v)}
          >
            {showVars ? "Hide vars" : "Variables"}
          </button>
        </div>
      </div>

      {/* ── Active filter pills ── */}
      {activeFilterCount > 0 && (
        <div className="ds-filter-pills">
          {month != null && (
            <span className="ds-pill">
              Month: {selectedMonthLabel}
              <button className="ds-pill-x" onClick={() => setMonth(null)}>×</button>
            </span>
          )}
          {minSeverity != null && (
            <span className="ds-pill">
              Severity ≥ {minSeverity}
              <button className="ds-pill-x" onClick={() => setMinSeverity(null)}>×</button>
            </span>
          )}
        </div>
      )}

      {/* ── KPI strip ── */}
      <div className="ds-kpi-strip">
        <div className="ds-kpi k1">
          <div className="ds-kpi-label">Total accidents</div>
          <div className="ds-kpi-value">{summary.total_accidents.toLocaleString()}</div>
          <div className="ds-kpi-sub">Across all US states</div>
        </div>
        <div className="ds-kpi k3">
          <div className="ds-kpi-label">Data period</div>
          <div className="ds-kpi-value">
            {summary.time_range.min_date?.slice(0, 4)}
          </div>
          <div className="ds-kpi-sub">
            {summary.time_range.min_date} → {summary.time_range.max_date}
          </div>
        </div>
        <div className="ds-kpi k2">
          <div className="ds-kpi-label">Active filters</div>
          <div className="ds-kpi-value">{activeFilterCount}</div>
          <div className="ds-kpi-sub">
            {activeFilterCount === 0
              ? "No filters applied"
              : [
                  month != null && selectedMonthLabel,
                  minSeverity != null && `Sev ≥ ${minSeverity}`,
                ].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      {/* ── Variables panel ── */}
      {showVars && (
        <div className="ds-vars">
          <div className="ds-vars-col">
            <div className="ds-vars-title">Quantitative (5)</div>
            <ul className="ds-vars-list">
              {["severity", "temperature", "visibility", "latitude", "longitude"].map((v) => (
                <li key={v}>{v}</li>
              ))}
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

      {/* ── Charts grid ── */}
      <div className="ds-charts">

        {/* Severity */}
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
                    background: SEV_COLORS[i] ?? SEV_COLORS[0],
                  }}
                  onMouseEnter={(e) => showTip(e, `Severity ${d.severity}: ${d.count.toLocaleString()}`)}
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
                style={{ color: SEV_COLORS[i] ?? SEV_COLORS[0] }}
              >
                S{d.severity}
              </div>
            ))}
          </div>
        </div>

        {/* Top states */}
        <div className="ds-chart-card">
          <div className="ds-chart-header">
            <div className="ds-chart-title">Top 10 states</div>
            <div className="ds-chart-badge">by count</div>
          </div>
          <div className="ds-state-chart">
            {byState.slice(0, 10).map((d, i) => (
              <div key={d.state} className="ds-state-row">
                <div className="ds-state-name">{d.state}</div>
                <div
                  className="ds-state-track"
                  onMouseEnter={(e) => showTip(e, `${d.state}: ${d.count.toLocaleString()}`)}
                  onMouseMove={moveTip}
                  onMouseLeave={hideTip}
                >
                  <div
                    className="ds-state-fill"
                    style={{
                      width: stateAnim ? `${(d.count / stateMax) * 100}%` : "0%",
                      background: STATE_COLORS[i % STATE_COLORS.length],
                    }}
                  />
                </div>
                <div className="ds-state-count">{fmtK(d.count)}</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Filter pills CSS (scoped inline) ── */}
      <style>{`
        .ds-root { width: 100%; }
        .ds-filter-pills {
          display: flex; flex-wrap: wrap; gap: 8px;
          margin-bottom: 14px;
        }
        .ds-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px 4px 12px;
          background: var(--primary-color-soft);
          border: 1px solid rgba(59,130,246,0.35);
          border-radius: 99px;
          font-size: 12px; font-family: var(--mono);
          color: #93c5fd;
        }
        .ds-pill-x {
          background: none; border: none; cursor: pointer;
          color: #93c5fd; font-size: 14px; line-height: 1;
          padding: 0; opacity: 0.7; transition: opacity 0.15s;
        }
        .ds-pill-x:hover { opacity: 1; }
      `}</style>
    </div>
  );
};

export default DashboardStats;