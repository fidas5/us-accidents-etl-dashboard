// src/pages/Dashboard.tsx
// ─────────────────────────────────────────────────────────────
//  Modular dashboard — 7 KPIs, each in its own component.
//
//  KPI 1  OverviewStrip       → total accidents, avg severity, severity breakdown
//  KPI 2  TrendCharts         → monthly line + year-over-year bar
//  KPI 3  SeverityChart       → severity distribution bar chart
//  KPI 4  LocationSection     → top-states bar + Leaflet city map
//  KPI 5  WeatherChart        → top weather conditions (count + avg severity)
//  KPI 7  HourHeatmap         → hour × day-of-week heatmap grid
//  KPI 9  EnvBuckets          → temp bucket + visibility bucket side-by-side
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import axios, { AxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon   from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────

const API = "http://127.0.0.1:5050";

const SEV_COLORS: Record<string, string> = {
  Low: "#34d399", Moderate: "#f59e0b", High: "#fb923c", Critical: "#f43f5e",
};
const SEV_OPTIONS = [
  { value: 1, label: "Low",      color: "#34d399" },
  { value: 2, label: "Moderate", color: "#f59e0b" },
  { value: 3, label: "High",     color: "#fb923c" },
  { value: 4, label: "Critical", color: "#f43f5e" },
];
const MONTHS = [
  { value: 1, name: "January" }, { value: 2, name: "February" },
  { value: 3, name: "March" },   { value: 4, name: "April" },
  { value: 5, name: "May" },     { value: 6, name: "June" },
  { value: 7, name: "July" },    { value: 8, name: "August" },
  { value: 9, name: "September"},{ value: 10, name: "October" },
  { value: 11, name: "November"},{ value: 12, name: "December" },
];
const ALL_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];
const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR  = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>';

// ─────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────

interface Filters {
  year: number[]; severity: number[]; state: string[]; month: number[];
}
interface Overview {
  years_covered: number[]; total_accidents: number;
  avg_severity: number; avg_duration_min: number;
  severity_breakdown: Record<string, number>;
}
interface SevRow   { severity: number; label: string; count: number; pct: number }
interface MonthRow { month: number; month_name: string; month_short: string; count: number; avg_severity: number }
interface YearRow  { year: number; count: number; avg_severity: number }
interface StateRow { state: string; count: number; avg_severity: number }
interface MapCity  { city: string; state: string; count: number; avg_severity: number; lat: number; lng: number }
interface WeatherRow { weather_condition: string; count: number; pct: number; avg_severity: number }
interface HourCell { hour: number; day_of_week: number; day_name: string; count: number; intensity: number }
interface EnvBucket { bucket: string; count: number; pct: number; avg_severity: number }

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

const sevColor = (avg: number) => {
  if (!avg && avg !== 0) return "#64748b";
  if (avg < 1.75) return "#34d399";
  if (avg < 2.5)  return "#f59e0b";
  if (avg < 3.25) return "#fb923c";
  return "#f43f5e";
};

const fmt = (n: number) => n?.toLocaleString() ?? "0";

function extractError(err: unknown): string {
  if (err instanceof AxiosError) {
    const d = err.response?.data;
    if (d?.detail)  return String(d.detail);
    if (d?.error)   return String(d.error);
    if (d?.message) return String(d.message);
    if (!err.response) return "Cannot reach server — is the backend running?";
    return `Server error ${err.response.status}`;
  }
  return err instanceof Error ? err.message : "Unexpected error";
}

function buildQS(f: Filters): string {
  const p = new URLSearchParams();
  if (f.year.length)     p.set("year",     f.year.join(","));
  if (f.severity.length) p.set("severity", f.severity.join(","));
  if (f.state.length)    p.set("state",    f.state.join(","));
  if (f.month.length)    p.set("month",    f.month.join(","));
  return p.toString() ? "?" + p.toString() : "";
}

// ─────────────────────────────────────────────────────────────
//  THEME
// ─────────────────────────────────────────────────────────────

