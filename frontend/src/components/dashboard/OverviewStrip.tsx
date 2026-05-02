// src/pages/components/OverviewStrip.tsx
import React from "react";
import type { Overview, SevRow } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";
import { SEV_COLORS } from "../../pages/constants/dashboard.constants";

interface OverviewStripProps {
  overview: Overview;
  sevData: SevRow[];
  t: T;
}

export const OverviewStrip: React.FC<OverviewStripProps> = ({ overview, sevData, t }) => {
  const fmt = (n: number) => n?.toLocaleString() ?? "0";
  const sevColor = (avg: number) => {
    if (!avg && avg !== 0) return "#64748b";
    if (avg < 1.75) return "#34d399";
    if (avg < 2.5) return "#f59e0b";
    if (avg < 3.25) return "#fb923c";
    return "#f43f5e";
  };
  const sevMax = Math.max(...sevData.map(d => d.count), 1);
  
  const kpiStyle: React.CSSProperties = {
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14,
    padding: 20, display: "flex", gap: 14, alignItems: "flex-start",
    boxShadow: `0 1px 4px ${t.shadow}`,
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
      <div style={kpiStyle}>
        <div style={{ fontSize: 22, color: t.textFaint, marginTop: 2 }}>◷</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: t.textMuted, marginBottom: 8 }}>Years covered</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 700, color: t.textStrong, lineHeight: 1, marginBottom: 8 }}>
            {overview.years_covered?.length ?? 0}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(overview.years_covered ?? []).map(y => (
              <span key={y} style={{ fontSize: 10, padding: "3px 9px", borderRadius: 5, background: `${t.accent}14`, color: t.accent, border: `1px solid ${t.accent}28` }}>{y}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={kpiStyle}>
        <div style={{ fontSize: 22, color: t.textFaint, marginTop: 2 }}>⚡</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: t.textMuted, marginBottom: 8 }}>Total accidents</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 700, color: t.textStrong, lineHeight: 1, marginBottom: 8 }}>
            {overview.total_accidents ? fmt(overview.total_accidents) : "0"}
          </div>
        </div>
      </div>

      <div style={kpiStyle}>
        <div style={{ fontSize: 22, color: t.textFaint, marginTop: 2 }}>◈</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: t.textMuted, marginBottom: 8 }}>Avg severity</div>
          <div style={{
            fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 700, lineHeight: 1, marginBottom: 8,
            color: (overview.avg_severity !== null && overview.avg_severity !== undefined) ? sevColor(overview.avg_severity) : t.textMuted,
          }}>
            {(overview.avg_severity !== null && overview.avg_severity !== undefined) ? overview.avg_severity.toFixed(2) : "N/A"}
          </div>
          <div style={{ fontSize: 10, color: t.textFaint }}>Scale 1 (Low) → 4 (Critical)</div>
        </div>
      </div>

      <div style={kpiStyle}>
        <div style={{ fontSize: 22, color: t.textFaint, marginTop: 2 }}>▦</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: t.textMuted, marginBottom: 12 }}>Severity breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sevData.map(r => (
              <div key={r.severity} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, minWidth: 52, color: SEV_COLORS[r.label] }}>{r.label}</span>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: t.miniTrack, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: SEV_COLORS[r.label], width: `${(r.count / sevMax) * 100}%` }} />
                </div>
                <span style={{ fontSize: 10, color: t.textMuted, minWidth: 32, textAlign: "right" }}>{r.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};