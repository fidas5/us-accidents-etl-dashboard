// src/components/DashboardStats.tsx
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";

interface TimeRange { min_date: string | null; max_date: string | null; }
interface Summary { total_accidents: number; total_cities: number; time_range: TimeRange; }
interface SeverityRow { severity: number; count: number; }
interface HourRow { hour: number; count: number; }
interface StateRow { state: string; count: number; }
interface CityMarker { city: string; state: string; latitude: number; longitude: number; count: number; avg_severity: number; }
interface DashboardStatsProps { token: string; }

const SEV_COLORS = ["#3b82f6", "#f97316", "#e84b3a", "#8b5cf6"];

const MONTHS = [
  { value: 1,  label: "January" },   { value: 2,  label: "February" },
  { value: 3,  label: "March" },     { value: 4,  label: "April" },
  { value: 5,  label: "May" },       { value: 6,  label: "June" },
  { value: 7,  label: "July" },      { value: 8,  label: "August" },
  { value: 9,  label: "September" }, { value: 10, label: "October" },
  { value: 11, label: "November" },  { value: 12, label: "December" },
];

const SEVERITY_OPTIONS = [
  { value: 1, label: "Severity 1" },
  { value: 2, label: "Severity 2" },
  { value: 3, label: "Severity 3" },
  { value: 4, label: "Severity 4" },
];

function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

function sevColor(avg: number) {
  if (avg >= 3.5) return "#ef4444";
  if (avg >= 2.5) return "#f97316";
  if (avg >= 1.5) return "#eab308";
  return "#3b82f6";
}

function markerRadius(count: number, max: number) {
  return 5 + (count / max) * 18;
}

