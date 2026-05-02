// src/pages/components/ModelInfoStrip.tsx
import React from "react";
import type { T } from "../../pages/themes/dashboard.themes";

interface ModelInfoStripProps {
  info: any;
  t: T;
}

export const ModelInfoStrip: React.FC<ModelInfoStripProps> = ({ info, t }) => {
  if (!info) return null;
  
  const metrics = [
    { label: "Model type", value: "Random Forest" },
    { label: "Estimators", value: info.n_estimators },
    { label: "Max depth", value: info.max_depth },
    { label: "OOB score", value: `${(info.oob_score * 100).toFixed(2)}%` },
    { label: "Features", value: info.n_features },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 16 }}>
      {metrics.map(m => (
        <div key={m.label} style={{
          background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12,
          padding: "14px 16px", boxShadow: `0 1px 4px ${t.shadow}`,
        }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: t.textMuted, marginBottom: 6 }}>{m.label}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, color: t.accent }}>{m.value}</div>
        </div>
      ))}
    </div>
  );
};