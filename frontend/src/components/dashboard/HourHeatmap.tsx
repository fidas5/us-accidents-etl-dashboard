// src/pages/components/HourHeatmap.tsx
import React from "react";
import type { HourCell } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";
import { DAY_LABELS } from "../../pages/constants/dashboard.constants";

interface HourHeatmapProps {
  grid: HourCell[];
  t: T;
}

export const HourHeatmap: React.FC<HourHeatmapProps> = ({ grid, t }) => {
  const map: Record<number, Record<number, HourCell>> = {};
  grid.forEach(cell => {
    if (!map[cell.day_of_week]) map[cell.day_of_week] = {};
    map[cell.day_of_week][cell.hour] = cell;
  });
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = [0, 1, 2, 3, 4, 5, 6];
  const cellSize = 22;
  const fmt = (n: number) => n?.toLocaleString() ?? "0";
  
  const cellColor = (intensity: number) => {
    if (intensity === 0) return t.trackBg;
    if (intensity < 20) return "#1e3a5f";
    if (intensity < 40) return "#1d5fa3";
    if (intensity < 60) return "#f59e0b";
    if (intensity < 80) return "#fb923c";
    return "#f43f5e";
  };

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>Carte de chaleur des heures de pointe</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "inline-grid", gridTemplateColumns: `52px repeat(24, ${cellSize}px)`, gap: 2, minWidth: "fit-content" }}>
          <div />
          {hours.map(h => (
            <div key={h} style={{ fontSize: 9, color: t.textFaint, textAlign: "center", paddingBottom: 4, fontFamily: "monospace" }}>
              {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
            </div>
          ))}
          {days.map(dow => (
            <React.Fragment key={dow}>
              <div style={{ fontSize: 10, color: t.textMuted, display: "flex", alignItems: "center", paddingRight: 8, fontFamily: "monospace" }}>
                {DAY_LABELS[dow]}
              </div>
              {hours.map(h => {
                const cell = map[dow]?.[h];
                const intensity = cell?.intensity ?? 0;
                return (
                  <div key={h}
                    title={cell ? `${DAY_LABELS[dow]} ${h}:00 — ${fmt(cell.count)} accidents (${intensity}% intensity)` : "No data"}
                    style={{ width: cellSize, height: cellSize, borderRadius: 3, background: cellColor(intensity), cursor: cell ? "pointer" : "default", transition: "opacity .15s" }}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 10, color: t.textFaint }}>
        <span>Faible</span>
        {["#1e3a5f", "#1d5fa3", "#f59e0b", "#fb923c", "#f43f5e"].map(c => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 2, background: c }} />
        ))}
        <span>Élevé</span>
        <span style={{ marginLeft: "auto" }}>Survolez une cellule pour voir le nombre exact</span>
      </div>
    </div>
  );
};