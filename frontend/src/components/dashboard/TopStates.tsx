// src/pages/components/TopStates.tsx
import React from "react";
import type { StateRow } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";

interface TopStatesProps {
  data: StateRow[];
  t: T;
}

export const TopStates: React.FC<TopStatesProps> = ({ data, t }) => {
  const maxCount = data[0]?.count ?? 1;
  const palette = ["#f43f5e", "#fb923c", "#f59e0b", "#a3e635", "#34d399", "#22d3ee", "#38bdf8", "#818cf8", "#c084fc", "#f472b6"];
  const fmt = (n: number) => n?.toLocaleString() ?? "0";
  const sevColor = (avg: number) => {
    if (!avg && avg !== 0) return "#64748b";
    if (avg < 1.75) return "#34d399";
    if (avg < 2.5) return "#f59e0b";
    if (avg < 3.25) return "#fb923c";
    return "#f43f5e";
  };

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>Top 10 states</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.slice(0, 10).map((d, i) => {
          const col = palette[i % palette.length];
          return (
            <div key={d.state} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 10, color: t.textFaint, minWidth: 22, textAlign: "right" }}>#{i + 1}</div>
              <div style={{ fontSize: 11, color: t.textMuted, minWidth: 28 }}>{d.state}</div>
              <div style={{ flex: 1, height: 30, background: t.trackBg, borderRadius: 5, overflow: "hidden", position: "relative", border: `1px solid ${t.trackBorder}` }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, bottom: 0,
                  width: `${(d.count / maxCount) * 100}%`,
                  background: `${col}28`, borderRight: `2px solid ${col}`,
                  transition: "width .4s ease",
                }} />
                <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: t.textMuted }}>
                  {fmt(d.count)}
                </div>
              </div>
              <div style={{ minWidth: 70, textAlign: "right", fontSize: 11, color: t.textMuted }}>{fmt(d.count)}</div>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(d.avg_severity), flexShrink: 0 }} title={`Avg severity: ${d.avg_severity?.toFixed(2) ?? "N/A"}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
};