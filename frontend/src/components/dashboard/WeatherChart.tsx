// src/pages/components/WeatherChart.tsx
import React from "react";
import type { WeatherRow } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";

interface WeatherChartProps {
  data: WeatherRow[];
  t: T;
}

export const WeatherChart: React.FC<WeatherChartProps> = ({ data, t }) => {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const fmt = (n: number) => n?.toLocaleString() ?? "0";
  const sevColor = (avg: number) => {
    if (!avg && avg !== 0) return "#64748b";
    if (avg < 1.75) return "#34d399";
    if (avg < 2.5) return "#f59e0b";
    if (avg < 3.25) return "#fb923c";
    return "#f43f5e";
  };

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>impact des conditions météorologiques sur la gravité</span>
      </div>
      <div style={{
        maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7,
        paddingRight: 4, scrollbarWidth: "thin", scrollbarColor: `${t.border} transparent`,
      } as React.CSSProperties}>
        {data.map(d => (
          <div key={d.weather_condition} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 10, color: t.textMuted, minWidth: 130, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
              {d.weather_condition}
            </div>
            <div style={{ flex: 1, height: 22, background: t.trackBg, borderRadius: 5, overflow: "hidden", position: "relative", border: `1px solid ${t.trackBorder}` }}>
              <div style={{
                position: "absolute", top: 0, left: 0, bottom: 0,
                width: `${(d.count / maxCount) * 100}%`,
                background: `${sevColor(d.avg_severity)}28`, borderRight: `2px solid ${sevColor(d.avg_severity)}`,
                transition: "width .4s ease",
              }} />
              <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: t.textMuted }}>{fmt(d.count)}</div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, minWidth: 28, textAlign: "right", color: sevColor(d.avg_severity), flexShrink: 0 }}>
              {d.avg_severity?.toFixed(1) ?? "N/A"}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8, fontSize: 10, color: t.textFaint }}>
<span>Barre = nombre</span><span>·</span><span>Droite = gravité moyenne</span>      </div>
    </div>
  );
};