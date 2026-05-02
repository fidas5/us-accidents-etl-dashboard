// src/pages/components/PillsRow.tsx
import React from "react";
import type { Filters } from "../../pages/types/dashboard.types";
import { MONTHS, SEV_OPTIONS } from "../../pages/constants/dashboard.constants";

interface PillsRowProps {
  filters: Filters;
  onRemoveYear: (y: number) => void;
  onRemoveMonth: (v: number) => void;
  onRemoveSeverity: (v: number) => void;
  onRemoveState: (s: string) => void;
  onClearAll: () => void;
}

export const PillsRow: React.FC<PillsRowProps> = ({
  filters, onRemoveYear, onRemoveMonth, onRemoveSeverity, onRemoveState, onClearAll
}) => {
  const total = filters.year.length + filters.severity.length + filters.state.length + filters.month.length;
  if (total === 0) return null;

  const Pill = ({ color, children, onX }: { color: string; children: React.ReactNode; onX: () => void }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px 3px 10px", borderRadius: 99, fontSize: 11, background: `${color}1a`, border: `1px solid ${color}47`, color }}>
      {children}
      <button onClick={onX} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "0 2px", opacity: .7, color: "inherit" }}>×</button>
    </span>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 20 }}>
      <span style={{ fontSize: 11, color: "#64748b" }}>Filters:</span>
      {filters.year.map(y => <Pill key={`y-${y}`} color="#818cf8" onX={() => onRemoveYear(y)}>{y}</Pill>)}
      {filters.month.map(m => <Pill key={`m-${m}`} color="#0ea5e9" onX={() => onRemoveMonth(m)}>{MONTHS.find(x => x.value === m)?.name}</Pill>)}
      {filters.severity.map(s => <Pill key={`s-${s}`} color="#f59e0b" onX={() => onRemoveSeverity(s)}>{SEV_OPTIONS.find(x => x.value === s)?.label}</Pill>)}
      {filters.state.map(s => <Pill key={`st-${s}`} color="#34d399" onX={() => onRemoveState(s)}>{s}</Pill>)}
      <button onClick={onClearAll} style={{ fontSize: 11, color: "#64748b", cursor: "pointer", background: "none", border: "none", textDecoration: "underline", fontFamily: "monospace" }}>Clear all</button>
    </div>
  );
};