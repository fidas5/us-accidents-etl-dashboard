// src/pages/components/SeverityChart.tsx
import React from "react";
import type { SevRow } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";

// French color mapping for severity levels
const SEV_COLORS_FR: Record<string, string> = {
  "Faible": "#22c55e",     // Green
  "Modérée": "#eab308",    // Yellow
  "Élevée": "#f97316",     // Orange
  "Critique": "#ef4444",   // Red
  "Unknown": "#6b7280"     // Gray
};

interface SeverityChartProps {
  data: SevRow[];
  t: T;
}

export const SeverityChart: React.FC<SeverityChartProps> = ({ data, t }) => {
  const sevMax = Math.max(...data.map(d => d.count), 1);
  const fmt = (n: number) => n?.toLocaleString() ?? "0";

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>
          Répartition de la gravité
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, height: 200, padding: "10px 20px 0", justifyContent: "center" }}>
        {data.map(d => {
          const color = SEV_COLORS_FR[d.label] || "#6b7280";
          return (
            <div key={d.severity} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, height: "100%" }}>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{fmt(d.count)}</div>
              <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                <div style={{
                  width: "100%", maxWidth: 56, margin: "0 auto",
                  height: `${(d.count / sevMax) * 100}%`, minHeight: 2,
                  background: color, borderRadius: "6px 6px 0 0",
                  cursor: "pointer", transition: "opacity .15s",
                }} title={`${d.label}: ${fmt(d.count)} (${d.pct}%)`} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, marginTop: 10, color: color }}>{d.label}</div>
              <div style={{ fontSize: 10, color: t.textFaint }}>{d.pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};