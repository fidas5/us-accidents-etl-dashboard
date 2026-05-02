// src/pages/components/FeatureImportanceChart.tsx
import React from "react";
import type { FeatImportance } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";
import { ROAD_FEAT_SET } from "../../pages/constants/dashboard.constants";

interface FeatureImportanceProps {
  data: FeatImportance[];
  t: T;
}

export const FeatureImportanceChart: React.FC<FeatureImportanceProps> = ({ data, t }) => {
  const max = data[0]?.importance ?? 1;

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>Top 10 feature importances</span>
        <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 5, background: t.inputBg, border: `1px solid ${t.border}`, color: t.textMuted }}>ML Model</span>
      </div>
      <div style={{
        maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7,
        paddingRight: 4, scrollbarWidth: "thin", scrollbarColor: `${t.border} transparent`,
      } as React.CSSProperties}>
        {data.map(d => {
          const isRoad = ROAD_FEAT_SET.has(d.feature);
          const color = isRoad ? "#fb923c" : t.accent;
          return (
            <div key={d.feature} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 10, color: t.textMuted, minWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
                {d.feature.replace(/_/g, " ")}
              </div>
              <div style={{ flex: 1, height: 22, background: t.trackBg, borderRadius: 5, overflow: "hidden", position: "relative", border: `1px solid ${t.trackBorder}` }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, bottom: 0,
                  width: `${(d.importance / max) * 100}%`,
                  background: `${color}28`, borderRight: `2px solid ${color}`,
                  transition: "width .4s ease",
                }} />
                <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: t.textMuted, fontFamily: "monospace" }}>
                  {(d.importance * 100).toFixed(2)}%
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, minWidth: 14, textAlign: "right", flexShrink: 0 }}>
                {isRoad && <span title="Road infrastructure feature" style={{ color: "#fb923c" }}>🛣</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: t.textFaint, marginTop: 8 }}>🛣 = road infrastructure feature</div>
    </div>
  );
};