function useIsDark() {
  const [dark, setDark] = useState(() =>
    document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.getAttribute("data-theme") &&
     window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
  useEffect(() => {
    const mo = new MutationObserver(() => {
      const attr = document.documentElement.getAttribute("data-theme");
      setDark(attr === "dark" || (!attr && window.matchMedia("(prefers-color-scheme: dark)").matches));
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme","class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const cb = (e: MediaQueryListEvent) => {
      if (!document.documentElement.getAttribute("data-theme")) setDark(e.matches);
    };
    mq.addEventListener("change", cb);
    return () => { mo.disconnect(); mq.removeEventListener("change", cb); };
  }, []);
  return dark;
}

const DARK = {
  pageBg:"#080c14", cardBg:"#0d1117", inputBg:"#0f172a", hoverBg:"#1e293b",
  border:"rgba(255,255,255,0.07)", borderHover:"rgba(255,255,255,0.14)", borderAccent:"#38bdf8",
  textStrong:"#f1f5f9", textBase:"#e2e8f0", textMuted:"#64748b", textFaint:"#334155",
  accent:"#38bdf8", accentFg:"#0a0f1a", gridLine:"rgba(255,255,255,0.05)",
  tooltipBg:"#0d1117", shadow:"rgba(0,0,0,0.45)", mapBg:"#0d1828",
  miniTrack:"rgba(255,255,255,0.06)", trackBg:"rgba(255,255,255,0.02)",
  trackBorder:"rgba(255,255,255,0.04)", kpiSheen:"rgba(56,189,248,0.03)",
  popupBg:"#0d1117", popupBorder:"rgba(255,255,255,0.14)",
  yearActiveBg:"rgba(56,189,248,0.12)", yearActiveBorder:"#38bdf8", yearActiveText:"#38bdf8",
  yearBg:"rgba(255,255,255,0.03)", yearBorder:"rgba(255,255,255,0.08)", yearText:"#64748b",
};
const LIGHT = {
  pageBg:"#f1f5f9", cardBg:"#ffffff", inputBg:"#f8fafc", hoverBg:"#e2e8f0",
  border:"rgba(0,0,0,0.08)", borderHover:"rgba(0,0,0,0.16)", borderAccent:"#0284c7",
  textStrong:"#0f172a", textBase:"#1e293b", textMuted:"#64748b", textFaint:"#94a3b8",
  accent:"#0284c7", accentFg:"#ffffff", gridLine:"rgba(0,0,0,0.06)",
  tooltipBg:"#ffffff", shadow:"rgba(0,0,0,0.08)", mapBg:"#dde8f0",
  miniTrack:"rgba(0,0,0,0.08)", trackBg:"rgba(0,0,0,0.03)",
  trackBorder:"rgba(0,0,0,0.06)", kpiSheen:"rgba(2,132,199,0.03)",
  popupBg:"#ffffff", popupBorder:"rgba(0,0,0,0.16)",
  yearActiveBg:"rgba(2,132,199,0.10)", yearActiveBorder:"#0284c7", yearActiveText:"#0284c7",
  yearBg:"rgba(0,0,0,0.03)", yearBorder:"rgba(0,0,0,0.08)", yearText:"#64748b",
};
type T = typeof DARK;

// ─────────────────────────────────────────────────────────────
//  CARD WRAPPER
// ─────────────────────────────────────────────────────────────

interface CardProps {
  title: string; badge?: string; children: React.ReactNode;
  t: T; wide?: boolean;
}
const Card: React.FC<CardProps> = ({ title, badge, children, t, wide }) => (
  <div style={{
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14,
    padding: 22, boxShadow: `0 1px 4px ${t.shadow}`,
    marginBottom: wide ? 16 : 0,
    transition: "border-color .2s",
  }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 20 }}>
      <span style={{ fontFamily:"'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>
        {title}
      </span>
      {badge && (
        <span style={{
          fontSize: 10, padding: "3px 9px", borderRadius: 5,
          background: t.inputBg, border: `1px solid ${t.border}`, color: t.textMuted,
        }}>{badge}</span>
      )}
    </div>
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────
//  KPI 1 — OVERVIEW STRIP (FIXED)
// ─────────────────────────────────────────────────────────────

interface OverviewStripProps { overview: Overview; sevData: SevRow[]; t: T }
const OverviewStrip: React.FC<OverviewStripProps> = ({ overview, sevData, t }) => {
  const kpiStyle: React.CSSProperties = {
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14,
    padding: 20, display:"flex", gap: 14, alignItems:"flex-start",
    boxShadow: `0 1px 4px ${t.shadow}`,
  };
  const sevMax = Math.max(...sevData.map(d => d.count), 1);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
      {/* Years covered */}
      <div style={kpiStyle}>
        <div style={{ fontSize: 22, color: t.textFaint, marginTop: 2 }}>◷</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".07em", color:t.textMuted, marginBottom:8 }}>
            Years covered
          </div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:700, color:t.textStrong, lineHeight:1, marginBottom:8 }}>
            {overview.years_covered?.length ?? 0}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
            {(overview.years_covered ?? []).map(y => (
              <span key={y} style={{
                fontSize:10, padding:"2px 8px", borderRadius:4,
                background:`${t.accent}14`, color:t.accent, border:`1px solid ${t.accent}28`,
              }}>{y}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Total accidents */}
      <div style={kpiStyle}>
        <div style={{ fontSize:22, color:t.textFaint, marginTop:2 }}>⚡</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".07em", color:t.textMuted, marginBottom:8 }}>Total accidents</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:700, color:t.textStrong, lineHeight:1, marginBottom:8 }}>
            {overview.total_accidents ? fmt(overview.total_accidents) : "0"}
          </div>
          <div style={{ fontSize:10, color:t.textFaint }}>
          </div>
        </div>
      </div>

      {/* Avg severity - FIXED null check */}
      <div style={kpiStyle}>
        <div style={{ fontSize:22, color:t.textFaint, marginTop:2 }}>◈</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".07em", color:t.textMuted, marginBottom:8 }}>Avg severity</div>
          <div style={{
            fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:700,
            color: (overview.avg_severity !== null && overview.avg_severity !== undefined) ? sevColor(overview.avg_severity) : t.textMuted, 
            lineHeight:1, marginBottom:8,
          }}>
            {(overview.avg_severity !== null && overview.avg_severity !== undefined) 
              ? overview.avg_severity.toFixed(2) 
              : "N/A"}
          </div>
          <div style={{ fontSize:10, color:t.textFaint }}>Scale 1 (Low) → 4 (Critical)</div>
        </div>
      </div>

      {/* Severity breakdown */}
      <div style={kpiStyle}>
        <div style={{ fontSize:22, color:t.textFaint, marginTop:2 }}>▦</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".07em", color:t.textMuted, marginBottom:12 }}>Severity breakdown</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {sevData.map(r => (
              <div key={r.severity} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:10, minWidth:52, color: SEV_COLORS[r.label] }}>{r.label}</span>
                <div style={{ flex:1, height:3, borderRadius:2, background:t.miniTrack, overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:2, background:SEV_COLORS[r.label], width:`${(r.count/sevMax)*100}%` }} />
                </div>
                <span style={{ fontSize:10, color:t.textMuted, minWidth:32, textAlign:"right" }}>{r.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  KPI 2 — TREND CHARTS (monthly + year-over-year)
// ─────────────────────────────────────────────────────────────

interface TrendChartsProps { monthData: MonthRow[]; yearData: YearRow[]; t: T }
const TrendCharts: React.FC<TrendChartsProps> = ({ monthData, yearData, t }) => (
  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
    {/* Monthly trend */}
    <Card title="Monthly trend"  t={t}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={monthData} margin={{ top:8, right:8, left:-10, bottom:0 }}>
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={t.gridLine} />
          <XAxis dataKey="month_short" tick={{ fontSize:10, fill:t.textMuted, fontFamily:"monospace" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize:10, fill:t.textMuted, fontFamily:"monospace" }} tickFormatter={v => v>=1000?`${(v/1000).toFixed(0)}k`:String(v)} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background:t.tooltipBg, border:`1px solid ${t.borderHover}`, borderRadius:8, fontSize:12, fontFamily:"monospace", color:t.textBase }}
            labelStyle={{ color:t.textMuted }} itemStyle={{ color:"#38bdf8" }}
          />
          <Line type="monotone" dataKey="count" stroke="url(#lineGrad)" strokeWidth={2.5}
            dot={{ r:3, fill:"#38bdf8", strokeWidth:0 }}
            activeDot={{ r:5, fill:"#818cf8", strokeWidth:0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>

    {/* Year-over-year */}
    <Card title="Year-over-year" t={t}>
      {yearData.length < 2 ? (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:200, fontSize:12, color:t.textMuted }}>
          Need ≥ 2 years of data for YoY comparison
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={yearData} margin={{ top:8, right:8, left:-10, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.gridLine} />
            <XAxis dataKey="year" tick={{ fontSize:10, fill:t.textMuted, fontFamily:"monospace" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:10, fill:t.textMuted, fontFamily:"monospace" }} tickFormatter={v => v>=1000?`${(v/1000).toFixed(0)}k`:String(v)} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background:t.tooltipBg, border:`1px solid ${t.borderHover}`, borderRadius:8, fontSize:12, fontFamily:"monospace", color:t.textBase }}
              labelStyle={{ color:t.textMuted }}
            />
            <Bar dataKey="count" radius={[4,4,0,0]} fill="#38bdf8" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  KPI 3 — SEVERITY CHART
// ─────────────────────────────────────────────────────────────

interface SeverityChartProps { data: SevRow[]; t: T }
const SeverityChart: React.FC<SeverityChartProps> = ({ data, t }) => {
  const sevMax = Math.max(...data.map(d => d.count), 1);
  return (
    <Card title="Severity distribution"  t={t}>
      <div style={{ display:"flex", alignItems:"flex-end", gap:20, height:200, padding:"10px 20px 0", justifyContent:"center" }}>
        {data.map(d => (
          <div key={d.severity} style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:1, height:"100%" }}>
            <div style={{ fontSize:11, color:t.textMuted, marginBottom:6 }}>{fmt(d.count)}</div>
            <div style={{ flex:1, width:"100%", display:"flex", alignItems:"flex-end" }}>
              <div style={{
                width:"100%", maxWidth:56, margin:"0 auto",
                height:`${(d.count/sevMax)*100}%`, minHeight:2,
                background: SEV_COLORS[d.label], borderRadius:"6px 6px 0 0",
                cursor:"pointer", transition:"opacity .15s",
              }} title={`${d.label}: ${fmt(d.count)} (${d.pct}%)`} />
            </div>
            <div style={{ fontSize:11, fontWeight:500, marginTop:10, color:SEV_COLORS[d.label] }}>{d.label}</div>
            <div style={{ fontSize:10, color:t.textFaint }}>{d.pct}%</div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
//  KPI 4a — TOP STATES BAR
// ─────────────────────────────────────────────────────────────

interface TopStatesProps { data: StateRow[]; t: T }
const TopStates: React.FC<TopStatesProps> = ({ data, t }) => {
  const maxCount = data[0]?.count ?? 1;
  const palette = ["#f43f5e","#fb923c","#f59e0b","#a3e635","#34d399","#22d3ee","#38bdf8","#818cf8","#c084fc","#f472b6"];
  return (
    <Card title="Top 10 states"  t={t} wide>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {data.slice(0,10).map((d, i) => {
          const col = palette[i % palette.length];
          return (
            <div key={d.state} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:10, color:t.textFaint, minWidth:22, textAlign:"right" }}>#{i+1}</div>
              <div style={{ fontSize:11, color:t.textMuted, minWidth:28 }}>{d.state}</div>
              <div style={{ flex:1, height:30, background:t.trackBg, borderRadius:6, overflow:"hidden", position:"relative", border:`1px solid ${t.trackBorder}` }}>
                <div style={{ position:"absolute", top:0, left:0, bottom:0, width:`${(d.count/maxCount)*100}%`, background:`${col}28`, borderRight:`2px solid ${col}`, transition:"width .4s ease" }} />
                <div style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:11, fontWeight:500, color:col }}>{d.state}</div>
              </div>
              <div style={{ minWidth:70, textAlign:"right", fontSize:11, color:t.textMuted }}>{fmt(d.count)}</div>
              <div style={{ width:8, height:8, borderRadius:"50%", background:sevColor(d.avg_severity), flexShrink:0 }} title={`Avg severity: ${d.avg_severity?.toFixed(2) ?? "N/A"}`} />
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
//  KPI 4b — LEAFLET MAP
// ─────────────────────────────────────────────────────────────

interface USMapProps { cities: MapCity[]; t: T; isDark: boolean }
const USMap: React.FC<USMapProps> = ({ cities, t, isDark }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);
  const tileRef      = useRef<L.TileLayer | null>(null);
  const groupRef     = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center:[38.5,-96], zoom:4, zoomSnap:0.5, scrollWheelZoom:false });
    tileRef.current  = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { attribution:TILE_ATTR, maxZoom:18 }).addTo(map);
    groupRef.current = L.layerGroup().addTo(map);
    mapRef.current   = map;
    return () => { map.remove(); mapRef.current=null; tileRef.current=null; groupRef.current=null; };
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    mapRef.current.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { attribution:TILE_ATTR, maxZoom:18 }).addTo(mapRef.current);
    tileRef.current.bringToBack();
  }, [isDark]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    if (!cities.length) return;
    const maxCount = Math.max(...cities.map(c => c.count), 1);
    cities.forEach(city => {
      if (!city.lat || !city.lng) return;
      const radius = Math.max(5, Math.min(24, (city.count / maxCount) ** 0.55 * 24));
      const color  = sevColor(city.avg_severity);
      const popup  = `
        <div style="font-family:'IBM Plex Mono',monospace;padding:10px 14px;min-width:160px;background:${t.popupBg};color:${t.textBase};border-radius:10px;">
          <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:${t.textStrong};margin-bottom:8px;">${city.city}, ${city.state}</div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:${t.textMuted};margin-bottom:3px;"><span>Accidents</span><strong style="color:${t.textBase}">${fmt(city.count)}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:${t.textMuted};"><span>Avg severity</span><strong style="color:${color}">${city.avg_severity?.toFixed(2) ?? "N/A"}</strong></div>
        </div>`;
      L.circleMarker([city.lat, city.lng] as L.LatLngExpression, {
        radius, fillColor:color,
        color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)",
        weight:1, fillOpacity:0.55, opacity:0.9,
      }).bindPopup(popup, { className:"db-leaflet-popup", maxWidth:220 }).addTo(group);
    });
  }, [cities, isDark, t]);

  return (
    <Card title="Accident hotspots"  t={t} wide>
      <div style={{ borderRadius:12, overflow:"hidden" }}>
        <div ref={containerRef} style={{ width:"100%", height:400, background:t.mapBg }} />
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:14, fontSize:11, color:t.textMuted, flexWrap:"wrap" }}>
        {SEV_OPTIONS.map(s => (
          <span key={s.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:s.color, display:"inline-block" }} />
            {s.label}
          </span>
        ))}
        <span style={{ color:t.textFaint }}>·</span>
        <span style={{ color:t.textFaint }}>Circle size = accident count · Color = avg severity</span>
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
//  KPI 5 — WEATHER CHART
// ─────────────────────────────────────────────────────────────

