// src/pages/components/FilterPanel.tsx
import React from "react";
import type { Filters } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";
import { MONTHS, SEV_OPTIONS, ALL_STATES } from "../../pages/constants/dashboard.constants";

interface FilterPanelProps {
  filters: Filters;
  t: T;
  onToggleMonth: (v: number) => void;
  onToggleSeverity: (v: number) => void;
  onToggleState: (s: string) => void;
  onApply: () => void;
  onReset: () => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters, t, onToggleMonth, onToggleSeverity, onToggleState, onApply, onReset
}) => {
  const base: React.CSSProperties = {
    height: 26, padding: "0 10px", borderRadius: 6, fontSize: 11,
    border: `1px solid ${t.border}`, background: t.inputBg, color: t.textMuted,
    cursor: "pointer", transition: "all .15s", fontFamily: "'IBM Plex Mono',monospace"
  };
  const on: React.CSSProperties = {
    ...base, background: `${t.accent}18`, borderColor: t.accent, color: t.accent
  };

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22, marginBottom: 20, boxShadow: `0 4px 20px ${t.shadow}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: t.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Month</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {MONTHS.map(m => <button key={m.value} style={filters.month.includes(m.value) ? on : base} onClick={() => onToggleMonth(m.value)}>{m.name.slice(0, 3)}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: t.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Severity</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SEV_OPTIONS.map(s => <button key={s.value} style={filters.severity.includes(s.value) ? { ...on, borderColor: s.color, color: s.color, background: `${s.color}18` } : base} onClick={() => onToggleSeverity(s.value)}>{s.label}</button>)}
          </div>
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: t.accent, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>State</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ALL_STATES.map(s => <button key={s} style={filters.state.includes(s) ? on : base} onClick={() => onToggleState(s)}>{s}</button>)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onReset} style={{ height: 36, padding: "0 16px", borderRadius: 8, background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>Reset all</button>
        <button onClick={onApply} style={{ flex: 1, height: 36, borderRadius: 8, background: t.accent, color: t.accentFg, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "monospace" }}>Apply filters</button>
      </div>
    </div>
  );
};