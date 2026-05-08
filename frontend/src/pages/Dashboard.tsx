// src/pages/Dashboard.tsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useDashboardData } from "./hooks/useDashboardData";

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
import { SeverityByRoadFeature } from "../components/dashboard/SeverityByRoadFeature";
import { VisibilityRisk } from "../components/dashboard/VisibilityRisk";

// Import types and constants
import type { Filters } from "./types/dashboard.types";
import { useIsDark, extractError } from "./utils/dashboard.utils";
import { DARK, LIGHT } from "./themes/dashboard.themes";

export default function Dashboard() {
  const { token } = useAuth();
  const isDark = useIsDark();
  const t = isDark ? DARK : LIGHT;

  const [filters, setFilters] = useState<Filters>({ 
    year: [], 
    severity: [], 
    state: [], 
    month: [] 
  });
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  
  // Use React Query hook with persistence
  const { 
    data, 
    isLoading, 
    error, 
    refetch, 
    isFetching,
    dataUpdatedAt 
  } = useDashboardData(filters, token);

  // Get last update time
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  // Filter helpers - React Query automatically caches each filter combination
  const toggle = <V,>(key: keyof Filters, val: V) => {
    setFilters(f => {
      const arr = f[key] as V[];
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  };
  
  const applyFilters = () => { 
    setShowFilterPanel(false);
  };
  
  const resetFilters = () => {
    const empty: Filters = { year: [], severity: [], state: [], month: [] };
    setFilters(empty);
    setShowFilterPanel(false);
  };
  
  const removeFilter = <V,>(key: keyof Filters, val: V) => {
    const next = { ...filters, [key]: (filters[key] as V[]).filter(x => x !== val) };
    setFilters(next);
  };
  
  // Force refresh to get latest data from API
  const forceRefresh = () => {
    refetch();
  };
  
  const activeFilterCount = filters.year.length + filters.severity.length + filters.state.length + filters.month.length;

  // Loading state
  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: "100vh", color: "#64748b", fontSize: 13 }}>
      <div className="db-spinner" /><span>Chargement du tableau de bord…</span>
    </div>
  );

  // Error state
  if (error || !data?.overview) return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "rgba(244,63,94,.06)", border: "1px solid rgba(244,63,94,.2)", borderRadius: 12, padding: "18px 20px", margin: 24, color: "#f43f5e", fontSize: 13 }}>
      <span style={{ fontSize: 20 }}>⚠</span>
      <div>
        {error instanceof Error}
        <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
          Exécutez d'abord <strong>Créer un datamart</strong> sur la page ETL.
        </div>
        <button 
          onClick={() => refetch()}
          style={{ marginTop: 10, padding: "6px 12px", background: t.accent, color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          Réessayer
        </button>
      </div>
    </div>
  );

  const availableYears = data.overview.years_covered ?? [];

  return (
    <>
      <style>{globalStyles}</style>
      <div className="db-root">
        {/* Header with cache info */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ 
              width: 44, 
              height: 44, 
              borderRadius: 12, 
              background: `linear-gradient(135deg,${t.hoverBg},${t.cardBg})`, 
              border: `1px solid ${t.borderAccent}44`, 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              fontSize: 20, 
              color: t.accent 
            }}>
              ◈
            </div>
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
              {lastUpdate && (
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>
                  Dernière mise à jour: {lastUpdate}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isFetching && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.textMuted }}>
                <span className="db-pulse" /> Mise à jour
              </span>
            )}
            <button 
              onClick={forceRefresh} 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 7, 
                padding: "7px 14px", 
                borderRadius: 8, 
                background: t.accent, 
                border: "none", 
                color: "white", 
                fontSize: 12, 
                cursor: "pointer",
                fontWeight: 500
              }}
            >
              🔄 Actualiser
            </button>
            <button 
              onClick={() => setShowFilterPanel(v => !v)} 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 7, 
                padding: "7px 14px", 
                borderRadius: 8, 
                background: showFilterPanel ? t.hoverBg : t.inputBg, 
                border: `1px solid ${showFilterPanel ? t.borderAccent : t.border}`, 
                color: showFilterPanel ? t.textBase : t.textMuted, 
                fontSize: 12, 
                fontFamily: "'IBM Plex Mono',monospace", 
                cursor: "pointer" 
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 2h12M3 7h8M5 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Filtres {activeFilterCount > 0 && (
                <span style={{ 
                  background: t.accent, 
                  color: t.accentFg, 
                  borderRadius: 99, 
                  padding: "1px 6px", 
                  fontSize: 10, 
                  fontWeight: 600 
                }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Year bar */}
        {availableYears.length > 1 && (
          <YearBar 
            years={availableYears} 
            selectedYears={filters.year} 
            onToggle={y => toggle("year", y)} 
            onSelectAll={() => setFilters(f => ({ ...f, year: [] }))} 
            t={t} 
          />
        )}

        {/* Filter panel */}
        {showFilterPanel && (
          <FilterPanel 
            filters={filters} 
            t={t} 
            onToggleMonth={v => toggle("month", v)} 
            onToggleSeverity={v => toggle("severity", v)} 
            onToggleState={s => toggle("state", s)} 
            onApply={applyFilters} 
            onReset={resetFilters} 
          />
        )}

        {/* Active filter pills */}
        <PillsRow 
          filters={filters} 
          onRemoveYear={y => removeFilter("year", y)} 
          onRemoveMonth={v => removeFilter("month", v)} 
          onRemoveSeverity={v => removeFilter("severity", v)} 
          onRemoveState={s => removeFilter("state", s)} 
          onClearAll={resetFilters} 
        />

        {/* Sections */}
        <SectionDivider label="Aperçu" t={t} />
        <OverviewStrip overview={data.overview} sevData={data.sevData} t={t} />

        <SectionDivider label="Indicateurs clés" t={t} />
        <KeyMetrics 
          avgDuration={data.avgDuration} 
          highSeverityRate={data.highSeverityRate} 
          riskMultiplier={data.riskMultiplier} 
          rushHourIndex={data.rushHourIndex} 
          nightRiskMult={data.nightRiskMult} 
          durBySev={data.durBySev} 
          t={t} 
        />

        <SectionDivider label="Décompositions" t={t} />

        {/* Row 1: Severity Distribution and Weather Impact */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <SeverityChart data={data.sevData} t={t} />
          <WeatherChart data={data.weatherData} t={t} />
        </div>

        {/* Row 2: Road Feature and Visibility Risk */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {data.sevByRoadFeat && data.sevByRoadFeat.length > 0 && (
            <SeverityByRoadFeature data={data.sevByRoadFeat} t={t} />
          )}
          {data.visRisk && data.visRisk.length > 0 && (
            <VisibilityRisk data={data.visRisk} t={t} />
          )}
        </div>

        <SectionDivider label="Tendances" t={t} />
        <TrendCharts monthData={data.monthData} yearData={data.yearData} t={t} />

        <SectionDivider label="Géographie" t={t} />
        <TopStates data={data.stateData} t={t} />
        <div style={{ marginTop: 16 }}>
          <USMap cities={data.mapData?.top_cities ?? []} t={t} isDark={isDark} />
        </div>

        <SectionDivider label="Patterns temporels" t={t} />
        <HourHeatmap grid={data.hourGrid} t={t} />

        <SectionDivider label="Environnement" t={t} />
        <EnvBuckets tempBuckets={data.tempBuckets} visBuckets={data.visBuckets} t={t} />
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
  @media(max-width:900px){ 
    .db-2col{grid-template-columns:1fr!important;} 
    .db-5col{grid-template-columns:repeat(2,1fr)!important;} 
    .db-4col{grid-template-columns:repeat(2,1fr)!important;} 
  }
`;