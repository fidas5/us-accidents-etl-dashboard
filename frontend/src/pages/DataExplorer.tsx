// src/pages/DataExplorerPage.tsx
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

interface Accident {
  id: number;
  accident_id: string;
  city: string;
  state: string;
  severity: number;
  start_time: string;
  temperature: number | null;
  visibility: number | null;
  weather_condition: string | null;
}

interface PaginatedResponse {
  data: Accident[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

const SEV_COLORS: Record<number, { bg: string; color: string }> = {
  1: { bg: "rgba(59,130,246,0.15)",  color: "#93c5fd" },
  2: { bg: "rgba(234,179,8,0.15)",   color: "#fde047" },
  3: { bg: "rgba(249,115,22,0.15)",  color: "#fdba74" },
  4: { bg: "rgba(239,68,68,0.15)",   color: "#fca5a5" },
};

const PAGE_SIZE = 10;

export default function DataExplorerPage() {
  const { token } = useAuth();
  const [data, setData]             = useState<Accident[]>([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [search, setSearch]     = useState("");
  const [severity, setSeverity] = useState("");
  const [state, setState]       = useState("");
  const [year, setYear]         = useState("");

  const fetchData = useCallback(async (p: number) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { page: p, per_page: PAGE_SIZE };
      if (search)   params.city     = search;
      if (severity) params.severity = severity;
      if (state)    params.state    = state;
      if (year)     params.year     = year;

      const res = await axios.get<PaginatedResponse>(
        "http://127.0.0.1:5050/api/accidents",
        { headers: { Authorization: `Bearer ${token}` }, params }
      );
      setData(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
    } catch (e: any) {
      setError(e.response?.data?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token, search, severity, state, year]);

  useEffect(() => { setPage(1); fetchData(1); }, [search, severity, state, year]);
  useEffect(() => { fetchData(page); }, [page]);

  const handleExport = () => {
    if (!data.length) return;
    const headers = ["ID","City","State","Severity","Start Time","Temp(F)","Visibility","Weather"];
    const rows = data.map(r => [
      r.accident_id, r.city, r.state, r.severity,
      r.start_time, r.temperature ?? "", r.visibility ?? "", r.weather_condition ?? ""
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "accidents_export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const pageWindow = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <>
      <style>{`
        .de-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
        }
        .de-title { font-size: 22px; font-weight: 500; color: var(--text-main); margin: 0 0 4px; }
        .de-sub   { font-size: 12px; color: var(--text-muted); font-family: var(--mono); }

        .de-controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

        .de-input, .de-select {
          height: 32px; padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface2);
          color: var(--text-main);
          font-size: 13px;
          font-family: inherit;
        }
        .de-input { width: 160px; }
        .de-input::placeholder { color: var(--text-muted); }
        .de-input:focus, .de-select:focus {
          outline: none;
          border-color: var(--primary-color);
        }
        .de-select option {
          background: var(--bg-surface-alt);
          color: var(--text-main);
        }

        .de-btn {
          height: 32px; padding: 0 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: transparent;
          color: var(--text-muted);
          font-size: 13px; cursor: pointer;
          transition: all 0.15s;
        }
        .de-btn:hover { background: var(--surface2); color: var(--text-main); }
        .de-btn.primary { background: var(--primary-color); color: white; border-color: var(--primary-color); }
        .de-btn.primary:hover { background: #1d4ed8; }
        .de-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .de-kpis {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 10px; margin-bottom: 20px;
        }
        .de-kpi {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px; padding: 12px 16px;
        }
        .de-kpi-label {
          font-size: 11px; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;
        }
        .de-kpi-value { font-size: 20px; font-weight: 500; color: var(--text-main); }

        .de-table-wrap {
          border: 1px solid var(--border);
          border-radius: 12px; overflow: hidden;
        }
        .de-table { width: 100%; border-collapse: collapse; font-size: 13px; }

        .de-table thead th {
          background: var(--surface2);
          padding: 10px 14px; text-align: left;
          font-weight: 500; color: var(--text-muted);
          font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border); white-space: nowrap;
        }
        .de-table tbody tr {
          border-bottom: 1px solid var(--border);
          transition: background 0.1s;
          background: var(--surface);
        }
        .de-table tbody tr:last-child { border-bottom: none; }
        .de-table tbody tr:hover { background: var(--primary-color-soft); }
        .de-table tbody td { padding: 9px 14px; color: var(--text-main); }

        .de-mono { font-family: var(--mono); font-size: 11px; color: var(--text-muted); }

        .de-sev {
          display: inline-block; padding: 2px 8px;
          border-radius: 99px; font-size: 11px; font-weight: 500;
        }

        .de-pagination {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px;
          background: var(--surface2);
          border-top: 1px solid var(--border);
          font-size: 13px; color: var(--text-muted);
        }
        .de-page-btns { display: flex; gap: 4px; }
        .de-page-btn {
          height: 28px; min-width: 28px; padding: 0 8px;
          border: 1px solid var(--border); border-radius: 6px;
          background: transparent; color: var(--text-muted);
          font-size: 12px; cursor: pointer; transition: all 0.1s;
        }
        .de-page-btn:hover:not(:disabled) { background: var(--primary-color-soft); color: #93c5fd; }
        .de-page-btn.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }
        .de-page-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .de-loading {
          text-align: center; padding: 48px;
          color: var(--text-muted); font-size: 13px; font-family: var(--mono);
          background: var(--surface);
        }
        .de-error {
          text-align: center; padding: 48px; color: #f87171; font-size: 13px;
          background: var(--surface);
        }

        @media (max-width: 768px) {
          .de-header   { flex-direction: column; }
          .de-kpis     { grid-template-columns: 1fr 1fr; }
          .de-controls { width: 100%; }
          .de-input    { flex: 1; width: auto; }
        }
      `}</style>

      <div className="de-header">
        <div>
          <h1 className="de-title">Data Explorer</h1>
          <div className="de-sub">accidents_clean · {total.toLocaleString()} records</div>
        </div>
        <div className="de-controls">
          <input
            className="de-input"
            placeholder="Search city..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="de-select" value={severity} onChange={e => setSeverity(e.target.value)}>
            <option value="">All severities</option>
            {[1,2,3,4].map(s => <option key={s} value={s}>Severity {s}</option>)}
          </select>
          <select className="de-select" value={state} onChange={e => setState(e.target.value)}>
            <option value="">All states</option>
            {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="de-select" value={year} onChange={e => setYear(e.target.value)}>
            <option value="">All years</option>
            {[2021,2022,2023].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="de-btn primary" onClick={handleExport} disabled={!data.length}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="de-kpis">
        <div className="de-kpi">
          <div className="de-kpi-label">Filtered rows</div>
          <div className="de-kpi-value">{total.toLocaleString()}</div>
        </div>
        <div className="de-kpi">
          <div className="de-kpi-label">Current page</div>
          <div className="de-kpi-value">{page} / {totalPages || 1}</div>
        </div>
        <div className="de-kpi">
          <div className="de-kpi-label">Per page</div>
          <div className="de-kpi-value">{PAGE_SIZE}</div>
        </div>
      </div>

      <div className="de-table-wrap">
        {loading ? (
          <div className="de-loading">Loading…</div>
        ) : error ? (
          <div className="de-error">{error}</div>
        ) : (
          <table className="de-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Accident ID</th>
                <th>City</th>
                <th>State</th>
                <th>Severity</th>
                <th>Start Time</th>
                <th>Temp (°F)</th>
                <th>Visibility</th>
                <th>Weather</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const sev = SEV_COLORS[row.severity] ?? { bg: "var(--surface2)", color: "var(--text-muted)" };
                return (
                  <tr key={row.id}>
                    <td className="de-mono">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="de-mono">{row.accident_id}</td>
                    <td>{row.city ?? "—"}</td>
                    <td>{row.state ?? "—"}</td>
                    <td>
                      <span className="de-sev" style={{ background: sev.bg, color: sev.color }}>
                        {row.severity}
                      </span>
                    </td>
                    <td className="de-mono">{row.start_time?.slice(0, 16).replace("T", " ")}</td>
                    <td>{row.temperature != null ? row.temperature.toFixed(1) : "—"}</td>
                    <td>{row.visibility != null ? row.visibility.toFixed(1) : "—"}</td>
                    <td>{row.weather_condition ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="de-pagination">
          <span>Rows {Math.min((page-1)*PAGE_SIZE+1, total)}–{Math.min(page*PAGE_SIZE, total)} of {total.toLocaleString()}</span>
          <div className="de-page-btns">
            <button className="de-page-btn" onClick={() => setPage(p => p-1)} disabled={page === 1}>←</button>
            {pageWindow().map((p, i) =>
              p === "..." ? (
                <span key={`dots-${i}`} style={{ padding: "0 4px", color: "var(--text-muted)", lineHeight: "28px" }}>…</span>
              ) : (
                <button key={p} className={`de-page-btn ${page === p ? "active" : ""}`} onClick={() => setPage(p as number)}>{p}</button>
              )
            )}
            <button className="de-page-btn" onClick={() => setPage(p => p+1)} disabled={page === totalPages}>→</button>
          </div>
        </div>
      </div>
    </>
  );
}