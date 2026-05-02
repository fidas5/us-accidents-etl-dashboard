// src/components/dashboard/SeverityByRoadFeature.tsx
import React from "react";
import type { SevRoadFeat } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";

interface SeverityByRoadFeatureProps {
  data: SevRoadFeat[];
  t: T;
}

export const SeverityByRoadFeature: React.FC<SeverityByRoadFeatureProps> = ({ data, t }) => {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const sevColor = (avg: number) => {
    if (!avg && avg !== 0) return "#64748b";
    if (avg < 1.75) return "#34d399";
    if (avg < 2.5) return "#f59e0b";
    if (avg < 3.25) return "#fb923c";
    return "#f43f5e";
  };
  const fmt = (n: number) => n?.toLocaleString() ?? "0";

  const formatFeatureName = (feature: string) => {
    const names: Record<string, string> = {
      'junction': 'Junctions',
      'roundabout': 'Roundabouts',
      'traffic_signal': 'Traffic Signals',
      'railway': 'Railway Crossings',
      'crossing': 'Crossings',
      'stop': 'Stop Signs',
      'give_way': 'Give Way',
      'traffic_calming': 'Traffic Calming',
      'bump': 'Speed Bumps',
    };
    return names[feature] || feature.replace(/_/g, ' ');
  };

  const sortedData = [...data].sort((a, b) => b.avg_severity - a.avg_severity);

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>
          Severity by road feature
        </span>
        <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 5, background: t.inputBg, border: `1px solid ${t.border}`, color: t.textMuted }}>
          Infrastructure impact
        </span>
      </div>

      <div style={{
        maxHeight: 280,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingRight: 4,
        scrollbarWidth: "thin",
        scrollbarColor: `${t.border} transparent`,
      } as React.CSSProperties}>
        {sortedData.map((d, i) => {
          const barWidth = (d.avg_severity / 4) * 100;
          const color = sevColor(d.avg_severity);
          const name = formatFeatureName(d.road_feature);
          
          return (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: t.textMuted, minWidth: 24 }}>#{i+1}</span>
                  <span style={{ fontSize: 11, color: t.textMuted }}>{name}</span>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ fontSize: 10, color: t.textMuted }}>{fmt(d.count)}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: color }}>{d.avg_severity.toFixed(2)}</span>
                </div>
              </div>
              <div style={{ height: 4, background: t.trackBg, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${barWidth}%`, height: "100%", background: color, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};