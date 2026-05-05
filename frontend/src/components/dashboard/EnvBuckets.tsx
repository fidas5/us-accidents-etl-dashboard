// src/pages/components/EnvBuckets.tsx
import React from "react";
import type { EnvBucket } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";

interface EnvBucketsProps {
  tempBuckets: EnvBucket[];
  visBuckets: EnvBucket[];
  t: T;
}

export const EnvBuckets: React.FC<EnvBucketsProps> = ({ tempBuckets, visBuckets, t }) => {
  const TEMP_COLORS: Record<string, string> = { Freezing: "#60a5fa", Cold: "#38bdf8", Cool: "#22d3ee", Warm: "#34d399", Hot: "#f59e0b" };
  const VIS_COLORS: Record<string, string> = { Poor: "#f43f5e", Moderate: "#f59e0b", Good: "#34d399" };
  const fmt = (n: number) => n?.toLocaleString() ?? "0";
  const sevColor = (avg: number) => {
    if (!avg && avg !== 0) return "#64748b";
    if (avg < 1.75) return "#34d399";
    if (avg < 2.5) return "#f59e0b";
    if (avg < 3.25) return "#fb923c";
    return "#f43f5e";
  };

  const BucketBars = ({ data, colors }: { data: EnvBucket[]; colors: Record<string, string> }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map(d => (
        <div key={d.bucket}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: colors[d.bucket] ?? t.textBase }}>{d.bucket}</span>
            <span style={{ fontSize: 11, color: t.textMuted }}>{fmt(d.count)} ({d.pct}%)</span>
          </div>
          <div style={{ height: 8, background: t.trackBg, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${d.pct}%`, borderRadius: 4, background: colors[d.bucket] ?? t.accent, transition: "width .4s ease" }} />
          </div>
          <div style={{ fontSize: 10, color: t.textFaint, marginTop: 3 }}>
            Gravité moyenne(Avg severity): <span style={{ color: sevColor(d.avg_severity) }}>{d.avg_severity?.toFixed(2) ?? "N/A"}</span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>Catégories de température</span>
        </div>
        <BucketBars data={tempBuckets} colors={TEMP_COLORS} />
      </div>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>Catégories de visibilité</span>
        </div>
        <BucketBars data={visBuckets} colors={VIS_COLORS} />
      </div>
    </div>
  );
};