// src/components/dashboard/VisibilityRisk.tsx
import React from "react";
import type { VisRisk } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";

interface VisibilityRiskProps {
  data: VisRisk[];
  t: T;
}

export const VisibilityRisk: React.FC<VisibilityRiskProps> = ({ data, t }) => {
  const sevColor = (avg: number) => {
    if (!avg && avg !== 0) return "#64748b";
    if (avg < 1.75) return "#34d399";
    if (avg < 2.5) return "#f59e0b";
    if (avg < 3.25) return "#fb923c";
    return "#f43f5e";
  };

  const getBucketOrder = (bucket: string) => {
    const order = { "Poor": 0, "Moderate": 1, "Good": 2 };
    return order[bucket as keyof typeof order] || 3;
  };

  const sortedData = [...data].sort((a, b) => getBucketOrder(a.visibility_bucket) - getBucketOrder(b.visibility_bucket));
  const maxSeverity = Math.max(...data.map(d => d.avg_severity), 1);

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>
          Risque de visibilité
        </span>
        <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 5, background: t.inputBg, border: `1px solid ${t.border}`, color: t.textMuted }}>
          impact météorologique
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sortedData.map((d) => {
          const barWidth = (d.avg_severity / maxSeverity) * 100;
          const color = sevColor(d.avg_severity);
          
          return (
            <div key={d.visibility_bucket}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: t.textMuted }}>{d.visibility_bucket}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: color }}>{d.avg_severity.toFixed(2)}</span>
              </div>
              <div style={{ height: 4, background: t.trackBg, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${barWidth}%`, height: "100%", background: color, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Simple insight line */}
      {data.find(d => d.visibility_bucket === "Poor")?.avg_severity && (
        <div style={{ 
          marginTop: 16, 
          paddingTop: 12, 
          borderTop: `1px solid ${t.border}`,
          fontSize: 10,
          color: t.textFaint,
          fontFamily: "monospace"
        }}>
          {data.find(d => d.visibility_bucket === "Poor")?.avg_severity <= 2.2 
            ? "✓ Une faible visibilité n’augmente pas la gravité"
            : "⚠ Une faible visibilité augmente la gravité - installer des systèmes d'alerte"}
        </div>
      )}
    </div>
  );
};