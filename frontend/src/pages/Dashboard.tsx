// src/pages/Dashboard.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import axios, { AxiosError } from "axios";
import { useAuth } from "../context/AuthContext";

// Import all components
import { SectionDivider } from "../components/dashboard/SectionDivider";
import { YearBar } from "../components/dashboard/YearBar";
import { FilterPanel } from "../components/dashboard/FilterPanel";
import { PillsRow } from "../components/dashboard/PillsRow";
import { OverviewStrip } from "../components/dashboard/OverviewStrip";
import { KeyMetrics } from "../components/dashboard/KeyMetrics";
import { TrendCharts } from "../components/dashboard/TrendCharts";
import { SeverityChart } from "../components/dashboard/SeverityChart";
import { TopStates } from "../components/dashboard/TopStates";
import { USMap } from "../components/dashboard/USMap";
import { WeatherChart } from "../components/dashboard/WeatherChart";
import { HourHeatmap } from "../components/dashboard/HourHeatmap";
import { EnvBuckets } from "../components/dashboard/EnvBuckets";
import { ModelInfoStrip } from "../components/dashboard/ModelInfoStrip";
import { FeatureImportanceChart } from "../components/dashboard/FeatureImportanceChart";
import { PredictorForm } from "../components/dashboard/PredictorForm";
// Add to existing imports
import { SeverityByRoadFeature } from "../components/dashboard/SeverityByRoadFeature";
import { VisibilityRisk } from "../components/dashboard/VisibilityRisk";

// Import types and constants
import type { 
  Filters, Overview, SevRow, MonthRow, YearRow, StateRow, 
  MapCity, WeatherRow, HourCell, EnvBucket, SevRoadFeat, 
  DurBySev, VisRisk, WeaSevScore, FeatImportance 
} from "./types/dashboard.types";
import { 
  SEV_COLORS, SEV_OPTIONS, MONTHS, ALL_STATES, DAY_LABELS, 
  ROAD_FEAT_SET, TILE_DARK, TILE_LIGHT, TILE_ATTR 
} from "./constants/dashboard.constants";
 
import { useIsDark, extractError, buildQS } from "./utils/dashboard.utils";
// ✅ Import DARK and LIGHT as VALUES (no 'type' keyword)
import { DARK, LIGHT } from "./themes/dashboard.themes";
// ✅ Import T as TYPE
import type { T } from "./themes/dashboard.themes";

const API = "http://127.0.0.1:5050";

