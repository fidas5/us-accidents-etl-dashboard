// src/pages/themes/dashboard.themes.ts

export const DARK = {
  pageBg: "#080c14", cardBg: "#0d1117", inputBg: "#0f172a", hoverBg: "#1e293b",
  border: "rgba(255,255,255,0.07)", borderHover: "rgba(255,255,255,0.14)", borderAccent: "#38bdf8",
  textStrong: "#f1f5f9", textBase: "#e2e8f0", textMuted: "#64748b", textFaint: "#334155",
  accent: "#38bdf8", accentFg: "#0a0f1a", gridLine: "rgba(255,255,255,0.05)",
  tooltipBg: "#0d1117", shadow: "rgba(0,0,0,0.45)", mapBg: "#0d1828",
  miniTrack: "rgba(255,255,255,0.06)", trackBg: "rgba(255,255,255,0.02)",
  trackBorder: "rgba(255,255,255,0.04)", kpiSheen: "rgba(56,189,248,0.03)",
  popupBg: "#0d1117", popupBorder: "rgba(255,255,255,0.14)",
  yearActiveBg: "rgba(56,189,248,0.12)", yearActiveBorder: "#38bdf8", yearActiveText: "#38bdf8",
  yearBg: "rgba(255,255,255,0.03)", yearBorder: "rgba(255,255,255,0.08)", yearText: "#64748b",
  sectionBg: "rgba(56,189,248,0.04)", sectionBorder: "rgba(56,189,248,0.15)",
};

export const LIGHT = {
  pageBg: "#f1f5f9", cardBg: "#ffffff", inputBg: "#f8fafc", hoverBg: "#e2e8f0",
  border: "rgba(0,0,0,0.08)", borderHover: "rgba(0,0,0,0.16)", borderAccent: "#0284c7",
  textStrong: "#0f172a", textBase: "#1e293b", textMuted: "#64748b", textFaint: "#94a3b8",
  accent: "#0284c7", accentFg: "#ffffff", gridLine: "rgba(0,0,0,0.06)",
  tooltipBg: "#ffffff", shadow: "rgba(0,0,0,0.08)", mapBg: "#dde8f0",
  miniTrack: "rgba(0,0,0,0.08)", trackBg: "rgba(0,0,0,0.03)",
  trackBorder: "rgba(0,0,0,0.06)", kpiSheen: "rgba(2,132,199,0.03)",
  popupBg: "#ffffff", popupBorder: "rgba(0,0,0,0.16)",
  yearActiveBg: "rgba(2,132,199,0.10)", yearActiveBorder: "#0284c7", yearActiveText: "#0284c7",
  yearBg: "rgba(0,0,0,0.03)", yearBorder: "rgba(0,0,0,0.08)", yearText: "#64748b",
  sectionBg: "rgba(2,132,199,0.04)", sectionBorder: "rgba(2,132,199,0.15)",
};

// Export the type separately
export type T = typeof DARK;