const DashboardStats: React.FC<DashboardStatsProps> = ({ token }) => {
  const [summary,            setSummary]            = useState<Summary | null>(null);
  const [bySeverity,         setBySeverity]         = useState<SeverityRow[]>([]);
  const [byHour,             setByHour]             = useState<HourRow[]>([]);
  const [byState,            setByState]            = useState<StateRow[]>([]);
  const [cities,             setCities]             = useState<CityMarker[]>([]);
  const [loading,            setLoading]            = useState(true);
  const [error,              setError]              = useState<string | null>(null);
  const [showVars,           setShowVars]           = useState(false);
  const [selectedMonths,     setSelectedMonths]     = useState<number[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<number[]>([]);
  const [refetching,         setRefetching]         = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [isMonthDropdownOpen,    setIsMonthDropdownOpen]    = useState(false);
  const [isSeverityDropdownOpen, setIsSeverityDropdownOpen] = useState(false);

  const monthDropdownRef    = useRef<HTMLDivElement>(null);
  const severityDropdownRef = useRef<HTMLDivElement>(null);
  const mapRef              = useRef<any>(null);

  // ── Close dropdowns on outside click ──
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target as Node))
        setIsMonthDropdownOpen(false);
      if (severityDropdownRef.current && !severityDropdownRef.current.contains(e.target as Node))
        setIsSeverityDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Toggle helpers ──
  const toggleMonth    = (v: number) => setSelectedMonths(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  const toggleSeverity = (v: number) => setSelectedSeverities(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  const handleReset    = () => { setSelectedMonths([]); setSelectedSeverities([]); };

  // ── Fetch stats ──
  useEffect(() => {
    if (!token) { setError("Missing auth token"); setLoading(false); return; }

    const fetchAll = async () => {
      if (!summary) setLoading(true); else setRefetching(true);
      setError(null);

      const headers = { Authorization: `Bearer ${token}` };
      // Axios serializes arrays as repeated params: ?months=1&months=3&severities=2&severities=4
      const filterParams: Record<string, any> = {};
      if (selectedMonths.length > 0)     filterParams.months     = selectedMonths;
      if (selectedSeverities.length > 0) filterParams.severities = selectedSeverities;

      try {
        const [sumRes, sevRes, hourRes, stateRes, cityRes] = await Promise.all([
          axios.get("http://127.0.0.1:5050/api/stats/summary",     { headers, params: filterParams }),
          axios.get("http://127.0.0.1:5050/api/stats/by-severity", { headers, params: filterParams }),
          axios.get("http://127.0.0.1:5050/api/stats/by-hour",     { headers, params: filterParams }),
          axios.get("http://127.0.0.1:5050/api/stats/by-state",    { headers, params: filterParams }).catch(() => ({ data: { data: [] } })),
          axios.get("http://127.0.0.1:5050/api/accidents/cities",  { headers, params: filterParams }).catch(() => ({ data: { data: [] } })),
        ]);
        setSummary(sumRes.data.data);
        setBySeverity(sevRes.data.data ?? []);
        setByHour(hourRes.data.data ?? []);
        setByState(stateRes.data.data ?? []);
        setCities(cityRes.data.data ?? []);
      } catch (err: any) {
        setError(err.response?.data?.message ?? "Failed to load statistics");
      } finally {
        setLoading(false);
        setRefetching(false);
      }
    };

    fetchAll();
  }, [token, selectedMonths, selectedSeverities]);

  // ── Draw Leaflet map ──
  useEffect(() => {
    if (!cities.length) return;
    const init = async () => {
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css"; link.rel = "stylesheet";
        link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
        document.head.appendChild(link);
      }
      if (!(window as any).L) {
        await new Promise<void>(resolve => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
          s.onload = () => resolve();
          document.head.appendChild(s);
        });
      }
      const L = (window as any).L;
      const container = document.getElementById("accident-map");
      if (!container) return;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      const map = L.map(container, { zoomControl: true, scrollWheelZoom: true }).setView([37.8, -96], 4);
      mapRef.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap © CARTO", maxZoom: 19,
      }).addTo(map);
      const maxCount = Math.max(...cities.map(c => c.count), 1);
      cities.forEach(city => {
        const r = markerRadius(city.count, maxCount);
        const color = sevColor(city.avg_severity);
        const circle = L.circleMarker([city.latitude, city.longitude], {
          radius: r, fillColor: color, color: "#fff", weight: 0.8, opacity: 0.9, fillOpacity: 0.75,
        });
        const popupHtml = `
          <div style="font-family:ui-monospace,monospace;min-width:160px">
            <div style="font-size:13px;font-weight:600;color:#f1f5f9;margin-bottom:6px">${city.city}, ${city.state}</div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:3px">
              <span>Accidents</span><span style="color:#f1f5f9;font-weight:500">${city.count.toLocaleString()}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:3px">
              <span>Avg severity</span><span style="color:${color};font-weight:500">${city.avg_severity.toFixed(2)}</span>
            </div>
            <div style="margin-top:8px;height:4px;border-radius:2px;background:#1e293b">
              <div style="height:4px;border-radius:2px;background:${color};width:${Math.round((city.count / maxCount) * 100)}%"></div>
            </div>
            <div style="font-size:10px;color:#475569;margin-top:3px">${Math.round((city.count / maxCount) * 100)}% of top city</div>
          </div>`;
        circle.bindPopup(popupHtml, { className: "accident-popup", closeButton: false, offset: [0, -4] });
        circle.on("mouseover", function(this: any) { this.openPopup(); });
        circle.on("mouseout",  function(this: any) { this.closePopup(); });
        circle.addTo(map);
      });
    };
    init();
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [cities]);

  const showTip = (e: React.MouseEvent, text: string) => setTip({ x: e.clientX + 14, y: e.clientY - 36, text });
  const moveTip = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX + 14, y: e.clientY - 36 } : null);
  const hideTip = () => setTip(null);

  const activeFilterCount = selectedMonths.length + selectedSeverities.length;
  const sevMax  = Math.max(...bySeverity.map(d => d.count), 1);
  const hourMax = Math.max(...byHour.map(d => d.count), 1);
  const RUSH_AM = new Set([6, 7, 8, 9]);
  const RUSH_PM = new Set([15, 16, 17, 18, 19]);
  function hourColor(d: HourRow) {
    if (RUSH_AM.has(d.hour)) return "#f97316";
    if (RUSH_PM.has(d.hour)) return "#ef4444";
    if (d.count > hourMax * 0.55) return "#3b82f6";
    return "rgba(59,130,246,0.28)";
  }

  if (loading) return (
    <div className="ds-root">
      <div className="ds-loading"><div className="ds-loading-spinner" />Loading dashboard…</div>
    </div>
  );
  if (error || !summary) return (
    <div className="ds-root">
      <div className="ds-loading ds-error">
        {error === "Missing auth token" && <>You are not authenticated. Please log in again.</>}
        {error && error !== "Missing auth token" && <>Backend error: {error}</>}
        {!error && !summary && <>No data returned from API.</>}
      </div>
    </div>
  );

  return (
    <div className="ds-root">
      {tip && <div className="ds-tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}

      {/* ── Header ── */}
      <div className="ds-header">
        <div>
          <h1 className="ds-title">
            <span className="ds-live-dot" />
            US Accidents Analytics
            {refetching && (
              <span style={{ marginLeft: 10, fontSize: 11, color: "#64748b", fontFamily: "ui-monospace,monospace", fontWeight: 400, animation: "ds-fade 0.6s ease-in-out infinite alternate" }}>
                updating…
              </span>
            )}
          </h1>
          <div className="ds-sub">
            {summary.time_range.min_date} → {summary.time_range.max_date}
            &nbsp;·&nbsp;{summary.total_accidents.toLocaleString()} records
          </div>
        </div>

        <div className="ds-controls">

          {/* ── Month dropdown ── */}
          <div className="ds-filter-group" ref={monthDropdownRef}>
            <span className="ds-filter-label">months</span>
            <div className="ds-filter-divider" />
            <button
              className={`ds-filter-button${isMonthDropdownOpen ? " ds-filter-button--open" : ""}`}
              onClick={() => { setIsMonthDropdownOpen(v => !v); setIsSeverityDropdownOpen(false); }}
            >
              {selectedMonths.length === 0 ? "All" : `${selectedMonths.length} selected`}
              <span className={`ds-dropdown-arrow${isMonthDropdownOpen ? " ds-dropdown-arrow--open" : ""}`}>▼</span>
            </button>

            {isMonthDropdownOpen && (
              <div className="ds-dropdown">
                <div className="ds-dropdown-header">
                  Select months
                  {selectedMonths.length > 0 && (
                    <button className="ds-dropdown-clear" onClick={() => setSelectedMonths([])}>clear</button>
                  )}
                </div>
                <div className="ds-dropdown-scroll">
                  {MONTHS.map(month => (
                    <label key={month.value} className={`ds-dropdown-item${selectedMonths.includes(month.value) ? " ds-dropdown-item--checked" : ""}`}>
                      <input
                        type="checkbox"
                        className="ds-checkbox"
                        checked={selectedMonths.includes(month.value)}
                        onChange={() => toggleMonth(month.value)}
                      />
                      <span>{month.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Severity dropdown ── */}
          <div className="ds-filter-group" ref={severityDropdownRef}>
            <span className="ds-filter-label">severity</span>
            <div className="ds-filter-divider" />
            <button
              className={`ds-filter-button${isSeverityDropdownOpen ? " ds-filter-button--open" : ""}`}
              onClick={() => { setIsSeverityDropdownOpen(v => !v); setIsMonthDropdownOpen(false); }}
            >
              {selectedSeverities.length === 0 ? "All" : `${selectedSeverities.length} selected`}
              <span className={`ds-dropdown-arrow${isSeverityDropdownOpen ? " ds-dropdown-arrow--open" : ""}`}>▼</span>
            </button>

            {isSeverityDropdownOpen && (
              <div className="ds-dropdown">
                <div className="ds-dropdown-header">
                  Select severity levels
                  {selectedSeverities.length > 0 && (
                    <button className="ds-dropdown-clear" onClick={() => setSelectedSeverities([])}>clear</button>
                  )}
                </div>
                <div className="ds-dropdown-scroll">
                  {SEVERITY_OPTIONS.map(sev => (
                    <label key={sev.value} className={`ds-dropdown-item${selectedSeverities.includes(sev.value) ? " ds-dropdown-item--checked" : ""}`}>
                      <input
                        type="checkbox"
                        className="ds-checkbox"
                        checked={selectedSeverities.includes(sev.value)}
                        onChange={() => toggleSeverity(sev.value)}
                      />
                      <span>{sev.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button className={`ds-btn${showVars ? " active" : ""}`} onClick={() => setShowVars(v => !v)}>
            Variables
          </button>
        </div>
      </div>

      {/* ── Active filter pills ── */}
      {activeFilterCount > 0 && (
        <div className="ds-pills-row">
          <span className="ds-pills-label">active :</span>
          {selectedMonths.slice().sort((a, b) => a - b).map(m => (
            <span key={`month-${m}`} className="ds-pill ds-pill-blue">
              {MONTHS[m - 1].label}
              <button className="ds-pill-x" onClick={() => toggleMonth(m)}>×</button>
            </span>
          ))}
          {selectedSeverities.slice().sort((a, b) => a - b).map(s => (
            <span key={`sev-${s}`} className="ds-pill ds-pill-amber">
              Sev {s}
              <button className="ds-pill-x" onClick={() => toggleSeverity(s)}>×</button>
            </span>
          ))}
          <span className="ds-reset-link" onClick={handleReset}>clear all</span>
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
          <div className="ds-kpi-value">{summary.time_range.min_date?.slice(0, 4)}</div>
          <div className="ds-kpi-sub">{summary.time_range.min_date} → {summary.time_range.max_date}</div>
        </div>
        <div className="ds-kpi k2">
          <div className="ds-kpi-label">Active filters</div>
          <div className="ds-kpi-value">{activeFilterCount}</div>
          <div className="ds-kpi-sub">
            {activeFilterCount === 0
              ? "No filters applied"
              : [
                  selectedMonths.length > 0    && `${selectedMonths.length} month${selectedMonths.length > 1 ? "s" : ""}`,
                  selectedSeverities.length > 0 && `Sev ${selectedSeverities.join(", ")}`,
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
              {["severity","temperature","visibility","latitude","longitude"].map(v => <li key={v}>{v}</li>)}
            </ul>
          </div>
          <div className="ds-vars-col">
            <div className="ds-vars-title">Qualitative (4)</div>
            <ul className="ds-vars-list qual">
              {["city","state","weather_condition","accident_id"].map(v => <li key={v}>{v}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ── Charts grid ── */}
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
                  style={{ height: `${(d.count / sevMax) * 100}%`, background: SEV_COLORS[i] ?? SEV_COLORS[0] }}
                  onMouseEnter={e => showTip(e, `Severity ${d.severity}: ${d.count.toLocaleString()}`)}
                  onMouseMove={moveTip}
                  onMouseLeave={hideTip}
                />
              </div>
            ))}
          </div>
          <div className="ds-sev-labels">
            {bySeverity.map((d, i) => (
              <div key={d.severity} className="ds-sev-lbl" style={{ color: SEV_COLORS[i] ?? SEV_COLORS[0] }}>
                S{d.severity}
              </div>
            ))}
          </div>
        </div>

        <div className="ds-chart-card">
          <div className="ds-chart-header">
            <div className="ds-chart-title">Top 10 states</div>
            <div className="ds-chart-badge">by count</div>
          </div>
          <div className="ds-state-chart">
            {byState.slice(0, 10).map((d, i) => {
              const stateMax = byState[0]?.count ?? 1;
              const STATE_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#6366f1"];
              return (
                <div key={d.state} className="ds-state-row">
                  <div className="ds-state-name">{d.state}</div>
                  <div className="ds-state-track"
                    onMouseEnter={e => showTip(e, `${d.state}: ${d.count.toLocaleString()}`)}
                    onMouseMove={moveTip}
                    onMouseLeave={hideTip}>
                    <div className="ds-state-fill" style={{ width: `${(d.count / stateMax) * 100}%`, background: STATE_COLORS[i % STATE_COLORS.length] }} />
                  </div>
                  <div className="ds-state-count">{fmtK(d.count)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Map ── */}
      <div className="ds-chart-card" style={{ marginTop: 16 }}>
        <div className="ds-chart-header">
          <div className="ds-chart-title">Accident hotspots</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {cities.length} locations · hover for details
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { label: "Low sev",  color: "#3b82f6" },
                { label: "Med",      color: "#eab308" },
                { label: "High",     color: "#f97316" },
                { label: "Critical", color: "#ef4444" },
              ].map(l => (
                <span key={l.label} style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3, color: "var(--text-muted)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, display: "inline-block" }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div id="accident-map" style={{ width: "100%", height: 420, borderRadius: 8, overflow: "hidden", background: "#0f172a" }} />
      </div>

      <style>{`
        @keyframes ds-fade { from { opacity:0.4; } to { opacity:1; } }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           FILTER GROUP  — the pill-shaped trigger button
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        .ds-filter-group {
          position: relative;
          display: flex;
          align-items: center;
          gap: 4px;
          border-radius: 8px;
          padding: 3px 3px 3px 10px;

          /* dark default */
          background: #1e293b;
          border: 1px solid #334155;
        }
        .ds-filter-label {
          font-size: 11px;
          font-family: ui-monospace, monospace;
          font-weight: 500;
          white-space: nowrap;
          /* dark default */
          color: #94a3b8;
        }
        .ds-filter-divider {
          width: 1px;
          height: 14px;
          margin: 0 2px;
          /* dark default */
          background: #334155;
        }
        .ds-filter-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          border: none;
          background: transparent;
          font-size: 12px;
          font-family: ui-monospace, monospace;
          cursor: pointer;
          border-radius: 5px;
          transition: background 0.15s, color 0.15s;
          /* dark default */
          color: #e2e8f0;
        }
        .ds-filter-button:hover,
        .ds-filter-button--open {
          background: #334155;
          color: #f1f5f9;
        }
        .ds-dropdown-arrow {
          font-size: 8px;
          opacity: 0.6;
          transition: transform 0.2s;
          display: inline-block;
        }
        .ds-dropdown-arrow--open {
          transform: rotate(180deg);
        }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           DROPDOWN PANEL
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        .ds-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          min-width: 190px;
          border-radius: 10px;
          z-index: 1000;
          overflow: hidden;
          /* dark default */
          background: #1e293b;
          border: 1px solid #334155;
          box-shadow: 0 12px 28px -6px rgba(0,0,0,0.45);
        }
        .ds-dropdown-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 600;
          font-family: ui-monospace, monospace;
          border-bottom: 1px solid #334155;
          /* dark default */
          background: #0f172a;
          color: #94a3b8;
        }
        .ds-dropdown-clear {
          font-size: 10px;
          font-family: ui-monospace, monospace;
          border: none;
          background: none;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
          padding: 0;
          /* dark default */
          color: #64748b;
        }
        .ds-dropdown-clear:hover { color: #94a3b8; }

        .ds-dropdown-scroll {
          max-height: 220px;
          overflow-y: auto;
          /* dark scrollbar */
          scrollbar-width: thin;
          scrollbar-color: #334155 #1e293b;
        }
        .ds-dropdown-scroll::-webkit-scrollbar { width: 5px; }
        .ds-dropdown-scroll::-webkit-scrollbar-track { background: #1e293b; }
        .ds-dropdown-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }

        .ds-dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          font-family: ui-monospace, monospace;
          transition: background 0.15s;
          user-select: none;
          /* dark default */
          color: #e2e8f0;
        }
        .ds-dropdown-item:hover {
          background: #334155;
        }
        .ds-dropdown-item--checked {
          background: rgba(59,130,246,0.1);
          color: #93c5fd;
        }
        .ds-dropdown-item--checked:hover {
          background: rgba(59,130,246,0.18);
        }

        /* Custom checkbox */
        .ds-checkbox {
          appearance: none;
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 3px;
          border: 1.5px solid #475569;
          background: transparent;
          cursor: pointer;
          flex-shrink: 0;
          position: relative;
          transition: border-color 0.15s, background 0.15s;
        }
        .ds-checkbox:checked {
          background: #3b82f6;
          border-color: #3b82f6;
        }
        .ds-checkbox:checked::after {
          content: "";
          position: absolute;
          left: 3px; top: 1px;
          width: 5px; height: 8px;
          border: 2px solid #fff;
          border-top: none;
          border-left: none;
          transform: rotate(45deg);
        }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           LIGHT THEME OVERRIDES
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        @media (prefers-color-scheme: light) {
          .ds-filter-group  { background: #f8fafc; border-color: #e2e8f0; }
          .ds-filter-label  { color: #64748b; }
          .ds-filter-divider { background: #e2e8f0; }
          .ds-filter-button { color: #1e293b; }
          .ds-filter-button:hover,
          .ds-filter-button--open { background: #e2e8f0; color: #0f172a; }

          .ds-dropdown { background: #ffffff; border-color: #e2e8f0; box-shadow: 0 12px 28px -6px rgba(0,0,0,0.12); }
          .ds-dropdown-header { background: #f8fafc; color: #64748b; border-bottom-color: #e2e8f0; }
          .ds-dropdown-clear  { color: #94a3b8; }
          .ds-dropdown-clear:hover { color: #64748b; }

          .ds-dropdown-scroll { scrollbar-color: #cbd5e1 #ffffff; }
          .ds-dropdown-scroll::-webkit-scrollbar-track { background: #ffffff; }
          .ds-dropdown-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; }

          .ds-dropdown-item { color: #1e293b; }
          .ds-dropdown-item:hover { background: #f1f5f9; }
          .ds-dropdown-item--checked { background: #eff6ff; color: #1d4ed8; }
          .ds-dropdown-item--checked:hover { background: #dbeafe; }

          .ds-checkbox { border-color: #94a3b8; }

          .ds-pills-label { color: #6b7280; }
          .ds-pill-blue  { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
          .ds-pill-amber { background: #fffbeb; color: #b45309; border-color: #fde68a; }
          .ds-reset-link { color: #9ca3af; }
          .ds-reset-link:hover { color: #6b7280; }
        }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           PILLS ROW
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        .ds-pills-row { display:flex; align-items:center; gap:6px; margin-bottom:14px; flex-wrap:wrap; }
        .ds-pills-label { font-size:11px; color:#4b5563; font-family:ui-monospace,monospace; }
        .ds-pill { display:inline-flex; align-items:center; gap:4px; padding:2px 6px 2px 8px; border-radius:99px; font-size:11px; font-family:ui-monospace,monospace; }
        .ds-pill-blue  { background:rgba(59,130,246,0.12); color:#93c5fd; border:1px solid rgba(59,130,246,0.25); }
        .ds-pill-amber { background:rgba(245,158,11,0.12); color:#fcd34d; border:1px solid rgba(245,158,11,0.25); }
        .ds-pill-x { background:none; border:none; cursor:pointer; font-size:14px; line-height:1; padding:0 2px; opacity:0.6; transition:opacity 0.15s; color:inherit; }
        .ds-pill-x:hover { opacity:1; }
        .ds-reset-link { font-size:11px; color:#4b5563; font-family:ui-monospace,monospace; cursor:pointer; text-decoration:underline; text-underline-offset:2px; margin-left:2px; }
        .ds-reset-link:hover { color:#9ca3af; }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           MAP POPUP
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        .accident-popup .leaflet-popup-content-wrapper {
          background:#1e293b !important; border:1px solid #334155 !important;
          border-radius:8px !important; box-shadow:0 4px 20px rgba(0,0,0,0.5) !important; padding:0 !important;
        }
        .accident-popup .leaflet-popup-content { margin:10px 14px !important; }
        .accident-popup .leaflet-popup-tip { background:#1e293b !important; }
      `}</style>
    </div>
  );
};

export default DashboardStats;