export default function Dashboard() {
  const { token } = useAuth();
  const isDark = useIsDark();
  // ✅ Now DARK and LIGHT are available as values
  const t = isDark ? DARK : LIGHT;

  // Rest of your code remains the same...
  const [filters, setFilters] = useState<Filters>({ year: [], severity: [], state: [], month: [] });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sevData, setSevData] = useState<SevRow[]>([]);
  const [monthData, setMonthData] = useState<MonthRow[]>([]);
  const [yearData, setYearData] = useState<YearRow[]>([]);
  const [stateData, setStateData] = useState<StateRow[]>([]);
  const [mapData, setMapData] = useState<{ top_cities: MapCity[] } | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherRow[]>([]);
  const [hourGrid, setHourGrid] = useState<HourCell[]>([]);
  const [tempBuckets, setTempBuckets] = useState<EnvBucket[]>([]);
  const [visBuckets, setVisBuckets] = useState<EnvBucket[]>([]);
  
  // Analytics KPIs
  const [avgDuration, setAvgDuration] = useState<number | null>(null);
  const [highSeverityRate, setHighSeverityRate] = useState<number | null>(null);
  const [sevByRoadFeat, setSevByRoadFeat] = useState<SevRoadFeat[]>([]);
  const [riskMultiplier, setRiskMultiplier] = useState<{ risk_multiplier: number; note: string } | null>(null);
  const [rushHourIndex, setRushHourIndex] = useState<number | null>(null);
  const [weaSevScore, setWeaSevScore] = useState<WeaSevScore[]>([]);
  const [durBySev, setDurBySev] = useState<DurBySev[]>([]);
  const [nightRiskMult, setNightRiskMult] = useState<{ night_risk_multiplier: number; note: string } | null>(null);
  const [visRisk, setVisRisk] = useState<VisRisk[]>([]);

  // ML
  const [modelInfo, setModelInfo] = useState<any>(null);
  const [featureImportance, setFeatureImportance] = useState<FeatImportance[]>([]);
  const [predictionForm, setPredictionForm] = useState({
    state: "CA", weather_condition: "Clear", temperature_c: 20,
    visibility_km: 10, hour: 12, month: 6, day_of_week: 2,
    season: "Summer", time_of_day: "Afternoon", is_weekend: false,
    junction: false, traffic_signal: false, crossing: false, railway: false,
    stop: false, roundabout: false, bump: false, no_exit: false,
    amenity: false, give_way: false, station: false, traffic_calming: false, turning_loop: false,
  });
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const [predicting, setPredicting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetching, setRefetching] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Fetch data
  const fetchAll = useCallback(async (f: Filters) => {
    if (!token) return;
    setRefetching(true);
    setError(null);
    const qs = buildQS(f);
    const hdrs = { Authorization: `Bearer ${token}` };
    try {
      const [ov, sev, mo, yr, st, mp, wea, hr, env, avgDur, highSev, sevRF, riskM, rushH, weaS, durS, nightR, visR] = await Promise.all([
        axios.get(`${API}/api/stats/overview${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-severity${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-month${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-year${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-state${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/map-points${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-weather${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-hour${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/by-env-bucket${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/avg-duration${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/high-severity-rate${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/severity-by-road-feature${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/risk-multiplier${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/rush-hour-severity-index${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/weather-severity-score${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/duration-by-severity${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/night-risk-multiplier${qs}`, { headers: hdrs }),
        axios.get(`${API}/api/stats/visibility-risk${qs}`, { headers: hdrs }),
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
      setAvgDuration(avgDur.data.avg_duration_min ?? null);
      setHighSeverityRate(highSev.data.high_severity_rate ?? null);
      setSevByRoadFeat(sevRF.data.data ?? []);
      setRiskMultiplier(riskM.data ?? null);
      setRushHourIndex(rushH.data.rush_hour_severity_index ?? null);
      setWeaSevScore(weaS.data.data ?? []);
      setDurBySev(durS.data.data ?? []);
      setNightRiskMult(nightR.data ?? null);
      setVisRisk(visR.data.data ?? []);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  }, [token]);

  // Fetch ML model info
  useEffect(() => {
    if (!token) return;
    const hdrs = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/api/predict/model-info`, { headers: hdrs })
      .then(r => setModelInfo(r.data))
      .catch(() => {});
    axios.get(`${API}/api/predict/feature-importance`, { headers: hdrs })
      .then(r => {
        const fi = r.data.feature_importance as Record<string, number>;
        setFeatureImportance(
          Object.entries(fi)
            .map(([feature, importance]) => ({ feature, importance }))
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 10)
        );
      })
      .catch(() => {});
  }, [token]);

  // Initial load
  useEffect(() => { fetchAll(filters); }, []); // eslint-disable-line

  // Year filter sync
  const prevYearRef = useRef<number[]>([]);
  useEffect(() => {
    if (JSON.stringify(filters.year) !== JSON.stringify(prevYearRef.current) && !loading) {
      prevYearRef.current = filters.year;
      fetchAll(filters);
    }
  }, [filters.year]); // eslint-disable-line

  // Filter helpers
  const toggle = <V,>(key: keyof Filters, val: V) =>
    setFilters(f => {
      const arr = f[key] as V[];
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  const applyFilters = () => { setShowFilterPanel(false); fetchAll(filters); };
  const resetFilters = () => {
    const empty: Filters = { year: [], severity: [], state: [], month: [] };
    setFilters(empty);
    setShowFilterPanel(false);
    fetchAll(empty);
  };
  const removeFilter = <V,>(key: keyof Filters, val: V) => {
    const next = { ...filters, [key]: (filters[key] as V[]).filter(x => x !== val) };
    setFilters(next);
    fetchAll(next);
  };
  const activeFilterCount = filters.year.length + filters.severity.length + filters.state.length + filters.month.length;

  // ML Prediction
  const runPrediction = async () => {
    if (!token) return;
    setPredicting(true);
    setPredictionResult(null);
    try {
      const r = await axios.post(`${API}/api/predict/severity`, predictionForm, { headers: { Authorization: `Bearer ${token}` } });
      setPredictionResult(r.data.prediction);
    } catch (e) {
      setPredictionResult({ error: extractError(e) });
    } finally {
      setPredicting(false);
    }
  };

  // Loading / error states
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: "100vh", color: "#64748b", fontSize: 13 }}>
      <div className="db-spinner" /><span>Chargement du tableau de bord…</span>
    </div>
  );

  if (error || !overview) return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "rgba(244,63,94,.06)", border: "1px solid rgba(244,63,94,.2)", borderRadius: 12, padding: "18px 20px", margin: 24, color: "#f43f5e", fontSize: 13 }}>
      <span style={{ fontSize: 20 }}>⚠</span>
      <div>
        {error || "No data available."}
        <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>Exécutez d'abord <strong>Créer un datamart</strong> sur la page ETL.</div>
      </div>
    </div>
  );

  const availableYears = overview.years_covered ?? [];

  return (
    <>
      <style>{globalStyles}</style>
      <div className="db-root">
        {/* Header */}

{/* Header - Modifier le h1 */}
<header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${t.hoverBg},${t.cardBg})`, border: `1px solid ${t.borderAccent}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: t.accent }}>◈</div>
    <div>
      <h1 style={{ 
        fontFamily: "'Inter', 'Syne', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", 
        fontSize: 30, 
        fontWeight: 700, 
        color: t.textStrong, 
        margin: "0 0 2px", 
        letterSpacing: "-0.02em",
        lineHeight: 1.3
      }}>
        Analyse des accidents
      </h1>
    </div>
  </div>
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    {refetching && <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.textMuted }}><span className="db-pulse" /> Mise à jour</span>}
    <button onClick={() => setShowFilterPanel(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 8, background: showFilterPanel ? t.hoverBg : t.inputBg, border: `1px solid ${showFilterPanel ? t.borderAccent : t.border}`, color: showFilterPanel ? t.textBase : t.textMuted, fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", cursor: "pointer" }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 2h12M3 7h8M5 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      Filtres {activeFilterCount > 0 && <span style={{ background: t.accent, color: t.accentFg, borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}>{activeFilterCount}</span>}
    </button>
  </div>
</header>

        {/* Year bar */}
        {availableYears.length > 1 && <YearBar years={availableYears} selectedYears={filters.year} onToggle={y => toggle("year", y)} onSelectAll={() => setFilters(f => ({ ...f, year: [] }))} t={t} />}

        {/* Filter panel */}
        {showFilterPanel && <FilterPanel filters={filters} t={t} onToggleMonth={v => toggle("month", v)} onToggleSeverity={v => toggle("severity", v)} onToggleState={s => toggle("state", s)} onApply={applyFilters} onReset={resetFilters} />}

        {/* Active filter pills */}
        <PillsRow filters={filters} onRemoveYear={y => removeFilter("year", y)} onRemoveMonth={v => removeFilter("month", v)} onRemoveSeverity={v => removeFilter("severity", v)} onRemoveState={s => removeFilter("state", s)} onClearAll={resetFilters} />

        {/* Sections */}
        <SectionDivider label="Aperçu" t={t} />
        <OverviewStrip overview={overview} sevData={sevData} t={t} />

        <SectionDivider label="Indicateurs clés" t={t} />
        <KeyMetrics avgDuration={avgDuration} highSeverityRate={highSeverityRate} riskMultiplier={riskMultiplier} rushHourIndex={rushHourIndex} nightRiskMult={nightRiskMult} durBySev={durBySev} t={t} />
{/* Section: Breakdowns */}
<SectionDivider label="décompositions" t={t} />

{/* Row 1: Severity Distribution and Weather Impact */}
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
  <SeverityChart data={sevData} t={t} />
  <WeatherChart data={weatherData} t={t} />
</div>

{/* Row 2: Road Feature and Visibility Risk */}
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
  {sevByRoadFeat && sevByRoadFeat.length > 0 && (
    <SeverityByRoadFeature data={sevByRoadFeat} t={t} />
  )}
  {visRisk && visRisk.length > 0 && (
    <VisibilityRisk data={visRisk} t={t} />
  )}
</div>



        <SectionDivider label="Tendances" t={t} />
        <TrendCharts monthData={monthData} yearData={yearData} t={t} />

        <SectionDivider label="Géographie" t={t} />
        <TopStates data={stateData} t={t} />
        <div style={{ marginTop: 16 }}><USMap cities={mapData?.top_cities ?? []} t={t} isDark={isDark} /></div>

        <SectionDivider label="Patterns temporels" t={t} />
        <HourHeatmap grid={hourGrid} t={t} />

        <SectionDivider label="Environnement" t={t} />
        <EnvBuckets tempBuckets={tempBuckets} visBuckets={visBuckets} t={t} />

              </div>
    </>
  );
}

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@700;800&display=swap');
  @keyframes db-fadein { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
  @keyframes db-spin   { to { transform:rotate(360deg); } }
  @keyframes db-pulse  { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)} }
  .db-root { animation: db-fadein .35s ease; font-family: 'IBM Plex Mono', monospace; }
  .db-spinner { width:18px;height:18px;border:2px solid rgba(255,255,255,0.1);border-top-color:#38bdf8;border-radius:50%;animation:db-spin .7s linear infinite; }
  .db-pulse  { display:inline-block;width:6px;height:6px;background:#22d3ee;border-radius:50%;animation:db-pulse 1.2s ease-in-out infinite; }
  @media(max-width:900px){ .db-2col{grid-template-columns:1fr!important;} .db-5col{grid-template-columns:repeat(2,1fr)!important;} .db-4col{grid-template-columns:repeat(2,1fr)!important;} }
`;