interface WeatherChartProps { data: WeatherRow[]; t: T }
const WeatherChart: React.FC<WeatherChartProps> = ({ data, t }) => {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <Card title="Weather impact on severity"  t={t}>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {data.map((d) => (
          <div key={d.weather_condition} style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontSize:10, color:t.textMuted, minWidth:130, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {d.weather_condition}
            </div>
            <div style={{ flex:1, height:22, background:t.trackBg, borderRadius:5, overflow:"hidden", position:"relative", border:`1px solid ${t.trackBorder}` }}>
              <div style={{
                position:"absolute", top:0, left:0, bottom:0,
                width:`${(d.count/maxCount)*100}%`,
                background:`${sevColor(d.avg_severity)}28`,
                borderRight:`2px solid ${sevColor(d.avg_severity)}`,
                transition:"width .4s ease",
              }} />
              <div style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", fontSize:10, color:t.textMuted }}>
                {fmt(d.count)}
              </div>
            </div>
            <div style={{
              fontSize:10, fontWeight:600, minWidth:28, textAlign:"right",
              color: sevColor(d.avg_severity),
            }}>{d.avg_severity?.toFixed(1) ?? "N/A"}</div>
          </div>
        ))}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:6, marginTop:6, fontSize:10, color:t.textFaint }}>
          <span>Bar = accident count</span>
          <span>·</span>
          <span>Right number = avg severity</span>
        </div>
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
//  KPI 7 — HOUR HEATMAP
// ─────────────────────────────────────────────────────────────

