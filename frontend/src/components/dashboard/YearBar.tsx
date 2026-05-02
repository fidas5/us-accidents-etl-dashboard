// src/pages/components/YearBar.tsx
import React from "react";
import type { T } from "../../pages/themes/dashboard.themes";

interface YearBarProps {
  years: number[];
  selectedYears: number[];
  onToggle: (y: number) => void;
  onSelectAll: () => void;
  t: T;
}

export const YearBar: React.FC<YearBarProps> = ({ years, selectedYears, onToggle, onSelectAll, t }) => {
  const allSelected = selectedYears.length === 0;
  const base: React.CSSProperties = {
    height: 28, padding: "0 14px", borderRadius: 6, fontSize: 11, fontWeight: 600,
    fontFamily: "'IBM Plex Mono',monospace", cursor: "pointer", transition: "all .15s",
    border: `1px solid ${t.yearBorder}`, background: t.yearBg, color: t.yearText
  };
  const on: React.CSSProperties = {
    ...base, background: t.yearActiveBg, borderColor: t.yearActiveBorder, color: t.yearActiveText
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, padding: "10px 14px", borderRadius: 10, background: t.cardBg, border: `1px solid ${t.border}` }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: t.textMuted, marginRight: 4, whiteSpace: "nowrap" }}>Year</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button style={allSelected ? on : { ...base, borderStyle: "dashed" }} onClick={onSelectAll}>All</button>
        <div style={{ width: 1, height: 18, background: t.border, margin: "0 4px" }} />
        {years.map(y => <button key={y} style={selectedYears.includes(y) ? on : base} onClick={() => onToggle(y)}>{y}</button>)}
      </div>
      {selectedYears.length > 0 && (
        <span style={{ fontSize: 10, color: t.textFaint, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {selectedYears.length === 1 ? `Showing ${selectedYears[0]} only` : `${selectedYears.length} years selected`}
        </span>
      )}
    </div>
  );
};