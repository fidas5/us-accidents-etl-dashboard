// src/pages/components/KeyMetrics.tsx
import React from "react";
import type { T } from "../../pages/themes/dashboard.themes";

interface KeyMetricsProps {
  avgDuration: number | null;
  highSeverityRate: number | null;
  riskMultiplier: { risk_multiplier: number; note: string } | null;
  rushHourIndex: number | null;
  nightRiskMult: { night_risk_multiplier: number; note: string } | null;
  durBySev: Array<{ severity: number; label: string; avg_duration_min: number }>;
  t: T;
}

const sevColor = (avg: number) => {
  if (!avg && avg !== 0) return "#64748b";
  if (avg < 1.75) return "#34d399";
  if (avg < 2.5) return "#f59e0b";
  if (avg < 3.25) return "#fb923c";
  return "#f43f5e";
};

const StatCard: React.FC<{ label: string; value: string | number | null; unit?: string; note?: string; color?: string; t: T }> = ({ label, value, unit, note, color, t }) => (
  <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: `0 1px 4px ${t.shadow}` }}>
    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: t.textMuted, marginBottom: 10 }}>{label}</div>
    {/* Changement de police ici : 'Inter' pour les nombres */}
    <div style={{ 
      fontFamily: "'Inter', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", 
      fontSize: 36, 
      fontWeight: 700, 
      color: color || t.textStrong, 
      lineHeight: 1.2,
      letterSpacing: "-0.02em"
    }}>
      {value !== null && value !== undefined ? value : "N/A"}
      {unit && <span style={{ fontSize: 16, fontWeight: 500, color: t.textMuted, marginLeft: 4 }}>{unit}</span>}
    </div>
    {note && <div style={{ fontSize: 10, color: t.textFaint, marginTop: 8 }}>{note}</div>}
  </div>
);

export const KeyMetrics: React.FC<KeyMetricsProps> = ({ avgDuration, highSeverityRate, riskMultiplier, rushHourIndex, nightRiskMult, durBySev, t }) => (
  <>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 16 }} className="db-4col">
      <StatCard label="Durée moyenne de l'accident" value={avgDuration !== null ? avgDuration.toFixed(1) : null} unit="min" t={t} />
      <StatCard label="Durée moyenne — gravité critique" value={durBySev.find(d => d.severity === 4)?.avg_duration_min?.toFixed(1) ?? null} unit="min" color="#f43f5e" t={t} />
      <StatCard label="gravité de l'heure de pointe" value={rushHourIndex !== null ? rushHourIndex.toFixed(2) : null} color={rushHourIndex !== null ? sevColor(rushHourIndex) : undefined} note="Gravité moyenne aux heures de pointe (7h-9h, 16h-19h)" t={t} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16, marginBottom: 16 }} className="db-2col">
    </div>
  </>
);