interface HourHeatmapProps { grid: HourCell[]; t: T }
const HourHeatmap: React.FC<HourHeatmapProps> = ({ grid, t }) => {
  // Build lookup: day_of_week → hour → intensity
  const map: Record<number, Record<number, HourCell>> = {};
  grid.forEach(cell => {
    if (!map[cell.day_of_week]) map[cell.day_of_week] = {};
    map[cell.day_of_week][cell.hour] = cell;
  });

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days  = [0,1,2,3,4,5,6];

  const cellColor = (intensity: number) => {
    if (intensity === 0) return t.trackBg;
    if (intensity < 20)  return "#1e3a5f";
    if (intensity < 40)  return "#1d5fa3";
    if (intensity < 60)  return "#f59e0b";
    if (intensity < 80)  return "#fb923c";
    return "#f43f5e";
  };

  const cellSize = 22;

  return (
    <Card title="Peak hour heatmap" t={t} wide>
      <div style={{ overflowX:"auto" }}>
        <div style={{ display:"inline-grid", gridTemplateColumns:`52px repeat(24, ${cellSize}px)`, gap:2, minWidth:"fit-content" }}>
          {/* Hour headers */}
          <div />
          {hours.map(h => (
            <div key={h} style={{ fontSize:9, color:t.textFaint, textAlign:"center", paddingBottom:4, fontFamily:"monospace" }}>
              {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h-12}p`}
            </div>
          ))}

          {/* Rows per day */}
          {days.map(dow => (
            <React.Fragment key={dow}>
              <div style={{ fontSize:10, color:t.textMuted, display:"flex", alignItems:"center", paddingRight:8, fontFamily:"monospace" }}>
                {DAY_LABELS[dow]}
              </div>
              {hours.map(h => {
                const cell = map[dow]?.[h];
                const intensity = cell?.intensity ?? 0;
                return (
                  <div
                    key={h}
                    title={cell ? `${DAY_LABELS[dow]} ${h}:00 — ${fmt(cell.count)} accidents (${intensity}% intensity)` : "No data"}
                    style={{
                      width: cellSize, height: cellSize, borderRadius: 3,
                      background: cellColor(intensity),
                      cursor: cell ? "pointer" : "default",
                      transition: "opacity .15s",
                    }}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:14, fontSize:10, color:t.textFaint }}>
        <span>Low</span>
        {["#1e3a5f","#1d5fa3","#f59e0b","#fb923c","#f43f5e"].map(c => (
          <div key={c} style={{ width:14, height:14, borderRadius:2, background:c }} />
        ))}
        <span>High</span>
        <span style={{ marginLeft:"auto" }}>Hover a cell for exact count</span>
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
//  KPI 9 — ENV BUCKETS (temp + visibility)
// ─────────────────────────────────────────────────────────────

interface EnvBucketsProps { tempBuckets: EnvBucket[]; visBuckets: EnvBucket[]; t: T }
const EnvBuckets: React.FC<EnvBucketsProps> = ({ tempBuckets, visBuckets, t }) => {
  const TEMP_COLORS: Record<string,string> = {
    Freezing:"#818cf8", Cold:"#38bdf8", Cool:"#34d399", Warm:"#f59e0b", Hot:"#f43f5e",
  };
  const VIS_COLORS: Record<string,string> = {
    Poor:"#f43f5e", Moderate:"#f59e0b", Good:"#34d399",
  };

  const BucketBars = ({ data, colors }: { data: EnvBucket[]; colors: Record<string,string> }) => (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {data.map(d => (
        <div key={d.bucket}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
            <span style={{ fontSize:12, fontWeight:500, color: colors[d.bucket] ?? t.textBase }}>{d.bucket}</span>
            <span style={{ fontSize:11, color:t.textMuted }}>{fmt(d.count)} ({d.pct}%)</span>
          </div>
          <div style={{ height:8, background:t.trackBg, borderRadius:4, overflow:"hidden" }}>
            <div style={{
              height:"100%", width:`${d.pct}%`, borderRadius:4,
              background: colors[d.bucket] ?? t.accent,
              transition:"width .4s ease",
            }} />
          </div>
          <div style={{ fontSize:10, color:t.textFaint, marginTop:3 }}>
            Avg severity: <span style={{ color: sevColor(d.avg_severity) }}>{d.avg_severity?.toFixed(2) ?? "N/A"}</span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
      <Card title="Temperature buckets" t={t}>
        <BucketBars data={tempBuckets} colors={TEMP_COLORS} />
      </Card>
      <Card title="Visibility buckets" t={t}>
        <BucketBars data={visBuckets} colors={VIS_COLORS} />
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  YEAR BAR
// ─────────────────────────────────────────────────────────────

interface YearBarProps {
  years: number[]; selectedYears: number[];
  onToggle: (y: number) => void; onSelectAll: () => void; t: T;
}
const YearBar: React.FC<YearBarProps> = ({ years, selectedYears, onToggle, onSelectAll, t }) => {
  const allSelected = selectedYears.length === 0;
  const tabBase: React.CSSProperties = {
    height:28, padding:"0 14px", borderRadius:6, fontSize:11, fontWeight:600,
    fontFamily:"'IBM Plex Mono',monospace", cursor:"pointer", transition:"all .15s",
    border:`1px solid ${t.yearBorder}`, background:t.yearBg, color:t.yearText,
  };
  const tabOn: React.CSSProperties = {
    ...tabBase, background:t.yearActiveBg, borderColor:t.yearActiveBorder, color:t.yearActiveText,
  };
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:8, marginBottom:18,
      padding:"10px 14px", borderRadius:10,
      background:t.cardBg, border:`1px solid ${t.border}`,
    }}>
      <span style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", color:t.textMuted, marginRight:4, whiteSpace:"nowrap" }}>
        Year
      </span>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        <button style={allSelected ? tabOn : { ...tabBase, borderStyle:"dashed" }} onClick={onSelectAll}>All</button>
        <div style={{ width:1, height:18, background:t.border, margin:"0 4px" }} />
        {years.map(y => (
          <button key={y} style={selectedYears.includes(y) ? tabOn : tabBase} onClick={() => onToggle(y)}>{y}</button>
        ))}
      </div>
      {selectedYears.length > 0 && (
        <span style={{ fontSize:10, color:t.textFaint, marginLeft:"auto", whiteSpace:"nowrap" }}>
          {selectedYears.length === 1 ? `Showing ${selectedYears[0]} only` : `${selectedYears.length} years selected`}
        </span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  FILTER PANEL
// ─────────────────────────────────────────────────────────────

interface FilterPanelProps {
  filters: Filters; t: T;
  onToggleMonth: (v: number) => void;
  onToggleSeverity: (v: number) => void;
  onToggleState: (s: string) => void;
  onApply: () => void;
  onReset: () => void;
}
const FilterPanel: React.FC<FilterPanelProps> = ({
  filters, t, onToggleMonth, onToggleSeverity, onToggleState, onApply, onReset,
}) => {
  const chipBase: React.CSSProperties = {
    height:26, padding:"0 10px", borderRadius:6, fontSize:11,
    border:`1px solid ${t.border}`, background:t.inputBg, color:t.textMuted,
    cursor:"pointer", transition:"all .15s", fontFamily:"'IBM Plex Mono',monospace",
  };
  const chipOn: React.CSSProperties = {
    ...chipBase, background:`${t.accent}18`, borderColor:t.accent, color:t.accent,
  };
  return (
    <div style={{ background:t.cardBg, border:`1px solid ${t.border}`, borderRadius:14, padding:22, marginBottom:20, boxShadow:`0 4px 20px ${t.shadow}` }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:18 }}>
        {/* Month */}
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:t.accent, textTransform:"uppercase", letterSpacing:".08em", marginBottom:10 }}>Month</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {MONTHS.map(m => (
              <button key={m.value}
                style={filters.month.includes(m.value) ? chipOn : chipBase}
                onClick={() => onToggleMonth(m.value)}
              >{m.name.slice(0,3)}</button>
            ))}
          </div>
        </div>
        {/* Severity */}
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:t.accent, textTransform:"uppercase", letterSpacing:".08em", marginBottom:10 }}>Severity</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {SEV_OPTIONS.map(s => (
              <button key={s.value}
                style={filters.severity.includes(s.value)
                  ? { ...chipOn, borderColor:s.color, color:s.color, background:`${s.color}18` }
                  : chipBase}
                onClick={() => onToggleSeverity(s.value)}
              >{s.label}</button>
            ))}
          </div>
        </div>
        {/* State */}
        <div style={{ gridColumn:"1/-1" }}>
          <div style={{ fontSize:10, fontWeight:600, color:t.accent, textTransform:"uppercase", letterSpacing:".08em", marginBottom:10 }}>State</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {ALL_STATES.map(s => (
              <button key={s}
                style={filters.state.includes(s) ? chipOn : chipBase}
                onClick={() => onToggleState(s)}
              >{s}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onReset} style={{ height:36, padding:"0 16px", borderRadius:8, background:"transparent", border:`1px solid ${t.border}`, color:t.textMuted, fontSize:12, cursor:"pointer", fontFamily:"monospace" }}>
          Reset all
        </button>
        <button onClick={onApply} style={{ flex:1, height:36, borderRadius:8, background:t.accent, color:t.accentFg, border:"none", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"monospace" }}>
          Apply filters
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  ACTIVE FILTER PILLS
// ─────────────────────────────────────────────────────────────

interface PillsRowProps {
  filters: Filters;
  onRemoveYear: (y: number) => void; onRemoveMonth: (v: number) => void;
  onRemoveSeverity: (v: number) => void; onRemoveState: (s: string) => void;
  onClearAll: () => void;
}
const PillsRow: React.FC<PillsRowProps> = ({
  filters, onRemoveYear, onRemoveMonth, onRemoveSeverity, onRemoveState, onClearAll,
}) => {
  const total = filters.year.length + filters.severity.length + filters.state.length + filters.month.length;
  if (total === 0) return null;
  const Pill = ({ color, children, onX }: { color: string; children: React.ReactNode; onX: () => void }) => (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px 3px 10px", borderRadius:99, fontSize:11, background:`${color}1a`, border:`1px solid ${color}47`, color }}>
      {children}
      <button onClick={onX} style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, padding:"0 2px", opacity:.7, color:"inherit" }}>×</button>
    </span>
  );
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginBottom:20 }}>
      <span style={{ fontSize:11, color:"#64748b" }}>Filters:</span>
      {filters.year.map(y => <Pill key={`y-${y}`} color="#818cf8" onX={() => onRemoveYear(y)}>{y}</Pill>)}
      {filters.month.map(m => <Pill key={`m-${m}`} color="#0ea5e9" onX={() => onRemoveMonth(m)}>{MONTHS.find(x=>x.value===m)?.name}</Pill>)}
      {filters.severity.map(s => <Pill key={`s-${s}`} color="#f59e0b" onX={() => onRemoveSeverity(s)}>{SEV_OPTIONS.find(x=>x.value===s)?.label}</Pill>)}
      {filters.state.map(s => <Pill key={`st-${s}`} color="#34d399" onX={() => onRemoveState(s)}>{s}</Pill>)}
      <button onClick={onClearAll} style={{ fontSize:11, color:"#64748b", cursor:"pointer", background:"none", border:"none", textDecoration:"underline", fontFamily:"monospace" }}>
        Clear all
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  GLOBAL CSS (minimal — only what can't be inline)
// ─────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@700;800&display=swap');
  @keyframes db-fadein { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
  @keyframes db-spin   { to { transform:rotate(360deg); } }
  @keyframes db-pulse  { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)} }
  .db-root { animation: db-fadein .35s ease; font-family: 'IBM Plex Mono', monospace; }
  .db-spinner { width:18px;height:18px;border:2px solid rgba(255,255,255,0.1);border-top-color:#38bdf8;border-radius:50%;animation:db-spin .7s linear infinite; }
  .db-pulse  { display:inline-block;width:6px;height:6px;background:#22d3ee;border-radius:50%;animation:db-pulse 1.2s ease-in-out infinite; }
  .db-leaflet-popup .leaflet-popup-content-wrapper { background:var(--popup-bg,#0d1117)!important;border:1px solid rgba(255,255,255,0.14)!important;border-radius:10px!important;box-shadow:0 8px 24px rgba(0,0,0,0.45)!important;padding:0!important; }
  .db-leaflet-popup .leaflet-popup-content { margin:0!important; }
  .db-leaflet-popup .leaflet-popup-tip-container { display:none; }
  .leaflet-control-attribution { font-size:9px!important; }
  .leaflet-control-zoom a { border-color:rgba(255,255,255,0.1)!important; }
  @media(max-width:900px){ .db-responsive-2col{grid-template-columns:1fr!important;} }
`;

// ─────────────────────────────────────────────────────────────
//  DASHBOARD ROOT
// ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { token } = useAuth();
  const isDark    = useIsDark();
  const t         = isDark ? DARK : LIGHT;

  // ── State ──────────────────────────────────────────────────
  const [filters, setFilters]           = useState<Filters>({ year:[], severity:[], state:[], month:[] });
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const [overview,    setOverview]    = useState<Overview | null>(null);
  const [sevData,     setSevData]     = useState<SevRow[]>([]);
  const [monthData,   setMonthData]   = useState<MonthRow[]>([]);
  const [yearData,    setYearData]    = useState<YearRow[]>([]);
  const [stateData,   setStateData]   = useState<StateRow[]>([]);
  const [mapData,     setMapData]     = useState<{ top_cities: MapCity[] } | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherRow[]>([]);
  const [hourGrid,    setHourGrid]    = useState<HourCell[]>([]);
  const [tempBuckets, setTempBuckets] = useState<EnvBucket[]>([]);
  const [visBuckets,  setVisBuckets]  = useState<EnvBucket[]>([]);

  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [refetching, setRefetching] = useState(false);

  // ── Fetch all KPIs ─────────────────────────────────────────
  const fetchAll = useCallback(async (f: Filters) => {
    if (!token) return;
    setRefetching(true);
    setError(null);
    const qs   = buildQS(f);
    const hdrs = { Authorization: `Bearer ${token}` };
    try {
      const [ov, sev, mo, yr, st, mp, wea, hr, env] = await Promise.all([
        axios.get(`${API}/api/stats/overview${qs}`,       { headers: hdrs }),
        axios.get(`${API}/api/stats/by-severity${qs}`,    { headers: hdrs }),
        axios.get(`${API}/api/stats/by-month${qs}`,       { headers: hdrs }),
        axios.get(`${API}/api/stats/by-year${qs}`,        { headers: hdrs }),
        axios.get(`${API}/api/stats/by-state${qs}`,       { headers: hdrs }),
        axios.get(`${API}/api/stats/map-points${qs}`,     { headers: hdrs }),
        axios.get(`${API}/api/stats/by-weather${qs}`,     { headers: hdrs }),
        axios.get(`${API}/api/stats/by-hour${qs}`,        { headers: hdrs }),
        axios.get(`${API}/api/stats/by-env-bucket${qs}`,  { headers: hdrs }),
      ]);
      setOverview(ov.data);
      setSevData(sev.data.data ?? []);
      setMonthData(mo.data.data ?? []);
      setYearData(yr.data.data ?? []);
      setStateData((st.data.data ?? []).slice(0, 10));
      setMapData(mp.data);
      setWeatherData(wea.data.data ?? []);
      setHourGrid(hr.data.grid ?? []);
      setTempBuckets(env.data.temp_buckets ?? []);
      setVisBuckets(env.data.vis_buckets ?? []);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  }, [token]);

  // Initial load
  useEffect(() => { fetchAll(filters); }, []); // eslint-disable-line

  // Year filter fires immediately (tab bar UX)
  const prevYearRef = useRef<number[]>([]);
  useEffect(() => {
    if (JSON.stringify(filters.year) !== JSON.stringify(prevYearRef.current) && !loading) {
      prevYearRef.current = filters.year;
      fetchAll(filters);
    }
  }, [filters.year]); // eslint-disable-line

  // ── Filter helpers ─────────────────────────────────────────
  const toggle = <T,>(key: keyof Filters, val: T) =>
    setFilters(f => {
      const arr = f[key] as T[];
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });

  const applyFilters = () => { setShowFilterPanel(false); fetchAll(filters); };

  const resetFilters = () => {
    const empty: Filters = { year:[], severity:[], state:[], month:[] };
    setFilters(empty);
    setShowFilterPanel(false);
    fetchAll(empty);
  };

  const removeFilter = <T,>(key: keyof Filters, val: T) => {
    const next = { ...filters, [key]: (filters[key] as T[]).filter(x => x !== val) };
    setFilters(next);
    fetchAll(next);
  };

  const activeFilterCount = filters.year.length + filters.severity.length + filters.state.length + filters.month.length;

  // ── Render states ──────────────────────────────────────────
  if (loading) return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, minHeight:"100vh", color:"#64748b", fontSize:13, fontFamily:"'IBM Plex Mono',monospace" }}>
        <div className="db-spinner" />
        <span>Loading dashboard…</span>
      </div>
    </>
  );

  if (error || !overview) return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ display:"flex", gap:14, alignItems:"flex-start", background:"rgba(244,63,94,.06)", border:"1px solid rgba(244,63,94,.2)", borderRadius:12, padding:"18px 20px", margin:24, color:"#f43f5e", fontFamily:"monospace", fontSize:13 }}>
        <span style={{ fontSize:20 }}>⚠</span>
        <div>
          {error || "No data available."}
          <div style={{ marginTop:6, fontSize:11, color:"#64748b" }}>
            Run <strong>Build Datamart</strong> on the ETL page first.
          </div>
        </div>
      </div>
    </>
  );

  const availableYears = overview.years_covered ?? [];

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div className="db-root">

        {/* ── Header ─────────────────────────────────────────── */}
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:`linear-gradient(135deg,${t.hoverBg},${t.cardBg})`, border:`1px solid ${t.borderAccent}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:t.accent }}>◈</div>
            <div>
              <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:t.textStrong, margin:"0 0 2px", letterSpacing:"-.02em" }}>Accident Analytics</h1>
              <p style={{ fontSize:11, color:t.textMuted, margin:0 }}>US Datamart · Real-time statistics</p>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {refetching && (
              <span style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:t.textMuted }}>
                <span className="db-pulse" /> Updating
              </span>
            )}
            <button
              onClick={() => setShowFilterPanel(v => !v)}
              style={{
                display:"flex", alignItems:"center", gap:7, padding:"7px 14px", borderRadius:8,
                background: showFilterPanel ? t.hoverBg : t.inputBg,
                border:`1px solid ${showFilterPanel ? t.borderAccent : t.border}`,
                color: showFilterPanel ? t.textBase : t.textMuted,
                fontSize:12, fontFamily:"'IBM Plex Mono',monospace", cursor:"pointer", transition:"all .15s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 2h12M3 7h8M5 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span style={{ background:t.accent, color:t.accentFg, borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:600 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* ── Year tab bar ─────────────────────────────────── */}
        {availableYears.length > 1 && (
          <YearBar
            years={availableYears} selectedYears={filters.year}
            onToggle={y => { toggle("year", y); }}
            onSelectAll={() => { setFilters(f => ({ ...f, year:[] })); }}
            t={t}
          />
        )}

        {/* ── Filter panel ──────────────────────────────────── */}
        {showFilterPanel && (
          <FilterPanel
            filters={filters} t={t}
            onToggleMonth={v => toggle("month", v)}
            onToggleSeverity={v => toggle("severity", v)}
            onToggleState={s => toggle("state", s)}
            onApply={applyFilters}
            onReset={resetFilters}
          />
        )}

        {/* ── Active pills ──────────────────────────────────── */}
        <PillsRow
          filters={filters}
          onRemoveYear={y => removeFilter("year", y)}
          onRemoveMonth={v => removeFilter("month", v)}
          onRemoveSeverity={v => removeFilter("severity", v)}
          onRemoveState={s => removeFilter("state", s)}
          onClearAll={resetFilters}
        />

        {/* ── KPI 1 — Overview strip ─────────────────────────── */}
        <OverviewStrip overview={overview} sevData={sevData} t={t} />

        {/* ── KPI 2 — Trend charts ──────────────────────────── */}
        <TrendCharts monthData={monthData} yearData={yearData} t={t} />

        {/* ── KPI 3 + KPI 5 — Severity + Weather ───────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }} className="db-responsive-2col">
          <SeverityChart data={sevData} t={t} />
          <WeatherChart data={weatherData} t={t} />
        </div>

        {/* ── KPI 4a — Top states ───────────────────────────── */}
        <TopStates data={stateData} t={t} />

        {/* ── KPI 4b — Map ──────────────────────────────────── */}
        <USMap cities={mapData?.top_cities ?? []} t={t} isDark={isDark} />

        {/* ── KPI 7 — Hour heatmap ──────────────────────────── */}
        <div style={{ marginBottom:16 }}>
          <HourHeatmap grid={hourGrid} t={t} />
        </div>

        {/* ── KPI 9 — Env buckets ───────────────────────────── */}
        <EnvBuckets tempBuckets={tempBuckets} visBuckets={visBuckets} t={t} />

      </div>
    </>
  );
}