// src/pages/components/SectionDivider.tsx
import React from "react";
import type { T } from "../../pages/themes/dashboard.themes";

interface SectionDividerProps {
  label: string;
  t: T;
}

export const SectionDivider: React.FC<SectionDividerProps> = ({ label, t }) => (
  <div style={{ margin: "32px 0 20px", display: "flex", alignItems: "center", gap: 14 }}>
    <div style={{ flex: 1, height: 1, background: t.border }} />
    <span style={{
      fontSize: 11, color: t.accent, whiteSpace: "nowrap", fontFamily: "monospace",
      fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
      padding: "4px 12px", borderRadius: 6,
      background: t.sectionBg, border: `1px solid ${t.sectionBorder}`,
    }}>{label}</span>
    <div style={{ flex: 1, height: 1, background: t.border }} />
  </div>
);