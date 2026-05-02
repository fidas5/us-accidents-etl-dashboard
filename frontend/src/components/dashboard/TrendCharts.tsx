// src/pages/components/TrendCharts.tsx
import React from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type  { MonthRow, YearRow } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";

const Card: React.FC<{ title: string; children: React.ReactNode; t: T }> = ({ title, children, t }) => (
  <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>{title}</span>
    </div>
    {children}
  </div>
);

interface TrendChartsProps {
  monthData: MonthRow[];
  yearData: YearRow[];
  t: T;
}

export const TrendCharts: React.FC<TrendChartsProps> = ({ monthData, yearData, t }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
    <Card title="Monthly trend" t={t}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={monthData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={t.gridLine} />
          <XAxis dataKey="month_short" tick={{ fontSize: 10, fill: t.textMuted, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: t.textMuted, fontFamily: "monospace" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.borderHover}`, borderRadius: 8, fontSize: 12, fontFamily: "monospace", color: t.textBase }} labelStyle={{ color: t.textMuted }} itemStyle={{ color: "#38bdf8" }} />
          <Line type="monotone" dataKey="count" stroke="url(#lineGrad)" strokeWidth={2.5} dot={{ r: 3, fill: "#38bdf8", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#818cf8", strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>

    <Card title="Year-over-year" t={t}>
      {yearData.length < 2 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, fontSize: 12, color: t.textMuted }}>
          Need ≥ 2 years of data for YoY comparison
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={yearData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.gridLine} />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: t.textMuted, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: t.textMuted, fontFamily: "monospace" }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.borderHover}`, borderRadius: 8, fontSize: 12, fontFamily: "monospace", color: t.textBase }} labelStyle={{ color: t.textMuted }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#38bdf8" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  </div>
);